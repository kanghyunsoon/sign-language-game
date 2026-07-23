"""Validation-only per-class convex model mixture search for T-17 probabilities."""
from __future__ import annotations

import argparse
import itertools
import json
from pathlib import Path

import numpy as np
from sklearn.metrics import classification_report, confusion_matrix, f1_score

from train_roboflow_jamo_image_t10 import choose_threshold, class_floor_metrics, similar_metrics, threshold_metrics


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--class-target", type=float, default=0.93)
    return parser.parse_args()


def normalize(values: np.ndarray) -> np.ndarray:
    return values / np.maximum(values.sum(1, keepdims=True), 1e-12)


def metric(truth: np.ndarray, scores: np.ndarray, class_count: int) -> dict:
    predicted = scores.argmax(1)
    accuracy = float((truth == predicted).mean())
    macro = float(f1_score(truth, predicted, average="macro", zero_division=0))
    floor = class_floor_metrics(truth, predicted, class_count)
    selection = 0.15 * accuracy + 0.20 * macro + 0.15 * floor["minRecall"] + 0.15 * floor["minF1"] + 0.175 * floor["q10Recall"] + 0.175 * floor["q10F1"]
    selection -= 2.0 * max(0.0, 0.93 - accuracy) + 2.0 * max(0.0, 0.93 - macro)
    return {"accuracy": accuracy, "macroF1": macro, **floor, "selectionScore": selection}


def candidate_weights(model_count: int) -> list[np.ndarray]:
    values = []
    for index in range(model_count):
        weight = np.zeros(model_count); weight[index] = 1.0; values.append(weight)
    values.append(np.full(model_count, 1.0 / model_count))
    for left, right in itertools.combinations(range(model_count), 2):
        equal = np.zeros(model_count); equal[left] = equal[right] = 0.5; values.append(equal)
        for major, minor in ((left, right), (right, left)):
            skewed = np.zeros(model_count); skewed[major] = 0.75; skewed[minor] = 0.25; values.append(skewed)
    return values


def compose(model_probabilities: np.ndarray, weights: np.ndarray) -> np.ndarray:
    samples = model_probabilities.shape[1]
    classes = model_probabilities.shape[2]
    result = np.empty((samples, classes), dtype=np.float64)
    for class_index in range(classes):
        result[:, class_index] = weights[class_index] @ model_probabilities[:, :, class_index]
    return normalize(result)


def main() -> None:
    args = parse_args()
    payload = np.load(args.predictions)
    classes = tuple(payload["classes"].astype(str))
    names = tuple(payload["model_names"].astype(str))
    valid_truth = payload["valid_truth"].astype(np.int64)
    valid_models = payload["valid_model_probabilities"].astype(np.float64)
    test_truth = payload["test_truth"].astype(np.int64)
    test_models = payload["test_model_probabilities"].astype(np.float64)
    test_domains = payload["test_domains"].astype(str)
    reports = [classification_report(valid_truth, values.argmax(1), labels=range(len(classes)), target_names=classes, output_dict=True, zero_division=0) for values in valid_models]
    weights = np.zeros((len(classes), len(names)), dtype=np.float64)
    for class_index, label in enumerate(classes):
        expert = max(range(len(names)), key=lambda i: (reports[i][label]["f1-score"], reports[i][label]["recall"], reports[i][label]["precision"]))
        weights[class_index, expert] = 1.0
    valid_scores = compose(valid_models, weights)
    best = metric(valid_truth, valid_scores, len(classes))
    history = [{"pass": 0, "class": None, **best}]
    choices = candidate_weights(len(names))
    for pass_index in range(1, 4):
        changed = False
        for class_index, label in enumerate(classes):
            local_weight, local_scores, local_metric = weights[class_index].copy(), valid_scores, best
            for choice in choices:
                candidate_weights_matrix = weights.copy(); candidate_weights_matrix[class_index] = choice
                candidate_scores = compose(valid_models, candidate_weights_matrix)
                candidate_metric = metric(valid_truth, candidate_scores, len(classes))
                if candidate_metric["selectionScore"] > local_metric["selectionScore"] + 1e-12:
                    local_weight, local_scores, local_metric = choice.copy(), candidate_scores, candidate_metric
            if local_metric["selectionScore"] > best["selectionScore"] + 1e-12:
                weights[class_index], valid_scores, best, changed = local_weight, local_scores, local_metric, True
                history.append({"pass": pass_index, "class": label, "weights": local_weight.tolist(), **best})
        if not changed:
            break
    test_scores = compose(test_models, weights)
    valid_pred = valid_scores.argmax(1); valid_conf = valid_scores.max(1)
    test_pred = test_scores.argmax(1); test_conf = test_scores.max(1)
    test_report = classification_report(test_truth, test_pred, labels=range(len(classes)), target_names=classes, output_dict=True, zero_division=0)
    floor = class_floor_metrics(test_truth, test_pred, len(classes))
    below = [label for label in classes if test_report[label]["recall"] < args.class_target or test_report[label]["f1-score"] < args.class_target]
    validation_op = choose_threshold(valid_truth, valid_pred, valid_conf)
    threshold = float(validation_op["selected"]["threshold"])
    domain_metrics = {}
    for domain in sorted(set(test_domains)):
        mask = test_domains == domain
        domain_metrics[domain] = {"support": int(mask.sum()), "accuracy": float((test_truth[mask] == test_pred[mask]).mean()), "macroF1": float(f1_score(test_truth[mask], test_pred[mask], average="macro", zero_division=0))}
    matrix = confusion_matrix(test_truth, test_pred, labels=range(len(classes)))
    mistakes = [{"expected": classes[i], "predicted": classes[j], "count": int(matrix[i, j])} for i in range(len(classes)) for j in range(len(classes)) if i != j and matrix[i, j]]
    report = {
        "attempt": "T-20", "method": "validation-only per-class convex mixture coordinate search",
        "sourcePredictions": str(args.predictions), "models": list(names),
        "weightsByClass": {classes[i]: {names[m]: float(weights[i, m]) for m in range(len(names)) if weights[i, m] > 0} for i in range(len(classes))},
        "validationAfter": best, "optimizationHistory": history,
        "testAccuracy": float((test_truth == test_pred).mean()), "testMacroF1": float(f1_score(test_truth, test_pred, average="macro", zero_division=0)),
        "testByClass": test_report, "classGate": {"target": args.class_target, **floor, "belowTarget": below, "passed": not below},
        "domainMetrics": domain_metrics, "similarGroupMetrics": similar_metrics(test_truth, test_pred, classes),
        "usabilityMetrics": {"validationOperatingPoint": validation_op, "testAtValidationSelectedThreshold": threshold_metrics(test_truth, test_pred, test_conf, threshold), "continuousSequence": {"status": "not-measured", "reason": "static-image dataset"}},
        "topConfusions": sorted(mistakes, key=lambda row: row["count"], reverse=True)[:30],
        "limitations": ["Mixtures are optimized on a non-locked validation set.", "The repeatedly observed test remains development-only."],
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "evaluation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"testAccuracy": report["testAccuracy"], "testMacroF1": report["testMacroF1"], "belowTarget": len(below), "report": str(args.output_dir / 'evaluation.json')}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
