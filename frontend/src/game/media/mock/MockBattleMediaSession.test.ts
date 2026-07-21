import { describe, expect, it, vi } from "vitest";

import type { RemoteGameParticipant } from "../core/mediaTypes";
import { MockBattleMediaSession } from "./MockBattleMediaSession";

const room = {
  roomId: "room-1", title: "Battle", status: "FULL" as const, playerCount: 2, maxPlayers: 2,
  hostUserId: "local", hostName: "Local", difficulty: "EASY", symbolRange: ["ㄱ"], createdAt: null,
  canJoin: false, participants: [{ userId: "local", displayName: "Local", isHost: true }], canStart: true,
  rematch: false, activeMatchId: null, matchStartAt: null,
};

describe("MockBattleMediaSession", () => {
  it("uses the exact shared stream and toggles its camera track", async () => {
    const videoTrack = { enabled: true } as MediaStreamTrack;
    const stream = { getVideoTracks: () => [videoTrack] } as unknown as MediaStream;
    const session = new MockBattleMediaSession();
    const listener = vi.fn();
    session.subscribe(listener);

    await session.connect(room, stream);
    await session.setCameraEnabled(false);
    await session.setCameraEnabled(true);

    expect(session.getLocalStream()).toBe(stream);
    expect(videoTrack.enabled).toBe(true);
    expect(listener).toHaveBeenCalledWith({ type: "LOCAL_CAMERA_CHANGED", enabled: false });
    expect(listener).toHaveBeenCalledWith({ type: "LOCAL_CAMERA_CHANGED", enabled: true });
  });

  it("handles four participants, leave, and reconnect states", () => {
    const session = new MockBattleMediaSession();
    const participants = [1, 2, 3, 4].map(participant);

    session.setRemoteParticipants(participants);
    expect(session.getRemoteParticipants()).toHaveLength(4);

    session.setRemoteParticipants(participants.slice(0, 3));
    expect(session.getRemoteParticipants().map(({ participantId }) => participantId)).toEqual(["p1", "p2", "p3"]);

    session.setConnectionState("RECONNECTING");
    expect(session.getConnectionState()).toBe("RECONNECTING");
    session.setConnectionState("CONNECTED");
    expect(session.getConnectionState()).toBe("CONNECTED");
  });
});

function participant(index: number): RemoteGameParticipant {
  return {
    participantId: `p${index}`,
    displayName: `Player ${index}`,
    stream: null,
    cameraEnabled: false,
    connectionState: "CONNECTED",
  };
}
