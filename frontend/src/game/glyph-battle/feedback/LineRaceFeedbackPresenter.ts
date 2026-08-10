import type { SignDecoderSnapshot } from "../../recognition/temporal";
import { isCompetitiveRecognitionReady } from "../../recognition/readiness/recognitionReadiness";
import type { LineRaceMatchSnapshot, LineRaceServerEvent } from "../contracts";
import type { LineRaceInputContext, LineRaceInputState } from "../recognition";
import type { LineRaceActionFeedback, LineRaceActionTarget, LineRaceUserFeedbackView } from "./LineRaceActionFeedback";

export interface LineRaceFeedbackInputs {
  readonly input: LineRaceInputState;
  readonly context: LineRaceInputContext;
  readonly decoder?: SignDecoderSnapshot;
  readonly minimumCandidateVotes?: number;
  readonly aiConnected: boolean;
  readonly gameConnected: boolean;
  readonly now: number;
}

export type PendingActionStatus = "PENDING" | "WAITING_FOR_RECONNECT" | "RESULT_UNKNOWN" | "RESOLVED";

interface PendingAction {
  status: PendingActionStatus;
  readonly commandId: string;
  readonly actionKind: "ATTACK" | "COUNTER";
  readonly symbol?: string;
  readonly obstacleId?: string;
  readonly sentAt: number;
  deadlineAt: number;
  readonly connectionEpoch: number;
  unknownExpiresAt?: number;
}

export interface LineRaceFeedbackPresenterConfig {
  readonly resultAuthority: "LOCAL" | "SERVER";
  readonly pendingResultTimeoutMs: number;
  readonly resultUnknownDurationMs: number;
  readonly lateResultRetentionMs: number;
  readonly dedupeCapacity: number;
}

export const DEFAULT_LINE_RACE_FEEDBACK_CONFIG: LineRaceFeedbackPresenterConfig = Object.freeze({
  resultAuthority: "LOCAL",
  pendingResultTimeoutMs: 4_500,
  resultUnknownDurationMs: 1_800,
  lateResultRetentionMs: 30_000,
  dedupeCapacity: 512,
});

const EMPTY_VIEW: LineRaceUserFeedbackView = {
  state: "IDLE", target: { kind: "NONE", symbols: [], available: false },
  message: "경기가 시작되면 지문자 목표가 표시됩니다.",
};
export const LINE_RACE_FEEDBACK_DURATION_MS = Object.freeze({ confirmed: 300, pendingMinimum: 250, result: 1_100 });

interface QueuedTerminal { readonly event: LineRaceActionFeedback; readonly showAt: number }

export class LineRaceFeedbackPresenter {
  private readonly listeners = new Set<(view: LineRaceUserFeedbackView) => void>();
  private readonly eventListeners = new Set<(event: LineRaceActionFeedback) => void>();
  private readonly pending = new Map<string, PendingAction>();
  private readonly terminalKeys: BoundedFifoSet;
  private readonly sourceEventIds: BoundedFifoSet;
  private readonly config: LineRaceFeedbackPresenterConfig;
  private inputs: LineRaceFeedbackInputs | null = null;
  private view = EMPTY_VIEW;
  private transient: { readonly event: LineRaceActionFeedback; readonly expiresAt: number; readonly effectKey: string } | null = null;
  private readonly queuedTerminals: QueuedTerminal[] = [];
  private releaseRequired = false;
  private targetSignature = "NONE";
  private suppressedContextOccurredAt: number | undefined;
  private effectSequence = 0;
  private connectionEpoch = 0;
  private lastGameConnected: boolean | undefined;

  constructor(config: Partial<LineRaceFeedbackPresenterConfig> = {}) {
    this.config = { ...DEFAULT_LINE_RACE_FEEDBACK_CONFIG, ...config };
    if (!Number.isFinite(this.config.pendingResultTimeoutMs) || this.config.pendingResultTimeoutMs <= 0) throw new RangeError("pendingResultTimeoutMs must be positive");
    if (!Number.isFinite(this.config.resultUnknownDurationMs) || this.config.resultUnknownDurationMs <= 0) throw new RangeError("resultUnknownDurationMs must be positive");
    if (!Number.isFinite(this.config.lateResultRetentionMs) || this.config.lateResultRetentionMs <= 0) throw new RangeError("lateResultRetentionMs must be positive");
    if (!Number.isInteger(this.config.dedupeCapacity) || this.config.dedupeCapacity < 256) throw new RangeError("dedupeCapacity must be at least 256");
    this.terminalKeys = new BoundedFifoSet(this.config.dedupeCapacity);
    this.sourceEventIds = new BoundedFifoSet(this.config.dedupeCapacity);
  }

