from __future__ import annotations

import numpy as np

from app.feature_adapter import FEATURE_SIZE
from app.model_adapter import ModelContract


class MockModelRunner:
    def __init__(self, outputs: list[np.ndarray], sequence_length: int = 2, labels: tuple[str, ...] = ("ㄱ", "ㄴ")) -> None:
        self.contract = ModelContract(
            labels=labels,
            sequence_length=sequence_length,
            feature_size=FEATURE_SIZE,
            output_size=len(labels),
            model_version="mock-jamo-v1",
        )
        self._outputs = outputs
        self.calls: list[np.ndarray] = []

    def predict(self, sequence: np.ndarray) -> np.ndarray:
        self.calls.append(sequence.copy())
        if not self._outputs:
            raise AssertionError("Mock output queue is empty")
        return self._outputs.pop(0)


def valid_landmarks() -> tuple[dict[str, float], ...]:
    return tuple(
        {"x": 0.1 + index * 0.01, "y": 0.2 + index * 0.005, "z": -0.01 * index}
        for index in range(21)
    )


def landmark_frame(frame_id: int, captured_at: int) -> str:
    import json

    return json.dumps(
        {
            "type": "LANDMARK_FRAME",
            "frameId": frame_id,
            "capturedAt": captured_at,
            "handedness": "RIGHT",
            "landmarks": valid_landmarks(),
        },
    )
