import type { GameRenderer } from "../../render/types";
import type { RemoteBoard } from "../sync/RemoteBoardReplica";

export class RemoteBoardRenderer {
  constructor(private readonly renderer: GameRenderer, private readonly replica: RemoteBoard) {}
  resize(width: number, height: number): void { this.replica.resize(width, height); }
  render(now: number): boolean { const states = this.replica.renderStates(now); this.renderer.render(states); this.renderer.setTarget(this.replica.targetId()); return states.some((state) => !state.settled); }
  clear(): void { this.renderer.clear(); }
}
