# waterX

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
