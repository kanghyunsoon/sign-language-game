import type { LineRaceServerEvent } from "../contracts";
import type { LineRaceActionFeedback, LineRaceActionTarget, LineRaceUserFeedbackView } from "./LineRaceActionFeedback";

export type LineRacePlaytestEventName =
  | "TARGET_CHANGED" | "CANDIDATE_STARTED" | "RECOGNITION_CONFIRMED"
  | "COMMAND_SENT" | "SERVER_ACCEPTED" | "SERVER_REJECTED" | "FEEDBACK_DISPLAYED"
  | "OBSTACLE_WARNING_STARTED" | "COUNTER_WINDOW_STARTED" | "COUNTER_WINDOW_ENDED"
  | "COUNTER_SUCCEEDED" | "COUNTER_FAILED" | "COLLISION" | "LEADER_CHANGED" | "MATCH_FINISHED";

export interface LineRacePlaytestEvent {
  readonly name: LineRacePlaytestEventName;
  readonly monotonicMs: number;
  readonly commandId?: string;
  readonly symbol?: string;
  readonly obstacleId?: string;
  readonly reason?: string;
}

export interface LineRaceDeviceObservedSummary {
  readonly scope: "THIS_DEVICE_ONLY";
  readonly leaderChanges: number;
  readonly attackRejectionReasons: Readonly<Record<string, number>>;
}

export interface LineRacePlaytestSummary {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly botDifficulty?: string;
  readonly startedAtMonotonicMs: number;
  readonly events: readonly LineRacePlaytestEvent[];
  readonly latenciesMs: {
    readonly candidateToConfirmation: readonly number[];
    readonly confirmationToCommand: readonly number[];
    readonly commandToServerResult: readonly number[];
    readonly serverResultToFeedback: readonly number[];
  };
  readonly deviceObserved: LineRaceDeviceObservedSummary;
  readonly privacy: {
    readonly videoFramesStored: false;
    readonly imagesStored: false;
    readonly landmarksStored: false;
    readonly faceDataStored: false;
    readonly rawWebSocketPayloadsStored: false;
  };
}

const DEV_FLAG_KEY = "line-race-playtest-telemetry";
const MAX_EVENTS = 2_048;

export function isLineRacePlaytestTelemetryEnabled(): boolean {
  if (!import.meta.env.DEV || typeof localStorage === "undefined") return false;
  return import.meta.env.VITE_LINE_RACE_PLAYTEST_TELEMETRY === "true" || localStorage.getItem(DEV_FLAG_KEY) === "enabled";
}

export class LineRacePlaytestTelemetry {
  private readonly events: LineRacePlaytestEvent[] = [];
  private readonly candidateAt = new Map<string, number>();
  private readonly confirmedAt = new Map<string, number>();
  private readonly commandSentAt = new Map<string, number>();
  private readonly serverResultAt = new Map<string, number>();
  private readonly feedbackKeys = new Set<string>();
  private readonly rejectionReasons = new Map<string, number>();
  private readonly activeCounterWindows = new Set<string>();
  private lastTargetSignature = "NONE";
  private lastCandidateSignature = "NONE";
  private leader: string | null = null;
  private leaderChanges = 0;

  constructor(private readonly options: {
    readonly enabled: boolean;
    readonly sessionId: string;
    readonly botDifficulty?: string;
    readonly now?: () => number;
  }) {}

  get enabled(): boolean { return this.options.enabled; }

  observeFeedback(view: LineRaceUserFeedbackView): void {
    if (!this.enabled) return;
    const target = targetSignature(view.target);
    if (target !== this.lastTargetSignature) {
      this.lastTargetSignature = target;
      this.record("TARGET_CHANGED", { symbol: view.target.kind === "COUNTER" ? view.target.primarySymbol : undefined,
        obstacleId: view.target.kind === "COUNTER" ? view.target.obstacleId : undefined });
    }
    const candidate = view.state === "RECOGNIZING" || view.state === "CONFIRMING" ? `${view.symbol ?? ""}:${target}` : "NONE";
    if (candidate !== "NONE" && candidate !== this.lastCandidateSignature) {
      this.lastCandidateSignature = candidate;
      const key = view.symbol ?? candidate;
      const at = this.now(); this.candidateAt.set(key, at);
      this.record("CANDIDATE_STARTED", { symbol: view.symbol, obstacleId: view.obstacleId }, at);
    } else if (candidate === "NONE") this.lastCandidateSignature = "NONE";
  }

