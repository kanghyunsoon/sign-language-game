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
# Thresholds were calibrated on MediaPipe raw landmarks extracted from those
# training videos (240 together / 224 spread frames). The measure is the sum of
# the angles between the full-finger directions (MCP→TIP) of index–middle and
# middle–ring:
#
#   together  p5=7.6   p50=15.4   p95=29.0
#   spread    p5=32.3  p50=40.8   p95=51.8
#
# The classes separate at ~30°; the bands below keep a no-touch gap between
# them. Fingertip-gap/palm was measured too and overlaps — not used.
#
# Coordinates: raw screen landmarks. Angles between 3-D directions are
# invariant to the left-hand x-mirror, so handedness needs no special-casing.

# Set to 0/false/off to disable without touching the call site. Note that
# docker-compose.yml does not forward these variables, so on the deployed
# server the defaults are what runs.
GATE_ENABLED = os.getenv("HANDPRACTICE_AI_RIEUL_TIEUT_GATE", "1").strip().lower() in {"1", "true", "on"}

# At or below this spread the fingers are unmistakably together → ㅌ.
# (together p75 = 21°, spread p5 = 32.3° — 24° keeps an 8° margin.)
TOGETHER_MAX_DEGREES = float(os.getenv("HANDPRACTICE_AI_LT_TOGETHER_MAX_DEG", "24"))

# At or above this spread the fingers are unmistakably spread → ㄹ.
# (spread p25 = 36.2°, together p95 = 29.0° — 35° keeps a 6° margin.)
SPREAD_MIN_DEGREES = float(os.getenv("HANDPRACTICE_AI_LT_SPREAD_MIN_DEG", "35"))

# Guard: only judge the spread when index/middle/ring are actually extended.
# MCP→TIP length in palm-scale units: extended fingers in the calibration
# videos measure 0.9-1.2 on steady frames; folded fingers ~0.3-0.5.
EXTENDED_MIN_LENGTH = float(os.getenv("HANDPRACTICE_AI_LT_EXTENDED_MIN", "0.75"))

PAIR = ("ㄹ", "ㅌ")

_PALM_LANDMARKS = (5, 9, 13, 17)
_FINGERS = ((5, 8), (9, 12), (13, 16))  # index, middle, ring as (mcp, tip)


def _spread_degrees(points: np.ndarray) -> float | None:
    """Sum of index–middle and middle–ring full-finger direction angles.

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
    def angle(a: np.ndarray, b: np.ndarray) -> float:
        return float(np.degrees(np.arccos(np.clip(float(np.dot(a, b)), -1.0, 1.0))))
    return angle(directions[0], directions[1]) + angle(directions[1], directions[2])


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


class RieulTieutResolver:
    """Per-connection stateful resolver: EMA smoothing plus hysteresis.

    The first shipped gate was stateless per frame, and in the ambiguous band
    it fell back to the model's label. With the smoothed spread hovering near a
    band edge that alternated ㅌ(geometry) → ㄹ(model) → ㅌ… frame to frame,
    which the user saw as worse flicker than before the gate. This resolver is
    a Schmitt trigger instead: once the pair decision is made it STAYS through
    the ambiguous band, and only crossing the opposite threshold (24°/35°,
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
        # Ambiguous band: keep the previous decision (hysteresis). None until
        # the geometry has been unambiguous at least once.
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
