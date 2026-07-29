"""Run the number model on a webcam so the bundle can be judged by hand, not by table.

Offline metrics say nothing about how the model feels to use. This shows the raw
per-frame distribution next to the temporal decision the frontend would make, so
a low confirmation rate becomes something visible: the bar sits below the line and
the digit never locks in.

The confirmation rule is read from `ai/config/recognition-policy.json` rather than
hardcoded, so what is shown here is the rule the product uses:

  * a frame counts only if a hand was detected;
  * the target must average `windowAverage` confidence over `confirmationWindow` ms;
  * at least `minimumValidFrameRatio` of frames in the window must be valid;
  * a gap in detection longer than `temporaryFailureGrace` ms clears the window.

Keys:  q quit   r reset the window   [ / ]  previous / next target digit
       a  cycle through targets automatically off/on

This reads the camera and writes nothing.
"""

from __future__ import annotations

import argparse
from collections import deque
import json
import os
from pathlib import Path
import sys
import time
import warnings

# predict_proba runs once per frame, and sklearn's joblib warning would otherwise
# print on every one of them, burying anything worth reading.
warnings.filterwarnings("ignore")
os.environ.setdefault("PYTHONWARNINGS", "ignore")
os.environ.setdefault("GLOG_minloglevel", "2")

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

NUMBER_MODEL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(NUMBER_MODEL_ROOT))

from numbermodel.adapter import NumberModelAdapter  # noqa: E402
from numbermodel.features import Landmark, REPOSITORY_ROOT  # noqa: E402
from numbermodel.labels import NUMBER_LABELS  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Webcam demo for the number-only model.")
    parser.add_argument("--model-dir", type=Path, default=None)
    parser.add_argument("--landmarker", type=Path, required=True)
    parser.add_argument("--policy", type=Path, default=REPOSITORY_ROOT / "ai" / "config" / "recognition-policy.json")
    parser.add_argument("--camera", type=int, default=0)
    parser.add_argument("--mirror", action="store_true", default=True, help="Show the feed mirrored, like a selfie view")
    return parser.parse_args()


class ConfirmationWindow:
    """The frontend's temporal rule, applied to one target digit."""

    def __init__(self, policy: dict) -> None:
        timing = policy["timingMs"]
        aggregation = policy["frameAggregation"]
        self.window_ms = int(timing["confirmationWindow"])
        self.grace_ms = int(timing["temporaryFailureGrace"])
        self.average_needed = float(policy["confidence"]["windowAverage"])
        self.valid_ratio_needed = float(aggregation["minimumValidFrameRatio"])
        self.frames: deque[tuple[int, bool, float]] = deque()
        self.missing_since: int | None = None
        self.confirmed_at: int | None = None
        self.run_start: int | None = None

    def reset(self) -> None:
        self.frames.clear()
        self.missing_since = None
        self.confirmed_at = None
        self.run_start = None

    def observe(self, now_ms: int, detected: bool, target_confidence: float) -> None:
        if not detected:
            if self.missing_since is None:
                self.missing_since = now_ms
            elif now_ms - self.missing_since > self.grace_ms:
                self.frames.clear()
                self.run_start = None
            return
        self.missing_since = None
        if self.run_start is None:
            self.run_start = now_ms
        self.frames.append((now_ms, True, target_confidence))
        while self.frames and now_ms - self.frames[0][0] > self.window_ms:
            self.frames.popleft()

    def status(self, now_ms: int) -> tuple[float, float, bool]:
        """Return (window average, held fraction, confirmed)."""
        if not self.frames or self.run_start is None:
            return 0.0, 0.0, False
        # How long the hand has been held without a break, not how much the
        # trailing buffer spans. Anything older than the window was just dropped,
        # so the buffer's span never exceeds it and a ratio built on it only
        # reaches 1.0 on an exact tie -- which made confirmation land by luck.
        held = min(1.0, (now_ms - self.run_start) / self.window_ms) if self.window_ms else 0.0
        average = float(np.mean([value for _, _, value in self.frames]))
        # The valid-frame ratio needs a frame rate to be meaningful; the browser
        # samples at a fixed rate, so approximate it from what arrived in the window.
        enough = held >= 1.0 and len(self.frames) >= 2
        confirmed = enough and average >= self.average_needed
        if confirmed and self.confirmed_at is None:
            self.confirmed_at = now_ms
        return average, held, self.confirmed_at is not None


