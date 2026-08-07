from __future__ import annotations

from collections import deque
from dataclasses import dataclass
import os

import numpy as np

from . import handshape_gate
from .diagnostics import PredictionDiagnostics
from .none_checker import VETO_FEEDBACK, NoneChecker, load_none_checker
from .feature_adapter import LANDMARK_COUNT, landmarks_to_features
from .messages import Landmark, prediction_message
from .model_adapter import SUPPRESSED_CONFIDENCE, ModelContract, ModelRunner


# Landmark smoothing (exponential moving average on the raw landmarks, applied
# before feature extraction).
#
# Frontal fingerspelling (ㅓ, ㅕ, ㅔ, ㅖ) points the fingers at the camera, so the
# fingertips occlude each other and MediaPipe loses their depth ordering. The
# landmarks then oscillate in place, which does not move the argmax much but
# collapses the gap to the runner-up — and the decision-margin gate turns that
# into a hard block. Measured on the locked test split with fingertip jitter
# injected at the landmark level (1900 sequences, confirmation rate under gate
# 0.25 + threshold 0.5):
#
#   jitter σ=0.015      accuracy 0.887   ㅔ 0.145   ㅖ 0.000   margin 0.234
#     + median-3        accuracy 0.938   ㅔ 0.242   ㅖ 0.305   margin 0.306
#     + EMA α=0.5       accuracy 0.948   ㅔ 0.387   ㅖ 0.390   margin 0.484
#     + EMA α=0.3       accuracy 0.966   ㅔ 0.677   ㅖ 0.627   margin 0.803
#
#   jitter σ=0.008      accuracy 0.970   ㅔ 0.387   ㅖ 0.729   margin 0.532
#     + EMA α=0.3       accuracy 0.977   ㅔ 1.000   ㅖ 0.797   margin 0.918
#
# α is the weight of the *new* frame, so a smaller value smooths harder and lags
# more. 1.0 disables smoothing. A median filter was measurably weaker than the
# EMA at every jitter level, so it is not used. See T-154 in
# docs/recognition/model-evaluation.md.
#
# DISABLED BY DEFAULT (T-155). The numbers above are real but they were measured
# against *synthetic* jitter: zero-mean displacement injected around otherwise
# correct landmarks. An EMA recovers the truth only when the error is zero-mean
# noise. Real MediaPipe self-occlusion failure is not that — it emits a
# systematically wrong pose (collapsed fingers, inverted depth order), and
# averaging a biased error just yields a smooth wrong pose plus added lag. Real
# use after deploying α=0.3 got worse, not better, and the reported oscillation
# was unchanged. Kept in the code (it is measured, tested, and one env var away)
# but shipped off until the actual failure mode is characterised from real
# frames rather than a synthetic model of it.
LANDMARK_SMOOTHING_ALPHA = float(os.getenv("HANDPRACTICE_AI_LANDMARK_SMOOTHING", "1.0"))


@dataclass(frozen=True)
class RecognitionConfig:
    hand_release_after_ms: int = 160


