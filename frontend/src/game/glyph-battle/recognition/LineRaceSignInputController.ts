import type {
  LandmarkFrameSink,
  SignRecognitionEvent,
  SignRecognizer,
} from "../../recognition";
import type { HandLandmarkFrame } from "../../recognition";
import type { LocalLineRaceCommandGateway } from "../transport/LocalLineRaceCommandGateway";
import type { LineRaceInputContext, LineRaceResolvedInput } from "./LineRaceInputContext";
import type { LineRaceInputResolver } from "./LineRaceInputResolver";
import type { LineRaceInputState } from "./LineRaceInputState";
import { feedbackForResolvedInput, IDLE_LINE_RACE_SIGN_FEEDBACK } from "./LineRaceSignFeedback";
import type { LineRaceActionFeedback } from "../feedback";

export interface LineRaceSignInputControllerOptions {
  readonly recognizer: SignRecognizer;
  readonly keyboardRecognizer?: SignRecognizer;
  readonly resolver: LineRaceInputResolver;
  readonly gateway: LocalLineRaceCommandGateway;
  readonly getContext: () => LineRaceInputContext;
  readonly createCommandId?: () => string;
  readonly onActionFeedback?: (event: LineRaceActionFeedback) => void;
  readonly selectionChargeMs?: number;
  readonly releaseNoHandMs?: number;
  readonly setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  readonly clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

const INITIAL_STATE: LineRaceInputState = {
  connectionState: "DISCONNECTED",
  prediction: null,
  confirmedSymbol: null,
  lockedSymbol: null,
  lastResolution: null,
  feedback: IDLE_LINE_RACE_SIGN_FEEDBACK,
  error: null,
};

export class LineRaceSignInputController {
  private readonly listeners = new Set<(state: LineRaceInputState) => void>();
  private readonly subscriptions: (() => void)[] = [];
  private state: LineRaceInputState = INITIAL_STATE;
  private connected = false;
  private disposed = false;
  private readonly createCommandId: () => string;
  private readonly selectionChargeMs: number;
  private readonly releaseNoHandMs: number;
  private readonly setTimer: NonNullable<LineRaceSignInputControllerOptions["setTimer"]>;
  private readonly clearTimer: NonNullable<LineRaceSignInputControllerOptions["clearTimer"]>;
  private chargeTimer: ReturnType<typeof setTimeout> | null = null;
  private noHandSince: number | null = null;

  constructor(private readonly options: LineRaceSignInputControllerOptions) {
    this.createCommandId = options.createCommandId ?? defaultCommandId;
    this.selectionChargeMs = Math.max(0, options.selectionChargeMs ?? 0);
    this.releaseNoHandMs = Math.max(120, options.releaseNoHandMs ?? 320);
    this.setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
    this.clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
  }

  async connect(): Promise<void> {
    this.assertActive();
    if (this.connected) return;
    this.connected = true;
    this.subscriptions.push(this.options.recognizer.subscribe((event) => this.handleEvent(event, true)));
    if (this.options.keyboardRecognizer) {
      this.subscriptions.push(this.options.keyboardRecognizer.subscribe((event) => this.handleEvent(event, false)));
    }
    const results = await Promise.allSettled([
      this.options.recognizer.connect(),
      ...(this.options.keyboardRecognizer ? [this.options.keyboardRecognizer.connect()] : []),
    ]);
    const primary = results[0];
    if (primary?.status === "rejected") {
      this.setError(primary.reason instanceof Error ? primary.reason.message : "AI 연결에 실패했습니다.");
    }
  }

  getState(): LineRaceInputState { return this.state; }

  subscribe(listener: (state: LineRaceInputState) => void): () => void {
    this.assertActive(); this.listeners.add(listener); listener(this.state); return () => this.listeners.delete(listener);
  }

