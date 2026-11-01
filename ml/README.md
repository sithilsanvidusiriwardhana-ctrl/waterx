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

Each example has a fixed `FeatureVector` (`moisture_pct`, `temperature_c`,
`humidity_pct`, `sunlight`, `rain_mm`, `uptake_rate`) and a
`target_moisture` label. The data source is software simulation, not physical
sensors. Keep runs and time periods separated when adding train/validation/test
splits to avoid evaluating on data that leaked from training.

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
