#!/usr/bin/env python3
"""Report the handshape-gate metric distribution from a diagnostics capture.

The thresholds in ``app/handshape_gate.py`` come from hand proportions, not from
measured data, because the repository contains no landmark dataset. This script
replaces that guess with percentiles from real frames.

Capture first, with the server writing every frame and the gate switched off — if
the gate is running it changes exactly the frames you are trying to study:

    HANDPRACTICE_AI_DIAG_PATH=/tmp/frames.jsonl \\
    HANDPRACTICE_AI_DIAG_MODE=all \\
    HANDPRACTICE_AI_HANDSHAPE_GATE=0 \\
    python -m app.main

Then sign each shape deliberately for a few seconds — correct ㅎ, plain fist,
correct ㅂ, fully open hand — and run:

    python scripts/calibrate_handshape_gate.py /tmp/frames.jsonl

Read the output as two comparisons:

  HIEUT_MIN_THUMB_STRAIGHTNESS / _CLEARANCE  belong between the plain fist's high
      tail and correct ㅎ's low tail.
  BIEUP_MAX_THUMB_STRAIGHTNESS               belongs between correct ㅂ's high tail
      and the open hand's low tail.

If those ranges overlap, the metric does not separate your captures and the gate
needs a different measurement rather than a different number. Note that the rows
are grouped by *predicted* symbol, so a plain fist misread as ㅎ lands in the ㅎ
row — the point of the exercise is to see whether that row is bimodal.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.handshape_gate import (  # noqa: E402
    BIEUP_MAX_THUMB_STRAIGHTNESS,
    BIEUP_MIN_THUMB_ABDUCTION_DEGREES,
    FINGER_EXTENDED_MAX_DEGREES,
    FINGER_FOLDED_MIN_DEGREES,
    HIEUT_MIN_THUMB_CLEARANCE,
    HIEUT_MIN_THUMB_STRAIGHTNESS,
    measure,
    verify,
)
from app.messages import Landmark  # noqa: E402


PERCENTILES = (5, 25, 50, 75, 95)


def _load(path: Path) -> list[dict[str, object]]:
    entries: list[dict[str, object]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        try:
            entry = json.loads(stripped)
        except json.JSONDecodeError:
            continue
        if isinstance(entry, dict) and isinstance(entry.get("landmarks"), list):
            entries.append(entry)
    return entries


def _describe(name: str, values: list[float]) -> str:
    array = np.asarray(values, dtype=np.float64)
    cells = "  ".join(
        f"p{percentile}={value:7.3f}"
        for percentile, value in zip(PERCENTILES, np.percentile(array, PERCENTILES))
    )
    return f"  {name:<8} n={array.size:<6} {cells}"


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("capture", type=Path, help="diagnostics JSONL written by PredictionDiagnostics")
    parser.add_argument(
        "--min-probability",
        type=float,
        default=0.0,
        help="ignore frames whose top-1 probability is below this (default: keep all)",
    )
    arguments = parser.parse_args()

    if not arguments.capture.is_file():
        print(f"No such capture: {arguments.capture}", file=sys.stderr)
        return 1

    entries = _load(arguments.capture)
    if not entries:
        print("No landmark frames found in the capture.", file=sys.stderr)
        return 1

    straightness: dict[str, list[float]] = defaultdict(list)
    clearance: dict[str, list[float]] = defaultdict(list)
    abduction: dict[str, list[float]] = defaultdict(list)
    finger_curl: dict[str, list[float]] = defaultdict(list)
    shapes: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    skipped = 0

    for entry in entries:
        top = entry.get("top")
        if not isinstance(top, list) or not top or not isinstance(top[0], dict):
            skipped += 1
            continue
        symbol = str(top[0].get("symbol"))
        if float(top[0].get("probability") or 0.0) < arguments.min_probability:
            continue
        handedness = str(entry.get("handedness") or "RIGHT").upper()
        if handedness not in {"LEFT", "RIGHT"}:
            handedness = "RIGHT"
        try:
            landmarks = tuple(
                Landmark(float(point[0]), float(point[1]), float(point[2]))
                for point in entry["landmarks"]  # type: ignore[index]
            )
            metrics = measure(landmarks, handedness)
        except (ValueError, IndexError, TypeError):
            skipped += 1
            continue

        straightness[symbol].append(metrics.thumb_straightness)
        clearance[symbol].append(metrics.thumb_clearance)
        abduction[symbol].append(metrics.thumb_abduction_degrees)
        finger_curl[symbol].extend(metrics.finger_curl_degrees)
        bucket = shapes[symbol]
        bucket["total"] += 1
        if metrics.four_fingers_folded:
            bucket["fourFolded"] += 1
        if metrics.four_fingers_extended:
            bucket["fourExtended"] += 1
        if verify(symbol, landmarks, handedness).rejected:
            bucket["wouldVeto"] += 1

    used = sum(len(values) for values in straightness.values())
    print(f"frames={len(entries)}  used={used}  skipped={skipped}")
    print(
        "current thresholds: "
        f"HIEUT_MIN_THUMB_STRAIGHTNESS={HIEUT_MIN_THUMB_STRAIGHTNESS}  "
        f"HIEUT_MIN_THUMB_CLEARANCE={HIEUT_MIN_THUMB_CLEARANCE}\n"
        "                    "
        f"BIEUP_MAX_THUMB_STRAIGHTNESS={BIEUP_MAX_THUMB_STRAIGHTNESS}  "
        f"BIEUP_MIN_THUMB_ABDUCTION_DEGREES={BIEUP_MIN_THUMB_ABDUCTION_DEGREES}\n"
        "                    "
        f"FINGER_EXTENDED_MAX_DEGREES={FINGER_EXTENDED_MAX_DEGREES}  "
        f"FINGER_FOLDED_MIN_DEGREES={FINGER_FOLDED_MIN_DEGREES}",
    )

    def section(title: str, data: dict[str, list[float]]) -> None:
        print(f"\n{title}, by predicted symbol")
        for symbol in sorted(data, key=lambda key: -len(data[key])):
            print(_describe(symbol, data[symbol]))

    section("thumb straightness (chord / chain, 1.0 = straight)", straightness)
    section("thumb clearance (palm units to nearest fingertip)", clearance)
    section("thumb abduction (degrees from index direction)", abduction)
    section("finger curl (degrees, all four pooled)", finger_curl)

    print("\nveto preconditions and current outcome")
    for symbol in sorted(shapes, key=lambda key: -shapes[key]["total"]):
        bucket = shapes[symbol]
        total = max(bucket["total"], 1)
        print(
            f"  {symbol:<8} n={bucket['total']:<6} "
            f"fist={bucket['fourFolded'] / total:6.1%}  flat={bucket['fourExtended'] / total:6.1%}  "
            f"vetoed={bucket['wouldVeto'] / total:6.1%}",
        )

    print("\nLabel the capture segments yourself — this script only knows what the model predicted.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
