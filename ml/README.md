# MNIST training pipeline

Trains a small CNN on MNIST, tracks the run with **MLflow**, and exports
the model to TensorFlow.js so the static site can serve it client-side.

## Run

```bash
cd ml
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python train_mnist.py
```

Outputs:
- `mlruns/` — MLflow tracking dir (metrics, params, artifact store)
- `checkpoints/mnist.keras` — Keras checkpoint
- `../public/models/mnist/model.json` + shards — **what the site loads**

Inspect runs:
```bash
mlflow ui   # http://localhost:5000
```

## Reproducibility
- Seeded (`SEED = 42`) across Python / NumPy / TF.
- Pinned deps in `requirements.txt`.
- Expected test accuracy: ~0.99 after 5 epochs.

## Why this lives outside `src/`
The Python training stack is heavy and only runs offline. The Astro site only
ever sees the **exported model artifacts** in `public/models/mnist/`. The
boundary keeps the static bundle lean and the build deterministic.
