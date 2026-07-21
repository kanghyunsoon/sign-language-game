import type { SignDecoderState } from "./signDecoderTypes";

const ALLOWED: Readonly<Record<SignDecoderState, readonly SignDecoderState[]>> = {
  NO_HAND: ["TRACKING"],
  TRACKING: ["NO_HAND", "MOVING", "CANDIDATE", "RELEASE_WAIT"],
  MOVING: ["NO_HAND", "TRACKING", "CANDIDATE"],
  CANDIDATE: ["NO_HAND", "TRACKING", "MOVING", "CONFIRMED"],
  CONFIRMED: ["RELEASE_WAIT", "NO_HAND"],
  RELEASE_WAIT: ["NO_HAND", "TRACKING", "MOVING", "CANDIDATE"],
};

export class SignDecoderStateMachine {
  private state: SignDecoderState = "NO_HAND";

  getState(): SignDecoderState { return this.state; }

  transition(next: SignDecoderState): { readonly previous: SignDecoderState; readonly current: SignDecoderState } | null {
    if (next === this.state) return null;
    if (!ALLOWED[this.state].includes(next)) throw new Error(`Invalid sign decoder transition: ${this.state} -> ${next}`);
    const previous = this.state;
    this.state = next;
    return { previous, current: next };
  }

  reset(): void { this.state = "NO_HAND"; }
}
