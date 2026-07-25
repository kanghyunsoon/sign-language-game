import type { SignRecognizer, SignRecognitionListener } from "../core/SignRecognizer";
import type { RecognitionConnectionState, SignRecognitionEvent } from "../types/events";
import { isValidHandLandmarks, type HandLandmarkFrame } from "../types/landmark";
import { parseServerMessage, ServerMessageError } from "./serverMessages";
import { DefaultLatestOnlyInferenceController, DEFAULT_RECOGNITION_RATE_CONFIG, RecognitionPerformanceMonitor } from "../runtime";
import { DefaultContinuousSignDecoder, type SignDecoderConfig, type ContinuousSignRecognizer } from "../temporal";
import type { ContextualPredictionSelector, PredictionEvent } from "../contextual";

const HAND_MISSING_SEND_INTERVAL_MS = 80;
const RECONNECT_INITIAL_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 8_000;

export interface LandmarkFrameSink {
  sendLandmarkFrame(frame: HandLandmarkFrame): void;
  notifyHandNotDetected(capturedAt: number): void;
}

export interface WebSocketLike {
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<string>) => void) | null;
  send(data: string): void;
  close(): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export interface PythonWebSocketSignRecognizerOptions {
  readonly url: string;
  readonly createWebSocket?: WebSocketFactory;
  readonly aiInferenceFps?: number;
  readonly maximumPredictionAgeMs?: number;
  readonly performanceMonitor?: RecognitionPerformanceMonitor;
  readonly decoder?: DefaultContinuousSignDecoder;
  readonly decoderConfig?: SignDecoderConfig;
  readonly predictionSelector?: ContextualPredictionSelector;
}

export class PythonWebSocketSignRecognizer implements SignRecognizer, LandmarkFrameSink {
  private readonly listeners = new Set<SignRecognitionListener>();
  private socket: WebSocketLike | null = null;
  private connectPromise: Promise<void> | null = null;
  private rejectPendingConnect: ((reason?: unknown) => void) | null = null;
  private connectionState: RecognitionConnectionState = "DISCONNECTED";
  private supportedSymbols: readonly string[] = [];
  private lastMissingSentAt = Number.NEGATIVE_INFINITY;
  private readonly inference: DefaultLatestOnlyInferenceController;
  private readonly performanceMonitor: RecognitionPerformanceMonitor;
  private readonly decoder: DefaultContinuousSignDecoder;
  private modelVersion = "frontend-temporal";
  private activeHandSessionId: string | undefined;
  private latestOnlyInferenceEnabled = true;
  private continuousSignDecoderEnabled = true;
  private legacyPredictionSequence = 0;
  private readonly legacyFrames = new Map<number, { capturedAt: number; sentAt: number; sessionId?: string; contextRevision?: string }>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectEnabled = true;
  private reconnectAttempt = 0;
  private lastLandmarkSentAt = Number.NEGATIVE_INFINITY;
  private readonly directInferenceIntervalMs: number;
  private directInferenceFrameId: number | null = null;
  private pendingDirectFrame: HandLandmarkFrame | null = null;
  private readonly predictionSelector?: ContextualPredictionSelector;
  private decoderContextRevision: string | undefined;

  private readonly url: string;
  private readonly createWebSocket: WebSocketFactory;

