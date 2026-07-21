import { RemovalSystem } from "../core/RemovalSystem";
import { DEFAULT_GAME_CONFIG, type GameConfig, type GameEvent } from "../core/types";
import type { PhysicsLetterState, PhysicsWorld } from "../physics/types";
import type { GameRenderer } from "../render/types";
import { ScoreTracker } from "../scoring/ScoreTracker";
import { DEFAULT_SCORING_CONFIG, type ScoringConfig } from "../scoring/types";
import { chooseDistributedSpawnX } from "./DistributedSpawnPolicy";
import {
  DEFAULT_SOLO_GAME_CONFIG,
  type GameRuntimeListener,
  type GameRuntimeOptions,
  type GameRuntimeSnapshot,
  type GameRunState,
  type SoloGameConfig,
} from "./types";

const MAX_FRAME_DELTA_MS = 32;

export class GameRuntime {
  private readonly renderer: GameRenderer;
  private readonly physicsFactory: () => PhysicsWorld;
  private symbols: readonly string[];
  private readonly config: SoloGameConfig;
  private readonly gameConfig: GameConfig;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly scoringConfig: ScoringConfig;
  private readonly requestFrame: (callback: FrameRequestCallback) => number;
  private readonly cancelAnimationFrame: (handle: number) => void;
  private readonly listeners = new Set<GameRuntimeListener>();
  private physics: PhysicsWorld;
  private core: RemovalSystem;
  private runState: GameRunState = "IDLE";
  private frameHandle: number | null = null;
  private previousFrameAt: number | null = null;
  private spawnElapsedMs = 0;
  private boardWidth: number;
  private boardHeight: number;
  private viewportSize: { readonly width: number; readonly height: number } | null = null;
  private nextLetterId = 1;
  private score = 0;
  private combo = 0;
  private bestCombo = 0;
  private removedCount = 0;
  private scoreTracker: ScoreTracker;
  private playTimeMs = 0;
  private lastMessage = "Start the game to spawn letters.";
  private disposed = false;

  constructor(options: GameRuntimeOptions) {
    if (options.symbols.length === 0) throw new Error("GameRuntime requires at least one symbol.");
    this.renderer = options.renderer;
    this.physicsFactory = options.physics;
    this.symbols = options.symbols;
    this.config = { ...DEFAULT_SOLO_GAME_CONFIG, ...options.soloConfig };
    this.boardWidth = this.config.boardWidth;
    this.boardHeight = this.config.boardHeight;
    this.gameConfig = options.gameConfig ?? DEFAULT_GAME_CONFIG;
    this.now = options.now ?? (() => performance.now());
    this.random = options.random ?? Math.random;
    this.requestFrame = options.requestFrame ?? globalThis.requestAnimationFrame.bind(globalThis);
    this.cancelAnimationFrame = options.cancelFrame ?? globalThis.cancelAnimationFrame.bind(globalThis);
    this.physics = this.physicsFactory();
    this.core = new RemovalSystem(this.gameConfig);
    this.scoringConfig = { ...DEFAULT_SCORING_CONFIG, ...options.scoringConfig };
    this.scoreTracker = new ScoreTracker(this.scoringConfig);
  }

