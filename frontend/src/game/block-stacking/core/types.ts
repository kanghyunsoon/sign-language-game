export type LetterState = "FALLING" | "SETTLED" | "REMOVING" | "REMOVED";

export interface LetterEntity {
  readonly id: string;
  readonly symbol: string;
  readonly state: LetterState;
  readonly spawnedAt: number;
  readonly settledAt?: number;
  readonly removingAt?: number;
  readonly removedAt?: number;
}

export interface InputLockConfig {
  readonly enabled: boolean;
  readonly cooldownMs: number;
  readonly allowDifferentSymbolSwitch: boolean;
}

export interface GameConfig {
  readonly inputLock: InputLockConfig;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  inputLock: {
    enabled: true,
    cooldownMs: 300,
    allowDifferentSymbolSwitch: true,
  },
};

export interface InputLockSnapshot {
  readonly lockedSymbol: string | null;
  readonly lockedAt: number | null;
  readonly enabled: boolean;
}

export interface GameSnapshot {
  readonly letters: readonly LetterEntity[];
  readonly inputLock: InputLockSnapshot;
}

export type GameEvent =
  | { readonly type: "LETTER_SPAWNED"; readonly letter: LetterEntity }
  | { readonly type: "LETTER_SETTLED"; readonly letter: LetterEntity }
  | { readonly type: "LETTER_REMOVING"; readonly letter: LetterEntity }
  | { readonly type: "LETTER_REMOVED"; readonly letter: LetterEntity }
  | { readonly type: "INPUT_LOCKED"; readonly symbol: string; readonly at: number }
  | { readonly type: "INPUT_REJECTED"; readonly symbol: string; readonly reason: "LOCKED"; readonly at: number }
  | { readonly type: "HAND_RELEASED"; readonly releasedSymbol: string | null; readonly at: number }
  | { readonly type: "REMOVAL_SKIPPED"; readonly symbol: string; readonly at: number };

export interface RemovalTarget {
  readonly id: string;
  readonly symbol: string;
  readonly state: "SETTLED" | "FALLING";
}