  constructor(options: PythonWebSocketSignRecognizerOptions) {
    this.url = options.url;
    this.directInferenceIntervalMs = 1000 / (options.aiInferenceFps ?? DEFAULT_RECOGNITION_RATE_CONFIG.aiInferenceFps);
    this.createWebSocket = options.createWebSocket ?? ((socketUrl) => new WebSocket(socketUrl));
    this.predictionSelector = options.predictionSelector;
    this.performanceMonitor=options.performanceMonitor??new RecognitionPerformanceMonitor();
    this.decoder = options.decoder ?? new DefaultContinuousSignDecoder({ config: options.decoderConfig });
    this.inference = new DefaultLatestOnlyInferenceController({
      inferenceFps: options.aiInferenceFps ?? DEFAULT_RECOGNITION_RATE_CONFIG.aiInferenceFps,
      maximumPredictionAgeMs: options.maximumPredictionAgeMs,
      monitor: this.performanceMonitor,
      dispatch: (frame) => this.sendMessage({ type: "LANDMARK_FRAME", frameId: frame.frameId, capturedAt: frame.capturedAt, handedness: frame.handedness, landmarks: frame.landmarks }),
    });
    this.inference.subscribe((result) => {
      const prediction: PredictionEvent = { type: "PREDICTION", frameId: result.frameId, symbol: result.symbol, confidence: result.confidence, isStable: result.isStable, predictedAt: result.predictedAt };
      const filtered = withoutNumericPrediction(prediction);
      if (!filtered) return;
      this.emit(filtered);
      this.applyPredictionToDecoder(filtered, result.sequence, Date.now(), this.predictionSelector?.captureContext(this.supportedSymbols));
    });
    this.decoder.subscribe((event) => {
      if (event.type === "SIGN_CONFIRMED") this.emit({ type: "SIGN_CONFIRMED", symbol: event.symbol, confidence: event.confidence, confirmedAt: event.occurredAt, modelVersion: this.modelVersion });
      else if (event.type === "HAND_RELEASED") this.emit({ type: "HAND_RELEASED", releasedAt: event.occurredAt });
    });
  }

