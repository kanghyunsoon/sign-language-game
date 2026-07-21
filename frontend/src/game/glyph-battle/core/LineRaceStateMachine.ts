export type LineRaceRuntimeState = "IDLE" | "COUNTDOWN" | "PLAYING" | "PAUSED" | "FINISHED";

const ALLOWED_TRANSITIONS: Readonly<Record<LineRaceRuntimeState, readonly LineRaceRuntimeState[]>> = {
  IDLE: ["COUNTDOWN"],
  COUNTDOWN: ["PLAYING", "PAUSED", "IDLE", "FINISHED"],
  PLAYING: ["PAUSED", "FINISHED", "IDLE"],
  PAUSED: ["COUNTDOWN", "PLAYING", "FINISHED", "IDLE"],
  FINISHED: ["IDLE", "COUNTDOWN"],
};

export class LineRaceStateMachine {
  private state: LineRaceRuntimeState = "IDLE";

  getState(): LineRaceRuntimeState {
    return this.state;
  }

  transition(next: LineRaceRuntimeState): void {
    if (next === this.state) return;
    if (!ALLOWED_TRANSITIONS[this.state].includes(next)) {
      throw new Error(`Invalid line-race transition: ${this.state} -> ${next}`);
    }
    this.state = next;
  }

  reset(): void {
    this.state = "IDLE";
  }
}
