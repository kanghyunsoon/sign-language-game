"""Summarise the prediction diagnostics captured from real use.

Usage:
    python scripts/analyze_diagnostics.py /opt/sudal/ai/diagnostics/predictions.jsonl

Answers the questions the four failed hypotheses could not (T-153~T-156):

1. What does the model actually predict when the browser cannot confirm, and is
   it the look-alike group (ㅓ ㅕ ㅔ ㅖ) or far-apart handshapes like ㄱ / ㅋ?
   Far-apart answers mean the *input* is wrong, not the decision boundary.
2. Is the margin gate the thing blocking confirmation, or is the top-1
   probability simply low? Those need opposite fixes.
3. Does the handedness the frontend sends match the geometry of the landmarks it
   sends? A mismatch means the server mirrors the hand the wrong way.
4. Are the landmarks degenerate — collapsed fingers, zero palm scale — which is
   what MediaPipe emits when the fingers occlude each other?

Read-only: it never writes to the capture file.
"""
from __future__ import annotations

import json
import sys
from collections import Counter

import numpy as np

# Landmark indices, MediaPipe hand model.
WRIST, THUMB_TIP, INDEX_MCP, MIDDLE_MCP, RING_MCP, PINKY_MCP = 0, 4, 5, 9, 13, 17
FINGERTIPS = (4, 8, 12, 16, 20)
FRONTAL = {"ㅓ", "ㅕ", "ㅔ", "ㅖ"}


def palm_scale(points: np.ndarray) -> float:
    wrist = points[WRIST]
    return float(np.mean(np.linalg.norm(points[[INDEX_MCP, MIDDLE_MCP, RING_MCP, PINKY_MCP]] - wrist, axis=1)))


def geometric_handedness(points: np.ndarray) -> str:
    """Infer handedness from the landmarks alone.

    The palm normal is the cross product of two in-palm vectors; its z sign flips
    between hands. Compared against the claimed handedness this exposes a
    mirroring mismatch without needing the original image.
    """
    wrist = points[WRIST]
    normal = np.cross(points[INDEX_MCP] - wrist, points[PINKY_MCP] - wrist)
    return "RIGHT" if float(normal[2]) >= 0 else "LEFT"


def main(path: str) -> int:
    entries = []
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line:
            continue
        item = json.loads(line)
        if item.get("type") == "DIAGNOSTICS_STOPPED":
            print("NOTE: capture hit its frame cap after %d frames" % item["writtenFrames"])
            continue
        entries.append(item)

    if not entries:
        print("no frames captured — is HANDPRACTICE_AI_DIAG_PATH set and has a failure happened since?")
        return 1

    print("frames captured: %d" % len(entries))

    gate = sum(1 for item in entries if item["gateFired"])
    weak = sum(1 for item in entries if not item["gateFired"])
    print("\n[why the browser could not confirm]")
    print("  margin gate fired      : %5d (%.1f%%)" % (gate, 100 * gate / len(entries)))
    print("  top-1 simply too low   : %5d (%.1f%%)" % (weak, 100 * weak / len(entries)))
    print("  -> gate-dominated means loosen/replace the gate; low-confidence means the")
    print("     model does not recognise the pose at all, which is a data problem.")

    print("\n[what it predicted instead]")
    top1 = Counter(item["top"][0]["symbol"] for item in entries)
    for symbol, count in top1.most_common(10):
        tag = " (frontal group)" if symbol in FRONTAL else ""
        print("  %s %5d%s" % (symbol, count, tag))
    frontal = sum(count for symbol, count in top1.items() if symbol in FRONTAL)
    print("  frontal group share: %.1f%%" % (100 * frontal / len(entries)))
    print("  -> a low share means the failure is NOT look-alike confusion.")

    print("\n[relative gap to the runner-up]  (scale-invariant, survives gating)")
    gaps = np.array([item["relativeGap"] for item in entries], dtype=np.float64)
    for label, value in (("p10", 10), ("median", 50), ("p90", 90)):
        print("  %-6s %.4f" % (label, float(np.percentile(gaps, value))))

    print("\n[claimed handedness vs landmark geometry]")
    mismatch = 0
    degenerate = 0
    spreads = []
    for item in entries:
        points = np.asarray(item["landmarks"], dtype=np.float64)
        if geometric_handedness(points) != item["handedness"]:
            mismatch += 1
        scale = palm_scale(points)
        if scale <= 1e-6:
            degenerate += 1
            continue
        tips = points[list(FINGERTIPS)]
        spreads.append(float(np.mean(np.linalg.norm(tips - tips.mean(axis=0), axis=1)) / scale))
    print("  claimed != geometry    : %5d (%.1f%%)" % (mismatch, 100 * mismatch / len(entries)))
    print("  -> a high rate means the server mirrors the wrong hand (feature_v3 flips x on LEFT).")

    print("\n[landmark sanity]")
    print("  zero palm scale        : %5d" % degenerate)
    if spreads:
        values = np.asarray(spreads)
        print("  fingertip spread / palm: median %.3f  p10 %.3f" % (float(np.median(values)), float(np.percentile(values, 10))))
        print("  -> a very small spread means MediaPipe collapsed the fingers together,")
        print("     which is the self-occlusion failure the frontal poses trigger.")

    print("\n[handedness distribution]")
    for value, count in Counter(item["handedness"] for item in entries).most_common():
        print("  %-6s %5d" % (value, count))
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1]))
