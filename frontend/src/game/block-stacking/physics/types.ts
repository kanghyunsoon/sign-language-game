export interface PhysicsConfig {
  readonly width: number;
  readonly height: number;
  readonly gravityY: number;
  /** Maximum downward velocity in Matter.js position units per update. */
  readonly maxFallSpeed: number;
  readonly wallThickness: number;
  readonly letterWidth: number;
  readonly letterHeight: number;
  /** Extra expansion applied to every glyph collider stroke. Zero means tight fit. */
  readonly letterColliderPadding: number;
  readonly friction: number;
  readonly frictionAir: number;
  readonly restitution: number;
  readonly density: number;
  /** Smaller values make glyph bodies rotate and roll more readily. */
  readonly rotationInertiaScale: number;
  readonly settleDurationMs: number;
  readonly linearVelocityThreshold: number;
  readonly angularVelocityThreshold: number;
  readonly freezeSettledBodies: boolean;
}

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  width: 720,
  height: 960,
  gravityY: 0.34,
  maxFallSpeed: 4.4,
  wallThickness: 48,
  letterWidth: 140,
  letterHeight: 140,
  letterColliderPadding: 1,
  friction: 0.34,
  frictionAir: 0.014,
  restitution: 0.02,
  density: 0.001,
  rotationInertiaScale: 0.68,
  settleDurationMs: 900,
  linearVelocityThreshold: 0.07,
  angularVelocityThreshold: 0.01,
  freezeSettledBodies: true,
};

export interface LetterBodySpec {
  readonly id: string;
  readonly symbol: string;
  readonly x: number;
  readonly y: number;
  readonly angle?: number;
  readonly angularVelocity?: number;
  /** A gentle launch impulse for letters released from the otter's paper. */
  readonly velocityY?: number;
}

export interface PhysicsLetterState {
  readonly id: string;
  readonly symbol: string;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly angularVelocity: number;
  readonly settled: boolean;
}

export type PhysicsEvent =
  | { readonly type: "LETTER_SETTLED"; readonly id: string }
  | { readonly type: "LETTER_MOVED"; readonly id: string };

export interface PhysicsWorld {
  createLetter(spec: LetterBodySpec): PhysicsLetterState;
  resize(width: number, height: number): void;
  update(deltaMs: number): readonly PhysicsEvent[];
  getLetterState(id: string): PhysicsLetterState | undefined;
  getLetterStates(): readonly PhysicsLetterState[];
  removeLetter(id: string): boolean;
  clear(): void;
  destroy(): void;
}

export interface SettlementSample {
  readonly id: string;
  readonly linearSpeed: number;
  readonly angularSpeed: number;
}
