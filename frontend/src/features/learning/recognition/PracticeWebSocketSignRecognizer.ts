import {
  DEFAULT_RECOGNITION_RATE_CONFIG,
  DefaultContinuousSignDecoder,
  RecognitionPerformanceMonitor,
  isValidHandLandmarks,
  type ContinuousSignRecognizer,
  type HandLandmarkFrame,
  type RecognitionConnectionState,
  type SignDecoderConfig,
  type SignRecognitionEvent,
} from "../../../game/recognition";
import {
  parseServerMessage,
  ServerMessageError,
} from "../../../game/recognition/websocket/serverMessages";

const HAND_MISSING_SEND_INTERVAL_MS = 80;
const RECONNECT_INITIAL_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 8_000;
const NONE_SYMBOL = "none";
const NUMBER_MODEL_VERSION = "number-10-v1";
const NUMBER_MINIMUM_CONFIDENCE = 0.6;

interface WebSocketLike {
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<string>) => void) | null;
  send(data: string): void;
  close(): void;
}

type WebSocketFactory = (url: string) => WebSocketLike;
type RecognitionListener = (event: SignRecognitionEvent) => void;

export interface PracticeWebSocketSignRecognizerOptions {
  readonly url: string;
  readonly createWebSocket?: WebSocketFactory;
  readonly aiInferenceFps?: number;
  readonly performanceMonitor?: RecognitionPerformanceMonitor;
  readonly decoder?: DefaultContinuousSignDecoder;
  readonly decoderConfig?: SignDecoderConfig;
}

/**
 * 연습 화면 전용 AI WebSocket 클라이언트.
 * 게임 인식기의 숫자 제외 정책과 분리해 자모와 숫자 결과를 모두 허용한다.
 */
export class PracticeWebSocketSignRecognizer {
  private readonly listeners = new Set<RecognitionListener>();
  private readonly url: string;
  private readonly createWebSocket: WebSocketFactory;
  private readonly performanceMonitor: RecognitionPerformanceMonitor;
  private readonly decoder: DefaultContinuousSignDecoder;
  private readonly inferenceIntervalMs: number;

  private socket: WebSocketLike | null = null;
  private connectPromise: Promise<void> | null = null;
  private rejectPendingConnect: ((reason?: unknown) => void) | null = null;
  private connectionState: RecognitionConnectionState = "DISCONNECTED";
  private supportedSymbols: readonly string[] = [];
  private modelVersion = "frontend-temporal";
  private activeHandSessionId: string | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectEnabled = true;
  private reconnectAttempt = 0;
  private lastMissingSentAt = Number.NEGATIVE_INFINITY;
  private lastLandmarkSentAt = Number.NEGATIVE_INFINITY;
  private activeFrameId: number | null = null;
  private pendingFrame: HandLandmarkFrame | null = null;
  private predictionSequence = 0;
  private readonly sentFrames = new Map<
    number,
    { capturedAt: number; sentAt: number; sessionId?: string }
  >();

  constructor(options: PracticeWebSocketSignRecognizerOptions) {
    this.url = options.url;
    this.createWebSocket =
      options.createWebSocket ?? ((socketUrl) => new WebSocket(socketUrl));
    this.performanceMonitor =
      options.performanceMonitor ?? new RecognitionPerformanceMonitor();
    this.decoder =
      options.decoder ??
      new DefaultContinuousSignDecoder({ config: options.decoderConfig });
    this.inferenceIntervalMs =
      1000 /
      (options.aiInferenceFps ??
        DEFAULT_RECOGNITION_RATE_CONFIG.aiInferenceFps);

    this.decoder.subscribe((event) => {
      if (event.type === "SIGN_CONFIRMED") {
        this.emit({
          type: "SIGN_CONFIRMED",
          symbol: event.symbol,
          confidence: event.confidence,
          confirmedAt: event.occurredAt,
          modelVersion: this.modelVersion,
        });
      } else if (event.type === "HAND_RELEASED") {
        this.emit({
          type: "HAND_RELEASED",
          releasedAt: event.occurredAt,
        });
      }
    });
  }

