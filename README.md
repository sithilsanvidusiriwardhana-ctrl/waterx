# waterX

waterX combines a Next.js dashboard, a Python simulation engine and a SQLite
database. The dashboard now reads and manages data through a local Python HTTP
API. Database sensor, tank, watering, growth, alert and prediction records are
simulation output; no physical sensors or pump are connected.

## Architecture

- `frountend/`: Next.js 16, React 19 and TypeScript. Existing dashboard,
  plant-library, plant-detail and settings screens are retained.
- `waterx_api.py`: Python standard-library HTTP server over the existing SQLite
  schema. No additional Python packages are required.
- `database/`: SQLite schema, parameterized database helpers and repeatable
  simulation seed data.
- `simulator/`: command-line simulation strategies and their safety checks.

### API endpoints

| Method | Endpoint | Behavior |
| --- | --- | --- |
| `GET` | `/api/health` | Backend connectivity check |
| `GET` | `/api/plants` | List plants with their profiles and available simulation history |
| `GET` | `/api/plants/{id}` | Retrieve one plant; invalid IDs return `400`, absent plants `404` |
| `POST` | `/api/plants` | Create a plant and profile after validating the input |
| `PATCH` | `/api/plants/{id}` | Update the plant name, profile settings or active state |
| `DELETE` | `/api/plants/{id}` | Delete a plant only when there are no linked history records |
| `GET` | `/api/dashboard` | Read tank levels, recent water usage/events, moisture history, alerts and stored predictions |

The plant library supports backend list, detail, create, edit, deactivate,
reactivate and delete operations. The dashboard reads persisted summary and
activity records; plant-detail screens use persisted moisture, watering,
growth and prediction history. Failed requests and empty database states are
shown explicitly. Changes refresh the plant list after the backend confirms
them.

### Schema compatibility and data provenance

The SQLite schema is unchanged. The API maps its existing columns to the
frontend as follows:

- `plants.plant_id` is exposed as the string `Plant.id`.
- `plants.name` maps to `Plant.name`.
- `plant_profiles.name` maps to both `Plant.species` and `Plant.category`.
  The current schema has no separate species/category fields.
- Profile moisture thresholds, water-per-cycle, daily-cycle limit and maximum
  pump runtime map directly to the matching frontend fields.
- `plant_profiles.schedule_time` is a daily `HH:MM` value; it maps to the
  frontend schedule field. Schedule inputs therefore accept a daily time, not
  arbitrary recurrence text. Profile names are unique in the database; creating
  a different configuration under an already-used profile name returns
  `409 Conflict` rather than changing another plant's shared profile.
- `plants.planted_at` is initialized to the current UTC date on creation.
  The existing schema has no image column, so plant image URLs are not stored.
- `sensor_readings` and `weather` supply simulated soil, temperature and
  humidity values. Faulty readings are treated as unavailable; old readings
  are marked stale in the frontend. The `tankLevel` shown on plant cards is the
  latest shared `tank_levels` record.
- `watering_events`, `growth_records`, `predictions` and unresolved `alerts`
  are read from their existing tables and labeled as simulation data.

The simulator blocks watering on missing/faulty sensor readings and enforces
its tank, daily-cycle and pump-runtime limits. The browser has no endpoint to
start watering, run a simulation, or bypass these checks. A `DELETE` that
would violate the existing history foreign keys is rejected; deactivate the
plant to retain its records.

The displayed prediction MAE is calculated from recent stored predictions
that have recorded actual values. It is not an accuracy percentage and does
not imply that a trained or validated production model exists. Water used for
the last seven days is calculated from stored event timestamps in the latest
simulation run; no readings or measurements are invented when records are
absent.

### Settings

Display name and theme are still stored in browser `localStorage`; the backend
has no user or preference tables. Preferences are not synchronized between
browsers or devices. Light and dark theme selection remains available across
the frontend.

## Local development

Use two terminals from the repository root. The backend uses Python's standard
library and defaults to `http://127.0.0.1:8000`, with CORS enabled for the
frontend development origins `http://localhost:3000` and
`http://127.0.0.1:3000`.

### 1. Initialize and seed the database (optional)

```powershell
python -m database.waterx_db
python -m database.seed
```

Seeding inserts repeatable simulated example records once. To start with an
empty database, initialize it but skip the seed command. The default database
file is `database/waterx.db`.

### 2. Start the backend

```powershell
python -m waterx_api
```

Optional backend configuration uses process environment variables:

```powershell
$env:WATERX_API_HOST = "127.0.0.1"
$env:WATERX_API_PORT = "8000"
$env:WATERX_DATABASE_PATH = "C:\path\to\waterx.db"
$env:WATERX_CORS_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
python -m waterx_api
```

Check connectivity at `http://127.0.0.1:8000/api/health`. The API has no
authentication and is intended for local development only; do not expose it
to untrusted networks.

### 3. Start the frontend

```powershell
Set-Location frountend
Copy-Item .env.example .env.local
npm ci
npm run dev
```

Open `http://localhost:3000`. Set `NEXT_PUBLIC_WATERX_API_URL` in
`frountend/.env.local` if the backend uses a different URL, then restart the
Next.js development server. This variable is public browser configuration;
never put credentials or database secrets in `NEXT_PUBLIC_*` variables.

## Verification

From the repository root:

```powershell
python -m unittest discover -s tests -v
```

From `frountend/`:

```powershell
npm run lint
npm run build
```

The backend's simulation strategies remain available through
`python -m simulator --strategy rule_based --hours 72`. Strategy selection,
automated schedule execution, physical sensor/pump control, user accounts,
database-backed reports and CSV export do not have HTTP endpoints yet.
Software-simulated smart plant watering system.

## Project structure

- `database/` contains the SQLite schema, database helpers, and repeatable demo seed data.
- `simulator/` contains the hourly simulation engine, typed configuration, replaceable sensor and pump interfaces, and CLI.
- `tests/` contains database and simulator tests.
- `docs/` contains the requirements and database design.

## Run a simulation

Seed the demo plants first, then run a simulation from the project root:

```powershell
python -m database.seed
python -m simulator --strategy rule_based --hours 720 --seed 42
```

Available strategies are `fixed_schedule`, `rule_based`, and `ai_assisted`.
The simulation writes weather, sensor readings, watering events, tank levels,
alerts, growth records, and (for AI-assisted runs) forecasts to
`database/waterx.db`. Use `--database PATH` to select another database, and
`python -m simulator --help` to see all options.

The AI-assisted strategy currently uses a documented physics-based moisture
forecast heuristic; it does not train a machine-learning model. Model training,
the dashboard, and reporting are planned separately in `docs/waterx.tex`.

## Run tests

```powershell
python -m unittest discover -s tests
```