  ingestActionFeedback(event: LineRaceActionFeedback): void {
    if (event.type === "ATTACK_REJECTED" && event.reason) this.rejectionReasons.set(event.reason, (this.rejectionReasons.get(event.reason) ?? 0) + 1);
    if (!this.enabled) return;
    const now = this.now();
    if (event.type.endsWith("RECOGNIZED")) {
      if (event.commandId) this.confirmedAt.set(event.commandId, now);
      this.record("RECOGNITION_CONFIRMED", event, now);
      const candidate = event.symbol ? this.candidateAt.get(event.symbol) : undefined;
      if (candidate !== undefined && event.commandId) this.candidateAt.set(`latency:${event.commandId}`, candidate);
    } else if (event.type.endsWith("SENT")) {
      if (event.commandId) this.commandSentAt.set(event.commandId, now);
      this.record("COMMAND_SENT", event, now);
    } else if (["ATTACK_SUCCEEDED", "COUNTER_SUCCEEDED"].includes(event.type)) {
      if (event.commandId) this.serverResultAt.set(event.commandId, now);
      this.record(event.type === "ATTACK_SUCCEEDED" ? "SERVER_ACCEPTED" : "COUNTER_SUCCEEDED", event, now);
    } else if (["ATTACK_REJECTED", "COUNTER_MISSED"].includes(event.type)) {
      if (event.commandId) this.serverResultAt.set(event.commandId, now);
      this.record(event.type === "ATTACK_REJECTED" ? "SERVER_REJECTED" : "COUNTER_FAILED", event, now);
    }
  }

  ingestServerEvent(event: LineRaceServerEvent, localPlayerId: string): void {
    if (event.type === "LINE_RACE_PROGRESS_UPDATED") this.observeLeader(event.players);
    if (!this.enabled || event.type === "LINE_RACE_MATCH_SNAPSHOT") return;
    const now = this.now();
    if (event.type === "LINE_RACE_ATTACK_ACCEPTED") {
      if (event.attackerPlayerId === localPlayerId) this.recordServerResult("SERVER_ACCEPTED", undefined, event.consumedSymbol, event.obstacle.obstacleId, undefined, now);
      if (event.targetPlayerId === localPlayerId) this.record("OBSTACLE_WARNING_STARTED", { symbol: event.obstacle.symbol, obstacleId: event.obstacle.obstacleId }, now);
      return;
    }
    if (event.type === "LINE_RACE_ATTACK_REJECTED") return;
    if (event.type === "LINE_RACE_OBSTACLE_ACTIVATED") {
      this.activeCounterWindows.add(event.obstacleId);
      this.record("COUNTER_WINDOW_STARTED", { obstacleId: event.obstacleId }, now); return;
    }
    if (event.type === "LINE_RACE_COUNTER_SUCCEEDED" && event.playerId === localPlayerId) {
      if (this.activeCounterWindows.delete(event.obstacleId)) this.record("COUNTER_WINDOW_ENDED", { obstacleId:event.obstacleId,reason:"COUNTERED" }, now); return;
    }
    if (event.type === "LINE_RACE_COUNTER_FAILED" && event.playerId === localPlayerId) {
      if (this.activeCounterWindows.delete(event.obstacleId)) this.record("COUNTER_WINDOW_ENDED", { obstacleId:event.obstacleId,reason:event.reason }, now); return;
    }
    if (event.type === "LINE_RACE_OBSTACLE_REMOVED" && this.activeCounterWindows.delete(event.obstacleId))
      this.record("COUNTER_WINDOW_ENDED", { obstacleId: event.obstacleId, reason: event.reason }, now);
    if (event.type === "LINE_RACE_TRAVERSAL_STARTED" && event.playerId === localPlayerId)
      this.record("COLLISION", { obstacleId: event.obstacleId }, now);
    if (event.type === "LINE_RACE_MATCH_FINISHED") this.record("MATCH_FINISHED", { reason: event.finishReason }, now);
  }

