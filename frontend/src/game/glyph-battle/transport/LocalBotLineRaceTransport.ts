import type { LineRaceController, LineRaceDevPlayerId, LineRaceRuntimeSnapshot } from "../core";
import type { LineRaceInputContext } from "../recognition";
import type { LocalLineRaceCommandGateway, LocalLineRaceGatewaySnapshot } from "./LocalLineRaceCommandGateway";

export interface LocalLineRaceSymbolStatistics {
  readonly symbol: string;
  readonly attacksAttempted: number;
  readonly attacksSucceeded: number;
  readonly countersAttempted: number;
  readonly countersSucceeded: number;
}

export interface LocalLineRacePlayerStatistics {
  readonly playerId: string;
  readonly attacksAttempted: number;
  readonly attacksSucceeded: number;
  readonly countersAttempted: number;
  readonly countersSucceeded: number;
  readonly obstaclesTraversed: number;
  readonly maxCombo: number;
  readonly averageRecognitionMs: number;
  readonly symbols: readonly LocalLineRaceSymbolStatistics[];
}

export interface LineRaceBotTransport extends LocalLineRaceCommandGateway {
  getSnapshot(): LocalLineRaceGatewaySnapshot;
  getInputContext(): LineRaceInputContext;
  getStatistics(): LocalLineRacePlayerStatistics;
  recordCounterMiss(symbol: string): void;
  syncRuntime(snapshot?: LineRaceRuntimeSnapshot): void;
}

interface MutableSymbolStatistics { attacksAttempted: number; attacksSucceeded: number; countersAttempted: number; countersSucceeded: number }

export class LocalBotLineRaceTransport implements LineRaceBotTransport {
  private readonly traversedObstacleIds = new Set<string>();
  private readonly symbolStats = new Map<string, MutableSymbolStatistics>();
  private attacksAttempted = 0;
  private attacksSucceeded = 0;
  private countersAttempted = 0;
  private countersSucceeded = 0;
  private obstaclesTraversed = 0;
  private combo = 0;
  private maxCombo = 0;
  private recognitionTotalMs = 0;
  private recognitionCount = 0;

  constructor(
    private readonly gateway: LocalLineRaceCommandGateway & {
      getSnapshot(): LocalLineRaceGatewaySnapshot;
      getInputContext(): LineRaceInputContext;
      subscribe(listener: (snapshot: LocalLineRaceGatewaySnapshot) => void): () => void;
      dispose(): void;
    },
    private readonly controller: LineRaceController,
    readonly playerId: LineRaceDevPlayerId,
    private readonly now: () => number = () => controller.getSnapshot().simulationNow,
  ) {}

  async submitAttack(command: { readonly commandId: string; readonly symbol: string; readonly recognizedAt: number }): Promise<void> {
    this.attacksAttempted += 1; this.symbol(command.symbol).attacksAttempted += 1; this.recordRecognition(command.recognizedAt);
    try {
      await this.gateway.submitAttack(command);
      this.attacksSucceeded += 1; this.symbol(command.symbol).attacksSucceeded += 1; this.advanceCombo();
    } catch (cause) { this.combo = 0; throw cause; }
  }

  async submitCounter(command: { readonly commandId: string; readonly obstacleId: string; readonly symbol: string; readonly recognizedAt: number }): Promise<void> {
    this.countersAttempted += 1; this.symbol(command.symbol).countersAttempted += 1; this.recordRecognition(command.recognizedAt);
    try {
      await this.gateway.submitCounter(command);
      this.countersSucceeded += 1; this.symbol(command.symbol).countersSucceeded += 1; this.advanceCombo();
    } catch (cause) { this.combo = 0; throw cause; }
  }

  recordCounterMiss(symbol: string): void { this.countersAttempted += 1; this.symbol(symbol).countersAttempted += 1; this.combo = 0; }

  syncRuntime(snapshot: LineRaceRuntimeSnapshot = this.controller.getSnapshot()): void {
    for (const obstacle of snapshot.obstacles) {
      if (obstacle.targetPlayerId !== this.playerId || obstacle.traversalStartedAt === undefined || this.traversedObstacleIds.has(obstacle.obstacleId)) continue;
      this.traversedObstacleIds.add(obstacle.obstacleId); this.obstaclesTraversed += 1; this.combo = 0;
    }
  }

  getStatistics(): LocalLineRacePlayerStatistics {
    return {
      playerId: this.playerId, attacksAttempted: this.attacksAttempted, attacksSucceeded: this.attacksSucceeded,
      countersAttempted: this.countersAttempted, countersSucceeded: this.countersSucceeded,
      obstaclesTraversed: this.obstaclesTraversed, maxCombo: this.maxCombo,
      averageRecognitionMs: this.recognitionCount === 0 ? 0 : this.recognitionTotalMs / this.recognitionCount,
      symbols: [...this.symbolStats.entries()].map(([symbol, stats]) => ({ symbol, ...stats })).sort((left, right) => left.symbol.localeCompare(right.symbol)),
    };
  }

  getSnapshot(): LocalLineRaceGatewaySnapshot { return this.gateway.getSnapshot(); }
  getInputContext() { return this.gateway.getInputContext(); }
  subscribe(listener: (snapshot: LocalLineRaceGatewaySnapshot) => void): () => void { return this.gateway.subscribe(listener); }
  dispose(): void { this.gateway.dispose(); this.traversedObstacleIds.clear(); this.symbolStats.clear(); }

  private symbol(symbol: string): MutableSymbolStatistics {
    let stats = this.symbolStats.get(symbol);
    if (!stats) { stats = { attacksAttempted: 0, attacksSucceeded: 0, countersAttempted: 0, countersSucceeded: 0 }; this.symbolStats.set(symbol, stats); }
    return stats;
  }
  private advanceCombo(): void { this.combo += 1; this.maxCombo = Math.max(this.maxCombo, this.combo); }
  private recordRecognition(recognizedAt: number): void { this.recognitionTotalMs += Math.max(0, this.now() - recognizedAt); this.recognitionCount += 1; }
}