  subscribe(listener: GameRuntimeListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  start(): void {
    this.assertActive();
    if (this.runState === "GAME_OVER") {
      this.restart();
    }
    if (this.runState === "RUNNING") return;
    this.runState = "RUNNING";
    this.lastMessage = "Keyboard input is ready.";
    this.previousFrameAt = null;
    this.publish();
    this.scheduleFrame();
  }

  resizeViewport(width: number, height: number): void {
    this.assertActive();
    this.physics.resize(width, height);
    this.boardWidth = width;
    this.boardHeight = height;
    this.viewportSize = { width, height };
  }

  pause(): void {
    this.assertActive();
    if (this.runState !== "RUNNING") return;
    this.runState = "PAUSED";
    this.cancelFrame();
    this.lastMessage = "Game paused.";
    this.publish();
  }

  restart(): void {
    this.assertActive();
    this.cancelFrame();
    this.physics.destroy();
    this.renderer.clear();
    this.physics = this.physicsFactory();
    if (this.viewportSize) {
      this.physics.resize(this.viewportSize.width, this.viewportSize.height);
    }
    this.core = new RemovalSystem(this.gameConfig);
    this.runState = "IDLE";
    this.previousFrameAt = null;
    this.spawnElapsedMs = 0;
    this.nextLetterId = 1;
    this.scoreTracker = new ScoreTracker(this.scoringConfig);
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.removedCount = 0;
    this.playTimeMs = 0;
    this.lastMessage = "Game reset. Press start when ready.";
    this.publish();
  }

  submitSymbol(symbol: string): void {
    this.assertActive();
    if (this.runState !== "RUNNING" || !this.symbols.includes(symbol)) return;

    const events = this.core.confirmSymbol(symbol, this.now());
    for (const event of events) {
      if (event.type === "LETTER_REMOVING") {
        this.renderer.highlightRemoval(event.letter.id);
        this.lastMessage = `${event.letter.symbol} removal selected.`;
      } else if (event.type === "INPUT_REJECTED") {
        this.lastMessage = `${symbol} is locked until release.`;
      } else if (event.type === "REMOVAL_SKIPPED") {
        this.applyScoreSnapshot(this.scoreTracker.recordNoTarget());
        this.lastMessage = `No ${symbol} letter is available.`;
      }
    }
    this.updateRendererTarget();
    this.publish();
  }

  releaseInput(): void {
    this.assertActive();
    const event = this.core.handReleased(this.now());
    if (event.releasedSymbol !== null) {
      this.lastMessage = `${event.releasedSymbol} input released.`;
      this.publish();
    }
  }

  hasAvailableSymbol(symbol: string): boolean {
    return this.core.snapshot().letters.some((letter) => (
      letter.symbol === symbol && (letter.state === "FALLING" || letter.state === "SETTLED")
    ));
  }

  /** Returns the oldest playable letter so the UI can give the player a concrete sign to make. */
  getPreferredTargetSymbol(allowedSymbols: readonly string[]): string | null {
    const allowed = new Set(allowedSymbols);
    if (allowed.size === 0) return null;

    const oldest = this.core.snapshot().letters
      .filter((letter) => (
        allowed.has(letter.symbol)
        && (letter.state === "FALLING" || letter.state === "SETTLED")
      ))
      .sort((left, right) => left.spawnedAt - right.spawnedAt)[0];
    return oldest?.symbol ?? null;
  }

  recordIncorrectInput(): void {
    this.assertActive();
    const score = this.scoreTracker.recordIncorrect();
    this.applyScoreSnapshot(score);
    this.lastMessage = "Incorrect sign. Combo reset.";
    this.publish();
  }

  setSpawnSymbols(symbols: readonly string[]): void {
    this.assertActive();
    this.symbols = [...symbols];
    this.updateRendererTarget();
  }

  /** Public for deterministic tests; browser play advances through requestAnimationFrame. */
  advance(deltaMs: number): void {
    this.assertActive();
    if (this.runState !== "RUNNING") return;
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) throw new RangeError("deltaMs must be a positive finite number.");

    const boundedDelta = Math.min(deltaMs, MAX_FRAME_DELTA_MS);
    this.playTimeMs += boundedDelta;
    this.spawnElapsedMs += boundedDelta;
    while (this.spawnElapsedMs >= this.config.spawnIntervalMs) {
      this.spawnElapsedMs -= this.config.spawnIntervalMs;
      this.spawnLetter();
    }

    for (const event of this.physics.update(boundedDelta)) {
      this.applyPhysicsEvent(event.type, event.id);
    }

    for (const finished of this.renderer.updateEffects(boundedDelta)) {
      const removed = this.physics.removeLetter(finished.id);
      if (!removed) continue;
      const completed = this.core.completeRemoval(finished.id, this.now());
      this.applyCompletedRemoval(completed);
    }

    const states = this.physics.getLetterStates();
    this.renderer.render(states);
    this.checkDangerLine(states);
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancelFrame();
    this.physics.destroy();
    this.listeners.clear();
    this.disposed = true;
  }

