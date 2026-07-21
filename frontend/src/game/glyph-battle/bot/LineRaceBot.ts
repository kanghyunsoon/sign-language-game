import type { LocalLineRaceGatewaySnapshot } from "../transport";

export interface LineRaceBotState {
  readonly running: boolean;
  readonly attacksEnabled: boolean;
  readonly nextAttackAt: number | null;
  readonly pendingCounterCount: number;
  readonly counterSuccessRate: number;
  readonly hand: readonly string[];
  readonly seed: number;
}

export interface LineRaceBot {
  start(): void;
  stop(): void;
  attackNow(): Promise<void>;
  setAttacksEnabled(enabled: boolean): void;
  setCounterSuccessRate(rate: number): void;
  getState(): LineRaceBotState;
  subscribe(listener: (state: LineRaceBotState) => void): () => void;
  dispose(): void;
}

export type BotGatewayState = Pick<LocalLineRaceGatewaySnapshot, "attackHand">;
