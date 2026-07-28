"""Train the number-only 11-class model bundle.

Scope: 10 sign numbers plus `none`, one frame at a time, `feature_v3`. This
never reads or writes the jamo heads, so running it cannot regress the deployed
game model.

Selection follows the rule the recognition documents settled on: pick the
candidate with the highest **minimum per-number recall** on validation, and only
break ties with macro-F1. Averages hide the one class that ruins a match, and
T-124 already showed that optimising an average moves the class floor the wrong
way.

Split policy mirrors the pipeline architecture document:
  * rows carrying a participant id are split by participant, never by row;
  * public rows with no participant id are training-only, because signer
    independence cannot be asserted for them;
  * with no participant rows at all the run still works, but it is recorded as
    a not-signer-independent baseline rather than a certification.
"""

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
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


NUMBER_MODEL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(NUMBER_MODEL_ROOT))

from numbermodel.features import FEATURE_SIZE  # noqa: E402
from numbermodel.labels import LABELS, MODEL_VERSION, NONE_LABEL, NUMBER_LABELS  # noqa: E402


SEED = 42
CLASS_FLOOR = 0.93
TEN_LABEL = "10"
TEN_VARIANT_LABELS = ("10-1", "10-2")
DEFAULT_OUTPUT_DIR = NUMBER_MODEL_ROOT / "models" / MODEL_VERSION
LABEL_INDEX = {label: index for index, label in enumerate(LABELS)}
NUMBER_INDEXES = np.asarray([LABEL_INDEX[label] for label in NUMBER_LABELS])
NONE_INDEX = LABEL_INDEX[NONE_LABEL]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train the number-only 11-class frame model.")
    parser.add_argument("--features", type=Path, nargs="+", required=True, help="One or more extractor NPZ files")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--trees", type=int, default=500)
    parser.add_argument("--knn-neighbors", type=int, default=7)
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--valid-participants", default="", help="Comma separated; default is an automatic split")
    parser.add_argument("--test-participants", default="", help="Comma separated; default is an automatic split")
    parser.add_argument("--attempt-id", default="", help="Round id recorded in the evaluation file, e.g. T-150")
    parser.add_argument("--write-bundle", action="store_true", help="Write joblib and manifest, not just the report")
    parser.add_argument(
        "--ten-variants",
        action="store_true",
        help="Fit 10-1 and 10-2 as separate classes and sum them back for scoring (diagnostic)",
    )
    parser.add_argument(
        "--candidate",
        choices=("extra-trees", "knn", "mlp"),
        default="",
        help="Force one classifier instead of selecting, so a round changes one thing at a time",
    )
    return parser.parse_args()


def load_features(paths: list[Path]) -> dict[str, np.ndarray]:
    features: list[np.ndarray] = []
    labels: list[np.ndarray] = []
    splits: list[np.ndarray] = []
    groups: list[np.ndarray] = []
    sources: list[np.ndarray] = []
    origins: list[np.ndarray] = []
    for path in paths:
        payload = np.load(path, allow_pickle=False)
        version = str(payload["featureVersion"])
        if version != "v3":
            raise ValueError(f"{path} holds feature {version}; the number model requires v3")
        block = np.asarray(payload["features"], dtype=np.float32)
        if block.ndim != 2 or block.shape[1] != FEATURE_SIZE:
            raise ValueError(f"{path} holds {block.shape} features; expected [samples, {FEATURE_SIZE}]")
        source_name = str(payload["sourceName"])
        features.append(block)
        labels.append(np.asarray(payload["labels"]))
        splits.append(np.asarray(payload["splits"]))
        # Participant ids only have to be unique inside one source, so qualify
        # them before merging or two sources could collide into one signer.
        raw_groups = np.asarray(payload["groups"])
        groups.append(np.asarray([f"{source_name}:{value}" if value else "" for value in raw_groups]))
        sources.append(np.asarray(payload["sources"]))
        origins.append(np.full(len(block), source_name))
    return {
        "features": np.concatenate(features),
        "labels": np.concatenate(labels),
        "splits": np.concatenate(splits),
        "groups": np.concatenate(groups),
        "sources": np.concatenate(sources),
        "origins": np.concatenate(origins),
    }


