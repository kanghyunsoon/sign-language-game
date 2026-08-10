export type LineRaceClientState = "IDLE" | "CONNECTING" | "WAITING_START" | "COUNTDOWN" | "PLAYING" | "RECONNECTING" | "FINISHED" | "ERROR";

const ALLOWED: Readonly<Record<LineRaceClientState, readonly LineRaceClientState[]>> = {
  IDLE: ["CONNECTING", "RECONNECTING", "ERROR"], CONNECTING: ["WAITING_START", "COUNTDOWN", "PLAYING", "RECONNECTING", "FINISHED", "ERROR"],
  WAITING_START: ["COUNTDOWN", "PLAYING", "RECONNECTING", "ERROR"], COUNTDOWN: ["PLAYING", "RECONNECTING", "FINISHED", "ERROR"],
  PLAYING: ["RECONNECTING", "FINISHED", "ERROR"], RECONNECTING: ["WAITING_START", "COUNTDOWN", "PLAYING", "FINISHED", "ERROR"],
  FINISHED: ["WAITING_START"], ERROR: ["CONNECTING", "RECONNECTING"],
};

export class LineRaceClientStateMachine {
  private state: LineRaceClientState = "IDLE";
  getState() { return this.state; }
  transition(next: LineRaceClientState) {
    if (next === this.state) return;
    if (!ALLOWED[this.state].includes(next)) throw new Error(`Invalid line-race client transition: ${this.state} -> ${next}`);
    this.state = next;
  }
}