  connect(): Promise<void> {
    this.reconnectEnabled = true;
    if (this.reconnectTimer !== null) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;

    this.setConnectionState("CONNECTING");
    let socket: WebSocketLike;
    try {
      socket = this.createWebSocket(this.url);
    } catch (cause) {
      this.setConnectionState("ERROR");
      this.emit({ type: "ERROR", code: "WEBSOCKET_ERROR", message: "AI recognition server connection could not start" });
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
        this.inference.start();
        void this.decoder.start();
        this.sendMessage({ type: "GET_CAPABILITIES" });
        resolve();
      };
      socket.onmessage = (event) => this.handleMessage(event.data);
      socket.onerror = () => {
        if (this.socket !== socket) return;
        this.emit({ type: "ERROR", code: "WEBSOCKET_ERROR", message: "WebSocket connection failed" });
        this.setConnectionState("ERROR");
        this.scheduleReconnect();
        socket.close();
      };
      socket.onclose = () => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.inference.stop();
        void this.decoder.stop();
        this.directInferenceFrameId = null;
        this.pendingDirectFrame = null;
        this.legacyFrames.clear();
        this.decoderContextRevision = undefined;
        this.lastLandmarkSentAt = Number.NEGATIVE_INFINITY;
        const pendingConnect = this.connectPromise;
        this.connectPromise = null;
        this.rejectPendingConnect = null;
        this.setConnectionState("DISCONNECTED");
        if (pendingConnect) reject(new Error("WebSocket closed before the connection completed"));
        this.scheduleReconnect();
      };
    });
    return this.connectPromise;
  }

  disconnect(): void {
    this.reconnectEnabled = false;
    this.reconnectAttempt = 0;
    if (this.reconnectTimer !== null) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    const socket = this.socket;
    this.socket = null;
    const rejectPendingConnect = this.rejectPendingConnect;
    this.connectPromise = null;
    this.rejectPendingConnect = null;
    this.lastMissingSentAt = Number.NEGATIVE_INFINITY;
    this.lastLandmarkSentAt = Number.NEGATIVE_INFINITY;
    this.directInferenceFrameId = null;
    this.pendingDirectFrame = null;
    this.legacyFrames.clear();
    this.decoderContextRevision = undefined;
    this.activeHandSessionId = undefined;
    this.inference.stop();
    void this.decoder.stop();
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
    rejectPendingConnect?.(new Error("WebSocket disconnected"));
    if (this.connectionState !== "DISCONNECTED") this.setConnectionState("DISCONNECTED");
  }

  subscribe(listener: SignRecognitionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSupportedSymbols(): readonly string[] {
    return this.supportedSymbols;
  }

  getConnectionState(): RecognitionConnectionState {
    return this.connectionState;
  }
  getPerformanceMonitor(): RecognitionPerformanceMonitor { return this.performanceMonitor; }
  getConfirmationAuthority(): "TEMPORAL_DECODER" { return "TEMPORAL_DECODER"; }
  getTemporalDecoder(): ContinuousSignRecognizer & Pick<DefaultContinuousSignDecoder, "getConfig" | "updateConfig"> { return this.decoder; }
  configureHardening(options:{readonly latestOnlyInferenceEnabled:boolean;readonly continuousSignDecoderEnabled:boolean}):void{this.latestOnlyInferenceEnabled=options.latestOnlyInferenceEnabled;this.continuousSignDecoderEnabled=options.continuousSignDecoderEnabled;this.legacyFrames.clear();this.legacyPredictionSequence=0;}

  sendLandmarkFrame(frame: HandLandmarkFrame): void {
    if (!isValidHandLandmarks(frame.landmarks)) {
      this.emit({ type: "ERROR", code: "INVALID_LANDMARK_COUNT", message: "Expected 21 finite landmarks" });
      return;
    }
    if (frame.activeHandSessionId && frame.activeHandSessionId !== this.activeHandSessionId) {
      this.activeHandSessionId = frame.activeHandSessionId;
      this.decoder.beginInputSession();
    }
    if(this.continuousSignDecoderEnabled)this.decoder.pushFrame({
      capturedAt: frame.capturedAt,
      handPresent: true,
      handId: frame.activeHandId,
      handedness: frame.handedness === "UNKNOWN" ? undefined : frame.handedness,
      rawLandmarks: frame.rawLandmarks ?? frame.landmarks,
      normalizedLandmarks: frame.landmarks,
    });
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    if (this.directInferenceFrameId !== null || frame.capturedAt - this.lastLandmarkSentAt < this.directInferenceIntervalMs) {
      if (this.pendingDirectFrame) this.performanceMonitor.drop("inference");
      this.pendingDirectFrame = frame;
      return;
    }
    this.dispatchDirectFrame(frame);
  }

  notifyHandNotDetected(capturedAt: number): void {
    this.inference.invalidateSession();
    this.legacyFrames.clear();
    if(this.continuousSignDecoderEnabled)this.decoder.pushFrame({ capturedAt, handPresent: false });
    if (!this.canSend(this.lastMissingSentAt, capturedAt, HAND_MISSING_SEND_INTERVAL_MS)) return;
    this.lastMissingSentAt = capturedAt;
    this.sendMessage({ type: "HAND_NOT_DETECTED", capturedAt });
  }

  private canSend(lastSentAt: number, capturedAt: number, interval = HAND_MISSING_SEND_INTERVAL_MS): boolean {
    return this.socket?.readyState === WebSocket.OPEN && capturedAt - lastSentAt >= interval;
  }

  private sendMessage(message: object): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private handleMessage(raw: string): void {
    try {
      const message = parseServerMessage(raw);
      if (message.type === "PREDICTION") {
        const metadata=this.legacyFrames.get(message.frameId);
        this.legacyFrames.delete(message.frameId);
        if(this.directInferenceFrameId===message.frameId)this.directInferenceFrameId=null;
        const filteredPrediction = withoutNumericPrediction(message);
        if(metadata&&metadata.sessionId===this.activeHandSessionId){
          this.performanceMonitor.mark("aiResponse");
          this.performanceMonitor.recordAiLatency(Math.max(0,Date.now()-metadata.sentAt));
          if (filteredPrediction) {
            this.emit(filteredPrediction);
            this.applyPredictionToDecoder(filteredPrediction, ++this.legacyPredictionSequence, metadata.capturedAt, metadata.contextRevision);
          }
        }
        this.dispatchPendingDirectFrame();
        return;
      }
      // Python remains a static prediction provider. Final confirmation/release is owned by the frontend decoder.
      if (message.type === "SIGN_CONFIRMED" || message.type === "HAND_RELEASED") {
        if (
          !this.continuousSignDecoderEnabled
          && (message.type !== "SIGN_CONFIRMED" || !isNumericSymbol(message.symbol))
        ) this.emit(message);
        return;
      }
      if (message.type === "CAPABILITIES") {
        const supportedSymbols = message.supportedSymbols.filter((symbol) => !isNumericSymbol(symbol));
        const filteredMessage = {
          ...message,
          supportedSymbols,
          competitiveSymbols: message.competitiveSymbols?.filter((symbol) => !isNumericSymbol(symbol)),
        };
        this.supportedSymbols = supportedSymbols;
        this.modelVersion = message.modelVersion;
        if (message.confidenceThresholds) this.decoder.updateConfig({ minimumConfidenceBySymbol: message.confidenceThresholds });
        this.decoderContextRevision = undefined;
        this.decoder.beginInputSession();
        this.emit(filteredMessage);
        return;
      }
      this.emit(message);
    } catch (error) {
      const message = error instanceof ServerMessageError ? error.message : "Unable to process server message";
      this.emit({ type: "ERROR", code: "INVALID_SERVER_MESSAGE", message });
    }
  }

  private setConnectionState(state: RecognitionConnectionState): void {
    this.connectionState = state;
    this.emit({ type: "CONNECTION_STATE", state, changedAt: Date.now() });
  }

  private scheduleReconnect(): void {
    if (!this.reconnectEnabled || this.reconnectTimer !== null || this.socket?.readyState === WebSocket.OPEN) return;
    const delay = Math.min(RECONNECT_INITIAL_DELAY_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_DELAY_MS);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect().catch(() => undefined);
    }, delay);
  }

  private emit(event: SignRecognitionEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }

  private dispatchDirectFrame(frame: HandLandmarkFrame): void {
    if(this.socket?.readyState!==WebSocket.OPEN)return;
    this.lastLandmarkSentAt=frame.capturedAt;
    this.directInferenceFrameId=frame.frameId;
    this.legacyFrames.set(frame.frameId,{capturedAt:frame.capturedAt,sentAt:Date.now(),sessionId:frame.activeHandSessionId,contextRevision:this.predictionSelector?.captureContext(this.supportedSymbols)});
    this.performanceMonitor.mark("aiRequest");
    this.sendMessage({type:"LANDMARK_FRAME",frameId:frame.frameId,capturedAt:frame.capturedAt,handedness:frame.handedness,landmarks:frame.landmarks});
  }

  private dispatchPendingDirectFrame(): void {
    const pending=this.pendingDirectFrame;
    this.pendingDirectFrame=null;
    if(!pending||pending.activeHandSessionId!==this.activeHandSessionId)return;
    this.dispatchDirectFrame(pending);
  }

  private applyPredictionToDecoder(prediction: PredictionEvent, sequence: number, capturedAt: number, capturedContextRevision?: string): void {
    if (!this.continuousSignDecoderEnabled || isNumericSymbol(prediction.symbol)) return;
    let selected = { symbol: prediction.symbol, confidence: prediction.confidence };
    if (this.predictionSelector) {
      const resolution = this.predictionSelector.resolve(prediction, this.supportedSymbols, capturedContextRevision ?? "");
      this.emit(resolution.diagnostics);
      if (this.decoderContextRevision !== resolution.diagnostics.contextRevision) {
        this.decoder.beginInputSession();
        this.decoderContextRevision = resolution.diagnostics.contextRevision;
      }
      if (!resolution.selectedCandidate || resolution.diagnostics.rejectionReason) return;
      selected = resolution.selectedCandidate;
    }
    this.decoder.pushFrame({ capturedAt, handPresent: true, prediction: { symbol: selected.symbol, confidence: selected.confidence, predictedAt: prediction.predictedAt, sequence } });
  }
}

function withoutNumericPrediction(prediction: PredictionEvent): PredictionEvent | null {
  const topCandidates = prediction.topCandidates?.filter((candidate) => !isNumericSymbol(candidate.symbol));
  if (!isNumericSymbol(prediction.symbol)) {
    return topCandidates ? { ...prediction, topCandidates } : prediction;
  }
  const replacement = topCandidates?.[0];
  if (!replacement) return null;
  return {
    ...prediction,
    symbol: replacement.symbol,
    confidence: replacement.confidence,
    topCandidates,
  };
}

function isNumericSymbol(symbol: string): boolean {
  return /^\d+$/.test(symbol);
}
