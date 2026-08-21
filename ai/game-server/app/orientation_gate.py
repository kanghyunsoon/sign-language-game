from __future__ import annotations

from dataclasses import dataclass
import os
from typing import Sequence

import numpy as np

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

# ㅋ only: the thumb must point AWAY from the fingers, not lie along them.
# Measured as the angle between the thumb direction (landmark 2→4) and the
# middle-finger proximal direction (9→12 proximal bone, 9→10).
#
# The first shipped check used thumb-to-nearest-fingertip distance ("clearance")
# with an uncalibrated 0.25 threshold and never fired: measured on real data a
# tucked-thumb fist has clearance 0.40+ (MediaPipe keeps the folded fingertips
# away from the thumb tip), so a middle-finger-only pose passed as ㅋ live.
# Recalibrated on MediaPipe raw landmarks (2026-08): legacy ㅋ_1.avi frames with
# the middle finger extended (186 frames) versus our collected none-set fists
# (426 frames, tracking-collapse frames excluded):
#
#   correct ㅋ thumb angle   p1=52.7  p5=56.4  p50=67.5  p95=76.1
#   tucked-thumb fist        p5=27.6  p50=50.4  p95=55.6  p99=58.3
#
# 56° catches ~95% of tucked-thumb frames and falsely suppresses ~5% of correct
# ㅋ frames — harmless, because the browser decoder confirms from the other 95%
# while the tucked pose can no longer accumulate stable votes.
KIEUK_MIN_THUMB_ANGLE_DEGREES = float(os.getenv("HANDPRACTICE_AI_KIEUK_MIN_THUMB_ANGLE_DEG", "56"))

# ㅎ only: the thumb must be FULLY extended, not just poking out of the fist.
# Measured as REACH: distance from the thumb CMC joint (landmark 1) to the tip
# (4), normalized by the CMC→MCP segment length (1→2). Normalizing within the
# thumb itself makes the measure independent of hand size, camera distance,
# and — unlike palm-scale metrics, whose foreshortening moved correct-ㅎ
# between 1.6 and 2.8 across performers — of fist orientation.
#
# Calibrated on user-recorded reference videos of the correct pose and of the
# failing "thumb slightly poking" pose (2026-08-10), cross-checked against the
# team-collected correct-ㅎ videos (different performers):
#
#   correct ㅎ (user,  n=144)  p5=2.61  p50=2.77  p95=2.83
#   correct ㅎ (team,  n=595)  p5=2.54  p50=2.62  p95=2.95
#   poking ㅎ  (user,  n=141)  p5=1.93  p50=2.02  p95=2.13
#
# The classes separate at ~2.2: poking stays ≤2.13 while every correct-ㅎ
# performer measured ≥2.22 (two team performers sit at p5=2.22/2.29, the rest
# ≥2.54). Thumb joint angles and palm-scale distances were measured too and
# overlap across performers — not used.
HIEUT_MIN_THUMB_REACH = float(os.getenv("HANDPRACTICE_AI_HIEUT_MIN_THUMB_REACH", "2.2"))

# Fist guard for the ㅎ check: every non-thumb finger's MCP→TIP length in
# palm-scale units must be under this. Real loose fists measure up to ~0.9
# (measured); extended fingers ~1.0-1.2.
_FOLDED_MAX_LENGTH = 0.95

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
HIEUT_THUMB_NOT_EXTENDED = "HIEUT_THUMB_NOT_EXTENDED"

FEEDBACK: dict[str, str] = {
    POINTING_UP: "손끝이 아래를 향하도록 손을 돌려주세요.",
    KIEUK_THUMB_FOLDED: "엄지를 옆으로 곧게 펴주세요.",
    HIEUT_THUMB_NOT_EXTENDED: "엄지를 끝까지 곧게 세워주세요.",
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
    if not GATE_ENABLED:
        return OrientationVerdict(symbol, True)

    if symbol == "ㅎ":
        reach = _hieut_thumb_reach(landmarks)
        if reach is not None and reach < HIEUT_MIN_THUMB_REACH:
            return OrientationVerdict(symbol, False, HIEUT_THUMB_NOT_EXTENDED)
        return OrientationVerdict(symbol, True)

    chains = _DOWNWARD_CHAINS.get(symbol)
    if chains is None:
        return OrientationVerdict(symbol, True)

    try:
        ratio = downward_ratio(landmarks, chains)
    except (IndexError, TypeError, AttributeError):
        return OrientationVerdict(symbol, True)
    if ratio is not None and ratio < UPWARD_VETO_RATIO:
        return OrientationVerdict(symbol, False, POINTING_UP)

    if symbol == "ㅋ":
        angle = _thumb_angle_degrees(landmarks)
        if angle is not None and angle < KIEUK_MIN_THUMB_ANGLE_DEGREES:
            return OrientationVerdict(symbol, False, KIEUK_THUMB_FOLDED)

    return OrientationVerdict(symbol, True)


def _hieut_thumb_reach(landmarks: Sequence[Landmark]) -> float | None:
    """Thumb CMC→tip distance over CMC→MCP length, fist frames only.

    Returns None when the frame cannot be judged: invalid palm scale, garbage
    tracking (out-of-range distances), or any non-thumb finger not folded —
    the gate must never be the thing that breaks recognition.
    """
    try:
        points = np.asarray([(item.x, item.y, item.z) for item in landmarks], dtype=np.float64)
        if points.shape != (21, 3):
            return None
    except (ValueError, TypeError, AttributeError):
        return None
    wrist = points[0]
    palm_scale = float(np.mean(np.linalg.norm(points[[5, 9, 13, 17]] - wrist, axis=1)))
    if palm_scale <= 1e-6:
        return None
    for mcp, tip in ((5, 8), (9, 12), (13, 16), (17, 20)):
        length = float(np.linalg.norm(points[tip] - points[mcp])) / palm_scale
        if length > 2.0:  # tracking collapse
            return None
        if length >= _FOLDED_MAX_LENGTH:  # not a fist — leave the model alone
            return None
    segment = float(np.linalg.norm(points[2] - points[1]))
    if segment <= 1e-9:
        return None
    reach = float(np.linalg.norm(points[4] - points[1])) / segment
    if reach > 6.0:  # tracking collapse
        return None
    return reach


def _thumb_angle_degrees(landmarks: Sequence[Landmark]) -> float | None:
    """Angle between the thumb (2→4) and the middle proximal bone (9→10).

    Mirror-invariant, so LEFT hands need no special-casing. Returns None on a
    degenerate frame — the caller must accept those.
    """
    try:
        thumb = np.asarray(
            (
                landmarks[4].x - landmarks[2].x,
                landmarks[4].y - landmarks[2].y,
                landmarks[4].z - landmarks[2].z,
            ),
            dtype=np.float64,
        )
        middle = np.asarray(
            (
                landmarks[10].x - landmarks[9].x,
                landmarks[10].y - landmarks[9].y,
                landmarks[10].z - landmarks[9].z,
            ),
            dtype=np.float64,
        )
    except (IndexError, TypeError, AttributeError):
        return None
    thumb_norm = float(np.linalg.norm(thumb))
    middle_norm = float(np.linalg.norm(middle))
    if thumb_norm <= 1e-9 or middle_norm <= 1e-9:
        return None
    cosine = float(np.dot(thumb, middle)) / (thumb_norm * middle_norm)
    return float(np.degrees(np.arccos(np.clip(cosine, -1.0, 1.0))))
