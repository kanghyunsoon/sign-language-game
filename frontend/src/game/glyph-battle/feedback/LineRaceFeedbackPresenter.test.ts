import { describe, expect, it, vi } from "vitest";
import type { SignDecoderSnapshot } from "../../recognition/temporal";
import type { LineRaceMatchSnapshot, LineRaceServerEvent } from "../contracts";
import type { LineRaceInputContext, LineRaceInputState } from "../recognition";
import { deriveLineRaceActionTarget, LineRaceFeedbackPresenter } from "./LineRaceFeedbackPresenter";

const baseContext = (): LineRaceInputContext => ({
  matchState: "PLAYING", attackHand: ["ㄱ", "ㄴ", "ㄷ"], attackCooldownEndsAt: 0, now: 1_000,
  pendingObstacleCount: 0, maxPendingObstacles: 3, supportedSymbols: ["ㄱ", "ㄴ", "ㄷ", "ㅅ"], counterableObstacles: [],
});
const baseInput = (): LineRaceInputState => ({
  connectionState: "CONNECTED", prediction: { symbol: "ㄱ", confidence: .8, isStable: false }, confirmedSymbol: null, lockedSymbol: null,
  lastResolution: null, feedback: { kind: "IDLE", message: "대기" }, error: null,
});
const decoder = (candidateSymbol?: string, candidateVotes = 0, state: SignDecoderSnapshot["state"] = "TRACKING"): SignDecoderSnapshot => ({
  state, motion: { averageVelocity: 0, maximumVelocity: 0, wristVelocity: 0, fingerVelocity: 0, stableDurationMs: 120, moving: false },
  candidateSymbol, candidateVotes, predictionConfidence: candidateSymbol ? .8 : undefined, lastConfirmedSymbol: state === "RELEASE_WAIT" ? candidateSymbol : undefined,
  releasePoseDistance: 0, averageConfirmationLatencyMs: 0, p95ConfirmationLatencyMs: 0, confirmations: 0, droppedPredictions: 0, stalePredictions: 0,
});

function update(presenter: LineRaceFeedbackPresenter, context: LineRaceInputContext, input = baseInput(), snapshot = decoder()): void {
  presenter.update({ input, context, decoder: snapshot, minimumCandidateVotes: 2, aiConnected: true, gameConnected: true, now: context.now });
}

