# -*- coding: utf-8 -*-
"""단어별 수형 규칙 엔진 — 사람이 명시한 손가락 조건의 최종 검토 레이어.

데이터 분포 기반 가드(guards.py)가 놓치는 '단어의 정의적 조건'을 직접 검사한다.
규칙은 inference/hand_rules.json에 사람이 작성/수정 (임계값 보정은 --calibrate 사용).

물리량 (프레임당, 활성 손 기준):
  curl(finger)          손끝~손목 거리 / 손 크기. 펴짐 ~1.6-2.2, 말림 ~0.6-1.0
  bend(finger)          관절 굽힘각 합(도). 쭉 폄 ~0-40, 갈고리 ~60-140, 완전 말림 ~150+
  spread(f1, f2)        두 손가락 방향 사이 각(도). 붙임 ~0-10, 벌림(V) ~20+
  pinch(f1, f2)         두 손끝 거리 / 손 크기. 붙임 ~0-0.3, 벌림 ~0.7+

집계: med(중앙값) | min | max | range(시간 변화폭 = p95-p5)

규칙 예 (hand_rules.json):
  "bus": [{"metric": "bend", "finger": "index", "agg": "med", "min": 40, "max": 150,
           "msg": "검지를 갈고리 모양으로 살짝 굽히세요"}]

보정: python inference/hand_rules.py --calibrate bus   (학습 클립 분포 출력)
"""
import argparse
import json
import os
import sys

import numpy as np

FINGERS = {"thumb": [1, 2, 3, 4], "index": [5, 6, 7, 8], "middle": [9, 10, 11, 12],
           "ring": [13, 14, 15, 16], "pinky": [17, 18, 19, 20]}
EPS = 1e-6
RULES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hand_rules.json")


def _scale(hand):
    return np.linalg.norm(hand[:, 9] - hand[:, 0], axis=1)[:, None] + EPS


def curl(hand, finger):
    """(T,21,3) -> (T,)"""
    tip = FINGERS[finger][-1]
    return np.linalg.norm(hand[:, tip] - hand[:, 0], axis=1) / _scale(hand)[:, 0]


def bend(hand, finger):
    """관절 굽힘각 합(도). 체인의 연속 세그먼트 간 각도 누적."""
    j = [FINGERS[finger][0]] + FINGERS[finger][1:]
    total = np.zeros(hand.shape[0])
    for a, b, c in zip(j[:-1], j[1:], j[2:] if len(j) > 2 else []):
        v1 = hand[:, b] - hand[:, a]
        v2 = hand[:, c] - hand[:, b]
        cos = np.sum(v1 * v2, axis=1) / (np.linalg.norm(v1, axis=1) * np.linalg.norm(v2, axis=1) + EPS)
        total += np.degrees(np.arccos(np.clip(cos, -1, 1)))
    return total


def spread(hand, f1, f2):
    """두 손가락 방향(MCP->TIP) 사이 각(도)."""
    def direction(f):
        mcp, tip = FINGERS[f][0], FINGERS[f][-1]
        v = hand[:, tip] - hand[:, mcp]
        return v / (np.linalg.norm(v, axis=1, keepdims=True) + EPS)
    cos = np.sum(direction(f1) * direction(f2), axis=1)
    return np.degrees(np.arccos(np.clip(cos, -1, 1)))


def pinch(hand, f1, f2):
    """두 손끝 거리 / 손 크기."""
    t1, t2 = FINGERS[f1][-1], FINGERS[f2][-1]
    return np.linalg.norm(hand[:, t1] - hand[:, t2], axis=1) / _scale(hand)[:, 0]


def _series(hand, rule):
    m = rule["metric"]
    if m == "curl":
        return curl(hand, rule["finger"])
    if m == "bend":
        return bend(hand, rule["finger"])
    if m == "spread":
        return spread(hand, *rule["fingers"])
    if m == "pinch":
        return pinch(hand, *rule["fingers"])
    raise ValueError(f"unknown metric {m}")


def _agg(series, agg):
    if agg == "med":
        return float(np.median(series))
    if agg == "min":
        return float(np.min(series))
    if agg == "max":
        return float(np.max(series))
    if agg == "range":
        return float(np.percentile(series, 95) - np.percentile(series, 5))
    raise ValueError(f"unknown agg {agg}")