  subscribe(listener: (view: LineRaceUserFeedbackView) => void): () => void { this.listeners.add(listener); listener(this.view); return () => this.listeners.delete(listener); }
  subscribeEvents(listener: (event: LineRaceActionFeedback) => void): () => void { this.eventListeners.add(listener); return () => this.eventListeners.delete(listener); }
  getView(): LineRaceUserFeedbackView { return this.view; }

  getDebugState() {
    return {
      pending: [...this.pending.values()].map((item) => ({ ...item })), connectionEpoch: this.connectionEpoch,
      terminalKeyCount: this.terminalKeys.size, sourceEventIdCount: this.sourceEventIds.size,
    };
  }

  update(inputs: LineRaceFeedbackInputs): void {
    this.inputs = inputs;
    this.updateConnectionLifecycle(inputs.gameConnected, inputs.now);
    this.expirePending(inputs.now);
    const target = deriveLineRaceActionTarget(inputs.context), signature = targetSignature(target);
    if (signature !== this.targetSignature) { this.targetSignature = signature; this.suppressedContextOccurredAt = inputs.input.contextual?.occurredAt; }
    if (!inputs.input.lockedSymbol) this.releaseRequired = false;
    if (this.transient && inputs.now > this.transient.expiresAt) this.transient = null;
    this.activateDueTerminals(inputs.now);
    this.publish(this.present(target));
  }

  dispatch(event: LineRaceActionFeedback): boolean {
    if (event.sourceEventId && !this.sourceEventIds.add(event.sourceEventId)) return false;
    const terminalKey = terminalEffectKey(event);
    if (terminalKey && !this.terminalKeys.add(terminalKey)) return false;

    if (event.type === "ATTACK_SENT" || event.type === "COUNTER_SENT") {
      if (!event.commandId) return false;
      const sentAt = this.inputs?.now ?? event.occurredAt;
      this.pending.set(event.commandId, {
        status: this.config.resultAuthority === "SERVER" && this.lastGameConnected === false ? "WAITING_FOR_RECONNECT" : "PENDING",
        commandId: event.commandId, actionKind: event.type === "ATTACK_SENT" ? "ATTACK" : "COUNTER",
        symbol: event.symbol, obstacleId: event.obstacleId, sentAt,
        deadlineAt: sentAt + this.config.pendingResultTimeoutMs, connectionEpoch: this.connectionEpoch,
      });
    }
    if (event.type === "RELEASE_REQUIRED") this.releaseRequired = true;
    if (event.type.endsWith("RECOGNIZED")) this.transient = this.effect(event, LINE_RACE_FEEDBACK_DURATION_MS.confirmed);
    if (isTerminal(event)) this.scheduleTerminal(event);
    this.eventListeners.forEach((listener) => listener(event));
    if (this.inputs) this.publish(this.present(deriveLineRaceActionTarget(this.inputs.context)));
    return true;
  }

  ingestServerEvent(event: LineRaceServerEvent, localPlayerId: string): boolean {
    if (event.type === "LINE_RACE_ATTACK_ACCEPTED" && event.attackerPlayerId === localPlayerId) {
      const pending = this.findPending({ type: "ATTACK_SUCCEEDED", symbol: event.consumedSymbol });
      return this.dispatch({ type: "ATTACK_SUCCEEDED", commandId: pending?.commandId, symbol: event.consumedSymbol,
        obstacleId: event.obstacle.obstacleId, occurredAt: event.occurredAt, sourceEventId: event.eventId });
    }
    if (event.type === "LINE_RACE_ATTACK_REJECTED") return this.dispatch({ type: "ATTACK_REJECTED", commandId: event.commandId,
      occurredAt: event.occurredAt, reason: event.reason, sourceEventId: event.eventId });
    if (event.type === "LINE_RACE_COUNTER_SUCCEEDED" && event.playerId === localPlayerId) {
      const pending = this.findPending({ type: "COUNTER_SUCCEEDED", obstacleId: event.obstacleId });
      return this.dispatch({ type: "COUNTER_SUCCEEDED", commandId: pending?.commandId, symbol: event.symbol,
        obstacleId: event.obstacleId, occurredAt: event.counterAt, sourceEventId: event.eventId });
    }
    if (event.type === "LINE_RACE_COUNTER_FAILED" && event.playerId === localPlayerId) return this.dispatch({ type: "COUNTER_MISSED",
      commandId: event.commandId, obstacleId: event.obstacleId, occurredAt: event.occurredAt, reason: event.reason, sourceEventId: event.eventId });
    if (event.type === "LINE_RACE_OBSTACLE_REMOVED" && ["EXPIRED", "TRAVERSED"].includes(event.reason)) return this.dispatch({
      type: "COUNTER_MISSED", obstacleId: event.obstacleId, occurredAt: event.occurredAt, reason: event.reason, sourceEventId: event.eventId });
    return false;
  }

