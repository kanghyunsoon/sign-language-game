import type { LineRaceInputContext } from "../recognition";
import type {
  LocalLineRaceCommandGateway,
  LocalLineRaceGatewaySnapshot,
} from "../transport";
import {
  elementalModifier,
  getGlyphCombatRule,
  type GlyphCombatRule,
  type GlyphMoveRole,
} from "../duel/GlyphCombatRules";
import type {
  GlyphDuelFighterView,
  GlyphDuelMoveView,
  GlyphDuelView,
} from "../duel/GlyphDuelModel";
import { SeededRandom } from "./SeededRandom";

interface Fighter {
  health: number;
  focus: number;
  guardPercent: number;
  rounds: number;
  lastRole: GlyphMoveRole | null;
}
type TimerHandle = ReturnType<typeof setTimeout>;

export interface LocalGlyphTurnPracticeOptions {
  readonly symbols: readonly string[];
  readonly seed?: number;
  readonly revealDelayMs?: number;
  readonly resultHoldMs?: number;
  readonly planningMs?: number;
  readonly mirrorBotChoice?: boolean;
  readonly forcedBotSymbol?: string;
  readonly now?: () => number;
  readonly setTimer?: (callback: () => void, delay: number) => TimerHandle;
  readonly clearTimer?: (timer: TimerHandle) => void;
}

/** Frontend-only prototype opponent. It never schedules attacks on its own. */
export class LocalGlyphTurnPractice implements LocalLineRaceCommandGateway {
  readonly resultAuthority = "LOCAL" as const;
  private readonly localId = "PLAYER_A";
  private readonly opponentId = "PLAYER_B";
  private readonly random: SeededRandom;
  private readonly symbols: readonly string[];
  private readonly now: () => number;
  private readonly setTimer: NonNullable<
    LocalGlyphTurnPracticeOptions["setTimer"]
  >;
  private readonly clearTimer: NonNullable<
    LocalGlyphTurnPracticeOptions["clearTimer"]
  >;
  private readonly revealDelayMs: number;
  private readonly resultHoldMs: number;
  private readonly planningMs: number;
  private readonly mirrorBotChoice: boolean;
  private readonly forcedBotSymbol: string | null;
  private planningEndsAt = 0;
  private planningTimer: TimerHandle | null = null;
  private readonly processed = new Set<string>();
  private readonly timers = new Set<TimerHandle>();
  private readonly gatewayListeners = new Set<
    (snapshot: LocalLineRaceGatewaySnapshot) => void
  >();
  private readonly duelListeners = new Set<(view: GlyphDuelView) => void>();
  private local: Fighter = fresh();
  private opponent: Fighter = fresh();
  private hand: string[];
  private botHand: string[];
  private turn = 1;
  private phase: GlyphDuelView["phase"] = "PLANNING";
  private revision = 0;
  private prompt = "카드의 지문자를 만들면 이번 턴 선택이 잠깁니다.";
  private callout = "ROUND 1 · 동시 선택";
  private calloutAt = 0;
  private lastMove: GlyphDuelMoveView | null = null;
  private resolvedMoves: GlyphDuelMoveView[] = [];
  private lastConsumedSymbol: string | null = null;
  private lastDrawnSymbol: string | null = null;
  private lastCommandId: string | null = null;
  private disposed = false;

  constructor(options: LocalGlyphTurnPracticeOptions) {
    this.symbols = [...options.symbols];
    if (this.symbols.length < 3)
      throw new Error("Turn practice requires at least three symbols.");
    this.random = new SeededRandom(options.seed ?? 12345);
    this.now = options.now ?? (() => Date.now());
    this.revealDelayMs = options.revealDelayMs ?? 520;
    this.resultHoldMs = options.resultHoldMs ?? 1_500;
    this.planningMs = options.planningMs ?? 10_000;
    this.mirrorBotChoice = options.mirrorBotChoice ?? false;
    this.forcedBotSymbol = options.forcedBotSymbol ?? null;
    this.setTimer =
      options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
    this.clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
    this.hand = this.dealWeightedHand(0);
    this.botHand = this.dealWeightedHand(0);
    this.beginPlanning();
  }

