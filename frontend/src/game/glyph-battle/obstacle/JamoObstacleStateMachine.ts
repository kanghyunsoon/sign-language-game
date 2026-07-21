export type LocalJamoObstacleState =
  | "CREATED" | "WARNING" | "FALLING" | "ACTIVE" | "COUNTERED"
  | "TRAVERSING" | "TRAVERSED" | "REMOVING" | "REMOVED";

const TRANSITIONS: Readonly<Record<LocalJamoObstacleState, readonly LocalJamoObstacleState[]>> = {
  CREATED: ["WARNING"],
  WARNING: ["FALLING", "COUNTERED", "REMOVING"],
  FALLING: ["ACTIVE", "COUNTERED", "REMOVING"],
  ACTIVE: ["COUNTERED", "TRAVERSING", "REMOVING"],
  COUNTERED: ["REMOVING"],
  TRAVERSING: ["TRAVERSED"],
  TRAVERSED: ["REMOVING"],
  REMOVING: ["REMOVED"],
  REMOVED: [],
};

export class JamoObstacleStateMachine {
  constructor(private state: LocalJamoObstacleState = "CREATED") {}
  getState(): LocalJamoObstacleState { return this.state; }
  transition(next: LocalJamoObstacleState): void {
    if (!TRANSITIONS[this.state].includes(next)) throw new Error(`Invalid obstacle transition: ${this.state} -> ${next}`);
    this.state = next;
  }
}
