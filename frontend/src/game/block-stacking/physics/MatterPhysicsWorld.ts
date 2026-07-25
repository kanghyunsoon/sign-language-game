import { Bodies, Body as MatterBody, Engine, Sleeping, World, type Body, type Engine as MatterEngine } from "matter-js";

import { LetterBodyFactory } from "./LetterBodyFactory";
import { SettlementDetector } from "./SettlementDetector";
import {
  DEFAULT_PHYSICS_CONFIG,
  type LetterBodySpec,
  type PhysicsConfig,
  type PhysicsEvent,
  type PhysicsLetterState,
  type PhysicsWorld,
} from "./types";

interface LetterBodyRecord {
  readonly id: string;
  readonly symbol: string;
  readonly body: Body;
}

// Matter warns and becomes less stable above a 60 Hz step. A frame that lands
// around 17-20 ms must therefore be split instead of being forwarded whole.
const MAX_PHYSICS_STEP_MS = 1000 / 60;

export class MatterPhysicsWorld implements PhysicsWorld {
  private readonly engine: MatterEngine;
  private readonly factory: LetterBodyFactory;
  private readonly settlementDetector: SettlementDetector;
  private readonly letters = new Map<string, LetterBodyRecord>();
  private readonly activeLetterIds = new Set<string>();
  private readonly pendingMovedIds = new Set<string>();
  private boundaries: Body[];
  private width: number;
  private height: number;
  private destroyed = false;

  constructor(private readonly config: PhysicsConfig = DEFAULT_PHYSICS_CONFIG) {
    this.engine = Engine.create({ enableSleeping: true, gravity: { x: 0, y: config.gravityY, scale: 0.001 } });
    this.engine.positionIterations = 5;
    this.engine.velocityIterations = 3;
    this.engine.constraintIterations = 1;
    this.factory = new LetterBodyFactory(config);
    this.settlementDetector = new SettlementDetector(config);
    this.width = config.width;
    this.height = config.height;
    this.boundaries = this.createBoundaries(this.width, this.height);
    World.add(this.engine.world, this.boundaries);
  }

  createLetter(spec: LetterBodySpec): PhysicsLetterState {
    this.assertActive();
    if (this.letters.has(spec.id)) throw new Error(`Physics letter already exists: ${spec.id}`);
    const body = this.factory.create(spec);
    const record: LetterBodyRecord = { id: spec.id, symbol: spec.symbol, body };
    this.letters.set(spec.id, record);
    this.activeLetterIds.add(spec.id);
    World.add(this.engine.world, body);
    return this.toState(record);
  }

  resize(width: number, height: number): void {
    this.assertActive();
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new RangeError("Physics dimensions must be finite positive numbers");
    }
    if (width === this.width && height === this.height) return;