  async submitAttack(command: {
    readonly commandId: string;
    readonly symbol: string;
    readonly recognizedAt: number;
  }): Promise<void> {
    this.assertActive();
    if (this.phase !== "PLANNING") throw new Error("TURN_SELECTION_LOCKED");
    if (this.processed.has(command.commandId))
      throw new Error("DUPLICATE_COMMAND");
    if (!this.hand.includes(command.symbol))
      throw new Error("SYMBOL_NOT_IN_HAND");
    this.clearPlanningTimer();
    this.processed.add(command.commandId);
    this.lastCommandId = command.commandId;
    this.lastConsumedSymbol = command.symbol;
    const index = this.hand.indexOf(command.symbol);
    this.hand.splice(index, 1);
    this.lastDrawnSymbol = this.drawReplacement(this.hand, this.local.focus);
    this.hand.push(this.lastDrawnSymbol);
    const botSymbol = this.mirrorBotChoice
      ? command.symbol
      : (this.forcedBotSymbol ?? this.pickBotMove());
    const botIndex = this.botHand.indexOf(botSymbol);
    if (botIndex >= 0) {
      this.botHand.splice(botIndex, 1);
      this.botHand.push(
        this.drawReplacement(this.botHand, this.opponent.focus),
      );
    }
    this.phase = "WAITING";
    this.prompt = "내 선택 잠금 · 상대 선택을 기다리는 중";
    this.callout = "내 선택 완료 · 상대 선택 중";
    this.calloutAt = this.now();
    this.lastMove = null;
    this.resolvedMoves = [];
    this.publish();
    this.schedule(
      () => this.reveal(command.symbol, botSymbol),
      this.revealDelayMs,
    );
  }

