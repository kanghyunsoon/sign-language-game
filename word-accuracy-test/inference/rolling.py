# -*- coding: utf-8 -*-
"""2단계 롤링 판정기 — 녹화 버튼 없이 연속 스트림에서 수행을 감지·채점한다.

Stage A (롤링 후보, 기본 초당 5회):
  최근 2.2초 윈도우를 주기 판정, 동일 라벨이 confirm_s(일반 0.6초 /
  방향단어·wrong 1.2초) 지속되면 '후보'로 승격 — 실시간 UI 피드백용.

Stage B (구간 확정, 최종 판정):
  모션 온셋(움직임 시작)~오프셋(quiet_s간 잠잠)을 추적해 시도 구간을 잘라
  전체 구간 판정 + 가드 풀세트(진폭·높이·속도·시간) 실행. 최종 판정은 여기서만.

사용:
    grader = RollingGrader("models/ksl-word-v6/model.int8.onnx",
                           "models/ksl-word-v6/labels.json")
    for frame:
        events = grader.push(ext.process(frame, ts_ms), ts_ms)
        for ev in events:
            ev["stage"]  # "live"(후보) | "final"(확정)
"""
import os
from collections import deque

import numpy as np

from recognizer import SignRecognizer
from guards import Guard, clip_metrics, seg_to_arrays
from hand_rules import HandRules


