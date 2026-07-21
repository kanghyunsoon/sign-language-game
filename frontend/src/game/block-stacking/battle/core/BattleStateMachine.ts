export type BattlePageState = "IDLE" | "CONNECTING" | "WAITING_START" | "COUNTDOWN" | "PLAYING" | "RECONNECTING" | "FINISHED" | "ERROR";

const TRANSITIONS: Readonly<Record<BattlePageState, readonly BattlePageState[]>> = {
  IDLE: ["CONNECTING", "ERROR"], CONNECTING: ["WAITING_START", "COUNTDOWN", "ERROR", "IDLE"], WAITING_START: ["COUNTDOWN", "RECONNECTING", "ERROR", "IDLE"],
  COUNTDOWN: ["PLAYING", "RECONNECTING", "FINISHED", "ERROR"], PLAYING: ["RECONNECTING", "FINISHED", "ERROR"],
  RECONNECTING: ["WAITING_START", "COUNTDOWN", "PLAYING", "FINISHED", "ERROR", "IDLE"], FINISHED: ["IDLE"], ERROR: ["CONNECTING", "IDLE"],
};

export class BattleStateMachine {
  constructor(private state: BattlePageState = "IDLE") {}
  getState(): BattlePageState { return this.state; }
  transition(next: BattlePageState): BattlePageState {
    if (next === this.state) return this.state;
    if (!TRANSITIONS[this.state].includes(next)) throw new Error(`Invalid battle transition: ${this.state} -> ${next}`);
    this.state = next;
    return this.state;
  }
}

