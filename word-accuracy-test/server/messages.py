# -*- coding: utf-8 -*-
"""ksl-word-v7 websocket 프로토콜 — 프론트 `word-accuracy-test`용 최소 구현.

기존 word-model/server의 프로토콜을 확장한다: LANDMARK_FRAME에 9포인트 pose를
추가로 받고, PREDICTION 응답에 stage/verdict/feedback을 얹는다.
"""
from __future__ import annotations

from dataclasses import dataclass
import math
from typing import TypeAlias

import numpy as np


class ProtocolError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


POSE_POINTS = (
    "nose", "leftEar", "rightEar",
    "leftShoulder", "rightShoulder",
    "leftElbow", "rightElbow",
    "leftWrist", "rightWrist",
)


@dataclass(frozen=True)
class Landmark:
    x: float
    y: float
    z: float


@dataclass(frozen=True)
class DetectedHand:
    handedness: str
    landmarks: tuple[Landmark, ...]
    score: float | None = None


@dataclass(frozen=True)
class PoseKeypoints:
    points: dict[str, Landmark]


@dataclass(frozen=True)
class GetCapabilitiesRequest:
    pass


@dataclass(frozen=True)
class WordLandmarkFrameRequest:
    frame_id: int
    captured_at: int
    frame_width: int
    frame_height: int
    left_hand: DetectedHand | None
    right_hand: DetectedHand | None
    pose: PoseKeypoints | None


@dataclass(frozen=True)
class HandNotDetectedRequest:
    captured_at: int


@dataclass(frozen=True)
class ResetSequenceRequest:
    pass


ClientRequest: TypeAlias = (
    GetCapabilitiesRequest
    | WordLandmarkFrameRequest
    | HandNotDetectedRequest
    | ResetSequenceRequest
)
JsonValue: TypeAlias = (
    None
    | bool
    | int
    | float
    | str
    | list["JsonValue"]
    | dict[str, "JsonValue"]
)


def parse_request(raw_message: str) -> ClientRequest:
    import json

    try:
        payload = json.loads(raw_message)
    except json.JSONDecodeError as error:
        raise ProtocolError("INVALID_JSON", "Message must be valid JSON") from error
    if not isinstance(payload, dict):
        raise ProtocolError("INVALID_MESSAGE", "Message must be a JSON object")

    message_type = payload.get("type")
    if message_type == "GET_CAPABILITIES":
        return GetCapabilitiesRequest()
    if message_type == "RESET_SEQUENCE":
        return ResetSequenceRequest()
    if message_type == "HAND_NOT_DETECTED":
        return HandNotDetectedRequest(
            captured_at=_required_non_negative_int(payload, "capturedAt"),
        )
    if message_type == "LANDMARK_FRAME":
        hands = payload.get("hands")
        if not isinstance(hands, dict):
            raise ProtocolError("INVALID_HANDS", "hands must be an object")
        if "left" not in hands or "right" not in hands:
            raise ProtocolError("INVALID_HANDS", "hands must contain left and right")
        left_hand = _parse_hand(hands["left"], "left", "LEFT")
        right_hand = _parse_hand(hands["right"], "right", "RIGHT")
        if left_hand is None and right_hand is None:
            raise ProtocolError("NO_HANDS", "LANDMARK_FRAME must contain at least one hand")
        return WordLandmarkFrameRequest(
            frame_id=_required_non_negative_int(payload, "frameId"),
            captured_at=_required_non_negative_int(payload, "capturedAt"),
            frame_width=_required_positive_int(payload, "frameWidth"),
            frame_height=_required_positive_int(payload, "frameHeight"),
            left_hand=left_hand,
            right_hand=right_hand,
            pose=_parse_pose(payload.get("pose")),
        )
    raise ProtocolError("UNSUPPORTED_MESSAGE", "Unsupported message type")


def capabilities_message(
    model_version: str,
    labels: tuple[str, ...],
    sequence_length: int,
    minimum_frames: int,
    recommended_fps: int,
    confidence_threshold: float,
) -> dict[str, JsonValue]:
    non_wrong = [label for label in labels if label != "wrong"]
    thresholds = {label: confidence_threshold for label in non_wrong}
    return {
        "type": "CAPABILITIES",
        "modelVersion": model_version,
        "supportedSymbols": [*non_wrong, "wrong"],
        "sequenceLength": sequence_length,
        "confidenceThresholds": thresholds,
        "inputMode": "TWO_HAND_LANDMARK_SEQUENCE_WITH_POSE",
        "minimumFrames": minimum_frames,
        "windowFrames": sequence_length,
        "recommendedFps": recommended_fps,
        "coordinateSpace": "NORMALIZED_WITH_FRAME_SIZE",
        "landmarksPerHand": 21,
        "poseKeypoints": list(POSE_POINTS),
        "predictionResponseType": "PREDICTION",
    }