def _rot_amp(hand):
    """손 방향/법선의 각 변화량(도) — 비틀기 같은 회전 동작 크기."""
    d1 = hand[:, 9] - hand[:, 0]
    d1 = d1 / (np.linalg.norm(d1, axis=1, keepdims=True) + EPS)
    n = np.cross(hand[:, 5] - hand[:, 0], hand[:, 17] - hand[:, 0])
    n = n / (np.linalg.norm(n, axis=1, keepdims=True) + EPS)

    def ang_std(v):
        m = v.mean(0)
        m = m / (np.linalg.norm(m) + EPS)
        return float(np.degrees(np.arccos(np.clip(v @ m, -1, 1))).std())
    return max(ang_std(d1), ang_std(n))


def two_hand_metrics(arr):
    """양손 규칙용: (검출된 손 수, 회전량 비율 min/max 또는 None)"""
    rots = []
    for hk, vk in (("lh", "lh_valid"), ("rh", "rh_valid")):
        v = np.asarray(arr[vk], bool)
        if v.sum() >= 5:
            rots.append(_rot_amp(arr[hk][v]))
    ratio = min(rots) / (max(rots) + EPS) if len(rots) == 2 else None
    return len(rots), ratio


def active_hand(arr):
    """구간 배열 dict -> 활성 손(진폭 큰 쪽)의 유효 프레임 (n,21,3). 없으면 None."""
    best = None
    for hk, vk in (("lh", "lh_valid"), ("rh", "rh_valid")):
        v = np.asarray(arr[vk], bool)
        if v.sum() < 5:
            continue
        h = arr[hk][v]
        amp = float(np.linalg.norm(h[:, 0, :2] - h[:, 0, :2].mean(0), axis=1).std())
        if best is None or amp > best[0]:
            best = (amp, h)
    return None if best is None else best[1]


class HandRules:
    def __init__(self, path=RULES_PATH):
        self.rules = {}
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                self.rules = {k: v for k, v in json.load(f).items()
                              if not k.startswith("_")}

    def check(self, word, arr):
        """(통과 여부, 위반 목록[(설명, 측정값, min, max)])"""
        rules = self.rules.get(word)
        if not rules:
            return True, []
        hand = active_hand(arr)
        if hand is None:
            return True, []
        n_hands, rot_ratio = None, None
        fails = []
        for r in rules:
            m = r["metric"]
            if m in ("hands", "rot_ratio"):  # 양손 규칙
                if n_hands is None:
                    n_hands, rot_ratio = two_hand_metrics(arr)
                if m == "hands":
                    val = n_hands
                else:
                    if rot_ratio is None:
                        continue  # 한 손만 검출 -> hands 규칙이 담당
                    val = rot_ratio
            else:
                val = _agg(_series(hand, r), r.get("agg", "med"))
            lo, hi = r.get("min", -1e9), r.get("max", 1e9)
            if not (lo <= val <= hi):
                name = r.get("msg") or f"{m}({r.get('finger') or ','.join(r.get('fingers', []))})"
                fails.append((name, round(float(val), 2), r.get("min"), r.get("max")))
        return not fails, fails


def calibrate(word):
    """학습 클립에서 해당 단어의 규칙 후보 물리량 분포를 출력 (임계값 보정용)."""
    import glob
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    rows = []
    for p in sorted(glob.glob(os.path.join(base, "dataset", "features", "*.npz"))):
        d = np.load(p, allow_pickle=True)
        if str(d["word"]) != word:
            continue
        arr = {k: d[k] for k in ("lh", "rh", "lh_valid", "rh_valid")}
        hand = active_hand(arr)
        if hand is None:
            continue
        row = {}
        for f in FINGERS:
            row[f"curl_{f}"] = float(np.median(curl(hand, f)))
            row[f"bend_{f}"] = float(np.median(bend(hand, f)))
        row["pinch_ti"] = float(np.median(pinch(hand, "thumb", "index")))
        row["pinch_ti_range"] = float(np.percentile(pinch(hand, "thumb", "index"), 95)
                                      - np.percentile(pinch(hand, "thumb", "index"), 5))
        row["spread_im"] = float(np.median(spread(hand, "index", "middle")))
        rows.append(row)
    if not rows:
        print(f"'{word}' 클립 없음")
        return
    print(f"{word}: {len(rows)}클립")
    for k in rows[0]:
        vals = np.array([r[k] for r in rows])
        print(f"  {k:<16} p5={np.percentile(vals,5):7.2f}  p50={np.percentile(vals,50):7.2f}  "
              f"p95={np.percentile(vals,95):7.2f}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--calibrate", help="단어의 물리량 분포 출력")
    args = ap.parse_args()
    if args.calibrate:
        calibrate(args.calibrate)
