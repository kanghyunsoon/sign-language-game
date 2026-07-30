import type { GameRenderer } from "../../render/types";
import type { RemoteBoard } from "../sync/RemoteBoardReplica";

export class RemoteBoardRenderer {
  constructor(private readonly renderer: GameRenderer, private readonly replica: RemoteBoard) {}
  resize(width: number, height: number): void { this.replica.resize(width, height); }
  render(now: number): void { this.renderer.render(this.replica.renderStates(now)); this.renderer.setTarget(this.replica.targetId()); }
  clear(): void { this.renderer.clear(); }
}
