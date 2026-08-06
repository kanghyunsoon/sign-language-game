# -*- coding: utf-8 -*-
"""웹캠 셀프 평가 — 직접 동작을 수행하며 모델을 채점한다.

두 가지 모드:
  기본(수동 구간): SPACE로 녹화 시작 -> 동작 -> SPACE 종료 -> 판정
  --rolling      : 녹화 버튼 없음. 동작을 시작하면 자동 감지(온셋) -> 손을
                   멈추면 0.5초 뒤 자동 확정. 수행 중엔 실시간 후보가 표시됨.

판정: 정답 / WRONG(방향·수형·정지 등 오류 수행) / OUT OF RANGE(물리량 이탈)
      / 다른 단어로 오인 / 신뢰도 부족
결과는 dataset/self_test_results.csv에 누적, q 종료 시 요약 출력.

키: (기본) SPACE=녹화 시작/종료 | (공통) n=다음 단어  p=이전 단어  q=종료

사용: python inference/self_test.py [--rolling] [--conf 0.5] [--no-mirror]
"""
import argparse
import csv
import os
import sys
import time
from collections import defaultdict

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extractor import LandmarkExtractor
from recognizer import SignRecognizer
from run_webcam import draw_skeleton
from guards import Guard, clip_metrics, seg_to_arrays, METRIC_KO

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_DIR = os.path.join(BASE, "models", "ksl-word-v7")
GUARD_STATS = os.path.join(BASE, "models", "guard_stats.json")
RESULT_CSV = os.path.join(BASE, "dataset", "self_test_results.csv")

WORD_KO = {"airplane": "비행기", "bad": "나쁘다", "bicycle": "자전거", "bus": "버스",
           "car": "자동차", "good": "좋다", "helicopter": "헬리콥터", "moon": "달",
           "motorcycle": "오토바이", "rain": "비", "run": "달리다", "ship": "배",
           "star": "별", "subway": "지하철", "sun": "해", "swim": "수영", "hello": "안녕하세요", "thankyou": "감사합니다",
           "train": "기차", "walk": "걷다", "wind": "바람"}


def append_result(row):
    exists = os.path.exists(RESULT_CSV)
    with open(RESULT_CSV, "a", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["time", "target", "pred", "conf", "verdict", "frames", "top3"])
        if not exists:
            w.writeheader()
        w.writerow(row)


def segment_motion(seg):
    """구간 전체의 손목 평균 이동량 (손별 분리 추적, 큰 쪽)."""
    motion = 0.0
    for key in ("lh", "rh"):
        disp, cnt, prev = 0.0, 0, None
        for f in seg:
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
    return motion


def judge(target, pred, conf, min_conf, motion):
    if motion < 0.0015:
        return "nomotion"  # 정지 자세만 취함 — 모델 판정과 무관하게 미수행 처리
    if conf < min_conf:
        return "lowconf"
    if pred == target:
        return "correct"
    if pred == "wrong":
        return "wrong-form"
    return "misrecognized"


VERDICT_LABEL = {"correct": "CORRECT", "wrong-form": "WRONG (direction/form)",
                 "misrecognized": "MISS", "lowconf": "LOW CONF", "tooshort": "TOO SHORT",
                 "nomotion": "NO MOTION", "out-of-range": "OUT OF RANGE",
                 "detail": "WRONG DETAIL (finger)"}
VERDICT_COLOR = {"correct": (80, 220, 80), "wrong-form": (0, 150, 255),
                 "misrecognized": (60, 60, 255), "lowconf": (140, 140, 140),
                 "tooshort": (140, 140, 140), "nomotion": (0, 150, 255),
                 "out-of-range": (0, 150, 255), "detail": (0, 150, 255)}


def rolling_judge(target, ev, min_conf):
    """RollingGrader final 이벤트 -> 판정."""
    if ev["guard_fails"]:
        return "out-of-range"
    if ev.get("rule_fails"):
        return "detail"  # 수형 규칙 위반 (손가락 디테일)
    if ev["confidence"] < min_conf:
        return "lowconf"
    if ev["word"] == target:
        return "correct"
    if ev["word"] == "wrong":
        return "wrong-form"
    return "misrecognized"


