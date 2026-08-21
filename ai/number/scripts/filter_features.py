"""Drop rows from an extractor NPZ by participant, or by participant and label.

Some captured folders are only partly usable. `p10`, `p11`, `p12` signed 6 to 9
with the palm toward the camera instead of the back of the hand, so those four
digits teach the wrong shape while their 1 to 5 and 10 are correct and measured
at recall 1.000. Throwing away three whole participants to remove four digits
costs 138 good samples for no reason.

Filtering here rather than inside the trainer keeps the exclusion visible. The
result carries its own audit file recording exactly what was removed and why, so
a bundle trained on it can be traced back to a decision instead of to a flag
someone happened to pass.

    python scripts/filter_features.py --input <npz> --output <npz> \
      --drop-participants p07 \
      --drop-participant-labels p10:6,7,8,9 p11:6,7,8,9 p12:6,7,8,9 \
      --reason "p07 is 180x320 thumbnails; p10-p12 signed 6-9 palm-forward"
"""

from __future__ import annotations

import argparse
import collections
import json
from pathlib import Path

import numpy as np

ARRAY_KEYS = ("features", "labels", "groups", "splits", "sources")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Drop rows from an extractor NPZ.")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--drop-participants", nargs="*", default=[],
                        help="Remove these participants entirely")
    parser.add_argument("--drop-participant-labels", nargs="*", default=[],
                        help="Remove label(s) from one participant, as p10:6,7,8,9")
    parser.add_argument("--reason", default="", help="Recorded in the audit file")
    return parser.parse_args()


def parse_pairs(entries: list[str]) -> dict[str, set[str]]:
    dropped: dict[str, set[str]] = collections.defaultdict(set)
    for entry in entries:
        if ":" not in entry:
            raise SystemExit(f"Expected participant:label,label but got {entry!r}")
        participant, labels = entry.split(":", 1)
        names = [name.strip() for name in labels.split(",") if name.strip()]
        if not names:
            raise SystemExit(f"No labels given in {entry!r}")
        dropped[participant.strip()].update(names)
    return dict(dropped)


def main() -> None:
    arguments = parse_args()
    with np.load(arguments.input, allow_pickle=False) as data:
        arrays = {key: data[key] for key in ARRAY_KEYS if key in data}
        extras = {key: data[key] for key in data.files if key not in ARRAY_KEYS}

    if "groups" not in arrays:
        raise SystemExit(f"{arguments.input} has no groups column, so no participant can be selected")
    groups = arrays["groups"].astype(str)
    labels = arrays["labels"].astype(str)
    total = len(groups)

    whole = set(arguments.drop_participants)
    pairs = parse_pairs(arguments.drop_participant_labels)
    known = set(groups.tolist())
    missing = sorted((whole | set(pairs)) - known)
    if missing:
        raise SystemExit(f"Unknown participants requested: {missing}. Present: {sorted(known)}")

    remove = np.isin(groups, list(whole)) if whole else np.zeros(total, dtype=bool)
    for participant, names in pairs.items():
        remove |= (groups == participant) & np.isin(labels, list(names))

    keep = ~remove
    if not keep.any():
        raise SystemExit("Every row was removed; refusing to write an empty feature file")

    kept = {key: value[keep] for key, value in arrays.items()}
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(arguments.output, **kept, **extras)

    removed_by_participant = {
        name: int(((groups == name) & remove).sum())
        for name in sorted(known) if ((groups == name) & remove).any()
    }
    audit = {
        "input": str(arguments.input),
        "output": str(arguments.output),
        "reason": arguments.reason,
        "rowsIn": total,
        "rowsOut": int(keep.sum()),
        "rowsRemoved": int(remove.sum()),
        "droppedParticipants": sorted(whole),
        "droppedParticipantLabels": {name: sorted(values) for name, values in sorted(pairs.items())},
        "removedByParticipant": removed_by_participant,
        "perParticipantKept": {
            name: int(((groups == name) & keep).sum())
            for name in sorted(known) if ((groups == name) & keep).any()
        },
        "perLabelKept": {
            name: int(((labels == name) & keep).sum())
            for name in sorted(set(labels.tolist())) if ((labels == name) & keep).any()
        },
    }
    audit_path = arguments.output.with_suffix(".audit.json")
    audit_path.write_text(json.dumps(audit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(audit, indent=2, ensure_ascii=False))
    print(f"features written: {arguments.output} ({int(keep.sum())}, {kept['features'].shape[1]})")


if __name__ == "__main__":
    main()