  feedbackDisplayed(view: LineRaceUserFeedbackView): void {
    if (!this.enabled || !view.effectKey || this.feedbackKeys.has(view.effectKey)) return;
    this.feedbackKeys.add(view.effectKey);
    const now = this.now(); this.record("FEEDBACK_DISPLAYED", { commandId: view.commandId, symbol: view.symbol, obstacleId: view.obstacleId, reason: view.state }, now);
    if (view.commandId && ["SUCCESS", "REJECTED"].includes(view.state)) this.serverResultAt.set(`feedback:${view.commandId}`, now);
  }

  getDeviceObservedSummary(): LineRaceDeviceObservedSummary {
    return { scope: "THIS_DEVICE_ONLY", leaderChanges: this.leaderChanges, attackRejectionReasons: Object.fromEntries(this.rejectionReasons) };
  }

  toSummary(): LineRacePlaytestSummary {
    const candidateToConfirmation: number[] = [], confirmationToCommand: number[] = [], commandToServerResult: number[] = [], serverResultToFeedback: number[] = [];
    for (const [commandId, confirmed] of this.confirmedAt) {
      const candidate = this.candidateAt.get(`latency:${commandId}`); if (candidate !== undefined) candidateToConfirmation.push(confirmed - candidate);
      const sent = this.commandSentAt.get(commandId); if (sent !== undefined) confirmationToCommand.push(sent - confirmed);
    }
    for (const [commandId, sent] of this.commandSentAt) {
      const result = this.serverResultAt.get(commandId); if (result !== undefined) commandToServerResult.push(result - sent);
      const feedback = this.serverResultAt.get(`feedback:${commandId}`); if (result !== undefined && feedback !== undefined) serverResultToFeedback.push(feedback - result);
    }
    return { schemaVersion: 1, sessionId: this.options.sessionId, botDifficulty: this.options.botDifficulty,
      startedAtMonotonicMs: this.events[0]?.monotonicMs ?? this.now(), events: [...this.events],
      latenciesMs: { candidateToConfirmation, confirmationToCommand, commandToServerResult, serverResultToFeedback },
      deviceObserved: this.getDeviceObservedSummary(), privacy: { videoFramesStored: false, imagesStored: false, landmarksStored: false,
        faceDataStored: false, rawWebSocketPayloadsStored: false } };
  }

  download(): void {
    if (!this.enabled || typeof document === "undefined") return;
    const blob = new Blob([JSON.stringify(this.toSummary(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `line-race-playtest-${this.options.sessionId}.json`; anchor.click(); URL.revokeObjectURL(url);
  }

  dispose(): void { this.events.length = 0; this.candidateAt.clear(); this.confirmedAt.clear(); this.commandSentAt.clear(); this.serverResultAt.clear(); this.feedbackKeys.clear(); this.activeCounterWindows.clear(); }

  private now(): number { return this.options.now?.() ?? performance.now(); }
  private record(name: LineRacePlaytestEventName, fields: { readonly commandId?: string; readonly symbol?: string; readonly obstacleId?: string; readonly reason?: string }, at = this.now()): void {
    if (!this.enabled) return;
    this.events.push({ name, monotonicMs: at, commandId: fields.commandId, symbol: fields.symbol, obstacleId: fields.obstacleId, reason: fields.reason });
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }
  private recordServerResult(name: "SERVER_ACCEPTED" | "SERVER_REJECTED" | "COUNTER_FAILED", commandId: string | undefined, symbol: string | undefined, obstacleId: string | undefined, reason: string | undefined, at: number): void {
    if (commandId) this.serverResultAt.set(commandId, at); this.record(name, { commandId, symbol, obstacleId, reason }, at);
  }
  private observeLeader(players: readonly { readonly playerId: string; readonly progress: number }[]): void {
    if (players.length < 2) return;
    const sorted = [...players].sort((a, b) => b.progress - a.progress); const next = sorted[0]!.progress === sorted[1]!.progress ? null : sorted[0]!.playerId;
    if (this.leader !== null && next !== null && next !== this.leader) { this.leaderChanges += 1; this.record("LEADER_CHANGED", { reason: next }); }
    this.leader = next;
  }
}

function targetSignature(target: LineRaceActionTarget): string {
  if (target.kind === "COUNTER") return `COUNTER:${target.obstacleId}:${target.primarySymbol}`;
  if (target.kind === "ATTACK") return `ATTACK:${target.symbols.join(",")}:${target.available}`;
  return "NONE";
}
