from __future__ import annotations

from dataclasses import dataclass
import os
from typing import Sequence

import numpy as np

from .messages import Landmark


# Geometric handshape gate for ㅎ and ㅂ.
#
# Why this exists: ㅎ and ㅂ each differ from a much commoner "lazy" handshape by
# the thumb alone.
#
#   ㅎ (히읗)  four fingers folded into a fist, thumb extended clear of the fist.
#             The lazy version is a plain fist with the thumb tucked in.
#   ㅂ (비읍)  four fingers extended side by side, thumb folded in over the palm.
#             The lazy version is a fully open hand with the thumb splayed out.
#
# The trained ensemble does not reliably see that difference. The four-finger
# silhouette dominates the feature vector — 16 of the 20 bone directions and 12 of
# the 15 joint angles describe the non-thumb fingers — so a plain fist scores as ㅎ
# and an open hand scores as ㅂ. `number-model/README.md` records the same
# collision from the other side: ㅂ and the digit 4 are "실질적으로 같은 손모양", and
# that pipeline works around it by dropping data rather than by separating the
# classes. Retraining may fix it properly; a geometric check fixes it now and
# stays true regardless of which head is deployed.
#
# The gate is a veto, never a promoter. It runs only when the argmax is already ㅎ
# or ㅂ, and it can only reject — it never turns some other prediction into ㅎ/ㅂ.
# The worst case is therefore a suppressed frame, the same failure mode the
# decision-margin gate in model_adapter.py already has.
#
# THE THRESHOLDS ARE NOT CALIBRATED AGAINST CAPTURED DATA. There is no landmark
# dataset in this repository (`ai/data` holds an empty collection template), so the
# defaults come from hand proportions, not from a measured distribution. Every
# veto is therefore written as a conjunction with a wide dead band: the lazy
# handshape has to be unmistakable before the thumb is called wrong. Run
# `scripts/calibrate_handshape_gate.py` over a diagnostics capture to replace the
# numbers with real percentiles before tightening any of them.

LANDMARK_COUNT = 21

# Fingers as (mcp, pip, dip, tip). The thumb is handled separately: it has one
# fewer phalanx and its motion is rotation at the saddle joint, not a curl.
_FINGERS: tuple[tuple[int, int, int, int], ...] = (
    (5, 6, 7, 8),
    (9, 10, 11, 12),
    (13, 14, 15, 16),
    (17, 18, 19, 20),
)
_FINGERTIPS = (8, 12, 16, 20)
_PALM_LANDMARKS = (5, 9, 13, 17)
_THUMB_CHAIN = (1, 2, 3, 4)

# Finger curl: the angle between the proximal segment (mcp→pip) and the distal
# segment (dip→tip), in degrees. A straight finger is near 0°; a finger folded
# into a fist doubles back on itself and lands near 150-180°. The band between
# the two thresholds is "unclear" and never satisfies a veto precondition.
FINGER_EXTENDED_MAX_DEGREES = float(os.getenv("HANDPRACTICE_AI_FINGER_EXTENDED_DEG", "45"))
FINGER_FOLDED_MIN_DEGREES = float(os.getenv("HANDPRACTICE_AI_FINGER_FOLDED_DEG", "95"))

# Thumb straightness: the straight-line distance from thumb base (1) to thumb tip
# (4) divided by the length of the 1→2→3→4 chain. A fully straight thumb is ~1.0;
# bending it at either joint shortens the chord while the chain length stays
# fixed, so a folded thumb falls to ~0.6-0.75. Dividing by the chain length makes
# this independent of thumb length, palm scale, and camera distance — it is a
# ratio of two lengths measured on the same thumb.
HIEUT_MIN_THUMB_STRAIGHTNESS = float(os.getenv("HANDPRACTICE_AI_HIEUT_MIN_THUMB_STRAIGHTNESS", "0.85"))
BIEUP_MAX_THUMB_STRAIGHTNESS = float(os.getenv("HANDPRACTICE_AI_BIEUP_MAX_THUMB_STRAIGHTNESS", "0.93"))