def build_splits(data: dict[str, np.ndarray], args: argparse.Namespace) -> tuple[dict[str, np.ndarray], dict[str, object]]:
    groups = data["groups"]
    has_participant = groups != ""
    notes: dict[str, object] = {"signerIndependent": bool(has_participant.any())}

    if not has_participant.any():
        # Public-only baseline. Fall back to the provider split columns and say so.
        splits = data["splits"]
        indexes = {name: np.flatnonzero(splits == name) for name in ("train", "valid", "test")}
        if indexes["test"].size == 0:
            raise ValueError("Public-only run needs a provider test split; none of the rows are marked test")
        if indexes["valid"].size == 0:
            rng = np.random.default_rng(args.seed)
            train_index = indexes["train"]
            shuffled = rng.permutation(train_index)
            cut = max(1, int(round(len(shuffled) * 0.15)))
            indexes["valid"], indexes["train"] = shuffled[:cut], shuffled[cut:]
            notes["validCarvedFromTrain"] = True
        notes["policy"] = "provider splits; NOT signer-independent, baseline only"
        return indexes, notes

    participants = sorted({value for value in groups[has_participant]})
    selected_valid = [name for name in args.valid_participants.split(",") if name]
    selected_test = [name for name in args.test_participants.split(",") if name]
    if not selected_test:
        rng = np.random.default_rng(args.seed)
        shuffled = list(rng.permutation(np.asarray(participants)))
        if len(shuffled) < 3:
            raise ValueError(f"Participant split needs at least 3 participants, got {len(shuffled)}")
        selected_test = [str(shuffled[0])]
        selected_valid = selected_valid or [str(shuffled[1])]
    unknown = [name for name in selected_valid + selected_test if name not in participants]
    if unknown:
        raise ValueError(f"Unknown participants requested: {unknown}")
    if set(selected_valid) & set(selected_test):
        raise ValueError("A participant cannot be in both validation and test")

    valid_mask = np.isin(groups, selected_valid)
    test_mask = np.isin(groups, selected_test)
    # Public rows have no signer identity, so they may only ever train.
    train_mask = ~(valid_mask | test_mask)
    indexes = {
        "train": np.flatnonzero(train_mask),
        "valid": np.flatnonzero(valid_mask),
        "test": np.flatnonzero(test_mask),
    }
    notes |= {
        "policy": "participant-held-out; public rows are training-only",
        "participants": participants,
        "validParticipants": selected_valid,
        "testParticipants": selected_test,
        "publicTrainingRows": int((~has_participant).sum()),
    }
    return indexes, notes


def encode_labels(labels: np.ndarray) -> np.ndarray:
    unknown = sorted(set(labels) - set(LABELS))
    if unknown:
        raise ValueError(f"Extractor produced labels outside the contract: {unknown}")
    return np.asarray([LABEL_INDEX[value] for value in labels], dtype=np.int64)


def build_candidates(args: argparse.Namespace) -> dict[str, object]:
    """Only the three families the recorded number probe found worth testing."""
    return {
        "extra-trees": ExtraTreesClassifier(
            n_estimators=args.trees,
            max_features=0.7,
            min_samples_leaf=1,
            class_weight="balanced",
            n_jobs=-1,
            random_state=args.seed,
        ),
        # feature_v3 mixes unit vectors with degrees, so distance and gradient
        # based models need the scale removed first; trees do not care.
        "knn": Pipeline(
            [
                ("scale", StandardScaler()),
                ("model", KNeighborsClassifier(n_neighbors=args.knn_neighbors, weights="distance")),
            ],
        ),
        "mlp": Pipeline(
            [
                ("scale", StandardScaler()),
                (
                    "model",
                    MLPClassifier(
                        hidden_layer_sizes=(128, 64),
                        alpha=1e-3,
                        max_iter=600,
                        early_stopping=True,
                        n_iter_no_change=20,
                        random_state=args.seed,
                    ),
                ),
            ],
        ),
    }


def build_internal_labels(split_ten: bool) -> list[str]:
    """Label space the model is fitted on, which may be finer than the contract."""
    if not split_ten:
        return list(LABELS)
    expanded: list[str] = []
    for label in LABELS:
        expanded.extend(TEN_VARIANT_LABELS if label == TEN_LABEL else [label])
    return expanded


