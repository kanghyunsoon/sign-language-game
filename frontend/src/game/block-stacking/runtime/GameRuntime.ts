import { RemovalSystem } from "../core/RemovalSystem";
import { DEFAULT_GAME_CONFIG, type GameConfig, type GameEvent } from "../core/types";
import type { PhysicsLetterState, PhysicsWorld } from "../physics/types";
import type { GameRenderer } from "../render/types";
import { ScoreTracker } from "../scoring/ScoreTracker";
import { DEFAULT_SCORING_CONFIG, type ScoringConfig } from "../scoring/types";
import {
  DEFAULT_SOLO_GAME_CONFIG,
  type GameRuntimeListener,
  type GameRuntimeOptions,
  type GameRuntimeSnapshot,
  type GameRunState,
  type SoloGameConfig,
} from "./types";
import { settledTowerHeightRatio } from "./towerHeight";

const MAX_FRAME_DELTA_MS = 32;
// Matter is not created while the paper glyph is visible. The block comes
// alive only after that one glyph has fully reached its final size.
const PAPER_GROW_DURATION_MS = 760;
// Keep a fresh paper target in its normal state for a few painted frames.
// A confirmation may already be in flight when the first round starts; if it
// releases in that same render, the first glyph appears to burst instantly.
const PAPER_TARGET_ARM_DURATION_MS = 80;
// The general physics settlement window is intentionally long so letters can
// keep rolling. At the finish line we only need a short, continuous stillness
// window to know that the stack will not fall away again.
const DANGER_STABLE_DURATION_MS = 320;
const DANGER_LINEAR_SPEED_THRESHOLD = 0.05;
const DANGER_ANGULAR_SPEED_THRESHOLD = 0.005;
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
  private lastRemovalAt: number | null = null;
  private readonly newlySettledIds = new Set<string>();
  private readonly dangerStableDurationById = new Map<string, number>();
  private symbolWeights: Readonly<Record<string, number>> = {};
  private lastPickedSymbol: string | null = null;
  private queuedSymbol: string | null = null;
  private queuedSymbolArmRemainingMs = 0;
  private paperBurstVersion = 0;
  private paperBurstSymbol: string | null = null;
  private pendingPaperDrop: { readonly symbol: string; remainingMs: number } | null = null;
  private paperReleaseLetterId: string | null = null;
  private settledTowerHeightRatio = 0;
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
    // In manual-drop mode the first letter lives on the otter's paper, not in
    // the physics world. Matching it is what releases the actual falling block.
    if (!this.config.autoDropEnabled && this.queuedSymbol === null) this.queueNextSymbol();
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
    this.lastRemovalAt = null;
    this.newlySettledIds.clear();
    this.dangerStableDurationById.clear();
    this.lastPickedSymbol = null;
    this.queuedSymbol = null;
    this.queuedSymbolArmRemainingMs = 0;
    this.paperBurstSymbol = null;
    this.paperBurstVersion = 0;
    this.pendingPaperDrop = null;
    this.paperReleaseLetterId = null;
    this.settledTowerHeightRatio = 0;
    this.lastMessage = "Game reset. Press start when ready.";
    this.publish();
  }

  submitSymbol(symbol: string): void {
    this.assertActive();
    if (this.runState !== "RUNNING" || !this.symbols.includes(symbol)) return;

    if (!this.config.autoDropEnabled) {
      if (this.queuedSymbol !== symbol) return;
      if (this.queuedSymbolArmRemainingMs > 0) {
        this.lastMessage = `${symbol} ignored until the fresh paper target is ready.`;
        this.publish();
        return;
      }
      this.releaseQueuedSymbol();
      return;
    }

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
    if (!this.config.autoDropEnabled && this.queuedSymbol === symbol) return true;
    return this.core.snapshot().letters.some((letter) => (
      letter.symbol === symbol && (letter.state === "FALLING" || letter.state === "SETTLED")
    ));
  }

  /** Returns the oldest playable letter so the UI can give the player a concrete sign to make. */
  getPreferredTargetSymbol(allowedSymbols: readonly string[]): string | null {
    const allowed = new Set(allowedSymbols);
    if (allowed.size === 0) return null;
    if (!this.config.autoDropEnabled) {
      return this.queuedSymbol !== null && allowed.has(this.queuedSymbol)
        ? this.queuedSymbol
        : null;
    }

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
    if (this.lastPickedSymbol !== null && !this.symbols.includes(this.lastPickedSymbol)) {
      this.lastPickedSymbol = null;
    }
    this.updateRendererTarget();
  }

  setSymbolWeights(weights: Readonly<Record<string, number>>): void {
    this.assertActive();
    this.symbolWeights = { ...weights };
  }

  /** Public for deterministic tests; browser play advances through requestAnimationFrame. */
  advance(deltaMs: number): void {
    this.assertActive();
    if (this.runState !== "RUNNING") return;
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) throw new RangeError("deltaMs must be a positive finite number.");

    const boundedDelta = Math.min(deltaMs, MAX_FRAME_DELTA_MS);
    // The play clock follows real elapsed time. Physics stays capped so a
    // delayed frame cannot destabilise Matter, but the clock must never lose
    // time when camera/AI work makes one animation frame arrive late.
    this.playTimeMs += deltaMs;
    this.advancePaperTargetArming(boundedDelta);
    this.advancePaperDrop(boundedDelta);
    if (this.config.autoDropEnabled) {
      this.spawnElapsedMs += boundedDelta;
      while (this.spawnElapsedMs >= this.config.spawnIntervalMs) {
        this.spawnElapsedMs -= this.config.spawnIntervalMs;
        this.spawnLetter();
      }

    }

    // Manual mode disables timer spawning only. A letter released from the
    // paper must still use the same physics path as every other falling block.
    const fallSpeedMultiplier = 3 + Math.floor(this.score / 5_000) * .5;
    for (const event of this.physics.update(boundedDelta * fallSpeedMultiplier)) {
      if (event.type === "LETTER_SETTLED") this.newlySettledIds.add(event.id);
      if (event.type === "LETTER_MOVED") this.newlySettledIds.delete(event.id);
      this.applyPhysicsEvent(event.type, event.id);
    }

    for (const finished of this.renderer.updateEffects(boundedDelta)) {
      const removed = this.physics.removeLetter(finished.id);
      if (!removed) continue;
      const completed = this.core.completeRemoval(finished.id, this.now());
      this.applyCompletedRemoval(completed);
    }

    const states = this.physics.getLetterStates();
    this.settledTowerHeightRatio = settledTowerHeightRatio(this.settledTowerHeightRatio, states, this.boardHeight, this.config.dangerLineY, this.config.letterHeight);
    this.updatePaperRelease(states);
    this.renderer.render(states);
    this.checkDangerLine(states, boundedDelta);
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancelFrame();
    this.physics.destroy();
    this.listeners.clear();
    this.disposed = true;
  }

  snapshot(): GameRuntimeSnapshot {
    const states = this.physics.getLetterStates();
    return {
      runState: this.runState,
      score: this.score,
      combo: this.combo,
      bestCombo: this.bestCombo,
      removedCount: this.removedCount,
      playTimeMs: this.playTimeMs,
      activeLetterCount: states.length,
      towerHeightRatio: this.settledTowerHeightRatio,
      lockedSymbol: this.core.snapshot().inputLock.lockedSymbol,
      queuedSymbol: this.queuedSymbol,
      paperBurstVersion: this.paperBurstVersion,
      paperBurstSymbol: this.paperBurstSymbol,
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

  private spawnLetter(selectedSymbol?: string): string | null {
    if (this.symbols.length === 0) {
      this.lastMessage = "No playable symbols are configured.";
      this.publish();
      return null;
    }
    const symbol = selectedSymbol ?? this.pickRandomSymbol();
    const x = this.boardWidth / 2;
    const releasedFromPaper = selectedSymbol !== undefined && !this.config.autoDropEnabled;
    const id = `letter-${this.nextLetterId}`;
    this.nextLetterId += 1;
    this.physics.createLetter({
      id,
      symbol,
      x,
      // Physics starts exactly where the fully-grown paper glyph is centred.
      // It must not exist before this hand-off, otherwise it is visible behind
      // the paper while the foreground glyph is still animating.
      // The paper glyph's measured centre is 35% of one letter-height below
      // the board's top edge. Spawn the Matter body at that exact centre so
      // enabling physics never jumps the glyph below/behind the paper.
      y: releasedFromPaper ? this.config.letterHeight * 0.35 : -this.config.spawnTopPadding,
      angularVelocity: 0,
      // Start the ordinary Matter fall here; never add a visual jump.
      velocityY: releasedFromPaper ? 0 : undefined,
    });
    this.core.spawnLetter(id, symbol, this.now());
    if (releasedFromPaper) this.renderer.startSpawnEffect(id);
    this.updateRendererTarget();
    this.lastMessage = `${symbol} spawned.`;
    this.publish();
    return id;
  }

  private pickRandomSymbol(): string {
    const candidates = this.symbols.length > 1
      ? this.symbols.filter((symbol) => symbol !== this.lastPickedSymbol)
      : this.symbols;
    const weightedCandidates = candidates.map((symbol) => {
      const configuredWeight = this.symbolWeights[symbol];
      return {
        symbol,
        weight: Number.isFinite(configuredWeight) && configuredWeight > 0 ? configuredWeight : 1,
      };
    });
    const totalWeight = weightedCandidates.reduce((sum, candidate) => sum + candidate.weight, 0);
    let cursor = this.random() * totalWeight;
    let selected = weightedCandidates.at(-1)?.symbol ?? this.symbols[0];

    for (const candidate of weightedCandidates) {
      cursor -= candidate.weight;
      if (cursor < 0) {
        selected = candidate.symbol;
        break;
      }
    }
    this.lastPickedSymbol = selected;
    return selected;
  }

  private queueNextSymbol(): void {
    if (this.symbols.length === 0) return;
    this.queuedSymbol = this.pickRandomSymbol();
    this.queuedSymbolArmRemainingMs = PAPER_TARGET_ARM_DURATION_MS;
  }

  private advancePaperTargetArming(deltaMs: number): void {
    if (this.queuedSymbol === null || this.queuedSymbolArmRemainingMs <= 0) return;
    this.queuedSymbolArmRemainingMs = Math.max(0, this.queuedSymbolArmRemainingMs - deltaMs);
  }

  private releaseQueuedSymbol(): void {
    const symbol = this.queuedSymbol;
    if (symbol === null) return;

    this.queuedSymbol = null;
    this.queuedSymbolArmRemainingMs = 0;
    this.paperBurstSymbol = symbol;
    this.paperBurstVersion += 1;
    this.pendingPaperDrop = { symbol, remainingMs: PAPER_GROW_DURATION_MS };
    this.lastMessage = `${symbol} is growing on the otter paper.`;
    this.publish();
  }

  private advancePaperDrop(deltaMs: number): void {
    const pending = this.pendingPaperDrop;
    if (pending === null) return;
    pending.remainingMs -= deltaMs;
    if (pending.remainingMs > 0) return;

    // The physical body is born exactly at the paper glyph's final centre.
    // Its visible glyph is already in the board's front-only letter layer,
    // so there is no second copy behind the paper and no hand-off jump.
    this.paperReleaseLetterId = this.spawnLetter(pending.symbol);
    this.pendingPaperDrop = null;
    this.paperBurstSymbol = null;
    this.lastMessage = `${pending.symbol} dropped from the otter paper.`;
    this.publish();
  }

  private updatePaperRelease(states: readonly PhysicsLetterState[]): void {
    if (this.paperReleaseLetterId === null) return;
    const released = states.find((letter) => letter.id === this.paperReleaseLetterId);
    // Keep the paper empty until the same physical glyph has cleared it.
    // This prevents the next target from appearing underneath the falling
    // glyph and looking like a second, rear-layer copy.
    // Usually the next target appears after the released glyph has cleared the
    // paper. Near the end of a round, however, a tall but still-safe stack can
    // stop the glyph just above that clearance point. A settled glyph is no
    // longer covering the paper, so it must not block the next target forever.
    if (released && !released.settled && released.y < this.config.letterHeight * 1.15) return;
    this.paperReleaseLetterId = null;
    this.queueNextSymbol();
    this.lastMessage = "Next paper letter is ready.";
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
    const now = this.now();
    const comboWindowMs = Math.max(1_500, 5_000 - this.combo * 250);
    if (this.lastRemovalAt !== null && now - this.lastRemovalAt > comboWindowMs) {
      this.applyScoreSnapshot(this.scoreTracker.resetCombo());
    }
    this.applyScoreSnapshot(this.scoreTracker.recordRemoval());
    this.lastRemovalAt = now;
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
    if (!this.config.autoDropEnabled) {
      this.renderer.setTarget(null);
      return;
    }
    const allowed = new Set(this.symbols);
    const target = this.core.snapshot().letters
      .filter((letter) => allowed.has(letter.symbol) && (letter.state === "FALLING" || letter.state === "SETTLED"))
      .sort((left, right) => left.spawnedAt - right.spawnedAt)[0];
    this.renderer.setTarget(target?.id ?? null);
  }

  private checkDangerLine(states: readonly PhysicsLetterState[], deltaMs: number): void {
    const dangerLineY = this.boardHeight * (this.config.dangerLineY / this.config.boardHeight);
    const visibleHalfHeight = this.config.letterHeight * 0.32;
    const activeDangerIds = new Set<string>();
    let danger = false;

    for (const state of states) {
      if (state.y - visibleHalfHeight > dangerLineY) continue;
      activeDangerIds.add(state.id);

      if (this.newlySettledIds.has(state.id) && state.settled) {
        danger = true;
        break;
      }

      const isNearlyStill = Math.hypot(state.velocityX, state.velocityY) <= DANGER_LINEAR_SPEED_THRESHOLD
        && Math.abs(state.angularVelocity) <= DANGER_ANGULAR_SPEED_THRESHOLD;
      if (!isNearlyStill) {
        this.dangerStableDurationById.delete(state.id);
        continue;
      }

      const stableDuration = (this.dangerStableDurationById.get(state.id) ?? 0) + deltaMs;
      this.dangerStableDurationById.set(state.id, stableDuration);
      if (stableDuration >= DANGER_STABLE_DURATION_MS) {
        danger = true;
        break;
      }
    }

    for (const id of this.dangerStableDurationById.keys()) {
      if (!activeDangerIds.has(id)) this.dangerStableDurationById.delete(id);
    }
    this.newlySettledIds.clear();
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
