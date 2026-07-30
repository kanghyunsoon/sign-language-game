import type { BattleRoomGateway } from "../room";
import type { BattleMediaSession } from "../../../media/core/BattleMediaSession";
import type { SharedGameCameraSession } from "../../../media/camera/SharedGameCameraSession";

export interface BattleExitCoordinatorOptions {
  readonly roomGateway: BattleRoomGateway; readonly mediaSession: BattleMediaSession; readonly cameraSession: SharedGameCameraSession;
  readonly clearRoomSession: () => void; readonly navigate: (destination: string) => void;
  /** Avoid a stale leave request after a hard-refresh lost the room session. */
  readonly shouldLeaveRemotely?: () => boolean;
}

export class BattleExitCoordinator {
  constructor(private readonly options: BattleExitCoordinatorOptions) {}
  async returnToWaiting(roomId: string): Promise<void> { await this.options.roomGateway.returnToWaiting(roomId); this.options.navigate(`/game/battle/${roomId}`); }
  async leaveRoom(roomId: string, destination: string): Promise<void> {
    try {
      if (this.options.shouldLeaveRemotely?.() !== false) await this.options.roomGateway.leaveRoom(roomId);
    } catch (cause) {
      // The server can already have removed a browser that was refreshed.
      // Leaving is terminal locally, so clean up rather than trapping it here.
      if (!isAlreadyLeft(cause)) throw cause;
    }
    await this.options.mediaSession.disconnect(); this.options.cameraSession.stop(); this.options.clearRoomSession(); this.options.navigate(destination);
  }
}

function isAlreadyLeft(cause: unknown): boolean {
  return cause instanceof Error && /\((?:403|404|409)\)/.test(cause.message);
}

