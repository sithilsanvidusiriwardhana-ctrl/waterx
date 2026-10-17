"""Hourly WaterX environment simulation and irrigation decision engine."""

import math
import random
import sqlite3
from collections import defaultdict
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from database.waterx_db import DATABASE_PATH, get_connection, initialize_database

from .components import PumpController, SensorSource, SimulatedPumpController, SimulatedSensorSource
from .models import SimulationConfig, SimulationResult, Strategy, Weather


_PUMP_FLOW_ML_PER_SECOND = 20.0
_LOW_TANK_FRACTION = 0.1
_GROWTH_INTERVAL_HOURS = 24


def _make_weather(timestamp: datetime, rng: random.Random) -> Weather:
    """Generate reproducible hourly weather with a seasonal temperature trend."""
    hour_angle = 2.0 * math.pi * (timestamp.hour - 8) / 24.0
    year_angle = 2.0 * math.pi * (timestamp.timetuple().tm_yday - 172) / 365.0
    temperature = (
        20.0
        + 5.0 * math.sin(hour_angle)
        + 5.0 * math.cos(year_angle)
        + rng.gauss(0.0, 1.5)
    )
    humidity = min(
        100.0,
        max(15.0, 68.0 - 0.8 * (temperature - 20.0) + rng.gauss(0.0, 6.0)),
    )
    daylight = max(0.0, math.sin(math.pi * (timestamp.hour - 6) / 12.0))
    sunlight = min(1.0, max(0.0, daylight * rng.uniform(0.55, 1.0)))
    rain = rng.uniform(0.2, 4.0) if rng.random() < 0.04 else 0.0
    return Weather(temperature, humidity, sunlight, rain)


def _moisture_loss_per_hour(profile: sqlite3.Row, weather: Weather) -> float:
    """Estimate hourly evaporation and plant uptake in moisture percentage points."""
    evaporation = (
        max(0.0, weather.temperature_c - 15.0) * 0.015
        + weather.sunlight * 0.12
        + max(0.0, 65.0 - weather.humidity_pct) * 0.001
    )
    uptake = max(0.0, profile["uptake_rate"]) * 0.02
    return evaporation + uptake


def _stress_level(moisture: float, profile: sqlite3.Row) -> float:
    if moisture < profile["min_moisture"]:
        denominator = max(profile["min_moisture"], 1.0)
        return min(1.0, (profile["min_moisture"] - moisture) / denominator)
    if moisture > profile["max_moisture"]:
        denominator = max(100.0 - profile["max_moisture"], 1.0)
        return min(1.0, (moisture - profile["max_moisture"]) / denominator)
    return 0.0