# Thumb clearance: distance from the thumb tip to the nearest of the four
# fingertips, in palm-scale units. Straightness alone misses the common fist
# whose thumb is straight but lying flat against the folded fingers — that thumb
# is not "extended clear of the fist" and the shape is not 히읗. In a genuine ㅎ
# the thumb tip stands well away from the folded fingertips.
HIEUT_MIN_THUMB_CLEARANCE = float(os.getenv("HANDPRACTICE_AI_HIEUT_MIN_THUMB_CLEARANCE", "0.40"))

# Thumb abduction: the angle between the thumb direction (mcp 2 → tip 4) and the
# index-finger direction (mcp 5 → tip 8), in degrees. Required in addition to
# straightness before ㅂ is vetoed, so that a ㅂ signed with a straight thumb held
# alongside the palm still passes. Only a thumb that is both straight *and*
# splayed away from the fingers is an open hand.
BIEUP_MIN_THUMB_ABDUCTION_DEGREES = float(os.getenv("HANDPRACTICE_AI_BIEUP_MIN_THUMB_ABDUCTION_DEG", "35"))

# Set to 0/false/off to disable the gate without touching the call site.
GATE_ENABLED = os.getenv("HANDPRACTICE_AI_HANDSHAPE_GATE", "1").strip().lower() not in {"0", "false", "off"}

GATED_SYMBOLS = ("ㅎ", "ㅂ")

THUMB_NOT_EXTENDED = "THUMB_NOT_EXTENDED"
THUMB_NOT_FOLDED = "THUMB_NOT_FOLDED"

FEEDBACK: dict[str, str] = {
    THUMB_NOT_EXTENDED: "엄지를 주먹 밖으로 곧게 세워주세요.",
    THUMB_NOT_FOLDED: "엄지를 손바닥 쪽으로 접어주세요.",
}


@dataclass(frozen=True)
class HandshapeMetrics:
    """Orientation-invariant descriptors of one frame's handshape."""

    thumb_straightness: float
    thumb_clearance: float
    thumb_abduction_degrees: float
    finger_curl_degrees: tuple[float, float, float, float]

    @property
    def four_fingers_folded(self) -> bool:
        return all(angle >= FINGER_FOLDED_MIN_DEGREES for angle in self.finger_curl_degrees)

    @property
    def four_fingers_extended(self) -> bool:
        return all(angle <= FINGER_EXTENDED_MAX_DEGREES for angle in self.finger_curl_degrees)

    def as_dict(self) -> dict[str, object]:
        return {
            "thumbStraightness": round(self.thumb_straightness, 4),
            "thumbClearance": round(self.thumb_clearance, 4),
            "thumbAbductionDegrees": round(self.thumb_abduction_degrees, 2),
            "fingerCurlDegrees": [round(angle, 2) for angle in self.finger_curl_degrees],
        }


@dataclass(frozen=True)
class HandshapeVerdict:
    """``accepted`` is False only when the geometry clearly contradicts ``symbol``."""

    symbol: str
    accepted: bool
    reason: str | None = None
    metrics: HandshapeMetrics | None = None

    @property
    def rejected(self) -> bool:
        return not self.accepted

    @property
    def feedback(self) -> str | None:
        return FEEDBACK.get(self.reason) if self.reason else None


def _unit(vector: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(vector))
    return vector / norm if norm > 1e-9 else np.zeros_like(vector)


def _angle_degrees(first: np.ndarray, second: np.ndarray) -> float:
    left, right = _unit(first), _unit(second)
    if not left.any() or not right.any():
        return 0.0
    return float(np.degrees(np.arccos(float(np.clip(np.dot(left, right), -1.0, 1.0)))))


