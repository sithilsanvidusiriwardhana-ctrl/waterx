"""Typed configuration and I/O models for the WaterX simulator."""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal


Strategy = Literal["fixed_schedule", "rule_based", "ai_assisted"]


@dataclass(frozen=True)
class SimulationConfig:
    """Settings for one deterministic simulation run."""

    start_time: datetime
    hours: int = 24 * 30
    strategy: Strategy = "rule_based"
    random_seed: int = 42
    tank_capacity_ml: float = 5000.0
    initial_tank_ml: float | None = None
    forecast_horizon_hours: int = 6
    sensor_noise_stddev: float = 1.5
    sensor_fault_probability: float = 0.01

    def __post_init__(self) -> None:
        if self.strategy not in {"fixed_schedule", "rule_based", "ai_assisted"}:
            raise ValueError(f"Unsupported strategy: {self.strategy!r}")
        if self.start_time.tzinfo is None or self.start_time.utcoffset() is None:
            raise ValueError("start_time must include a timezone")
        if self.start_time.minute or self.start_time.second or self.start_time.microsecond:
            raise ValueError("start_time must be aligned to the hour")
        if self.hours <= 0:
            raise ValueError("hours must be greater than zero")
        if self.tank_capacity_ml <= 0:
            raise ValueError("tank_capacity_ml must be greater than zero")
        initial_level = (
            self.tank_capacity_ml
            if self.initial_tank_ml is None
            else self.initial_tank_ml
        )
        if not 0 <= initial_level <= self.tank_capacity_ml:
            raise ValueError("initial_tank_ml must be between zero and tank capacity")
        if self.forecast_horizon_hours <= 0:
            raise ValueError("forecast_horizon_hours must be greater than zero")
        if self.sensor_noise_stddev < 0:
            raise ValueError("sensor_noise_stddev cannot be negative")
        if not 0 <= self.sensor_fault_probability <= 1:
            raise ValueError("sensor_fault_probability must be between zero and one")

    @property
    def starting_tank_level_ml(self) -> float:
        """Return the configured initial tank level, defaulting to full."""
        if self.initial_tank_ml is None:
            return self.tank_capacity_ml
        return self.initial_tank_ml


@dataclass(frozen=True)
class Weather:
    """Weather conditions for one simulated hour."""

    temperature_c: float
    humidity_pct: float
    sunlight: float
    rain_mm: float


@dataclass(frozen=True)
class SensorReading:
    """Sensor output; a missing value indicates a dropout."""

    moisture_pct: float | None
    is_fault: bool


@dataclass(frozen=True)
class SimulationResult:
    """Summary of a completed simulation run."""

    run_id: int
    strategy: Strategy
    start_time: datetime
    end_time: datetime
    plants_simulated: int
    hours_simulated: int
    water_used_ml: float
    final_tank_level_ml: float