  async submitCounter(): Promise<void> {
    throw new Error("TURN_BATTLE_HAS_NO_COUNTER_INPUT");
  }
  getSnapshot(): LocalLineRaceGatewaySnapshot {
    return {
      attackHand: [...this.hand],
      attackCooldownEndsAt:
        this.phase === "PLANNING" ? 0 : Number.MAX_SAFE_INTEGER,
      lastConsumedSymbol: this.lastConsumedSymbol,
      lastDrawnSymbol: this.lastDrawnSymbol,
      lastCommandId: this.lastCommandId,
    };
  }
  getInputContext(): LineRaceInputContext {
    return {
      matchState: this.phase === "FINISHED" ? "FINISHED" : "PLAYING",
      attackHand: [...this.hand],
      attackCooldownEndsAt:
        this.phase === "PLANNING" ? 0 : Number.MAX_SAFE_INTEGER,
      now: this.now(),
      pendingObstacleCount: 0,
      maxPendingObstacles: 1,
      counterWindowMs: 0,
      supportedSymbols: this.symbols,
      counterableObstacles: [],
    };
  }
  getDuelView(): GlyphDuelView {
    return {
      local: viewFighter(this.localId, this.local),
      opponent: viewFighter(this.opponentId, this.opponent),
      phase: this.phase,
      turn: this.turn,
      turnEndsAt: this.phase === "PLANNING" ? this.planningEndsAt : undefined,
      prompt: this.prompt,
      lastMove: this.lastMove,
      resolvedMoves: [...this.resolvedMoves],
      callout: this.callout,
      calloutAt: this.calloutAt,
      revision: this.revision,
    };
  }
  subscribe(
    listener: (snapshot: LocalLineRaceGatewaySnapshot) => void,
  ): () => void {
    this.gatewayListeners.add(listener);
    listener(this.getSnapshot());
    return () => this.gatewayListeners.delete(listener);
  }
  subscribeDuel(listener: (view: GlyphDuelView) => void): () => void {
    this.duelListeners.add(listener);
    listener(this.getDuelView());
    return () => this.duelListeners.delete(listener);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const timer of this.timers) this.clearTimer(timer);
    this.timers.clear();
    this.gatewayListeners.clear();
    this.duelListeners.clear();
  }

  private reveal(localSymbol: string, botSymbol: string): void {
    if (this.disposed || this.phase !== "WAITING") return;
    const at = this.now(),
      localRule = getGlyphCombatRule(localSymbol),
      botRule = getGlyphCombatRule(botSymbol);
    const sameGlyph = localSymbol === botSymbol;
    const localResult = damage(
        localRule,
        botRule,
        this.local.focus,
        botRule.damageReduction,
        sameGlyph,
      ),
      botResult = damage(
        botRule,
        localRule,
        this.opponent.focus,
        localRule.damageReduction,
        sameGlyph,
      );
    this.local.health = Math.max(0, this.local.health - botResult.amount);
    this.opponent.health = Math.max(
      0,
      this.opponent.health - localResult.amount,
    );
    this.local.focus = nextFocus(this.local.focus, localRule, botRule);
    this.opponent.focus = nextFocus(this.opponent.focus, botRule, localRule);
    this.ensureFinisher(this.hand, this.local.focus);
    this.ensureFinisher(this.botHand, this.opponent.focus);
    this.local.guardPercent = nextGuard(this.local, localRule);
    this.opponent.guardPercent = nextGuard(this.opponent, botRule);
    this.local.lastRole = localRule.role;
    this.opponent.lastRole = botRule.role;
    const localMove = move(
        localSymbol,
        localRule,
        localResult.amount,
        this.localId,
        this.opponentId,
        localResult.effectiveness,
      ),
      botMove = move(
        botSymbol,
        botRule,
        botResult.amount,
        this.opponentId,
        this.localId,
        botResult.effectiveness,
      );
    this.lastMove = localMove;
    this.resolvedMoves = [localMove, botMove];
    this.phase = "REVEAL";
    this.prompt = `나 ${localSymbol} · 상대 ${botSymbol}`;
    this.callout = `${localSymbol} ${localRule.label} ${localResult.amount} 피해  VS  ${botSymbol} ${botRule.label} ${botResult.amount} 피해`;
    this.calloutAt = at;
    const localDown = this.local.health === 0,
      opponentDown = this.opponent.health === 0;
    if (opponentDown && !localDown) this.local.rounds += 1;
    if (localDown && !opponentDown) this.opponent.rounds += 1;
    const finished = this.local.rounds >= 2 || this.opponent.rounds >= 2;
    if (finished) {
      this.phase = "FINISHED";
      this.prompt = this.local.rounds >= 2 ? "승리" : "패배";
    }
    this.publish();
    if (!finished)
      this.schedule(
        () => this.nextTurn(localDown || opponentDown),
        this.resultHoldMs,
      );
  }

  private nextTurn(roundEnded: boolean): void {
    if (this.disposed || this.phase !== "REVEAL") return;
    if (roundEnded) {
      this.local.health = 100;
      this.opponent.health = 100;
      this.local.focus = Math.min(50, this.local.focus);
      this.opponent.focus = Math.min(50, this.opponent.focus);
      this.local.lastRole = null;
      this.opponent.lastRole = null;
    }
    this.local.guardPercent = 0;
    this.opponent.guardPercent = 0;
    this.turn += 1;
    this.phase = "PLANNING";
    this.prompt = "다음 턴 기술을 비공개로 선택하세요";
    this.callout = roundEnded
      ? `ROUND ${Math.max(this.local.rounds, this.opponent.rounds) + 1}`
      : `TURN ${this.turn} · 동시 선택`;
    this.calloutAt = this.now();
    this.lastMove = null;
    this.resolvedMoves = [];
    this.beginPlanning();
    this.publish();
  }
  private dealWeightedHand(focus: number): string[] {
    return [
      this.drawWeightedCard([], focus),
      this.drawWeightedCard([], focus),
      this.drawWeightedCard([], focus),
    ];
  }
  private drawReplacement(current: readonly string[], focus: number): string {
    return this.drawWeightedCard(current, focus);
  }
  private drawWeightedCard(current: readonly string[], focus: number): string {
    const choices = this.symbols.filter((symbol) => !current.includes(symbol));
    const finisherReady = focus >= 35;
    const weighted = choices.flatMap((symbol) => {
      const role = getGlyphCombatRule(symbol).role;
      if (role === "FINISHER" && !finisherReady) return [];
      const weight =
        role === "ATTACK"
          ? 46
          : role === "FOCUS"
            ? 27
            : role === "GUARD"
              ? 20
              : role === "CONTROL"
                ? 7
                : 18;
      return Array.from({ length: weight }, () => symbol);
    });
    return this.random.pick(weighted.length ? weighted : choices);
  }
  private ensureFinisher(hand: string[], focus: number): void {
    const finisher = this.symbols.find(
      (symbol) => getGlyphCombatRule(symbol).role === "FINISHER",
    );
    if (
      !finisher ||
      hand.includes(finisher) ||
      focus < getGlyphCombatRule(finisher).focusCost
    )
      return;
    hand.push(finisher);
  }
  private pickBotMove(): string {
    const finisher = this.botHand.find(
      (symbol) =>
        getGlyphCombatRule(symbol).role === "FINISHER" &&
        this.opponent.focus >= 35,
    );
    if (finisher) return finisher;
    const weighted = this.botHand.flatMap((symbol) =>
      Array.from(
        {
          length:
            getGlyphCombatRule(symbol).role === "CONTROL"
              ? 1
              : getGlyphCombatRule(symbol).role === "ATTACK"
                ? 5
                : 3,
        },
        () => symbol,
      ),
    );
    return this.random.pick(weighted);
  }
  private beginPlanning(): void {
    this.clearPlanningTimer();
    this.planningEndsAt = this.now() + this.planningMs;
    this.planningTimer = this.schedule(
      () => this.onPlanningTimeout(),
      this.planningMs,
    );
  }
  private clearPlanningTimer(): void {
    if (this.planningTimer === null) return;
    this.clearTimer(this.planningTimer);
    this.timers.delete(this.planningTimer);
    this.planningTimer = null;
  }
  private onPlanningTimeout(): void {
    this.planningTimer = null;
    if (this.disposed || this.phase !== "PLANNING") return;
    const fallback =
      this.hand.find((symbol) => getGlyphCombatRule(symbol).role === "GUARD") ??
      this.hand.find(
        (symbol) => getGlyphCombatRule(symbol).role === "ATTACK",
      ) ??
      this.hand[0];
    if (!fallback) return;
    void this.submitAttack({
      commandId: `timeout-${this.turn}-${this.now()}`,
      symbol: fallback,
      recognizedAt: this.now(),
    });
    this.callout = "시간 종료 · 안전 선택을 잠금";
    this.calloutAt = this.now();
    this.publish();
  }
  private schedule(callback: () => void, delay: number): TimerHandle {
    let timer: TimerHandle;
    timer = this.setTimer(() => {
      this.timers.delete(timer);
      callback();
    }, delay);
    this.timers.add(timer);
    return timer;
  }
  private publish(): void {
    this.revision += 1;
    const snapshot = this.getSnapshot(),
      view = this.getDuelView();
    this.gatewayListeners.forEach((listener) => listener(snapshot));
    this.duelListeners.forEach((listener) => listener(view));
  }
  private assertActive(): void {
    if (this.disposed) throw new Error("Turn practice has been disposed.");
  }
}