def rolling_main(args):
    from rolling import RollingGrader
    from guards import METRIC_KO
    ext = LandmarkExtractor()
    grader = RollingGrader(os.path.join(MODEL_DIR, "model.int8.onnx"),
                           os.path.join(MODEL_DIR, "labels.json"))
    words = [w for w in grader.rec.labels if w != "wrong"]
    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        print("카메라를 열 수 없습니다.")
        return
    stats = defaultdict(lambda: [0, 0])
    session = []
    wi = 0
    last_result, last_result_at = None, 0.0
    t0 = time.time()
    f = cv2.FONT_HERSHEY_SIMPLEX
    print(f"롤링 모드 — 동작하면 자동 감지, 멈추면 자동 판정")
    print(f"목표 단어: {words[wi]} ({WORD_KO.get(words[wi], '')})")

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        ts_ms = (time.time() - t0) * 1000
        lm = ext.process(frame, ts_ms)
        target = words[wi]
        for ev in grader.push(lm, ts_ms):
            if ev["stage"] == "live":
                print(f"  [후보] {ev['word']} ({ev['confidence']:.2f})")
            else:
                verdict = rolling_judge(target, ev, args.conf)
                stats[target][0] += 1
                stats[target][1] += (verdict == "correct")
                row = {"time": time.strftime("%H:%M:%S"), "target": target,
                       "pred": ev["word"], "conf": round(ev["confidence"], 3),
                       "verdict": verdict, "frames": ev["duration_s"], "top3": str(ev["top3"])}
                append_result(row)
                session.append(row)
                gtxt = ", ".join(f"{METRIC_KO.get(n, n)} {v} (허용 {lo}~{hi})"
                                 for n, v, lo, hi in ev["guard_fails"])
                rtxt = "; ".join(f"{msg} (측정 {v}, 기준 {lo}~{hi})"
                                 for msg, v, lo, hi in ev.get("rule_fails", []))
                if rtxt:
                    gtxt = (gtxt + " | " if gtxt else "") + rtxt
                last_result = {"verdict": verdict, "pred": ev["word"],
                               "conf": ev["confidence"], "top3": ev["top3"], "guard": gtxt}
                last_result_at = time.time()
                print(f"  {target:<12} -> {ev['word']:<12} {ev['confidence']:.2f} "
                      f"dur={ev['duration_s']}s [{verdict}]" + (f"  가드: {gtxt}" if gtxt else ""))

        vis = frame.copy()
        draw_skeleton(vis, lm)
        if not args.no_mirror:
            vis = cv2.flip(vis, 1)
        h, w = vis.shape[:2]
        cv2.rectangle(vis, (0, 0), (w, 64), (20, 20, 20), -1)
        cv2.putText(vis, f"[{wi+1}/{len(words)}] target: {target.upper()}", (10, 28),
                    f, 0.9, (0, 220, 255), 2)
        a, c = stats[target]
        d = grader.debug
        state_txt = "PERFORMING" if d["state"] == "active" else "waiting"
        cv2.putText(vis, f"{state_txt}   this word: {c}/{a}   motion {d['motion']:.4f}",
                    (10, 54), f, 0.55, (0, 0, 255) if d["state"] == "active" else (200, 200, 200), 1)
        live = d.get("live")
        if d["state"] == "active" and live:
            frac = min(1.0, live["sustained"] / live["need"])
            cv2.putText(vis, f"live: {live['label']} {live['conf']:.2f}", (10, h - 40),
                        f, 0.6, (80, 220, 80), 2)
            cv2.rectangle(vis, (10, h - 32), (210, h - 24), (60, 60, 60), -1)
            cv2.rectangle(vis, (10, h - 32), (10 + int(200 * frac), h - 24), (80, 220, 80), -1)
        if last_result and time.time() - last_result_at < 3.0 and d["state"] != "active":
            v = last_result
            cv2.rectangle(vis, (0, 66), (w, 152 if v["guard"] else 130), (30, 30, 30), -1)
            cv2.putText(vis, VERDICT_LABEL[v["verdict"]], (10, 96), f, 0.9,
                        VERDICT_COLOR[v["verdict"]], 2)
            cv2.putText(vis, f"pred: {v['pred']} ({v['conf']:.2f})  top3: {v['top3']}",
                        (10, 122), f, 0.5, (220, 220, 220), 1)
            if v["guard"]:
                cv2.putText(vis, "guard fail (see terminal)", (10, 144), f, 0.5, (0, 150, 255), 1)
        cv2.putText(vis, "perform anytime (auto detect)   n/p: word   q: quit", (10, h - 8),
                    f, 0.5, (180, 180, 180), 1)
        cv2.imshow("self test (rolling)", vis)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        elif key == ord("n"):
            wi = (wi + 1) % len(words)
            grader.reset()
            print(f"목표 단어: {words[wi]} ({WORD_KO.get(words[wi], '')})")
        elif key == ord("p"):
            wi = (wi - 1) % len(words)
            grader.reset()
            print(f"목표 단어: {words[wi]} ({WORD_KO.get(words[wi], '')})")
    cap.release()
    cv2.destroyAllWindows()
    summarize_session(session, stats, words)


