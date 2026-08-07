import {
  RecognitionPerformanceMonitor,
  type RecognitionConnectionState,
  type SignRecognitionEvent,
} from "../../../game/recognition";
import {
  parseServerMessage,
  ServerMessageError,
} from "../../../game/recognition/websocket/serverMessages";
import { WordPredictionDecoder } from "./WordPredictionDecoder";
import type { WordLandmarkFrame } from "./wordRecognitionTypes";

const HAND_MISSING_SEND_INTERVAL_MS = 80;
const RECONNECT_INITIAL_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 8_000;
const DEFAULT_INFERENCE_FPS = 18;
const NONE_SYMBOL = "none";

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

export interface WordWebSocketSignRecognizerOptions {
  readonly url: string;
  readonly createWebSocket?: WebSocketFactory;
  readonly aiInferenceFps?: number;
  readonly performanceMonitor?: RecognitionPerformanceMonitor;
  readonly decoder?: WordPredictionDecoder;
}

/** 단어 연습 전용 양손 WebSocket 인식기. */
export class WordWebSocketSignRecognizer {
  private readonly listeners = new Set<RecognitionListener>();
  private readonly url: string;
  private readonly createWebSocket: WebSocketFactory;
  private readonly performanceMonitor: RecognitionPerformanceMonitor;
  private readonly decoder: WordPredictionDecoder;
  private readonly inferenceIntervalMs: number;

  private socket: WebSocketLike | null = null;
  private connectPromise: Promise<void> | null = null;
  private rejectPendingConnect: ((reason?: unknown) => void) | null = null;
  private connectionState: RecognitionConnectionState = "DISCONNECTED";
  private modelVersion = "word-13-v1";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectEnabled = true;
  private reconnectAttempt = 0;
  private lastMissingSentAt = Number.NEGATIVE_INFINITY;
  private lastLandmarkSentAt = Number.NEGATIVE_INFINITY;
  private activeFrameId: number | null = null;
  private pendingFrame: WordLandmarkFrame | null = null;
  private readonly sentFrames = new Map<
    number,
    { capturedAt: number; sentAt: number; sessionId?: string }
  >();

