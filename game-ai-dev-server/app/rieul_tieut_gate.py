from __future__ import annotations

import os
from typing import Sequence

import numpy as np

from .messages import Landmark


# ㄹ↔ㅌ disambiguation by measured finger spread.
#
# ㄹ and ㅌ share the same silhouette — index/middle/ring extended sideways —
# and differ only in whether the three fingers are spread (ㄹ) or held together
# (ㅌ). That is the convention the app teaches (guide texts and the reference
# drawings in frontend consonant-rieul/tieut assets).
#
# The legacy training videos have it REVERSED: dataset/output_video/ㄹ/ㄹ_1.avi
# holds the three fingers together and ㅌ_1.avi spreads them (verified visually
# and by measurement, 2026-08). A model trained on that data therefore answers
# ㄹ for the exact pose the app tells the user to make for ㅌ — which is the
# live bug this module fixes: signing ㅌ per the guide scores as a confident ㄹ.
#
# Because the model cannot be trusted on this axis, the gate REASSIGNS between
# the two letters (a controlled promotion inside a closed 2-symbol pair, unlike
# the veto-only gates) when the geometry is unambiguous, and leaves the model's
# answer alone in the ambiguous middle band.
#
# THE MEASURE IS THE MIDDLE–RING ANGLE ALONE (full-finger MCP→TIP directions).
#
# Two earlier metrics failed live and the failures were measured, not guessed:
# the sum of index–middle and middle–ring angles was dominated by the index
# finger (the legacy "spread" video only splays the index: index–middle
# 24-41° while middle–ring stays 3-13°), so the app tracked incidental index
# abduction instead of the actual ㄹ/ㅌ distinction, which is whether the
# middle and ring fingers are apart.
#
# Thresholds are calibrated on user-recorded reference videos of the correct
# poses (2026-08-09, ~10s each, per-frame MediaPipe raw landmarks):
#
#   middle–ring angle    ㄹ(벌림, n=125)  p1=12.4  p50=15.6  p99=19.0
#                        ㅌ(붙임, n=144)  p1=5.6   p50=7.4   p99=9.7
#
# The classes separate with a clean gap (9.7 vs 12.4). Index–middle measured
# 18-22° for ㄹ but 36-47° for ㅌ on the same recordings — anti-correlated —
# which is why the index is excluded entirely.
#
# End-to-end verification (real TFLite ensemble + all gates over the same
# recordings): ㄹ video 55/55 frames → ㄹ at ≥0.75, ㅌ video 55/55 → ㅌ ≥0.75.
#
# Coordinates: raw screen landmarks. Angles between 3-D directions are
# invariant to the left-hand x-mirror, so handedness needs no special-casing.

# Set to 0/false/off to disable without touching the call site. Note that
# docker-compose.yml does not forward these variables, so on the deployed
# server the defaults are what runs.
GATE_ENABLED = os.getenv("HANDPRACTICE_AI_RIEUL_TIEUT_GATE", "1").strip().lower() in {"1", "true", "on"}

# Hysteresis thresholds on the middle–ring angle. Calibrated reference poses
# measure ㅌ ≤ 9.7° (p99) and ㄹ ≥ 12.4° (p1); 10°/13° keep the switch points
# just outside both distributions with the EMA absorbing frame jitter.
TOGETHER_MAX_DEGREES = float(os.getenv("HANDPRACTICE_AI_LT_TOGETHER_MAX_DEG", "10"))
SPREAD_MIN_DEGREES = float(os.getenv("HANDPRACTICE_AI_LT_SPREAD_MIN_DEG", "13"))

# Guard: only judge the spread when index/middle/ring are actually extended.
# MCP→TIP length in palm-scale units: extended fingers in the calibration
# videos measure 0.9-1.2 on steady frames; folded fingers ~0.3-0.5.
EXTENDED_MIN_LENGTH = float(os.getenv("HANDPRACTICE_AI_LT_EXTENDED_MIN", "0.75"))

PAIR = ("ㄹ", "ㅌ")

_PALM_LANDMARKS = (5, 9, 13, 17)
_FINGERS = ((5, 8), (9, 12), (13, 16))  # index, middle, ring as (mcp, tip)


def _spread_degrees(points: np.ndarray) -> float | None:
    """Middle–ring full-finger direction angle (the ㄹ/ㅌ discriminator).

    The index finger still participates in the extension guard — ㄹ/ㅌ both
    extend all three fingers — but NOT in the angle: measured on reference
    recordings its abduction is anti-correlated with the distinction.

    Returns None when the pose cannot be judged: invalid palm scale, a
    degenerate finger direction, or any of the three fingers not extended.
    """
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
    middle, ring = directions[1], directions[2]
    cosine = float(np.clip(float(np.dot(middle, ring)), -1.0, 1.0))
    return float(np.degrees(np.arccos(cosine)))


