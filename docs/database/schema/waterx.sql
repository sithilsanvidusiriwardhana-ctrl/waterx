PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS plant_profiles (
    profile_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    min_moisture REAL NOT NULL CHECK (min_moisture BETWEEN 0 AND 100),
    max_moisture REAL NOT NULL CHECK (max_moisture BETWEEN 0 AND 100),
    optimal_moisture REAL NOT NULL
        CHECK (optimal_moisture BETWEEN min_moisture AND max_moisture),
    water_per_cycle_ml REAL NOT NULL CHECK (water_per_cycle_ml > 0),
    max_cycles_per_day INTEGER NOT NULL DEFAULT 3
        CHECK (max_cycles_per_day > 0),
    max_pump_seconds INTEGER NOT NULL DEFAULT 30
        CHECK (max_pump_seconds > 0),
    schedule_time TEXT
        CHECK (
            schedule_time IS NULL OR (
                length(schedule_time) = 5
                AND schedule_time GLOB '[0-2][0-9]:[0-5][0-9]'
                AND CAST(substr(schedule_time, 1, 2) AS INTEGER) < 24
            )
        ),
    uptake_rate REAL NOT NULL,
    CHECK (max_moisture > min_moisture)
);

CREATE TABLE IF NOT EXISTS plants (
    plant_id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL
        REFERENCES plant_profiles(profile_id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    location TEXT,
    planted_at TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS ml_models (
    model_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    algorithm TEXT NOT NULL,
    horizon_hours INTEGER NOT NULL CHECK (horizon_hours > 0),
    features TEXT NOT NULL,
    train_start TEXT,
    train_end TEXT,
    mae REAL CHECK (mae IS NULL OR mae >= 0),
    rmse REAL CHECK (rmse IS NULL OR rmse >= 0),
    file_path TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS simulation_runs (
    run_id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy TEXT NOT NULL
        CHECK (strategy IN ('fixed_schedule', 'rule_based', 'ai_assisted')),
    random_seed INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    model_id INTEGER REFERENCES ml_models(model_id),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS weather (
    weather_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL
        REFERENCES simulation_runs(run_id) ON DELETE CASCADE,
    timestamp TEXT NOT NULL,
    temperature_c REAL,
    humidity_pct REAL CHECK (humidity_pct IS NULL OR humidity_pct BETWEEN 0 AND 100),
    sunlight REAL,
    rain_mm REAL DEFAULT 0 CHECK (rain_mm IS NULL OR rain_mm >= 0),
    UNIQUE (run_id, timestamp)
);

CREATE TABLE IF NOT EXISTS sensor_readings (
    reading_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL
        REFERENCES simulation_runs(run_id) ON DELETE CASCADE,
    plant_id INTEGER NOT NULL REFERENCES plants(plant_id),
    timestamp TEXT NOT NULL,
    moisture_pct REAL CHECK (
        moisture_pct IS NULL OR moisture_pct BETWEEN 0 AND 100
    ),
    true_moisture REAL CHECK (
        true_moisture IS NULL OR true_moisture BETWEEN 0 AND 100
    ),
    is_fault INTEGER NOT NULL DEFAULT 0 CHECK (is_fault IN (0, 1)),
    UNIQUE (run_id, plant_id, timestamp)
);

CREATE TABLE IF NOT EXISTS watering_events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL
        REFERENCES simulation_runs(run_id) ON DELETE CASCADE,
    plant_id INTEGER NOT NULL REFERENCES plants(plant_id),
    timestamp TEXT NOT NULL,
    amount_ml REAL NOT NULL CHECK (amount_ml >= 0),
    duration_s REAL CHECK (duration_s IS NULL OR duration_s >= 0),
    trigger TEXT NOT NULL
        CHECK (trigger IN ('schedule', 'threshold', 'prediction', 'manual')),
    moisture_before REAL CHECK (
        moisture_before IS NULL OR moisture_before BETWEEN 0 AND 100
    ),
    predicted_moisture REAL CHECK (
        predicted_moisture IS NULL OR predicted_moisture BETWEEN 0 AND 100
    )
);

CREATE TABLE IF NOT EXISTS tank_levels (
    tank_log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL
        REFERENCES simulation_runs(run_id) ON DELETE CASCADE,
    timestamp TEXT NOT NULL,
    level_ml REAL NOT NULL CHECK (level_ml >= 0),
    capacity_ml REAL NOT NULL CHECK (capacity_ml > 0),
    CHECK (level_ml <= capacity_ml),
    UNIQUE (run_id, timestamp)
);

CREATE TABLE IF NOT EXISTS growth_records (
    growth_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL
        REFERENCES simulation_runs(run_id) ON DELETE CASCADE,
    plant_id INTEGER NOT NULL REFERENCES plants(plant_id),
    timestamp TEXT NOT NULL,
    height_cm REAL CHECK (height_cm IS NULL OR height_cm >= 0),
    leaf_count INTEGER CHECK (leaf_count IS NULL OR leaf_count >= 0),
    biomass_g REAL CHECK (biomass_g IS NULL OR biomass_g >= 0),
    stress_level REAL CHECK (stress_level IS NULL OR stress_level BETWEEN 0 AND 1),
    UNIQUE (run_id, plant_id, timestamp)
);

CREATE TABLE IF NOT EXISTS predictions (
    prediction_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL
        REFERENCES simulation_runs(run_id) ON DELETE CASCADE,
    model_id INTEGER NOT NULL REFERENCES ml_models(model_id),
    plant_id INTEGER NOT NULL REFERENCES plants(plant_id),
    made_at TEXT NOT NULL,
    target_time TEXT NOT NULL,
    predicted_moisture REAL NOT NULL
        CHECK (predicted_moisture BETWEEN 0 AND 100),
    actual_moisture REAL CHECK (
        actual_moisture IS NULL OR actual_moisture BETWEEN 0 AND 100
    )
);

CREATE TABLE IF NOT EXISTS alerts (
    alert_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER REFERENCES simulation_runs(run_id) ON DELETE CASCADE,
    plant_id INTEGER REFERENCES plants(plant_id),
    timestamp TEXT NOT NULL,
    type TEXT NOT NULL CHECK (
        type IN (
            'low_tank', 'too_dry', 'too_wet', 'sensor_fault',
            'pump_limit', 'prediction_dry'
        )
    ),
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    message TEXT,
    resolved INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_plants_profile_id
    ON plants(profile_id);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_run_plant_time
    ON sensor_readings(run_id, plant_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_watering_events_run_plant_time
    ON watering_events(run_id, plant_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_growth_records_run_plant_time
    ON growth_records(run_id, plant_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_predictions_run_plant_target
    ON predictions(run_id, plant_id, target_time);
CREATE INDEX IF NOT EXISTS idx_alerts_run_time
    ON alerts(run_id, timestamp);

CREATE VIEW IF NOT EXISTS daily_water_usage AS
SELECT
    run_id,
    plant_id,
    substr(timestamp, 1, 10) AS day,
    COUNT(*) AS watering_count,
    SUM(amount_ml) AS water_used_ml
FROM watering_events
GROUP BY run_id, plant_id, substr(timestamp, 1, 10);
