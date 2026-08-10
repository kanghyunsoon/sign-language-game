# -*- coding: utf-8 -*-
"""웹캠 실시간 수어 단어 인식 데모 (실성능 테스트용 HUD 포함).

표시 정보:
  - MediaPipe 스켈레톤 (왼손 초록 / 오른손 주황 / 상체 포즈 흰색)
  - 실시간 윈도우 예측 top-3 확률 바 + 신뢰도 임계선
  - 인식기 상태 (버퍼링/무동작 게이트/추론 중), 손 검출률, 움직임 게이지
  - 처리 fps, MediaPipe/모델 지연시간, 확정 단어 배너 + 최근 확정 이력

사용: python inference/run_webcam.py [--camera 0] [--conf 0.6] [--no-mirror]
종료: q
"""
import argparse
import os
import sys
import time

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extractor import LandmarkExtractor
from recognizer import SignRecognizer

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_DIR = os.path.join(BASE, "models", "ksl-word-v7")

HAND_CONN = [(0, 1), (1, 2), (2, 3), (3, 4), (0, 5), (5, 6), (6, 7), (7, 8),
             (5, 9), (9, 10), (10, 11), (11, 12), (9, 13), (13, 14), (14, 15), (15, 16),
             (13, 17), (17, 18), (18, 19), (19, 20), (0, 17)]
POSE_CONN = [(11, 12), (11, 13), (13, 15), (12, 14), (14, 16), (11, 23), (12, 24), (23, 24)]
C_LH, C_RH, C_POSE = (80, 220, 80), (60, 160, 255), (230, 230, 230)


def draw_skeleton(img, lm):
    h, w = img.shape[:2]

    def pt(p):
        return int(p[0] * w), int(p[1] * h)

    if lm["pose_valid"]:
        pose = lm["pose"]
        for a, b in POSE_CONN:
            cv2.line(img, pt(pose[a]), pt(pose[b]), C_POSE, 2)
        for i in (11, 12, 13, 14, 15, 16):
            cv2.circle(img, pt(pose[i]), 4, C_POSE, -1)
    for key, valid, color in (("lh", lm["lh_valid"], C_LH), ("rh", lm["rh_valid"], C_RH)):
        if not valid:
            continue
        hand = lm[key]
        for a, b in HAND_CONN:
            cv2.line(img, pt(hand[a]), pt(hand[b]), color, 2)
        for i in range(21):
            cv2.circle(img, pt(hand[i]), 3, color, -1)


def draw_bar(img, x, y, w, h, frac, color, bg=(60, 60, 60)):
    cv2.rectangle(img, (x, y), (x + w, y + h), bg, -1)
    cv2.rectangle(img, (x, y), (x + int(w * min(max(frac, 0), 1)), y + h), color, -1)


