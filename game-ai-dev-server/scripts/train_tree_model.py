from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
import time

import joblib
import numpy as np
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.metrics import accuracy_score, balanced_accuracy_score, confusion_matrix, precision_recall_fscore_support


SCRIPT_DIR = Path(__file__).resolve().parent
SERVER_ROOT = SCRIPT_DIR.parent
REPOSITORY_ROOT = SERVER_ROOT.parent
sys.path.insert(0, str(SERVER_ROOT))

from app.model_adapter import LABELS as JAMO_LABELS  # noqa: E402
from train_expanded_model import LABELS, NUMBER_LABELS, SEED, load_jamo, load_numbers  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train the reproducible jamo + number tree model.")
    parser.add_argument("--number-features", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--trees", type=int, default=500)
    parser.add_argument("--max-jamo-per-file", type=int, default=500)
    return parser.parse_args()


def summarize(sequences: np.ndarray) -> np.ndarray:
    sequences = np.asarray(sequences, dtype=np.float32)
    if sequences.ndim != 3 or sequences.shape[1:] != (10, 55):
        raise ValueError(f"Expected [samples, 10, 55], got {sequences.shape}")
    return np.concatenate(
        (sequences[:, -1], sequences.mean(axis=1), sequences.std(axis=1), sequences[:, -1] - sequences[:, 0]),
        axis=1,
    ).astype(np.float32)


def balance_numbers(x: np.ndarray, y: np.ndarray, target: int = 500) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(SEED)
    batches = [x]
    labels = [y]
    for class_index in range(len(JAMO_LABELS), len(LABELS)):
        source = x[y == class_index]
        chosen = source[rng.choice(len(source), size=target, replace=True)].copy()
        chosen += rng.normal(0.0, 0.0015, chosen.shape).astype(np.float32)
        batches.append(chosen)
        labels.append(np.full(target, class_index, dtype=np.int64))
    return np.concatenate(batches), np.concatenate(labels)


def evaluate(y_true: np.ndarray, probabilities: np.ndarray) -> dict[str, object]:
    predicted = probabilities.argmax(axis=1)
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true, predicted, labels=np.arange(len(LABELS)), zero_division=0,
    )
    return {
        "samples": int(len(y_true)),
        "accuracy": round(float(accuracy_score(y_true, predicted)), 6),
        "balancedAccuracy": round(float(balanced_accuracy_score(y_true, predicted)), 6),
        "macroPrecision": round(float(precision.mean()), 6),
        "macroRecall": round(float(recall.mean()), 6),
        "macroF1": round(float(f1.mean()), 6),
        "classes": [
            {"label": label, "precision": round(float(precision[i]), 6), "recall": round(float(recall[i]), 6),
             "f1": round(float(f1[i]), 6), "support": int(support[i])}
            for i, label in enumerate(LABELS)
        ],
        "confusionMatrix": confusion_matrix(y_true, predicted, labels=np.arange(len(LABELS))).tolist(),
    }


def subset(y_true: np.ndarray, probabilities: np.ndarray, start: int, end: int) -> dict[str, object]:
    selected = (y_true >= start) & (y_true < end)
    predicted = probabilities[selected].argmax(axis=1)
    truth = y_true[selected]
    indices = np.arange(start, end)
    precision, recall, f1, support = precision_recall_fscore_support(
        truth, predicted, labels=indices, zero_division=0,
    )
    return {
        "samples": int(len(truth)),
        "accuracy": round(float(accuracy_score(truth, predicted)), 6),
        "balancedAccuracy": round(float(recall.mean()), 6),
        "macroPrecision": round(float(precision.mean()), 6),
        "macroRecall": round(float(recall.mean()), 6),
        "macroF1": round(float(f1.mean()), 6),
        "predictedOutsideSubset": int(((predicted < start) | (predicted >= end)).sum()),
        "classes": [
            {"label": LABELS[class_index], "precision": round(float(precision[offset]), 6),
             "recall": round(float(recall[offset]), 6), "f1": round(float(f1[offset]), 6),
             "support": int(support[offset])}
            for offset, class_index in enumerate(indices)
        ],
    }


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    args = parse_args()
    jamo_train_x, jamo_train_y, jamo_test_x, jamo_test_y = load_jamo(args.max_jamo_per_file)
    number_train_x, number_train_y, number_test_x, number_test_y = load_numbers(args.number_features)
    train_x = summarize(np.concatenate((jamo_train_x, number_train_x)))
    train_y = np.concatenate((jamo_train_y, number_train_y))
    train_x, train_y = balance_numbers(train_x, train_y)
    test_y = np.concatenate((jamo_test_y, number_test_y))
    test_x = summarize(np.concatenate((jamo_test_x, number_test_x)))

    model = ExtraTreesClassifier(
        n_estimators=args.trees,
        max_features=0.7,
        min_samples_leaf=1,
        class_weight="balanced",
        n_jobs=-1,
        random_state=SEED,
    )
    started = time.perf_counter()
    model.fit(train_x, train_y)
    training_seconds = time.perf_counter() - started
    started = time.perf_counter()
    probabilities = model.predict_proba(test_x)
    latency_ms = (time.perf_counter() - started) * 1000 / len(test_x)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    model_path = args.output_dir / "jamo-number-41.joblib"
    joblib.dump(model, model_path, compress=3)
    report = {
        "modelVersion": "jamo-number-41-tree-v1",
        "seed": SEED,
        "labels": list(LABELS),
        "featureSummary": "last+mean+std+(last-first), 220 float32 values",
        "split": {
            "jamo": "first two timestamped sessions train; third session test",
            "numbers": "source-provided train/test folders; signer independence not asserted",
        },
        "trainingSamples": int(len(train_y)),
        "testSamples": int(len(test_y)),
        "trainingSeconds": round(training_seconds, 3),
        "meanBatchInferenceMsPerSample": round(latency_ms, 4),
        "overall": evaluate(test_y, probabilities),
        "jamo": subset(test_y, probabilities, 0, len(JAMO_LABELS)),
        "numbers": subset(test_y, probabilities, len(JAMO_LABELS), len(LABELS)),
    }
    report_path = args.output_dir / "evaluation.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest = {
        "schemaVersion": 1,
        "modelVersion": report["modelVersion"],
        "format": "sklearn-extra-trees",
        "artifact": model_path.name,
        "sha256": sha256(model_path),
        "labels": list(LABELS),
        "sequenceLength": 10,
        "featureSize": 55,
        "summaryFeatureSize": 220,
        "datasets": [
            {"name": "repository jamo sequences", "scope": "31 jamo, 3 timestamped sessions"},
            {"name": "Korean Sign Language(KSL) - Numbers", "source": "nahyunpark/korean-sign-languageksl-numbers", "license": "CC0-1.0"},
        ],
        "evaluation": report_path.name,
    }
    (args.output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8",
    )
    print(json.dumps({"artifact": str(model_path), "sizeBytes": model_path.stat().st_size, **report}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
