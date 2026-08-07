import { useEffect, useRef, useState } from "react";
import {
  useRecognitionVisionAdapterFactory,
  type TrackedHand,
} from "../../../game/recognition/vision";
import type { PoseDetection } from "../../../game/recognition/active-player";
import type {
  WordLandmarkFrame,
  WordPoseKeypoints,
  WordPoseLandmark,
} from "../recognition/wordRecognitionTypes";

interface WordHandCameraProps {
  readonly sharedStream: MediaStream;
  readonly onLandmarkFrame: (frame: WordLandmarkFrame) => void;
  readonly onHandsNotDetected: (capturedAt: number) => void;
}

const DETECTION_INTERVAL_MS = 1000 / 18;
const HAND_CONNECTIONS: readonly [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

/** 단어 연습에서 raw 양손과 실제 영상 크기를 전달하는 전용 카메라. */
export function WordHandCamera({
  sharedStream,
  onLandmarkFrame,
  onHandsNotDetected,
}: WordHandCameraProps) {
  const visionAdapterFactory = useRecognitionVisionAdapterFactory();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handlersRef = useRef({ onLandmarkFrame, onHandsNotDetected });
  const frameIdRef = useRef(0);
  const processingRef = useRef(false);
  const lastDetectionAtRef = useRef(Number.NEGATIVE_INFINITY);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    handlersRef.current = { onLandmarkFrame, onHandsNotDetected };
  }, [onHandsNotDetected, onLandmarkFrame]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // StrictMode 개발 모드에서 이 effect가 mount->cleanup->mount로 두 번 실행된다.
    // 첫 play()가 아직 pending일 때 cleanup의 pause()가 그 promise를 AbortError로
    // reject시키는데, cancelled 가드 없이 처리하면 재마운트로 재생이 실제로는
    // 성공했는데도 첫 시도의 실패만 남아 에러 메시지가 영구히 표시된다.
    let cancelled = false;
    video.srcObject = sharedStream;
    video
      .play()
      .then(() => {
        if (!cancelled) setErrorMessage("");
      })
      .catch(() => {
        if (!cancelled) setErrorMessage("카메라 영상을 재생하지 못했습니다.");
      });
    return () => {
      cancelled = true;
      video.pause();
      video.srcObject = null;
    };
  }, [sharedStream]);

  useEffect(() => {
    let cancelled = false;
    let animationFrameId = 0;
    const adapter = visionAdapterFactory.create({
      handDetectionConfig: {
        maximumDetectedHands: 2,
        minimumHandDetectionConfidence: 0.5,
        minimumHandPresenceConfidence: 0.5,
        minimumTrackingConfidence: 0.5,
      },
      maximumTrackedPeople: 1,
      enablePoseTracking: true,
      preferWorker: true,
    });

    const detect = async (timestamp: number) => {
      const video = videoRef.current;
      if (
        cancelled ||
        processingRef.current ||
        !video ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        video.videoWidth <= 0 ||
        video.videoHeight <= 0 ||
        timestamp - lastDetectionAtRef.current < DETECTION_INTERVAL_MS
      ) {
        return;
      }

      processingRef.current = true;
      lastDetectionAtRef.current = timestamp;
      const capturedAt = Date.now();
      const frameId = ++frameIdRef.current;

      try {
        const [hands, poses] = await Promise.all([
          adapter.detectHands({ video, timestamp, frameId }),
          adapter.detectPoses({ video, timestamp, frameId }),
        ]);
        if (cancelled) return;
        drawHands(canvasRef.current, video, hands);
        const slots = toHandSlots(hands);

        if (!slots.left && !slots.right) {
          handlersRef.current.onHandsNotDetected(capturedAt);
          return;
        }

        handlersRef.current.onLandmarkFrame({
          frameId,
          capturedAt,
          frameWidth: video.videoWidth,
          frameHeight: video.videoHeight,
          hands: slots,
          pose: toPoseKeypoints(poses),
          activeHandSessionId: `word-camera-${frameIdRef.current > 0 ? "active" : "idle"}`,
        });
      } catch {
        if (!cancelled) {
          setErrorMessage("손 인식을 시작하지 못했습니다.");
        }
      } finally {
        processingRef.current = false;
      }
    };

    const loop = (timestamp: number) => {
      void detect(timestamp);
      animationFrameId = window.requestAnimationFrame(loop);
    };

    void adapter
      .initialize()
      .then(() => {
        if (!cancelled) {
          animationFrameId = window.requestAnimationFrame(loop);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage("MediaPipe 손 인식기를 불러오지 못했습니다.");
        }
      });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrameId);
      adapter.close();
      processingRef.current = false;
    };
  }, [visionAdapterFactory]);

  return (
    <div className="word-hand-camera">
      <video ref={videoRef} autoPlay muted playsInline />
      <canvas ref={canvasRef} aria-hidden="true" />
      {errorMessage && <p className="word-camera-error">{errorMessage}</p>}
    </div>
  );
}