  reconcileSnapshot(_snapshot: LineRaceMatchSnapshot, now: number): void {
    if (this.config.resultAuthority !== "SERVER") return;
    const queuedCommands = new Set(this.queuedTerminals.map((item) => item.event.commandId).filter((id): id is string => Boolean(id)));
    const unresolved = [...this.pending.values()].filter((item) =>
      (item.status === "PENDING" || item.status === "WAITING_FOR_RECONNECT") && !queuedCommands.has(item.commandId));
    if (!unresolved.length) return;
    this.markResultUnknown(unresolved, now, "SNAPSHOT_RECONCILED");
    if (this.inputs) this.publish(this.present(deriveLineRaceActionTarget(this.inputs.context)));
  }

  resetMatch(): void {
    this.pending.clear(); this.terminalKeys.clear(); this.sourceEventIds.clear(); this.queuedTerminals.length = 0;
    this.transient = null; this.releaseRequired = false; this.connectionEpoch = 0; this.lastGameConnected = undefined;
    this.targetSignature = "NONE"; this.suppressedContextOccurredAt = undefined; this.view = EMPTY_VIEW;
  }

  dispose(): void { this.listeners.clear(); this.eventListeners.clear(); this.resetMatch(); this.inputs = null; }

  private updateConnectionLifecycle(gameConnected: boolean, now: number): void {
    if (this.config.resultAuthority !== "SERVER") { this.lastGameConnected = gameConnected; return; }
    if (this.lastGameConnected === undefined) { this.lastGameConnected = gameConnected; return; }
    if (this.lastGameConnected && !gameConnected) {
      for (const action of this.pending.values()) if (action.status === "PENDING") action.status = "WAITING_FOR_RECONNECT";
    } else if (!this.lastGameConnected && gameConnected) {
      this.connectionEpoch += 1;
      for (const action of this.pending.values()) if (action.status === "WAITING_FOR_RECONNECT") action.deadlineAt = now + this.config.pendingResultTimeoutMs;
    }
    this.lastGameConnected = gameConnected;
  }

  private expirePending(now: number): void {
    if (this.config.resultAuthority !== "SERVER") return;
    const queuedCommands = new Set(this.queuedTerminals.map((item) => item.event.commandId).filter((id): id is string => Boolean(id)));
    const expired: PendingAction[] = [];
    for (const [commandId, action] of this.pending) {
      if (action.status === "RESULT_UNKNOWN" && (action.unknownExpiresAt ?? Infinity) <= now) { this.pending.delete(commandId); continue; }
      if (queuedCommands.has(commandId)) continue;
      if (this.lastGameConnected && (action.status === "PENDING" || action.status === "WAITING_FOR_RECONNECT") && action.deadlineAt <= now) expired.push(action);
    }
    if (expired.length) this.markResultUnknown(expired, now, "RESULT_TIMEOUT");
  }

  private markResultUnknown(actions: readonly PendingAction[], now: number, reason: string): void {
    for (const action of actions) { action.status = "RESULT_UNKNOWN"; action.unknownExpiresAt = now + this.config.lateResultRetentionMs; }
    this.transient = this.effect({ type: "RESULT_UNKNOWN", occurredAt: now, reason }, this.config.resultUnknownDurationMs);
  }

