import type { PhysicsLetterState } from "../../physics/types";
import type { BattleGameTransport } from "../transport/BattleGameTransport";
import type { BattleSyncConfig } from "./InterpolationConfig";
import { serializeBoard } from "./BoardSnapshotSerializer";

export class LocalBoardPublisher {
  private sequence = 0; private lastTransformAt = Number.NEGATIVE_INFINITY; private lastSnapshotAt = Number.NEGATIVE_INFINITY;
  private readonly settledIds = new Set<string>();
  constructor(private readonly transport: BattleGameTransport, private readonly config: BattleSyncConfig, private readonly matchId: string, private readonly playerId: string) {}
  update(now: number, states: readonly PhysicsLetterState[], width: number, height: number): void {
    if (this.transport.getBufferedAmount && this.transport.getBufferedAmount() > this.config.maxWebSocketBufferedAmount) return;
    const nextSettledIds = new Set(states.filter((state) => state.settled).map((state) => state.id));
    const hasNewlySettledLetter = [...nextSettledIds].some((id) => !this.settledIds.has(id));
    this.settledIds.clear();
    for (const id of nextSettledIds) this.settledIds.add(id);
    if (hasNewlySettledLetter || now - this.lastSnapshotAt >= this.config.snapshotPublishIntervalMs) { this.lastSnapshotAt = now; this.lastTransformAt = now; this.sequence += 1; this.transport.send({ type: "BOARD_SNAPSHOT", matchId: this.matchId, playerId: this.playerId, sequence: this.sequence, sentAt: now, bodies: serializeBoard(states, width, height) }); return; }
    if (now - this.lastTransformAt < this.config.transformPublishIntervalMs) return;
    this.lastTransformAt = now; const moving = states.filter((state) => !state.settled);
    if (!moving.length) return; this.sequence += 1; this.transport.send({ type: "BODY_TRANSFORM_BATCH", matchId: this.matchId, playerId: this.playerId, sequence: this.sequence, sentAt: now, bodies: serializeBoard(moving, width, height) });
  }
}
