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

구간 단위 메트릭 (min/max로 판정):
  hands                 검출된 손 수 (양손 필수 단어)
  rot_ratio             양손 회전량 비율 min/max (한손 고정+한손 회전 단어)
  rot_min               덜 회전하는 손의 회전량(도) — 고정 손이 크게 비틀리면 위반
  bob_min               양손의 유의미한 상하 요동 전환 수 중 작은 값 — 고정
                        손이 위아래로 까닥이면 위반 (저주파 드리프트·지터 무시)
  cycles                반복 횟수(왕복 수) — 두 번 이상 반복 단어
  y_corr                양손 손목 높이(어깨 기준) 상관계수. 함께 위아래 +1, 번갈아 -1
  vert_frac             손목 이동량 중 상하 성분 비율. 상하 1.0 ↔ 좌우 0.0
  alt_frac              양손 교대 지표(높이차 변동 비중). 번갈아 ~0.4+ ↔ 동시 ~0.3 미만
  anyhand               "conditions"(curl/bend/spread/pinch 목록)를 어느 한 손이라도
                        전부 만족하면 통과 — 양손 모양이 다른 단어(기차·수영)용

규칙 예 (hand_rules.json):
  "bus": [{"metric": "bend", "finger": "index", "agg": "med", "min": 40, "max": 150,
           "msg": "검지를 갈고리 모양으로 살짝 굽히세요"}]
  "train": [{"metric": "anyhand", "conditions": [
              {"metric": "curl", "finger": "index", "min": 1.5},
              {"metric": "curl", "finger": "ring", "max": 1.55}], "msg": "..."}]

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


def _count_reversals(series, prominence_ratio=0.25):
    """유의미한 방향 전환 횟수 (히스테리시스로 노이즈 무시). 왕복 1회 = 전환 2회."""
    s = np.asarray(series, float)
    if len(s) < 8:
        return 0
    rng = float(s.max() - s.min())
    if rng < EPS:
        return 0
    prom = rng * prominence_ratio
    reversals, direction, last_ext = 0, 0, s[0]
    for v in s[1:]:
        if direction >= 0 and v < last_ext - prom:
            reversals += 1
            direction, last_ext = -1, v
        elif direction <= 0 and v > last_ext + prom:
            reversals += 1
            direction, last_ext = 1, v
        else:
            last_ext = max(last_ext, v) if direction >= 0 else min(last_ext, v)
    return reversals


def cycles_metric(arr):
    """활성 손의 반복 횟수(왕복 수). 다음 신호들의 왕복 중 최대:
    위치 주성분 투영 / 손 방향각 / 손바닥 법선 z(비틀기) / 양손 높이 차(교대 동작).
    1회 수행 ~1.0, 2회 반복 ~2.0+."""
    best = None
    for hk, vk in (("lh", "lh_valid"), ("rh", "rh_valid")):
        v = np.asarray(arr[vk], bool)
        if v.sum() < 8:
            continue
        h = arr[hk][v]
        scale = float(np.median(np.linalg.norm(h[:, 9] - h[:, 0], axis=1))) + EPS
        xy = h[:, 0, :2] / scale
        xy = xy - xy.mean(0)
        _, _, vt = np.linalg.svd(xy, full_matrices=False)
        proj = xy @ vt[0]                       # 위치 왕복
        d = h[:, 9, :2] - h[:, 0, :2]
        ang = np.unwrap(np.arctan2(d[:, 1], d[:, 0]))  # 방향각 왕복
        n = np.cross(h[:, 5] - h[:, 0], h[:, 17] - h[:, 0])
        n = n / (np.linalg.norm(n, axis=1, keepdims=True) + EPS)
        cyc = max(_count_reversals(proj), _count_reversals(ang),
                  _count_reversals(n[:, 2]))    # 법선 z 왕복 (손목 비틀기)
        amp = float(np.linalg.norm(xy, axis=1).std())
        if best is None or amp > best[0]:
            best = (amp, cyc)
    if best is None:
        return None
    cyc = best[1]
    # 양손 교대 동작 (별 등): 두 손 높이 차의 왕복
    lv, rv = np.asarray(arr["lh_valid"], bool), np.asarray(arr["rh_valid"], bool)
    both = lv & rv
    if both.sum() >= 8:
        dy = arr["lh"][both][:, 0, 1] - arr["rh"][both][:, 0, 1]
        cyc = max(cyc, _count_reversals(dy))
    return cyc / 2.0


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
    """양손 규칙용: (검출된 손 수, 회전량 비율 min/max, 작은쪽 회전량(도)). 한손이면 None."""
    rots = []
    for hk, vk in (("lh", "lh_valid"), ("rh", "rh_valid")):
        v = np.asarray(arr[vk], bool)
        if v.sum() >= 5:
            rots.append(_rot_amp(arr[hk][v]))
    if len(rots) == 2:
        return 2, min(rots) / (max(rots) + EPS), min(rots)
    return len(rots), None, None