  snapshot(): GameRuntimeSnapshot {
    return {
      runState: this.runState,
      score: this.score,
      combo: this.combo,
      bestCombo: this.bestCombo,
      removedCount: this.removedCount,
      playTimeMs: this.playTimeMs,
      activeLetterCount: this.physics.getLetterStates().length,
      lockedSymbol: this.core.snapshot().inputLock.lockedSymbol,
      lastMessage: this.lastMessage,
    };
  }

  private scheduleFrame(): void {
    this.frameHandle = this.requestFrame((frameAt) => {
      this.frameHandle = null;
      const deltaMs = this.previousFrameAt === null ? 1000 / 60 : frameAt - this.previousFrameAt;
      this.previousFrameAt = frameAt;
      this.advance(deltaMs);
      if (this.runState === "RUNNING") this.scheduleFrame();
    });
  }

  private cancelFrame(): void {
    if (this.frameHandle === null) return;
    this.cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
  }

  private spawnLetter(): void {
    if (this.symbols.length === 0) {
      this.lastMessage = "No playable symbols are configured.";
      this.publish();
      return;
    }
    const symbol = this.symbols[Math.floor(this.random() * this.symbols.length)] ?? this.symbols[0];
    const id = `letter-${this.nextLetterId}`;
    this.nextLetterId += 1;
    const preferredX = this.config.spawnHorizontalPadding
      + this.random() * Math.max(0, this.boardWidth - this.config.spawnHorizontalPadding * 2);
    const x = chooseDistributedSpawnX(
      this.physics.getLetterStates(),
      this.boardWidth,
      this.boardHeight,
      this.config.letterHeight,
      preferredX / this.boardWidth,
    );
    this.physics.createLetter({
      id,
      symbol,
      x,
      y: -this.config.spawnTopPadding,
      angularVelocity: (this.random() - 0.5) * 0.025,
    });
    this.core.spawnLetter(id, symbol, this.now());
    this.updateRendererTarget();
    this.lastMessage = `${symbol} spawned.`;
    this.publish();
  }

  private applyPhysicsEvent(type: "LETTER_SETTLED" | "LETTER_MOVED", id: string): void {
    if (type === "LETTER_SETTLED") {
      const letter = this.core.getLetter(id);
      if (letter?.state === "FALLING") {
        this.core.settleLetter(id, this.now());
        this.updateRendererTarget();
        this.lastMessage = `${letter.symbol} settled.`;
        this.publish();
      }
      return;
    }

    const resumed = this.core.resumeLetter(id, this.now());
    if (resumed) {
      this.updateRendererTarget();
      this.lastMessage = `${resumed.letter.symbol} is falling again.`;
      this.publish();
    }
  }

  private applyCompletedRemoval(event: Extract<GameEvent, { readonly type: "LETTER_REMOVED" }>): void {
    this.applyScoreSnapshot(this.scoreTracker.recordRemoval());
    this.updateRendererTarget();
    this.lastMessage = `${event.letter.symbol} removed. Combo ${this.combo}.`;
    this.publish();
  }

  private applyScoreSnapshot(score: { readonly score: number; readonly combo: number; readonly bestCombo: number; readonly removedCount: number }): void {
    this.score = score.score;
    this.combo = score.combo;
    this.bestCombo = score.bestCombo;
    this.removedCount = score.removedCount;
  }

  private updateRendererTarget(): void {
    const allowed = new Set(this.symbols);
    const target = this.core.snapshot().letters
      .filter((letter) => allowed.has(letter.symbol) && (letter.state === "FALLING" || letter.state === "SETTLED"))
      .sort((left, right) => left.spawnedAt - right.spawnedAt)[0];
    this.renderer.setTarget(target?.id ?? null);
  }

  private checkDangerLine(states: readonly PhysicsLetterState[]): void {
    const dangerLineY = this.boardHeight * (this.config.dangerLineY / this.config.boardHeight);
    const danger = states.some((state) => (
      state.settled && state.y - this.config.letterHeight / 2 <= dangerLineY
    ));
    if (!danger) return;
    this.runState = "GAME_OVER";
    this.cancelFrame();
    this.lastMessage = "Danger line reached.";
    this.publish();
  }

  private publish(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("GameRuntime has been disposed.");
  }
}
