"""Local HTTP API for the WaterX SQLite database and simulation records."""

import json
import math
import os
import re
import sqlite3
from contextlib import closing
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable
from urllib.parse import unquote, urlsplit

from database.waterx_db import DATABASE_PATH, get_connection, initialize_database


_MAX_REQUEST_BYTES = 1_048_576
_DEFAULT_ORIGINS = ("http://localhost:3000", "http://127.0.0.1:3000")
_PROFILE_FIELDS = {
    "minMoisture": "min_moisture",
    "optimalMoisture": "optimal_moisture",
    "maxMoisture": "max_moisture",
    "waterVolumeMl": "water_per_cycle_ml",
    "maxCyclesPerDay": "max_cycles_per_day",
    "maxPumpRuntimeSeconds": "max_pump_seconds",
    "wateringSchedule": "schedule_time",
}
_ALLOWED_PLANT_FIELDS = {"name", "species", "active", *_PROFILE_FIELDS}


class ApiError(Exception):
    """An expected API error with an HTTP status code."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status


class WaterXHTTPServer(ThreadingHTTPServer):
    """HTTP server carrying its database and CORS configuration."""

    def __init__(
        self,
        address: tuple[str, int],
        handler: type[BaseHTTPRequestHandler],
        database_path: str | Path,
        allowed_origins: tuple[str, ...],
    ) -> None:
        self.database_path = Path(database_path)
        self.allowed_origins = allowed_origins
        super().__init__(address, handler)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _read_profile(
    connection: sqlite3.Connection,
    payload: dict[str, Any],
    existing: sqlite3.Row | None = None,
) -> int:
    values: dict[str, Any] = {}
    for field, column in _PROFILE_FIELDS.items():
        if field in payload:
            values[column] = payload[field]
        elif existing is not None:
            values[column] = existing[column]
        else:
            raise ApiError(400, f"Missing required field: {field}.")

    for field in ("min_moisture", "optimal_moisture", "max_moisture"):
        value = values[field]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 100:
            raise ApiError(400, f"{field} must be a finite number between 0 and 100.")
    if not values["min_moisture"] < values["optimal_moisture"] < values["max_moisture"]:
        raise ApiError(400, "Moisture thresholds must be ordered: minimum < optimal < maximum.")

    for field in ("water_per_cycle_ml", "max_cycles_per_day", "max_pump_seconds"):
        value = values[field]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
            raise ApiError(400, f"{field} must be a positive finite number.")
        if field in {"max_cycles_per_day", "max_pump_seconds"} and not isinstance(value, int):
            raise ApiError(400, f"{field} must be a whole number.")

    schedule = values["schedule_time"]
    if schedule is None:
        values["schedule_time"] = None
    elif not isinstance(schedule, str):
        raise ApiError(400, "wateringSchedule must be a daily time in HH:MM format or empty.")
    else:
        schedule = schedule.strip()
        if schedule and (
            re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", schedule) is None
        ):
            raise ApiError(400, "wateringSchedule must be a daily time in HH:MM format or empty.")
        values["schedule_time"] = schedule or None

    if existing is not None and "name" not in payload and "species" not in payload:
        profile_name = existing["profile_name"]
    else:
        profile_name = payload.get("species", existing["profile_name"] if existing is not None else None)
    if not isinstance(profile_name, str) or not profile_name.strip() or len(profile_name.strip()) > 80:
        raise ApiError(400, "species must contain between 1 and 80 characters.")
    profile_name = profile_name.strip()

    if existing is not None and profile_name == existing["profile_name"]:
        profile_id = existing["profile_id"]
        if all(existing[column] == value for column, value in values.items()):
            return profile_id
        references = connection.execute(
            "SELECT COUNT(*) AS count FROM plants WHERE profile_id = ?",
            (profile_id,),
        ).fetchone()["count"]
        if references > 1:
            raise ApiError(
                409,
                "This plant profile is shared. Create or select a separate profile before changing its watering settings.",
            )
        connection.execute(
            """
            UPDATE plant_profiles SET
                min_moisture = ?, optimal_moisture = ?, max_moisture = ?,
                water_per_cycle_ml = ?, max_cycles_per_day = ?,
                max_pump_seconds = ?, schedule_time = ?
            WHERE profile_id = ?
            """,
            (
                values["min_moisture"],
                values["optimal_moisture"],
                values["max_moisture"],
                values["water_per_cycle_ml"],
                values["max_cycles_per_day"],
                values["max_pump_seconds"],
                values["schedule_time"],
                profile_id,
            ),
        )
        return profile_id

    profile = connection.execute(
        "SELECT * FROM plant_profiles WHERE name = ?",
        (profile_name,),
    ).fetchone()
    if profile is not None:
        if all(profile[column] == value for column, value in values.items()):
            return profile["profile_id"]
        raise ApiError(
            409,
            "A profile with this species name already exists with different watering settings.",
        )

    cursor = connection.execute(
        """
        INSERT INTO plant_profiles (
            name, min_moisture, max_moisture, optimal_moisture,
            water_per_cycle_ml, max_cycles_per_day, max_pump_seconds,
            schedule_time, uptake_rate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            profile_name,
            values["min_moisture"],
            values["max_moisture"],
            values["optimal_moisture"],
            values["water_per_cycle_ml"],
            values["max_cycles_per_day"],
            values["max_pump_seconds"],
            values["schedule_time"],
            0.5,
        ),
    )
    return cursor.lastrowid


