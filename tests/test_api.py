"""HTTP API tests for WaterX plant and simulation-data endpoints."""

import json
import tempfile
import threading
import unittest
from contextlib import closing
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from database.seed import seed_database
from database.waterx_db import get_connection, initialize_database
from waterx_api import create_server


class WaterXApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.database_path = Path(self.temp_dir.name) / "waterx-api-test.db"
        initialize_database(self.database_path)
        self._start_server()

    def tearDown(self) -> None:
        self._stop_server()

    def _start_server(self) -> None:
        self.server = create_server(("127.0.0.1", 0), self.database_path)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_port}"

    def _stop_server(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def _request(
        self,
        method: str,
        path: str,
        payload: dict[str, object] | None = None,
    ) -> tuple[int, dict[str, object], dict[str, str]]:
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = Request(
            f"{self.base_url}{path}",
            data=body,
            method=method,
            headers={
                "Content-Type": "application/json",
                "Origin": "http://localhost:3000",
            },
        )
        try:
            response = urlopen(request, timeout=3)
        except HTTPError as error:
            response = error
        with response:
            content = response.read()
            return (
                response.status,
                json.loads(content) if content else {},
                dict(response.headers.items()),
            )

    @staticmethod
    def _plant_payload() -> dict[str, object]:
        return {
            "name": "Test basil",
            "species": "Ocimum basilicum test",
            "minMoisture": 25,
            "optimalMoisture": 45,
            "maxMoisture": 70,
            "waterVolumeMl": 200,
            "maxCyclesPerDay": 2,
            "maxPumpRuntimeSeconds": 20,
            "wateringSchedule": "08:30",
        }

    def test_health_and_empty_database(self) -> None:
        status, health, headers = self._request("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(health, {"status": "ok"})
        self.assertEqual(headers["Access-Control-Allow-Origin"], "http://localhost:3000")

        status, plants, _ = self._request("GET", "/api/plants")
        self.assertEqual(status, 200)
        self.assertEqual(plants, [])

        status, dashboard, _ = self._request("GET", "/api/dashboard")
        self.assertEqual(status, 200)
        self.assertIsNone(dashboard["tank"])
        self.assertEqual(dashboard["events"], [])
        self.assertEqual(dashboard["alerts"], [])
        self.assertIsNone(dashboard["predictionMae"])

    def test_dashboard_reads_saved_simulation_records(self) -> None:
        seed_database(self.database_path)

        status, plants, _ = self._request("GET", "/api/plants")
        self.assertEqual(status, 200)
        self.assertEqual(len(plants), 3)
        self.assertTrue(all(plant["readingSource"] == "simulation" for plant in plants))

        status, dashboard, _ = self._request("GET", "/api/dashboard")
        self.assertEqual(status, 200)
        self.assertIsNotNone(dashboard["tank"])
        self.assertEqual(len(dashboard["events"]), 3)
        self.assertEqual(len(dashboard["alerts"]), 1)
        self.assertEqual(dashboard["predictionCount"], 3)
        self.assertIsNotNone(dashboard["predictionMae"])
        self.assertTrue(dashboard["soilMoisture"])

    def test_create_read_update_and_persist_after_server_restart(self) -> None:
        status, created, _ = self._request("POST", "/api/plants", self._plant_payload())
        self.assertEqual(status, 201)
        plant_id = created["id"]
        self.assertEqual(created["name"], "Test basil")
        self.assertEqual(created["wateringSchedule"], "08:30")
        self.assertIsNone(created["moisture"])

        status, plant, _ = self._request("GET", f"/api/plants/{plant_id}")
        self.assertEqual(status, 200)
        self.assertEqual(plant["id"], plant_id)

        status, updated, _ = self._request(
            "PATCH",
            f"/api/plants/{plant_id}",
            {"name": "Updated basil", "minMoisture": 30, "optimalMoisture": 50, "maxMoisture": 75},
        )
        self.assertEqual(status, 200)
        self.assertEqual(updated["name"], "Updated basil")
        self.assertEqual(updated["minMoisture"], 30)
        self.assertEqual(updated["optimalMoisture"], 50)

        status, inactive, _ = self._request("PATCH", f"/api/plants/{plant_id}", {"active": False})
        self.assertEqual(status, 200)
        self.assertFalse(inactive["active"])

        status, plants, _ = self._request("GET", "/api/plants")
        self.assertEqual(status, 200)
        self.assertEqual(len(plants), 1)

        self._stop_server()
        self._start_server()
        status, persisted, _ = self._request("GET", f"/api/plants/{plant_id}")
        self.assertEqual(status, 200)
        self.assertEqual(persisted["name"], "Updated basil")
        self.assertFalse(persisted["active"])

    def test_rejects_invalid_fields_ids_and_profile_conflicts(self) -> None:
        payload = self._plant_payload()
        payload["minMoisture"] = 80
        status, error, _ = self._request("POST", "/api/plants", payload)
        self.assertEqual(status, 400)
        self.assertIn("ordered", error["error"])

        payload = self._plant_payload()
        payload["wateringSchedule"] = "Every day at 8 AM"
        status, error, _ = self._request("POST", "/api/plants", payload)
        self.assertEqual(status, 400)
        self.assertIn("HH:MM", error["error"])

        status, error, _ = self._request("GET", "/api/plants/not-an-id")
        self.assertEqual(status, 400)
        status, error, _ = self._request("GET", "/api/plants/999")
        self.assertEqual(status, 404)

        status, _, _ = self._request("POST", "/api/plants", self._plant_payload())
        self.assertEqual(status, 201)
        conflicting = self._plant_payload()
        conflicting["name"] = "Different config"
        conflicting["minMoisture"] = 30
        status, error, _ = self._request("POST", "/api/plants", conflicting)
        self.assertEqual(status, 409)
        self.assertIn("already exists", error["error"])

    def test_delete_preserves_plant_with_saved_history(self) -> None:
        status, created, _ = self._request("POST", "/api/plants", self._plant_payload())
        self.assertEqual(status, 201)
        plant_id = int(created["id"])

        with closing(get_connection(self.database_path)) as connection, connection:
            cursor = connection.execute(
                """
                INSERT INTO simulation_runs (
                    strategy, random_seed, start_time, end_time, notes
                ) VALUES (?, ?, ?, ?, ?)
                """,
                ("rule_based", 1, "2026-01-01T00:00:00Z", "2026-01-01T01:00:00Z", "test"),
            )
            connection.execute(
                """
                INSERT INTO sensor_readings (run_id, plant_id, timestamp, moisture_pct)
                VALUES (?, ?, ?, ?)
                """,
                (cursor.lastrowid, plant_id, "2026-01-01T00:00:00Z", 40),
            )

        status, error, _ = self._request("DELETE", f"/api/plants/{plant_id}")
        self.assertEqual(status, 409)
        self.assertIn("deactivate", error["error"].lower())

        status, plant, _ = self._request("GET", f"/api/plants/{plant_id}")
        self.assertEqual(status, 200)
        self.assertEqual(plant["name"], "Test basil")

    def test_delete_without_history_removes_plant(self) -> None:
        status, created, _ = self._request("POST", "/api/plants", self._plant_payload())
        self.assertEqual(status, 201)

        status, deleted, _ = self._request("DELETE", f"/api/plants/{created['id']}")
        self.assertEqual(status, 200)
        self.assertTrue(deleted["deleted"])

        status, error, _ = self._request("GET", f"/api/plants/{created['id']}")
        self.assertEqual(status, 404)


if __name__ == "__main__":
    unittest.main()