    const previousWidth = this.width;
    const previousHeight = this.height;
    const horizontalScale = width / previousWidth;
    const halfLetter = this.config.letterWidth / 2;
    for (const record of this.letters.values()) {
      const nextX = Math.max(halfLetter, Math.min(width - halfLetter, record.body.position.x * horizontalScale));
      const distanceFromFloor = previousHeight - record.body.position.y;
      const nextY = height - distanceFromFloor;
      MatterBody.translate(record.body, { x: nextX - record.body.position.x, y: nextY - record.body.position.y });
      this.settlementDetector.remove(record.id);
      this.pendingMovedIds.add(record.id);
      this.activeLetterIds.add(record.id);
      if (record.body.isStatic) MatterBody.setStatic(record.body, false);
      Sleeping.set(record.body, false);
    }
    for (const boundary of this.boundaries) World.remove(this.engine.world, boundary);
    this.width = width;
    this.height = height;
    this.boundaries = this.createBoundaries(width, height);
    World.add(this.engine.world, this.boundaries);
  }

  update(deltaMs: number): readonly PhysicsEvent[] {
    this.assertActive();
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) throw new RangeError("deltaMs must be a positive finite number");
    const activeRecords = [...this.activeLetterIds]
      .map((id) => this.letters.get(id))
      .filter((record): record is LetterBodyRecord => record !== undefined && !record.body.isStatic);
    if (activeRecords.some(({ body }) => !body.isSleeping)) {
      const stepCount = Math.max(1, Math.ceil(deltaMs / MAX_PHYSICS_STEP_MS));
      const stepMs = deltaMs / stepCount;
      for (let step = 0; step < stepCount; step += 1) {
        Engine.update(this.engine, stepMs);
        this.capFallSpeed(activeRecords);
      }
    }
    const settlement = this.settlementDetector.update(
      activeRecords.map((record) => ({
        id: record.id,
        linearSpeed: record.body.speed,
        angularSpeed: Math.abs(record.body.angularSpeed),
      })),
      deltaMs,
    );
    if (this.config.freezeSettledBodies) {
      for (const id of settlement.newlySettledIds) {
        const body = this.letters.get(id)?.body;
        if (!body) continue;
        MatterBody.setVelocity(body, { x: 0, y: 0 });
        MatterBody.setAngularVelocity(body, 0);
        MatterBody.setStatic(body, true);
        this.activeLetterIds.delete(id);
      }
    }
    const movedIds = [...new Set([...this.pendingMovedIds, ...settlement.movedIds])];
    this.pendingMovedIds.clear();
    return [
      ...settlement.newlySettledIds.map((id) => ({ type: "LETTER_SETTLED" as const, id })),
      ...movedIds.map((id) => ({ type: "LETTER_MOVED" as const, id })),
    ];
  }

  getLetterState(id: string): PhysicsLetterState | undefined {
    const record = this.letters.get(id);
    return record ? this.toState(record) : undefined;
  }

  getLetterStates(): readonly PhysicsLetterState[] {
    return [...this.letters.values()].map((record) => this.toState(record));
  }

  removeLetter(id: string): boolean {
    const record = this.letters.get(id);
    if (!record) return false;
    const removedY = record.body.position.y;
    World.remove(this.engine.world, record.body);
    this.letters.delete(id);
    this.activeLetterIds.delete(id);
    this.settlementDetector.remove(id);
    for (const remaining of this.letters.values()) {
      if (remaining.body.position.y >= removedY || !this.settlementDetector.isSettled(remaining.id)) continue;
      this.settlementDetector.remove(remaining.id);
      this.pendingMovedIds.add(remaining.id);
      this.activeLetterIds.add(remaining.id);
      if (remaining.body.isStatic) {
        MatterBody.setStatic(remaining.body, false);
      }
      Sleeping.set(remaining.body, false);
    }
    return true;
  }

  clear(): void {
    for (const id of [...this.letters.keys()]) this.removeLetter(id);
    this.settlementDetector.clear();
    this.pendingMovedIds.clear();
    this.activeLetterIds.clear();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.clear();
    World.clear(this.engine.world, false);
    Engine.clear(this.engine);
    this.destroyed = true;
  }

  private createBoundaries(width: number, height: number): Body[] {
    const { wallThickness } = this.config;
    const half = wallThickness / 2;
    return [
      Bodies.rectangle(width / 2, height + half, width + wallThickness * 2, wallThickness, { isStatic: true, label: "boundary:floor" }),
      Bodies.rectangle(-half, height / 2, wallThickness, height + wallThickness * 2, { isStatic: true, label: "boundary:left" }),
      Bodies.rectangle(width + half, height / 2, wallThickness, height + wallThickness * 2, { isStatic: true, label: "boundary:right" }),
    ];
  }

  private capFallSpeed(records: readonly LetterBodyRecord[]): void {
    for (const record of records) {
      const { body } = record;
      if (!body.isStatic && body.velocity.y > this.config.maxFallSpeed) {
        MatterBody.setVelocity(body, { x: body.velocity.x, y: this.config.maxFallSpeed });
      }
    }
  }

  private toState(record: LetterBodyRecord): PhysicsLetterState {
    const { body } = record;
    return {
      id: record.id,
      symbol: record.symbol,
      x: body.position.x,
      y: body.position.y,
      angle: body.angle,
      velocityX: body.velocity.x,
      velocityY: body.velocity.y,
      angularVelocity: body.angularVelocity,
      settled: this.settlementDetector.isSettled(record.id),
    };
  }

  private assertActive(): void {
    if (this.destroyed) throw new Error("Physics world has been destroyed");
  }
}