def _plant_response(connection: sqlite3.Connection, plant_id: int) -> dict[str, Any] | None:
    row = connection.execute(
        """
        SELECT p.plant_id, p.name, p.active, p.planted_at, p.profile_id,
               pp.name AS profile_name, pp.min_moisture, pp.max_moisture,
               pp.optimal_moisture, pp.water_per_cycle_ml,
               pp.max_cycles_per_day, pp.max_pump_seconds, pp.schedule_time
        FROM plants AS p
        JOIN plant_profiles AS pp ON pp.profile_id = p.profile_id
        WHERE p.plant_id = ?
        """,
        (plant_id,),
    ).fetchone()
    if row is None:
        return None

    latest = connection.execute(
        """
        SELECT sr.reading_id, sr.run_id, sr.timestamp, sr.moisture_pct,
               sr.is_fault, w.temperature_c, w.humidity_pct
        FROM sensor_readings AS sr
        LEFT JOIN weather AS w
          ON w.run_id = sr.run_id AND w.timestamp = sr.timestamp
        WHERE sr.plant_id = ?
        ORDER BY sr.timestamp DESC, sr.reading_id DESC
        LIMIT 1
        """,
        (plant_id,),
    ).fetchone()
    latest_moisture = (
        latest["moisture_pct"]
        if latest is not None and not latest["is_fault"]
        else None
    )

    history_rows = connection.execute(
        """
        SELECT timestamp, moisture_pct
        FROM sensor_readings
        WHERE plant_id = ? AND is_fault = 0 AND moisture_pct IS NOT NULL
        ORDER BY timestamp DESC, reading_id DESC
        LIMIT 365
        """,
        (plant_id,),
    ).fetchall()
    moisture_history = [
        {"recordedAt": item["timestamp"], "moisture": item["moisture_pct"]}
        for item in reversed(history_rows)
    ]

    watering_rows = connection.execute(
        """
        SELECT e.event_id, e.timestamp, e.amount_ml, e.duration_s, e.trigger,
               e.moisture_before, e.predicted_moisture, r.strategy
        FROM watering_events AS e
        JOIN simulation_runs AS r ON r.run_id = e.run_id
        WHERE e.plant_id = ?
        ORDER BY e.timestamp DESC, e.event_id DESC
        LIMIT 100
        """,
        (plant_id,),
    ).fetchall()
    watering_history = [
        {
            "id": str(item["event_id"]),
            "date": item["timestamp"],
            "volumeMl": item["amount_ml"],
            "durationSeconds": item["duration_s"] or 0,
            "strategy": item["strategy"],
            "reason": item["trigger"].replace("_", " ").title(),
            "outcome": "Completed",
        }
        for item in reversed(watering_rows)
    ]

    growth_rows = connection.execute(
        """
        SELECT timestamp, height_cm, leaf_count, biomass_g, stress_level
        FROM growth_records
        WHERE plant_id = ?
        ORDER BY timestamp DESC, growth_id DESC
        LIMIT 100
        """,
        (plant_id,),
    ).fetchall()
    growth_history = [
        {
            "recordedAt": item["timestamp"],
            **({"heightCm": item["height_cm"]} if item["height_cm"] is not None else {}),
            **({"leafCount": item["leaf_count"]} if item["leaf_count"] is not None else {}),
            **({"biomassGrams": item["biomass_g"]} if item["biomass_g"] is not None else {}),
        }
        for item in reversed(growth_rows)
    ]
    latest_growth = growth_rows[0] if growth_rows else None
    growth = None
    if latest_growth is not None:
        stress = latest_growth["stress_level"]
        growth = {
            **({"heightCm": latest_growth["height_cm"]} if latest_growth["height_cm"] is not None else {}),
            **({"leafCount": latest_growth["leaf_count"]} if latest_growth["leaf_count"] is not None else {}),
            **({"biomassGrams": latest_growth["biomass_g"]} if latest_growth["biomass_g"] is not None else {}),
            **(
                {
                    "stressStatus": (
                        "High stress" if stress >= 0.66
                        else "Moderate stress" if stress >= 0.33
                        else "Low stress"
                    )
                }
                if stress is not None
                else {}
            ),
        }

    prediction_rows = connection.execute(
        """
        SELECT pr.made_at, pr.target_time, pr.predicted_moisture,
               pr.actual_moisture, m.name AS model_name, m.algorithm
        FROM predictions AS pr
        JOIN ml_models AS m ON m.model_id = pr.model_id
        WHERE pr.plant_id = ?
        ORDER BY pr.made_at DESC, pr.prediction_id DESC
        LIMIT 100
        """,
        (plant_id,),
    ).fetchall()
    predictions = [
        {
            "madeAt": item["made_at"],
            "targetTime": item["target_time"],
            "predictedMoisture": item["predicted_moisture"],
            "actualMoisture": item["actual_moisture"],
            "modelName": item["model_name"],
            "algorithm": item["algorithm"],
        }
        for item in reversed(prediction_rows)
    ]

    tank = connection.execute(
        """
        SELECT level_ml, capacity_ml
        FROM tank_levels
        ORDER BY timestamp DESC, tank_log_id DESC
        LIMIT 1
        """
    ).fetchone()
    return {
        "id": str(row["plant_id"]),
        "name": row["name"],
        "category": row["profile_name"],
        "species": row["profile_name"],
        "moisture": latest_moisture,
        "temperature": latest["temperature_c"] if latest is not None else None,
        "humidity": latest["humidity_pct"] if latest is not None else None,
        "tankLevel": (
            round(tank["level_ml"] * 100 / tank["capacity_ml"], 1)
            if tank is not None
            else None
        ),
        "nextWatering": (
            f"Daily at {row['schedule_time']}" if row["schedule_time"] else "Not scheduled"
        ),
        "status": "Inactive" if not row["active"] else "Sensor Error",
        "threshold": row["min_moisture"],
        "image": None,
        "active": bool(row["active"]),
        "readingSource": (
            "unavailable" if latest is None else "simulation"
        ),
        "readingTimestamp": latest["timestamp"] if latest is not None else None,
        "minMoisture": row["min_moisture"],
        "optimalMoisture": row["optimal_moisture"],
        "maxMoisture": row["max_moisture"],
        "waterVolumeMl": row["water_per_cycle_ml"],
        "maxCyclesPerDay": row["max_cycles_per_day"],
        "maxPumpRuntimeSeconds": row["max_pump_seconds"],
        "wateringSchedule": row["schedule_time"] or "",
        "lastWateredAt": watering_rows[0]["timestamp"] if watering_rows else None,
        "moistureHistory": moisture_history,
        "wateringHistory": watering_history,
        "growth": growth,
        "growthHistory": growth_history,
        "predictions": predictions,
        "isDemoData": bool(latest or history_rows or watering_rows or growth_rows or prediction_rows),
    }