  sendLandmarkFrame(frame: HandLandmarkFrame): void {
    this.noHandSince = null;
    const recognizer = this.options.recognizer as SignRecognizer & Partial<LandmarkFrameSink>;
    recognizer.sendLandmarkFrame?.(frame);
  }

  notifyHandNotDetected(capturedAt: number): void {
    if (this.noHandSince === null) this.noHandSince = capturedAt;
    const recognizer = this.options.recognizer as SignRecognizer & Partial<LandmarkFrameSink>;
    recognizer.notifyHandNotDetected?.(capturedAt);
    if (this.state.lockedSymbol && capturedAt - this.noHandSince >= this.releaseNoHandMs) this.unlockInput();
  }

  releaseInput(releasedAt = this.options.getContext().now): void {
    this.handleEvent({ type: "HAND_RELEASED", releasedAt }, false);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.chargeTimer) this.clearTimer(this.chargeTimer);
    this.subscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
    this.options.recognizer.disconnect();
    this.options.keyboardRecognizer?.disconnect();
    this.listeners.clear();
    this.state = INITIAL_STATE;
  }

  private handleEvent(event: SignRecognitionEvent, primary: boolean): void {
    if (this.disposed) return;
    if (event.type === "CONNECTION_STATE") {
      if (primary) this.update({ connectionState: event.state, ...(event.state === "CONNECTED" ? { error: null } : {}) });
      return;
    }
    if (event.type === "PREDICTION") {
      this.update({ prediction: { symbol: event.symbol, confidence: event.confidence, isStable: event.isStable } });
      return;
    }
    if (event.type === "CONTEXTUAL_SELECTION") {
      this.update({ contextual: {
        rawTop1: event.rawTop1, selectedCandidate: event.selectedCandidate, eligibleSymbols: event.eligibleSymbols,
        selectedThreshold: event.selectedThreshold, margin: event.margin, rejectionReason: event.rejectionReason,
        contextRevision: event.contextRevision,
        occurredAt: event.occurredAt,
      } });
      return;
    }
    if (event.type === "HAND_RELEASED") {
      // Camera decoder releases caused by a momentary pose/classification change
      // must not arm the next turn. Camera input unlocks only after a sustained
      // no-hand interval observed by notifyHandNotDetected().
      if (!primary) this.unlockInput();
      return;
    }
    if (event.type === "ERROR") {
      if (primary) this.setError(`${event.code}: ${event.message}`);
      return;
    }
    if (event.type === "SIGN_CONFIRMED") {
      // The temporal decoder is the sole confirmation authority. This controller
      // still makes command delivery idempotent until HAND_RELEASED as a final
      // boundary guard against a duplicated event/subscription.
      this.beginCharge(event.symbol, event.confirmedAt, true);
    }
  }

  private beginCharge(symbol: string, confirmedAt: number, enforceLegacyLock: boolean): void {
    if (enforceLegacyLock && this.state.lockedSymbol) return;
    if (this.state.chargingSelection) return;
    const completesAt = confirmedAt + this.selectionChargeMs;
    this.update({ chargingSelection: { symbol, startedAt: confirmedAt, completesAt } });
    const finish = () => { this.chargeTimer = null; if (!this.disposed && this.state.chargingSelection?.symbol === symbol) this.resolve(symbol, confirmedAt, enforceLegacyLock); };
    if (this.selectionChargeMs === 0) finish(); else this.chargeTimer = this.setTimer(finish, this.selectionChargeMs);
  }