def prediction_message(
    frame_id: int,
    symbol: str,
    confidence: float,
    predicted_at: int,
    stage: str,
    is_stable: bool,
    verdict: str | None = None,
    feedback: list[str] | None = None,
    top_candidates: list[dict[str, object]] | None = None,
) -> dict[str, JsonValue]:
    message: dict[str, JsonValue] = {
        "type": "PREDICTION",
        "frameId": frame_id,
        "symbol": symbol,
        "confidence": confidence,
        "isStable": is_stable,
        "stage": stage,
        "predictedAt": predicted_at,
    }
    if verdict is not None:
        message["verdict"] = verdict
    if feedback:
        message["feedback"] = feedback
    if top_candidates is not None:
        message["topCandidates"] = top_candidates
    return message


def none_prediction(frame_id: int, predicted_at: int) -> dict[str, JsonValue]:
    return prediction_message(
        frame_id=frame_id,
        symbol="none",
        confidence=1.0,
        predicted_at=predicted_at,
        stage="live",
        is_stable=False,
    )


def error_message(code: str, message: str) -> dict[str, JsonValue]:
    return {"type": "ERROR", "code": code, "message": message}


def json_ready(value: JsonValue | np.generic | np.ndarray) -> JsonValue:
    if isinstance(value, np.generic):
        return json_ready(value.item())
    if isinstance(value, np.ndarray):
        return json_ready(value.tolist())
    if isinstance(value, list):
        return [json_ready(item) for item in value]
    if isinstance(value, dict):
        return {key: json_ready(item) for key, item in value.items()}
    return value


def _parse_hand(value: object, slot: str, expected_handedness: str) -> DetectedHand | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ProtocolError("INVALID_HAND", f"hands.{slot} must be an object or null")
    handedness = value.get("handedness")
    if handedness != expected_handedness:
        raise ProtocolError("INVALID_HANDEDNESS", f"hands.{slot}.handedness must be {expected_handedness}")
    raw_landmarks = value.get("landmarks")
    if not isinstance(raw_landmarks, list):
        raise ProtocolError("INVALID_LANDMARKS", f"hands.{slot}.landmarks must be an array")
    if len(raw_landmarks) != 21:
        raise ProtocolError("INVALID_LANDMARK_COUNT", f"Expected hands.{slot}.landmarks to contain 21 landmarks")
    landmarks = tuple(
        _parse_landmark(item, f"hands.{slot}.landmarks[{index}]")
        for index, item in enumerate(raw_landmarks)
    )
    raw_score = value.get("score")
    score = None
    if raw_score is not None:
        score = _finite_number(raw_score, f"hands.{slot}.score")
        if not 0.0 <= score <= 1.0:
            raise ProtocolError("INVALID_HAND_SCORE", f"hands.{slot}.score must be between 0 and 1")
    return DetectedHand(handedness=expected_handedness, landmarks=landmarks, score=score)


def _parse_pose(value: object) -> PoseKeypoints | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ProtocolError("INVALID_POSE", "pose must be an object or null")
    raw_landmarks = value.get("landmarks")
    if not isinstance(raw_landmarks, dict):
        raise ProtocolError("INVALID_POSE", "pose.landmarks must be an object")
    points: dict[str, Landmark] = {}
    for name in POSE_POINTS:
        raw_point = raw_landmarks.get(name)
        if raw_point is None:
            continue
        points[name] = _parse_landmark(raw_point, f"pose.landmarks.{name}")
    return PoseKeypoints(points=points)


def _parse_landmark(value: object, field: str) -> Landmark:
    if not isinstance(value, dict):
        raise ProtocolError("INVALID_LANDMARK", f"{field} must be an object")
    return Landmark(
        x=_finite_number(value.get("x"), f"{field}.x"),
        y=_finite_number(value.get("y"), f"{field}.y"),
        z=_finite_number(value.get("z"), f"{field}.z"),
    )


def _finite_number(value: object, field: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ProtocolError("INVALID_LANDMARK", f"{field} must be numeric")
    converted = float(value)
    if not math.isfinite(converted):
        raise ProtocolError("INVALID_LANDMARK", f"{field} must be finite")
    return converted


def _required_non_negative_int(payload: dict[str, object], key: str) -> int:
    value = payload.get(key)
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ProtocolError("INVALID_MESSAGE", f"{key} must be a non-negative integer")
    return value


def _required_positive_int(payload: dict[str, object], key: str) -> int:
    value = payload.get(key)
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ProtocolError("INVALID_FRAME_SIZE", f"{key} must be a positive integer")
    return value
