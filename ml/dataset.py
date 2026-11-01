"""Build labeled, simulation-only training examples from WaterX SQLite data."""

import sqlite3
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path

from database.waterx_db import DATABASE_PATH, get_connection


@dataclass(frozen=True)
class FeatureVector:
    """Features available at prediction time, in a fixed schema."""

    moisture_pct: float
    temperature_c: float
    humidity_pct: float
    sunlight: float
    rain_mm: float
    uptake_rate: float


@dataclass(frozen=True)
class TrainingExample:
    """One valid feature row and its future simulated moisture label."""

    run_id: int
    plant_id: int
    timestamp: str
    horizon_hours: int
    features: FeatureVector
    target_moisture: float


def load_training_examples(
    db_path: str | Path = DATABASE_PATH,
    *,
    horizon_hours: int = 6,
) -> list[TrainingExample]:
    """Load complete, fault-free feature/label pairs from simulation records.

    Labels come from the simulator's future ``true_moisture`` reading. They are
    useful for developing the pipeline, but are not measurements from hardware.
    """
    if isinstance(horizon_hours, bool) or not isinstance(horizon_hours, int) or horizon_hours <= 0:
        raise ValueError("horizon_hours must be a positive whole number")

    with closing(get_connection(db_path)) as connection:
        rows = connection.execute(
            """
            SELECT
                current.run_id,
                current.plant_id,
                current.timestamp,
                current.moisture_pct,
                weather.temperature_c,
                weather.humidity_pct,
                weather.sunlight,
                weather.rain_mm,
                profile.uptake_rate,
                target.true_moisture AS target_moisture
            FROM sensor_readings AS current
            JOIN weather
                ON weather.run_id = current.run_id
                AND weather.timestamp = current.timestamp
            JOIN plants AS plant ON plant.plant_id = current.plant_id
            JOIN plant_profiles AS profile ON profile.profile_id = plant.profile_id
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
            ORDER BY current.timestamp, current.run_id, current.plant_id
            """,
            (f"+{horizon_hours} hours",),
        ).fetchall()

    return [
        TrainingExample(
            run_id=row["run_id"],
            plant_id=row["plant_id"],
            timestamp=row["timestamp"],
            horizon_hours=horizon_hours,
            features=FeatureVector(
                moisture_pct=row["moisture_pct"],
                temperature_c=row["temperature_c"],
                humidity_pct=row["humidity_pct"],
                sunlight=row["sunlight"],
                rain_mm=row["rain_mm"],
                uptake_rate=row["uptake_rate"],
            ),
            target_moisture=row["target_moisture"],
        )
        for row in rows
    ]