describe("LineRaceFeedbackPresenter", () => {
  it("distinguishes a missing hand from an available target", () => {
    const presenter = new LineRaceFeedbackPresenter();
    update(presenter, baseContext(), { ...baseInput(), prediction: null });
    expect(presenter.getView()).toMatchObject({ state: "HAND_NOT_VISIBLE", message: expect.stringContaining("손을 보여") });
  });
  it("prioritizes the closest counter target and returns to attack cards when it disappears", () => {
    const context = baseContext();
    const withCounter = { ...context, counterableObstacles: [
      { obstacleId: "far", symbol: "ㄴ", distanceToRunner: 20, counterDeadlineAt: 2_000, state: "ACTIVE" as const },
      { obstacleId: "near", symbol: "ㄱ", distanceToRunner: 5, counterDeadlineAt: 2_000, state: "FALLING" as const },
    ] };
    expect(deriveLineRaceActionTarget(withCounter)).toMatchObject({ kind: "COUNTER", obstacleId: "near", primarySymbol: "ㄱ" });
    expect(deriveLineRaceActionTarget(context)).toMatchObject({ kind: "ATTACK", symbols: ["ㄱ", "ㄴ", "ㄷ"] });
  });

  it("keeps attack cards visible but unavailable with a readable cooldown", () => {
    expect(deriveLineRaceActionTarget({ ...baseContext(), attackCooldownEndsAt: 2_250 })).toMatchObject({
      kind: "ATTACK", available: false, cooldownRemainingMs: 1_250, symbols: ["ㄱ", "ㄴ", "ㄷ"],
    });
  });

  it("clears stale card progress when context changes and only highlights a fresh candidate", () => {
    const presenter = new LineRaceFeedbackPresenter();
    const context = baseContext(); update(presenter, context);
    const first = { ...baseInput(), contextual: { rawTop1: { symbol: "ㄱ", confidence: .8 }, selectedCandidate: { symbol: "ㄱ", confidence: .8 },
      eligibleSymbols: ["ㄱ", "ㄴ", "ㄷ"], contextRevision: "r1", occurredAt: 1_010 } };
    update(presenter, context, first, decoder("ㄱ", 1));
    expect(presenter.getView()).toMatchObject({ state: "RECOGNIZING", symbol: "ㄱ" });
    const changed = { ...context, now: 1_020, attackHand: ["ㄴ", "ㄷ"] };
    update(presenter, changed, first, decoder("ㄱ", 1));
    expect(presenter.getView()).toMatchObject({ state: "TARGET_AVAILABLE" });
    expect(presenter.getView().symbol).toBeUndefined();
    const fresh = { ...first, contextual: { ...first.contextual, rawTop1: { symbol: "ㄴ", confidence: .8 }, selectedCandidate: { symbol: "ㄴ", confidence: .8 }, contextRevision: "r2", occurredAt: 1_021 } };
    update(presenter, changed, fresh, decoder("ㄴ", 1));
    expect(presenter.getView()).toMatchObject({ state: "RECOGNIZING", symbol: "ㄴ" });
  });

  it("shows ambiguity without producing an action and ignores below-threshold candidates", () => {
    const presenter = new LineRaceFeedbackPresenter(); const events = vi.fn(); presenter.subscribeEvents(events);
    const context = baseContext(); update(presenter, context);
    const ambiguous = { ...baseInput(), contextual: { rawTop1: { symbol: "ㄱ", confidence: .7 }, selectedCandidate: { symbol: "ㄱ", confidence: .7 },
      eligibleSymbols: ["ㄱ", "ㄴ"], selectedThreshold: .5, margin: .05, rejectionReason: "AMBIGUOUS", contextRevision: "a", occurredAt: 2 } };
    update(presenter, context, ambiguous, decoder("ㄱ", 1));
    expect(presenter.getView().state).toBe("AMBIGUOUS"); expect(events).not.toHaveBeenCalled();
    const low = { ...ambiguous, contextual: { ...ambiguous.contextual, rejectionReason: "BELOW_THRESHOLD", occurredAt: 3 } };
    update(presenter, context, low, decoder("ㄱ", 1));
    expect(presenter.getView().state).toBe("TARGET_AVAILABLE"); expect(events).not.toHaveBeenCalled();
  });

  it("never exposes readiness-excluded symbols as user targets", () => {
    const context = { ...baseContext(), attackHand: ["ㅅ", "ㄱ"], supportedSymbols: ["ㅅ", "ㄱ"] };
    expect(deriveLineRaceActionTarget(context)).toMatchObject({ kind: "ATTACK", symbols: ["ㄱ"] });
    const counter = { ...context, counterableObstacles: [{ obstacleId: "x", symbol: "ㅅ", distanceToRunner: 1, counterDeadlineAt: 2_000, state: "ACTIVE" as const }] };
    expect(deriveLineRaceActionTarget(counter)).toMatchObject({ kind: "ATTACK", symbols: ["ㄱ"] });
  });

  it("preserves CONFIRMED then ACTION_PENDING and waits for an authoritative server success", () => {
    const presenter = new LineRaceFeedbackPresenter({ resultAuthority: "SERVER" }); let context = baseContext(); update(presenter, context);
    presenter.dispatch({ type: "ATTACK_RECOGNIZED", commandId: "c1", symbol: "ㄱ", occurredAt: 1_000 });
    presenter.dispatch({ type: "ATTACK_SENT", commandId: "c1", symbol: "ㄱ", occurredAt: 1_000 });
    expect(presenter.getView().state).toBe("CONFIRMED");
    context = { ...context, now: 1_350 }; update(presenter, context);
    expect(presenter.getView().state).toBe("ACTION_PENDING");
    presenter.ingestServerEvent(attackAccepted("e1", 1, 1_360), "me");
    expect(presenter.getView().state).toBe("ACTION_PENDING");
    context = { ...context, now: 1_650 }; update(presenter, context);
    expect(presenter.getView()).toMatchObject({ state: "SUCCESS", commandId: "c1", symbol: "ㄱ" });
  });

  it("does not turn network command sending into success", () => {
    const presenter = new LineRaceFeedbackPresenter({ resultAuthority: "SERVER" }); let context = baseContext(); update(presenter, context);
    presenter.dispatch({ type: "COUNTER_RECOGNIZED", commandId: "c2", obstacleId: "o1", symbol: "ㄴ", occurredAt: 1_000 });
    presenter.dispatch({ type: "COUNTER_SENT", commandId: "c2", obstacleId: "o1", symbol: "ㄴ", occurredAt: 1_000 });
    context = { ...context, now: 1_400 }; update(presenter, context);
    expect(presenter.getView()).toMatchObject({ state: "ACTION_PENDING", obstacleId: "o1" });
  });

  it("deduplicates command and obstacle terminal effects", () => {
    const presenter = new LineRaceFeedbackPresenter(); update(presenter, baseContext());
    expect(presenter.dispatch({ type: "ATTACK_SUCCEEDED", commandId: "same", symbol: "ㄱ", occurredAt: 1_000 })).toBe(true);
    expect(presenter.dispatch({ type: "ATTACK_SUCCEEDED", commandId: "same", symbol: "ㄱ", occurredAt: 1_001 })).toBe(false);
    expect(presenter.dispatch({ type: "COUNTER_SUCCEEDED", commandId: "counter", obstacleId: "o1", symbol: "ㄴ", occurredAt: 1_002 })).toBe(true);
    expect(presenter.dispatch({ type: "COUNTER_SUCCEEDED", commandId: "counter-duplicate", obstacleId: "o1", symbol: "ㄴ", occurredAt: 1_003 })).toBe(false);
  });

  it("shows release guidance after the result and clears it immediately on release", () => {
    const presenter = new LineRaceFeedbackPresenter(); let context = baseContext(); update(presenter, context);
    presenter.dispatch({ type: "RELEASE_REQUIRED", commandId: "c1", symbol: "ㄱ", occurredAt: 1_000 });
    presenter.dispatch({ type: "ATTACK_SUCCEEDED", commandId: "c1", symbol: "ㄱ", occurredAt: 1_000 });
    context = { ...context, now: 2_200 };
    update(presenter, context, { ...baseInput(), lockedSymbol: "ㄱ" }, decoder("ㄱ", 0, "RELEASE_WAIT"));
    expect(presenter.getView().state).toBe("RELEASE_REQUIRED");
    update(presenter, context, baseInput(), decoder());
    expect(presenter.getView().state).toBe("TARGET_AVAILABLE");
  });

  it("produces identical feedback for local and network inputs and recovers connections", () => {
    const local = new LineRaceFeedbackPresenter(), network = new LineRaceFeedbackPresenter(), context = baseContext(), input = baseInput();
    update(local, context, input); update(network, structuredClone(context), structuredClone(input));
    expect(local.getView()).toEqual(network.getView());
    local.update({ input: { ...input, connectionState: "DISCONNECTED" }, context, decoder: decoder(), minimumCandidateVotes: 2,
      aiConnected: false, gameConnected: true, now: context.now });
    expect(local.getView().state).toBe("DISCONNECTED");
    update(local, { ...context, now: 1_100 }, input);
    expect(local.getView().state).toBe("TARGET_AVAILABLE");
  });

  it("keeps server pending before timeout, then releases it as RESULT_UNKNOWN", () => {
    const presenter = serverPresenter(); let context = baseContext(); update(presenter, context);
    presenter.dispatch({ type: "ATTACK_SENT", commandId: "lost", symbol: "ㄱ", occurredAt: 1_000 });
    context = { ...context, now: 1_999 }; update(presenter, context);
    expect(presenter.getView().state).toBe("ACTION_PENDING");
    context = { ...context, now: 2_000 }; update(presenter, context);
    expect(presenter.getView().state).toBe("RESULT_UNKNOWN");
    expect(presenter.getDebugState().pending).toEqual([expect.objectContaining({ commandId: "lost", status: "RESULT_UNKNOWN" })]);
    context = { ...context, now: 2_600 }; update(presenter, context);
    expect(presenter.getView().state).toBe("TARGET_AVAILABLE");
    presenter.dispatch({ type: "ATTACK_SENT", commandId: "new", symbol: "ㄴ", occurredAt: 2_600 });
    expect(presenter.getView()).toMatchObject({ state: "ACTION_PENDING", commandId: "new" });
  });

  it("keeps pending through disconnect and never treats reconnect alone as success", () => {
    const presenter = serverPresenter(); let context = baseContext(); update(presenter, context);
    presenter.dispatch({ type: "ATTACK_SENT", commandId: "c1", symbol: "ㄱ", occurredAt: 1_000 });
    presenter.update({ input: baseInput(), context: { ...context, now: 1_200 }, decoder: decoder(), minimumCandidateVotes: 2,
      aiConnected: true, gameConnected: false, now: 1_200 });
    expect(presenter.getView().state).toBe("DISCONNECTED");
    expect(presenter.getDebugState().pending[0]).toMatchObject({ status: "WAITING_FOR_RECONNECT" });
    presenter.update({ input: baseInput(), context: { ...context, now: 2_000 }, decoder: decoder(), minimumCandidateVotes: 2,
      aiConnected: true, gameConnected: true, now: 2_000 });
    expect(presenter.getView().state).toBe("ACTION_PENDING");
    expect(presenter.getDebugState()).toMatchObject({ connectionEpoch: 1, pending: [expect.objectContaining({ status: "WAITING_FOR_RECONNECT" })] });
    expect(presenter.getView().state).not.toBe("SUCCESS");
  });

  it("uses game connectivity, not AI connectivity, for pending recovery state", () => {
    const presenter = serverPresenter(); const context = baseContext(); update(presenter, context);
    presenter.dispatch({ type: "ATTACK_SENT", commandId: "c1", symbol: "ㄱ", occurredAt: 1_000 });
    presenter.update({ input: { ...baseInput(), connectionState: "DISCONNECTED" }, context: { ...context, now: 1_200 }, decoder: decoder(),
      minimumCandidateVotes: 2, aiConnected: false, gameConnected: true, now: 1_200 });
    expect(presenter.getView().state).toBe("DISCONNECTED");
    expect(presenter.getDebugState().pending[0]).toMatchObject({ status: "PENDING" });
  });

  it("reconciles snapshot to neutral unknown without inferring success or failure", () => {
    const presenter = serverPresenter(); let context = baseContext(); update(presenter, context);
    presenter.dispatch({ type: "ATTACK_SENT", commandId: "c1", symbol: "ㄱ", occurredAt: 1_000 });
    presenter.update({ input: baseInput(), context: { ...context, now: 1_200 }, decoder: decoder(), minimumCandidateVotes: 2,
      aiConnected: true, gameConnected: false, now: 1_200 });
    presenter.update({ input: baseInput(), context: { ...context, now: 2_000 }, decoder: decoder(), minimumCandidateVotes: 2,
      aiConnected: true, gameConnected: true, now: 2_000 });
    presenter.reconcileSnapshot(snapshot(2_050), 2_050);
    expect(presenter.getView().state).toBe("RESULT_UNKNOWN");
    expect(presenter.getView().message).toContain("서버 상태를 다시 맞췄습니다");
    expect(presenter.getDebugState().pending[0]).toMatchObject({ status: "RESULT_UNKNOWN" });
    context = { ...context, now: 2_700 }; update(presenter, context);
    expect(presenter.getView().state).toBe("TARGET_AVAILABLE");
    presenter.dispatch({ type: "ATTACK_SENT", commandId: "c2", symbol: "ㄴ", occurredAt: 2_700 });
    expect(presenter.getView()).toMatchObject({ state: "ACTION_PENDING", commandId: "c2" });
  });

  it("lets a late authoritative success override unknown exactly once", () => {
    const presenter = serverPresenter(); let context = baseContext(); update(presenter, context);
    presenter.dispatch({ type: "ATTACK_SENT", commandId: "late", symbol: "ㄱ", occurredAt: 1_000 });
    context = { ...context, now: 2_000 }; update(presenter, context);
    expect(presenter.getView().state).toBe("RESULT_UNKNOWN");
    expect(presenter.ingestServerEvent(attackAccepted("late-event", 1, 2_100), "me")).toBe(true);
    expect(presenter.getView()).toMatchObject({ state: "SUCCESS", commandId: "late" });
    const effectKey = presenter.getView().effectKey;
    expect(presenter.ingestServerEvent(attackAccepted("late-event", 1, 2_100), "me")).toBe(false);
    expect(presenter.dispatch({ type: "ATTACK_REJECTED", commandId: "late", occurredAt: 2_101,
      reason: "LATE_CONFLICT", sourceEventId: "late-conflict" })).toBe(false);
    expect(presenter.getView().effectKey).toBe(effectKey);
  });

  it("resolves only the matching pending and matches commandless counter success by obstacle", () => {
    const presenter = serverPresenter({ pendingResultTimeoutMs: 5_000 }); let context = baseContext(); update(presenter, context);
    presenter.dispatch({ type: "ATTACK_SENT", commandId: "attack", symbol: "ㄱ", occurredAt: 1_000 });
    presenter.dispatch({ type: "COUNTER_SENT", commandId: "counter-a", obstacleId: "oa", symbol: "ㄴ", occurredAt: 1_010 });
    presenter.dispatch({ type: "COUNTER_SENT", commandId: "counter-b", obstacleId: "ob", symbol: "ㄴ", occurredAt: 1_020 });
    expect(presenter.ingestServerEvent(counterSucceeded("counter-event", "ob", 1_100), "me")).toBe(true);
    context = { ...context, now: 1_700 }; update(presenter, context);
    expect(presenter.getDebugState().pending.map((item) => item.commandId).sort()).toEqual(["attack", "counter-a"]);
    expect(presenter.getView()).toMatchObject({ state: "SUCCESS", commandId: "counter-b", obstacleId: "ob" });
    expect(presenter.ingestServerEvent(counterSucceeded("counter-event-duplicate", "ob", 1_101), "me")).toBe(false);
  });

  it("bounds dedupe stores and clears all lifecycle data on dispose", () => {
    const presenter = serverPresenter({ dedupeCapacity: 256 }); update(presenter, baseContext());
    presenter.dispatch({ type: "ATTACK_SENT", commandId: "pending", symbol: "ㄱ", occurredAt: 1_000 });
    for (let index = 0; index < 300; index += 1) presenter.dispatch({ type: "ATTACK_SUCCEEDED", commandId: `c-${index}`,
      obstacleId: `o-${index}`, symbol: "ㄱ", occurredAt: 1_001 + index, sourceEventId: `e-${index}` });
    expect(presenter.getDebugState()).toMatchObject({ terminalKeyCount: 256, sourceEventIdCount: 256 });
    presenter.dispose();
    expect(presenter.getDebugState()).toMatchObject({ pending: [], terminalKeyCount: 0, sourceEventIdCount: 0, connectionEpoch: 0 });
  });

  it("does not apply server timeout or snapshot reconciliation to local practice", () => {
    const presenter = new LineRaceFeedbackPresenter({ resultAuthority: "LOCAL", pendingResultTimeoutMs: 100 });
    let context = baseContext(); update(presenter, context);
    presenter.dispatch({ type: "ATTACK_SENT", commandId: "local", symbol: "ㄱ", occurredAt: 1_000 });
    context = { ...context, now: 10_000 }; update(presenter, context);
    presenter.reconcileSnapshot(snapshot(10_000), 10_000);
    expect(presenter.getView()).toMatchObject({ state: "ACTION_PENDING", commandId: "local" });
    expect(presenter.getDebugState().pending[0]).toMatchObject({ status: "PENDING" });
  });
});