def summarize_session(session, stats, words):
    if not session:
        return
    print("\n=== 세션 요약 ===")
    tot_c = sum(1 for r in session if r["verdict"] == "correct")
    print(f"전체: {tot_c}/{len(session)} = {tot_c/len(session):.2f}")
    print(f"{'word':<12}{'attempts':>9}{'correct':>9}")
    for wd in words:
        a, c = stats[wd]
        if a:
            print(f"{wd:<12}{a:>9}{c:>9}")
    miss = [r for r in session if r["verdict"] not in ("correct",)]
    if miss:
        print("실패 상세:")
        for r in miss:
            print(f"  {r['target']:<12} -> {r['pred']:<12} {r['conf']:.2f} [{r['verdict']}] top3 {r['top3']}")
    print(f"\n누적 기록: {RESULT_CSV}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--camera", type=int, default=0)
    ap.add_argument("--conf", type=float, default=0.5, help="판정 최소 신뢰도")
    ap.add_argument("--no-mirror", action="store_true")
    ap.add_argument("--rolling", action="store_true", help="녹화 버튼 없는 자동 감지 모드")
    args = ap.parse_args()
    if args.rolling:
        return rolling_main(args)

    ext = LandmarkExtractor()
    rec = SignRecognizer(os.path.join(MODEL_DIR, "model.int8.onnx"),
                         os.path.join(MODEL_DIR, "labels.json"))
    guard = Guard.try_load(GUARD_STATS)
    from hand_rules import HandRules
    hand_rules = HandRules()
    print("물리량 가드:", "on" if guard else "off",
          "| 수형 규칙:", f"{len(hand_rules.rules)}단어" if hand_rules.rules else "off")
    words = [w for w in rec.labels if w != "wrong"]

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        print("카메라를 열 수 없습니다.")
        return

    stats = defaultdict(lambda: [0, 0])  # word -> [attempts, correct]
    session = []
    wi = 0
    recording = False
    seg = []
    last_result, last_result_at = None, 0.0
    t0 = time.time()
    f = cv2.FONT_HERSHEY_SIMPLEX
    print(f"목표 단어: {words[wi]} ({WORD_KO.get(words[wi], '')})  — SPACE로 녹화 시작/종료")

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        lm = ext.process(frame, (time.time() - t0) * 1000)
        if recording:
            seg.append(lm)

        vis = frame.copy()
        draw_skeleton(vis, lm)
        if not args.no_mirror:
            vis = cv2.flip(vis, 1)
        h, w = vis.shape[:2]

        target = words[wi]
        cv2.rectangle(vis, (0, 0), (w, 64), (20, 20, 20), -1)
        cv2.putText(vis, f"[{wi+1}/{len(words)}] target: {target.upper()}", (10, 28), f, 0.9,
                    (0, 220, 255), 2)
        a, c = stats[target]
        cv2.putText(vis, f"this word: {c}/{a}   total: "
                         f"{sum(v[1] for v in stats.values())}/{sum(v[0] for v in stats.values())}",
                    (10, 54), f, 0.55, (200, 200, 200), 1)
        if recording:
            cv2.circle(vis, (w - 30, 30), 12, (0, 0, 255), -1)
            cv2.putText(vis, f"REC {len(seg)}f", (w - 130, 36), f, 0.6, (0, 0, 255), 2)
        elif last_result and time.time() - last_result_at < 3.0:
            v = last_result
            cv2.rectangle(vis, (0, 66), (w, 152 if v.get("guard") else 130), (30, 30, 30), -1)
            cv2.putText(vis, VERDICT_LABEL[v["verdict"]], (10, 96), f, 0.9,
                        VERDICT_COLOR[v["verdict"]], 2)
            cv2.putText(vis, f"pred: {v['pred']} ({v['conf']:.2f})  top3: {v['top3']}",
                        (10, 122), f, 0.5, (220, 220, 220), 1)
            if v.get("guard"):  # 상세(한글)는 터미널 출력 참고
                cv2.putText(vis, "guard fail (see terminal)", (10, 144), f, 0.5,
                            (0, 150, 255), 1)
        cv2.putText(vis, "SPACE: rec start/stop   n/p: word   q: quit", (10, h - 12),
                    f, 0.5, (180, 180, 180), 1)
        cv2.imshow("self test", vis)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        elif key == ord(" "):
            if not recording:
                recording, seg = True, []
                rec_t0 = time.time()
            else:
                recording = False
                if len(seg) < 10:
                    last_result = {"verdict": "tooshort", "pred": "-", "conf": 0.0, "top3": ""}
                    last_result_at = time.time()
                    continue
                probs, pred = rec.predict_window(seg)
                conf = float(probs.max())
                top3 = [(x, round(float(p), 2)) for x, p in
                        sorted(zip(rec.labels, probs), key=lambda t: -t[1])[:3]]
                verdict = judge(target, pred, conf, args.conf, segment_motion(seg))
                guard_info = ""
                if verdict == "correct":
                    arr = seg_to_arrays(seg)
                    if guard:
                        m = clip_metrics(arr["pose"], arr["lh"], arr["rh"], arr["pose_valid"],
                                         arr["lh_valid"], arr["rh_valid"],
                                         duration_s=time.time() - rec_t0)
                        ok_g, fails = guard.check(target, m)
                        if not ok_g:
                            verdict = "out-of-range"
                            guard_info = ", ".join(
                                f"{METRIC_KO.get(n, n)} {v} (허용 {lo}~{hi})"
                                for n, v, lo, hi in fails)
                            print(f"  가드 위반: {guard_info}")
                    if verdict == "correct":
                        ok_r, rfails = hand_rules.check(target, arr)
                        if not ok_r:
                            verdict = "detail"
                            guard_info = "; ".join(f"{msg} (측정 {v}, 기준 {lo}~{hi})"
                                                   for msg, v, lo, hi in rfails)
                            print(f"  수형 규칙 위반: {guard_info}")
                stats[target][0] += 1
                stats[target][1] += (verdict == "correct")
                row = {"time": time.strftime("%H:%M:%S"), "target": target, "pred": pred,
                       "conf": round(conf, 3), "verdict": verdict, "frames": len(seg),
                       "top3": str(top3)}
                append_result(row)
                session.append(row)
                last_result = {"verdict": verdict, "pred": pred, "conf": conf, "top3": top3,
                               "guard": guard_info}
                last_result_at = time.time()
                print(f"  {target:<12} -> {pred:<12} {conf:.2f}  [{verdict}]")
        elif key == ord("n"):
            wi = (wi + 1) % len(words)
            print(f"목표 단어: {words[wi]} ({WORD_KO.get(words[wi], '')})")
        elif key == ord("p"):
            wi = (wi - 1) % len(words)
            print(f"목표 단어: {words[wi]} ({WORD_KO.get(words[wi], '')})")

    cap.release()
    cv2.destroyAllWindows()

    summarize_session(session, stats, words)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
