import type { HandLandmarkFrame } from "../types/landmark";
import { SingleLatestFrameBuffer } from "./LatestFrameBuffer";
import type { RecognitionPerformanceMonitor } from "./RecognitionPerformanceMonitor";

export type NormalizedHandFrame = HandLandmarkFrame;

export interface SignInferenceRequestMetadata {
  readonly requestId: string;
  readonly sequence: number;
  readonly capturedAt: number;
  readonly sessionId: string;
  readonly activeHandId?: string;
}

export interface SignInferenceResult {
  readonly frameId: number;
  readonly symbol: string;
  readonly confidence: number;
  readonly isStable: boolean;
  readonly predictedAt: number;
}

export interface AcceptedSignInferenceResult extends SignInferenceResult {
  readonly sequence: number;
  readonly capturedAt: number;
  readonly sessionId: string;
}

export interface LatestOnlyInferenceController {
  start(): void;
  submit(frame: NormalizedHandFrame): void;
  subscribe(listener: (result: AcceptedSignInferenceResult) => void): () => void;
  stop(): void;
  dispose(): void;
}

type ScheduleTimer = (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
type CancelTimer = (timer: ReturnType<typeof setTimeout>) => void;

export interface DefaultLatestOnlyInferenceControllerOptions {
  readonly inferenceFps: number;
  readonly maximumPredictionAgeMs?: number;
  readonly responseTimeoutMs?: number;
  readonly monitor?: RecognitionPerformanceMonitor;
  readonly dispatch: (frame: NormalizedHandFrame, metadata: SignInferenceRequestMetadata) => void;
  readonly now?: () => number;
  readonly setTimer?: ScheduleTimer;
  readonly clearTimer?: CancelTimer;
  readonly createId?: () => string;
}

export class DefaultLatestOnlyInferenceController implements LatestOnlyInferenceController {
  private readonly pending = new SingleLatestFrameBuffer<NormalizedHandFrame>();
  private readonly listeners = new Set<(result: AcceptedSignInferenceResult) => void>();
  private readonly sent = new Map<number, SignInferenceRequestMetadata>();
  private running = false;
  private disposed = false;
  private scheduleTimer: ReturnType<typeof setTimeout> | null = null;
  private responseTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: SignInferenceRequestMetadata | null = null;
  private lastSentAt = Number.NEGATIVE_INFINITY;
  private lastAppliedSequence = 0;
  private sequence = 0;
  private sessionId = "";
  private activeHandId: string | undefined;
  private readonly now: () => number;
  private readonly setTimer: ScheduleTimer;
  private readonly clearTimer: CancelTimer;
  private readonly createId: () => string;
  private readonly intervalMs: number;
  private readonly maximumAge: number;
  private readonly responseTimeoutMs: number;

  constructor(private readonly options: DefaultLatestOnlyInferenceControllerOptions) {
    if (!Number.isFinite(options.inferenceFps) || options.inferenceFps <= 0) {
      throw new RangeError("inferenceFps must be positive.");
    }
    this.intervalMs = 1000 / options.inferenceFps;
    this.maximumAge = options.maximumPredictionAgeMs ?? 750;
    this.responseTimeoutMs = options.responseTimeoutMs ?? Math.max(1000, this.intervalMs * 4);
    this.now = options.now ?? Date.now;
    this.setTimer = options.setTimer ?? setTimeout;
    this.clearTimer = options.clearTimer ?? clearTimeout;
    this.createId = options.createId ?? defaultId;
  }

  start(): void {
    if (this.disposed) throw new Error("Inference controller is disposed.");
    if (this.running) return;
    this.running = true;
    this.sessionId = this.createId();
    this.sequence = 0;
    this.lastAppliedSequence = 0;
    this.lastSentAt = Number.NEGATIVE_INFINITY;
  }

  submit(frame: NormalizedHandFrame): void {
    if (!this.running || this.disposed) return;
    if (frame.activeHandSessionId && (frame.activeHandSessionId !== this.sessionId || frame.activeHandId !== this.activeHandId)) {
      this.rotateSession(frame.activeHandSessionId, frame.activeHandId);
    }
    this.pending.push(frame);
    const replaced = this.pending.takeReplacementCount();
    if (replaced) this.options.monitor?.drop("inference", replaced);
    this.schedule();
  }

  subscribe(listener: (result: AcceptedSignInferenceResult) => void): () => void {
    if (this.disposed) throw new Error("Inference controller is disposed.");
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  accept(result: SignInferenceResult): boolean {
    const metadata = this.sent.get(result.frameId);
    const isCurrent = metadata && this.inFlight?.sequence === metadata.sequence;
    if (!this.running || this.disposed || !metadata || !isCurrent
      || metadata.sessionId !== this.sessionId
      || metadata.activeHandId !== this.activeHandId
      || metadata.sequence <= this.lastAppliedSequence
      || this.now() - metadata.capturedAt > this.maximumAge) {
      this.options.monitor?.stale();
      return false;
    }

    this.clearResponseTimer();
    this.inFlight = null;
    this.lastAppliedSequence = metadata.sequence;
    this.options.monitor?.mark("aiResponse");
    this.options.monitor?.recordAiLatency(this.now() - metadata.capturedAt);
    for (const [frameId, value] of this.sent) {
      if (value.sequence <= metadata.sequence) this.sent.delete(frameId);
    }
    const accepted: AcceptedSignInferenceResult = { ...result, sequence: metadata.sequence, capturedAt: metadata.capturedAt, sessionId: metadata.sessionId };
    this.listeners.forEach((listener) => listener(accepted));
    this.schedule();
    return true;
  }

  stop(): void {
    this.running = false;
    this.clearScheduleTimer();
    this.clearResponseTimer();
    this.pending.clear();
    this.sent.clear();
    this.inFlight = null;
    this.sessionId = "";
    this.activeHandId = undefined;
  }

  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.listeners.clear();
  }

  getSessionId(): string { return this.sessionId; }
  getLastAppliedSequence(): number { return this.lastAppliedSequence; }
  invalidateSession(): void { if (this.running) this.rotateSession(this.createId(), undefined); }

  private schedule(): void {
    if (!this.running || this.inFlight || this.scheduleTimer !== null || !this.pending.hasPending()) return;
    const delay = Math.max(0, this.intervalMs - (this.now() - this.lastSentAt));
    this.scheduleTimer = this.setTimer(() => {
      this.scheduleTimer = null;
      this.flush();
    }, delay);
  }

  private flush(): void {
    if (!this.running || this.inFlight) return;
    const frame = this.pending.takeLatest();
    if (!frame) return;
    // MediaPipe may finish well after the source video frame was captured.
    // Start the AI age budget when landmarks are actually ready; otherwise a
    // slow tracker makes every valid Python response look stale.
    const inferenceCapturedAt = this.now();
    const inferenceFrame: NormalizedHandFrame = { ...frame, capturedAt: inferenceCapturedAt };
    const metadata: SignInferenceRequestMetadata = {
      requestId: this.createId(),
      sequence: ++this.sequence,
      capturedAt: inferenceCapturedAt,
      sessionId: this.sessionId,
      activeHandId: this.activeHandId,
    };
    this.lastSentAt = this.now();
    this.inFlight = metadata;
    this.sent.set(frame.frameId, metadata);
    while (this.sent.size > 4) this.sent.delete(this.sent.keys().next().value!);
    this.options.monitor?.mark("aiRequest");
    this.responseTimer = this.setTimer(() => {
      this.responseTimer = null;
      if (this.inFlight?.sequence !== metadata.sequence) return;
      this.inFlight = null;
      this.options.monitor?.stale();
      this.schedule();
    }, this.responseTimeoutMs);
    this.options.dispatch(inferenceFrame, metadata);
  }

  private clearScheduleTimer(): void {
    if (this.scheduleTimer !== null) this.clearTimer(this.scheduleTimer);
    this.scheduleTimer = null;
  }

  private clearResponseTimer(): void {
    if (this.responseTimer !== null) this.clearTimer(this.responseTimer);
    this.responseTimer = null;
  }

  private rotateSession(sessionId: string, activeHandId: string | undefined): void {
    this.clearScheduleTimer();
    this.clearResponseTimer();
    this.pending.clear();
    this.sent.clear();
    this.inFlight = null;
    this.sessionId = sessionId;
    this.activeHandId = activeHandId;
    this.sequence = 0;
    this.lastAppliedSequence = 0;
    this.lastSentAt = Number.NEGATIVE_INFINITY;
  }
}

function defaultId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `recognition-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
