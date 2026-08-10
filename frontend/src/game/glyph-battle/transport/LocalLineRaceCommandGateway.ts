import type { LineRaceController, LineRaceDevPlayerId } from "../core";
import type { LocalJamoObstacleSnapshot } from "../obstacle";
import type { LineRaceInputContext, LineRaceInputMatchState } from "../recognition/LineRaceInputContext";
import { COMPETITIVE_RECOGNITION_SYMBOLS } from "../../recognition/readiness/recognitionReadiness";
import { LINE_RACE_MATCH_BALANCE } from "../core/LineRaceBalance";

export interface LocalLineRaceCommandGateway {
  readonly resultAuthority?: "LOCAL" | "SERVER";
  submitAttack(command: { readonly commandId: string; readonly symbol: string; readonly recognizedAt: number }): Promise<void>;
  submitCounter(command: { readonly commandId: string; readonly obstacleId: string; readonly symbol: string; readonly recognizedAt: number }): Promise<void>;
}

export interface LocalLineRaceGatewaySnapshot {
  readonly attackHand: readonly string[];
  readonly attackCooldownEndsAt: number;
  readonly lastConsumedSymbol: string | null;
  readonly lastDrawnSymbol: string | null;
  readonly lastCommandId: string | null;
}

export interface DefaultLocalLineRaceCommandGatewayOptions {
  readonly controller: LineRaceController;
  readonly localPlayerId?: LineRaceDevPlayerId;
  readonly opponentPlayerId?: LineRaceDevPlayerId;
  readonly initialHand?: readonly string[];
  readonly supportedSymbols?: readonly string[];
  readonly handSize?: number;
  readonly attackCooldownMs?: number;
  readonly counterWindowMs?: number;
  readonly maxPendingObstacles?: number;
  readonly now?: () => number;
  readonly random?: () => number;
}

export class DefaultLocalLineRaceCommandGateway implements LocalLineRaceCommandGateway {
  readonly resultAuthority = "LOCAL" as const;
  private readonly listeners = new Set<(snapshot: LocalLineRaceGatewaySnapshot) => void>();
  private readonly processedCommandIds = new Set<string>();
  private readonly controller: LineRaceController;
  private readonly localPlayerId: LineRaceDevPlayerId;
  private readonly opponentPlayerId: LineRaceDevPlayerId;
  private readonly handSize: number;
  private readonly attackCooldownMs: number;
  private readonly counterWindowMs: number;
  private readonly maxPendingObstacles: number;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly supportedSymbols: readonly string[];
  private attackHand: string[];
  private attackCooldownEndsAt = 0;
  private lastConsumedSymbol: string | null = null;
  private lastDrawnSymbol: string | null = null;
  private lastCommandId: string | null = null;

  constructor(options: DefaultLocalLineRaceCommandGatewayOptions) {
    this.controller = options.controller;
    this.localPlayerId = options.localPlayerId ?? "PLAYER_A";
    this.opponentPlayerId = options.opponentPlayerId ?? "PLAYER_B";
    this.handSize = options.handSize ?? LINE_RACE_MATCH_BALANCE.handSize;
    this.attackCooldownMs = options.attackCooldownMs ?? LINE_RACE_MATCH_BALANCE.attackCooldownMs;
    this.counterWindowMs = options.counterWindowMs ?? LINE_RACE_MATCH_BALANCE.counterWindowMs;
    this.maxPendingObstacles = options.maxPendingObstacles ?? LINE_RACE_MATCH_BALANCE.maxPendingObstacles;
    this.now = options.now ?? (() => this.controller.getSnapshot().simulationNow);
    this.random = options.random ?? Math.random;
    const registrySymbols = this.controller.getObstacleTemplates().map((template) => template.symbol);
    const competitive = new Set(COMPETITIVE_RECOGNITION_SYMBOLS);
    this.supportedSymbols = [...(options.supportedSymbols ?? registrySymbols)].filter((symbol) => competitive.has(symbol));
    if (this.supportedSymbols.length < this.handSize || this.supportedSymbols.some((symbol) => !registrySymbols.includes(symbol))) throw new Error("Gateway requires competitive supported symbols.");
    if (options.supportedSymbols?.some((symbol) => !competitive.has(symbol))) throw new Error("Gateway contains a recognition-excluded symbol.");
    this.attackHand = [...(options.initialHand ?? deterministicInitialHand(this.supportedSymbols, this.handSize))];
    if (this.attackHand.length !== this.handSize) throw new RangeError(`Initial attack hand must contain ${this.handSize} cards.`);
    if (new Set(this.attackHand).size === 1 && this.attackHand.length > 1) throw new RangeError("Initial attack hand cannot contain only one repeated symbol.");
    this.attackHand.forEach((symbol) => {
      if (!this.supportedSymbols.includes(symbol)) throw new Error(`Unsupported jamo obstacle symbol: ${symbol}`);
    });
  }

  async submitAttack(command: { readonly commandId: string; readonly symbol: string; readonly recognizedAt: number }): Promise<void> {
    this.assertCommand(command.commandId, command.recognizedAt);
    const context = this.getInputContext();
    if (context.matchState !== "PLAYING") throw new Error("MATCH_NOT_PLAYING");
    if (!context.supportedSymbols.includes(command.symbol)) throw new Error("UNSUPPORTED_SYMBOL");
    if (!this.attackHand.includes(command.symbol)) throw new Error("SYMBOL_NOT_IN_HAND");
    if (context.now < this.attackCooldownEndsAt) throw new Error("ATTACK_COOLDOWN");
    if (context.pendingObstacleCount >= this.maxPendingObstacles) throw new Error("MAX_PENDING_OBSTACLES");

    this.controller.spawnObstacle({ symbol: command.symbol, targetPlayerId: this.opponentPlayerId });
    const cardIndex = this.attackHand.indexOf(command.symbol);
    this.attackHand.splice(cardIndex, 1);
    const replacement = this.drawCard(command.symbol);
    this.attackHand.push(replacement);
    this.attackCooldownEndsAt = context.now + this.attackCooldownMs;
    this.lastConsumedSymbol = command.symbol;
    this.lastDrawnSymbol = replacement;
    this.lastCommandId = command.commandId;
    this.processedCommandIds.add(command.commandId);
    this.publish();
  }

