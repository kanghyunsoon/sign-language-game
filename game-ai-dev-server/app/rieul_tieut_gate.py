from __future__ import annotations

import os
from typing import Sequence

import numpy as np

from .messages import Landmark


# ㄹ↔ㅌ disambiguation by measured finger geometry.
#
# The correct poses (per the app's guide and the user's KSL reference):
#
#   ㄹ  index/middle/ring extended sideways, ALL THREE spread apart evenly.
#   ㅌ  index SPREAD AWAY while middle and ring are pressed TOGETHER.
#
# The legacy training videos confuse the two, so the model's ㄹ/ㅌ answer is
# unreliable; this gate REASSIGNS between the two letters (a controlled
# promotion inside a closed 2-symbol pair) from raw-landmark geometry.
#
# THE MEASURE uses both inter-finger angles (full-finger MCP→TIP directions):
#
#   im = index–middle angle,  mr = middle–ring angle,  d = im − mr
#
# Calibrated on user-recorded reference videos of the correct poses
# (2026-08-09, per-frame MediaPipe raw landmarks):
#
#              im               mr               d = im − mr
#   ㄹ n=125   p5=18.2 p99=21.6  p5=13.2 p99=19.2  p5=0.3  p99=8.0
#   ㅌ n=144   p5=35.7 p99=47.5  p5=6.2  p99=9.7   p5=29.1 p99=39.0
#
# d separates the classes with a ~20° gap (ㄹ ≤8 vs ㅌ ≥28.6) because it
# encodes exactly the defining contrast: for ㅌ the index splays while the
# middle–ring pair stays closed; for ㄹ all gaps are similar so d ≈ 0.
#
# Decision rules (on EMA-smoothed angles), strict about ㅌ by design:
#   1. mr ≥ 13°                 → ㄹ   (middle–ring clearly apart → never ㅌ)
#   2. d ≥ 20° AND mr ≤ 10.5°   → ㅌ   (index clearly splayed AND mr closed)
#   3. d ≤ 14°                  → ㄹ   (even spread — the ㄹ shape)
#   4. otherwise                → keep previous decision; initially ㄹ
#
# Coordinates: raw screen landmarks. Angles between 3-D directions are
# invariant to the left-hand x-mirror, so handedness needs no special-casing.

# Set to 0/false/off to disable without touching the call site. Note that
# docker-compose.yml does not forward these variables, so on the deployed
# server the defaults are what runs.
GATE_ENABLED = os.getenv("HANDPRACTICE_AI_RIEUL_TIEUT_GATE", "1").strip().lower() in {"1", "true", "on"}

# Rule thresholds (see the calibration table above).
MR_RIEUL_MIN_DEGREES = float(os.getenv("HANDPRACTICE_AI_LT_MR_RIEUL_MIN_DEG", "13"))
D_TIEUT_MIN_DEGREES = float(os.getenv("HANDPRACTICE_AI_LT_D_TIEUT_MIN_DEG", "20"))
MR_TIEUT_MAX_DEGREES = float(os.getenv("HANDPRACTICE_AI_LT_MR_TIEUT_MAX_DEG", "10.5"))
D_RIEUL_MAX_DEGREES = float(os.getenv("HANDPRACTICE_AI_LT_D_RIEUL_MAX_DEG", "14"))

# Guard: only judge when index/middle/ring are actually extended.
# MCP→TIP length in palm-scale units: extended fingers in the calibration
# videos measure 0.9-1.2 on steady frames; folded fingers ~0.3-0.5.
EXTENDED_MIN_LENGTH = float(os.getenv("HANDPRACTICE_AI_LT_EXTENDED_MIN", "0.75"))

# Smoothing weight of the NEW frame in the resolver's EMAs. The sideways hand
# stacks the fingers toward the camera, so MediaPipe jitters the per-frame
# angles by several degrees; 0.25 keeps single outliers inside the bands while
# following a real pose change within ~4 frames.
SPREAD_SMOOTHING_ALPHA = float(os.getenv("HANDPRACTICE_AI_LT_SMOOTHING_ALPHA", "0.25"))

# Confidence assigned when the resolver has decided the pair but the model's
# own confidence is lower. Measured end-to-end: the model is torn between ㄹ
# and ㅌ on guide-correct poses, so the runner's decision-margin gate
# suppressed every frame to 0.05 and the browser decoder could never confirm
# the (correctly relabelled) letter. The geometry has resolved the ambiguity,
# so the frame is not ambiguous; 0.85 clears the decoder threshold the way the
# model's own confident frames (0.84-0.95 measured) do.
DECIDED_CONFIDENCE = float(os.getenv("HANDPRACTICE_AI_LT_DECIDED_CONFIDENCE", "0.85"))

PAIR = ("ㄹ", "ㅌ")

_PALM_LANDMARKS = (5, 9, 13, 17)
_FINGERS = ((5, 8), (9, 12), (13, 16))  # index, middle, ring as (mcp, tip)


