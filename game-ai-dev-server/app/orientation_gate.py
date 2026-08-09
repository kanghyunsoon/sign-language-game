from __future__ import annotations

from dataclasses import dataclass
import os
from typing import Sequence

import numpy as np

from . import handshape_gate
from .messages import Landmark


# Orientation gate for the downward-pointing fingerspelling letters.
#
# Why this exists: the closed-set model tells letters apart by handshape *and*
# orientation when both variants exist as classes (검지 위 = ㅣ, 검지 아래 = ㅜ …),
# but a pose whose flipped variant is NOT a class has no competitor — hold a ㅋ
# upside down and ㅋ stays the argmax, because nothing else fits better. The app
# then confirms a wrong pose, which is exactly what a learning app must not do.
#
# Reported live (2026-08): ㅋ passes when signed pointing up, and also passes
# with the middle finger alone, thumb tucked away.
#
# Unlike the withdrawn thumb-subtlety gate (T-158), up-versus-down is gross
# geometry: the two failure poses sit ~180° from the correct one, and the veto
# threshold below only fires when the fingertips point clearly *above*
# horizontal. A correct-but-sloppy downward pose (slanted, oblique) is nowhere
# near the threshold. The gate is a veto, never a promoter: it runs only when
# the argmax is already one of the gated letters, and it can only suppress.
#
# Coordinates: raw screen landmarks as the frontend sends them, y grows
# DOWNWARD. Handedness mirroring only flips x, so the vertical test needs no
# mirroring, and the ㅋ thumb clearance is a distance, which mirroring cannot
# change either.

# Set to 0/false/off to disable without touching the call site. Note that
# docker-compose.yml does not forward these variables, so on the deployed
# server the defaults are what runs.
GATE_ENABLED = os.getenv("HANDPRACTICE_AI_ORIENTATION_GATE", "1").strip().lower() in {"1", "true", "on"}

# Mean vertical component of the extended fingers' unit direction (mcp → tip).
# +1 is straight down (correct), 0 is horizontal, -1 is straight up. The veto
# fires only below this value, i.e. when the fingers point clearly upward —
# about 15° above horizontal. Downward and horizontal poses are never touched.
UPWARD_VETO_RATIO = float(os.getenv("HANDPRACTICE_AI_UPWARD_VETO_RATIO", "-0.25"))

# ㅋ only: the thumb must stand clear of the folded fingers. Distance from the
# thumb tip to the nearest fingertip in palm-scale units (handshape_gate
# metrics). A thumb tucked against the folded fingers measures well under 0.15;
# an extended ㅋ thumb measures upwards of 0.6. 0.25 is deliberately
# conservative — T-158 showed what uncalibrated thumb thresholds do — so it
# only catches the unmistakably tucked thumb.
KIEUK_MIN_THUMB_CLEARANCE = float(os.getenv("HANDPRACTICE_AI_KIEUK_MIN_THUMB_CLEARANCE", "0.25"))

# The letters whose extended fingers must point downward, with the (mcp, tip)
# chains that define "the extended fingers" for each. Sources: the practice
# guide texts in frontend fingerspelling.ts ("아래로 …").
_DOWNWARD_CHAINS: dict[str, tuple[tuple[int, int], ...]] = {
    "ㄱ": ((5, 8),),
    "ㅅ": ((5, 8), (9, 12)),
    "ㅈ": ((5, 8), (9, 12)),
    "ㅊ": ((5, 8), (9, 12), (13, 16)),
    "ㅋ": ((9, 12),),
    "ㅜ": ((5, 8),),
    "ㅠ": ((5, 8), (9, 12)),
}

POINTING_UP = "POINTING_UP"
KIEUK_THUMB_FOLDED = "KIEUK_THUMB_FOLDED"

FEEDBACK: dict[str, str] = {
    POINTING_UP: "손끝이 아래를 향하도록 손을 돌려주세요.",
    KIEUK_THUMB_FOLDED: "엄지를 옆으로 곧게 펴주세요.",
}


@dataclass(frozen=True)
class OrientationVerdict:
    """``accepted`` is False only when the pose clearly contradicts ``symbol``."""

    symbol: str
    accepted: bool
    reason: str | None = None

    @property
    def rejected(self) -> bool:
        return not self.accepted

    @property
    def feedback(self) -> str | None:
        return FEEDBACK.get(self.reason) if self.reason else None


def downward_ratio(
    landmarks: Sequence[Landmark],
    chains: tuple[tuple[int, int], ...],
) -> float | None:
    """Mean vertical component of the unit mcp→tip directions.

    Returns None when every chain is degenerate (zero length), which happens
    only on malformed frames — the caller must accept those.
    """
    ratios: list[float] = []
    for mcp, tip in chains:
        dx = landmarks[tip].x - landmarks[mcp].x
        dy = landmarks[tip].y - landmarks[mcp].y
        dz = landmarks[tip].z - landmarks[mcp].z
        norm = float(np.sqrt(dx * dx + dy * dy + dz * dz))
        if norm > 1e-6:
            ratios.append(dy / norm)
    if not ratios:
        return None
    return float(np.mean(ratios))


def verify(symbol: str, landmarks: Sequence[Landmark], handedness: str) -> OrientationVerdict:
    """Accept unless the pose clearly contradicts a downward-pointing letter.

    Letters outside the gated set are accepted untouched, and so is any
    malformed frame — the gate must never be the thing that breaks recognition.
    """
    chains = _DOWNWARD_CHAINS.get(symbol)
    if not GATE_ENABLED or chains is None:
        return OrientationVerdict(symbol, True)

    try:
        ratio = downward_ratio(landmarks, chains)
    except (IndexError, TypeError, AttributeError):
        return OrientationVerdict(symbol, True)
    if ratio is not None and ratio < UPWARD_VETO_RATIO:
        return OrientationVerdict(symbol, False, POINTING_UP)

    if symbol == "ㅋ":
        try:
            metrics = handshape_gate.measure(landmarks, handedness)
        except (ValueError, IndexError, TypeError):
            return OrientationVerdict(symbol, True)
        if metrics.thumb_clearance < KIEUK_MIN_THUMB_CLEARANCE:
            return OrientationVerdict(symbol, False, KIEUK_THUMB_FOLDED)

    return OrientationVerdict(symbol, True)
