"""Tests for WaterX SQLite initialization and demo seed data."""

import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from database.seed import seed_database
from database.waterx_db import get_connection, initialize_database


class WaterXDatabaseTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.db_path = Path(self.temp_dir.name) / "waterx-test.db"

    def test_initialize_database_creates_schema_idempotently(self) -> None:
        initialize_database(self.db_path)
        initialize_database(self.db_path)

        with closing(get_connection(self.db_path)) as connection:
            objects = {
                row["name"]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type IN ('table', 'view')"
                )
            }

        self.assertTrue(
            {
                "plant_profiles",
                "plants",
                "simulation_runs",
                "sensor_readings",
                "watering_events",
                "daily_water_usage",
            }.issubset(objects)
        )

    def test_connection_enables_foreign_keys(self) -> None:
        initialize_database(self.db_path)

        with closing(get_connection(self.db_path)) as connection:
            self.assertEqual(
                connection.execute("PRAGMA foreign_keys").fetchone()[0],
                1,
            )
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    """
                    INSERT INTO plants (profile_id, name, planted_at)
                    VALUES (?, ?, ?)
                    """,
                    (9999, "Invalid plant", "2026-01-01"),
                )

    def test_seed_database_inserts_repeatable_demo_data(self) -> None:
        seed_database(self.db_path)
        seed_database(self.db_path)

        expected_counts = {
            "plant_profiles": 3,
            "plants": 3,
            "ml_models": 1,
            "simulation_runs": 1,
            "weather": 3,
            "sensor_readings": 6,
            "watering_events": 3,
            "tank_levels": 3,
            "growth_records": 3,
            "predictions": 3,
            "alerts": 1,
        }
        with closing(get_connection(self.db_path)) as connection:
            for table, expected_count in expected_counts.items():
                with self.subTest(table=table):
                    count = connection.execute(
                        f"SELECT COUNT(*) FROM {table}"
                    ).fetchone()[0]
                    self.assertEqual(count, expected_count)

            self.assertEqual(
                connection.execute(
                    "SELECT SUM(water_used_ml) FROM daily_water_usage"
                ).fetchone()[0],
                850.0,
            )
            self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])


if __name__ == "__main__":
    unittest.main()