def encode_targets(data: dict[str, np.ndarray], internal_labels: list[str]) -> np.ndarray:
    """Encode rows against the internal label space.

    With `10` split, the variant is recovered from the source path rather than
    from a second extraction pass: the extractor already records the original
    relative path, whose second component is the capture folder.
    """
    index_of = {name: index for index, name in enumerate(internal_labels)}
    unknown = sorted(set(data["labels"]) - set(LABELS))
    if unknown:
        raise ValueError(f"Extractor produced labels outside the contract: {unknown}")
    if TEN_LABEL in index_of:
        return np.asarray([index_of[value] for value in data["labels"]], dtype=np.int64)

    targets: list[int] = []
    for label, source in zip(data["labels"], data["sources"]):
        if label != TEN_LABEL:
            targets.append(index_of[label])
            continue
        parts = str(source).split("/")
        variant = parts[1] if len(parts) > 1 else ""
        if variant not in index_of:
            raise ValueError(f"'{TEN_LABEL}' row has no recognizable variant folder: {source}")
        targets.append(index_of[variant])
    return np.asarray(targets, dtype=np.int64)


def contract_probabilities(
    model: object, features: np.ndarray, internal_labels: list[str],
) -> np.ndarray:
    """Predict, then map the internal label space back onto the 11-label contract.

    Two corrections happen here. A class with no training support is absent from
    `classes_`, so the raw columns are narrower and shifted; scoring that array
    would credit the wrong symbols. And when `10` is trained as two variants,
    their probabilities are summed so every round is scored in the same space
    and stays comparable across rounds.
    """
    raw = np.asarray(model.predict_proba(features), dtype=np.float32)
    classes = np.asarray(getattr(model, "classes_", np.arange(len(internal_labels))))
    wide = np.zeros((len(raw), len(internal_labels)), dtype=np.float32)
    wide[:, classes] = raw
    if internal_labels == list(LABELS):
        return wide
    fold = np.asarray(
        [LABELS.index(TEN_LABEL if name in TEN_VARIANT_LABELS else name) for name in internal_labels],
    )
    folded = np.zeros((len(raw), len(LABELS)), dtype=np.float32)
    np.add.at(folded.T, fold, wide.T)
    return folded


