import { SignCandidateWindow, type SignCandidateSample, type SignCandidateSummary } from "./SignCandidateWindow";
import { DEFAULT_SIGN_DECODER_CONFIG, type SignDecoderConfig, validateSignDecoderConfig } from "./SignDecoderConfig";
import { SignDecoderStateMachine } from "./SignDecoderStateMachine";
import { NormalizedLandmarkMotionAnalyzer, type LandmarkMotionAnalyzer } from "./LandmarkMotionAnalyzer";
import { NormalizedLandmarkPoseDistance, type LandmarkPoseDistance } from "./LandmarkPoseDistance";
import { SignReleaseDetector } from "./SignReleaseDetector";
import { EMPTY_MOTION_SNAPSHOT, type ContinuousSignRecognizer, type NormalizedLandmark, type SignDecoderEvent, type SignDecoderFrame, type SignDecoderSnapshot, type SignDecoderState } from "./signDecoderTypes";

export interface DefaultContinuousSignDecoderOptions {
  readonly config?: SignDecoderConfig;
  readonly motionAnalyzer?: LandmarkMotionAnalyzer;
  readonly poseDistance?: LandmarkPoseDistance;
}

export class DefaultContinuousSignDecoder implements ContinuousSignRecognizer {
  private readonly machine = new SignDecoderStateMachine();
  private readonly listeners = new Set<(event: SignDecoderEvent) => void>();
  private readonly motionAnalyzer: LandmarkMotionAnalyzer;
  private readonly poseDistance: LandmarkPoseDistance;
  private readonly releaseDetector = new SignReleaseDetector();
  private window: SignCandidateWindow;
  private config: SignDecoderConfig;
  private running = false;
  private motion = EMPTY_MOTION_SNAPSHOT;
  private candidate: SignCandidateSummary | undefined;
  private lastPredictionSequence = 0;
  private confirmedSymbol: string | undefined;
  private confirmedPose: readonly NormalizedLandmark[] | undefined;
  private latestPose: readonly NormalizedLandmark[] | undefined;
  private releasePoseDistance = 0;
  private lastConfirmationLatencyMs: number | undefined;
  private confirmationLatencies: number[] = [];
  private confirmations = 0;
  private droppedPredictions = 0;
  private stalePredictions = 0;

  constructor(options: DefaultContinuousSignDecoderOptions = {}) {
    this.config = validateSignDecoderConfig(options.config ?? DEFAULT_SIGN_DECODER_CONFIG);
    this.motionAnalyzer = options.motionAnalyzer ?? new NormalizedLandmarkMotionAnalyzer();
    this.poseDistance = options.poseDistance ?? new NormalizedLandmarkPoseDistance();
    this.window = new SignCandidateWindow(this.config.candidateWindowSize);
  }

  async start(): Promise<void> {
    this.reset();
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
    this.reset();
  }

  pushFrame(frame: SignDecoderFrame): void {
    if (!this.running) return;
    if (!frame.handPresent) {
      this.handleNoHand(frame.capturedAt);
      return;
    }
    this.releaseDetector.handPresent();
    if (this.machine.getState() === "NO_HAND") {
      this.changeState("TRACKING", frame.capturedAt);
      if (this.confirmedSymbol) this.changeState("RELEASE_WAIT", frame.capturedAt);
    }
    const motionLandmarks = frame.rawLandmarks ?? frame.normalizedLandmarks;
    if (motionLandmarks) this.motion = this.motionAnalyzer.analyze(motionLandmarks, frame.capturedAt, this.config.movementThreshold);
    if (frame.normalizedLandmarks ?? frame.rawLandmarks) this.latestPose = copy(frame.normalizedLandmarks ?? frame.rawLandmarks);

    if (this.confirmedSymbol) {
      this.handleReleaseWait(frame);
      return;
    }
    if (this.motion.moving) {
      this.clearCandidate(frame.capturedAt);
      this.changeState("MOVING", frame.capturedAt);
      return;
    }
    if (this.machine.getState() === "MOVING") this.changeState("TRACKING", frame.capturedAt);
    this.processPrediction(frame);
  }

