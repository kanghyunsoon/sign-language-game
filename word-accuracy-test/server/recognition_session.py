# -*- coding: utf-8 -*-
"""ksl-word-v7 세션 — RollingGrader를 프레임 단위 request/response 프로토콜에 맞춘다.

RollingGrader는 자체 타이밍(모션 온셋/오프셋)으로 live/final 이벤트를 "가끔"
방출하지만, 프론트(WordWebSocketSignRecognizer)는 보낸 LANDMARK_FRAME마다
정확히 한 번의 PREDICTION 응답을 기다리는 lock-step 프로토콜을 쓴다. 그래서
이벤트가 없는 프레임은 `none` placeholder로 채워 다음 프레임 전송을 막지 않는다.
"""
from __future__ import annotations

import math

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


def _guard_message(name: str, value: float, low: float, high: float) -> tuple[str, str]:
    """가드 항목·값 -> (카테고리, 사용자 노출용 한국어 문구).

    guards.py의 원시 항목명·측정치·허용범위를 그대로 보여주지 않는다 — 그건
    내부 파라미터이지 사용자에게 의미 있는 피드백이 아니다. 카테고리는
    같은 종류 실패가 여러 개일 때 중복 문구를 걸러내는 데 쓴다.
    """
    base = name.split("(", 1)[0]
    if base == "duration":
        if value > high:
            # round()는 은행가 반올림(4.5 -> 4)이라 안내 문구가 실제 상한보다
            # 작게 보일 수 있어, 절사 대신 올림 방향으로 반올림한다.
            rounded_high = math.floor(high + 0.5)
            return "duration", f"동작이 너무 길었어요 — 약 {rounded_high}초 안에 한 번에 이어서 해보세요"
        return "duration", "동작을 끊지 말고 한 번에 이어서 해보세요"
    if base == "amp":
        return "amp", "동작을 조금 더 크게 해주세요"
    if base == "speed":
        return "speed", "조금 더 빠르게 해주세요"
    if base in ("mean_y", "mean_x"):
        return "position", "가슴 앞, 화면 중앙에서 동작해 주세요"
    if base == "art" or base.startswith("curl"):
        return "finger", "손가락 모양을 정확하게 해주세요"
    return base, "동작을 다시 한번 정확하게 해주세요"


def _feedback_for(event: dict[str, object]) -> list[str]:
    rule_messages = [message for message, *_ in event.get("rule_fails", [])]
    has_rule_feedback = bool(rule_messages)

    guard_messages: list[str] = []
    seen_categories: set[str] = set()
    for name, value, low, high in event.get("guard_fails", []):
        category, message = _guard_message(name, value, low, high)
        # 규칙 레이어(hand_rules.py)가 이미 더 구체적인 손가락 문구를 준다면
        # 가드의 일반적인 "손가락 모양을 정확하게 해주세요"는 중복이라 뺀다.
        if category == "finger" and has_rule_feedback:
            continue
        if category in seen_categories:
            continue
        seen_categories.add(category)
        guard_messages.append(message)

    return rule_messages + guard_messages


def _empty_landmark_dict() -> dict[str, object]:
    return {
        "pose": np.zeros((33, 3), np.float32),
        "lh": np.zeros((21, 3), np.float32),
        "rh": np.zeros((21, 3), np.float32),
        "pose_valid": False,
        "lh_valid": False,
        "rh_valid": False,
    }


def _events_to_messages(
    events: list[dict[str, object]],
    frame_id: int,
    predicted_at: int,
) -> list[dict[str, object]]:
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
                frame_id=frame_id,
                symbol=symbol,
                confidence=confidence,
                predicted_at=predicted_at,
                stage=stage,
                is_stable=stage == "final",
                verdict=verdict,
                feedback=feedback,
                top_candidates=top_candidates,
            ),
        )
    return responses


class WordV7RecognitionSession:
    def __init__(self, grader) -> None:
        self._grader = grader
        self._last_frame_id = 0

    def process_landmark_frame(
        self,
        request: WordLandmarkFrameRequest,
    ) -> list[dict[str, object]]:
        self._last_frame_id = request.frame_id
        lm = request_to_landmark_dict(request)
        events = self._grader.push(lm, request.captured_at)
        if not events:
            return [none_prediction(request.frame_id, request.captured_at)]
        return _events_to_messages(events, request.frame_id, request.captured_at)

    def process_hand_not_detected(self, captured_at: int) -> list[dict[str, object]]:
        # RollingGrader의 온셋/오프셋 판정은 push()가 계속 호출돼야 진행된다.
        # 손이 안 보이는 동안 LANDMARK_FRAME이 안 오면(양손 미검출 -> 이 메서드만
        # 호출됨) 직전 동작 구간의 quiet_s 경과를 감지할 기회가 없어, 이미 끝난
        # 수행이 다음 LANDMARK_FRAME이 올 때까지(=사용자가 손을 다시 보여줄 때)
        # 확정되지 않고 미뤄진다. 그래서 손 미검출 프레임도 빈 landmark로 계속
        # push해 grader 내부 시계를 흘려보낸다.
        events = self._grader.push(_empty_landmark_dict(), captured_at)
        if not events:
            return []
        return _events_to_messages(events, self._last_frame_id, captured_at)

    def reset(self) -> None:
        self._grader.reset()
        self._last_frame_id = 0
