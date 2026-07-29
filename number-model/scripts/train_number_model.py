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

from numbermodel.adapter import COMPOSITION, compose_soft  # noqa: E402
from numbermodel.features import FEATURE_SIZE  # noqa: E402
from numbermodel.labels import (  # noqa: E402
    LABEL_INDEX,
    LABELS,
    MODEL_VERSION,
    NONE_LABEL,
    NUMBER_LABELS,
)
from numbermodel.labels import NONE_INDEX as _NONE_INDEX  # noqa: E402
from numbermodel.labels import NUMBER_INDEXES as _NUMBER_INDEXES  # noqa: E402


SEED = 42
CLASS_FLOOR = 0.93
# The frontend decoder only confirms above this, so it is the bar that decides
# whether a player actually scores. Kept in step with recognition-policy.json.
CANDIDATE_CONFIDENCE = 0.80
TEN_LABEL = "10"
TEN_VARIANT_LABELS = ("10-1", "10-2")
DEFAULT_OUTPUT_DIR = NUMBER_MODEL_ROOT / "models" / MODEL_VERSION
NUMBER_INDEXES = np.asarray(_NUMBER_INDEXES)
NONE_INDEX = _NONE_INDEX

# The gate rejects non-numbers, the head separates digits. Measured on held-out
# data ExtraTrees rejects about six times better while KNN separates digits
# better, so each is used where it is strong rather than tuned harder.
GATE_CANDIDATE = "extra-trees"
HEAD_CANDIDATE = "knn"
HYBRID_NAME = "hybrid-gate-head"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train the number-only 11-class frame model.")
    parser.add_argument("--features", type=Path, nargs="+", required=True, help="One or more extractor NPZ files")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--trees", type=int, default=500)
    parser.add_argument(
        "--max-features", type=float, default=0.7,
        help="ExtraTrees max_features. 0.3 measured slightly fewer false confirmations than 0.7.",
    )
    parser.add_argument(
        "--none-sample", type=int, default=0,
        help="Keep at most N negative training rows (0 = all). Negatives crowd out the digits: at "
             "0.76x the digit count the mean worst-class recall was 0.646, at 0.15x it was 0.917.",
    )
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
    parser.add_argument(
        "--hybrid",
        action="store_true",
        help="Fit an ExtraTrees rejection gate plus a KNN digit head and compose them, instead of "
             "picking one classifier. Writes a two-component bundle.",
    )
    parser.add_argument(
        "--none-holdout-fraction",
        type=float,
        default=0.0,
        help="Hold out this share of negative source folders (whole jamo at a time) for valid and test. "
             "Rejection has to generalise to hand shapes never trained on, so holding out entire "
             "folders measures the thing that matters instead of reshuffling within known shapes.",
    )
    parser.add_argument(
        "--drop-source-folders",
        default="",
        help="Comma separated source folder names to exclude, e.g. negatives whose hand shape "
             "collides with a digit. Folder names come from the second path component in `sources`.",
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


def hold_out_none_folders(
    indexes: dict[str, np.ndarray], data: dict[str, np.ndarray], args: argparse.Namespace,
    notes: dict[str, object],
) -> None:
    """Move whole negative source folders out of training, into valid and test.

    Negatives come from public sources with no signer id, so the participant rule
    keeps them in training and rejection ends up unmeasured on held-out data.
    Splitting them by *hand shape* rather than by signer is also the more honest
    test: what matters at runtime is refusing a shape the model has never been
    trained on, not refusing another sample of a shape it already knows.

    Folder selection is deterministic from the seed so a round is reproducible.
    Mutates `indexes` in place.
    """
    if args.none_holdout_fraction <= 0:
        return
    labels = data["labels"]
    none_rows = labels == NONE_LABEL
    if not none_rows.any():
        return
    folders = np.asarray([str(v).split("/")[1] if "/" in str(v) else "" for v in data["sources"]])
    available = sorted({name for name in folders[none_rows] if name})
    if len(available) < 4:
        raise ValueError(f"Need at least 4 negative folders to hold any out; found {available}")

    count = max(2, int(round(len(available) * args.none_holdout_fraction)))
    chosen = sorted(np.random.default_rng(args.seed).permutation(np.asarray(available))[:count].tolist())
    # Alternate so neither split gets a run of similar shapes from the sorted order.
    to_valid, to_test = chosen[0::2], chosen[1::2]

    for name, group in (("valid", to_valid), ("test", to_test)):
        moved = np.flatnonzero(none_rows & np.isin(folders, group))
        if moved.size == 0:
            continue
        indexes[name] = np.sort(np.concatenate([indexes[name], moved]))
        indexes["train"] = np.sort(indexes["train"][~np.isin(indexes["train"], moved)])
    notes |= {
        "noneHoldoutPolicy": "whole source folders held out; measures rejection of unseen hand shapes",
        "noneHoldoutValidFolders": to_valid,
        "noneHoldoutTestFolders": to_test,
    }
    print(f"held out negative folders -> valid {to_valid}, test {to_test}", flush=True)


def top_up_valid(
    indexes: dict[str, np.ndarray], labels: np.ndarray, seed: int, notes: dict[str, object],
) -> None:
    """Make sure validation covers every label that training has.

    Sources rarely agree on split columns. The number source ships train/test
    only while the negative source ships train/valid/test, so merging them left
    validation holding nothing but `none` and every digit metric reading zero.
    Candidate selection would then be decided by a split that cannot see the
    digits at all.

    Missing labels are topped up from train, per label, so selection always sees
    the whole contract. Mutates `indexes` in place.
    """
    train_labels = set(labels[indexes["train"]].tolist())
    missing = sorted(train_labels - set(labels[indexes["valid"]].tolist()))
    if not missing:
        return
    rng = np.random.default_rng(seed)
    moved: list[np.ndarray] = []
    keep = indexes["train"]
    for label in missing:
        candidates = keep[labels[keep] == label]
        if candidates.size == 0:
            continue
        count = max(1, int(round(candidates.size * 0.15)))
        chosen = rng.permutation(candidates)[:count]
        moved.append(chosen)
        keep = keep[~np.isin(keep, chosen)]
    if not moved:
        return
    indexes["valid"] = np.sort(np.concatenate([indexes["valid"], *moved]))
    indexes["train"] = np.sort(keep)
    notes["validToppedUpLabels"] = missing
    notes["validToppedUpRows"] = int(sum(len(block) for block in moved))
    print(f"validation topped up with {notes['validToppedUpRows']} rows for {missing}", flush=True)


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
        top_up_valid(indexes, data["labels"], args.seed, notes)
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
    hold_out_none_folders(indexes, data, args, notes)
    # A public-only label such as `none` would otherwise never reach validation,
    # because rows without a signer id are training-only.
    top_up_valid(indexes, data["labels"], args.seed, notes)
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
            max_features=args.max_features,
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


def confirmation_metrics(truth: np.ndarray, probabilities: np.ndarray) -> dict[str, object]:
    """Rates at the confidence the frontend actually confirms on.

    argmax recall overstates what a player experiences. `recognition-policy.json`
    only confirms a symbol whose confidence clears `candidate`, so a frame whose
    correct digit wins at 0.44 is not a correct answer at runtime — it is no
    answer at all. Rejection is the mirror image: a negative only becomes a wrong
    confirmation if some digit clears the same bar.
    """
    predicted = probabilities.argmax(axis=1)
    confident = probabilities.max(axis=1) >= CANDIDATE_CONFIDENCE
    numbers = np.isin(truth, NUMBER_INDEXES)
    negatives = truth == NONE_INDEX
    digit_columns = np.asarray(NUMBER_INDEXES)

    per_class = {}
    for column in NUMBER_INDEXES:
        rows = truth == column
        if not rows.any():
            continue
        per_class[LABELS[column]] = round(
            float(((predicted[rows] == column) & confident[rows]).mean()), 6,
        )
    accepted_negative = (
        float((probabilities[negatives][:, digit_columns].max(axis=1) >= CANDIDATE_CONFIDENCE).mean())
        if negatives.any() else None
    )
    return {
        "candidateConfidence": CANDIDATE_CONFIDENCE,
        "numberConfirmationRate": round(float(((predicted == truth) & confident)[numbers].mean()), 6)
        if numbers.any() else None,
        "numberMinConfirmationRate": round(min(per_class.values()), 6) if per_class else None,
        "perClassConfirmationRate": per_class,
        # A negative that clears the bar on some digit is a false confirmation.
        "negativeFalseConfirmationRate": round(accepted_negative, 6) if accepted_negative is not None else None,
        "meanConfidenceOnNumbers": round(float(probabilities[numbers].max(axis=1).mean()), 6)
        if numbers.any() else None,
    }


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
        "confirmation": confirmation_metrics(truth, probabilities),
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
    dropped = [name for name in args.drop_source_folders.split(",") if name]
    drop_report: dict[str, object] = {"droppedSourceFolders": dropped}
    if dropped:
        folders = np.asarray([str(value).split("/")[1] if "/" in str(value) else "" for value in data["sources"]])
        keep = ~np.isin(folders, dropped)
        missing_folders = sorted(set(dropped) - set(folders.tolist()))
        if missing_folders:
            raise ValueError(f"--drop-source-folders names no rows: {missing_folders}")
        drop_report["droppedRows"] = int((~keep).sum())
        data = {key: value[keep] for key, value in data.items()}
        print(f"dropped {drop_report['droppedRows']} rows from folders {dropped}", flush=True)
    if args.none_sample > 0:
        # Negatives crowd out the digits when they dominate training, so the count
        # is capped rather than left at whatever the source happened to provide.
        none_rows = np.flatnonzero(data["labels"] == NONE_LABEL)
        if none_rows.size > args.none_sample:
            drop = np.random.default_rng(args.seed).permutation(none_rows)[args.none_sample:]
            keep_mask = np.ones(len(data["labels"]), dtype=bool)
            keep_mask[drop] = False
            data = {key: value[keep_mask] for key, value in data.items()}
            drop_report["noneSampledTo"] = args.none_sample
            print(f"negatives capped at {args.none_sample} rows", flush=True)
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
    if args.hybrid:
        selected = HYBRID_NAME
        print(f"composing {GATE_CANDIDATE} gate with {HEAD_CANDIDATE} head", flush=True)
    elif args.candidate:
        selected = args.candidate
        print(f"candidate forced to {selected}; selection skipped", flush=True)
    else:
        selected = max(results, key=lambda name: (results[name]["numberMinRecall"], results[name]["macroF1"]))
    model = None if args.hybrid else fitted[selected]

    def predict(rows: np.ndarray) -> np.ndarray:
        if not args.hybrid:
            return contract_probabilities(model, rows, internal_labels)
        # compose_soft comes from the adapter, so the measured composition and the
        # deployed one cannot drift apart.
        return compose_soft(
            contract_probabilities(fitted[GATE_CANDIDATE], rows, internal_labels),
            contract_probabilities(fitted[HEAD_CANDIDATE], rows, internal_labels),
        )

    if args.hybrid:
        results[HYBRID_NAME] = score(targets[indexes["valid"]], predict(features[indexes["valid"]]))

    started = time.perf_counter()
    test_probabilities = predict(features[indexes["test"]])
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
        | drop_report
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
        shared = {
            "schemaVersion": 1,
            "modelVersion": MODEL_VERSION,
            "labels": list(LABELS),
            "featureVersion": "v3",
            "featureSize": FEATURE_SIZE,
            "frameInput": True,
        }
        if args.hybrid:
            components = []
            for role, name, filename in (
                ("gate", GATE_CANDIDATE, "number-gate.joblib"),
                ("head", HEAD_CANDIDATE, "number-head.joblib"),
            ):
                path = args.output_dir / filename
                joblib.dump(fitted[name], path, compress=3)
                components.append(
                    {"role": role, "artifact": filename, "sha256": sha256(path), "format": f"sklearn-{name}"},
                )
            manifest = shared | {
                "format": "hybrid-gate-head",
                "components": components,
                "composition": COMPOSITION,
            }
            # A stale single-artifact file would be silently ignored by the adapter
            # but would still look like the model to a human reading the folder.
            stale = args.output_dir / "number-10.joblib"
            if stale.exists():
                stale.unlink()
                print(f"removed stale {stale.name} from an earlier single-model bundle", flush=True)
        else:
            model_path = args.output_dir / "number-10.joblib"
            joblib.dump(model, model_path, compress=3)
            manifest = shared | {"format": f"sklearn-{selected}", "artifact": model_path.name, "sha256": sha256(model_path)}
            for stale_name in ("number-gate.joblib", "number-head.joblib"):
                stale = args.output_dir / stale_name
                if stale.exists():
                    stale.unlink()
                    print(f"removed stale {stale_name} from an earlier hybrid bundle", flush=True)
        manifest |= {
            "datasets": sorted(set(data["origins"].tolist())),
            "evaluation": report_path.name,
        }
        (args.output_dir / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8",
        )
        print(f"bundle written: {args.output_dir} ({manifest['format']})")
    else:
        print("report only; pass --write-bundle to publish a loadable model bundle")

    print(json.dumps({key: value for key, value in report.items() if key != "candidateValidation"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