  private resolve(symbol: string, recognizedAt: number, enforceLegacyLock: boolean): void {
    if (enforceLegacyLock && this.state.lockedSymbol) return;
    const context = this.options.getContext();
    const resolved = this.options.resolver.resolveConfirmedSymbol(symbol, context);
    this.state = {
      ...this.state,
      chargingSelection: null,
      confirmedSymbol: symbol,
      lockedSymbol: symbol,
      lastResolution: resolved,
      feedback: feedbackForResolvedInput(resolved, context.now),
      error: null,
    };
    this.publish();
    if (resolved.type === "INVALID") {
      this.options.onActionFeedback?.({ type: "ATTACK_REJECTED", symbol, occurredAt: recognizedAt, reason: resolved.reason });
      this.options.onActionFeedback?.({ type: "RELEASE_REQUIRED", symbol, occurredAt: recognizedAt });
      return;
    }
    void this.submit(resolved, recognizedAt).catch((cause: unknown) => {
      if (!this.disposed) this.setError(cause instanceof Error ? cause.message : "로컬 명령 처리에 실패했습니다.");
    });
  }

  private async submit(resolved: Exclude<LineRaceResolvedInput, { readonly type: "INVALID" }>, recognizedAt: number): Promise<void> {
    const commandId = this.createCommandId();
    const kind = resolved.type === "COUNTER" ? "COUNTER" : "ATTACK";
    this.options.onActionFeedback?.({ type: `${kind}_RECOGNIZED`, commandId, symbol: resolved.symbol,
      obstacleId: resolved.type === "COUNTER" ? resolved.obstacleId : undefined, occurredAt: recognizedAt });
    this.options.onActionFeedback?.({ type: `${kind}_SENT`, commandId, symbol: resolved.symbol,
      obstacleId: resolved.type === "COUNTER" ? resolved.obstacleId : undefined, occurredAt: recognizedAt });
    this.options.onActionFeedback?.({ type: "RELEASE_REQUIRED", commandId, symbol: resolved.symbol,
      obstacleId: resolved.type === "COUNTER" ? resolved.obstacleId : undefined, occurredAt: recognizedAt });
    if (resolved.type === "COUNTER") {
      try {
        await this.options.gateway.submitCounter({ commandId, obstacleId: resolved.obstacleId, symbol: resolved.symbol, recognizedAt });
        if (this.options.gateway.resultAuthority !== "SERVER") this.options.onActionFeedback?.({ type: "COUNTER_SUCCEEDED", commandId,
          obstacleId: resolved.obstacleId, symbol: resolved.symbol, occurredAt: this.options.getContext().now });
      } catch (cause) {
        this.options.onActionFeedback?.({ type: "COUNTER_MISSED", commandId, obstacleId: resolved.obstacleId,
          symbol: resolved.symbol, occurredAt: this.options.getContext().now, reason: errorReason(cause) });
        throw cause;
      }
    } else {
      try {
        await this.options.gateway.submitAttack({ commandId, symbol: resolved.symbol, recognizedAt });
        if (this.options.gateway.resultAuthority !== "SERVER") this.options.onActionFeedback?.({ type: "ATTACK_SUCCEEDED", commandId,
          symbol: resolved.symbol, occurredAt: this.options.getContext().now });
      } catch (cause) {
        this.options.onActionFeedback?.({ type: "ATTACK_REJECTED", commandId, symbol: resolved.symbol,
          occurredAt: this.options.getContext().now, reason: errorReason(cause) });
        throw cause;
      }
    }
  }

  private setError(message: string): void {
    this.state = { ...this.state, error: message, feedback: { kind: "ERROR", message } };
    this.publish();
  }

  private cancelCharge(): void { if (this.chargeTimer) this.clearTimer(this.chargeTimer); this.chargeTimer = null; }

  private unlockInput(): void {
    this.noHandSince = null;
    this.cancelCharge();
    this.update({ lockedSymbol: null, chargingSelection: null });
  }

  private update(patch: Partial<LineRaceInputState>): void { this.state = { ...this.state, ...patch }; this.publish(); }
  private publish(): void { this.listeners.forEach((listener) => listener(this.state)); }
  private assertActive(): void { if (this.disposed) throw new Error("Line-race sign input controller has been disposed."); }
}

function errorReason(cause: unknown): string {
  return cause instanceof Error ? cause.message : "COMMAND_FAILED";
}

function defaultCommandId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `local-line-race-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