def _highpass(y, k=9):
    """저주파(팔 드리프트) 제거 — 가장자리 정규화된 이동평균 차감."""
    kernel = np.ones(k)
    smooth = np.convolve(y, kernel, mode="same") \
        / np.convolve(np.ones_like(y), kernel, mode="same")
    return y - smooth


def _abs_reversals(y, prom):
    """절대 프로미넌스(prom) 이상 스윙만 세는 방향 전환 수 — 지터에 강함."""
    reversals, direction, last_ext = 0, 0, y[0]
    for v in y[1:]:
        if direction >= 0 and v < last_ext - prom:
            reversals += 1
            direction, last_ext = -1, v
        elif direction <= 0 and v > last_ext + prom:
            reversals += 1
            direction, last_ext = 1, v
        else:
            last_ext = max(last_ext, v) if direction >= 0 else min(last_ext, v)
    return reversals


def bob_min_metric(arr, prom=0.15):
    """양손 각각의 '유의미한 상하 요동 전환 수' 중 작은 값.
    중지 관절(9번, 주먹 까닥 시 호를 그리는 점) y를 손 크기로 정규화하고
    저주파를 제거한 뒤, prom(손단위) 이상 스윙의 방향 전환만 센다.
    한손 고정 단어에서 고정손까지 까닥이면 커진다 — 회전비(rot_ratio)가
    놓치는 비대칭·비동기 양손 까닥도 잡는다. 한손 검출이면 None(판정 불가).
    보정(2026-08-08, 학습 76클립+합성 까닥): 임계 4에서 정답 오거절 6.6%,
    양손 까닥 차단 81.6%(80% 강도 합성 기준 — 실제 까닥은 더 잘 잡힘)."""
    counts = []
    for h in valid_hands(arr, min_frames=8):
        scale = float(np.median(np.linalg.norm(h[:, 9] - h[:, 0], axis=1))) + EPS
        y = h[:, 9, 1] / scale
        counts.append(_abs_reversals(_highpass(y), prom))
    if len(counts) < 2:
        return None
    return min(counts)


def valid_hands(arr, min_frames=5):
    """검출 프레임이 충분한 손들의 유효 프레임 배열 목록."""
    out = []
    for hk, vk in (("lh", "lh_valid"), ("rh", "rh_valid")):
        v = np.asarray(arr[vk], bool)
        if v.sum() >= min_frames:
            out.append(arr[hk][v])
    return out


def vert_frac_metric(arr, min_path=0.5):
    """활성 손 손목 이동량 중 상하 성분 비율 sum|dy|/(sum|dx|+sum|dy|).
    순수 상하 1.0, 순수 좌우 0.0. 이동량이 너무 작으면 None(판정 불가).
    속도 기반이라 반복 사이 좌우 드리프트(느림)의 영향이 작다."""
    best = None
    for hk, vk in (("lh", "lh_valid"), ("rh", "rh_valid")):
        v = np.asarray(arr[vk], bool)
        if v.sum() < 8:
            continue
        h = arr[hk][v]
        scale = float(np.median(np.linalg.norm(h[:, 9] - h[:, 0], axis=1))) + EPS
        xy = h[:, 0, :2] / scale
        d = np.abs(np.diff(xy, axis=0))
        path = float(d.sum())
        amp = float(np.linalg.norm(xy - xy.mean(0), axis=1).std())
        if best is None or amp > best[0]:
            best = (amp, path, float(d[:, 1].sum()) / (path + EPS))
    if best is None or best[1] < min_path:
        return None
    return best[2]


def y_sync(arr):
    """양손 손목 높이(어깨 기준)의 상관계수. 함께 오르내리면 +1, 번갈아 움직이면 -1.
    양손 동시 검출이 부족하거나 상하 움직임이 없으면 None(판정 불가)."""
    lv, rv = np.asarray(arr["lh_valid"], bool), np.asarray(arr["rh_valid"], bool)
    both = lv & rv
    if both.sum() < 8:
        return None
    ly = arr["lh"][both, 0, 1].astype(float)
    ry = arr["rh"][both, 0, 1].astype(float)
    pose = arr.get("pose") if hasattr(arr, "get") else None
    if pose is not None:  # 몸 전체가 흔들려도 어깨 기준 상대 높이로 판정
        pv = np.asarray(arr.get("pose_valid", np.zeros(len(lv), bool)), bool)
        if pv.any():
            sho = (pose[:, 11, 1] + pose[:, 12, 1]) / 2
            sho = np.where(pv, sho, np.median(sho[pv]))
            ly, ry = ly - sho[both], ry - sho[both]
    if ly.std() < 0.005 or ry.std() < 0.005:
        return None
    return float(np.corrcoef(ly, ry)[0, 1])