  subscribe(listener: (event: SignDecoderEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): SignDecoderSnapshot {
    const sorted = [...this.confirmationLatencies].sort((a, b) => a - b);
    return {
      state: this.machine.getState(),
      motion: this.motion,
      candidateSymbol: this.candidate?.symbol,
      candidateVotes: this.candidate?.votes ?? 0,
      predictionConfidence: this.candidate?.averageConfidence,
      lastConfirmedSymbol: this.confirmedSymbol,
      releasePoseDistance: this.releasePoseDistance,
      lastConfirmationLatencyMs: this.lastConfirmationLatencyMs,
      averageConfirmationLatencyMs: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : 0,
      p95ConfirmationLatencyMs: sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * .95) - 1)]! : 0,
      confirmations: this.confirmations,
      droppedPredictions: this.droppedPredictions,
      stalePredictions: this.stalePredictions,
    };
  }

  getConfig(): SignDecoderConfig { return this.config; }

  updateConfig(patch: Partial<SignDecoderConfig>): void {
    this.config = validateSignDecoderConfig({ ...this.config, ...patch });
    this.window.resize(this.config.candidateWindowSize);
  }

  beginInputSession(): void { if (this.running) this.reset(); }

  private handleNoHand(at: number): void {
    this.clearCandidate(at);
    this.motionAnalyzer.reset();
    this.motion = EMPTY_MOTION_SNAPSHOT;
    this.changeState("NO_HAND", at);
    if (this.confirmedSymbol && this.releaseDetector.observeNoHand(at, this.config)) this.release(at);
  }

  private handleReleaseWait(frame: SignDecoderFrame): void {
    const pose = frame.normalizedLandmarks ?? frame.rawLandmarks;
    if (pose && this.confirmedPose) {
      this.releasePoseDistance = this.poseDistance.calculate(this.confirmedPose, pose);
      if (this.releaseDetector.observePose(this.releasePoseDistance, frame.capturedAt, this.config)) {
        this.release(frame.capturedAt);
        this.changeState(this.motion.moving ? "MOVING" : "TRACKING", frame.capturedAt);
        return;
      }
    }
    const sample = this.validSample(frame);
    if (!sample || this.motion.moving || !this.confirmedSymbol) return;
    if (this.releaseDetector.observeDifferentSymbol(sample.symbol, this.confirmedSymbol, this.config)) {
      this.release(frame.capturedAt, false);
      this.window.clear();
      this.candidate = this.window.add(sample);
      this.emitCandidate(frame.capturedAt);
      this.changeState("CANDIDATE", frame.capturedAt);
    }
  }

  private processPrediction(frame: SignDecoderFrame): void {
    const sample = this.validSample(frame);
    if (!sample) return;
    const previousSymbol = this.candidate?.symbol;
    this.candidate = this.window.add(sample);
    if (this.candidate.symbol !== previousSymbol) this.emitCandidate(frame.capturedAt);
    this.changeState("CANDIDATE", frame.capturedAt);
    if (this.candidate.votes < this.config.minimumCandidateVotes || this.motion.stableDurationMs < this.config.minimumStableDurationMs) return;
    this.confirm(this.candidate, frame);
  }

  private validSample(frame: SignDecoderFrame): SignCandidateSample | undefined {
    const prediction = frame.prediction;
    if (!prediction) return undefined;
    if (prediction.sequence <= this.lastPredictionSequence) {
      this.droppedPredictions += 1;
      return undefined;
    }
    this.lastPredictionSequence = prediction.sequence;
    if (frame.capturedAt - prediction.predictedAt > this.config.maximumPredictionAgeMs) {
      this.stalePredictions += 1;
      return undefined;
    }
    const minimumConfidence = this.config.minimumConfidenceBySymbol?.[prediction.symbol] ?? this.config.minimumConfidence;
    if (prediction.confidence < minimumConfidence) return undefined;
    return prediction;
  }

  private confirm(candidate: SignCandidateSummary, frame: SignDecoderFrame): void {
    this.changeState("CONFIRMED", frame.capturedAt);
    const latency = Math.max(0, frame.capturedAt - candidate.firstPredictedAt);
    this.lastConfirmationLatencyMs = latency;
    this.confirmationLatencies.push(latency);
    if (this.confirmationLatencies.length > 240) this.confirmationLatencies.splice(0, this.confirmationLatencies.length - 240);
    this.confirmations += 1;
    this.confirmedSymbol = candidate.symbol;
    this.confirmedPose = copy(frame.normalizedLandmarks ?? frame.rawLandmarks) ?? this.latestPose;
    this.releasePoseDistance = 0;
    this.emit({ type: "SIGN_CONFIRMED", symbol: candidate.symbol, confidence: candidate.averageConfidence, confirmationLatencyMs: latency, occurredAt: frame.capturedAt });
    this.window.clear();
    this.candidate = undefined;
    this.releaseDetector.reset();
    this.changeState("RELEASE_WAIT", frame.capturedAt);
  }

  private release(at: number, clearWindow = true): void {
    const previousSymbol = this.confirmedSymbol;
    this.confirmedSymbol = undefined;
    this.confirmedPose = undefined;
    this.releasePoseDistance = 0;
    this.releaseDetector.reset();
    if (clearWindow) this.clearCandidate(at);
    this.emit({ type: "HAND_RELEASED", previousSymbol, occurredAt: at });
  }

  private clearCandidate(at: number): void {
    const hadCandidate = this.candidate !== undefined;
    this.window.clear();
    this.candidate = undefined;
    if (hadCandidate) this.emit({ type: "CANDIDATE_CHANGED", occurredAt: at });
  }

  private emitCandidate(at: number): void {
    this.emit({ type: "CANDIDATE_CHANGED", symbol: this.candidate?.symbol, confidence: this.candidate?.averageConfidence, occurredAt: at });
  }

  private changeState(next: SignDecoderState, at: number): void {
    const transition = this.machine.transition(next);
    if (transition) this.emit({ type: "STATE_CHANGED", previousState: transition.previous, currentState: transition.current, occurredAt: at });
  }

  private emit(event: SignDecoderEvent): void { this.listeners.forEach((listener) => listener(event)); }

  private reset(): void {
    this.machine.reset();
    this.motionAnalyzer.reset();
    this.releaseDetector.reset();
    this.window.clear();
    this.motion = EMPTY_MOTION_SNAPSHOT;
    this.candidate = undefined;
    this.lastPredictionSequence = 0;
    this.confirmedSymbol = undefined;
    this.confirmedPose = undefined;
    this.latestPose = undefined;
    this.releasePoseDistance = 0;
    this.lastConfirmationLatencyMs = undefined;
    this.confirmationLatencies = [];
    this.confirmations = 0;
    this.droppedPredictions = 0;
    this.stalePredictions = 0;
  }
}

function copy(points: readonly NormalizedLandmark[] | undefined): readonly NormalizedLandmark[] | undefined {
  return points?.map((point) => ({ ...point }));
}