  constructor(options: WordWebSocketSignRecognizerOptions) {
    this.url = options.url;
    this.createWebSocket =
      options.createWebSocket ?? ((socketUrl) => new WebSocket(socketUrl));
    this.performanceMonitor =
      options.performanceMonitor ?? new RecognitionPerformanceMonitor();
    this.decoder = options.decoder ?? new WordPredictionDecoder();
    this.inferenceIntervalMs =
      1000 / (options.aiInferenceFps ?? DEFAULT_INFERENCE_FPS);

    this.decoder.subscribe((event) => {
      if (event.type === "SIGN_CONFIRMED") {
        this.emit({
          type: "SIGN_CONFIRMED",
          symbol: event.symbol,
          confidence: event.confidence,
          confirmedAt: event.occurredAt,
          modelVersion: this.modelVersion,
        });
      } else {
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
      this.emitError("WEBSOCKET_ERROR", "단어 AI 서버 연결을 시작하지 못했습니다.");
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
        this.clearInferenceState();
        this.decoder.reset();
        this.setConnectionState("CONNECTED");
        this.sendMessage({ type: "GET_CAPABILITIES" });
        this.sendMessage({ type: "RESET_SEQUENCE" });
        resolve();
      };
      socket.onmessage = (event) => this.handleMessage(event.data);
      socket.onerror = () => {
        if (this.socket !== socket) return;
        this.releaseInFlight();
        this.emitError("WEBSOCKET_ERROR", "단어 AI 서버 연결에 실패했습니다.");
        this.setConnectionState("ERROR");
        socket.close();
      };
      socket.onclose = () => {
        if (this.socket !== socket) return;
        this.socket = null;
        const pendingConnect = this.connectPromise;
        this.connectPromise = null;
        this.rejectPendingConnect = null;
        this.clearInferenceState();
        this.decoder.reset();
        this.setConnectionState("DISCONNECTED");
        if (pendingConnect) {
          reject(new Error("WebSocket closed before connection completed"));
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
    const rejectPendingConnect = this.rejectPendingConnect;
    this.socket = null;
    this.connectPromise = null;
    this.rejectPendingConnect = null;
    this.clearInferenceState();
    this.decoder.reset();
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

  getConnectionState(): RecognitionConnectionState {
    return this.connectionState;
  }

  getPerformanceMonitor(): RecognitionPerformanceMonitor {
    return this.performanceMonitor;
  }

  sendLandmarkFrame(frame: WordLandmarkFrame): void {
    const hands = [frame.hands.left, frame.hands.right].filter(
      (hand) => hand !== null,
    );
    if (
      hands.length === 0 ||
      frame.frameWidth <= 0 ||
      frame.frameHeight <= 0 ||
      hands.some(
        (hand) =>
          hand.landmarks.length !== 21 ||
          hand.landmarks.some(
            (landmark) =>
              !Number.isFinite(landmark.x) ||
              !Number.isFinite(landmark.y) ||
              !Number.isFinite(landmark.z),
          ),
      )
    ) {
      this.emitError(
        "INVALID_LANDMARK_FRAME",
        "양손 프레임에는 유효한 영상 크기와 손별 21개 landmark가 필요합니다.",
      );
      return;
    }

    this.decoder.notifyHandsDetected();
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

  notifyHandsNotDetected(capturedAt: number): void {
    this.pendingFrame = null;
    this.decoder.notifyHandsNotDetected(capturedAt);
    if (
      this.socket?.readyState !== WebSocket.OPEN ||
      capturedAt - this.lastMissingSentAt < HAND_MISSING_SEND_INTERVAL_MS
    ) {
      return;
    }
    this.lastMissingSentAt = capturedAt;
    this.sendMessage({ type: "HAND_NOT_DETECTED", capturedAt });
  }

  resetSequence(): void {
    this.clearInferenceState();
    this.decoder.reset();
    this.sendMessage({ type: "RESET_SEQUENCE" });
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
        if (metadata) {
          this.performanceMonitor.mark("aiResponse");
          this.performanceMonitor.recordAiLatency(
            Math.max(0, Date.now() - metadata.sentAt),
          );
          if (message.symbol !== NONE_SYMBOL) {
            this.emit(message);
            this.decoder.pushPrediction({
              symbol: message.symbol,
              confidence: message.confidence,
              predictedAt: message.predictedAt,
            });
          }
        }
        this.dispatchPendingFrame();
        return;
      }

      if (message.type === "CAPABILITIES") {
        this.modelVersion = message.modelVersion;
        this.decoder.setConfidenceThresholds(message.confidenceThresholds);
        this.emit({
          ...message,
          supportedSymbols: message.supportedSymbols.filter(
            (symbol) => symbol !== NONE_SYMBOL,
          ),
        });
        return;
      }

      if (message.type === "ERROR") {
        this.releaseInFlight();
        this.emit(message);
        this.dispatchPendingFrame();
        return;
      }

      if (
        message.type !== "SIGN_CONFIRMED" &&
        message.type !== "HAND_RELEASED"
      ) {
        this.emit(message);
      }
    } catch (error) {
      this.releaseInFlight();
      this.emitError(
        "INVALID_SERVER_MESSAGE",
        error instanceof ServerMessageError
          ? error.message
          : "단어 AI 응답을 처리하지 못했습니다.",
      );
      this.dispatchPendingFrame();
    }
  }

  private dispatchFrame(frame: WordLandmarkFrame): void {
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
      frameWidth: frame.frameWidth,
      frameHeight: frame.frameHeight,
      hands: frame.hands,
      pose: frame.pose,
    });
  }

  private dispatchPendingFrame(): void {
    const pending = this.pendingFrame;
    this.pendingFrame = null;
    if (pending) {
      this.dispatchFrame(pending);
    }
  }

  private releaseInFlight(): void {
    if (this.activeFrameId !== null) {
      this.sentFrames.delete(this.activeFrameId);
      this.activeFrameId = null;
    }
  }

  private sendMessage(message: object): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private setConnectionState(state: RecognitionConnectionState): void {
    this.connectionState = state;
    this.emit({ type: "CONNECTION_STATE", state, changedAt: Date.now() });
  }

  private emitError(code: string, message: string): void {
    this.emit({ type: "ERROR", code, message });
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
