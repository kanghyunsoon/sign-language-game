"""Evaluate an ExtraTrees gate combined with a KNN digit head.

T-153 left a split verdict on the same data. ExtraTrees rejects non-number hand
shapes far better (2.3% of negatives accepted against KNN's 12.3%), while KNN is
clearly stronger on the digits themselves (`4` 1.000 vs 0.867, `9` 0.833 vs
0.667). Neither is better everywhere.

This is the shape T-141 already validated for the jamo/number split: route by
what each model is good at instead of tuning one model harder. Here the routing
axis is number-vs-not rather than jamo-vs-number.

Two compositions are measured:

  soft   p(none)  = gate p(none)
         p(digit) = (1 - gate p(none)) x head p(digit | number)
  hard   gate argmax is none -> none, otherwise the head's best digit

Soft keeps a real distribution, which matters because the frontend decoder
thresholds on confidence. Hard is measured only to show what the composition
choice is worth.

Metrics come from train_number_model so the numbers stay comparable to every
previous round. Nothing is written unless --output is given, and no bundle is
produced: this decides whether the hybrid is worth building, not how.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import numpy as np

NUMBER_MODEL_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(NUMBER_MODEL_ROOT))
sys.path.insert(0, str(SCRIPT_DIR))

from numbermodel.adapter import compose_soft  # noqa: E402  the deployed composition
from numbermodel.labels import LABELS, NONE_INDEX, NONE_LABEL, NUMBER_INDEXES  # noqa: E402

# Reuse the trainer's split policy and scoring so the comparison is like for like.
from train_number_model import (  # noqa: E402
    build_candidates,
    build_splits,
    contract_probabilities,
    encode_labels,
    load_features,
    score,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Measure an ExtraTrees gate plus KNN digit head.")
    parser.add_argument("--features", type=Path, nargs="+", required=True)
    parser.add_argument("--drop-source-folders", default="")
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--trees", type=int, default=500)
    parser.add_argument("--knn-neighbors", type=int, default=7)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--valid-participants", default="")
    parser.add_argument("--test-participants", default="")
    return parser.parse_args()


_NUMBER_COLUMNS = np.asarray(NUMBER_INDEXES)


def compose_hard(gate: np.ndarray, head: np.ndarray) -> np.ndarray:
    """Diagnostic only: one-hot output would break confidence thresholding."""
    output = np.zeros_like(gate)
    gate_says_none = gate.argmax(axis=1) == NONE_INDEX
    output[gate_says_none, NONE_INDEX] = 1.0
    for row in np.flatnonzero(~gate_says_none):
        digits = head[row, _NUMBER_COLUMNS]
        best = _NUMBER_COLUMNS[int(digits.argmax())]
        output[row, best] = 1.0
    return output.astype(np.float32)


def main() -> None:
    args = parse_args()
    data = load_features(list(args.features))
    dropped = [name for name in args.drop_source_folders.split(",") if name]
    if dropped:
        folders = np.asarray([str(v).split("/")[1] if "/" in str(v) else "" for v in data["sources"]])
        keep = ~np.isin(folders, dropped)
        data = {key: value[keep] for key, value in data.items()}
        print(f"dropped {int((~keep).sum())} rows from {dropped}", flush=True)

    targets = encode_labels(data["labels"])
    indexes, split_notes = build_splits(data, args)
    features = data["features"]
    internal = list(LABELS)

    candidates = build_candidates(args)
    fitted = {}
    for name in ("extra-trees", "knn"):
        candidates[name].fit(features[indexes["train"]], targets[indexes["train"]])
        fitted[name] = candidates[name]

    report: dict[str, object] = {"split": split_notes | {"droppedSourceFolders": dropped}, "arms": {}}
    for phase in ("valid", "test"):
        gate = contract_probabilities(fitted["extra-trees"], features[indexes[phase]], internal)
        head = contract_probabilities(fitted["knn"], features[indexes[phase]], internal)
        truth = targets[indexes[phase]]
        arms = {
            "extra-trees only": gate,
            "knn only": head,
            "hybrid soft": compose_soft(gate, head),
            "hybrid hard": compose_hard(gate, head),
        }
        report["arms"][phase] = {name: score(truth, values) for name, values in arms.items()}

    print(f"\n{'arm':18} {'acc':>7} {'numF1':>7} {'minRec':>7} {'below':>6} {'noneFA':>8} {'num→none':>9} {'noneRec':>8}")
    for phase in ("valid", "test"):
        print(f"-- {phase} --")
        for name, r in report["arms"][phase].items():
            none_recall = next(c["recall"] for c in r["classes"] if c["label"] == NONE_LABEL)
            fa = r["noneFalseAcceptRate"]
            rj = r["numberRejectedAsNoneRate"]
            print(f"  {name:16} {r['accuracy']:>7.4f} {r['numberMacroF1']:>7.4f} {r['numberMinRecall']:>7.4f} "
                  f"{r['classesBelowFloorCount']:>6} {('-' if fa is None else format(fa, '.1%')):>8} "
                  f"{('-' if rj is None else format(rj, '.1%')):>9} {none_recall:>8.3f}")

    print(f"\n{'digit':>6} {'ET':>7} {'KNN':>7} {'soft':>7} {'hard':>7}")
    per_arm = {name: {c["label"]: c["recall"] for c in r["classes"]}
               for name, r in report["arms"]["test"].items()}
    for label in LABELS:
        row = [per_arm[name][label] for name in ("extra-trees only", "knn only", "hybrid soft", "hybrid hard")]
        print(f"  {label:>4} " + " ".join(f"{value:>7.3f}" for value in row))

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\nreport: {args.output}")


if __name__ == "__main__":
    main()
