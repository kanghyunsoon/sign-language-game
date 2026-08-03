import { describe, expect, it, vi } from "vitest";
import type { BattleRoomSession } from "../room";
import { recoverBattleRoom } from "./BattleRoomRecovery";

describe("recoverBattleRoom", () => {
  it("retries transient refresh conflicts and returns the authoritative room", async () => {
    const joinRoom = vi.fn().mockRejectedValueOnce(new Error("Game room request failed (409). ")).mockResolvedValueOnce(room());
    await expect(recoverBattleRoom({ roomCode: "ABC123", joinRoom, wait: async () => undefined })).resolves.toMatchObject({ symbolRange: "ALL" });
  });
});

function room(): BattleRoomSession { return { roomId: "10", roomCode: "ABC123", title: "연습방", status: "PLAYING", playerCount: 2, maxPlayers: 2, hostUserId: "1", hostName: "방장", symbolRange: "ALL", createdAt: null, canJoin: false, participants: [{ userId: "1", displayName: "방장", isHost: true }, { userId: "2", displayName: "참가자", isHost: false }], canStart: false, rematch: false, activeMatchId: "10", matchStartAt: null, currentUser: { userId: "1", displayName: "방장" } }; }
