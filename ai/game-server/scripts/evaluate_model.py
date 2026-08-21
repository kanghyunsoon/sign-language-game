from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import tensorflow as tf

from recognition_dataset import PROJECT_ROOT, audit_dataset, load_partition, read_labels


def predict(model_path: Path, features: np.ndarray) -> np.ndarray:
    interpreter = tf.lite.Interpreter(model_path=str(model_path), num_threads=4)
    interpreter.allocate_tensors()
    model_input = interpreter.get_input_details()[0]
    model_output = interpreter.get_output_details()[0]
    if tuple(model_input["shape"]) != (1, 10, 55) or tuple(model_output["shape"]) != (1, 31):
        raise ValueError(f"Unexpected TFLite contract: {model_input['shape']} -> {model_output['shape']}")
    probabilities = np.empty((len(features), 31), dtype=np.float32)
    for index, sequence in enumerate(features):
        interpreter.set_tensor(model_input["index"], sequence[None])
        interpreter.invoke()
        probabilities[index] = interpreter.get_tensor(model_output["index"])[0]
    return probabilities


def calibrate_thresholds(
    labels: tuple[str, ...], targets: np.ndarray, probabilities: np.ndarray,
    minimum_precision: float = 0.90,
) -> dict[str, float]:
    predicted = probabilities.argmax(axis=1)
    result: dict[str, float] = {}
    for index, symbol in enumerate(labels):
        candidates = np.unique(np.concatenate(([0.5], probabilities[:, index][probabilities[:, index] >= 0.5], [0.9999])))
        best: tuple[float, float] | None = None
        for threshold in candidates:
            accepted = (predicted == index) & (probabilities[:, index] >= threshold)
            true_positive = int(((targets == index) & accepted).sum())
            precision = true_positive / max(1, int(accepted.sum()))
            confirmation_rate = true_positive / max(1, int((targets == index).sum()))
            if precision >= minimum_precision and (best is None or confirmation_rate > best[1]):
                best = (float(threshold), confirmation_rate)
        result[symbol] = best[0] if best else 0.9999
    return result


def evaluate(
    labels: tuple[str, ...], targets: np.ndarray, probabilities: np.ndarray,
    thresholds: dict[str, float], frame_interval_ms: int = 33,
) -> dict[str, object]:
    predicted = probabilities.argmax(axis=1)
    confusion = np.zeros((len(labels), len(labels)), dtype=np.int64)
    for expected, actual in zip(targets, predicted):
        confusion[expected, actual] += 1
    rows: list[dict[str, object]] = []
    for index, symbol in enumerate(labels):
        expected = targets == index
        threshold = thresholds[symbol]
        accepted = (predicted == index) & (probabilities[:, index] >= threshold)
        true_positive = int((expected & accepted).sum())
        accepted_count = int(accepted.sum())
        expected_count = int(expected.sum())
        raw_true_positive = int((expected & (predicted == index)).sum())
        raw_predicted = int((predicted == index).sum())
        # Two consecutive accepted windows are the frontend's fastest confirmation path.
        expected_acceptance = accepted[expected]
        confirmation_offsets = np.flatnonzero(expected_acceptance[:-1] & expected_acceptance[1:])
        average_confirmation_ms = frame_interval_ms if len(confirmation_offsets) else None
        precision = true_positive / max(1, accepted_count)
        confirmation_rate = true_positive / max(1, expected_count)
        rows.append({
            "symbol": symbol,
            "threshold": round(threshold, 6),
            "argmaxPrecision": round(raw_true_positive / max(1, raw_predicted), 6),
            "recall": round(raw_true_positive / max(1, expected_count), 6),
            "precision": round(precision, 6),
            "confirmationRate": round(confirmation_rate, 6),
            "averageConfirmationMs": average_confirmation_ms,
            "competitiveEligible": precision >= 0.90 and confirmation_rate >= 0.85,
        })
    return {
        "sampleCount": int(len(targets)),
        "argmaxAccuracy": round(float((predicted == targets).mean()), 6),
        "classes": rows,
        "confusionMatrix": {label: confusion[index].tolist() for index, label in enumerate(labels)},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit and evaluate the 31-class fingerspelling model.")
    parser.add_argument("--model", type=Path, default=PROJECT_ROOT / "models" / "multi_hand_gesture_classifier.tflite")
    parser.add_argument("--calibration-session", default="1669723415")
    parser.add_argument("--validation-session", default="1669724266")
    parser.add_argument("--stride", type=int, default=2)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    labels = read_labels()
    findings = audit_dataset(labels)
    if findings:
        print(json.dumps({"datasetAudit": findings}, ensure_ascii=False, indent=2))
        raise SystemExit(2)
    calibration = load_partition(labels, {args.calibration_session}, args.stride)
    validation = load_partition(labels, {args.validation_session}, args.stride)
    calibration_predictions = predict(args.model, calibration.features)
    thresholds = calibrate_thresholds(labels, calibration.labels, calibration_predictions)
    report = {
        "model": args.model.name,
        "labelOrder": list(labels),
        "datasetAudit": "PASS",
        "calibrationSession": args.calibration_session,
        "validationSession": args.validation_session,
        "validation": evaluate(labels, validation.labels, predict(args.model, validation.features), thresholds),
    }
    rendered = json.dumps(report, ensure_ascii=False, indent=2)
    print(rendered)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    main()