class RollingGrader:
    IDLE, ACTIVE = "idle", "active"

    def __init__(self, model_path, labels_path,
                 infer_interval_s=0.2,      # Stage A 판정 주기 (초당 5회)
                 confirm_s=0.6,             # 일반 단어 후보 확정에 필요한 지속 시간
                 direction_confirm_s=1.2,   # 방향 단어·wrong
                 window_s=2.2,              # Stage A 판정 윈도우
                 quiet_s=0.5,               # 이 시간 동안 모션 없으면 구간 종료
                 max_segment_s=5.0,         # 구간 강제 마감
                 min_active_s=0.35,         # 이보다 짧은 구간은 무시
                 pre_roll_s=0.3, post_roll_s=0.2,
                 buffer_s=6.5,
                 refractory_s=0.5,          # 확정 직후 새 온셋 무시
                 conf_threshold=0.6, wrong_conf_threshold=0.45,
                 min_hand_rate=0.3,
                 onset_motion=0.004,        # 구간 시작: 의도적 움직임 수준
                 offset_motion=0.0025):     # 구간 유지: 이 미만이면 '멈춤'(손 떨림 허용)
        self.rec = SignRecognizer(model_path, labels_path,
                                  conf_threshold=conf_threshold,
                                  wrong_conf_threshold=wrong_conf_threshold)
        self.guard = Guard.try_load(
            os.path.join(os.path.dirname(os.path.abspath(labels_path)), "guard_stats.json"),
            os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(labels_path))),
                         "guard_stats.json"))
        self.hand_rules = HandRules()  # 단어별 수형 규칙 (최종 검토 레이어)
        self.infer_interval_s = infer_interval_s
        self.confirm_s = confirm_s
        self.direction_confirm_s = direction_confirm_s
        self.window_s = window_s
        self.quiet_s = quiet_s
        self.max_segment_s = max_segment_s
        self.min_active_s = min_active_s
        self.pre_roll_s = pre_roll_s
        self.post_roll_s = post_roll_s
        self.buffer_s = buffer_s
        self.refractory_s = refractory_s
        self.min_hand_rate = min_hand_rate
        self.onset_motion = onset_motion
        self.offset_motion = offset_motion

        self.buf = deque()  # (ts_s, landmark dict)
        self.state = self.IDLE
        self._onset_ts = None
        self._last_motion_ts = None
        self._last_infer_ts = -1e9
        self._cand_label = None
        self._cand_since = None
        self._cand_emitted = False
        self._refractory_until = -1e9
        # UI용 진단 정보
        self.debug = {"state": self.IDLE, "live": None, "motion": 0.0, "hand_rate": 0.0}

    # ---------- 내부 유틸 ----------

    def _recent(self, ts, span):
        return [f for (t, f) in self.buf if t >= ts - span]

    def _motion_metrics(self, frames):
        """(손 검출률, 손별 분리 추적 프레임당 평균 이동량)"""
        if not frames:
            return 0.0, 0.0
        hand_rate = float(np.mean([f["lh_valid"] or f["rh_valid"] for f in frames]))
        motion = 0.0
        for key in ("lh", "rh"):
            disp, cnt, prev = 0.0, 0, None
            for f in frames:
                if f[key + "_valid"]:
                    cur = f[key][0, :2]
                    if prev is not None:
                        disp += float(np.linalg.norm(cur - prev))
                        cnt += 1
                    prev = cur
                else:
                    prev = None
            if cnt:
                motion = max(motion, disp / cnt)
        return hand_rate, motion

    def _confirm_need(self, label):
        if label in self.rec.direction_words or label == "wrong":
            return self.direction_confirm_s
        return self.confirm_s

    # ---------- Stage A: 롤링 후보 ----------

    def _stage_a(self, ts):
        frames = self._recent(ts, self.window_s)
        if len(frames) < self.rec.min_frames:
            return None
        probs, label = self.rec.predict_window(frames)
        conf = float(probs.max())
        threshold = (self.rec.wrong_conf_threshold if label == "wrong"
                     else self.rec.conf_threshold)
        top3 = [(w, round(float(p), 2)) for w, p in
                sorted(zip(self.rec.labels, probs), key=lambda t: -t[1])[:3]]
        ok = conf >= threshold
        if ok and self.guard and label != "wrong":  # 윈도우 가드: 진폭/높이만
            arr = seg_to_arrays(frames)
            m = clip_metrics(arr["pose"], arr["lh"], arr["rh"], arr["pose_valid"],
                             arr["lh_valid"], arr["rh_valid"])
            if m:
                m.pop("speed", None)
                ok, _ = self.guard.check(label, m)
        if not ok:
            self._cand_label, self._cand_since, self._cand_emitted = None, None, False
            self.debug["live"] = {"label": label, "conf": conf, "top3": top3,
                                  "sustained": 0.0, "need": self._confirm_need(label)}
            return None
        if label != self._cand_label:
            self._cand_label, self._cand_since, self._cand_emitted = label, ts, False
        sustained = ts - self._cand_since
        need = self._confirm_need(label)
        self.debug["live"] = {"label": label, "conf": conf, "top3": top3,
                              "sustained": round(sustained, 2), "need": need}
        if sustained >= need and not self._cand_emitted:
            self._cand_emitted = True
            return {"stage": "live", "word": label, "confidence": conf, "top3": top3}
        return None

    # ---------- Stage B: 구간 확정 ----------

    def _finalize(self, ts, forced=False):
        onset, offset = self._onset_ts, (self._last_motion_ts or ts)
        self.state = self.IDLE
        self._onset_ts = self._last_motion_ts = None
        self._cand_label, self._cand_since, self._cand_emitted = None, None, False
        self._refractory_until = ts + self.refractory_s

        active_s = offset - onset
        if active_s < self.min_active_s:
            return None
        seg = [f for (t, f) in self.buf
               if onset - self.pre_roll_s <= t <= offset + self.post_roll_s]
        if len(seg) < 10:
            return None
        probs, pred = self.rec.predict_window(seg)
        conf = float(probs.max())
        top3 = [(w, round(float(p), 2)) for w, p in
                sorted(zip(self.rec.labels, probs), key=lambda t: -t[1])[:3]]
        guard_fails, rule_fails = [], []
        if pred != "wrong":
            arr = seg_to_arrays(seg)
            if self.guard:
                m = clip_metrics(arr["pose"], arr["lh"], arr["rh"], arr["pose_valid"],
                                 arr["lh_valid"], arr["rh_valid"], duration_s=active_s)
                _, guard_fails = self.guard.check(pred, m)
            _, rule_fails = self.hand_rules.check(pred, arr)  # 수형 규칙 (사람 정의)
        return {"stage": "final", "word": pred, "confidence": conf, "top3": top3,
                "guard_fails": guard_fails, "rule_fails": rule_fails,
                "duration_s": round(active_s, 2), "forced": forced}

    # ---------- 메인 ----------

    def reset(self):
        self.buf.clear()
        self.state = self.IDLE
        self._onset_ts = self._last_motion_ts = None
        self._cand_label, self._cand_since, self._cand_emitted = None, None, False
        self._last_infer_ts = -1e9
        self._refractory_until = -1e9

    def push(self, lm, ts_ms):
        """프레임마다 호출. 발생한 이벤트 목록(live/final) 반환."""
        ts = ts_ms / 1000.0
        self.buf.append((ts, lm))
        while self.buf and ts - self.buf[0][0] > self.buffer_s:
            self.buf.popleft()

        hand_rate, motion = self._motion_metrics(self._recent(ts, 0.8))
        self.debug.update(hand_rate=round(hand_rate, 2), motion=round(motion, 4))
        hands = hand_rate >= self.min_hand_rate
        events = []

        if self.state == self.IDLE:
            # 히스테리시스: 시작은 의도적 움직임(onset)에서만 — 손을 든 채 대기 가능
            if hands and motion >= self.onset_motion and ts >= self._refractory_until:
                self.state = self.ACTIVE
                self._onset_ts = ts - 0.4  # 상승 검출 지연 보정
                self._last_motion_ts = ts
        else:  # ACTIVE
            # 유지 조건은 낮은 임계(offset): 미세 떨림으로는 구간이 안 끊기고,
            # 손을 내리지 않고 멈추기만 해도 quiet_s 뒤 확정된다
            if hands and motion >= self.offset_motion:
                self._last_motion_ts = ts
            if ts - self._last_motion_ts >= self.quiet_s:
                ev = self._finalize(ts)
                if ev:
                    events.append(ev)
            elif ts - self._onset_ts >= self.max_segment_s:
                ev = self._finalize(ts, forced=True)
                if ev:
                    events.append(ev)
            elif ts - self._last_infer_ts >= self.infer_interval_s:
                self._last_infer_ts = ts
                ev = self._stage_a(ts)
                if ev:
                    events.append(ev)
        self.debug["state"] = self.state
        return events

    def flush(self, ts_ms):
        """스트림 종료 시 진행 중이던 구간을 강제 확정."""
        if self.state == self.ACTIVE:
            return self._finalize(ts_ms / 1000.0, forced=True)
        return None