def alt_frac_metric(arr):
    """양손 높이차 변동 / (높이차 변동 + 공통 이동) — 진폭 가중 교대 지표.
    번갈아 움직임 ~0.4-0.8, 동시 움직임 ~0.3 미만. y_corr보다 잔떨림에 강함."""
    lv, rv = np.asarray(arr["lh_valid"], bool), np.asarray(arr["rh_valid"], bool)
    both = lv & rv
    if both.sum() < 8:
        return None
    ly = arr["lh"][both, 0, 1].astype(float)
    ry = arr["rh"][both, 0, 1].astype(float)
    d, s = ly - ry, (ly + ry) / 2
    if d.std() + s.std() < 0.01:
        return None
    return float(d.std() / (d.std() + 2 * s.std() + EPS))


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
        n_hands, rot_ratio, rot_min = None, None, None
        fails = []
        for r in rules:
            m = r["metric"]
            if m in ("hands", "rot_ratio", "rot_min"):  # 양손 규칙
                if n_hands is None:
                    n_hands, rot_ratio, rot_min = two_hand_metrics(arr)
                if m == "hands":
                    val = n_hands
                else:
                    val = rot_ratio if m == "rot_ratio" else rot_min
                    if val is None:
                        continue  # 한 손만 검출 -> hands 규칙이 담당
            elif m == "cycles":  # 반복 횟수 규칙
                val = cycles_metric(arr)
                if val is None:
                    continue
            elif m == "y_corr":  # 양손 상하 동기 규칙
                val = y_sync(arr)
                if val is None:
                    continue
            elif m == "vert_frac":  # 이동 방향(상하 비율) 규칙
                val = vert_frac_metric(arr)
                if val is None:
                    continue
            elif m == "alt_frac":  # 양손 교대(진폭 가중) 규칙
                val = alt_frac_metric(arr)
                if val is None:
                    continue
            elif m == "bob_min":  # 고정손 상하 요동 규칙 (양손 까닥 차단)
                val = bob_min_metric(arr)
                if val is None:
                    continue
            elif m == "anyhand":  # 어느 한 손이라도 조건 전부 만족하면 통과
                best = None  # (위반량 합, 최다 위반 조건의 (값, 조건))
                for h in valid_hands(arr):
                    viol, worst = 0.0, None
                    for c in r["conditions"]:
                        v = _agg(_series(h, c), c.get("agg", "med"))
                        over = max(0.0, c.get("min", -1e9) - v, v - c.get("max", 1e9))
                        viol += over
                        if over > 0 and (worst is None or over > worst[0]):
                            worst = (over, v, c)
                    if worst is None:  # 이 손이 전부 만족 -> 규칙 통과
                        best = None
                        break
                    if best is None or viol < best[0]:
                        best = (viol, worst)
                if best is None:
                    continue  # 통과 (만족하는 손 있음 / 손 미검출)
                _, (_, v, c) = best
                name = r.get("msg") or f"anyhand({c['metric']} {c.get('finger', '')})"
                fails.append((name, round(float(v), 2), c.get("min"), c.get("max")))
                continue
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
        arr = {k: d[k] for k in ("lh", "rh", "lh_valid", "rh_valid", "pose", "pose_valid")}
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
        yc = y_sync(arr)
        if yc is not None:
            row["y_corr"] = yc
        vf = vert_frac_metric(arr)
        if vf is not None:
            row["vert_frac"] = vf
        af = alt_frac_metric(arr)
        if af is not None:
            row["alt_frac"] = af
        bm = bob_min_metric(arr)
        if bm is not None:
            row["bob_min"] = bm
        # anyhand 보정용: 두손가락다움(검지+중지-약지-새끼)이 큰 손의 손가락별 굽힘
        hs = valid_hands(arr)
        if hs:
            tf = max(hs, key=lambda h: float(np.median(curl(h, "index")) + np.median(curl(h, "middle"))
                                             - np.median(curl(h, "ring")) - np.median(curl(h, "pinky"))))
            for f in FINGERS:
                row[f"2f_curl_{f}"] = float(np.median(curl(tf, f)))
        rows.append(row)
    if not rows:
        print(f"'{word}' 클립 없음")
        return
    print(f"{word}: {len(rows)}클립")
    keys = list(rows[0]) + sorted({k for r in rows for k in r} - set(rows[0]))
    for k in keys:
        vals = np.array([r[k] for r in rows if k in r])
        print(f"  {k:<16} p5={np.percentile(vals,5):7.2f}  p50={np.percentile(vals,50):7.2f}  "
              f"p95={np.percentile(vals,95):7.2f}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--calibrate", help="단어의 물리량 분포 출력")
    args = ap.parse_args()
    if args.calibrate:
        calibrate(args.calibrate)