function attackAccepted(eventId: string, sequence: number, occurredAt: number): LineRaceServerEvent {
  return { type: "LINE_RACE_ATTACK_ACCEPTED", eventId, matchId: "match", sequence, occurredAt,
    attackerPlayerId: "me", targetPlayerId: "them", consumedSymbol: "ㄱ", combo: 1,
    obstacle: { obstacleId: "o-attack", templateId: "t", symbol: "ㄱ", attackerPlayerId: "me", targetPlayerId: "them",
      coursePosition: 100, penaltyMs: 500, createdAt: occurredAt, warningEndsAt: occurredAt + 100, counterDeadlineAt: occurredAt + 500, status: "WARNING" } };
}

function serverPresenter(config: Partial<ConstructorParameters<typeof LineRaceFeedbackPresenter>[0]> = {}) {
  return new LineRaceFeedbackPresenter({ resultAuthority: "SERVER", pendingResultTimeoutMs: 1_000,
    resultUnknownDurationMs: 500, lateResultRetentionMs: 5_000, dedupeCapacity: 256, ...config });
}

function counterSucceeded(eventId: string, obstacleId: string, occurredAt: number): LineRaceServerEvent {
  return { type: "LINE_RACE_COUNTER_SUCCEEDED", eventId, matchId: "match", sequence: 2, occurredAt,
    playerId: "me", obstacleId, symbol: "ㄴ", counterAt: occurredAt };
}

function snapshot(serverTime: number): LineRaceMatchSnapshot {
  return { matchId: "match", roomId: "room", status: "PLAYING", serverTime, sequence: 10, myAttackHand: ["ㄱ", "ㄴ", "ㄷ"],
    obstacles: [], players: [], config: { raceLength: 1_000, baseSpeedPerSecond: 28, matchDurationMs: 60_000,
      countdownMs: 3_000, handSize: 3, attackCooldownMs: 700, counterWindowMs: 1_800, obstacleLeadDistance: 180,
      minimumObstacleSpacing: 90, maxPendingObstacles: 3, reconnectGraceMs: 10_000, supportedSymbols: ["ㄱ", "ㄴ", "ㄷ"] } };
}
