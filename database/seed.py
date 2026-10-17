"""Insert repeatable demo data into the WaterX SQLite database."""

import argparse
from contextlib import closing
from pathlib import Path

if __package__:
    from .waterx_db import DATABASE_PATH, get_connection, initialize_database
else:
    from waterx_db import DATABASE_PATH, get_connection, initialize_database


SEED_RUN_NOTES = "Demo data created by database/seed.py"


def seed_database(db_path: str | Path = DATABASE_PATH) -> None:
    """Initialize the schema and insert the demo data once."""
    initialize_database(db_path)

    profiles = (
        ("Leafy greens", 30.0, 75.0, 55.0, 250.0, 3, 30, "08:00", 1.2),
        ("Tomato", 35.0, 80.0, 60.0, 500.0, 2, 30, "07:30", 0.9),
        ("Succulent", 10.0, 45.0, 25.0, 100.0, 1, 15, "09:00", 0.3),
    )

    with closing(get_connection(db_path)) as connection, connection:
        profile_ids: dict[str, int] = {}
        for profile in profiles:
            connection.execute(
                """
                INSERT OR IGNORE INTO plant_profiles (
                    name, min_moisture, max_moisture, optimal_moisture,
                    water_per_cycle_ml, max_cycles_per_day, max_pump_seconds,
                    schedule_time, uptake_rate
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                profile,
            )
            row = connection.execute(
                "SELECT profile_id FROM plant_profiles WHERE name = ?",
                (profile[0],),
            ).fetchone()
            if row is None:
                raise RuntimeError(f"Could not create plant profile {profile[0]!r}")
            profile_ids[profile[0]] = row["profile_id"]

        plants = (
            (profile_ids["Leafy greens"], "Lettuce", "Indoor shelf", "2026-09-01"),
            (profile_ids["Tomato"], "Cherry tomato", "Greenhouse A", "2026-08-15"),
            (profile_ids["Succulent"], "Aloe vera", "Office windowsill", "2026-07-20"),
        )
        plant_ids: dict[str, int] = {}
        for profile_id, name, location, planted_at in plants:
            row = connection.execute(
                """
                SELECT plant_id FROM plants
                WHERE profile_id = ? AND name = ? AND location = ?
                ORDER BY plant_id
                LIMIT 1
                """,
                (profile_id, name, location),
            ).fetchone()
            if row is None:
                cursor = connection.execute(
                    """
                    INSERT INTO plants (profile_id, name, location, planted_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (profile_id, name, location, planted_at),
                )
                plant_ids[name] = cursor.lastrowid
            else:
                plant_ids[name] = row["plant_id"]

        model = connection.execute(
            "SELECT model_id FROM ml_models WHERE name = ? ORDER BY model_id LIMIT 1",
            ("WaterX demo moisture forecast",),
        ).fetchone()
        if model is None:
            cursor = connection.execute(
                """
                INSERT INTO ml_models (
                    name, algorithm, horizon_hours, features,
                    train_start, train_end, mae, rmse
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "WaterX demo moisture forecast",
                    "Random Forest",
                    6,
                    "moisture,temperature,humidity,sunlight,rain",
                    "2026-08-01",
                    "2026-09-30",
                    4.2,
                    5.8,
                ),
            )
            model_id = cursor.lastrowid
        else:
            model_id = model["model_id"]

        run = connection.execute(
            "SELECT run_id FROM simulation_runs WHERE notes = ? LIMIT 1",
            (SEED_RUN_NOTES,),
        ).fetchone()
        if run is not None:
            return

        cursor = connection.execute(
            """
            INSERT INTO simulation_runs (
                strategy, random_seed, start_time, end_time, model_id, notes
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                "ai_assisted",
                20261017,
                "2026-10-01T00:00:00Z",
                "2026-10-03T23:59:59Z",
                model_id,
                SEED_RUN_NOTES,
            ),
        )
        run_id = cursor.lastrowid

        for timestamp, temperature, humidity, sunlight, rain in (
            ("2026-10-01T08:00:00Z", 22.0, 62.0, 0.65, 0.0),
            ("2026-10-02T08:00:00Z", 24.0, 55.0, 0.82, 0.0),
            ("2026-10-03T08:00:00Z", 20.0, 70.0, 0.45, 1.5),
        ):
            connection.execute(
                """
                INSERT INTO weather (
                    run_id, timestamp, temperature_c, humidity_pct, sunlight, rain_mm
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (run_id, timestamp, temperature, humidity, sunlight, rain),
            )

        readings = (
            ("Lettuce", "2026-10-01T08:00:00Z", 42.0, 43.0, 0),
            ("Cherry tomato", "2026-10-01T08:00:00Z", 38.0, 39.0, 0),
            ("Aloe vera", "2026-10-01T08:00:00Z", 28.0, 27.0, 0),
            ("Lettuce", "2026-10-02T08:00:00Z", 34.0, 35.0, 0),
            ("Cherry tomato", "2026-10-02T08:00:00Z", 32.0, 33.0, 0),
            ("Aloe vera", "2026-10-02T08:00:00Z", 26.0, 25.0, 0),
        )
        for plant_name, timestamp, moisture, true_moisture, is_fault in readings:
            connection.execute(
                """
                INSERT INTO sensor_readings (
                    run_id, plant_id, timestamp, moisture_pct, true_moisture, is_fault
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    plant_ids[plant_name],
                    timestamp,
                    moisture,
                    true_moisture,
                    is_fault,
                ),
            )

        for plant_name, timestamp, amount, duration, trigger, moisture, predicted in (
            ("Lettuce", "2026-10-02T08:05:00Z", 250.0, 12.5, "threshold", 34.0, 31.0),
            ("Cherry tomato", "2026-10-02T08:10:00Z", 500.0, 25.0, "prediction", 32.0, 29.0),
            ("Aloe vera", "2026-10-02T09:00:00Z", 100.0, 5.0, "schedule", 26.0, 24.0),
        ):
            connection.execute(
                """
                INSERT INTO watering_events (
                    run_id, plant_id, timestamp, amount_ml, duration_s, trigger,
                    moisture_before, predicted_moisture
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    plant_ids[plant_name],
                    timestamp,
                    amount,
                    duration,
                    trigger,
                    moisture,
                    predicted,
                ),
            )

        for timestamp, level in (
            ("2026-10-01T00:00:00Z", 4500.0),
            ("2026-10-02T12:00:00Z", 3650.0),
            ("2026-10-03T23:59:00Z", 3500.0),
        ):
            connection.execute(
                """
                INSERT INTO tank_levels (run_id, timestamp, level_ml, capacity_ml)
                VALUES (?, ?, ?, ?)
                """,
                (run_id, timestamp, level, 5000.0),
            )

        for plant_name, height, leaves, biomass, stress in (
            ("Lettuce", 12.5, 8, 18.0, 0.15),
            ("Cherry tomato", 28.0, 14, 42.0, 0.2),
            ("Aloe vera", 16.0, 6, 35.0, 0.05),
        ):
            connection.execute(
                """
                INSERT INTO growth_records (
                    run_id, plant_id, timestamp, height_cm, leaf_count,
                    biomass_g, stress_level
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    plant_ids[plant_name],
                    "2026-10-03T12:00:00Z",
                    height,
                    leaves,
                    biomass,
                    stress,
                ),
            )

        for plant_name, predicted, actual in (
            ("Lettuce", 31.0, 34.0),
            ("Cherry tomato", 29.0, 32.0),
            ("Aloe vera", 24.0, 26.0),
        ):
            connection.execute(
                """
                INSERT INTO predictions (
                    run_id, model_id, plant_id, made_at, target_time,
                    predicted_moisture, actual_moisture
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    model_id,
                    plant_ids[plant_name],
                    "2026-10-02T02:00:00Z",
                    "2026-10-02T08:00:00Z",
                    predicted,
                    actual,
                ),
            )

        connection.execute(
            """
            INSERT INTO alerts (
                run_id, plant_id, timestamp, type, severity, message
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                plant_ids["Cherry tomato"],
                "2026-10-02T08:00:00Z",
                "prediction_dry",
                "warning",
                "Forecast moisture is below the tomato profile target.",
            ),
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the WaterX SQLite database with demo data.")
    parser.add_argument(
        "--database",
        type=Path,
        default=DATABASE_PATH,
        help=f"SQLite database file (default: {DATABASE_PATH})",
    )
    args = parser.parse_args()

    seed_database(args.database)
    print(f"WaterX demo data seeded in {args.database}")


if __name__ == "__main__":
    main()
