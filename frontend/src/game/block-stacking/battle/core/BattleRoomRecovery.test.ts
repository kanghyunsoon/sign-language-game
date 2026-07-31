import { describe, expect, it, vi } from "vitest";

import type { BattleRoomSession } from "../room";
import { recoverBattleRoom } from "./BattleRoomRecovery";

describe("recoverBattleRoom", () => {
  it("retries transient refresh conflicts and returns the authoritative room", async () => {
    const recovered = room();
    const joinRoom = vi.fn()
      .mockRejectedValueOnce(new Error("Game room request failed (409)."))
      .mockRejectedValueOnce(new Error("Game room request failed (500)."))
      .mockResolvedValueOnce(recovered);
    const wait = vi.fn(async () => undefined);

    await expect(recoverBattleRoom({ roomCode: "ABC123", joinRoom, wait })).resolves.toBe(recovered);
    expect(joinRoom).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it("does not retry a room that no longer exists", async () => {
    const joinRoom = vi.fn().mockRejectedValue(new Error("Game room request failed (404)."));

    await expect(recoverBattleRoom({ roomCode: "ABC123", joinRoom, wait: async () => undefined }))
      .rejects.toThrow("Game room request failed (404).");
    expect(joinRoom).toHaveBeenCalledTimes(1);
  });
});

function room(): BattleRoomSession {
  return {
    roomId: "10",
    roomCode: "ABC123",
    title: "재접속 방",
    status: "PLAYING",
    playerCount: 2,
    maxPlayers: 2,
    hostUserId: "1",
    hostName: "방장",
    difficulty: "EASY",
    symbolRange: [],
    createdAt: null,
    canJoin: false,
    participants: [
      { userId: "1", displayName: "방장", isHost: true },
      { userId: "2", displayName: "참가자", isHost: false },
    ],
    canStart: false,
    rematch: false,
    activeMatchId: "10",
    matchStartAt: null,
    currentUser: { userId: "1", displayName: "방장" },
  };
}