function fresh(): Fighter {
  return { health: 100, focus: 0, guardPercent: 0, rounds: 0, lastRole: null };
}
function viewFighter(playerId: string, value: Fighter): GlyphDuelFighterView {
  return {
    playerId,
    health: value.health,
    focus: value.focus,
    guardPercent: value.guardPercent,
    rounds: value.rounds,
  };
}
function nextFocus(
  current: number,
  own: GlyphCombatRule,
  incoming: GlyphCombatRule,
): number {
  const spend =
    own.focusCost > 0 && current >= own.focusCost ? own.focusCost : 0;
  return Math.max(
    0,
    Math.min(100, current - spend + own.focusGain - incoming.focusDrain),
  );
}
function nextGuard(fighter: Fighter, rule: GlyphCombatRule): number {
  return rule.role === "GUARD" && fighter.lastRole !== "GUARD"
    ? rule.damageReduction
    : 0;
}
function damage(
  attack: GlyphCombatRule,
  defense: GlyphCombatRule,
  focus: number,
  guard: number,
  sameGlyph = false,
): { amount: number; effectiveness?: string } {
  let power = attack.damage;
  if (attack.focusCost > 0 && focus < attack.focusCost)
    power = Math.ceil(power * 0.45);
  const affinity = elementalModifier(attack.kind, defense.kind);
  const raw = Math.max(
    0,
    Math.round(power * affinity.multiplier * (sameGlyph ? 0.5 : 1)),
  );
  return {
    amount: Math.max(0, Math.round(raw * (1 - guard / 100))),
    effectiveness: affinity.label,
  };
}
function move(
  symbol: string,
  rule: GlyphCombatRule,
  amount: number,
  attackerId: string,
  targetId: string,
  effectiveness?: string,
): GlyphDuelMoveView {
  return {
    symbol,
    role: rule.role,
    roleLabel: rule.roleLabel,
    elementLabel: rule.elementLabel,
    label: rule.label,
    damage: amount,
    attackerId,
    targetId,
    effectiveness,
  };
}
