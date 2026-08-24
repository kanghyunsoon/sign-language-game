"""Connection-local recognition state for the number-only server.

Mirrors `ai/game-server/app/recognition_session.py` in interface and in the
division of responsibility: the server reports what it sees per frame and never
confirms. Confirmation belongs to the browser decoder, which applies the
calibrated confidence, hold time, and neutral-release rules from
`recognition-policy.json`.

The one structural difference is that there is no frame window. The jamo model
takes a ten-frame sequence, so its session keeps a deque and pads it until full.
Sign numbers are static hand shapes, so each frame is classified on its own and
there is nothing to accumulate. That also removes a failure mode the sequence
version has: a fresh connection there pads the window by repeating the first
frame, which briefly reports on data it does not have yet.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .messages import Landmark, prediction_message
from numbermodel.adapter import NumberModelAdapter, NumberModelContract
from numbermodel.features import LANDMARK_COUNT


@dataclass(frozen=True)
class RecognitionConfig:
    hand_release_after_ms: int = 160
    top_candidates: int = 5


class RecognitionSession:
    """Per-connection state; confirmation belongs to the browser decoder."""

    def __init__(self, adapter: NumberModelAdapter, config: RecognitionConfig = RecognitionConfig()) -> None:
        self._adapter = adapter
        self._config = config
        self._missing_since: int | None = None

    @property
    def contract(self) -> NumberModelContract:
        return self._adapter.contract

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

        prediction = self._adapter.predict_frame(landmarks, handedness)
        if prediction.shape != (self.contract.output_size,):
            raise ValueError(
                f"Expected {self.contract.output_size} prediction values, got {prediction.shape}",
            )
        if not np.all(np.isfinite(prediction)) or np.any(prediction < 0) or np.any(prediction > 1):
            raise ValueError("Model prediction values must be finite probabilities between 0 and 1")

        label_index = int(np.argmax(prediction))
        symbol = self.contract.labels[label_index]
        confidence = float(prediction[label_index])
        candidates = self._adapter.top_candidates(prediction, self._config.top_candidates)
        # The frontend temporal decoder applies calibrated confidence, stability,
        # duplicate-lock, and neutral-release rules. The server never confirms.
        return [prediction_message(frame_id, symbol, confidence, False, captured_at, candidates)]

    def process_hand_not_detected(self, captured_at: int) -> list[dict[str, object]]:
        if self._missing_since is None:
            self._missing_since = captured_at
        return []

    def reset(self) -> None:
        self._missing_since = None
