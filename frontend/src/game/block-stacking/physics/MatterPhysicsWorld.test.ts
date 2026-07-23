import { Engine } from "matter-js";
import { describe, expect, it, vi } from "vitest";

import { GAME_SYMBOLS } from "../../recognition/core/symbols";
import { getGlyphRasterMetrics } from "../glyphs/glyphRaster";
import { MatterPhysicsWorld } from "./MatterPhysicsWorld";
import { LetterBodyFactory } from "./LetterBodyFactory";
import { DEFAULT_PHYSICS_CONFIG, type PhysicsConfig } from "./types";

const TEST_CONFIG: PhysicsConfig = {
  ...DEFAULT_PHYSICS_CONFIG,
  width: 360,
  height: 420,
  wallThickness: 30,
  letterWidth: 42,
  letterHeight: 42,
  letterColliderPadding: 0,
  frictionAir: 0.04,
  restitution: 0,
  settleDurationMs: 80,
  linearVelocityThreshold: 0.12,
  angularVelocityThreshold: 0.03,
};

function advance(world: MatterPhysicsWorld, frames: number): void {
  for (let index = 0; index < frames; index += 1) world.update(1000 / 60);
}

describe("MatterPhysicsWorld", () => {
  it("creates every game symbol with a registered tight collider", () => {
    expect(GAME_SYMBOLS.every((symbol) => getGlyphRasterMetrics(symbol).inkWidth > 0)).toBe(true);
    const world = new MatterPhysicsWorld(TEST_CONFIG);
    GAME_SYMBOLS.forEach((symbol, index) => world.createLetter({
      id: `letter-${index}`, symbol, x: 20 + (index % 8) * 40, y: 20 + Math.floor(index / 8) * 40,
    }));
    expect(world.getLetterStates()).toHaveLength(40);
    expect(world.getLetterState("letter-39")?.symbol).toBe("9");
    world.destroy();
  });

  it("uses a small number of long stroke colliders for Korean glyphs", () => {
    const factory = new LetterBodyFactory(TEST_CONFIG);
    const giyeok = factory.create({ id: "giyeok", symbol: "\u3131", x: 100, y: 100 });
    const siot = factory.create({ id: "siot", symbol: "\u3145", x: 100, y: 100 });
    const digit = factory.create({ id: "digit", symbol: "1", x: 100, y: 100 });
    expect(giyeok.parts).toHaveLength(3);
    expect(siot.parts).toHaveLength(3);
    expect(digit.parts).toHaveLength(1);
    expect(giyeok.bounds.max.x - giyeok.bounds.min.x).toBeLessThanOrEqual(TEST_CONFIG.letterWidth);
    expect(siot.bounds.max.x - siot.bounds.min.x).toBeLessThanOrEqual(TEST_CONFIG.letterWidth);
  });

  it("applies the same visible spacing around every Korean glyph collider", () => {
    const tightFactory = new LetterBodyFactory({ ...TEST_CONFIG, letterColliderPadding: 0 });
    const spacedFactory = new LetterBodyFactory({ ...TEST_CONFIG, letterColliderPadding: 3 });
    const tight = tightFactory.create({ id: "tight", symbol: "\u3131", x: 100, y: 100 });
    const spaced = spacedFactory.create({ id: "spaced", symbol: "\u3131", x: 100, y: 100 });
    const tightWidth = tight.bounds.max.x - tight.bounds.min.x;
    const spacedWidth = spaced.bounds.max.x - spaced.bounds.min.x;

    expect(spacedWidth - tightWidth).toBeCloseTo(6, 4);
  });

  it("falls under gravity, rotates, and collides with the floor boundary", () => {
    const world = new MatterPhysicsWorld(TEST_CONFIG);
    world.createLetter({ id: "fall", symbol: "1", x: 180, y: 30, angularVelocity: 0.15 });
    const initial = world.getLetterState("fall");
    advance(world, 20);
    const falling = world.getLetterState("fall");
    expect(falling?.y).toBeGreaterThan(initial?.y ?? 0);
    expect(Math.abs(falling?.angle ?? 0)).toBeGreaterThan(0.01);
    advance(world, 360);
    const onFloor = world.getLetterState("fall");
    expect(onFloor?.y).toBeLessThan(TEST_CONFIG.height);
    world.destroy();
  });

  it("caps downward velocity for beginner-paced falling", () => {
    const world = new MatterPhysicsWorld({
      ...TEST_CONFIG,
      gravityY: 1,
      maxFallSpeed: 2,
    });
    world.createLetter({ id: "paced", symbol: "1", x: 180, y: 30 });
    advance(world, 30);
    expect(world.getLetterState("paced")?.velocityY).toBeLessThanOrEqual(2.001);
    world.destroy();
  });

  it("splits a dropped frame into short physics steps", () => {
    const updateSpy = vi.spyOn(Engine, "update");
    const world = new MatterPhysicsWorld(TEST_CONFIG);
    world.createLetter({ id: "active-step", symbol: "1", x: 180, y: 30 });

    world.update(50);

    expect(updateSpy).toHaveBeenCalledTimes(3);
    updateSpy.mockRestore();
    world.destroy();
  });

  it("skips Matter updates while every letter is frozen", () => {
    const world = new MatterPhysicsWorld({ ...TEST_CONFIG, freezeSettledBodies: true });
    world.createLetter({ id: "frozen", symbol: "1", x: 180, y: 30 });
    advance(world, 360);
    const updateSpy = vi.spyOn(Engine, "update");

    world.update(1000 / 60);

    expect(updateSpy).not.toHaveBeenCalled();
    updateSpy.mockRestore();
    world.destroy();
  });

  it("does not visibly pop upward after floor contact during dropped frames", () => {
    const world = new MatterPhysicsWorld(TEST_CONFIG);
    world.createLetter({ id: "floor-contact", symbol: "\u3141", x: 180, y: 30 });
    let previousY = world.getLetterState("floor-contact")?.y ?? 0;
    let largestUpwardCorrection = 0;

    for (let frame = 0; frame < 240; frame += 1) {
      world.update(frame % 4 === 0 ? 50 : 1000 / 60);
      const currentY = world.getLetterState("floor-contact")?.y ?? previousY;
      largestUpwardCorrection = Math.max(largestUpwardCorrection, previousY - currentY);
      previousY = currentY;
    }

    expect(largestUpwardCorrection).toBeLessThan(2);
    world.destroy();
  });

  it("keeps settled letters aligned with the floor when the viewport resizes", () => {
    const world = new MatterPhysicsWorld(TEST_CONFIG);
    world.createLetter({ id: "resize-floor", symbol: "\u3141", x: 180, y: 30 });
    advance(world, 360);
    const before = world.getLetterState("resize-floor");

    world.resize(TEST_CONFIG.width + 40, TEST_CONFIG.height - 60);
    const after = world.getLetterState("resize-floor");

    expect(after?.x ?? 0).toBeCloseTo((before?.x ?? 0) * ((TEST_CONFIG.width + 40) / TEST_CONFIG.width), 4);
    expect((after?.y ?? 0) - (before?.y ?? 0)).toBeCloseTo(-60, 4);
    world.destroy();
  });

  it("reactivates settled blocks after resize so compressed blocks can separate", () => {
    const world = new MatterPhysicsWorld(TEST_CONFIG);
    world.createLetter({ id: "resize-active", symbol: "ㅁ", x: 300, y: 30 });
    advance(world, 360);
    expect(world.getLetterState("resize-active")?.settled).toBe(true);

    world.resize(180, TEST_CONFIG.height);
    const events = world.update(1000 / 60);

    expect(world.getLetterState("resize-active")?.settled).toBe(false);
    expect(events).toContainEqual({ type: "LETTER_MOVED", id: "resize-active" });
    world.destroy();
  });

  it("stacks letters and lets an upper letter fall after lower removal", () => {
    const world = new MatterPhysicsWorld(TEST_CONFIG);
    world.createLetter({ id: "lower", symbol: "8", x: 180, y: 80 });
    advance(world, 300);
    world.createLetter({ id: "upper", symbol: "8", x: 180, y: 40 });
    advance(world, 300);
    const supportedY = world.getLetterState("upper")?.y ?? 0;
    expect(world.removeLetter("lower")).toBe(true);
    advance(world, 120);
    const fallenY = world.getLetterState("upper")?.y ?? 0;
    expect(fallenY).toBeGreaterThan(supportedY + 5);
    world.destroy();
  });

  it("keeps a settled lower letter motionless when another letter lands on it", () => {
    const world = new MatterPhysicsWorld({ ...TEST_CONFIG, freezeSettledBodies: true });
    world.createLetter({ id: "stable-lower", symbol: "8", x: 180, y: 80 });
    advance(world, 300);
    const settledPosition = world.getLetterState("stable-lower");
    world.createLetter({ id: "landing-upper", symbol: "8", x: 180, y: 40 });
    advance(world, 300);
    const afterCollision = world.getLetterState("stable-lower");

    expect(afterCollision?.x).toBeCloseTo(settledPosition?.x ?? 0, 6);
    expect(afterCollision?.y).toBeCloseTo(settledPosition?.y ?? 0, 6);
    expect(afterCollision?.angle).toBeCloseTo(settledPosition?.angle ?? 0, 6);
    world.destroy();
  });

  it("reports settlement after a body remains still long enough", () => {
    const world = new MatterPhysicsWorld(TEST_CONFIG);
    world.createLetter({ id: "settle", symbol: "ㄷ", x: 180, y: 60 });
    let sawSettlement = false;
    for (let index = 0; index < 480; index += 1) {
      sawSettlement ||= world.update(1000 / 60).some((event) => event.type === "LETTER_SETTLED" && event.id === "settle");
    }
    expect(sawSettlement).toBe(true);
    expect(world.getLetterState("settle")?.settled).toBe(true);
    world.destroy();
  });
});