  connect(): Promise<void> {
    this.reconnectEnabled = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.setConnectionState("CONNECTING");

    let socket: WebSocketLike;
    try {
      socket = this.createWebSocket(this.url);
    } catch (cause) {
      this.setConnectionState("ERROR");
      this.emit({
        type: "ERROR",
        code: "WEBSOCKET_ERROR",
        message: "AI recognition server connection could not start",
      });
      this.scheduleReconnect();
      return Promise.reject(cause);
    }

    this.socket = socket;
    this.connectPromise = new Promise<void>((resolve, reject) => {
      this.rejectPendingConnect = reject;

      socket.onopen = () => {
        if (this.socket !== socket) return;
        this.connectPromise = null;
        this.rejectPendingConnect = null;
        this.reconnectAttempt = 0;
        this.setConnectionState("CONNECTED");
        void this.decoder.start();
        this.sendMessage({ type: "GET_CAPABILITIES" });
        resolve();
      };

      socket.onmessage = (event) => this.handleMessage(event.data);
      socket.onerror = () => {
        if (this.socket !== socket) return;
        this.emit({
          type: "ERROR",
          code: "WEBSOCKET_ERROR",
          message: "WebSocket connection failed",
        });
        this.setConnectionState("ERROR");
        this.scheduleReconnect();
        socket.close();
      };

      socket.onclose = () => {
        if (this.socket !== socket) return;
        this.socket = null;
        void this.decoder.stop();
        this.clearInferenceState();
        const pendingConnect = this.connectPromise;
        this.connectPromise = null;
        this.rejectPendingConnect = null;
        this.setConnectionState("DISCONNECTED");
        if (pendingConnect) {
          reject(new Error("WebSocket closed before the connection completed"));
        }
        this.scheduleReconnect();
      };
    });

    return this.connectPromise;
  }

