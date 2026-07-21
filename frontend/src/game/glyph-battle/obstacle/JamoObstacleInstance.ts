import type { JamoObstacleTemplate } from "./JamoObstacleTemplate";
import { JamoObstacleStateMachine, type LocalJamoObstacleState } from "./JamoObstacleStateMachine";

export interface LocalJamoObstacleSnapshot {
  readonly obstacleId: string;
  readonly templateId: string;
  readonly symbol: string;
  readonly targetPlayerId: string;
  readonly coursePosition: number;
  readonly state: LocalJamoObstacleState;
  readonly penaltyMs: number;
  readonly fallDurationMs: number;
  readonly warningStartedAt: number;
  readonly warningEndsAt: number;
  readonly fallingStartedAt?: number;
  readonly activatedAt?: number;
  readonly traversalStartedAt?: number;
  readonly traversalEndsAt?: number;
  readonly removingStartedAt?: number;
  readonly fallProgress: number;
  readonly removalProgress: number;
}

export class JamoObstacleInstance {
  private readonly machine = new JamoObstacleStateMachine();
  private fallingStartedAt?: number;
  private activatedAt?: number;
  private counteredAt?: number;
  private traversalStartedAt?: number;
  private traversalEndsAt?: number;
  private traversedAt?: number;
  private removingStartedAt?: number;

  constructor(
    readonly obstacleId: string,
    readonly template: JamoObstacleTemplate,
    readonly targetPlayerId: string,
    readonly coursePosition: number,
    readonly warningStartedAt: number,
    readonly warningDurationMs: number,
    readonly removalDurationMs: number,
  ) {
    this.machine.transition("WARNING");
  }

  get state(): LocalJamoObstacleState { return this.machine.getState(); }
  get warningEndsAt(): number { return this.warningStartedAt + this.warningDurationMs; }

  update(now: number): void {
    if (this.state === "WARNING" && now >= this.warningEndsAt) {
      this.machine.transition("FALLING");
      this.fallingStartedAt = this.warningEndsAt;
    }
    if (this.state === "FALLING" && this.fallingStartedAt !== undefined && now >= this.fallingStartedAt + this.template.fallDurationMs) {
      this.machine.transition("ACTIVE");
      this.activatedAt = this.fallingStartedAt + this.template.fallDurationMs;
    }
    if (this.state === "TRAVERSING" && this.traversalEndsAt !== undefined && now >= this.traversalEndsAt) {
      this.machine.transition("TRAVERSED");
      this.traversedAt = this.traversalEndsAt;
    } else if (this.state === "TRAVERSED" && this.traversedAt !== undefined && now > this.traversedAt) {
      this.beginRemoving(this.traversedAt);
    }
    if (this.state === "COUNTERED" && this.counteredAt !== undefined && now >= this.counteredAt + 180) this.beginRemoving(this.counteredAt + 180);
    if (this.state === "REMOVING" && this.removingStartedAt !== undefined && now >= this.removingStartedAt + this.removalDurationMs) {
      this.machine.transition("REMOVED");
    }
  }

  counter(now: number): void {
    if (!["WARNING", "FALLING", "ACTIVE"].includes(this.state)) throw new Error(`Obstacle ${this.obstacleId} is not counterable while ${this.state}.`);
    this.machine.transition("COUNTERED");
    this.counteredAt = now;
  }

  startTraversal(now: number): void {
    if (this.state !== "ACTIVE") throw new Error(`Obstacle ${this.obstacleId} cannot traverse while ${this.state}.`);
    this.machine.transition("TRAVERSING");
    this.traversalStartedAt = now;
    this.traversalEndsAt = now + this.template.penaltyMs;
  }

  remove(now: number): void {
    if (this.state === "REMOVED" || this.state === "REMOVING") return;
    if (this.state === "TRAVERSING") throw new Error("A traversing obstacle cannot be removed before traversal finishes.");
    this.beginRemoving(now);
  }

  snapshot(now: number): LocalJamoObstacleSnapshot {
    const fallProgress = this.fallingStartedAt === undefined ? 0 : Math.min(1, Math.max(0, (now - this.fallingStartedAt) / this.template.fallDurationMs));
    const removalProgress = this.removingStartedAt === undefined ? 0 : Math.min(1, Math.max(0, (now - this.removingStartedAt) / this.removalDurationMs));
    return {
      obstacleId: this.obstacleId, templateId: this.template.templateId, symbol: this.template.symbol,
      targetPlayerId: this.targetPlayerId, coursePosition: this.coursePosition, state: this.state,
      penaltyMs: this.template.penaltyMs, fallDurationMs: this.template.fallDurationMs,
      warningStartedAt: this.warningStartedAt, warningEndsAt: this.warningEndsAt,
      ...(this.fallingStartedAt === undefined ? {} : { fallingStartedAt: this.fallingStartedAt }),
      ...(this.activatedAt === undefined ? {} : { activatedAt: this.activatedAt }),
      ...(this.traversalStartedAt === undefined ? {} : { traversalStartedAt: this.traversalStartedAt }),
      ...(this.traversalEndsAt === undefined ? {} : { traversalEndsAt: this.traversalEndsAt }),
      ...(this.removingStartedAt === undefined ? {} : { removingStartedAt: this.removingStartedAt }),
      fallProgress, removalProgress,
    };
  }

  private beginRemoving(now: number): void {
    this.machine.transition("REMOVING");
    this.removingStartedAt = now;
  }
}
