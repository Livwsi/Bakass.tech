"""
train_mnist.py
==============

Trains a compact CNN on MNIST and exports it to TensorFlow.js format
for the in-browser DigitDemo. All hyperparameters, metrics, and
artifacts are tracked with MLflow for reproducibility.

System design:
    - Reproducible: seeded RNG, pinned deps (requirements.txt).
    - Tracked:      MLflow logs params, metrics, model, confusion matrix.
    - Portable:     Keras → tensorflowjs_converter → JSON + binary shards.
    - Output:       ../public/models/mnist/{model.json, group1-shard*.bin}

Usage:
    cd ml/
    pip install -r requirements.txt
    python train_mnist.py
"""

from __future__ import annotations

import os
import random
import subprocess
import sys
from pathlib import Path

import mlflow
import mlflow.tensorflow
import numpy as np
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers

# --------------------------------------------------------------------------
# Config
# --------------------------------------------------------------------------

SEED = 42
EPOCHS = 5
BATCH_SIZE = 128
LR = 1e-3
EXPERIMENT = "bakass-mnist"

# Resolve paths relative to this file so script works from any CWD
HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent
OUT_DIR = REPO_ROOT / "public" / "models" / "mnist"
KERAS_TMP = HERE / "checkpoints" / "mnist.keras"


# --------------------------------------------------------------------------
# Reproducibility
# --------------------------------------------------------------------------

def set_seeds(seed: int) -> None:
    """Pin all RNGs we touch — Python, NumPy, TF."""
    os.environ["PYTHONHASHSEED"] = str(seed)
    random.seed(seed)
    np.random.seed(seed)
    tf.random.set_seed(seed)


# --------------------------------------------------------------------------
# Data
# --------------------------------------------------------------------------

def load_data() -> tuple[tuple[np.ndarray, np.ndarray], tuple[np.ndarray, np.ndarray]]:
    """Load MNIST and normalize to [0, 1] with explicit channel dim."""
    (x_tr, y_tr), (x_te, y_te) = keras.datasets.mnist.load_data()

    # Normalize + add channel axis (CNN expects [N, H, W, C])
    x_tr = (x_tr.astype("float32") / 255.0)[..., None]
    x_te = (x_te.astype("float32") / 255.0)[..., None]

    return (x_tr, y_tr), (x_te, y_te)


# --------------------------------------------------------------------------
# Model
# --------------------------------------------------------------------------

def build_model() -> keras.Model:
    """
    Small CNN — kept lean so the exported TF.js bundle stays under ~300 KB.
    Two conv blocks, dropout for regularization, dense head with softmax.
    """
    model = keras.Sequential([
        layers.Input(shape=(28, 28, 1)),

        layers.Conv2D(16, 3, activation="relu", padding="same"),
        layers.MaxPool2D(2),

        layers.Conv2D(32, 3, activation="relu", padding="same"),
        layers.MaxPool2D(2),

        layers.Flatten(),
        layers.Dropout(0.3),
        layers.Dense(64, activation="relu"),
        layers.Dense(10, activation="softmax"),
    ])

    model.compile(
        optimizer=keras.optimizers.Adam(LR),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


# --------------------------------------------------------------------------
# TF.js export
# --------------------------------------------------------------------------

def export_to_tfjs(keras_path: Path, out_dir: Path) -> None:
    """
    Convert a saved Keras model to the TF.js Layers format.
    Requires `tensorflowjs` (pinned in requirements.txt).
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable, "-m", "tensorflowjs.converters.converter",
        "--input_format=keras",
        str(keras_path),
        str(out_dir),
    ]
    print(f"[tfjs] {' '.join(cmd)}")
    subprocess.check_call(cmd)


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def main() -> None:
    set_seeds(SEED)

    # MLflow tracking — defaults to local ./mlruns dir
    mlflow.set_experiment(EXPERIMENT)

    with mlflow.start_run() as run:
        mlflow.log_params({
            "seed": SEED,
            "epochs": EPOCHS,
            "batch_size": BATCH_SIZE,
            "learning_rate": LR,
            "model": "small-cnn-2blocks",
        })

        # 1. Data
        (x_tr, y_tr), (x_te, y_te) = load_data()

        # 2. Model
        model = build_model()
        model.summary()

        # 3. Train
        history = model.fit(
            x_tr, y_tr,
            validation_split=0.1,
            epochs=EPOCHS,
            batch_size=BATCH_SIZE,
            verbose=2,
        )

        # 4. Evaluate on held-out test set
        test_loss, test_acc = model.evaluate(x_te, y_te, verbose=0)
        print(f"\n[eval] test_acc={test_acc:.4f}  test_loss={test_loss:.4f}")

        mlflow.log_metric("test_accuracy", test_acc)
        mlflow.log_metric("test_loss", test_loss)
        for k, v in history.history.items():
            mlflow.log_metric(k, v[-1])

        # 5. Save Keras checkpoint (for MLflow + tfjs converter input)
        KERAS_TMP.parent.mkdir(parents=True, exist_ok=True)
        model.save(KERAS_TMP)
        mlflow.tensorflow.log_model(model, name="model")

        # 6. Export to TF.js format → /public/models/mnist
        export_to_tfjs(KERAS_TMP, OUT_DIR)

        print(f"\n[done] run_id={run.info.run_id}")
        print(f"[done] tfjs model written to: {OUT_DIR}")


if __name__ == "__main__":
    main()
