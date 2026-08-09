# -*- coding: utf-8 -*-
"""물리량 가드 — 단어별 '정상 수행 범위'(화이트리스트) 검사.

모델(분류기)은 학습에 없던 왜곡(동작 축소, 위치 이탈, 슬로모션)을 통과시키는
한계가 확인됨 (2026-08-05 미학습 왜곡 감사). 저차원 물리량은 모델 밖에서
학습 데이터의 분포 범위로 직접 검사한다.

검사 항목 (활성 손 기준, 어깨 너비 정규화):
  amp      동작 진폭 (손목 궤적 표준편차) — 흉내만 내는 축소 동작 차단
  mean_y   손 평균 높이 (어깨 중심 기준)  — 엉뚱한 위치 수행 차단
  speed    손목 경로 속도 (path/초)       — 슬로모션 차단 (시간 정보 있을 때만)
  duration 손 활성 구간 길이(초)          — 비정상 길이 차단 (시간 정보 있을 때만)

통계 파일: models/guard_stats.json (dataset/build_guard_stats.py로 생성)
"""
import json
import os

import numpy as np

L_SHO, R_SHO = 11, 12
TIP_IDX = [4, 8, 12, 16, 20]  # 엄지~새끼 손끝
EPS = 1e-6
METRIC_KO = {"amp": "동작 진폭", "mean_y": "손 높이", "mean_x": "손 좌우 위치",
             "speed": "동작 속도", "duration": "수행 시간",
             "art": "손가락 동작량",
             "curl_thumb": "엄지 굽힘", "curl_index": "검지 굽힘",
             "curl_middle": "중지 굽힘", "curl_ring": "약지 굽힘",
             "curl_pinky": "새끼 굽힘"}
CHECK_KEYS = ("amp", "mean_y", "mean_x", "speed", "duration", "art",
              "curl_thumb", "curl_index", "curl_middle", "curl_ring", "curl_pinky")


def finger_curls(hand):
    """(T,21,3) -> (T,5) 손가락별 굽힘도 (손끝-손목 거리 / 손 크기).
    펴짐 ~1.6-2.2, 접힘 ~0.6-1.0."""
    wrist = hand[:, 0]
    scale = np.linalg.norm(hand[:, 9] - wrist, axis=1)[:, None] + EPS
    tips = hand[:, TIP_IDX]
    return np.linalg.norm(tips - wrist[:, None, :], axis=2) / scale


def seg_to_arrays(seg):
    """LandmarkExtractor.process() 결과 목록 -> 배열 dict."""
    return {
        "pose": np.stack([f["pose"] for f in seg]),
        "lh": np.stack([f["lh"] for f in seg]),
        "rh": np.stack([f["rh"] for f in seg]),
        "pose_valid": np.array([f["pose_valid"] for f in seg]),
        "lh_valid": np.array([f["lh_valid"] for f in seg]),
        "rh_valid": np.array([f["rh_valid"] for f in seg]),
    }


def active_duration_s(lh_valid, rh_valid, fps):
    hv = np.where(np.asarray(lh_valid) | np.asarray(rh_valid))[0]
    if len(hv) < 2:
        return None
    return float((hv[-1] - hv[0]) / fps)


def clip_metrics(pose, lh, rh, pose_valid, lh_valid, rh_valid, duration_s=None):
    """활성 손(진폭 큰 쪽)의 물리량. 손이 거의 없으면 None."""
    pv = np.asarray(pose_valid, bool)
    sho = (pose[:, L_SHO, :2] + pose[:, R_SHO, :2]) / 2
    width = np.linalg.norm(pose[:, L_SHO, :2] - pose[:, R_SHO, :2], axis=1) + EPS
    if pv.any():  # 포즈 미검출 프레임은 유효 프레임 중앙값으로 대체
        sho = np.where(pv[:, None], sho, np.median(sho[pv], axis=0))
        width = np.where(pv, width, np.median(width[pv]))
    else:
        sho = np.full_like(sho, 0.5)
        width = np.full_like(width, 0.25)

    best = None
    for hand, valid in ((lh, lh_valid), (rh, rh_valid)):
        v = np.asarray(valid, bool)
        if v.sum() < 5:
            continue
        pos = (hand[v][:, 0, :2] - sho[v]) / width[v, None]
        c = finger_curls(hand[v])  # (n,5)
        cmed = np.median(c, axis=0)
        m = {
            "amp": float(np.sqrt(pos[:, 0].var() + pos[:, 1].var())),
            "mean_y": float(pos[:, 1].mean()),
            "mean_x": float(np.abs(pos[:, 0]).mean()),  # 몸 중심선 기준 좌우 거리 (좌우대칭 허용)
            "path": float(np.linalg.norm(np.diff(pos, axis=0), axis=1).sum()),
            "art": float(np.std(c, axis=0).mean()),  # 손가락 굽힘의 시간 변화량
            "curl_thumb": float(cmed[0]), "curl_index": float(cmed[1]),
            "curl_middle": float(cmed[2]), "curl_ring": float(cmed[3]),
            "curl_pinky": float(cmed[4]),
        }
        if best is None or m["amp"] > best["amp"]:
            best = m
    if best is None:
        return None
    if duration_s and duration_s > 0.1:
        best["duration"] = float(duration_s)
        best["speed"] = best["path"] / duration_s
    return best


class Guard:
    def __init__(self, stats_path, curl_total_threshold=0.4):
        with open(stats_path, encoding="utf-8") as f:
            self.stats = json.load(f)["words"]
        self.curl_total_threshold = curl_total_threshold

    @classmethod
    def try_load(cls, *paths):
        for p in paths:
            if p and os.path.exists(p):
                return cls(p)
        return None

    def check(self, word, metrics, lo_relax=None):
        """(통과 여부, 위반 목록[(항목, 값, 하한, 상한)]) 반환. 통계 없는 단어는 통과.

        lo_relax: {항목: 계수} — 해당 항목의 하한에 곱해 완화한다. 롤링 윈도우/
        강제 마감 꼬리처럼 동작의 시작·끝 전이가 안 담기는 구간은 진폭(amp)·
        손가락 동작량(art)이 학습 클립(전이 포함)보다 낮게 측정되므로, 연속
        반복 수행의 정속 구간을 거절하지 않으려면 하한을 낮춰 봐야 한다.
        """
        st = self.stats.get(word)
        if st is None or metrics is None:
            return True, []
        fails = []
        curl_violation = 0.0
        worst_curl = None
        for name in CHECK_KEYS:
            if name not in metrics or name not in st:
                continue
            lo, hi = st[name]
            if lo_relax and name in lo_relax:
                lo = round(lo * lo_relax[name], 4)
            v = metrics[name]
            if name.startswith("curl_"):
                # 손가락은 개별 판정 대신 위반량 합산 — 한 손가락 경계선 이탈은 허용,
                # 주먹<->펴짐 같은 다중·대폭 이탈만 차단
                over = max(0.0, lo - v, v - hi)
                curl_violation += over
                if over > 0 and (worst_curl is None or over > worst_curl[1]):
                    worst_curl = (name, over, v, lo, hi)
            elif not (lo <= v <= hi):
                fails.append((name, round(v, 3), lo, hi))
        if curl_violation > self.curl_total_threshold and worst_curl:
            name, _, v, lo, hi = worst_curl
            fails.append(("curl(" + name.split("_")[1] + f" 등, 합계 {curl_violation:.2f})",
                          round(v, 3), lo, hi))
        return not fails, fails
