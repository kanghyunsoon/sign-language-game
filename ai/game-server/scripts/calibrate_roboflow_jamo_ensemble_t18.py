"""Validation-only class-bias calibration for the T-17 ensemble."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from sklearn.metrics import classification_report, confusion_matrix, f1_score

from train_roboflow_jamo_image_t10 import (
    choose_threshold,
    class_floor_metrics,
    similar_metrics,
    threshold_metrics,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--class-target", type=float, default=0.93)
    parser.add_argument("--steps", default="0.50,0.25,0.125,0.0625")
    return parser.parse_args()


def apply_bias(probabilities: np.ndarray, bias: np.ndarray) -> np.ndarray:
    values = probabilities * np.exp(bias)[None, :]
    return values / np.maximum(values.sum(1, keepdims=True), 1e-12)


def metrics(truth: np.ndarray, probabilities: np.ndarray, class_count: int) -> dict:
    predicted = probabilities.argmax(1)
    accuracy = float((truth == predicted).mean())
    macro = float(f1_score(truth, predicted, average="macro", zero_division=0))
    floor = class_floor_metrics(truth, predicted, class_count)
    selection = (
        0.15 * accuracy + 0.20 * macro + 0.15 * floor["minRecall"] + 0.15 * floor["minF1"]
        + 0.175 * floor["q10Recall"] + 0.175 * floor["q10F1"]
    )
    selection -= 2.0 * max(0.0, 0.93 - accuracy) + 2.0 * max(0.0, 0.93 - macro)
    return {"accuracy": accuracy, "macroF1": macro, **floor, "selectionScore": selection}


def main() -> None:
    args = parse_args()
    payload = np.load(args.predictions)
    classes = tuple(payload["classes"].astype(str))
    valid_truth = payload["valid_truth"].astype(np.int64)
    valid_base = payload["valid_probabilities"].astype(np.float64)
    test_truth = payload["test_truth"].astype(np.int64)
    test_base = payload["test_probabilities"].astype(np.float64)
    test_domains = payload["test_domains"].astype(str)
    bias = np.zeros(len(classes), dtype=np.float64)
    best = metrics(valid_truth, valid_base, len(classes))
    history = [{"step": 0.0, "class": None, **best}]

    for step in [float(value) for value in args.steps.split(",") if value.strip()]:
        changed = True
        passes = 0
        while changed and passes < 3:
            changed = False
            passes += 1
            for class_index, label in enumerate(classes):
                local_bias, local_metrics = bias.copy(), best
                for delta in (-step, step):
                    candidate = bias.copy(); candidate[class_index] += delta
                    candidate_metrics = metrics(valid_truth, apply_bias(valid_base, candidate), len(classes))
                    if candidate_metrics["selectionScore"] > local_metrics["selectionScore"] + 1e-12:
                        local_bias, local_metrics = candidate, candidate_metrics
                if local_metrics["selectionScore"] > best["selectionScore"] + 1e-12:
                    bias, best, changed = local_bias, local_metrics, True
                    history.append({"step": step, "class": label, "bias": float(bias[class_index]), **best})

    valid_prob = apply_bias(valid_base, bias)
    test_prob = apply_bias(test_base, bias)
    valid_pred = valid_prob.argmax(1); valid_conf = valid_prob.max(1)
    test_pred = test_prob.argmax(1); test_conf = test_prob.max(1)
    test_report = classification_report(test_truth, test_pred, labels=range(len(classes)), target_names=classes, output_dict=True, zero_division=0)
    floor = class_floor_metrics(test_truth, test_pred, len(classes))
    below = [label for label in classes if test_report[label]["recall"] < args.class_target or test_report[label]["f1-score"] < args.class_target]
    validation_op = choose_threshold(valid_truth, valid_pred, valid_conf)
    threshold = float(validation_op["selected"]["threshold"])
    domains = {}
    for domain in sorted(set(test_domains)):
        mask = test_domains == domain
        domains[domain] = {"support": int(mask.sum()), "accuracy": float((test_truth[mask] == test_pred[mask]).mean()), "macroF1": float(f1_score(test_truth[mask], test_pred[mask], average="macro", zero_division=0))}
    matrix = confusion_matrix(test_truth, test_pred, labels=range(len(classes)))
    mistakes = [{"expected": classes[i], "predicted": classes[j], "count": int(matrix[i, j])} for i in range(len(classes)) for j in range(len(classes)) if i != j and matrix[i, j]]
    report = {
        "attempt": "T-18", "method": "validation-only per-class multiplicative probability bias coordinate descent",
        "sourcePredictions": str(args.predictions), "classes": list(classes), "biasByClass": {classes[i]: float(bias[i]) for i in range(len(classes))},
        "validationBefore": metrics(valid_truth, valid_base, len(classes)), "validationAfter": metrics(valid_truth, valid_prob, len(classes)), "optimizationHistory": history,
        "testAccuracy": float((test_truth == test_pred).mean()), "testMacroF1": float(f1_score(test_truth, test_pred, average="macro", zero_division=0)),
        "testByClass": test_report, "classGate": {"target": args.class_target, **floor, "belowTarget": below, "passed": not below},
        "domainMetrics": domains, "similarGroupMetrics": similar_metrics(test_truth, test_pred, classes),
        "usabilityMetrics": {"validationOperatingPoint": validation_op, "testAtValidationSelectedThreshold": threshold_metrics(test_truth, test_pred, test_conf, threshold), "continuousSequence": {"status": "not-measured", "reason": "static-image dataset"}},
        "topConfusions": sorted(mistakes, key=lambda row: row["count"], reverse=True)[:30],
        "limitations": ["Calibration validation is not locked and number validation overlaps training differently across source models.", "The repeatedly observed test remains development-only."],
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "evaluation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    np.savez_compressed(args.output_dir / "predictions.npz", classes=np.asarray(classes), valid_truth=valid_truth, valid_probabilities=valid_prob, test_truth=test_truth, test_probabilities=test_prob, test_domains=test_domains)
    print(json.dumps({"testAccuracy": report["testAccuracy"], "testMacroF1": report["testMacroF1"], "belowTarget": len(below), "report": str(args.output_dir / 'evaluation.json')}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
