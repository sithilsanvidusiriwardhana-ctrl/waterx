"""Tests for the WaterX simulation engine and its safety behavior."""

import random
import tempfile
import unittest
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

from database.seed import seed_database
from database.waterx_db import get_connection
from simulator import SimulationConfig, run_simulation
from simulator.models import SensorReading


class FaultingSensor:
    def read(self, _true_moisture: float, _rng: random.Random) -> SensorReading:
        return SensorReading(None, True)


class WaterXSimulatorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.db_path = Path(self.temp_dir.name) / "waterx-test.db"
        seed_database(self.db_path)
        self.start_time = datetime(2026, 10, 1, tzinfo=timezone.utc)

    def test_all_strategies_save_hourly_simulation_data(self) -> None:
        for strategy in ("fixed_schedule", "rule_based", "ai_assisted"):
            with self.subTest(strategy=strategy):
                result = run_simulation(
                    SimulationConfig(
                        start_time=self.start_time,
                        hours=24,
                        strategy=strategy,
                        random_seed=7,
                        sensor_fault_probability=0,
                    ),
                    self.db_path,
                )

                self.assertEqual(result.hours_simulated, 24)
                self.assertEqual(result.plants_simulated, 3)
                with closing(get_connection(self.db_path)) as connection:
                    self.assertEqual(
                        connection.execute(
                            "SELECT COUNT(*) FROM weather WHERE run_id = ?",
                            (result.run_id,),
                        ).fetchone()[0],
                        24,
                    )
                    self.assertEqual(
                        connection.execute(
                            "SELECT COUNT(*) FROM sensor_readings WHERE run_id = ?",
                            (result.run_id,),
                        ).fetchone()[0],
                        72,
                    )
                    self.assertEqual(
                        connection.execute(
                            "SELECT COUNT(*) FROM tank_levels WHERE run_id = ?",
                            (result.run_id,),
                        ).fetchone()[0],
                        25,
                    )
                    self.assertEqual(
                        connection.execute(
                            "PRAGMA foreign_key_check"
                        ).fetchall(),
                        [],
                    )
                    if strategy == "ai_assisted":
                        self.assertGreater(
                            connection.execute(
                                "SELECT COUNT(*) FROM predictions WHERE run_id = ?",
                                (result.run_id,),
                            ).fetchone()[0],
                            0,
                        )
                        self.assertGreater(
                            connection.execute(
                                """
                                SELECT COUNT(*) FROM predictions
                                WHERE run_id = ? AND actual_moisture IS NOT NULL
                                """,
                                (result.run_id,),
                            ).fetchone()[0],
                            0,
                        )

    def test_sensor_fault_blocks_all_watering(self) -> None:
        result = run_simulation(
            SimulationConfig(
                start_time=self.start_time,
                hours=3,
                strategy="rule_based",
                sensor_fault_probability=0,
            ),
            self.db_path,
            sensor_source=FaultingSensor(),
        )

        with closing(get_connection(self.db_path)) as connection:
            self.assertEqual(
                connection.execute(
                    "SELECT COUNT(*) FROM watering_events WHERE run_id = ?",
                    (result.run_id,),
                ).fetchone()[0],
                0,
            )
            self.assertEqual(
                connection.execute(
                    """
                    SELECT COUNT(*) FROM alerts
                    WHERE run_id = ? AND type = 'sensor_fault'
                    """,
                    (result.run_id,),
                ).fetchone()[0],
                3,
            )

    def test_empty_tank_blocks_watering(self) -> None:
        with closing(get_connection(self.db_path)) as connection, connection:
            connection.execute(
                "UPDATE plant_profiles SET schedule_time = '08:00'"
            )

        result = run_simulation(
            SimulationConfig(
                start_time=self.start_time,
                hours=8,
                strategy="fixed_schedule",
                initial_tank_ml=0,
                sensor_fault_probability=0,
            ),
            self.db_path,
        )

        with closing(get_connection(self.db_path)) as connection:
            self.assertEqual(
                connection.execute(
                    "SELECT COUNT(*) FROM watering_events WHERE run_id = ?",
                    (result.run_id,),
                ).fetchone()[0],
                0,
            )
            self.assertGreater(
                connection.execute(
                    """
                    SELECT COUNT(*) FROM alerts
                    WHERE run_id = ? AND type = 'low_tank'
                    """,
                    (result.run_id,),
                ).fetchone()[0],
                0,
            )

    def test_maximum_pump_time_caps_water_volume(self) -> None:
        with closing(get_connection(self.db_path)) as connection, connection:
            connection.execute(
                """
                UPDATE plant_profiles
                SET schedule_time = '07:30', max_pump_seconds = 1
                """
            )

        result = run_simulation(
            SimulationConfig(
                start_time=self.start_time,
                hours=8,
                strategy="fixed_schedule",
                sensor_fault_probability=0,
            ),
            self.db_path,
        )

        with closing(get_connection(self.db_path)) as connection:
            events = connection.execute(
                """
                SELECT timestamp, amount_ml, duration_s FROM watering_events
                WHERE run_id = ?
                """,
                (result.run_id,),
            ).fetchall()
        self.assertGreater(len(events), 0)
        for event in events:
            self.assertTrue(event["timestamp"].endswith("T08:00:00Z"))
            self.assertLessEqual(event["duration_s"], 1)
            self.assertLessEqual(event["amount_ml"], 20)

    def test_daily_cycle_limit_is_enforced(self) -> None:
        with closing(get_connection(self.db_path)) as connection, connection:
            connection.execute(
                """
                UPDATE plant_profiles
                SET min_moisture = 99, max_moisture = 100,
                    optimal_moisture = 99.5, max_cycles_per_day = 1
                """
            )

        result = run_simulation(
            SimulationConfig(
                start_time=self.start_time,
                hours=48,
                strategy="rule_based",
                sensor_noise_stddev=0,
                sensor_fault_probability=0,
            ),
            self.db_path,
        )

        with closing(get_connection(self.db_path)) as connection:
            counts = connection.execute(
                """
                SELECT plant_id, substr(timestamp, 1, 10) AS day, COUNT(*) AS cycles
                FROM watering_events
                WHERE run_id = ?
                GROUP BY plant_id, day
                """,
                (result.run_id,),
            ).fetchall()
        self.assertTrue(counts)
        for row in counts:
            self.assertLessEqual(row["cycles"], 1)

    def test_same_seed_reproduces_weather_and_sensor_values(self) -> None:
        second_path = Path(self.temp_dir.name) / "waterx-second.db"
        seed_database(second_path)
        config = SimulationConfig(
            start_time=self.start_time,
            hours=24,
            strategy="ai_assisted",
            random_seed=123,
            sensor_fault_probability=0.05,
        )
        first_run = run_simulation(config, self.db_path)
        second_run = run_simulation(config, second_path)

        query = """
            SELECT timestamp, temperature_c, humidity_pct, sunlight, rain_mm
            FROM weather WHERE run_id = ? ORDER BY timestamp
        """
        with closing(get_connection(self.db_path)) as first, closing(
            get_connection(second_path)
        ) as second:
            first_weather = first.execute(query, (first_run.run_id,)).fetchall()
            second_weather = second.execute(query, (second_run.run_id,)).fetchall()
            self.assertEqual(
                [tuple(row) for row in first_weather],
                [tuple(row) for row in second_weather],
            )
            readings_query = """
                SELECT plant_id, timestamp, moisture_pct, true_moisture, is_fault
                FROM sensor_readings WHERE run_id = ?
                ORDER BY plant_id, timestamp
            """
            self.assertEqual(
                [tuple(row) for row in first.execute(readings_query, (first_run.run_id,))],
                [tuple(row) for row in second.execute(readings_query, (second_run.run_id,))],
            )

    def test_rejects_naive_start_time(self) -> None:
        with self.assertRaises(ValueError):
            SimulationConfig(start_time=datetime(2026, 10, 1))

    def test_rejects_invalid_pump_output(self) -> None:
        class InvalidPump:
            def deliver(self, amount_ml: float, duration_s: float) -> float:
                return amount_ml + 1

        with closing(get_connection(self.db_path)) as connection, connection:
            connection.execute(
                "UPDATE plant_profiles SET schedule_time = '08:00'"
            )

        with self.assertRaisesRegex(ValueError, "PumpController.deliver"):
            run_simulation(
                SimulationConfig(
                    start_time=self.start_time,
                    hours=8,
                    strategy="fixed_schedule",
                    sensor_fault_probability=0,
                ),
                self.db_path,
                pump_controller=InvalidPump(),
            )
        with closing(get_connection(self.db_path)) as connection:
            run = connection.execute(
                """
                SELECT run_id FROM simulation_runs
                WHERE notes = 'Hourly software simulation'
                ORDER BY run_id DESC LIMIT 1
                """
            ).fetchone()
            self.assertIsNone(run)


if __name__ == "__main__":
    unittest.main()
