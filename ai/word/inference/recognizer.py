# -*- coding: utf-8 -*-
"""슬라이딩 윈도우 수어 단어 인식기 (CPU, ONNX INT8).

사용:
    rec = SignRecognizer("models/ksl-word-v3/model.int8.onnx",
                         "models/ksl-word-v3/labels.json")
    event = rec.push(frame_landmarks)   # LandmarkExtractor.process() 결과를 프레임마다
    if event: print(event["word"], event["confidence"])

동작:
- 프레임 랜드마크를 링 버퍼(기본 64프레임 ≈ 2초)에 쌓고 stride(기본 8프레임)마다 추론.
- 게이팅: 윈도우 내 손 검출률/움직임이 낮으면 추론 생략 (무동작 구간 오탐+연산 절약).
- 확정: 신뢰도 임계값 이상 + 연속 K윈도우 동일 예측 -> 이벤트 방출.
  같은 단어는 refractory 시간 동안 재방출 억제.
"""
import json
import os
from collections import deque

import numpy as np
import onnxruntime as ort

from features import clip_features, sample_frames
from guards import Guard, clip_metrics, seg_to_arrays


def _softmax(x):
    e = np.exp(x - x.max())
    return e / e.sum()


class SignRecognizer:
    def __init__(self, model_path, labels_path, window=64, stride=8,
                 conf_threshold=0.6, consecutive=2, min_hand_rate=0.3,
                 min_motion=0.0015, refractory_windows=10, min_frames=16,
                 gate_window=24, max_gated_skips=2, wrong_conf_threshold=0.45,
                 direction_consecutive=4, consecutive_overrides=None):
        with open(labels_path, encoding="utf-8") as f:
            meta = json.load(f)
        self.labels = meta["labels"]
        self.seq_len = meta["seq_len"]
        # 방향이 의미를 가르는 단어: 동작 전체를 보기 전에 확정하지 않도록 streak 강화
        self.direction_words = set(meta.get("direction_words", []))
        self.direction_consecutive = direction_consecutive
        # 단어별 예외 (동작이 짧아 강화 streak을 못 채우는 단어 등)
        self.consecutive_overrides = dict(consecutive_overrides or {})
        # 물리량 가드 (진폭/높이) — 스트리밍은 시간 정보가 없어 speed/duration 제외
        self.guard = Guard.try_load(
            os.path.join(os.path.dirname(os.path.abspath(labels_path)), "guard_stats.json"),
            os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(labels_path))),
                         "guard_stats.json"))
        self.sess = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
        self.window = window
        self.stride = stride
        self.conf_threshold = conf_threshold
        self.consecutive = consecutive
        self.min_hand_rate = min_hand_rate
        self.min_motion = min_motion
        self.refractory_windows = refractory_windows
        self.min_frames = min_frames
        self.gate_window = gate_window      # 게이트 판정에 쓰는 최근 프레임 수 (빠른 반응)
        self.max_gated_skips = max_gated_skips  # 이 횟수 연속 게이트 차단 시 streak 리셋
        # 'wrong'(방향 오류 negative)은 이질적인 클래스라 확신이 낮게 나옴 -> 낮은 임계값
        self.wrong_conf_threshold = wrong_conf_threshold

        self.buf = deque(maxlen=window)
        self._since_infer = 0
        self._streak_label = None
        self._streak = 0
        self._gated_count = 0
        self._suppress = {}  # label -> 남은 윈도우 수
        # 최근 추론 틱의 진단 정보 (HUD/디버깅용)
        self.debug = {"state": "buffering", "hand_rate": 0.0, "motion": 0.0,
                      "label": None, "conf": 0.0, "top3": [], "streak": 0,
                      "streak_need": consecutive, "infer_ms": 0.0}

    def reset(self):
        self.buf.clear()
        self._since_infer = 0
        self._streak_label, self._streak = None, 0
        self._gated_count = 0
        self._suppress.clear()

    def _stack(self, frames):
        return {k: np.stack([f[k] for f in frames]) for k in ("pose", "lh", "rh")} | \
               {k: np.array([f[k] for f in frames]) for k in ("pose_valid", "lh_valid", "rh_valid")}

    def predict_window(self, frames):
        """frames(랜드마크 dict 목록) -> (probs, label). 게이팅 없이 바로 추론."""
        d = self._stack(frames)
        feats = clip_features(d["pose"], d["lh"], d["rh"],
                              d["pose_valid"], d["lh_valid"], d["rh_valid"])
        x = sample_frames(feats, self.seq_len)[None].astype(np.float32)
        logits = self.sess.run(None, {"features": x})[0][0]
        probs = _softmax(logits)
        return probs, self.labels[int(probs.argmax())]

    def _gate_metrics(self, frames):
        """(통과 여부, 손 검출률, 평균 이동량). 최근 gate_window 프레임만 사용해
        직전 동작의 잔상/새 동작의 희석 없이 빠르게 반응한다."""
        recent = frames[-self.gate_window:]
        hand_rate = float(np.mean([f["lh_valid"] or f["rh_valid"] for f in recent]))
        # 움직임: 손별로 분리 추적(손 전환 시 가짜 점프 방지), 두 손 중 큰 쪽 사용
        motion = 0.0
        for key in ("lh", "rh"):
            disp, cnt, prev = 0.0, 0, None
            for f in recent:
                if f[key + "_valid"]:
                    cur = f[key][0, :2]
                    if prev is not None:
                        disp += float(np.linalg.norm(cur - prev))
                        cnt += 1
                    prev = cur
                else:
                    prev = None  # 끊긴 구간은 변위 계산에서 제외
            if cnt:
                motion = max(motion, disp / cnt)
        passed = hand_rate >= self.min_hand_rate and motion >= self.min_motion
        return passed, hand_rate, motion

    def _gates_pass(self, frames):
        return self._gate_metrics(frames)[0]

    def _guard_pass(self, word, frames):
        """물리량 가드 (진폭/높이). wrong 이벤트는 검사하지 않음."""
        if self.guard is None or word == "wrong":
            return True
        arr = seg_to_arrays(frames)
        m = clip_metrics(arr["pose"], arr["lh"], arr["rh"], arr["pose_valid"],
                         arr["lh_valid"], arr["rh_valid"])
        ok, fails = self.guard.check(word, m)
        self.debug["guard_fails"] = fails
        return ok

    def flush(self):
        """스트림/구간 종료 시 호출 — 남은 버퍼로 마지막 판정 (연속 조건 1회로 완화)."""
        if len(self.buf) < self.min_frames:
            return None
        frames = list(self.buf)
        if not self._gates_pass(frames):
            return None
        probs, label = self.predict_window(frames)
        conf = float(probs.max())
        threshold = self.wrong_conf_threshold if label == "wrong" else self.conf_threshold
        if conf >= threshold and label not in self._suppress and self._guard_pass(label, frames):
            self._suppress[label] = self.refractory_windows
            return {"word": label, "confidence": conf,
                    "probs": {w: round(float(p), 3)
                              for w, p in sorted(zip(self.labels, probs),
                                                 key=lambda t: -t[1])[:3]}}
        return None

    def push(self, frame_landmarks):
        """프레임마다 호출. 단어가 확정되면 이벤트 dict, 아니면 None."""
        self.buf.append(frame_landmarks)
        self._since_infer += 1
        if len(self.buf) < self.min_frames:
            self.debug["state"] = "buffering"
            return None
        if self._since_infer < self.stride:
            return None
        self._since_infer = 0

        for k in list(self._suppress):
            self._suppress[k] -= 1
            if self._suppress[k] <= 0:
                del self._suppress[k]

        frames = list(self.buf)
        passed, hand_rate, motion = self._gate_metrics(frames)
        self.debug.update(hand_rate=round(hand_rate, 2), motion=round(motion, 4))
        if not passed:
            # 게이트 차단은 '반대 증거'가 아니므로 streak을 바로 버리지 않는다
            # (짧은 동작이 확정되기 전에 모션이 잦아드는 경우 대비)
            self._gated_count += 1
            if self._gated_count > self.max_gated_skips:
                self._streak_label, self._streak = None, 0
            self.debug.update(state="idle (gated)", label=None, conf=0.0, top3=[],
                              streak=self._streak)
            return None
        self._gated_count = 0

        import time as _t
        t0 = _t.perf_counter()
        probs, label = self.predict_window(frames)
        conf = float(probs.max())
        top3 = [(w, round(float(p), 3)) for w, p in
                sorted(zip(self.labels, probs), key=lambda t: -t[1])[:3]]
        self.debug.update(state="inferring", label=label, conf=round(conf, 3), top3=top3,
                          infer_ms=round((_t.perf_counter() - t0) * 1000, 1))
        threshold = self.wrong_conf_threshold if label == "wrong" else self.conf_threshold
        if conf < threshold:
            self._streak_label, self._streak = None, 0
            self.debug["streak"] = 0
            return None
        if label == self._streak_label:
            self._streak += 1
        else:
            self._streak_label, self._streak = label, 1
        self.debug["streak"] = self._streak
        # 방향 단어와 wrong(방향 오류)은 동작 전체를 보기 전 확정하지 않도록 streak 강화
        if label in self.consecutive_overrides:
            need = self.consecutive_overrides[label]
        elif label in self.direction_words or label == "wrong":
            need = self.direction_consecutive
        else:
            need = self.consecutive
        self.debug["streak_need"] = need
        if self._streak >= need and label not in self._suppress \
                and self._guard_pass(label, frames):
            self._suppress[label] = self.refractory_windows
            self._streak = 0
            return {"word": label, "confidence": conf,
                    "probs": {w: round(float(p), 3)
                              for w, p in sorted(zip(self.labels, probs),
                                                 key=lambda t: -t[1])[:3]}}
        return None