  private scheduleTerminal(event: LineRaceActionFeedback): void {
    const pending = event.commandId ? this.pending.get(event.commandId) : this.findPending(event);
    if (pending?.status === "RESULT_UNKNOWN") { this.activateTerminal({ ...event, commandId: event.commandId ?? pending.commandId }); return; }
    const now = this.inputs?.now ?? event.occurredAt;
    if (!pending) { this.activateTerminal(event); return; }
    const recognizedUntil = this.transient?.event.type.endsWith("RECOGNIZED") ? this.transient.expiresAt : now;
    const showAt = Math.max(recognizedUntil + LINE_RACE_FEEDBACK_DURATION_MS.pendingMinimum,
      pending.sentAt + LINE_RACE_FEEDBACK_DURATION_MS.confirmed + LINE_RACE_FEEDBACK_DURATION_MS.pendingMinimum);
    if (now >= showAt) this.activateTerminal({ ...event, commandId: event.commandId ?? pending.commandId });
    else this.queuedTerminals.push({ event: { ...event, commandId: event.commandId ?? pending.commandId }, showAt });
  }

  private activateDueTerminals(now: number): void {
    const due = this.queuedTerminals.filter((item) => item.showAt <= now).sort((a, b) => a.showAt - b.showAt);
    for (const item of due) { this.queuedTerminals.splice(this.queuedTerminals.indexOf(item), 1); this.activateTerminal(item.event); }
  }

  private activateTerminal(event: LineRaceActionFeedback): void {
    const pending = event.commandId ? this.pending.get(event.commandId) : this.findPending(event);
    if (pending) { pending.status = "RESOLVED"; this.pending.delete(pending.commandId); }
    this.transient = this.effect(event, LINE_RACE_FEEDBACK_DURATION_MS.result);
  }

  private present(target: LineRaceActionTarget): LineRaceUserFeedbackView {
    const inputs = this.inputs;
    if (!inputs) return EMPTY_VIEW;
    if (!inputs.gameConnected || !inputs.aiConnected) return { state: "DISCONNECTED", target,
      message: !inputs.gameConnected ? "게임 서버에 다시 연결하고 있습니다." : "손 인식 연결을 확인하고 있습니다." };
    if (inputs.context.matchState !== "PLAYING") return EMPTY_VIEW;
    if (this.transient) return transientView(this.transient.event, target, this.transient.effectKey);
    const pending = [...this.pending.values()].filter((item) => item.status === "PENDING" || item.status === "WAITING_FOR_RECONNECT")
      .sort((a, b) => a.sentAt - b.sentAt)[0];
    if (pending) return { state: "ACTION_PENDING", target, symbol: pending.symbol, obstacleId: pending.obstacleId,
      commandId: pending.commandId, actionKind: pending.actionKind,
      message: pending.status === "WAITING_FOR_RECONNECT" ? "서버 상태를 다시 맞추고 있어요." : pending.actionKind === "COUNTER" ? "카운터 결과를 확인하고 있어요." : "공격 결과를 확인하고 있어요." };
    if (this.releaseRequired || inputs.input.lockedSymbol || inputs.decoder?.state === "RELEASE_WAIT") return { state: "RELEASE_REQUIRED", target,
      symbol: inputs.input.lockedSymbol ?? inputs.decoder?.lastConfirmedSymbol, message: "다음 입력을 위해 손을 화면에서 잠깐 내려 주세요." };
    const diagnostic = inputs.input.contextual, fresh = diagnostic && diagnostic.occurredAt !== this.suppressedContextOccurredAt;
    if (fresh && diagnostic.rejectionReason === "AMBIGUOUS") return { state: "AMBIGUOUS", target, message: "손 모양이 조금 겹쳐 보여요. 자세를 또렷하게 잡아 주세요." };
    const selected = fresh && !diagnostic.rejectionReason ? diagnostic.selectedCandidate : undefined;
    if (selected && (target.symbols as readonly string[]).includes(selected.symbol)) {
      const votes = inputs.decoder?.candidateSymbol === selected.symbol ? inputs.decoder.candidateVotes : 0, required = Math.max(1, inputs.minimumCandidateVotes ?? 1);
      const progress = Math.min(1, Math.max(.12, votes / required));
      return { state: progress >= .75 ? "CONFIRMING" : "RECOGNIZING", target, symbol: selected.symbol, obstacleId: target.kind === "COUNTER" ? target.obstacleId : undefined,
        recognitionProgress: progress, urgencyProgress: target.kind === "COUNTER" ? 1 - (target.counterRemainingMs ?? 0) / Math.max(1, target.counterDurationMs ?? 1) : undefined,
        message: progress >= .75 ? `${selected.symbol} 확정 직전이에요. 자세를 유지하세요.` : `${selected.symbol} 손 모양을 확인하고 있어요. 잠깐 유지해 주세요.` };
    }
    if (!inputs.input.prediction) return { state: "HAND_NOT_VISIBLE", target, symbol: target.kind === "COUNTER" ? target.primarySymbol : undefined,
      obstacleId: target.kind === "COUNTER" ? target.obstacleId : undefined, message: "카메라 안에 손을 보여 주세요." };
    if (target.kind === "COUNTER") return { state: "TARGET_AVAILABLE", target, symbol: target.primarySymbol, obstacleId: target.obstacleId,
      urgencyProgress: 1 - (target.counterRemainingMs ?? 0) / Math.max(1, target.counterDurationMs ?? 1), message: `다가오는 장애물 ${target.primarySymbol}을 먼저 카운터하세요.` };
    if (target.kind === "ATTACK" && !target.available) return { state: "TARGET_AVAILABLE", target, message: `공격 준비 중 · ${(target.cooldownRemainingMs / 1000).toFixed(1)}초` };
    if (target.kind === "ATTACK") return { state: "TARGET_AVAILABLE", target, message: "공격 패에서 원하는 지문자를 선택하세요." };
    return { state: "IDLE", target, message: "현재 사용할 수 있는 지문자가 없습니다." };
  }