def _get_plants(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    plant_ids = connection.execute(
        "SELECT plant_id FROM plants ORDER BY plant_id"
    ).fetchall()
    plants = [_plant_response(connection, item["plant_id"]) for item in plant_ids]
    return [plant for plant in plants if plant is not None]


def _dashboard_response(connection: sqlite3.Connection) -> dict[str, Any]:
    plants = _get_plants(connection)
    latest_tank = connection.execute(
        """
        SELECT level_ml, capacity_ml, timestamp
        FROM tank_levels
        ORDER BY timestamp DESC, tank_log_id DESC
        LIMIT 1
        """
    ).fetchone()
    tank = (
        {
            "levelMl": latest_tank["level_ml"],
            "capacityMl": latest_tank["capacity_ml"],
            "levelPercent": round(latest_tank["level_ml"] * 100 / latest_tank["capacity_ml"], 1),
            "recordedAt": latest_tank["timestamp"],
        }
        if latest_tank is not None
        else None
    )

    latest_run = connection.execute(
        "SELECT run_id, strategy, created_at FROM simulation_runs ORDER BY run_id DESC LIMIT 1"
    ).fetchone()
    cutoff = (_utc_now() - timedelta(days=7)).isoformat(timespec="seconds").replace("+00:00", "Z")
    now = _utc_now().isoformat(timespec="seconds").replace("+00:00", "Z")
    usage = (
        connection.execute(
            """
            SELECT COALESCE(SUM(amount_ml), 0) AS amount
            FROM watering_events
            WHERE run_id = ? AND timestamp >= ? AND timestamp <= ?
            """,
            (latest_run["run_id"], cutoff, now),
        ).fetchone()["amount"]
        if latest_run is not None
        else 0
    )
    soil_moisture: list[dict[str, Any]] = []
    if latest_run is not None:
        grouped = connection.execute(
            """
            WITH daily_readings AS (
                SELECT plant_id, substr(timestamp, 1, 10) AS day,
                       AVG(moisture_pct) AS moisture
                FROM sensor_readings
                WHERE run_id = ? AND is_fault = 0 AND moisture_pct IS NOT NULL
                GROUP BY plant_id, substr(timestamp, 1, 10)
            ),
            recent_days AS (
                SELECT day FROM daily_readings
                GROUP BY day
                ORDER BY day DESC
                LIMIT 7
            )
            SELECT daily_readings.plant_id, daily_readings.day, daily_readings.moisture
            FROM daily_readings
            JOIN recent_days ON recent_days.day = daily_readings.day
            ORDER BY daily_readings.day DESC, daily_readings.plant_id
            """,
            (latest_run["run_id"],),
        ).fetchall()
        rows_by_day: dict[str, dict[str, Any]] = {}
        for row in grouped:
            point = rows_by_day.setdefault(row["day"], {"day": row["day"], "values": {}})
            point["values"][str(row["plant_id"])] = round(row["moisture"], 1)
        soil_moisture = [rows_by_day[day] for day in sorted(rows_by_day)]

    events = connection.execute(
        """
        SELECT e.event_id, e.timestamp, e.amount_ml, e.duration_s, e.trigger,
               p.name AS plant_name, r.strategy
        FROM watering_events AS e
        JOIN plants AS p ON p.plant_id = e.plant_id
        JOIN simulation_runs AS r ON r.run_id = e.run_id
        ORDER BY e.timestamp DESC, e.event_id DESC
        LIMIT 10
        """
    ).fetchall()
    alerts = connection.execute(
        """
        SELECT a.alert_id, a.timestamp, a.type, a.severity, a.message,
               p.name AS plant_name
        FROM alerts AS a
        LEFT JOIN plants AS p ON p.plant_id = a.plant_id
        WHERE a.resolved = 0
        ORDER BY a.timestamp DESC, a.alert_id DESC
        LIMIT 20
        """
    ).fetchall()
    predictions = connection.execute(
        """
        SELECT pr.prediction_id, pr.made_at, pr.target_time,
               pr.predicted_moisture, pr.actual_moisture,
               p.plant_id, p.name AS plant_name, m.name AS model_name, m.algorithm
        FROM predictions AS pr
        JOIN plants AS p ON p.plant_id = pr.plant_id
        JOIN ml_models AS m ON m.model_id = pr.model_id
        ORDER BY pr.made_at DESC, pr.prediction_id DESC
        LIMIT 20
        """
    ).fetchall()
    evaluated = [
        abs(row["predicted_moisture"] - row["actual_moisture"])
        for row in predictions
        if row["actual_moisture"] is not None
    ]
    return {
        "plants": plants,
        "tank": tank,
        "weeklyWaterUsedMl": usage,
        "soilMoisture": soil_moisture,
        "events": [
            {
                "id": str(row["event_id"]),
                "plant": row["plant_name"],
                "result": "Watered",
                "detail": (
                    f"{row['amount_ml']:g} mL · {row['duration_s'] or 0:g} sec · "
                    f"{row['strategy'].replace('_', ' ')}"
                ),
                "time": row["timestamp"],
                "simulated": True,
            }
            for row in events
        ],
        "alerts": [
            {
                "id": str(row["alert_id"]),
                "plant": row["plant_name"],
                "type": row["type"],
                "severity": row["severity"],
                "message": row["message"] or row["type"].replace("_", " ").title(),
                "time": row["timestamp"],
                "simulated": True,
            }
            for row in alerts
        ],
        "predictions": [
            {
                "id": str(row["prediction_id"]),
                "plantId": str(row["plant_id"]),
                "plant": row["plant_name"],
                "madeAt": row["made_at"],
                "targetTime": row["target_time"],
                "predictedMoisture": row["predicted_moisture"],
                "actualMoisture": row["actual_moisture"],
                "modelName": row["model_name"],
                "algorithm": row["algorithm"],
                "simulated": True,
            }
            for row in predictions
        ],
        "predictionMae": sum(evaluated) / len(evaluated) if evaluated else None,
        "predictionCount": len(predictions),
        "latestSimulation": (
            {
                "strategy": latest_run["strategy"],
                "createdAt": latest_run["created_at"],
            }
            if latest_run is not None
            else None
        ),
    }


class WaterXRequestHandler(BaseHTTPRequestHandler):
    """JSON HTTP endpoints backed by the existing WaterX database."""

    server: WaterXHTTPServer

    def _send_json(self, status: int, payload: Any) -> None:
        body = json.dumps(payload, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin")
        if origin in self.server.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, status: int, message: str) -> None:
        self._send_json(status, {"error": message})

    def _read_json(self) -> dict[str, Any]:
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ApiError(400, "Invalid Content-Length header.") from exc
        if size <= 0 or size > _MAX_REQUEST_BYTES:
            raise ApiError(400, "Request body must contain valid JSON under 1 MB.")
        try:
            body = json.loads(self.rfile.read(size))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ApiError(400, "Request body must contain valid JSON.") from exc
        if not isinstance(body, dict):
            raise ApiError(400, "Request body must be a JSON object.")
        unknown = set(body) - _ALLOWED_PLANT_FIELDS
        if unknown:
            raise ApiError(400, f"Unsupported plant field: {sorted(unknown)[0]}.")
        return body

    def _plant_id(self, path: str) -> int:
        value = path.removeprefix("/api/plants/")
        if not value or re.fullmatch(r"[1-9]\d*", value) is None:
            raise ApiError(400, "Plant ID must be a positive integer.")
        return int(value)

    def _execute(self, operation: Callable[[], None]) -> None:
        try:
            operation()
        except ApiError as exc:
            self._send_error(exc.status, str(exc))
        except (sqlite3.IntegrityError, sqlite3.OperationalError) as exc:
            self.log_error("Database request failed: %s", exc)
            self._send_error(409, "The change conflicts with existing database records.")
        except (OSError, sqlite3.Error) as exc:
            self.log_error("Database request failed: %s", exc)
            self._send_error(500, "The database request failed.")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        origin = self.headers.get("Origin")
        if origin in self.server.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self) -> None:
        def operation() -> None:
            path = urlsplit(self.path).path.rstrip("/") or "/"
            if path == "/api/health":
                self._send_json(200, {"status": "ok"})
                return
            with closing(get_connection(self.server.database_path)) as connection:
                if path == "/api/plants":
                    self._send_json(200, _get_plants(connection))
                elif path == "/api/dashboard":
                    self._send_json(200, _dashboard_response(connection))
                elif path.startswith("/api/plants/"):
                    plant = _plant_response(connection, self._plant_id(path))
                    if plant is None:
                        raise ApiError(404, "Plant not found.")
                    self._send_json(200, plant)
                else:
                    raise ApiError(404, "API endpoint not found.")

        self._execute(operation)

    def do_POST(self) -> None:
        def operation() -> None:
            path = urlsplit(self.path).path.rstrip("/")
            if path != "/api/plants":
                raise ApiError(404, "API endpoint not found.")
            payload = self._read_json()
            name = payload.get("name")
            if not isinstance(name, str) or not name.strip() or len(name.strip()) > 60:
                raise ApiError(400, "name must contain between 1 and 60 characters.")
            if "active" in payload and not isinstance(payload["active"], bool):
                raise ApiError(400, "active must be a boolean.")
            initialize_database(self.server.database_path)
            with closing(get_connection(self.server.database_path)) as connection, connection:
                profile_id = _read_profile(connection, payload)
                cursor = connection.execute(
                    """
                    INSERT INTO plants (profile_id, name, planted_at, active)
                    VALUES (?, ?, ?, ?)
                    """,
                    (
                        profile_id,
                        name.strip(),
                        _utc_now().date().isoformat(),
                        int(payload.get("active", True)),
                    ),
                )
                response = _plant_response(connection, cursor.lastrowid)
            self._send_json(201, response)

        self._execute(operation)

    def do_PATCH(self) -> None:
        def operation() -> None:
            path = urlsplit(self.path).path.rstrip("/")
            if not path.startswith("/api/plants/"):
                raise ApiError(404, "API endpoint not found.")
            plant_id = self._plant_id(path)
            payload = self._read_json()
            if not payload:
                raise ApiError(400, "At least one plant field must be provided.")
            if "active" in payload and not isinstance(payload["active"], bool):
                raise ApiError(400, "active must be a boolean.")
            if "name" in payload and (
                not isinstance(payload["name"], str)
                or not payload["name"].strip()
                or len(payload["name"].strip()) > 60
            ):
                raise ApiError(400, "name must contain between 1 and 60 characters.")
            initialize_database(self.server.database_path)
            with closing(get_connection(self.server.database_path)) as connection, connection:
                current = connection.execute(
                    """
                    SELECT p.profile_id, pp.name AS profile_name, pp.min_moisture,
                           pp.max_moisture, pp.optimal_moisture,
                           pp.water_per_cycle_ml, pp.max_cycles_per_day,
                           pp.max_pump_seconds, pp.schedule_time
                    FROM plants AS p
                    JOIN plant_profiles AS pp ON pp.profile_id = p.profile_id
                    WHERE p.plant_id = ?
                    """,
                    (plant_id,),
                ).fetchone()
                if current is None:
                    raise ApiError(404, "Plant not found.")
                if any(field in payload for field in _PROFILE_FIELDS) or "species" in payload:
                    profile_id = _read_profile(connection, payload, current)
                    connection.execute(
                        "UPDATE plants SET profile_id = ? WHERE plant_id = ?",
                        (profile_id, plant_id),
                    )
                if "name" in payload:
                    connection.execute(
                        "UPDATE plants SET name = ? WHERE plant_id = ?",
                        (payload["name"].strip(), plant_id),
                    )
                if "active" in payload:
                    connection.execute(
                        "UPDATE plants SET active = ? WHERE plant_id = ?",
                        (int(payload["active"]), plant_id),
                    )
                response = _plant_response(connection, plant_id)
            self._send_json(200, response)

        self._execute(operation)

    def do_DELETE(self) -> None:
        def operation() -> None:
            path = urlsplit(self.path).path.rstrip("/")
            if not path.startswith("/api/plants/"):
                raise ApiError(404, "API endpoint not found.")
            plant_id = self._plant_id(path)
            initialize_database(self.server.database_path)
            with closing(get_connection(self.server.database_path)) as connection, connection:
                current = connection.execute(
                    "SELECT plant_id FROM plants WHERE plant_id = ?",
                    (plant_id,),
                ).fetchone()
                if current is None:
                    raise ApiError(404, "Plant not found.")
                try:
                    connection.execute("DELETE FROM plants WHERE plant_id = ?", (plant_id,))
                except sqlite3.IntegrityError as exc:
                    raise ApiError(
                        409,
                        "This plant has saved simulation history and cannot be deleted. Deactivate it to retain its records.",
                    ) from exc
            self._send_json(200, {"deleted": True, "id": str(plant_id)})

        self._execute(operation)

    def log_message(self, format: str, *args: Any) -> None:
        super().log_message(format, *args)


def create_server(
    address: tuple[str, int] = ("127.0.0.1", 8000),
    database_path: str | Path = DATABASE_PATH,
    allowed_origins: tuple[str, ...] = _DEFAULT_ORIGINS,
) -> WaterXHTTPServer:
    initialize_database(database_path)
    return WaterXHTTPServer(address, WaterXRequestHandler, database_path, allowed_origins)


def main() -> None:
    host = os.environ.get("WATERX_API_HOST", "127.0.0.1")
    port = int(os.environ.get("WATERX_API_PORT", "8000"))
    database_path = Path(os.environ.get("WATERX_DATABASE_PATH", str(DATABASE_PATH)))
    origins = tuple(
        origin.strip()
        for origin in os.environ.get("WATERX_CORS_ORIGINS", ",".join(_DEFAULT_ORIGINS)).split(",")
        if origin.strip()
    )
    server = create_server((host, port), database_path, origins)
    print(f"WaterX API listening on http://{host}:{port} using {database_path}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping WaterX API.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
