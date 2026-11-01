"""Build labeled, simulation-only training examples from WaterX SQLite data."""

import sqlite3
import math
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path

from database.waterx_db import DATABASE_PATH, get_connection


_TRAINING_EXAMPLE_JOINS = """
    FROM sensor_readings AS current
    JOIN weather
        ON weather.run_id = current.run_id
        AND weather.timestamp = current.timestamp
    JOIN simulation_plant_profiles AS profile
        ON profile.run_id = current.run_id
        AND profile.plant_id = current.plant_id
    JOIN sensor_readings AS target
        ON target.run_id = current.run_id
        AND target.plant_id = current.plant_id
        AND datetime(target.timestamp) = datetime(current.timestamp, ?)
    WHERE current.is_fault = 0
        AND current.moisture_pct IS NOT NULL
        AND weather.temperature_c IS NOT NULL
        AND weather.humidity_pct IS NOT NULL
        AND weather.sunlight IS NOT NULL
        AND weather.rain_mm IS NOT NULL
        AND target.true_moisture IS NOT NULL
"""


@dataclass(frozen=True)
class FeatureVector:
    """Features available at prediction time, in a fixed schema."""

    moisture_pct: float
    temperature_c: float
    humidity_pct: float
    sunlight: float
    rain_mm: float
    uptake_rate: float
    min_moisture: float
    optimal_moisture: float
    max_moisture: float
    water_per_cycle_ml: float
    max_cycles_per_day: int
    max_pump_seconds: int
    watering_schedule_sin: float
    watering_schedule_cos: float
    has_watering_schedule: float


@dataclass(frozen=True)
class PlantTrainingCoverage:
    """Training-example coverage for one configured plant."""

    plant_id: int
    plant_name: str
    species: str
    example_count: int


@dataclass(frozen=True)
class TrainingExample:
    """One valid feature row and its future simulated moisture label."""

    run_id: int
    plant_id: int
    species: str
    timestamp: str
    horizon_hours: int
    features: FeatureVector
    target_moisture: float


def count_training_examples(
    db_path: str | Path = DATABASE_PATH,
    *,
    horizon_hours: int = 6,
) -> int:
    """Count complete simulation-derived examples available at a horizon."""
    with closing(get_connection(db_path)) as connection:
        return count_training_examples_in_connection(connection, horizon_hours=horizon_hours)


def count_training_examples_in_connection(
    connection: sqlite3.Connection,
    *,
    horizon_hours: int = 6,
) -> int:
    """Count complete training examples using an existing WaterX connection."""
    _validate_horizon(horizon_hours)
    row = connection.execute(
        f"""
            SELECT COUNT(*) AS example_count
            {_TRAINING_EXAMPLE_JOINS}
        """,
        (f"+{horizon_hours} hours",),
    ).fetchone()
    return row["example_count"]


def get_training_coverage_in_connection(
    connection: sqlite3.Connection,
    *,
    horizon_hours: int = 6,
) -> list[PlantTrainingCoverage]:
    """Return each plant's contribution to complete examples for a horizon."""
    _validate_horizon(horizon_hours)
    rows = connection.execute(
        f"""
        WITH example_counts AS (
            SELECT current.plant_id, COUNT(*) AS example_count
            {_TRAINING_EXAMPLE_JOINS}
            GROUP BY current.plant_id
        )
        SELECT
            plant.plant_id,
            plant.name AS plant_name,
            COALESCE(
                (
                    SELECT snapshot.profile_name
                    FROM simulation_plant_profiles AS snapshot
                    WHERE snapshot.plant_id = plant.plant_id
                    ORDER BY snapshot.run_id DESC
                    LIMIT 1
                ),
                plant_profile.name
            ) AS species,
            COALESCE(example_counts.example_count, 0) AS example_count
        FROM plants AS plant
        JOIN plant_profiles AS plant_profile ON plant_profile.profile_id = plant.profile_id
        LEFT JOIN example_counts ON example_counts.plant_id = plant.plant_id
        ORDER BY plant.name, plant.plant_id
        """,
        (f"+{horizon_hours} hours",),
    ).fetchall()
    return [
        PlantTrainingCoverage(
            plant_id=row["plant_id"],
            plant_name=row["plant_name"],
            species=row["species"],
            example_count=row["example_count"],
        )
        for row in rows
    ]


def load_training_examples(
    db_path: str | Path = DATABASE_PATH,
    *,
    horizon_hours: int = 6,
) -> list[TrainingExample]:
    """Load complete, fault-free feature/label pairs from simulation records.

    Labels come from the simulator's future ``true_moisture`` reading. They are
    useful for developing the pipeline, but are not measurements from hardware.
    """
    _validate_horizon(horizon_hours)

    with closing(get_connection(db_path)) as connection:
        rows = connection.execute(
            f"""
            SELECT
                current.run_id,
                current.plant_id,
                profile.profile_name AS species,
                current.timestamp,
                current.moisture_pct,
                weather.temperature_c,
                weather.humidity_pct,
                weather.sunlight,
                weather.rain_mm,
                profile.uptake_rate,
                profile.min_moisture,
                profile.optimal_moisture,
                profile.max_moisture,
                profile.water_per_cycle_ml,
                profile.max_cycles_per_day,
                profile.max_pump_seconds,
                profile.schedule_time,
                target.true_moisture AS target_moisture
            {_TRAINING_EXAMPLE_JOINS}
            ORDER BY current.timestamp, current.run_id, current.plant_id
            """,
            (f"+{horizon_hours} hours",),
        ).fetchall()

    return [
        TrainingExample(
            run_id=row["run_id"],
            plant_id=row["plant_id"],
            species=row["species"],
            timestamp=row["timestamp"],
            horizon_hours=horizon_hours,
            features=FeatureVector(
                moisture_pct=row["moisture_pct"],
                temperature_c=row["temperature_c"],
                humidity_pct=row["humidity_pct"],
                sunlight=row["sunlight"],
                rain_mm=row["rain_mm"],
                uptake_rate=row["uptake_rate"],
                min_moisture=row["min_moisture"],
                optimal_moisture=row["optimal_moisture"],
                max_moisture=row["max_moisture"],
                water_per_cycle_ml=row["water_per_cycle_ml"],
                max_cycles_per_day=row["max_cycles_per_day"],
                max_pump_seconds=row["max_pump_seconds"],
                watering_schedule_sin=_schedule_component(row["schedule_time"], sin=True),
                watering_schedule_cos=_schedule_component(row["schedule_time"], sin=False),
                has_watering_schedule=float(row["schedule_time"] is not None),
            ),
            target_moisture=row["target_moisture"],
        )
        for row in rows
    ]


def _validate_horizon(horizon_hours: int) -> None:
    if isinstance(horizon_hours, bool) or not isinstance(horizon_hours, int) or horizon_hours <= 0:
        raise ValueError("horizon_hours must be a positive whole number")


def _schedule_component(schedule_time: str | None, *, sin: bool) -> float:
    if schedule_time is None:
        return 0.0
    hour, minute = (int(value) for value in schedule_time.split(":"))
    angle = 2 * math.pi * (hour * 60 + minute) / (24 * 60)
    return math.sin(angle) if sin else math.cos(angle)
