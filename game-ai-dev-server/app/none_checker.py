from __future__ import annotations

from pathlib import Path
import json
import os

import numpy as np

from .messages import Landmark
from .project_paths import REPOSITORY_ROOT


# Learned none-veto for confidently-wrong accepts (T-161).
#
# The deployed ensemble is a closed set: every hand it sees must become one of 31
# jamo, so a lazy or flipped pose is accepted with high confidence rather than
# rejected. T-157's geometric gate tried to fix this with hand-written thumb rules
# and failed twice — the discriminator was invented, not measured (see T-158).
# This module replaces the rules with a small classifier trained on
# performer-labelled team captures (bhn v1+v2): the correct rendering of each
# covered letter, plus a `none` class of lazy, half-made and orientation-flipped
# poses. What made the geometric gate wrong — thresholds I made up — is here
# learned from data, and the suppression threshold below is calibrated on two
# held-out people, not chosen by hand.
#
# The checker is a veto, never a promoter, and it is scoped twice:
#   * It only runs when the ensemble's argmax is one of the letters in
#     _ID_TO_SYMBOL below. For any other letter the checker has never seen the
#     correct pose, so its opinion would be noise.
#   * It only suppresses when P(none) clears a calibrated threshold.
#
# Suppression is identical to the decision-margin gate: the label survives so
# top-candidate feedback still shows what the pose leaned towards, but the
# confidence drops below every readiness threshold, so the browser decoder can
# never confirm the frame.
#
# The model file ships OUTSIDE the image, next to the jamo ensemble in the
# mounted models directory (/opt/sudal/ai/models/none-checker-v1/). If the file
# is absent the checker disables itself and the server behaves exactly as
# before, so this code can deploy ahead of the model file.

CHECKER_DIRECTORY = Path(
    os.getenv("HANDPRACTICE_AI_NONE_CHECKER_DIR", str(REPOSITORY_ROOT / "models" / "none-checker-v1")),
)
CHECKER_ENABLED = os.getenv("HANDPRACTICE_AI_NONE_VETO", "1").strip().lower() not in {"0", "false", "off"}

# Feature layout must match ai/src/fingerspellingAi/normalization.py, which is
# what the checker was trained on (screen landmarks passed through it).
_ORIGIN_INDEX = 0
_SCALE_INDICES = (5, 9, 13, 17)
_LANDMARK_COUNT = 21

# labels.json id -> the symbol the jamo server emits. This mapping is also the
# veto scope, and it is deliberately narrower than what the checker was trained
# on (8 classes):
#
#   * ㅕ (vowel_yeo) was excluded at calibration time — false-veto 10.6% on the
#     held-out people, five times the 2% budget.
#   * ㅓ ㅔ ㅖ ㅡ were excluded after live feedback. Frontal vowels occlude their
#     own fingertips, so real-time frames are far noisier than the calibration
#     captures (steady, held poses): P(none) crossed the threshold frame by
#     frame and the on-screen confidence flapped between 5% and normal. The
#     calibration false-veto rates (0-1.6%) were real but measured on the wrong
#     distribution for these letters.
#
# ㅂ and ㅎ keep the veto: their poses are stable on camera (measured false-veto
# 0% / 1.7%), and they are the letters the confidently-wrong-accept bug was
# reported against. Re-admit a vowel only after measuring its live false-veto
# rate, not the held-capture rate.
_ID_TO_SYMBOL = {
    "consonant_bieup": "ㅂ",
    "consonant_hieut": "ㅎ",
}

VETO_FEEDBACK = "손 모양이 지문자와 조금 달라요. 자세를 다시 만들어 주세요."


def _features(landmarks: tuple[Landmark, ...], handedness: str) -> np.ndarray:
    points = np.asarray([(p.x, p.y, p.z) for p in landmarks], dtype=np.float32)
    if points.shape != (_LANDMARK_COUNT, 3):
        raise ValueError(f"Expected {_LANDMARK_COUNT} landmarks, got {points.shape}")
    centered = points - points[_ORIGIN_INDEX]
    if handedness.upper() != "RIGHT":
        centered[:, 0] *= -1.0
    scale = float(np.linalg.norm(centered[list(_SCALE_INDICES)], axis=1).mean())
    if not np.isfinite(scale) or scale <= 1e-6:
        raise ValueError("Palm scale is too small to normalise")
    return (centered / scale).reshape(1, _LANDMARK_COUNT * 3)


class NoneChecker:
    """Small ONNX classifier that estimates P(this frame is not a fingerspelling pose)."""

    def __init__(self, directory: Path = CHECKER_DIRECTORY) -> None:
        manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
        class_ids = list(manifest["classIds"])
        if class_ids[0] != "none":
            raise ValueError("The none-checker contract requires `none` as class 0")
        self.threshold = float(
            os.getenv("HANDPRACTICE_AI_NONE_VETO_THRESHOLD", manifest["noneThreshold"]),
        )
        self.covered_symbols = frozenset(
            _ID_TO_SYMBOL[class_id] for class_id in class_ids[1:] if class_id in _ID_TO_SYMBOL
        )
        import onnxruntime

        self._session = onnxruntime.InferenceSession(
            str(directory / "none-checker.onnx"),
            providers=["CPUExecutionProvider"],
        )

    def none_probability(self, landmarks: tuple[Landmark, ...], handedness: str) -> float:
        try:
            features = _features(landmarks, handedness)
        except ValueError:
            # A malformed frame must never be the checker's problem; the message
            # layer already validated the landmark count, so just stand aside.
            return 0.0
        probabilities = self._session.run(None, {"features": features})[0]
        return float(probabilities[0][0])

    def vetoes(self, symbol: str, landmarks: tuple[Landmark, ...], handedness: str) -> bool:
        if symbol not in self.covered_symbols:
            return False
        return self.none_probability(landmarks, handedness) >= self.threshold


def load_none_checker() -> NoneChecker | None:
    """The deployed checker, or None when disabled or not shipped yet."""
    if not CHECKER_ENABLED:
        return None
    if not (CHECKER_DIRECTORY / "manifest.json").is_file():
        return None
    try:
        return NoneChecker()
    except Exception:
        # A broken model file must not take recognition down with it.
        return None