  disconnect(): void {
    this.reconnectEnabled = false;
    this.reconnectAttempt = 0;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const socket = this.socket;
    this.socket = null;
    const rejectPendingConnect = this.rejectPendingConnect;
    this.connectPromise = null;
    this.rejectPendingConnect = null;
    this.activeHandSessionId = undefined;
    this.clearInferenceState();
    void this.decoder.stop();

    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.close();
    }
    rejectPendingConnect?.(new Error("WebSocket disconnected"));
    if (this.connectionState !== "DISCONNECTED") {
      this.setConnectionState("DISCONNECTED");
    }
  }

  subscribe(listener: RecognitionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSupportedSymbols(): readonly string[] {
    return this.supportedSymbols;
  }

  getConnectionState(): RecognitionConnectionState {
    return this.connectionState;
  }

  getPerformanceMonitor(): RecognitionPerformanceMonitor {
    return this.performanceMonitor;
  }

  getTemporalDecoder(): ContinuousSignRecognizer &
    Pick<DefaultContinuousSignDecoder, "getConfig" | "updateConfig"> {
    return this.decoder;
  }

  sendLandmarkFrame(frame: HandLandmarkFrame): void {
    if (!isValidHandLandmarks(frame.landmarks)) {
      this.emit({
        type: "ERROR",
        code: "INVALID_LANDMARK_COUNT",
        message: "Expected 21 finite landmarks",
      });
      return;
    }

    if (
      frame.activeHandSessionId &&
      frame.activeHandSessionId !== this.activeHandSessionId
    ) {
      this.activeHandSessionId = frame.activeHandSessionId;
      this.decoder.beginInputSession();
    }

    this.decoder.pushFrame({
      capturedAt: frame.capturedAt,
      handPresent: true,
      handId: frame.activeHandId,
      handedness:
        frame.handedness === "UNKNOWN" ? undefined : frame.handedness,
      rawLandmarks: frame.rawLandmarks ?? frame.landmarks,
      normalizedLandmarks: frame.landmarks,
    });

    if (this.socket?.readyState !== WebSocket.OPEN) return;

    if (
      this.activeFrameId !== null ||
      frame.capturedAt - this.lastLandmarkSentAt < this.inferenceIntervalMs
    ) {
      if (this.pendingFrame) {
        this.performanceMonitor.drop("inference");
      }
      this.pendingFrame = frame;
      return;
    }

    this.dispatchFrame(frame);
  }

  notifyHandNotDetected(capturedAt: number): void {
    this.sentFrames.clear();
    this.pendingFrame = null;
    this.activeFrameId = null;
    this.decoder.pushFrame({ capturedAt, handPresent: false });

    if (
      this.socket?.readyState !== WebSocket.OPEN ||
      capturedAt - this.lastMissingSentAt < HAND_MISSING_SEND_INTERVAL_MS
    ) {
      return;
    }

    this.lastMissingSentAt = capturedAt;
    this.sendMessage({ type: "HAND_NOT_DETECTED", capturedAt });
  }

  private handleMessage(raw: string): void {
    try {
      const message = parseServerMessage(raw);

      if (message.type === "PREDICTION") {
        const metadata = this.sentFrames.get(message.frameId);
        this.sentFrames.delete(message.frameId);
        if (this.activeFrameId === message.frameId) {
          this.activeFrameId = null;
        }

        if (
          metadata &&
          metadata.sessionId === this.activeHandSessionId
        ) {
          this.performanceMonitor.mark("aiResponse");
          this.performanceMonitor.recordAiLatency(
            Math.max(0, Date.now() - metadata.sentAt),
          );

          if (message.symbol !== NONE_SYMBOL) {
            this.emit(message);
            this.decoder.pushFrame({
              capturedAt: metadata.capturedAt,
              handPresent: true,
              prediction: {
                symbol: message.symbol,
                confidence: message.confidence,
                predictedAt: message.predictedAt,
                sequence: ++this.predictionSequence,
              },
            });
          }
        }

        this.dispatchPendingFrame();
        return;
      }

      if (message.type === "CAPABILITIES") {
        const supportedSymbols = message.supportedSymbols.filter(
          (symbol) => symbol !== NONE_SYMBOL,
        );
        const confidenceThresholds = message.confidenceThresholds
          ? Object.fromEntries(
              Object.entries(message.confidenceThresholds).filter(
                ([symbol]) => symbol !== NONE_SYMBOL,
              ),
            )
          : undefined;
        const capabilities = {
          ...message,
          supportedSymbols,
          confidenceThresholds,
        };

        this.supportedSymbols = supportedSymbols;
        this.modelVersion = message.modelVersion;
        if (message.modelVersion === NUMBER_MODEL_VERSION) {
          // 숫자 서버는 현재 모든 글자의 임계값을 1.0으로 내려준다.
          // 연습 화면에서는 반복 투표와 손 안정성 조건을 유지하면서
          // 숫자 모델에 맞는 별도 최소 신뢰도를 사용한다.
          this.decoder.updateConfig({
            minimumConfidence: NUMBER_MINIMUM_CONFIDENCE,
            minimumConfidenceBySymbol: undefined,
          });
        } else if (confidenceThresholds) {
          this.decoder.updateConfig({
            minimumConfidenceBySymbol: confidenceThresholds,
          });
        }
        this.decoder.beginInputSession();
        this.emit(capabilities);
        return;
      }

      // 최종 확정과 손 해제는 프런트 Temporal Decoder가 담당한다.
      if (
        message.type === "SIGN_CONFIRMED" ||
        message.type === "HAND_RELEASED"
      ) {
        return;
      }

      this.emit(message);
    } catch (error) {
      const message =
        error instanceof ServerMessageError
          ? error.message
          : "Unable to process server message";
      this.emit({
        type: "ERROR",
        code: "INVALID_SERVER_MESSAGE",
        message,
      });
    }
  }

  private dispatchFrame(frame: HandLandmarkFrame): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;

    this.lastLandmarkSentAt = frame.capturedAt;
    this.activeFrameId = frame.frameId;
    this.sentFrames.set(frame.frameId, {
      capturedAt: frame.capturedAt,
      sentAt: Date.now(),
      sessionId: frame.activeHandSessionId,
    });
    this.performanceMonitor.mark("aiRequest");
    this.sendMessage({
      type: "LANDMARK_FRAME",
      frameId: frame.frameId,
      capturedAt: frame.capturedAt,
      handedness: frame.handedness,
      landmarks: frame.landmarks,
    });
  }

  private dispatchPendingFrame(): void {
    const pending = this.pendingFrame;
    this.pendingFrame = null;
    if (
      !pending ||
      pending.activeHandSessionId !== this.activeHandSessionId
    ) {
      return;
    }
    this.dispatchFrame(pending);
  }

  private sendMessage(message: object): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private setConnectionState(state: RecognitionConnectionState): void {
    this.connectionState = state;
    this.emit({
      type: "CONNECTION_STATE",
      state,
      changedAt: Date.now(),
    });
  }

  private scheduleReconnect(): void {
    if (
      !this.reconnectEnabled ||
      this.reconnectTimer !== null ||
      this.socket?.readyState === WebSocket.OPEN
    ) {
      return;
    }

    const delay = Math.min(
      RECONNECT_INITIAL_DELAY_MS * 2 ** this.reconnectAttempt,
      RECONNECT_MAX_DELAY_MS,
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect().catch(() => undefined);
    }, delay);
  }

  private clearInferenceState(): void {
    this.lastMissingSentAt = Number.NEGATIVE_INFINITY;
    this.lastLandmarkSentAt = Number.NEGATIVE_INFINITY;
    this.activeFrameId = null;
    this.pendingFrame = null;
    this.sentFrames.clear();
  }

  private emit(event: SignRecognitionEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }
}
