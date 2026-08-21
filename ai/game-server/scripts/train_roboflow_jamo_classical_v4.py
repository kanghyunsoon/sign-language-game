"""T-08: validation-selected classical classifiers for MediaPipe v4 features."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path

requested_gpu = os.environ.get("CUDA_VISIBLE_DEVICES")
if requested_gpu not in (None, "2"):
    raise RuntimeError(f"Physical GPU 2 is required, got CUDA_VISIBLE_DEVICES={requested_gpu!r}")
os.environ["CUDA_VISIBLE_DEVICES"] = "2"

import numpy as np
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC


SIMILAR_GROUPS = {
    "siot-yu": ("ㅅ", "ㅠ"),
    "yeo-ye": ("ㅕ", "ㅖ"),
    "e-ye": ("ㅔ", "ㅖ"),
    "a-o": ("ㅏ", "ㅗ"),
    "yo-ya": ("ㅛ", "ㅑ"),
    "rieul-tieut": ("ㄹ", "ㅌ"),
    "jieut-siot-chieut": ("ㅈ", "ㅅ", "ㅊ"),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", type=Path, required=True)
    parser.add_argument("--secondary-features", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=43)
    parser.add_argument("--baseline-accuracy", type=float, default=0.7368421052631579)
    parser.add_argument("--attempt-id", default="T-08")
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def score(truth: np.ndarray, predicted: np.ndarray) -> tuple[float, float, float]:
    accuracy = float((truth == predicted).mean())
    macro_f1 = float(f1_score(truth, predicted, average="macro", zero_division=0))
    return accuracy, macro_f1, 0.45 * accuracy + 0.55 * macro_f1


def accuracy_slice(truth: np.ndarray, predicted: np.ndarray, mask: np.ndarray) -> dict[str, float | int | None]:
    support = int(mask.sum())
    return {"support": support, "accuracy": float((truth[mask] == predicted[mask]).mean()) if support else None}


def categorical_slices(truth: np.ndarray, predicted: np.ndarray, values: np.ndarray) -> dict[str, dict[str, float | int | None]]:
    return {str(value): accuracy_slice(truth, predicted, values == value) for value in sorted(set(values.astype(str)))}


def similar_group_metrics(truth: np.ndarray, predicted: np.ndarray, classes: tuple[str, ...]) -> dict[str, dict[str, object]]:
    label_truth = np.asarray([classes[index] for index in truth])
    label_predicted = np.asarray([classes[index] for index in predicted])
    result = {}
    for name, labels in SIMILAR_GROUPS.items():
        mask = np.isin(label_truth, labels)
        within = mask & (label_truth != label_predicted) & np.isin(label_predicted, labels)
        result[name] = {
            "labels": list(labels),
            **accuracy_slice(truth, predicted, mask),
            "withinGroupConfusions": int(within.sum()),
            "withinGroupConfusionRate": float(within.sum() / mask.sum()) if mask.sum() else None,
        }
    return result


def threshold_metrics(truth: np.ndarray, predicted: np.ndarray, confidence: np.ndarray, threshold: float) -> dict[str, float | int | None]:
    accepted = confidence >= threshold
    count = int(accepted.sum())
    correct = truth == predicted
    return {
        "threshold": threshold,
        "accepted": count,
        "coverage": float(accepted.mean()),
        "acceptedAccuracy": float(correct[accepted].mean()) if count else None,
        "falseConfirmationRateAllSamples": float((accepted & ~correct).mean()),
    }


def choose_threshold(truth: np.ndarray, predicted: np.ndarray, confidence: np.ndarray) -> dict[str, object]:
    sweep = [threshold_metrics(truth, predicted, confidence, float(v)) for v in np.arange(0.50, 0.951, 0.025)]
    eligible = [row for row in sweep if row["acceptedAccuracy"] is not None and row["acceptedAccuracy"] >= 0.90]
    selected = max(eligible, key=lambda row: (row["coverage"], -row["threshold"])) if eligible else max(sweep, key=lambda row: row["acceptedAccuracy"] or 0.0)
    return {"targetAcceptedAccuracy": 0.90, "selected": selected, "sweep": sweep}


def candidates(seed: int, feature_size: int, expanded_search: bool) -> list[tuple[str, object]]:
    models = [
        ("extra-trees-sqrt", ExtraTreesClassifier(n_estimators=900, max_features="sqrt", min_samples_leaf=1, class_weight="balanced", n_jobs=-1, random_state=seed)),
        ("extra-trees-0.7", ExtraTreesClassifier(n_estimators=900, max_features=0.7, min_samples_leaf=1, class_weight="balanced", n_jobs=-1, random_state=seed)),
        ("extra-trees-leaf2", ExtraTreesClassifier(n_estimators=900, max_features=0.7, min_samples_leaf=2, class_weight="balanced", n_jobs=-1, random_state=seed)),
        ("rbf-svc-c2", make_pipeline(StandardScaler(), SVC(C=2.0, kernel="rbf", class_weight="balanced", probability=True, random_state=seed))),
        ("rbf-svc-c8", make_pipeline(StandardScaler(), SVC(C=8.0, kernel="rbf", class_weight="balanced", probability=True, random_state=seed))),
        ("rbf-svc-c32", make_pipeline(StandardScaler(), SVC(C=32.0, kernel="rbf", class_weight="balanced", probability=True, random_state=seed))),
    ]
    if expanded_search:
        base_gamma = 1.0 / feature_size
        for c_value in (4.0, 16.0, 64.0):
            for multiplier in (0.25, 0.5, 2.0):
                name = f"rbf-svc-c{int(c_value)}-gamma{multiplier:g}x"
                models.append((name, make_pipeline(StandardScaler(), SVC(C=c_value, gamma=base_gamma * multiplier, kernel="rbf", class_weight="balanced", probability=True, random_state=seed))))
    return models


def main() -> None:
    args = parse_args()
    payload = np.load(args.features)
    features = payload["features"].astype(np.float32)
    if features.ndim != 3 or features.shape[1:] != (10, 351):
        raise RuntimeError(f"Expected [samples, 10, 351], got {features.shape}")
    x = features[:, 0]
    labels = payload["labels"].astype(str)
    splits = payload["splits"].astype(str)
    handedness = payload["handedness"].astype(str)
    if args.secondary_features:
        secondary = np.load(args.secondary_features)
        secondary_features = secondary["features"].astype(np.float32)
        if secondary_features.ndim != 3 or secondary_features.shape[:2] != features.shape[:2]:
            raise RuntimeError(f"Secondary features do not align: {secondary_features.shape} vs {features.shape}")
        for key in ("labels", "splits", "sources", "handedness"):
            if not np.array_equal(payload[key].astype(str), secondary[key].astype(str)):
                raise RuntimeError(f"Secondary artifact differs for {key}")
        x = np.concatenate((x, secondary_features[:, 0]), axis=1)
    classes = tuple(sorted(set(labels)))
    class_to_index = {label: index for index, label in enumerate(classes)}
    y = np.asarray([class_to_index[label] for label in labels], dtype=np.int64)
    indexes = {name: np.flatnonzero(splits == name) for name in ("train", "valid", "test")}
    train, valid, test = indexes["train"], indexes["valid"], indexes["test"]

    leaderboard = []
    fitted = {}
    validation_outputs = {}
    for name, model in candidates(args.seed, x.shape[1], args.secondary_features is not None):
        model.fit(x[train], y[train])
        predicted = model.predict(x[valid])
        confidence = model.predict_proba(x[valid]).max(axis=1)
        accuracy, macro_f1, selection_score = score(y[valid], predicted)
        row = {"model": name, "validationAccuracy": accuracy, "validationMacroF1": macro_f1, "selectionScore": selection_score}
        leaderboard.append(row)
        fitted[name] = model
        validation_outputs[name] = (predicted, confidence)
        print(json.dumps(row), flush=True)
    leaderboard.sort(key=lambda row: row["selectionScore"], reverse=True)
    selected_name = leaderboard[0]["model"]
    model = fitted[selected_name]
    valid_predicted, valid_confidence = validation_outputs[selected_name]
    validation_operating_point = choose_threshold(y[valid], valid_predicted, valid_confidence)

    # Refit the validation-selected model on train+validation; the test partition is touched once.
    combined = np.concatenate((train, valid))
    model.fit(x[combined], y[combined])
    test_predicted = model.predict(x[test])
    test_probabilities = model.predict_proba(x[test])
    test_confidence = test_probabilities.max(axis=1)
    test_accuracy, test_macro_f1, _ = score(y[test], test_predicted)
    threshold = float(validation_operating_point["selected"]["threshold"])

    matrix = confusion_matrix(y[test], test_predicted, labels=range(len(classes)))
    mistakes = []
    for expected in range(len(classes)):
        for observed in range(len(classes)):
            if expected != observed and matrix[expected, observed]:
                mistakes.append({"expected": classes[expected], "predicted": classes[observed], "count": int(matrix[expected, observed])})
    mistakes.sort(key=lambda row: row["count"], reverse=True)

    middle_y = payload["vertical_direction_y"][test]
    vertical = np.where(middle_y <= -0.15, "fingers-up", np.where(middle_y >= 0.15, "fingers-down", "sideways"))
    normal_z = payload["palm_normal_z"][test]
    palm = np.where(normal_z >= 0.20, "normal-z-positive", np.where(normal_z <= -0.20, "normal-z-negative", "edge-on"))
    report = {
        "experiment": f"roboflow-jamo-static-mediapipe-v4-{args.attempt_id.lower()}-classical-selection",
        "attempt": {"attemptId": args.attempt_id, "seed": args.seed, "selection": "validation 0.55 macro-F1 + 0.45 accuracy", "selectedModel": selected_name},
        "dataset": {"source": "Roboflow Sign Language v1", "sourceUrl": "https://universe.roboflow.com/-q9ifs/sign-language-2hatp/dataset/1", "license": "CC BY 4.0", "acceptedLandmarkSamples": int(len(x)), "featureArtifact": str(args.features), "featureArtifactSha256": sha256(args.features), "splitPolicy": "source-provided train/valid/test; not signer-independent", "augmentationCaveat": "source export includes augmentation; static images only"},
        "physicalGpuRestriction": 2,
        "techniques": [f"{x.shape[1]}-value combined MediaPipe feature", "validation-only selection across ExtraTrees and RBF-SVM candidates", "class-balanced candidates", "refit selected family on train+validation before one test evaluation"],
        "samples": {name: int(len(part)) for name, part in indexes.items()},
        "classes": list(classes),
        "candidateLeaderboard": leaderboard,
        "baselineTestAccuracy": args.baseline_accuracy,
        "testAccuracy": test_accuracy,
        "testAccuracyDeltaPercentagePoints": (test_accuracy - args.baseline_accuracy) * 100.0,
        "testMacroF1": test_macro_f1,
        "testByClass": classification_report(y[test], test_predicted, labels=range(len(classes)), target_names=classes, output_dict=True, zero_division=0),
        "similarGroupMetrics": similar_group_metrics(y[test], test_predicted, classes),
        "conditionMetrics": {
            "detectedHandedness": {"evidenceLevel": "MediaPipe-detected, not annotated", "slices": categorical_slices(y[test], test_predicted, handedness[test])},
            "verticalOrientationProxy": {"evidenceLevel": "landmark-derived proxy, not annotated ground truth", "slices": categorical_slices(y[test], test_predicted, vertical)},
            "palmFacingProxy": {"evidenceLevel": "palm-normal proxy, not annotated ground truth", "slices": categorical_slices(y[test], test_predicted, palm)},
        },
        "usabilityMetrics": {
            "validationOperatingPoint": validation_operating_point,
            "testAtValidationSelectedThreshold": threshold_metrics(y[test], test_predicted, test_confidence, threshold),
            "continuousSequence": {"status": "not-measured", "reason": "static-image source has no continuous fingerspelling sequence"},
        },
        "topConfusions": mistakes[:30],
        "importantLimitations": ["Test split is not signer-independent.", "Landmark detection failures are outside classifier accuracy.", "Palm/back and up/down buckets are proxies.", "Continuous sequence metrics are unavailable."],
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "evaluation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"selectedModel": selected_name, "testAccuracy": test_accuracy, "testMacroF1": test_macro_f1, "deltaPercentagePoints": report["testAccuracyDeltaPercentagePoints"], "report": str(args.output_dir / "evaluation.json")}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
