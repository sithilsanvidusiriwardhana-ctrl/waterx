"""Replaceable simulated sensor and pump components."""

import random
from typing import Protocol

from .models import SensorReading


class SensorSource(Protocol):
    """Interface for reading a plant's soil-moisture sensor."""

    def read(self, true_moisture: float, rng: random.Random) -> SensorReading:
        """Return a measured value and whether the reading is faulty."""


class PumpController(Protocol):
    """Interface for delivering water to a plant."""

    def deliver(self, amount_ml: float, duration_s: float) -> float:
        """Deliver water and return the amount actually delivered."""


class SimulatedSensorSource:
    """Sensor with deterministic, seed-controlled noise and occasional faults."""

    def __init__(
        self,
        noise_stddev: float = 1.5,
        fault_probability: float = 0.01,
    ) -> None:
        if noise_stddev < 0:
            raise ValueError("noise_stddev cannot be negative")
        if not 0 <= fault_probability <= 1:
            raise ValueError("fault_probability must be between zero and one")
        self.noise_stddev = noise_stddev
        self.fault_probability = fault_probability

    def read(self, true_moisture: float, rng: random.Random) -> SensorReading:
        noisy_value = min(100.0, max(0.0, true_moisture + rng.gauss(0, self.noise_stddev)))
        if rng.random() >= self.fault_probability:
            return SensorReading(noisy_value, False)

        if rng.random() < 0.2:
            return SensorReading(None, True)

        spike = rng.choice((-1.0, 1.0)) * rng.uniform(20.0, 45.0)
        return SensorReading(min(100.0, max(0.0, noisy_value + spike)), True)


class SimulatedPumpController:
    """Ideal pump implementation used by software-only simulations."""

    def deliver(self, amount_ml: float, duration_s: float) -> float:
        if amount_ml < 0 or duration_s < 0:
            raise ValueError("amount_ml and duration_s cannot be negative")
        return amount_ml