  private findPending(event: Pick<LineRaceActionFeedback, "type" | "symbol" | "obstacleId">): PendingAction | undefined {
    const actionKind = event.type.startsWith("COUNTER") ? "COUNTER" : "ATTACK";
    return [...this.pending.values()].filter((item) => item.status !== "RESOLVED").sort((a, b) => a.sentAt - b.sentAt).find((item) =>
      item.actionKind === actionKind && (!event.obstacleId || item.obstacleId === event.obstacleId) && (!event.symbol || item.symbol === event.symbol));
  }

  private effect(event: LineRaceActionFeedback, duration: number) {
    this.effectSequence += 1;
    return { event, expiresAt: (this.inputs?.now ?? event.occurredAt) + duration, effectKey: `${event.type}-${this.effectSequence}` };
  }
  private publish(next: LineRaceUserFeedbackView): void { if (JSON.stringify(next) === JSON.stringify(this.view)) return; this.view = next; this.listeners.forEach((listener) => listener(next)); }
}

class BoundedFifoSet {
  private readonly values = new Set<string>();
  private readonly order: string[] = [];
  constructor(private readonly capacity: number) {}
  get size(): number { return this.values.size; }
  add(value: string): boolean {
    if (this.values.has(value)) return false;
    this.values.add(value); this.order.push(value);
    while (this.order.length > this.capacity) { const oldest = this.order.shift(); if (oldest !== undefined) this.values.delete(oldest); }
    return true;
  }
  clear(): void { this.values.clear(); this.order.length = 0; }
}

export function deriveLineRaceActionTarget(context: LineRaceInputContext): LineRaceActionTarget {
  if (context.matchState !== "PLAYING") return { kind: "NONE", symbols: [], available: false };
  const competitive = (symbols: readonly string[]) => [...new Set(symbols.filter((symbol) => isCompetitiveRecognitionReady(symbol) && context.supportedSymbols.includes(symbol)))];
  const counters = context.counterableObstacles.filter((obstacle) => obstacle.counterDeadlineAt >= context.now && isCompetitiveRecognitionReady(obstacle.symbol))
    .slice().sort((a, b) => a.distanceToRunner - b.distanceToRunner || a.obstacleId.localeCompare(b.obstacleId));
  if (counters.length) { const primary = counters[0]!, counterRemainingMs = Math.max(0, primary.counterDeadlineAt - context.now); return {
    kind: "COUNTER", symbols: competitive(counters.map((item) => item.symbol)), primarySymbol: primary.symbol, obstacleId: primary.obstacleId,
    counterRemainingMs, counterDurationMs: Math.max(1, context.counterWindowMs ?? counterRemainingMs), available: true };
  }
  const symbols = competitive(context.attackHand), cooldownRemainingMs = Math.max(0, context.attackCooldownEndsAt - context.now);
  return { kind: "ATTACK", symbols, available: cooldownRemainingMs === 0 && context.pendingObstacleCount < context.maxPendingObstacles, cooldownRemainingMs };
}

