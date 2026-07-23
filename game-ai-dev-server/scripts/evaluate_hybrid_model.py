from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
import time

import numpy as np
import joblib
from sklearn.metrics import accuracy_score, balanced_accuracy_score, precision_recall_fscore_support


SCRIPT_DIR = Path(__file__).resolve().parent
SERVER_ROOT = SCRIPT_DIR.parent
REPOSITORY_ROOT = SERVER_ROOT.parent
sys.path.insert(0, str(SERVER_ROOT))

from app.model_adapter import EXPANDED_LABELS, HybridModelAdapter, LABELS  # noqa: E402
from train_expanded_model import load_jamo, load_numbers  # noqa: E402


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def score(y_true: np.ndarray, probabilities: np.ndarray, start: int, end: int) -> dict[str, object]:
    selected = (y_true >= start) & (y_true < end)
    truth = y_true[selected]
    predicted = probabilities[selected].argmax(axis=1)
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
            {"label": EXPANDED_LABELS[class_index], "precision": round(float(precision[offset]), 6),
             "recall": round(float(recall[offset]), 6), "f1": round(float(f1[offset]), 6),
             "support": int(support[offset])}
            for offset, class_index in enumerate(indices)
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--number-features", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--max-jamo-per-file", type=int, default=500)
    args = parser.parse_args()

    _, _, jamo_x, jamo_y = load_jamo(args.max_jamo_per_file)
    _, _, number_x, number_y = load_numbers(args.number_features)
    x = np.concatenate((jamo_x, number_x))
    y = np.concatenate((jamo_y, number_y))
    runner = HybridModelAdapter()
    started = time.perf_counter()
    summaries = np.concatenate((x[:, -1], x.mean(axis=1), x.std(axis=1), x[:, -1] - x[:, 0]), axis=1)
    tree_path = REPOSITORY_ROOT / "models" / "jamo-number-41-tree-v1" / "jamo-number-41.joblib"
    domain_probabilities = np.asarray(joblib.load(tree_path).predict_proba(summaries), dtype=np.float32)
    probabilities = domain_probabilities.copy()
    jamo_domain = domain_probabilities.argmax(axis=1) < len(LABELS)
    probabilities[jamo_domain, : len(LABELS)] = np.stack([
        runner._jamo.predict(sample[None, ...]) for sample in x[jamo_domain]
    ])
    probabilities[jamo_domain, len(LABELS) :] = 0.0
    elapsed = time.perf_counter() - started
    predicted = probabilities.argmax(axis=1)
    report = {
        "modelVersion": runner.contract.model_version,
        "labels": list(EXPANDED_LABELS),
        "evaluationWarning": "The deployed jamo TFLite baseline was trained with a mixed split that includes these capture sessions; jamo results are regression evidence, not independent certification.",
        "domainRouting": {
            "jamoToNumberErrors": int((predicted[: len(jamo_y)] >= len(LABELS)).sum()),
            "numberToJamoErrors": int((predicted[len(jamo_y) :] < len(LABELS)).sum()),
        },
        "meanEndToEndInferenceMs": round(elapsed * 1000 / len(x), 4),
        "overallAccuracy": round(float(accuracy_score(y, predicted)), 6),
        "overallBalancedAccuracy": round(float(balanced_accuracy_score(y, predicted)), 6),
        "jamo": score(y, probabilities, 0, len(LABELS)),
        "numbers": score(y, probabilities, len(LABELS), len(EXPANDED_LABELS)),
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    report_path = args.output_dir / "evaluation.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    baseline = REPOSITORY_ROOT / "models" / "multi_hand_gesture_classifier.tflite"
    tree = REPOSITORY_ROOT / "models" / "jamo-number-41-tree-v1" / "jamo-number-41.joblib"
    manifest = {
        "schemaVersion": 1,
        "modelVersion": runner.contract.model_version,
        "format": "hybrid-domain-router",
        "labels": list(EXPANDED_LABELS),
        "sequenceLength": 10,
        "featureSize": 55,
        "components": [
            {"role": "jamo", "path": "../multi_hand_gesture_classifier.tflite", "sha256": digest(baseline)},
            {"role": "domain-and-number", "path": "../jamo-number-41-tree-v1/jamo-number-41.joblib", "sha256": digest(tree)},
        ],
        "evaluation": report_path.name,
    }
    (args.output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