def _insert_alert(
    connection: sqlite3.Connection,
    run_id: int,
    plant_id: int | None,
    timestamp: str,
    alert_type: str,
    severity: str,
    message: str,
) -> None:
    connection.execute(
        """
        INSERT INTO alerts (run_id, plant_id, timestamp, type, severity, message)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (run_id, plant_id, timestamp, alert_type, severity, message),
    )


def _get_or_create_forecast_model(
    connection: sqlite3.Connection,
    horizon_hours: int,
) -> int:
    name = f"WaterX physics-based moisture forecast ({horizon_hours}h)"
    row = connection.execute(
        "SELECT model_id FROM ml_models WHERE name = ? ORDER BY model_id LIMIT 1",
        (name,),
    ).fetchone()
    if row is not None:
        return row["model_id"]

    cursor = connection.execute(
        """
        INSERT INTO ml_models (name, algorithm, horizon_hours, features)
        VALUES (?, ?, ?, ?)
        """,
        (
            name,
            "Physics-based heuristic",
            horizon_hours,
            "current_moisture,temperature_c,humidity_pct,sunlight,rain_mm,uptake_rate",
        ),
    )
    return cursor.lastrowid


def run_simulation(
    config: SimulationConfig,
    db_path: str | Path = DATABASE_PATH,
    *,
    sensor_source: SensorSource | None = None,
    pump_controller: PumpController | None = None,
) -> SimulationResult:
    """Run the configured simulation and store its time-series in SQLite."""
    initialize_database(db_path)
    sensor = sensor_source or SimulatedSensorSource(
        config.sensor_noise_stddev,
        config.sensor_fault_probability,
    )
    pump = pump_controller or SimulatedPumpController()

    weather_rng = random.Random(config.random_seed)
    sensor_rng = random.Random(config.random_seed ^ 0x5EED5EED)
    start_time = config.start_time.astimezone(timezone.utc)
    end_time = start_time + timedelta(hours=config.hours)

    with closing(get_connection(db_path)) as connection, connection:
        plants = connection.execute(
            """
            SELECT
                p.plant_id, p.name, p.profile_id,
                pp.name AS profile_name, pp.min_moisture, pp.max_moisture,
                pp.optimal_moisture, pp.water_per_cycle_ml,
                pp.max_cycles_per_day, pp.max_pump_seconds,
                pp.schedule_time, pp.uptake_rate
            FROM plants AS p
            JOIN plant_profiles AS pp ON pp.profile_id = p.profile_id
            WHERE p.active = 1
            ORDER BY p.plant_id
            """
        ).fetchall()
        if not plants:
            raise ValueError("Cannot simulate: no active plants are configured")

        model_id = (
            _get_or_create_forecast_model(connection, config.forecast_horizon_hours)
            if config.strategy == "ai_assisted"
            else None
        )
        cursor = connection.execute(
            """
            INSERT INTO simulation_runs (
                strategy, random_seed, start_time, end_time, model_id, notes
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                config.strategy,
                config.random_seed,
                start_time.isoformat().replace("+00:00", "Z"),
                end_time.isoformat().replace("+00:00", "Z"),
                model_id,
                "Hourly software simulation",
            ),
        )
        run_id = cursor.lastrowid

        moisture = {plant["plant_id"]: float(plant["optimal_moisture"]) for plant in plants}
        last_valid_sensor = dict(moisture)
        growth = {
            plant["plant_id"]: {"height_cm": 10.0, "leaf_count": 5, "biomass_g": 10.0}
            for plant in plants
        }
        daily_stress: dict[int, list[float]] = defaultdict(list)
        daily_cycles: dict[tuple[int, str], int] = defaultdict(int)
        water_used_ml = 0.0
        tank_level_ml = config.starting_tank_level_ml
        low_tank_alerted = False
        plant_status: dict[int, str] = {}
        sensor_fault_alerted: set[int] = set()
        pump_limit_alerted: set[tuple[int, str]] = set()
        tank_capacity_ml = config.tank_capacity_ml

        connection.execute(
            """
            INSERT INTO tank_levels (run_id, timestamp, level_ml, capacity_ml)
            VALUES (?, ?, ?, ?)
            """,
            (
                run_id,
                start_time.isoformat().replace("+00:00", "Z"),
                tank_level_ml,
                tank_capacity_ml,
            ),
        )

        for hour_index in range(1, config.hours + 1):
            timestamp = start_time + timedelta(hours=hour_index)
            timestamp_text = timestamp.isoformat().replace("+00:00", "Z")
            weather = _make_weather(timestamp, weather_rng)
            connection.execute(
                """
                INSERT INTO weather (
                    run_id, timestamp, temperature_c, humidity_pct, sunlight, rain_mm
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    timestamp_text,
                    weather.temperature_c,
                    weather.humidity_pct,
                    weather.sunlight,
                    weather.rain_mm,
                ),
            )

            for plant in plants:
                plant_id = plant["plant_id"]
                profile = plant
                current_moisture = min(
                    100.0,
                    max(
                        0.0,
                        moisture[plant_id]
                        - _moisture_loss_per_hour(profile, weather)
                        + weather.rain_mm * 0.35,
                    ),
                )
                moisture[plant_id] = current_moisture
                reading = sensor.read(current_moisture, sensor_rng)
                sensor_failed = reading.is_fault or reading.moisture_pct is None
                if not sensor_failed:
                    assert reading.moisture_pct is not None
                    last_valid_sensor[plant_id] = reading.moisture_pct
                connection.execute(
                    """
                    INSERT INTO sensor_readings (
                        run_id, plant_id, timestamp, moisture_pct,
                        true_moisture, is_fault
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        run_id,
                        plant_id,
                        timestamp_text,
                        reading.moisture_pct,
                        current_moisture,
                        int(sensor_failed),
                    ),
                )

                rate = _moisture_loss_per_hour(profile, weather)
                prediction = min(
                    100.0,
                    max(
                        0.0,
                        last_valid_sensor[plant_id] - rate * config.forecast_horizon_hours,
                    ),
                )
                if config.strategy == "ai_assisted":
                    connection.execute(
                        """
                        UPDATE predictions
                        SET actual_moisture = ?
                        WHERE run_id = ? AND plant_id = ? AND target_time = ?
                        """,
                        (current_moisture, run_id, plant_id, timestamp_text),
                    )
                    target_time = timestamp + timedelta(hours=config.forecast_horizon_hours)
                    connection.execute(
                        """
                        INSERT INTO predictions (
                            run_id, model_id, plant_id, made_at, target_time,
                            predicted_moisture, actual_moisture
                        ) VALUES (?, ?, ?, ?, ?, ?, NULL)
                        """,
                        (
                            run_id,
                            model_id,
                            plant_id,
                            timestamp_text,
                            target_time.isoformat().replace("+00:00", "Z"),
                            prediction,
                        ),
                    )

                moisture_before = current_moisture
                would_water, trigger = _should_water(
                    config.strategy,
                    profile,
                    reading.moisture_pct,
                    prediction,
                    timestamp,
                )

                if sensor_failed:
                    if plant_id not in sensor_fault_alerted:
                        _insert_alert(
                            connection,
                            run_id,
                            plant_id,
                            timestamp_text,
                            "sensor_fault",
                            "warning",
                            f"Faulty moisture reading for {plant['name']}; watering was blocked.",
                        )
                        sensor_fault_alerted.add(plant_id)
                    would_water = False
                else:
                    sensor_fault_alerted.discard(plant_id)

                plant_day = timestamp.date().isoformat()
                cycle_key = (plant_id, plant_day)
                if would_water and daily_cycles[cycle_key] >= profile["max_cycles_per_day"]:
                    limit_key = cycle_key
                    if limit_key not in pump_limit_alerted:
                        _insert_alert(
                            connection,
                            run_id,
                            plant_id,
                            timestamp_text,
                            "pump_limit",
                            "warning",
                            f"Daily watering limit reached for {plant['name']}.",
                        )
                        pump_limit_alerted.add(limit_key)
                    would_water = False

                if would_water:
                    if tank_level_ml <= 0:
                        if not low_tank_alerted:
                            _insert_alert(
                                connection,
                                run_id,
                                None,
                                timestamp_text,
                                "low_tank",
                                "critical",
                                "Water tank is empty; watering was blocked.",
                            )
                            low_tank_alerted = True
                    else:
                        desired_amount = float(profile["water_per_cycle_ml"])
                        max_safe_amount = profile["max_pump_seconds"] * _PUMP_FLOW_ML_PER_SECOND
                        safe_amount = min(desired_amount, max_safe_amount, tank_level_ml)
                        duration_s = safe_amount / _PUMP_FLOW_ML_PER_SECOND
                        if safe_amount < desired_amount:
                            _insert_alert(
                                connection,
                                run_id,
                                plant_id,
                                timestamp_text,
                                "pump_limit",
                                "warning",
                                f"Watering amount for {plant['name']} was capped by pump or tank limits.",
                            )
                        delivered = pump.deliver(safe_amount, duration_s)
                        if not math.isfinite(delivered) or not 0 <= delivered <= safe_amount:
                            raise ValueError(
                                "PumpController.deliver() must return a finite amount "
                                "between zero and the requested amount"
                            )
                        if delivered > 0:
                            increase = (
                                delivered
                                / profile["water_per_cycle_ml"]
                                * (profile["max_moisture"] - profile["min_moisture"])
                                * 0.3
                            )
                            moisture[plant_id] = min(100.0, moisture[plant_id] + increase)
                            tank_level_ml = max(0.0, tank_level_ml - delivered)
                            water_used_ml += delivered
                            daily_cycles[cycle_key] += 1
                            connection.execute(
                                """
                                INSERT INTO watering_events (
                                    run_id, plant_id, timestamp, amount_ml, duration_s,
                                    trigger, moisture_before, predicted_moisture
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                """,
                                (
                                    run_id,
                                    plant_id,
                                    timestamp_text,
                                    delivered,
                                    duration_s,
                                    trigger,
                                    moisture_before,
                                    prediction if config.strategy == "ai_assisted" else None,
                                ),
                            )

                stress = _stress_level(moisture[plant_id], profile)
                daily_stress[plant_id].append(stress)
                status = (
                    "too_dry"
                    if moisture[plant_id] < profile["min_moisture"]
                    else "too_wet"
                    if moisture[plant_id] > profile["max_moisture"]
                    else "normal"
                )
                if status != plant_status.get(plant_id, "normal"):
                    if status in {"too_dry", "too_wet"}:
                        _insert_alert(
                            connection,
                            run_id,
                            plant_id,
                            timestamp_text,
                            status,
                            "critical" if stress >= 0.5 else "warning",
                            f"{plant['name']} moisture is {status.removeprefix('too_')}.",
                        )
                    plant_status[plant_id] = status

                if hour_index % _GROWTH_INTERVAL_HOURS == 0 or hour_index == config.hours:
                    average_stress = sum(daily_stress[plant_id]) / len(daily_stress[plant_id])
                    growth_state = growth[plant_id]
                    growth_state["height_cm"] += 0.02 * (1.0 - average_stress)
                    growth_state["biomass_g"] += 0.05 * (1.0 - average_stress)
                    if average_stress < 0.25 and hour_index % (7 * _GROWTH_INTERVAL_HOURS) == 0:
                        growth_state["leaf_count"] += 1
                    connection.execute(
                        """
                        INSERT INTO growth_records (
                            run_id, plant_id, timestamp, height_cm,
                            leaf_count, biomass_g, stress_level
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            run_id,
                            plant_id,
                            timestamp_text,
                            growth_state["height_cm"],
                            growth_state["leaf_count"],
                            growth_state["biomass_g"],
                            average_stress,
                        ),
                    )
                    daily_stress[plant_id].clear()

            if tank_level_ml <= tank_capacity_ml * _LOW_TANK_FRACTION and not low_tank_alerted:
                _insert_alert(
                    connection,
                    run_id,
                    None,
                    timestamp_text,
                    "low_tank",
                    "critical" if tank_level_ml <= 0 else "warning",
                    (
                        "Water tank is empty."
                        if tank_level_ml <= 0
                        else "Water tank level is at or below 10% of capacity."
                    ),
                )
                low_tank_alerted = True
            elif tank_level_ml > tank_capacity_ml * _LOW_TANK_FRACTION:
                low_tank_alerted = False

            connection.execute(
                """
                INSERT INTO tank_levels (run_id, timestamp, level_ml, capacity_ml)
                VALUES (?, ?, ?, ?)
                """,
                (run_id, timestamp_text, tank_level_ml, tank_capacity_ml),
            )

        return SimulationResult(
            run_id=run_id,
            strategy=config.strategy,
            start_time=start_time,
            end_time=end_time,
            plants_simulated=len(plants),
            hours_simulated=config.hours,
            water_used_ml=water_used_ml,
            final_tank_level_ml=tank_level_ml,
        )


def _should_water(
    strategy: Strategy,
    profile: sqlite3.Row,
    sensor_moisture: float | None,
    predicted_moisture: float,
    timestamp: datetime,
) -> tuple[bool, str]:
    if sensor_moisture is None:
        return False, "manual"

    if strategy == "fixed_schedule":
        schedule_time = profile["schedule_time"] or "08:00"
        scheduled = timestamp.replace(
            hour=int(schedule_time[:2]),
            minute=int(schedule_time[3:]),
            second=0,
            microsecond=0,
        )
        previous_hour = timestamp - timedelta(hours=1)
        if previous_hour < scheduled <= timestamp:
            return True, "schedule"
        return False, "schedule"
    if strategy == "rule_based" and sensor_moisture < profile["min_moisture"]:
        return True, "threshold"
    if strategy == "ai_assisted" and predicted_moisture < profile["min_moisture"]:
        return True, "prediction"
    return False, "manual"