def score(truth: np.ndarray, probabilities: np.ndarray) -> dict[str, object]:
    predicted = probabilities.argmax(axis=1)
    indexes = np.arange(len(LABELS))
    precision, recall, f1, support = precision_recall_fscore_support(
        truth, predicted, labels=indexes, zero_division=0,
    )
    number_recall = recall[NUMBER_INDEXES]
    number_f1 = f1[NUMBER_INDEXES]
    below = [
        LABELS[int(index)]
        for offset, index in enumerate(NUMBER_INDEXES)
        if number_recall[offset] < CLASS_FLOOR or number_f1[offset] < CLASS_FLOOR
    ]
    matrix = confusion_matrix(truth, predicted, labels=indexes)
    true_none = int(support[NONE_INDEX])
    true_numbers = int(support[NUMBER_INDEXES].sum())
    none_accepted = int(matrix[NONE_INDEX][NUMBER_INDEXES].sum())
    numbers_rejected = int(matrix[np.ix_(NUMBER_INDEXES, [NONE_INDEX])].sum())
    return {
        "samples": int(len(truth)),
        "accuracy": round(float(accuracy_score(truth, predicted)), 6),
        "macroF1": round(float(f1.mean()), 6),
        "numberMacroF1": round(float(number_f1.mean()), 6),
        "numberMacroRecall": round(float(number_recall.mean()), 6),
        "numberMinRecall": round(float(number_recall.min()), 6),
        "classesBelowFloor": below,
        "classesBelowFloorCount": len(below),
        "noneFalseAcceptRate": round(none_accepted / true_none, 6) if true_none else None,
        "numberRejectedAsNoneRate": round(numbers_rejected / true_numbers, 6) if true_numbers else None,
        # 9 and 8 are the pair every recorded round bottomed out on.
        "ninePredictedAsEight": int(matrix[LABEL_INDEX["9"]][LABEL_INDEX["8"]]),
        "eightPredictedAsNine": int(matrix[LABEL_INDEX["8"]][LABEL_INDEX["9"]]),
        "classes": [
            {
                "label": label,
                "precision": round(float(precision[index]), 6),
                "recall": round(float(recall[index]), 6),
                "f1": round(float(f1[index]), 6),
                "support": int(support[index]),
            }
            for index, label in enumerate(LABELS)
        ],
        "confusionMatrix": matrix.tolist(),
    }


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    args = parse_args()
    if args.ten_variants and args.write_bundle:
        raise ValueError(
            "--ten-variants fits 12 classes, which the adapter rejects. It is a diagnostic mode; "
            "drop --write-bundle.",
        )
    data = load_features(list(args.features))
    internal_labels = build_internal_labels(args.ten_variants)
    # Truth stays in the 11-label contract even when the model is fitted finer,
    # so every round is scored in the same space.
    targets = encode_labels(data["labels"])
    fit_targets = encode_targets(data, internal_labels)
    indexes, split_notes = build_splits(data, args)

    train_fit_targets = fit_targets[indexes["train"]]
    present = set(train_fit_targets.tolist())
    missing = [name for index, name in enumerate(internal_labels) if index not in present]
    if missing and args.write_bundle:
        # A published bundle must cover the whole contract, because the adapter
        # verifies that classes_ spans every label. A diagnostic round may not:
        # the public number sources carry no `none` examples at all.
        raise ValueError(
            f"A bundle needs training support for every class; missing: {missing}. "
            "Run without --write-bundle for a diagnostic round, or add the missing data.",
        )
    if missing:
        print(f"WARNING: no training support for {missing}; report-only round", flush=True)

    features = data["features"]
    results: dict[str, dict[str, object]] = {}
    fitted: dict[str, object] = {}
    for name, candidate in build_candidates(args).items():
        started = time.perf_counter()
        candidate.fit(features[indexes["train"]], train_fit_targets)
        seconds = time.perf_counter() - started
        probabilities = contract_probabilities(candidate, features[indexes["valid"]], internal_labels)
        results[name] = score(targets[indexes["valid"]], probabilities) | {"trainingSeconds": round(seconds, 3)}
        fitted[name] = candidate
        print(
            f"{name}: validation minRecall={results[name]['numberMinRecall']} "
            f"macroF1={results[name]['macroF1']} below={results[name]['classesBelowFloorCount']}",
            flush=True,
        )

    # Class floor first, macro-F1 only as a tie-break. A forced candidate skips
    # selection so that a round comparing something else does not also swap the
    # classifier underneath the comparison.
    if args.candidate:
        selected = args.candidate
        print(f"candidate forced to {selected}; selection skipped", flush=True)
    else:
        selected = max(results, key=lambda name: (results[name]["numberMinRecall"], results[name]["macroF1"]))
    model = fitted[selected]

    started = time.perf_counter()
    test_probabilities = contract_probabilities(model, features[indexes["test"]], internal_labels)
    latency_ms = (time.perf_counter() - started) * 1000 / max(1, len(indexes["test"]))
    test_report = score(targets[indexes["test"]], test_probabilities)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    report = {
        "attemptId": args.attempt_id,
        "modelVersion": MODEL_VERSION,
        "seed": args.seed,
        "labels": list(LABELS),
        "featureVersion": "v3",
        "featureSize": FEATURE_SIZE,
        "frameInput": True,
        "missingTrainClasses": missing,
        "labelGranularity": "10-1/10-2 split, summed for scoring" if args.ten_variants else "10 merged",
        "internalLabels": internal_labels,
        "selectionRule": (
            f"forced to {args.candidate}"
            if args.candidate
            else "maximize validation numberMinRecall, then macroF1"
        ),
        "selectedCandidate": selected,
        "candidateValidation": results,
        "split": split_notes
        | {name: int(len(value)) for name, value in indexes.items()}
        | {"sources": sorted(set(data["origins"].tolist()))},
        "meanBatchInferenceMsPerSample": round(latency_ms, 4),
        "test": test_report,
        "targetMet": (
            test_report["classesBelowFloorCount"] == 0
            and bool(split_notes["signerIndependent"])
            and not missing
        ),
    }
    report_path = args.output_dir / "evaluation.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if args.write_bundle:
        model_path = args.output_dir / "number-10.joblib"
        joblib.dump(model, model_path, compress=3)
        manifest = {
            "schemaVersion": 1,
            "modelVersion": MODEL_VERSION,
            "format": f"sklearn-{selected}",
            "artifact": model_path.name,
            "sha256": sha256(model_path),
            "labels": list(LABELS),
            "featureVersion": "v3",
            "featureSize": FEATURE_SIZE,
            "frameInput": True,
            "datasets": sorted(set(data["origins"].tolist())),
            "evaluation": report_path.name,
        }
        (args.output_dir / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8",
        )
        print(f"bundle written: {model_path}")
    else:
        print("report only; pass --write-bundle to publish a loadable model bundle")

    print(json.dumps({key: value for key, value in report.items() if key != "candidateValidation"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
