# -*- coding: utf-8 -*-
"""프레임 -> MediaPipe 랜드마크. 학습 전처리(dataset/extract_landmarks.py)와 동일한 로직.

동일해야 하는 것: 모델 파일(hand/pose task), 손 좌/우 할당 방식(포즈 손목 거리 기준).
"""
import os

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_MODELS = os.path.join(BASE, "dataset", "models")


def _lm_to_np(lms):
    return np.array([[l.x, l.y, l.z] for l in lms], dtype=np.float32)


class LandmarkExtractor:
    """VIDEO 모드 랜드마커. process()에 단조증가 타임스탬프(ms)를 넘길 것."""

    def __init__(self, models_dir=DEFAULT_MODELS):
        self.hand = vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=os.path.join(models_dir, "hand_landmarker.task")),
            running_mode=vision.RunningMode.VIDEO,
            num_hands=2,
            min_hand_detection_confidence=0.4,
            min_tracking_confidence=0.4,
        ))
        self.pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=os.path.join(models_dir, "pose_landmarker_lite.task")),
            running_mode=vision.RunningMode.VIDEO,
        ))
        self._last_ts = -1

    def process(self, frame_bgr, ts_ms):
        ts_ms = int(ts_ms)
        if ts_ms <= self._last_ts:  # 타임스탬프 역행 방지
            ts_ms = self._last_ts + 1
        self._last_ts = ts_ms
        img = mp.Image(image_format=mp.ImageFormat.SRGB,
                       data=cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
        pr = self.pose.detect_for_video(img, ts_ms)
        hr = self.hand.detect_for_video(img, ts_ms)

        if pr.pose_landmarks:
            pose = np.array([[l.x, l.y, l.z] for l in pr.pose_landmarks[0]], dtype=np.float32)
            pose_valid = True
        else:
            pose = np.zeros((33, 3), np.float32)
            pose_valid = False

        lh = rh = None
        hands = list(zip(hr.hand_landmarks, hr.handedness))
        if hands:
            if pose_valid:
                lw, rw = pose[15, :2], pose[16, :2]
                pairs = []
                for h in hands:
                    wrist = np.array([h[0][0].x, h[0][0].y], np.float32)
                    pairs.append((float(np.linalg.norm(wrist - lw)), "L", h))
                    pairs.append((float(np.linalg.norm(wrist - rw)), "R", h))
                pairs.sort(key=lambda p: p[0])
                used_h, used_s = set(), set()
                for _, side, h in pairs:
                    hid = id(h[0])
                    if hid in used_h or side in used_s:
                        continue
                    used_h.add(hid)
                    used_s.add(side)
                    if side == "L":
                        lh = _lm_to_np(h[0])
                    else:
                        rh = _lm_to_np(h[0])
            else:
                for h in hands:
                    if h[1][0].category_name == "Right":  # 셀피 기준 라벨 -> 반대
                        lh = _lm_to_np(h[0])
                    else:
                        rh = _lm_to_np(h[0])

        return {
            "pose": pose,
            "lh": lh if lh is not None else np.zeros((21, 3), np.float32),
            "rh": rh if rh is not None else np.zeros((21, 3), np.float32),
            "pose_valid": pose_valid,
            "lh_valid": lh is not None,
            "rh_valid": rh is not None,
        }
