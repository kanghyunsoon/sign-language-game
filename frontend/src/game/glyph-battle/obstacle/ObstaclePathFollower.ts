import type { JamoObstacleTemplate } from "./JamoObstacleTemplate";
import { ObstaclePathSampler } from "./ObstaclePathSampler";

export interface ObstacleBounds { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface ObstaclePathPosition { readonly x: number; readonly y: number; readonly rotation: number; readonly completed: boolean }
export interface ObstaclePathFollower {
  start(options: { readonly template: JamoObstacleTemplate; readonly startedAt: number; readonly durationMs: number; readonly obstacleBounds: ObstacleBounds }): void;
  getPosition(now: number): ObstaclePathPosition;
  cancel(): void;
  dispose(): void;
}

export class TimeBasedObstaclePathFollower implements ObstaclePathFollower {
  private active: { readonly template: JamoObstacleTemplate; readonly startedAt: number; readonly durationMs: number; bounds: ObstacleBounds } | null = null;
  private disposed = false;
  constructor(private readonly sampler = new ObstaclePathSampler()) {}

  start(options: { readonly template: JamoObstacleTemplate; readonly startedAt: number; readonly durationMs: number; readonly obstacleBounds: ObstacleBounds }): void {
    this.assertActive();
    if (options.durationMs <= 0) throw new RangeError("Traversal duration must be positive.");
    this.active = { template: options.template, startedAt: options.startedAt, durationMs: options.durationMs, bounds: options.obstacleBounds };
  }
  resize(obstacleBounds: ObstacleBounds): void { this.assertActive(); if (this.active) this.active.bounds = obstacleBounds; }
  getPosition(now: number): ObstaclePathPosition {
    this.assertActive();
    if (!this.active) throw new Error("Obstacle path follower has not started.");
    const progress = Math.min(1, Math.max(0, (now - this.active.startedAt) / this.active.durationMs));
    const sampled = this.sampler.sample(this.active.template.normalizedPath, progress);
    return { x: this.active.bounds.x + sampled.x * this.active.bounds.width, y: this.active.bounds.y + sampled.y * this.active.bounds.height, rotation: sampled.rotation, completed: progress >= 1 };
  }
  cancel(): void { this.assertActive(); this.active = null; }
  dispose(): void { if (this.disposed) return; this.active = null; this.disposed = true; }
  private assertActive(): void { if (this.disposed) throw new Error("Obstacle path follower has been disposed."); }
}