def measure_angles(landmarks: Sequence[Landmark]) -> tuple[float, float] | None:
    """Per-frame (index–middle, middle–ring) angles in degrees.

    Returns None when the pose cannot be judged: malformed landmarks, invalid
    palm scale, a degenerate finger direction, or any of the three fingers not
    extended — the gate must never be the thing that breaks recognition.
    """
    try:
        points = np.asarray([(item.x, item.y, item.z) for item in landmarks], dtype=np.float64)
        if points.shape != (21, 3):
            return None
    except (ValueError, TypeError, AttributeError):
        return None
    wrist = points[0]
    palm_scale = float(np.mean(np.linalg.norm(points[list(_PALM_LANDMARKS)] - wrist, axis=1)))
    if palm_scale <= 1e-6:
        return None
    directions = []
    for mcp, tip in _FINGERS:
        vector = points[tip] - points[mcp]
        length = float(np.linalg.norm(vector))
        if length <= 1e-9 or length / palm_scale < EXTENDED_MIN_LENGTH:
            return None
        directions.append(vector / length)

    def angle(a: np.ndarray, b: np.ndarray) -> float:
        return float(np.degrees(np.arccos(np.clip(float(np.dot(a, b)), -1.0, 1.0))))

    return angle(directions[0], directions[1]), angle(directions[1], directions[2])


def classify(im: float, mr: float) -> str | None:
    """Apply the decision rules to one (im, mr) pair; None = ambiguous."""
    if mr >= MR_RIEUL_MIN_DEGREES:
        return "ㄹ"
    if im - mr >= D_TIEUT_MIN_DEGREES and mr <= MR_TIEUT_MAX_DEGREES:
        return "ㅌ"
    if im - mr <= D_RIEUL_MAX_DEGREES:
        return "ㄹ"
    return None


def resolve(symbol: str, landmarks: Sequence[Landmark], handedness: str) -> str | None:
    """Stateless single-frame resolve; None = ambiguous or unjudgeable."""
    if not GATE_ENABLED or symbol not in PAIR:
        return None
    angles = measure_angles(landmarks)
    if angles is None:
        return None
    return classify(*angles)


def restore_confidence(
    confidence: float,
    top_candidates: list[dict[str, object]],
) -> tuple[float, list[dict[str, object]]]:
    """Raise a pair-decided frame to DECIDED_CONFIDENCE, keeping wire invariants.

    All candidates scale by the same factor (ordering and relative gaps are
    preserved) and the top entry is pinned exactly, mirroring the _suppress
    helper in recognition_session. No-op when the model is already confident.
    """
    if confidence >= DECIDED_CONFIDENCE or confidence <= 0.0:
        return confidence, top_candidates
    factor = DECIDED_CONFIDENCE / confidence
    scaled = [
        {"symbol": candidate["symbol"], "confidence": float(candidate["confidence"]) * factor}
        for candidate in top_candidates
    ]
    if scaled:
        scaled[0]["confidence"] = DECIDED_CONFIDENCE
    return DECIDED_CONFIDENCE, scaled


class RieulTieutResolver:
    """Per-connection stateful resolver: EMA smoothing plus a sticky decision.

    Stateless per-frame swaps flickered near band edges (live report), so the
    smoothed angles drive the rules and an ambiguous frame keeps the previous
    decision. The first ambiguous frames resolve to ㄹ: a hand that is not
    clearly in the ㅌ shape must not score as ㅌ (deferring to the model is not
    an option — it was trained with the pair confused).

    State resets when the hand leaves the frame (RecognitionSession wires this
    to its release handling), so a fresh attempt starts unbiased.
    """

    def __init__(self) -> None:
        self._im: float | None = None
        self._mr: float | None = None
        self._decision: str | None = None

    def reset(self) -> None:
        self._im = None
        self._mr = None
        self._decision = None

    def resolve(self, symbol: str, landmarks: Sequence[Landmark], handedness: str) -> str | None:
        """Return ㄹ/ㅌ per the smoothed geometry, or None to leave the model alone.

        An unmeasurable frame (folded fingers, malformed landmarks) neither
        updates nor drops the state: it simply defers to the model for that
        frame, so a one-frame tracking glitch cannot erase an ongoing decision.
        """
        if not GATE_ENABLED or symbol not in PAIR:
            return None
        angles = measure_angles(landmarks)
        if angles is None:
            return None
        im, mr = angles
        if self._im is None or self._mr is None:
            self._im, self._mr = im, mr
        else:
            self._im += (im - self._im) * SPREAD_SMOOTHING_ALPHA
            self._mr += (mr - self._mr) * SPREAD_SMOOTHING_ALPHA
        verdict = classify(self._im, self._mr)
        if verdict is not None:
            self._decision = verdict
        elif self._decision is None:
            # Ambiguous from the start: strict rule — not clearly ㅌ means ㄹ.
            self._decision = "ㄹ"
        return self._decision


def reassign_candidates(
    symbol: str,
    corrected: str,
    top_candidates: list[dict[str, object]],
) -> None:
    """Swap the pair's labels in-place without touching any confidence.

    The argmax entry takes the corrected letter; if the corrected letter
    already appears elsewhere in the list it takes the vacated one, so the
    list keeps unique symbols, its ordering, and the top-1 identity the
    frontend parser enforces.
    """
    for candidate in top_candidates:
        if candidate["symbol"] == symbol:
            candidate["symbol"] = corrected
        elif candidate["symbol"] == corrected:
            candidate["symbol"] = symbol
