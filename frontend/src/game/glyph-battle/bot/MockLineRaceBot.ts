import type { LineRaceBotTransport } from "../transport";
import type { LineRaceBot, LineRaceBotState } from "./LineRaceBot";
import { validateLineRaceBotConfig, type LineRaceBotConfig } from "./LineRaceBotConfig";
import { SeededRandom } from "./SeededRandom";

interface CounterDecision { readonly obstacleId: string; readonly symbol: string; readonly dueAt: number; readonly succeeds: boolean }

export interface MockLineRaceBotOptions {
  readonly config: LineRaceBotConfig;
  readonly transport: LineRaceBotTransport;
  readonly random?: SeededRandom;
  readonly tickIntervalMs?: number;
  readonly setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setInterval>;
  readonly clearTimer?: (timer: ReturnType<typeof setInterval>) => void;
}

export class MockLineRaceBot implements LineRaceBot {
  private readonly config: LineRaceBotConfig;
  private readonly transport: LineRaceBotTransport;
  private readonly random: SeededRandom;
  private readonly listeners = new Set<(state: LineRaceBotState) => void>();
  private readonly decisions = new Map<string, CounterDecision>();
  private readonly consideredObstacleIds = new Set<string>();
  private readonly tickIntervalMs: number;
  private readonly setTimer: NonNullable<MockLineRaceBotOptions["setTimer"]>;
  private readonly clearTimer: NonNullable<MockLineRaceBotOptions["clearTimer"]>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private attacksEnabled = true;
  private nextAttackAt: number | null = null;
  private counterSuccessRate: number;
  private commandSequence = 0;
  private disposed = false;

  constructor(options: MockLineRaceBotOptions) {
    this.config = validateLineRaceBotConfig(options.config);
    this.transport = options.transport;
    this.random = options.random ?? new SeededRandom(this.config.randomSeed);
    this.tickIntervalMs = options.tickIntervalMs ?? 50;
    this.setTimer = options.setTimer ?? ((callback, delay) => setInterval(callback, delay));
    this.clearTimer = options.clearTimer ?? ((timer) => clearInterval(timer));
    this.counterSuccessRate = this.config.counterSuccessRate;
  }

  start(): void {
    this.assertActive();
    if (this.timer !== null) return;
    this.timer = this.setTimer(() => this.tick(), this.tickIntervalMs);
    this.publish();
  }

  stop(): void {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null; this.nextAttackAt = null; this.decisions.clear(); this.publish();
  }

  async attackNow(): Promise<void> {
    this.assertActive();
    const context = this.transport.getInputContext();
    if (context.matchState !== "PLAYING") throw new Error("MATCH_NOT_PLAYING");
    const symbol = this.random.pick(this.transport.getSnapshot().attackHand);
    await this.transport.submitAttack({ commandId: this.commandId("attack"), symbol, recognizedAt: context.now });
    this.scheduleNextAttack(context.now);
    this.publish();
  }

  setAttacksEnabled(enabled: boolean): void { this.attacksEnabled = enabled; this.nextAttackAt = null; this.publish(); }
  setCounterSuccessRate(rate: number): void {
    if (rate < 0 || rate > 1) throw new RangeError("Counter success rate must be between 0 and 1.");
    this.counterSuccessRate = rate; this.publish();
  }
  getState(): LineRaceBotState {
    return { running: this.timer !== null, attacksEnabled: this.attacksEnabled, nextAttackAt: this.nextAttackAt,
      pendingCounterCount: this.decisions.size, counterSuccessRate: this.counterSuccessRate,
      hand: this.transport.getSnapshot().attackHand, seed: this.config.randomSeed };
  }
  subscribe(listener: (state: LineRaceBotState) => void): () => void { this.listeners.add(listener); listener(this.getState()); return () => this.listeners.delete(listener); }
  dispose(): void { if (this.disposed) return; this.stop(); this.listeners.clear(); this.consideredObstacleIds.clear(); this.disposed = true; }

  /** Deterministic test/development tick using the transport's virtual clock. */
  tick(): void {
    if (this.disposed) return;
    const context = this.transport.getInputContext();
    this.transport.syncRuntime();
    if (context.matchState !== "PLAYING") { this.nextAttackAt = null; return; }
    this.discoverCounters(context.now);
    this.processCounters(context.now);
    if (this.attacksEnabled) {
      if (this.nextAttackAt === null) this.scheduleNextAttack(context.now);
      else if (context.now >= this.nextAttackAt) void this.attackNow().catch(() => this.scheduleNextAttack(context.now));
    }
    this.publish();
  }

  private discoverCounters(now: number): void {
    for (const obstacle of this.transport.getInputContext().counterableObstacles) {
      if (this.consideredObstacleIds.has(obstacle.obstacleId)) continue;
      this.consideredObstacleIds.add(obstacle.obstacleId);
      this.decisions.set(obstacle.obstacleId, {
        obstacleId: obstacle.obstacleId, symbol: obstacle.symbol,
        dueAt: now + this.random.between(this.config.counterReactionMinMs, this.config.counterReactionMaxMs),
        succeeds: this.random.chance(this.counterSuccessRate),
      });
    }
  }

  private processCounters(now: number): void {
    for (const [obstacleId, decision] of this.decisions) {
      if (now < decision.dueAt) continue;
      this.decisions.delete(obstacleId);
      if (!decision.succeeds) { this.transport.recordCounterMiss(decision.symbol); continue; }
      void this.transport.submitCounter({ commandId: this.commandId("counter"), obstacleId, symbol: decision.symbol, recognizedAt: now }).catch(() => undefined);
    }
  }

  private scheduleNextAttack(now: number): void { this.nextAttackAt = now + this.random.between(this.config.attackIntervalMinMs, this.config.attackIntervalMaxMs); }
  private commandId(kind: string): string { this.commandSequence += 1; return `mock-bot-${this.config.randomSeed}-${kind}-${this.commandSequence}`; }
  private publish(): void { if (!this.disposed) { const state = this.getState(); this.listeners.forEach((listener) => listener(state)); } }
  private assertActive(): void { if (this.disposed) throw new Error("Mock line-race bot has been disposed."); }
}
