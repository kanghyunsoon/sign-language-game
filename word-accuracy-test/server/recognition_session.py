# -*- coding: utf-8 -*-
"""ksl-word-v7 세션 — RollingGrader를 프레임 단위 request/response 프로토콜에 맞춘다.

RollingGrader는 자체 타이밍(모션 온셋/오프셋)으로 live/final 이벤트를 "가끔"
방출하지만, 프론트(WordWebSocketSignRecognizer)는 보낸 LANDMARK_FRAME마다
정확히 한 번의 PREDICTION 응답을 기다리는 lock-step 프로토콜을 쓴다. 그래서
이벤트가 없는 프레임은 `none` placeholder로 채워 다음 프레임 전송을 막지 않는다.
"""
from __future__ import annotations

import numpy as np

from .messages import (
    DetectedHand,
    PoseKeypoints,
    WordLandmarkFrameRequest,
    none_prediction,
    prediction_message,
)

# MediaPipe Pose(33점) 인덱스 중 이 서버가 실제로 쓰는 것은 어깨(11, 12)뿐이다
# (guards.py/hand_rules.py의 어깨 기준 정규화). 나머지는 향후 확장 대비로 채워 둔다.
POSE_INDEX = {
    "nose": 0,
    "leftEar": 7,
    "rightEar": 8,
    "leftShoulder": 11,
    "rightShoulder": 12,
    "leftElbow": 13,
    "rightElbow": 14,
    "leftWrist": 15,
    "rightWrist": 16,
}


def _hand_to_array(hand: DetectedHand | None) -> tuple[np.ndarray, bool]:
    if hand is None:
        return np.zeros((21, 3), np.float32), False
    array = np.array([[lm.x, lm.y, lm.z] for lm in hand.landmarks], dtype=np.float32)
    return array, True


def _pose_to_array(pose: PoseKeypoints | None) -> tuple[np.ndarray, bool]:
    array = np.zeros((33, 3), np.float32)
    if pose is None or not pose.points:
        return array, False
    for name, index in POSE_INDEX.items():
        point = pose.points.get(name)
        if point is not None:
            array[index] = [point.x, point.y, point.z]
    return array, True


def request_to_landmark_dict(request: WordLandmarkFrameRequest) -> dict[str, object]:
    lh, lh_valid = _hand_to_array(request.left_hand)
    rh, rh_valid = _hand_to_array(request.right_hand)
    pose, pose_valid = _pose_to_array(request.pose)
    return {
        "pose": pose,
        "lh": lh,
        "rh": rh,
        "pose_valid": pose_valid,
        "lh_valid": lh_valid,
        "rh_valid": rh_valid,
    }


def _verdict_for(event: dict[str, object]) -> str:
    if event.get("guard_fails"):
        return "out-of-range"
    if event.get("rule_fails"):
        return "detail"
    if event["word"] == "wrong":
        return "wrong-form"
    return "correct"


def _feedback_for(event: dict[str, object]) -> list[str]:
    feedback: list[str] = []
    for name, value, low, high in event.get("guard_fails", []):
        feedback.append(f"{name} 값이 정상 범위({low}~{high})를 벗어났어요 (측정 {value})")
    for message, *_ in event.get("rule_fails", []):
        feedback.append(message)
    return feedback


class WordV7RecognitionSession:
    def __init__(self, grader) -> None:
        self._grader = grader

    def process_landmark_frame(
        self,
        request: WordLandmarkFrameRequest,
    ) -> list[dict[str, object]]:
        lm = request_to_landmark_dict(request)
        events = self._grader.push(lm, request.captured_at)
        if not events:
            return [none_prediction(request.frame_id, request.captured_at)]

        responses = []
        for event in events:
            stage = event["stage"]
            top3 = list(event.get("top3", []))
            top_candidates = [
                {"symbol": word, "confidence": confidence}
                for word, confidence in top3
            ] or None
            # rolling.py rounds top3 probabilities to 2 decimals but leaves
            # event["confidence"] (probs.max()) at full precision. The frontend
            # requires topCandidates[0] to exactly equal the top-level
            # symbol/confidence, so when top3 exists it is the source of truth
            # for both (rather than trying to reconcile two roundings).
            symbol = top3[0][0] if top3 else event["word"]
            confidence = top3[0][1] if top3 else event["confidence"]
            verdict = None if stage == "live" else _verdict_for(event)
            feedback = _feedback_for(event) if stage == "final" else None
            responses.append(
                prediction_message(
                    frame_id=request.frame_id,
                    symbol=symbol,
                    confidence=confidence,
                    predicted_at=request.captured_at,
                    stage=stage,
                    is_stable=stage == "final",
                    verdict=verdict,
                    feedback=feedback,
                    top_candidates=top_candidates,
                ),
            )
        return responses

    def process_hand_not_detected(self, captured_at: int) -> list[dict[str, object]]:
        del captured_at
        return []

    def reset(self) -> None:
        self._grader.reset()