def draw_hud(vis, rec, mp_ms, fps, events):
    h, w = vis.shape[:2]
    d = rec.debug
    panel_w = 330
    overlay = vis.copy()
    cv2.rectangle(overlay, (0, 0), (panel_w, 210), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.65, vis, 0.35, 0, vis)
    f = cv2.FONT_HERSHEY_SIMPLEX

    cv2.putText(vis, f"fps {fps:4.1f} | mediapipe {mp_ms:4.1f}ms | model {d['infer_ms']:.1f}ms",
                (10, 22), f, 0.5, (200, 255, 200), 1)
    buf_frac = len(rec.buf) / rec.window
    cv2.putText(vis, f"state: {d['state']}", (10, 44), f, 0.5, (255, 255, 255), 1)
    cv2.putText(vis, f"buffer {len(rec.buf)}/{rec.window}", (10, 66), f, 0.45, (180, 180, 180), 1)
    draw_bar(vis, 150, 56, 170, 10, buf_frac, (120, 120, 255))
    cv2.putText(vis, f"hand rate {d['hand_rate']:.2f}", (10, 88), f, 0.45, (180, 180, 180), 1)
    draw_bar(vis, 150, 78, 170, 10, d["hand_rate"], C_LH)
    cv2.line(vis, (150 + int(170 * rec.min_hand_rate), 76),
             (150 + int(170 * rec.min_hand_rate), 90), (0, 0, 255), 1)
    cv2.putText(vis, f"motion {d['motion']:.4f}", (10, 110), f, 0.45, (180, 180, 180), 1)
    draw_bar(vis, 150, 100, 170, 10, d["motion"] / (rec.min_motion * 5), (0, 200, 255))
    cv2.line(vis, (150 + int(170 / 5), 98), (150 + int(170 / 5), 112), (0, 0, 255), 1)

    # top-3 확률 바 (신뢰도 임계선 표시)
    y = 136
    need = d.get("streak_need", rec.consecutive)
    cv2.putText(vis, f"window prediction (streak {d['streak']}/{need}):",
                (10, y - 6), f, 0.45, (255, 255, 255), 1)
    for wname, p in d["top3"]:
        color = (80, 220, 80) if p >= rec.conf_threshold else (140, 140, 140)
        cv2.putText(vis, f"{wname:<11}{p:.2f}", (10, y + 12), f, 0.45, (230, 230, 230), 1)
        draw_bar(vis, 150, y + 3, 170, 10, p, color)
        cv2.line(vis, (150 + int(170 * rec.conf_threshold), y + 1),
                 (150 + int(170 * rec.conf_threshold), y + 15), (0, 0, 255), 1)
        y += 22
    if not d["top3"]:
        cv2.putText(vis, "-", (10, y + 12), f, 0.5, (150, 150, 150), 1)

    # 확정 단어 배너 + 이력
    now = time.time()
    if events and now - events[-1][0] < 2.5:
        word, conf = events[-1][1], events[-1][2]
        (tw, th), _ = cv2.getTextSize(word.upper(), f, 1.6, 4)
        cx = (w - tw) // 2
        cv2.rectangle(vis, (cx - 16, 18), (cx + tw + 16, 34 + th), (30, 30, 30), -1)
        cv2.putText(vis, word.upper(), (cx, 26 + th), f, 1.6, (0, 220, 255), 4)
        cv2.putText(vis, f"{conf:.2f}", (cx + tw - 30, 26 + th + 24), f, 0.6, (0, 220, 255), 2)
    hy = h - 12
    for t, word, conf in list(events)[-5:][::-1]:
        cv2.putText(vis, f"{time.strftime('%H:%M:%S', time.localtime(t))} {word} {conf:.2f}",
                    (w - 240, hy), f, 0.5, (200, 200, 255), 1)
        hy -= 20
    cv2.putText(vis, "confirmed:", (w - 240, hy), f, 0.5, (255, 255, 255), 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--camera", type=int, default=0)
    ap.add_argument("--conf", type=float, default=0.6)
    ap.add_argument("--no-mirror", action="store_true", help="화면 좌우반전 표시 끄기")
    args = ap.parse_args()

    ext = LandmarkExtractor()
    rec = SignRecognizer(os.path.join(MODEL_DIR, "model.int8.onnx"),
                         os.path.join(MODEL_DIR, "labels.json"),
                         conf_threshold=args.conf)

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        print("카메라를 열 수 없습니다.")
        return
    t0 = time.time()
    events = []  # (time, word, conf)
    fps_t, fps_n, fps, mp_ms = time.time(), 0, 0.0, 0.0

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        ts_ms = (time.time() - t0) * 1000
        t1 = time.perf_counter()
        lm = ext.process(frame, ts_ms)
        mp_ms = 0.9 * mp_ms + 0.1 * (time.perf_counter() - t1) * 1000
        ev = rec.push(lm)
        if ev:
            events.append((time.time(), ev["word"], ev["confidence"]))
            print(f"[{time.strftime('%H:%M:%S')}] 확정: {ev['word']}  conf={ev['confidence']:.2f}  top3={ev['probs']}")

        fps_n += 1
        if time.time() - fps_t >= 1.0:
            fps, fps_n, fps_t = fps_n / (time.time() - fps_t), 0, time.time()

        vis = frame.copy()
        draw_skeleton(vis, lm)  # 스켈레톤은 반전 전에 (기하만 뒤집힘)
        if not args.no_mirror:
            vis = cv2.flip(vis, 1)
        draw_hud(vis, rec, mp_ms, fps, events)  # 텍스트는 반전 후에
        cv2.imshow("sign-word demo  (q: quit)", vis)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
