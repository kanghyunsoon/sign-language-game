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
      // Leaving is terminal locally. The server may already have removed the
      // participant, or the last request may be lost while the tab disconnects.
      console.warn("Remote room leave failed; continuing local cleanup.", cause);
    }
    await this.options.mediaSession.disconnect(); this.options.cameraSession.stop(); this.options.clearRoomSession(); this.options.navigate(destination);
  }
}

