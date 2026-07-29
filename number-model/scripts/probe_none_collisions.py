"""Find which negative hand shapes genuinely collide with a sign number.

Before `none` negatives can be trained on, they have to be checked. Korean sign
numbers and some jamo use the same hand shape, distinguished by context rather
than by the hand. Feeding such a shape in as `none` teaches the model a
contradiction: the same feature vector labelled both `none` and a digit.

Method: fit a numbers-only model on the number training split, then predict on
every negative frame. The model has no `none` class, so it is forced to name a
digit; the useful signal is how confident it is. A folder whose frames are
assigned one digit with high confidence is a real collision. A folder spread
thinly across many digits is a good hard negative and should be kept.

Folder identity survives the forced label because the extractor records the
original relative path, so the report is per source folder.

Read-only: prints a report and writes JSON. It trains nothing that gets saved.
"""

from __future__ import annotations

import argparse
import collections
import json
from pathlib import Path
import sys

import numpy as np
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


NUMBER_MODEL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(NUMBER_MODEL_ROOT))

from numbermodel.features import FEATURE_SIZE  # noqa: E402
from numbermodel.labels import NUMBER_LABELS  # noqa: E402


SEED = 42


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Report negative folders that collide with a sign number.")
    parser.add_argument("--number-features", type=Path, required=True)
    parser.add_argument("--none-features", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument(
        "--confidence",
        type=float,
        default=0.8,
        help="Candidate threshold from recognition-policy.json; a negative above it would be accepted",
    )
    parser.add_argument("--trees", type=int, default=500)
    parser.add_argument("--knn-neighbors", type=int, default=7)
    return parser.parse_args()


def load(path: Path) -> dict[str, np.ndarray]:
    payload = np.load(path, allow_pickle=False)
    if str(payload["featureVersion"]) != "v3":
        raise ValueError(f"{path} is not a v3 feature file")
    block = np.asarray(payload["features"], dtype=np.float32)
    if block.ndim != 2 or block.shape[1] != FEATURE_SIZE:
        raise ValueError(f"{path} holds {block.shape}; expected [samples, {FEATURE_SIZE}]")
    return {
        "features": block,
        "labels": np.asarray(payload["labels"]),
        "splits": np.asarray(payload["splits"]),
        "sources": np.asarray(payload["sources"]),
    }


def folder_of(source: str) -> str:
    parts = str(source).split("/")
    return parts[1] if len(parts) > 1 else "(root)"


def build_models(args: argparse.Namespace) -> dict[str, object]:
    return {
        "extra-trees": ExtraTreesClassifier(
            n_estimators=args.trees, max_features=0.7, min_samples_leaf=1,
            class_weight="balanced", n_jobs=-1, random_state=SEED,
        ),
        "knn": Pipeline(
            [
                ("scale", StandardScaler()),
                ("model", KNeighborsClassifier(n_neighbors=args.knn_neighbors, weights="distance")),
            ],
        ),
    }


def main() -> None:
    args = parse_args()
    numbers = load(args.number_features)
    negatives = load(args.none_features)

    train = numbers["splits"] == "train"
    index_of = {name: index for index, name in enumerate(NUMBER_LABELS)}
    unknown = sorted(set(numbers["labels"]) - set(NUMBER_LABELS))
    if unknown:
        raise ValueError(f"number features contain non-number labels: {unknown}")
    targets = np.asarray([index_of[value] for value in numbers["labels"][train]], dtype=np.int64)

    folders = np.asarray([folder_of(value) for value in negatives["sources"]])
    report: dict[str, object] = {
        "numberFeatures": str(args.number_features),
        "noneFeatures": str(args.none_features),
        "numberTrainSamples": int(train.sum()),
        "negativeSamples": int(len(folders)),
        "confidenceThreshold": args.confidence,
        "method": "numbers-only model, no none class; negatives forced onto a digit",
        "models": {},
    }

    for name, model in build_models(args).items():
        model.fit(numbers["features"][train], targets)
        probabilities = np.asarray(model.predict_proba(negatives["features"]), dtype=np.float32)
        best = probabilities.argmax(axis=1)
        confidence = probabilities.max(axis=1)

        rows = []
        for folder in sorted(set(folders.tolist())):
            mask = folders == folder
            digits = collections.Counter(NUMBER_LABELS[int(value)] for value in best[mask])
            top_digit, top_count = digits.most_common(1)[0]
            above = float((confidence[mask] >= args.confidence).mean())
            rows.append(
                {
                    "folder": folder,
                    "samples": int(mask.sum()),
                    "meanConfidence": round(float(confidence[mask].mean()), 4),
                    "maxConfidence": round(float(confidence[mask].max()), 4),
                    "aboveThresholdRate": round(above, 4),
                    "topDigit": top_digit,
                    "topDigitShare": round(top_count / int(mask.sum()), 4),
                    "digitSpread": len(digits),
                },
            )
        # Most dangerous first: often accepted, and concentrated on one digit.
        rows.sort(key=lambda row: (-row["aboveThresholdRate"], -row["topDigitShare"]))
        report["models"][name] = {
            "overallAboveThresholdRate": round(float((confidence >= args.confidence).mean()), 4),
            "overallMeanConfidence": round(float(confidence.mean()), 4),
            "folders": rows,
        }

        print(f"\n=== {name} ===")
        print(f"  전체 {args.confidence} 이상 비율: {report['models'][name]['overallAboveThresholdRate']:.1%}"
              f"   평균 확신도 {report['models'][name]['overallMeanConfidence']:.3f}")
        print(f"  {'폴더':12} {'n':>4} {'평균':>7} {'최대':>7} {'≥임계':>7} {'최다':>5} {'집중':>7} {'분산':>5}")
        for row in rows[:12]:
            print(f"  {row['folder']:12} {row['samples']:>4} {row['meanConfidence']:>7.3f} "
                  f"{row['maxConfidence']:>7.3f} {row['aboveThresholdRate']:>7.1%} "
                  f"{row['topDigit']:>5} {row['topDigitShare']:>7.1%} {row['digitSpread']:>5}")

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\nreport: {args.output}")


if __name__ == "__main__":
    main()
