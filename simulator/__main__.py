"""Command-line runner for WaterX simulations."""

import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import cast

from database.waterx_db import DATABASE_PATH
from .engine import run_simulation
from .models import SimulationConfig, Strategy


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a WaterX plant-watering simulation.")
    parser.add_argument(
        "--strategy",
        choices=("fixed_schedule", "rule_based", "ai_assisted"),
        default="rule_based",
    )
    parser.add_argument(
        "--start",
        type=datetime.fromisoformat,
        default=datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0),
        help="Timezone-aware ISO-8601 start, e.g. 2026-01-01T00:00:00+00:00",
    )
    parser.add_argument("--hours", type=int, default=24 * 30)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--tank-capacity-ml", type=float, default=5000.0)
    parser.add_argument("--initial-tank-ml", type=float)
    parser.add_argument("--forecast-horizon-hours", type=int, default=6)
    parser.add_argument("--database", type=Path, default=DATABASE_PATH)
    args = parser.parse_args()

    config = SimulationConfig(
        start_time=args.start,
        hours=args.hours,
        strategy=cast(Strategy, args.strategy),
        random_seed=args.seed,
        tank_capacity_ml=args.tank_capacity_ml,
        initial_tank_ml=args.initial_tank_ml,
        forecast_horizon_hours=args.forecast_horizon_hours,
    )
    result = run_simulation(config, args.database)
    print(
        f"Simulation {result.run_id} complete: {result.strategy}, "
        f"{result.plants_simulated} plants, {result.hours_simulated} hours, "
        f"{result.water_used_ml:.1f} ml used, "
        f"{result.final_tank_level_ml:.1f} ml remaining."
    )


if __name__ == "__main__":
    main()
