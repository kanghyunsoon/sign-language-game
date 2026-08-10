import { describe, expect, it, vi } from "vitest";
import type { BattleMediaSession } from "../../../media/core/BattleMediaSession";
import type { SharedGameCameraSession } from "../../../media/camera/SharedGameCameraSession";
import type { BattleRoomGateway } from "../room";
import { BattleExitCoordinator } from "./BattleExitCoordinator";

describe("BattleExitCoordinator", () => {
  it("keeps camera and Mesh peers when returning to the waiting room", async () => { const fixture = createFixture(); await fixture.coordinator.returnToWaiting("room-1"); expect(fixture.gateway.returnToWaiting).toHaveBeenCalledWith("room-1"); expect(fixture.media.disconnect).not.toHaveBeenCalled(); expect(fixture.camera.stop).not.toHaveBeenCalled(); expect(fixture.navigate).toHaveBeenCalledWith("/game/battle/room-1"); });
  it("cleans camera and Mesh peers before moving to the room list", async () => { const fixture = createFixture(); await fixture.coordinator.leaveRoom("room-1", "/game/battle"); expect(fixture.gateway.leaveRoom).toHaveBeenCalledWith("room-1"); expect(fixture.media.disconnect).toHaveBeenCalledOnce(); expect(fixture.camera.stop).toHaveBeenCalledOnce(); expect(fixture.clearRoom).toHaveBeenCalledOnce(); expect(fixture.navigate).toHaveBeenCalledWith("/game/battle"); });
  it("applies the same full cleanup when moving to mode selection", async () => { const fixture = createFixture(); await fixture.coordinator.leaveRoom("room-1", "/game"); expect(fixture.media.disconnect).toHaveBeenCalledOnce(); expect(fixture.camera.stop).toHaveBeenCalledOnce(); expect(fixture.navigate).toHaveBeenCalledWith("/game"); });
  it("cleans up when the server already removed the refreshed player", async () => { const fixture = createFixture(); fixture.gateway.leaveRoom = vi.fn(async () => { throw new Error("Game room request failed (403)."); }); await fixture.coordinator.leaveRoom("room-1", "/game/battle"); expect(fixture.media.disconnect).toHaveBeenCalledOnce(); expect(fixture.camera.stop).toHaveBeenCalledOnce(); expect(fixture.clearRoom).toHaveBeenCalledOnce(); expect(fixture.navigate).toHaveBeenCalledWith("/game/battle"); });
});

function createFixture() {
  const gateway = { returnToWaiting: vi.fn(async () => undefined), leaveRoom: vi.fn(async () => undefined) } as unknown as BattleRoomGateway;
  const media = { disconnect: vi.fn(async () => undefined) } as unknown as BattleMediaSession; const camera = { stop: vi.fn() } as unknown as SharedGameCameraSession;
  const clearRoom = vi.fn(); const navigate = vi.fn(); return { gateway, media, camera, clearRoom, navigate, coordinator: new BattleExitCoordinator({ roomGateway: gateway, mediaSession: media, cameraSession: camera, clearRoomSession: clearRoom, navigate }) };
}
