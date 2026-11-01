# WaterX machine-learning foundation

This package is the starting point for a staged ML workflow. It currently
prepares labeled examples from the existing SQLite simulation records; it does
not train or load a model.

## Current data pipeline

`ml.dataset.load_training_examples()` joins a valid sensor reading and its
weather/profile features to the same plant's simulated ground-truth moisture at
the requested future horizon. Incomplete weather rows, faulty sensor readings,
and missing future labels are excluded.

```python
from ml import load_training_examples

examples = load_training_examples("database/waterx.db", horizon_hours=6)
```

Each example has environmental readings plus the plant's moisture thresholds,
uptake rate, water-per-cycle amount, daily cycle limit, and pump runtime limit
in its fixed numeric `FeatureVector`. A configured watering time is encoded as
cyclical time-of-day features plus a schedule-present flag. The plant
species/profile name is retained as metadata; a future trainer must explicitly
encode it before using it as a categorical model input.

Each simulation saves a snapshot of the active plant profiles for that run.
This keeps training rows tied to the settings that produced them, even if a
plant's profile is edited later.

Adding a plant saves its profile immediately, but it does not invent sensor
history or training labels. The plant appears in the dashboard's dataset
coverage as soon as it exists, and contributes training examples only after a
simulation has generated complete, valid readings and a future label. For
example, run `python -m simulator --strategy ai_assisted --hours 72` from the
repository root. The data source is software simulation, not physical sensors.
Keep runs and time periods separated when adding train/validation/test splits
to avoid evaluating on data that leaked from training.

## Planned stages

1. **Data and feature preparation** — implemented in `dataset.py`.
2. **Baseline model and training** — choose and document a simple baseline;
   persist model metadata and artifacts separately from source code.
3. **Evaluation** — report MAE/RMSE on held-out simulation runs and compare
   against the existing physics-based forecast.
4. **Inference integration** — add a typed prediction interface and keep
   irrigation safety limits independent of model output.
5. **Monitoring and retraining** — track model version, data provenance,
   evaluation results, and drift before considering real sensor data.

The seeded database includes demonstration prediction metadata and metrics;
those records are not evidence that a trained model or validated ML pipeline
exists.
