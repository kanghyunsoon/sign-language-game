import type { BattleRoomGateway } from "../room";
import type { BattleMediaSession } from "../../../media/core/BattleMediaSession";
import type { SharedGameCameraSession } from "../../../media/camera/SharedGameCameraSession";

export interface BattleExitCoordinatorOptions {
  readonly roomGateway: BattleRoomGateway; readonly mediaSession: BattleMediaSession; readonly cameraSession: SharedGameCameraSession;
  readonly clearRoomSession: () => void; readonly navigate: (destination: string) => void;
}

export class BattleExitCoordinator {
  constructor(private readonly options: BattleExitCoordinatorOptions) {}
  async returnToWaiting(roomId: string): Promise<void> { await this.options.roomGateway.returnToWaiting(roomId); this.options.navigate(`/game/battle/${roomId}`); }
  async leaveRoom(roomId: string, destination: string): Promise<void> { await this.options.roomGateway.leaveRoom(roomId); await this.options.mediaSession.disconnect(); this.options.cameraSession.stop(); this.options.clearRoomSession(); this.options.navigate(destination); }
}