def resolve(symbol: str, landmarks: Sequence[Landmark], handedness: str) -> str | None:
    """Return the letter the geometry supports, or None to leave the model alone.

    Only called into action when the model already answered ㄹ or ㅌ; the gate
    never moves probability toward the pair from outside it. A malformed frame,
    non-extended fingers, or a spread inside the ambiguous band all return
    None — the model's answer stands.
    """
    if not GATE_ENABLED or symbol not in PAIR:
        return None
    spread = measure_spread(landmarks)
    if spread is None:
        return None
    if spread <= TOGETHER_MAX_DEGREES:
        return "ㅌ"
    if spread >= SPREAD_MIN_DEGREES:
        return "ㄹ"
    return None


def measure_spread(landmarks: Sequence[Landmark]) -> float | None:
    """Raw per-frame spread in degrees, or None when the frame can't be judged."""
    try:
        points = np.asarray([(item.x, item.y, item.z) for item in landmarks], dtype=np.float64)
        if points.shape != (21, 3):
            return None
        return _spread_degrees(points)
    except (ValueError, IndexError, TypeError, AttributeError):
        return None


# Smoothing weight of the NEW frame in the resolver's EMA. The sideways ㄹ/ㅌ
# hand stacks the three fingers vertically toward the camera, so MediaPipe
# jitters the per-frame spread by several degrees; 0.4 damps a single outlier
# frame to under half its excursion while following a real pose change within
# ~3 frames.
SPREAD_SMOOTHING_ALPHA = float(os.getenv("HANDPRACTICE_AI_LT_SMOOTHING_ALPHA", "0.4"))

# Confidence assigned when the resolver has decided the pair but the model's
# own confidence is lower. Measured end-to-end on the calibration recordings:
# the model is torn between ㄹ and ㅌ on a guide-correct ㄹ, so the
# decision-margin gate inside the runner suppressed every frame to 0.05 and
# the browser decoder could never confirm the (correctly relabelled) ㄹ. The
# margin gate exists to block ambiguous frames — but for this pair the
# geometry has already resolved the ambiguity, so the frame is not ambiguous.
# 0.85 clears the decoder threshold the way the model's own confident ㅌ
# frames (0.84-0.95 measured) do.
DECIDED_CONFIDENCE = float(os.getenv("HANDPRACTICE_AI_LT_DECIDED_CONFIDENCE", "0.85"))


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
    """Per-connection stateful resolver: EMA smoothing plus hysteresis.

    The first shipped gate was stateless per frame, and in the ambiguous band
    it fell back to the model's label. With the smoothed spread hovering near a
    band edge that alternated ㅌ(geometry) → ㄹ(model) → ㅌ… frame to frame,
    which the user saw as worse flicker than before the gate. This resolver is
    a Schmitt trigger instead: once the pair decision is made it STAYS through
    the ambiguous band, and only crossing the opposite threshold (10°/13°,
    calibrated in this module's header) can change it.

    State resets when the hand leaves the frame (RecognitionSession wires this
    to its release handling), so a fresh attempt starts unbiased.
    """

    def __init__(self) -> None:
        self._smoothed: float | None = None
        self._decision: str | None = None

    def reset(self) -> None:
        self._smoothed = None
        self._decision = None

    def resolve(self, symbol: str, landmarks: Sequence[Landmark], handedness: str) -> str | None:
        """Return ㄹ/ㅌ per the smoothed geometry, or None to leave the model alone.

        An unmeasurable frame (folded fingers, malformed landmarks) neither
        updates nor drops the state: it simply defers to the model for that
        frame, so a one-frame tracking glitch cannot erase an ongoing decision.
        """
        if not GATE_ENABLED or symbol not in PAIR:
            return None
        spread = measure_spread(landmarks)
        if spread is None:
            return None
        if self._smoothed is None:
            self._smoothed = spread
        else:
            self._smoothed += (spread - self._smoothed) * SPREAD_SMOOTHING_ALPHA
        if self._smoothed <= TOGETHER_MAX_DEGREES:
            self._decision = "ㅌ"
        elif self._smoothed >= SPREAD_MIN_DEGREES:
            self._decision = "ㄹ"
        elif self._decision is None:
            # No decision yet and the first frames land mid-band: pick the
            # nearest side rather than deferring to the model. The model was
            # trained with ㄹ/ㅌ reversed, so inside this pair its answer is
            # anti-correlated with the pose — deferring to it is what showed ㅌ
            # on a spread hand. The hysteresis then refines this initial pick
            # as soon as the smoothed spread reaches either threshold.
            midpoint = (TOGETHER_MAX_DEGREES + SPREAD_MIN_DEGREES) / 2.0
            self._decision = "ㄹ" if self._smoothed >= midpoint else "ㅌ"
        # Otherwise: ambiguous band with an existing decision — keep it.
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
