"""Tests for preparing simulation-only machine-learning training data."""

import tempfile
import unittest
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

from database.seed import seed_database
from database.waterx_db import get_connection
from ml import load_training_examples
from simulator import SimulationConfig, run_simulation


class WaterXDatasetTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.db_path = Path(self.temp_dir.name) / "waterx-ml-test.db"
        seed_database(self.db_path)
        self.run = run_simulation(
            SimulationConfig(
                start_time=datetime(2026, 10, 1, tzinfo=timezone.utc),
                hours=12,
                random_seed=11,
                sensor_fault_probability=0,
            ),
            self.db_path,
        )

    def test_examples_join_current_features_to_future_ground_truth(self) -> None:
        examples = load_training_examples(self.db_path, horizon_hours=2)

        self.assertTrue(examples)
        example = examples[0]
        self.assertEqual(example.run_id, self.run.run_id)
        self.assertEqual(example.horizon_hours, 2)
        self.assertGreaterEqual(example.features.moisture_pct, 0)
        self.assertGreaterEqual(example.features.humidity_pct, 0)
        self.assertLessEqual(example.features.humidity_pct, 100)
        self.assertGreaterEqual(example.target_moisture, 0)
        self.assertLessEqual(example.target_moisture, 100)

        with closing(get_connection(self.db_path)) as connection:
            target = connection.execute(
                """
                SELECT true_moisture FROM sensor_readings
                WHERE run_id = ? AND plant_id = ?
                    AND datetime(timestamp) = datetime(?, '+2 hours')
                """,
                (example.run_id, example.plant_id, example.timestamp),
            ).fetchone()
        self.assertIsNotNone(target)
        self.assertEqual(example.target_moisture, target["true_moisture"])

    def test_faulty_current_reading_is_excluded(self) -> None:
        with closing(get_connection(self.db_path)) as connection, connection:
            connection.execute(
                """
                UPDATE sensor_readings
                SET is_fault = 1
                WHERE run_id = ? AND timestamp = (
                    SELECT MIN(timestamp) FROM sensor_readings WHERE run_id = ?
                )
                """,
                (self.run.run_id, self.run.run_id),
            )

        examples = load_training_examples(self.db_path, horizon_hours=2)
        with closing(get_connection(self.db_path)) as connection:
            faulty = connection.execute(
                """
                SELECT plant_id, timestamp FROM sensor_readings
                WHERE run_id = ? AND is_fault = 1
                """,
                (self.run.run_id,),
            ).fetchall()
        excluded = {(row["plant_id"], row["timestamp"]) for row in faulty}
        self.assertTrue(excluded)
        self.assertFalse(
            any((example.plant_id, example.timestamp) in excluded for example in examples)
        )

    def test_horizon_must_be_a_positive_integer(self) -> None:
        for horizon in (0, -1, True, 1.5):
            with self.subTest(horizon=horizon):
                with self.assertRaises(ValueError):
                    load_training_examples(self.db_path, horizon_hours=horizon)

    def test_missing_future_rows_produce_no_examples(self) -> None:
        self.assertEqual(
            load_training_examples(self.db_path, horizon_hours=1000),
            [],
        )


if __name__ == "__main__":
    unittest.main()
