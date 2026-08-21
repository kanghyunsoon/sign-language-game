from __future__ import annotations

import json
import os
import argparse
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

import numpy as np
import tensorflow as tf

from evaluate_model import calibrate_thresholds, evaluate, predict
from recognition_dataset import PROJECT_ROOT, audit_dataset, load_partition, read_labels


TRAIN_SESSION = "1669720403"
CALIBRATION_SESSION = "1669723415"
VALIDATION_SESSION = "1669724266"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "work" / "experiments" / "jamo-31-session-holdout"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train a session-held-out Korean fingerspelling experiment.")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--epochs", type=int, default=45)
    return parser.parse_args()


def build_model(training_features: np.ndarray, class_count: int) -> tf.keras.Model:
    normalizer = tf.keras.layers.Normalization(axis=-1)
    normalizer.adapt(training_features.reshape(-1, training_features.shape[-1]))
    inputs = tf.keras.Input((10, 55), name="landmark_sequence")
    value = normalizer(inputs)
    value = tf.keras.layers.GaussianNoise(0.03)(value)
    value = tf.keras.layers.Conv1D(128, 3, padding="same", activation="relu")(value)
    value = tf.keras.layers.Bidirectional(tf.keras.layers.GRU(80))(value)
    value = tf.keras.layers.Dense(128, activation="relu")(value)
    value = tf.keras.layers.Dropout(0.30)(value)
    outputs = tf.keras.layers.Dense(class_count, activation="softmax", name="probabilities")(value)
    return tf.keras.Model(inputs, outputs)


def main() -> None:
    args = parse_args()
    np.random.seed(11)
    tf.random.set_seed(11)
    labels = read_labels()
    findings = audit_dataset(labels)
    if findings:
        raise RuntimeError(json.dumps(findings, ensure_ascii=False))
    training = load_partition(labels, {TRAIN_SESSION})
    calibration = load_partition(labels, {CALIBRATION_SESSION}, stride=2)
    validation = load_partition(labels, {VALIDATION_SESSION}, stride=2)
    model = build_model(training.features, len(labels))
    model.compile(
        optimizer=tf.keras.optimizers.Adam(7e-4),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    model.fit(
        training.features, training.labels,
        validation_data=(calibration.features, calibration.labels),
        epochs=args.epochs, batch_size=96, verbose=2,
        callbacks=[
            tf.keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=8, restore_best_weights=True),
            tf.keras.callbacks.ReduceLROnPlateau(monitor="val_loss", patience=3, factor=0.5),
        ],
    )
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS, tf.lite.OpsSet.SELECT_TF_OPS]
    converter._experimental_lower_tensor_list_ops = False
    converted_model = converter.convert()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    model_path = args.output_dir / "multi_hand_gesture_classifier.tflite"
    h5_path = args.output_dir / "multi_hand_gesture_classifier.h5"
    readiness_path = args.output_dir / "readiness.json"
    # Experiments never overwrite the operational model. Promotion is a separate reviewed step.
    model_path.write_bytes(converted_model)
    model.save(h5_path)
    calibration_probabilities = model.predict(calibration.features, batch_size=256, verbose=0)
    thresholds = calibrate_thresholds(labels, calibration.labels, calibration_probabilities)
    validation_report = evaluate(labels, validation.labels, model.predict(validation.features, batch_size=256, verbose=0), thresholds)
    readiness = {
        "schemaVersion": 1,
        "modelVersion": "jamo-31-v2-session-holdout",
        "confirmationAuthority": "FRONTEND_TEMPORAL_DECODER",
        "split": {
            "training": [TRAIN_SESSION], "calibration": [CALIBRATION_SESSION],
            "validation": [VALIDATION_SESSION], "independentBy": ["user", "session", "capture-environment"],
        },
        "criteria": {"minimumConfirmationRate": 0.85, "minimumCompetitivePrecision": 0.90},
        "classes": validation_report["classes"],
    }
    readiness_path.write_text(json.dumps(readiness, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report_path = args.output_dir / "evaluation.json"
    report_path.write_text(json.dumps(validation_report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"validation": validation_report, "readiness": str(readiness_path), "evaluation": str(report_path)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
