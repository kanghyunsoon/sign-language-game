"""Score a trained bundle on participants it has never seen.

Separate from `train_number_model.py` on purpose. The trainer both fits and
reports, so its numbers describe data that took part in choosing the recipe. A
locked test set only stays locked if scoring it never touches the training path,
so this script loads a finished bundle, reads a feature file, and reports. It
cannot fit anything.

The confusion matrix counts the argmax. The confirmation column counts what a
player actually experiences: `recognition-policy.json` only confirms a symbol
whose confidence clears `candidate`, so a correct digit that wins at 0.44 is not
a right answer at runtime, it is no answer at all.

    python scripts/evaluate_holdout.py --features <npz> --figure <png>
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import numpy as np

NUMBER_MODEL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(NUMBER_MODEL_ROOT))

from numbermodel.adapter import NumberModelAdapter  # noqa: E402
from numbermodel.labels import LABELS, NONE_INDEX, NUMBER_INDEXES, NUMBER_LABELS  # noqa: E402

CANDIDATE_CONFIDENCE = 0.80


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Score a bundle on held-out participants.")
    parser.add_argument("--features", type=Path, nargs="+", required=True)
    parser.add_argument("--model-dir", type=Path, default=None)
    parser.add_argument("--participants", nargs="*", default=None,
                        help="Restrict to these group ids. Default: everything in the files.")
    parser.add_argument("--figure", type=Path, default=None, help="Write a confusion-matrix PNG here")
    parser.add_argument("--report", type=Path, default=None, help="Write the metrics JSON here")
    parser.add_argument("--candidate", type=float, default=CANDIDATE_CONFIDENCE)
    parser.add_argument("--title", default="")
    return parser.parse_args()


def load(paths: list[Path], wanted: list[str] | None) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    features, labels, groups = [], [], []
    for path in paths:
        with np.load(path, allow_pickle=False) as data:
            features.append(data["features"])
            labels.append(data["labels"])
            groups.append(data["groups"] if "groups" in data else np.array([""] * len(data["labels"])))
    feature = np.concatenate(features)
    label = np.concatenate(labels).astype(str)
    group = np.concatenate(groups).astype(str)
    if wanted:
        missing = sorted(set(wanted) - set(group))
        if missing:
            raise SystemExit(f"Unknown participants requested: {missing}")
        keep = np.isin(group, wanted)
        feature, label, group = feature[keep], label[keep], group[keep]
    return feature, label, group


def confusion(truth: np.ndarray, predicted: np.ndarray, size: int) -> np.ndarray:
    matrix = np.zeros((size, size), dtype=int)
    for actual, guess in zip(truth, predicted):
        matrix[actual, guess] += 1
    return matrix


def draw(matrix: np.ndarray, rows: list[str], title: str, path: Path) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    present = [index for index in range(len(LABELS)) if matrix[index].sum() > 0]
    shown = matrix[np.ix_(present, range(len(LABELS)))]
    totals = shown.sum(axis=1, keepdims=True)
    shares = np.divide(shown, np.maximum(totals, 1))

    figure, axes = plt.subplots(figsize=(9.5, 0.62 * len(present) + 2.6))
    axes.imshow(shares, cmap="Blues", vmin=0, vmax=1, aspect="auto")
    axes.set_xticks(range(len(LABELS)), LABELS)
    axes.set_yticks(range(len(present)), [f"{LABELS[i]}  (n={matrix[i].sum()})" for i in present])
    axes.set_xlabel("predicted")
    axes.set_ylabel("actual")
    axes.set_title(title)
    for row in range(shown.shape[0]):
        for column in range(shown.shape[1]):
            count = shown[row, column]
            if count == 0:
                continue
            axes.text(column, row, str(count), ha="center", va="center",
                      fontsize=9, color="white" if shares[row, column] > 0.55 else "black")
    figure.tight_layout()
    figure.savefig(path, dpi=150)
    plt.close(figure)


def main() -> None:
    arguments = parse_args()
    adapter = NumberModelAdapter(arguments.model_dir)
    feature, label, group = load(arguments.features, arguments.participants)
    if feature.shape[1] != adapter.contract.feature_size:
        raise SystemExit(f"Feature size {feature.shape[1]} does not match the bundle's {adapter.contract.feature_size}")

    index = {name: position for position, name in enumerate(LABELS)}
    unknown = sorted(set(label) - set(index))
    if unknown:
        raise SystemExit(f"Labels outside the contract: {unknown}")
    truth = np.array([index[name] for name in label])

    probabilities = adapter.predict_features(feature)
    predicted = probabilities.argmax(axis=1)
    confident = probabilities.max(axis=1) >= arguments.candidate

    matrix = confusion(truth, predicted, len(LABELS))
    numbers = np.isin(truth, NUMBER_INDEXES)
    negatives = truth == NONE_INDEX

    per_class = {}
    for column in NUMBER_INDEXES:
        rows = truth == column
        if not rows.any():
            continue
        hit = predicted[rows] == column
        per_class[LABELS[column]] = {
            "n": int(rows.sum()),
            "recall": round(float(hit.mean()), 4),
            "confirmationRate": round(float((hit & confident[rows]).mean()), 4),
            "meanConfidence": round(float(probabilities[rows].max(axis=1).mean()), 4),
        }

    report = {
        "modelVersion": adapter.contract.model_version,
        "featureFiles": [str(path) for path in arguments.features],
        "participants": sorted(set(group.tolist())),
        "samples": int(len(truth)),
        "candidateConfidence": arguments.candidate,
        "numberAccuracy": round(float((predicted == truth)[numbers].mean()), 4) if numbers.any() else None,
        "numberConfirmationRate": round(float(((predicted == truth) & confident)[numbers].mean()), 4)
        if numbers.any() else None,
        "numberMinConfirmationRate": round(min(v["confirmationRate"] for v in per_class.values()), 4)
        if per_class else None,
        "negativeFalseConfirmationRate": round(
            float((probabilities[negatives][:, list(NUMBER_INDEXES)].max(axis=1) >= arguments.candidate).mean()), 4,
        ) if negatives.any() else None,
        "perClass": per_class,
        "perParticipant": {
            name: round(float((predicted[group == name] == truth[group == name]).mean()), 4)
            for name in sorted(set(group.tolist())) if name
        },
        "confusion": {LABELS[row]: {LABELS[col]: int(matrix[row, col]) for col in range(len(LABELS))
                                    if matrix[row, col]} for row in range(len(LABELS)) if matrix[row].sum()},
    }

    print(json.dumps(report, indent=2, ensure_ascii=False))
    if arguments.report:
        arguments.report.parent.mkdir(parents=True, exist_ok=True)
        arguments.report.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"report: {arguments.report}")
    if arguments.figure:
        title = arguments.title or (
            f"{adapter.contract.model_version} on {', '.join(sorted(set(group.tolist())))}  "
            f"n={len(truth)}  accuracy={report['numberAccuracy']}"
        )
        arguments.figure.parent.mkdir(parents=True, exist_ok=True)
        draw(matrix, list(LABELS), title, arguments.figure)
        print(f"figure: {arguments.figure}")


if __name__ == "__main__":
    main()