export function obstacleFeedbackForUserView(view: LineRaceUserFeedbackView): { readonly obstacleId?: string; readonly state?: "TARGET" | "RECOGNIZING" | "PENDING" | "SUCCESS" | "REJECTED"; readonly progress?: number } {
  if (!view.obstacleId) return {};
  const state = view.state === "RECOGNIZING" || view.state === "CONFIRMING" ? "RECOGNIZING" : view.state === "ACTION_PENDING" ? "PENDING" : view.state === "SUCCESS" ? "SUCCESS" : view.state === "REJECTED" ? "REJECTED" : "TARGET";
  return { obstacleId: view.obstacleId, state, progress: view.recognitionProgress };
}

function targetSignature(target: LineRaceActionTarget): string { return target.kind === "COUNTER" ? `COUNTER:${target.obstacleId}:${target.symbols.join(",")}` : `${target.kind}:${target.symbols.join(",")}:${target.available}`; }
function isTerminal(event: LineRaceActionFeedback): boolean { return ["ATTACK_SUCCEEDED", "ATTACK_REJECTED", "COUNTER_SUCCEEDED", "COUNTER_MISSED"].includes(event.type); }
function terminalEffectKey(event: LineRaceActionFeedback): string | undefined {
  if (!isTerminal(event)) return undefined;
  if (event.type === "COUNTER_SUCCEEDED" || event.type === "COUNTER_MISSED") return event.obstacleId ? `COUNTER:${event.obstacleId}` : event.commandId ? `COMMAND:${event.commandId}` : undefined;
  return event.commandId ? `COMMAND:${event.commandId}` : event.obstacleId ? `ATTACK_OBSTACLE:${event.obstacleId}` : undefined;
}
function transientView(event: LineRaceActionFeedback, target: LineRaceActionTarget, effectKey: string): LineRaceUserFeedbackView {
  if (event.type === "RESULT_UNKNOWN") return { state: "RESULT_UNKNOWN", target, effectKey, message: "결과를 확인하지 못해 서버 상태를 다시 맞췄습니다. 다음 지문자를 다시 시도할 수 있어요." };
  const actionKind = event.type.startsWith("COUNTER") ? "COUNTER" as const : "ATTACK" as const;
  const base = { target, symbol: event.symbol, obstacleId: event.obstacleId, commandId: event.commandId, effectKey, actionKind };
  if (event.type.endsWith("RECOGNIZED")) return { ...base, state: "CONFIRMED", message: event.type.startsWith("COUNTER") ? `${event.symbol} 카운터 동작을 인식했어요.` : `${event.symbol} 공격 동작을 인식했어요.` };
  if (event.type === "ATTACK_SUCCEEDED") return { ...base, state: "SUCCESS", message: `${event.symbol ?? "지문자"} 공격 성공!` };
  if (event.type === "COUNTER_SUCCEEDED") return { ...base, state: "SUCCESS", message: `${event.symbol ?? "지문자"} 카운터 성공!` };
  return { ...base, state: "REJECTED", message: rejectionMessage(event.reason, event.type.startsWith("COUNTER")) };
}
function rejectionMessage(reason: string | undefined, counter: boolean): string {
  const messages: Record<string, string> = { ATTACK_COOLDOWN: "아직 공격 준비 중이에요.", MAX_PENDING_OBSTACLES: "이미 보낸 장애물이 처리되기를 기다려 주세요.", SYMBOL_NOT_IN_HAND: "현재 공격 패에 없는 지문자예요.", COUNTER_WINDOW_EXPIRED: "카운터 시간이 지나갔어요.", OBSTACLE_NOT_COUNTERABLE: "이 장애물은 지금 카운터할 수 없어요.", SYMBOL_MISMATCH: "장애물과 다른 지문자예요.", EXPIRED: "카운터 시간이 끝났어요.", TRAVERSED: "장애물을 놓쳤어요." };
  return messages[reason ?? ""] ?? (counter ? "카운터가 처리되지 않았어요." : "공격이 처리되지 않았어요.");
}