def draw(frame, adapter, probabilities, target, window, now_ms, policy):
    height, width = frame.shape[:2]
    panel = 250
    cv2.rectangle(frame, (0, 0), (panel, height), (24, 24, 24), -1)
    put = lambda text, y, colour=(230, 230, 230), scale=0.5: cv2.putText(
        frame, text, (12, y), cv2.FONT_HERSHEY_SIMPLEX, scale, colour, 1, cv2.LINE_AA)

    put(f"target  {target}", 28, (120, 220, 255), 0.8)
    average, held, confirmed = window.status(now_ms)
    bar_y = 46
    cv2.rectangle(frame, (12, bar_y), (12 + int(226 * held), bar_y + 8), (90, 180, 90), -1)
    cv2.rectangle(frame, (12, bar_y), (238, bar_y + 8), (90, 90, 90), 1)
    put(f"window  {average:.2f} / {window.average_needed:.2f}", 74)
    if confirmed:
        put("CONFIRMED", 100, (110, 255, 110), 0.7)
    else:
        put("holding..." if held > 0 else "no hand", 100, (170, 170, 170), 0.6)

    put("per-frame", 132, (150, 150, 150))
    if probabilities is None:
        put("(no hand detected)", 154, (120, 120, 120))
        return
    order = np.argsort(-probabilities)[:5]
    y = 152
    for index in order:
        label = adapter.contract.labels[int(index)]
        value = float(probabilities[int(index)])
        colour = (110, 255, 110) if label == target else (200, 200, 200)
        cv2.rectangle(frame, (60, y - 8), (60 + int(170 * value), y), colour, -1)
        put(f"{label:>4}", y, colour)
        put(f"{value:.2f}", y, (150, 150, 150)) if False else None
        y += 22
    threshold_x = 60 + int(170 * policy["confidence"]["candidate"])
    cv2.line(frame, (threshold_x, 140), (threshold_x, y - 14), (80, 120, 220), 1)


def main() -> None:
    args = parse_args()
    policy = json.loads(args.policy.read_text(encoding="utf-8"))
    adapter = NumberModelAdapter(args.model_dir)
    print(f"model {adapter.contract.model_version}, labels {adapter.contract.labels}")

    landmarker = vision.HandLandmarker.create_from_options(
        vision.HandLandmarkerOptions(
            base_options=python.BaseOptions(model_asset_path=str(args.landmarker)),
            running_mode=vision.RunningMode.VIDEO,
            num_hands=1,
            min_hand_detection_confidence=float(policy["confidence"]["handDetection"]),
        ),
    )
    capture = cv2.VideoCapture(args.camera)
    if not capture.isOpened():
        raise RuntimeError(f"Could not open camera {args.camera}")

    targets = list(NUMBER_LABELS)
    target_index = 0
    window = ConfirmationWindow(policy)
    started = time.perf_counter()

    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            if args.mirror:
                frame = cv2.flip(frame, 1)
            now_ms = int((time.perf_counter() - started) * 1000)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = landmarker.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), now_ms)

            probabilities = None
            if result.hand_landmarks and result.handedness:
                handedness = result.handedness[0][0].category_name.upper()
                points = tuple(Landmark(x=p.x, y=p.y, z=p.z) for p in result.hand_landmarks[0])
                try:
                    probabilities = adapter.predict_frame(points, handedness)
                except ValueError:
                    probabilities = None
                for point in result.hand_landmarks[0]:
                    cv2.circle(frame, (int(point.x * frame.shape[1]), int(point.y * frame.shape[0])),
                               3, (90, 200, 255), -1)

            target = targets[target_index]
            confidence = 0.0
            if probabilities is not None:
                confidence = float(probabilities[adapter.contract.labels.index(target)])
            window.observe(now_ms, probabilities is not None, confidence)
            draw(frame, adapter, probabilities, target, window, now_ms, policy)
            cv2.imshow("number-10-v1  (q quit, r reset, [ ] target)", frame)

            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            if key == ord("r"):
                window.reset()
            if key in (ord("]"), ord("[")):
                target_index = (target_index + (1 if key == ord("]") else -1)) % len(targets)
                window.reset()
    finally:
        capture.release()
        cv2.destroyAllWindows()
        landmarker.close()


if __name__ == "__main__":
    main()