  async submitCounter(command: { readonly commandId: string; readonly obstacleId: string; readonly symbol: string; readonly recognizedAt: number }): Promise<void> {
    this.assertCommand(command.commandId, command.recognizedAt);
    const obstacle = this.controller.getSnapshot().obstacles.find((item) => item.obstacleId === command.obstacleId);
    if (!obstacle) throw new Error("OBSTACLE_NOT_FOUND");
    if (obstacle.targetPlayerId !== this.localPlayerId || obstacle.symbol !== command.symbol) throw new Error("SYMBOL_MISMATCH");
    if (!isCounterable(obstacle, this.getInputContext().now, this.counterDeadline(obstacle))) throw new Error("OBSTACLE_NOT_COUNTERABLE");
    if (!this.controller.counterObstacle(command.obstacleId)) throw new Error("COUNTER_FAILED");
    this.lastCommandId = command.commandId;
    this.processedCommandIds.add(command.commandId);
    this.publish();
  }

  getInputContext(): LineRaceInputContext {
    const runtime = this.controller.getSnapshot();
    const now = this.now();
    const local = runtime.players.find((player) => player.playerId === this.localPlayerId);
    const pending = runtime.obstacles.filter((item) => item.targetPlayerId === this.opponentPlayerId && !["REMOVING", "REMOVED", "COUNTERED", "TRAVERSED"].includes(item.state));
    const counterable = runtime.obstacles
      .filter((item): item is LocalJamoObstacleSnapshot & { readonly state: "WARNING" | "FALLING" | "ACTIVE" } =>
        item.targetPlayerId === this.localPlayerId && ["WARNING", "FALLING", "ACTIVE"].includes(item.state))
      .map((item) => ({
        obstacleId: item.obstacleId,
        symbol: item.symbol,
        distanceToRunner: Math.max(0, item.coursePosition - (local?.progress ?? 0)),
        counterDeadlineAt: this.counterDeadline(item),
        state: item.state,
      }))
      .filter((item) => item.counterDeadlineAt >= now)
      .sort((left, right) => left.distanceToRunner - right.distanceToRunner);
    return {
      matchState: toInputMatchState(runtime.state),
      attackHand: [...this.attackHand],
      attackCooldownEndsAt: this.attackCooldownEndsAt,
      now,
      pendingObstacleCount: pending.length,
      maxPendingObstacles: this.maxPendingObstacles,
      counterWindowMs: this.counterWindowMs,
      supportedSymbols: this.supportedSymbols,
      counterableObstacles: counterable,
    };
  }

  getSnapshot(): LocalLineRaceGatewaySnapshot {
    return {
      attackHand: [...this.attackHand], attackCooldownEndsAt: this.attackCooldownEndsAt,
      lastConsumedSymbol: this.lastConsumedSymbol, lastDrawnSymbol: this.lastDrawnSymbol, lastCommandId: this.lastCommandId,
    };
  }

  subscribe(listener: (snapshot: LocalLineRaceGatewaySnapshot) => void): () => void {
    this.listeners.add(listener); listener(this.getSnapshot()); return () => this.listeners.delete(listener);
  }

  dispose(): void { this.listeners.clear(); this.processedCommandIds.clear(); }

  private counterDeadline(obstacle: LocalJamoObstacleSnapshot): number {
    return obstacle.warningEndsAt + obstacle.fallDurationMs + this.counterWindowMs;
  }

  private drawCard(consumedSymbol: string): string {
    const symbols = this.supportedSymbols;
    const candidates = symbols.filter((symbol) => symbol !== consumedSymbol && this.attackHand.filter((card) => card === symbol).length < 2);
    const pool = candidates.length > 0 ? candidates : symbols.filter((symbol) => this.attackHand.filter((card) => card === symbol).length < 2);
    return pool[Math.min(pool.length - 1, Math.floor(this.random() * pool.length))] ?? symbols[0] ?? consumedSymbol;
  }

  private assertCommand(commandId: string, recognizedAt: number): void {
    if (!commandId.trim()) throw new Error("COMMAND_ID_REQUIRED");
    if (this.processedCommandIds.has(commandId)) throw new Error("DUPLICATE_COMMAND");
    if (!Number.isFinite(recognizedAt) || recognizedAt < 0) throw new Error("INVALID_RECOGNIZED_AT");
  }

  private publish(): void { const snapshot = this.getSnapshot(); this.listeners.forEach((listener) => listener(snapshot)); }
}

function deterministicInitialHand(symbols: readonly string[], handSize: number): readonly string[] {
  if (symbols.length < handSize) throw new RangeError(`At least ${handSize} competitive symbols are required.`);
  return symbols.slice(0, handSize);
}

function toInputMatchState(state: string): LineRaceInputMatchState {
  if (state === "COUNTDOWN" || state === "PLAYING" || state === "FINISHED") return state;
  return "IDLE";
}

function isCounterable(obstacle: LocalJamoObstacleSnapshot, now: number, deadline: number): boolean {
  return ["WARNING", "FALLING", "ACTIVE"].includes(obstacle.state) && now <= deadline;
}
