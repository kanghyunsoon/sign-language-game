import { AdaptiveHandLandmarker, AdaptivePoseLandmarker } from "../../../shared/mediapipe";
import type { RecognitionVisionAdapter, RecognitionVisionAdapterFactory, RecognitionVisionAdapterOptions, RecognitionVisionFrame, RecognitionVisionExecutionMode } from "./RecognitionVisionAdapter";

export class MediaPipeRecognitionVisionAdapter implements RecognitionVisionAdapter {
  private readonly handLandmarker: AdaptiveHandLandmarker;
  private readonly poseLandmarker: AdaptivePoseLandmarker | null;
  private poseInitialization: Promise<void> | null = null;

  constructor(private readonly options: RecognitionVisionAdapterOptions) {
    this.handLandmarker = new AdaptiveHandLandmarker(undefined, options.handDetectionConfig, options.preferWorker);
    this.poseLandmarker = options.enablePoseTracking
      ? new AdaptivePoseLandmarker(options.maximumTrackedPeople)
      : null;
  }

  async initialize(): Promise<void> {
    const handInitialization = this.handLandmarker.initialize();
    if (this.poseLandmarker) this.poseInitialization = this.poseLandmarker.initialize();
    await Promise.all([handInitialization, this.poseInitialization]);
  }

  detectHands(frame: RecognitionVisionFrame) {
    return this.handLandmarker.detect(frame.video, frame.timestamp, frame.frameId);
  }

  async detectPoses(frame: RecognitionVisionFrame) {
    if (!this.poseLandmarker) return [];
    this.poseInitialization ??= this.poseLandmarker.initialize();
    await this.poseInitialization;
    return this.poseLandmarker.detect(frame.video, frame.timestamp, frame.frameId);
  }

  getExecutionMode(): RecognitionVisionExecutionMode {
    return this.handLandmarker.getMode();
  }

  close(): void {
    this.handLandmarker.close();
    this.poseLandmarker?.close();
    this.poseInitialization = null;
  }
}

/*
 * 초기화된 인식기 풀.
 *
 * 카메라를 켤 때마다 워커 생성 → WASM 다운로드/컴파일 → 모델 로드 → GPU
 * 셰이더 컴파일을 처음부터 다시 하면, 그 1~3초의 비용이 매번 "카메라 시작
 * 직후 렉"으로 사용자에게 노출된다. close()는 이제 건강한 인스턴스를 폐기하지
 * 않고 설정별 풀에 반납하고, create()는 풀에서 꺼내 재사용한다 — 화면을
 * 오가도 워커와 컴파일된 그래프가 살아 있다.
 *
 * 추가로, 이 모듈이 실린 청크가 로드되면 idle 타임에 기본 게임플레이 설정으로
 * 한 번 미리 초기화해 둔다(워커의 합성 손 워밍업 포함). 사용자가 카메라를
 * 켜는 시점에는 initialize()가 즉시 resolve된다.
 */

const idlePool = new Map<string, MediaPipeRecognitionVisionAdapter>();

function poolKey(options: RecognitionVisionAdapterOptions): string {
  return JSON.stringify({
    hand: options.handDetectionConfig,
    people: options.maximumTrackedPeople,
    pose: options.enablePoseTracking,
    worker: options.preferWorker ?? true,
  });
}

class PooledRecognitionVisionAdapter implements RecognitionVisionAdapter {
  private initialization: Promise<void> | null;

  constructor(
    private readonly key: string,
    private readonly inner: MediaPipeRecognitionVisionAdapter,
    alreadyInitialized: boolean,
  ) {
    this.initialization = alreadyInitialized ? Promise.resolve() : null;
  }

  initialize(): Promise<void> {
    // Single-flight: the inner adapter must not be initialized twice (that
    // would spawn a second worker), and a pooled instance resolves instantly.
    this.initialization ??= this.inner.initialize();
    return this.initialization;
  }

  detectHands(frame: RecognitionVisionFrame) {
    return this.inner.detectHands(frame);
  }

  detectPoses(frame: RecognitionVisionFrame) {
    return this.inner.detectPoses(frame);
  }

  getExecutionMode(): RecognitionVisionExecutionMode {
    return this.inner.getExecutionMode();
  }

  close(): void {
    // Only a successfully initialized instance is worth keeping, and the pool
    // holds at most one idle instance per configuration.
    if (this.initialization !== null && !idlePool.has(this.key)) {
      void this.initialization.then(
        () => {
          if (!idlePool.has(this.key)) idlePool.set(this.key, this.inner);
          else this.inner.close();
        },
        () => this.inner.close(),
      );
      this.initialization = null;
      return;
    }
    this.initialization = null;
    this.inner.close();
  }
}

export const mediaPipeRecognitionVisionAdapterFactory: RecognitionVisionAdapterFactory = Object.freeze({
  create: (options: RecognitionVisionAdapterOptions) => {
    const key = poolKey(options);
    const pooled = idlePool.get(key);
    if (pooled) {
      idlePool.delete(key);
      return new PooledRecognitionVisionAdapter(key, pooled, true);
    }
    return new PooledRecognitionVisionAdapter(key, new MediaPipeRecognitionVisionAdapter(options), false);
  },
});

/**
 * HandCamera가 기본으로 쓰는 설정과 정확히 같은 키로 미리 초기화해 둔다.
 * (GAMEPLAY_HAND_DETECTION_CONFIG + maximumTrackedPeople 1 + pose off + worker)
 */
const PREWARM_OPTIONS: RecognitionVisionAdapterOptions = {
  handDetectionConfig: {
    maximumDetectedHands: 2,
    minimumHandDetectionConfidence: 0.5,
    minimumHandPresenceConfidence: 0.5,
    minimumTrackingConfidence: 0.5,
  },
  maximumTrackedPeople: 1,
  enablePoseTracking: false,
  preferWorker: true,
};

export function prewarmRecognitionVision(options: RecognitionVisionAdapterOptions = PREWARM_OPTIONS): void {
  const key = poolKey(options);
  if (idlePool.has(key)) return;
  const inner = new MediaPipeRecognitionVisionAdapter(options);
  void inner.initialize().then(
    () => {
      if (!idlePool.has(key)) idlePool.set(key, inner);
      else inner.close();
    },
    () => inner.close(),
  );
}

// 청크가 로드되면 idle 타임에 미리 데운다. 테스트 환경에서는 건너뛴다.
if (typeof window !== "undefined" && import.meta.env?.MODE !== "test") {
  type IdleScheduler = (callback: () => void) => void;
  const scheduleIdle: IdleScheduler =
    (window as unknown as { requestIdleCallback?: IdleScheduler }).requestIdleCallback
    ?? ((callback) => { window.setTimeout(callback, 250); });
  scheduleIdle(() => prewarmRecognitionVision());
}