def normalized_points(landmarks: Sequence[Landmark], handedness: str) -> np.ndarray:
    """Wrist-centred, palm-scaled points with left hands mirrored.

    The mirroring and the palm-scale divisor match
    ``feature_v3.landmarks_to_feature`` so the gate measures the same geometry the
    model was shown. Distances come out in palm-scale units — the mean
    wrist-to-knuckle length — which makes the thresholds independent of hand size
    and camera distance.
    """
    if len(landmarks) != LANDMARK_COUNT:
        raise ValueError(f"Expected {LANDMARK_COUNT} landmarks, got {len(landmarks)}")
    normalized_handedness = handedness.upper()
    if normalized_handedness not in {"LEFT", "RIGHT"}:
        raise ValueError("handedness must be LEFT or RIGHT")
    points = np.asarray([(item.x, item.y, item.z) for item in landmarks], dtype=np.float64)
    if normalized_handedness == "LEFT":
        points[:, 0] = 1.0 - points[:, 0]
    wrist = points[0].copy()
    palm_scale = float(np.mean(np.linalg.norm(points[list(_PALM_LANDMARKS)] - wrist, axis=1)))
    if palm_scale <= 1e-6:
        raise ValueError("Palm scale is invalid")
    return (points - wrist) / palm_scale


def measure(landmarks: Sequence[Landmark], handedness: str) -> HandshapeMetrics:
    points = normalized_points(landmarks, handedness)

    curls = tuple(
        _angle_degrees(points[pip] - points[mcp], points[tip] - points[dip])
        for mcp, pip, dip, tip in _FINGERS
    )

    chain_length = sum(
        float(np.linalg.norm(points[end] - points[start]))
        for start, end in zip(_THUMB_CHAIN, _THUMB_CHAIN[1:])
    )
    chord = float(np.linalg.norm(points[4] - points[1]))
    straightness = chord / chain_length if chain_length > 1e-6 else 0.0

    clearance = min(float(np.linalg.norm(points[4] - points[tip])) for tip in _FINGERTIPS)
    abduction = _angle_degrees(points[4] - points[2], points[8] - points[5])

    return HandshapeMetrics(
        thumb_straightness=float(np.clip(straightness, 0.0, 1.0)),
        thumb_clearance=clearance,
        thumb_abduction_degrees=abduction,
        finger_curl_degrees=(curls[0], curls[1], curls[2], curls[3]),
    )


def verify(symbol: str, landmarks: Sequence[Landmark], handedness: str) -> HandshapeVerdict:
    """Accept unless the thumb clearly contradicts a ㅎ or ㅂ prediction.

    Symbols other than ㅎ/ㅂ are accepted untouched, and so is any frame whose
    four-finger shape is not unambiguously a fist (for ㅎ) or unambiguously flat
    (for ㅂ): the veto needs the lazy handshape to be recognisable before it will
    claim the thumb is wrong. A malformed frame is accepted too — the gate must
    never be the thing that breaks recognition.
    """
    if not GATE_ENABLED or symbol not in GATED_SYMBOLS:
        return HandshapeVerdict(symbol, True)
    try:
        metrics = measure(landmarks, handedness)
    except (ValueError, IndexError, TypeError):
        return HandshapeVerdict(symbol, True)

    if symbol == "ㅎ":
        if metrics.four_fingers_folded and (
            metrics.thumb_straightness < HIEUT_MIN_THUMB_STRAIGHTNESS
            or metrics.thumb_clearance < HIEUT_MIN_THUMB_CLEARANCE
        ):
            # A fist whose thumb is bent, or straight but pinned to the fingers,
            # is a plain fist rather than 히읗.
            return HandshapeVerdict(symbol, False, THUMB_NOT_EXTENDED, metrics)
        return HandshapeVerdict(symbol, True, None, metrics)

    if metrics.four_fingers_extended and (
        metrics.thumb_straightness > BIEUP_MAX_THUMB_STRAIGHTNESS
        and metrics.thumb_abduction_degrees > BIEUP_MIN_THUMB_ABDUCTION_DEGREES
    ):
        # A flat hand whose thumb is straight *and* splayed away from the fingers
        # is an open hand rather than 비읍.
        return HandshapeVerdict(symbol, False, THUMB_NOT_FOLDED, metrics)
    return HandshapeVerdict(symbol, True, None, metrics)