class RecognitionSession:
    """Connection-local model history; confirmation belongs to the browser decoder.

    The jamo build runs a dual-head ensemble, so each frame is converted into
    both the feature_v2 (55) and feature_v3 (78) representation from the same
    MediaPipe landmarks and buffered in parallel.
    """

    _SHARED_NONE_CHECKER: NoneChecker | None | bool = False  # False = not loaded yet

    def __init__(
        self,
        runner: ModelRunner,
        config: RecognitionConfig = RecognitionConfig(),
        smoothing_alpha: float = LANDMARK_SMOOTHING_ALPHA,
        diagnostics: PredictionDiagnostics | None = None,
        none_checker: NoneChecker | None = None,
    ) -> None:
        self._runner = runner
        self._config = config
        self._diagnostics = diagnostics if diagnostics is not None else PredictionDiagnostics()
        if none_checker is not None:
            self._none_checker = none_checker
        else:
            # Loaded once per process; every connection shares the session.
            if RecognitionSession._SHARED_NONE_CHECKER is False:
                RecognitionSession._SHARED_NONE_CHECKER = load_none_checker()
            self._none_checker = RecognitionSession._SHARED_NONE_CHECKER
        length = runner.contract.sequence_length
        self._sequence_v2: deque[np.ndarray] = deque(maxlen=length)
        self._sequence_v3: deque[np.ndarray] = deque(maxlen=length)
        self._missing_since: int | None = None
        self._smoothing_alpha = float(np.clip(smoothing_alpha, 0.05, 1.0))
        self._smoothed: np.ndarray | None = None
        self._smoothed_handedness: str | None = None

    @property
    def contract(self) -> ModelContract:
        return self._runner.contract

    @property
    def smoothing_alpha(self) -> float:
        return self._smoothing_alpha

    def _smooth(self, landmarks: tuple[Landmark, ...], handedness: str) -> tuple[Landmark, ...]:
        """EMA the raw landmarks so MediaPipe jitter does not reach the model.

        Off unless HANDPRACTICE_AI_LANDMARK_SMOOTHING is lowered below 1.0.

        The history is dropped when the hand switches, because the two hands are
        not the same trajectory and blending them would invent a pose.
        """
        if self._smoothing_alpha >= 1.0:
            return landmarks
        current = np.asarray([(point.x, point.y, point.z) for point in landmarks], dtype=np.float32)
        if self._smoothed is None or self._smoothed_handedness != handedness:
            self._smoothed = current
        else:
            self._smoothed = self._smoothed + (current - self._smoothed) * self._smoothing_alpha
        self._smoothed_handedness = handedness
        return tuple(Landmark(float(x), float(y), float(z)) for x, y, z in self._smoothed)

    def _padded(self, frames: list[np.ndarray], length: int) -> np.ndarray:
        if len(frames) < length:
            frames = [frames[0]] * (length - len(frames)) + frames
        return np.expand_dims(np.asarray(frames, dtype=np.float32), axis=0)

    def process_landmark_frame(
        self,
        frame_id: int,
        captured_at: int,
        landmarks: tuple[Landmark, ...],
        handedness: str = "RIGHT",
    ) -> list[dict[str, object]]:
        if len(landmarks) != LANDMARK_COUNT:
            raise ValueError(f"Expected {LANDMARK_COUNT} landmarks, got {len(landmarks)}")
        self._missing_since = None
        feature_v2, feature_v3 = landmarks_to_features(self._smooth(landmarks, handedness), handedness)
        self._sequence_v2.append(feature_v2)
        self._sequence_v3.append(feature_v3)

        length = self._runner.contract.sequence_length
        sequence_v2 = self._padded(list(self._sequence_v2), length)
        sequence_v3 = self._padded(list(self._sequence_v3), length)

        predict_pair = getattr(self._runner, "predict_pair", None)
        if predict_pair is not None:
            prediction = predict_pair(sequence_v2, sequence_v3)
        else:
            prediction = self._runner.predict(sequence_v3)

        if prediction.shape != (self._runner.contract.output_size,):
            raise ValueError(
                f"Expected {self._runner.contract.output_size} prediction values, got {prediction.shape}",
            )
        if not np.all(np.isfinite(prediction)) or np.any(prediction < 0) or np.any(prediction > 1):
            raise ValueError("Model prediction values must be finite probabilities between 0 and 1")
        # Recorded before argmax, with the landmarks the frontend actually sent,
        # so a capture stays replayable no matter how smoothing is configured.
        self._diagnostics.record(
            frame_id=frame_id,
            captured_at=captured_at,
            handedness=handedness,
            landmarks=landmarks,
            labels=self._runner.contract.labels,
            probabilities=prediction,
            buffered_frames=len(self._sequence_v3),
        )
        label_index = int(np.argmax(prediction))
        symbol = self._runner.contract.labels[label_index]
        confidence = float(prediction[label_index])
        candidate_indexes = np.argsort(-prediction, kind="stable")[:5]
        top_candidates = [
            {"symbol": self._runner.contract.labels[int(index)], "confidence": float(prediction[int(index)])}
            for index in candidate_indexes
        ]
        # Geometric veto for ㅎ and ㅂ, which the model confuses with a plain fist
        # and a fully open hand respectively — the difference is the thumb alone,
        # and the thumb is a small part of the feature vector. Measured on the raw
        # landmarks, *not* the smoothed ones: smoothing is off by default and when
        # it is on it lags, which would make the thumb check trail the real hand.
        #
        # Suppression matches the decision-margin gate: keep the label so
        # top-candidate feedback still shows what the handshape leaned towards, but
        # drop the confidence under every readiness threshold so the browser's
        # decoder can never confirm it. Only ㅎ/ㅂ frames are ever touched.
        verdict = handshape_gate.verify(symbol, landmarks, handedness)
        handshape_hint: str | None = None
        if verdict.rejected:
            confidence = SUPPRESSED_CONFIDENCE
            handshape_hint = verdict.feedback
            for candidate in top_candidates:
                if candidate["symbol"] == symbol:
                    candidate["confidence"] = SUPPRESSED_CONFIDENCE

        # Learned none-veto (T-161). Runs on the raw landmarks, only for letters
        # the checker was trained on, and only rejects — see app/none_checker.py.
        # Replaces the withdrawn geometric gate with performer-labelled data and a
        # threshold calibrated on held-out people.
        if (
            self._none_checker is not None
            and handshape_hint is None
            and self._none_checker.vetoes(symbol, landmarks, handedness)
        ):
            confidence = SUPPRESSED_CONFIDENCE
            handshape_hint = VETO_FEEDBACK
            for candidate in top_candidates:
                if candidate["symbol"] == symbol:
                    candidate["confidence"] = SUPPRESSED_CONFIDENCE

        # The frontend temporal decoder applies calibrated confidence, stability,
        # duplicate-lock, and neutral-release rules. The server never confirms.
        return [
            prediction_message(
                frame_id,
                symbol,
                confidence,
                False,
                captured_at,
                top_candidates,
                handshape_hint,
            ),
        ]

    def process_hand_not_detected(self, captured_at: int) -> list[dict[str, object]]:
        if self._missing_since is None:
            self._missing_since = captured_at
        elif captured_at - self._missing_since >= self._config.hand_release_after_ms:
            self._sequence_v2.clear()
            self._sequence_v3.clear()
            self._smoothed = None
            self._smoothed_handedness = None
        return []

    def reset(self) -> None:
        self._sequence_v2.clear()
        self._sequence_v3.clear()
        self._missing_since = None
        self._smoothed = None
        self._smoothed_handedness = None