// MediaPipe PoseLandmarker(33점) 인덱스 중 서버가 요구하는 9개 상체 포인트.
const POSE_KEYPOINT_INDEX: Readonly<Record<keyof WordPoseKeypoints, number>> = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
};

function toPoseKeypoints(
  poses: readonly PoseDetection[],
): WordPoseKeypoints | null {
  const landmarks = poses[0]?.poseLandmarks;
  if (!landmarks || landmarks.length < 33) return null;

  const point = (index: number): WordPoseLandmark => {
    const landmark = landmarks[index]!;
    return {
      x: landmark.x,
      y: landmark.y,
      z: landmark.z,
      visibility: landmark.visibility,
      presence: landmark.presence,
    };
  };

  return {
    nose: point(POSE_KEYPOINT_INDEX.nose),
    leftEar: point(POSE_KEYPOINT_INDEX.leftEar),
    rightEar: point(POSE_KEYPOINT_INDEX.rightEar),
    leftShoulder: point(POSE_KEYPOINT_INDEX.leftShoulder),
    rightShoulder: point(POSE_KEYPOINT_INDEX.rightShoulder),
    leftElbow: point(POSE_KEYPOINT_INDEX.leftElbow),
    rightElbow: point(POSE_KEYPOINT_INDEX.rightElbow),
    leftWrist: point(POSE_KEYPOINT_INDEX.leftWrist),
    rightWrist: point(POSE_KEYPOINT_INDEX.rightWrist),
  };
}

function toHandSlots(hands: readonly TrackedHand[]): WordLandmarkFrame["hands"] {
  let left: WordLandmarkFrame["hands"]["left"] = null;
  let right: WordLandmarkFrame["hands"]["right"] = null;

  for (const hand of hands) {
    if (hand.landmarks.length !== 21 || hand.handedness === "UNKNOWN") {
      continue;
    }
    const detected = {
      handedness: hand.handedness,
      score: hand.handednessScore,
      landmarks: hand.landmarks,
    } as const;
    if (
      hand.handedness === "LEFT" &&
      (!left || hand.handednessScore > (left.score ?? 0))
    ) {
      left = detected;
    }
    if (
      hand.handedness === "RIGHT" &&
      (!right || hand.handednessScore > (right.score ?? 0))
    ) {
      right = detected;
    }
  }

  return { left, right };
}

function drawHands(
  canvas: HTMLCanvasElement | null,
  video: HTMLVideoElement,
  hands: readonly TrackedHand[],
): void {
  if (!canvas) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.lineWidth = Math.max(3, canvas.width / 320);
  context.lineCap = "round";
  context.strokeStyle = "#9ad0f5";
  context.fillStyle = "#ffffff";

  for (const hand of hands) {
    for (const [from, to] of HAND_CONNECTIONS) {
      const start = hand.landmarks[from];
      const end = hand.landmarks[to];
      if (!start || !end) continue;
      context.beginPath();
      context.moveTo(start.x * canvas.width, start.y * canvas.height);
      context.lineTo(end.x * canvas.width, end.y * canvas.height);
      context.stroke();
    }
    for (const landmark of hand.landmarks) {
      context.beginPath();
      context.arc(
        landmark.x * canvas.width,
        landmark.y * canvas.height,
        Math.max(3, canvas.width / 240),
        0,
        Math.PI * 2,
      );
      context.fill();
      context.stroke();
    }
  }
}
