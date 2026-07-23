from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import sys
import time

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

import h5py
import numpy as np
from sklearn.metrics import accuracy_score, balanced_accuracy_score, confusion_matrix, precision_recall_fscore_support
from sklearn.model_selection import train_test_split
import tensorflow as tf


SCRIPT_DIR = Path(__file__).resolve().parent
SERVER_ROOT = SCRIPT_DIR.parent
REPOSITORY_ROOT = SERVER_ROOT.parent
sys.path.insert(0, str(SERVER_ROOT))

from app.model_adapter import LABELS as JAMO_LABELS  # noqa: E402


NUMBER_LABELS = tuple(str(value) for value in range(1, 11))
LABELS = JAMO_LABELS + NUMBER_LABELS
LABEL_TO_INDEX = {label: index for index, label in enumerate(LABELS)}
TRAIN_SESSIONS = {"1669720403", "1669723415"}
TEST_SESSION = "1669724266"
SEED = 20260721


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--number-features", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--max-jamo-per-file", type=int, default=500)
    parser.add_argument("--from-scratch", action="store_true")
    return parser.parse_args()


def load_jamo(maximum_per_file: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    rng = np.random.default_rng(SEED)
    train_x: list[np.ndarray] = []
    train_y: list[np.ndarray] = []
    test_x: list[np.ndarray] = []
    test_y: list[np.ndarray] = []
    for path in sorted((REPOSITORY_ROOT / "dataset").glob("seq_*.npy")):
        body, session = path.stem.rsplit("_", 1)
        symbol = body.removeprefix("seq_")
        if symbol not in LABEL_TO_INDEX:
            continue
        values = np.load(path).astype(np.float32)
        features = values[:, :, :55]
        if len(features) > maximum_per_file:
            indices = np.linspace(0, len(features) - 1, maximum_per_file, dtype=np.int64)
            features = features[indices]
        labels = np.full(len(features), LABEL_TO_INDEX[symbol], dtype=np.int64)
        if session in TRAIN_SESSIONS:
            order = rng.permutation(len(features))
            train_x.append(features[order])
            train_y.append(labels[order])
        elif session == TEST_SESSION:
            test_x.append(features)
            test_y.append(labels)
    return np.concatenate(train_x), np.concatenate(train_y), np.concatenate(test_x), np.concatenate(test_y)


def load_numbers(path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    payload = np.load(path)
    features = payload["features"].astype(np.float32)
    labels = np.asarray([LABEL_TO_INDEX[str(value)] for value in payload["labels"]], dtype=np.int64)
    splits = payload["splits"]
    train = splits == "train"
    test = splits == "test"
    return features[train], labels[train], features[test], labels[test]


def stratified_validation(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    train_indices, validation_indices = train_test_split(
        np.arange(len(y)), test_size=0.15, random_state=SEED, stratify=y,
    )
    return x[train_indices], y[train_indices], x[validation_indices], y[validation_indices]


def balance_and_augment(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(SEED)
    counts = np.bincount(y, minlength=len(LABELS))
    target = int(min(max(counts), 900))
    batches: list[np.ndarray] = []
    labels: list[np.ndarray] = []
    for class_index in range(len(LABELS)):
        source = x[y == class_index]
        if not len(source):
            raise RuntimeError(f"No training examples for {LABELS[class_index]}")
        chosen = rng.choice(len(source), size=target, replace=len(source) < target)
        values = source[chosen].copy()
        if len(source) < target:
            vector_noise = rng.normal(0.0, 0.008, size=values[:, :, :40].shape).astype(np.float32)
            angle_noise = rng.normal(0.0, 0.8, size=values[:, :, 40:].shape).astype(np.float32)
            values[:, :, :40] += vector_noise
            values[:, :, 40:] += angle_noise
            vectors = values[:, :, :40].reshape(-1, 10, 20, 2)
            lengths = np.linalg.norm(vectors, axis=-1, keepdims=True)
            values[:, :, :40] = np.divide(vectors, lengths, out=np.zeros_like(vectors), where=lengths > 1e-6).reshape(-1, 10, 40)
        batches.append(values)
        labels.append(np.full(target, class_index, dtype=np.int64))
    combined_x = np.concatenate(batches)
    combined_y = np.concatenate(labels)
    order = rng.permutation(len(combined_y))
    return combined_x[order], combined_y[order]


def build_model(class_count: int) -> tf.keras.Model:
    regularizer = tf.keras.regularizers.l2(0.01)
    return tf.keras.Sequential(
        [
            tf.keras.Input((10, 55), name="landmark_sequence"),
            tf.keras.layers.GaussianNoise(0.006, name="feature_noise"),
            tf.keras.layers.LSTM(64, activation="relu", kernel_regularizer=regularizer, name="lstm"),
            tf.keras.layers.Dropout(0.30, name="dropout"),
            tf.keras.layers.Dense(32, activation="relu", kernel_regularizer=regularizer, name="dense"),
            tf.keras.layers.Dropout(0.30, name="dropout_1"),
            tf.keras.layers.Dense(class_count, activation="softmax", kernel_regularizer=regularizer, name="probabilities"),
        ],
        name="jamo_number_classifier",
    )


def transfer_baseline_weights(model: tf.keras.Model, baseline_path: Path) -> None:
    with h5py.File(baseline_path, "r") as source:
        model.get_layer("lstm").set_weights(
            [
                source["model_weights/lstm/lstm/lstm_cell/kernel:0"][:],
                source["model_weights/lstm/lstm/lstm_cell/recurrent_kernel:0"][:],
                source["model_weights/lstm/lstm/lstm_cell/bias:0"][:],
            ],
        )
        model.get_layer("dense").set_weights(
            [source["model_weights/dense/dense/kernel:0"][:], source["model_weights/dense/dense/bias:0"][:]],
        )
        old_kernel = source["model_weights/dense_1/dense_1/kernel:0"][:]
        old_bias = source["model_weights/dense_1/dense_1/bias:0"][:]
    kernel, bias = model.get_layer("probabilities").get_weights()
    kernel[:, : len(JAMO_LABELS)] = old_kernel
    bias[: len(JAMO_LABELS)] = old_bias
    model.get_layer("probabilities").set_weights([kernel, bias])


def metrics(y_true: np.ndarray, probabilities: np.ndarray, labels: tuple[str, ...] = LABELS) -> dict[str, object]:
    predictions = probabilities.argmax(axis=1)
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true, predictions, labels=np.arange(len(labels)), zero_division=0,
    )
    return {
        "samples": int(len(y_true)),
        "accuracy": round(float(accuracy_score(y_true, predictions)), 6),
        "balancedAccuracy": round(float(balanced_accuracy_score(y_true, predictions)), 6),
        "macroPrecision": round(float(precision.mean()), 6),
        "macroRecall": round(float(recall.mean()), 6),
        "macroF1": round(float(f1.mean()), 6),
        "classes": [
            {
                "label": label,
                "precision": round(float(precision[index]), 6),
                "recall": round(float(recall[index]), 6),
                "f1": round(float(f1[index]), 6),
                "support": int(support[index]),
            }
            for index, label in enumerate(labels)
        ],
        "confusionMatrix": confusion_matrix(y_true, predictions, labels=np.arange(len(labels))).tolist(),
    }


def subset_metrics(y_true: np.ndarray, probabilities: np.ndarray, indices: np.ndarray) -> dict[str, object]:
    selected = np.isin(y_true, indices)
    subset_y = y_true[selected]
    predictions = probabilities[selected].argmax(axis=1)
    precision, recall, f1, support = precision_recall_fscore_support(
        subset_y, predictions, labels=indices, zero_division=0,
    )
    return {
        "samples": int(len(subset_y)),
        "accuracy": round(float(accuracy_score(subset_y, predictions)), 6),
        "balancedAccuracy": round(float(recall.mean()), 6),
        "macroPrecision": round(float(precision.mean()), 6),
        "macroRecall": round(float(recall.mean()), 6),
        "macroF1": round(float(f1.mean()), 6),
        "predictedOutsideSubset": int((~np.isin(predictions, indices)).sum()),
        "classes": [
            {
                "label": LABELS[class_index],
                "precision": round(float(precision[offset]), 6),
                "recall": round(float(recall[offset]), 6),
                "f1": round(float(f1[offset]), 6),
                "support": int(support[offset]),
            }
            for offset, class_index in enumerate(indices)
        ],
        "confusionMatrix": confusion_matrix(subset_y, predictions, labels=indices).tolist(),
    }


def convert_tflite(model: tf.keras.Model, path: Path) -> None:
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS, tf.lite.OpsSet.SELECT_TF_OPS]
    converter._experimental_lower_tensor_list_ops = False
    path.write_bytes(converter.convert())


def measure_tflite_latency(path: Path, samples: np.ndarray) -> dict[str, float]:
    interpreter = tf.lite.Interpreter(model_path=str(path), num_threads=4)
    interpreter.allocate_tensors()
    input_info = interpreter.get_input_details()[0]
    durations: list[float] = []
    for sample in samples[: min(500, len(samples))]:
        started = time.perf_counter()
        interpreter.set_tensor(input_info["index"], sample[None, ...].astype(np.float32))
        interpreter.invoke()
        durations.append((time.perf_counter() - started) * 1000.0)
    return {
        "meanMs": round(float(np.mean(durations)), 3),
        "p95Ms": round(float(np.percentile(durations, 95)), 3),
        "samples": len(durations),
    }


def main() -> None:
    args = parse_args()
    np.random.seed(SEED)
    tf.random.set_seed(SEED)
    jamo_train_x, jamo_train_y, jamo_test_x, jamo_test_y = load_jamo(args.max_jamo_per_file)
    number_train_x, number_train_y, number_test_x, number_test_y = load_numbers(args.number_features)
    all_train_x = np.concatenate((jamo_train_x, number_train_x))
    all_train_y = np.concatenate((jamo_train_y, number_train_y))
    train_x, train_y, validation_x, validation_y = stratified_validation(all_train_x, all_train_y)
    train_x, train_y = balance_and_augment(train_x, train_y)
    test_x = np.concatenate((jamo_test_x, number_test_x))
    test_y = np.concatenate((jamo_test_y, number_test_y))

    model = build_model(len(LABELS))
    if not args.from_scratch:
        transfer_baseline_weights(model, REPOSITORY_ROOT / "models" / "multi_hand_gesture_classifier.h5")
        for name in ("lstm", "dense"):
            model.get_layer(name).trainable = False
        model.compile(optimizer=tf.keras.optimizers.Adam(8e-4), loss="sparse_categorical_crossentropy", metrics=["accuracy"])
        model.fit(train_x, train_y, validation_data=(validation_x, validation_y), epochs=5, batch_size=args.batch_size, verbose=2)
        for name in ("lstm", "dense"):
            model.get_layer(name).trainable = True

    model.compile(optimizer=tf.keras.optimizers.Adam(2e-4), loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    history = model.fit(
        train_x,
        train_y,
        validation_data=(validation_x, validation_y),
        epochs=args.epochs,
        batch_size=args.batch_size,
        verbose=2,
        callbacks=[
            tf.keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=8, restore_best_weights=True),
            tf.keras.callbacks.ReduceLROnPlateau(monitor="val_loss", patience=3, factor=0.5, min_lr=1e-6),
        ],
    )

    args.output_dir.mkdir(parents=True, exist_ok=True)
    keras_path = args.output_dir / "jamo-number-41.keras"
    tflite_path = args.output_dir / "jamo-number-41.tflite"
    model.save(keras_path)
    convert_tflite(model, tflite_path)
    probabilities = model.predict(test_x, batch_size=512, verbose=0)
    report = {
        "schemaVersion": 1,
        "modelVersion": "jamo-number-41-v1",
        "labels": LABELS,
        "method": "baseline LSTM/Dense weight transfer, balanced class sampling, landmark noise augmentation, session holdout",
        "split": {
            "jamoTrainSessions": sorted(TRAIN_SESSIONS),
            "jamoTestSession": TEST_SESSION,
            "numberTrain": "Kaggle provided train split",
            "numberTest": "Kaggle provided test split; signer identity unavailable",
        },
        "training": {
            "fromScratch": args.from_scratch,
            "trainSamplesAfterBalancing": len(train_y),
            "validationSamples": len(validation_y),
            "epochsCompleted": len(history.history["loss"]),
            "bestValidationAccuracy": round(float(max(history.history["val_accuracy"])), 6),
        },
        "overall": metrics(test_y, probabilities),
        "jamo": subset_metrics(test_y, probabilities, np.arange(len(JAMO_LABELS))),
        "numbers": subset_metrics(test_y, probabilities, np.arange(len(JAMO_LABELS), len(LABELS))),
        "latency": measure_tflite_latency(tflite_path, test_x),
    }
    (args.output_dir / "evaluation.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8",
    )
    print(json.dumps({"overall": report["overall"], "jamo": report["jamo"], "numbers": report["numbers"], "latency": report["latency"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
