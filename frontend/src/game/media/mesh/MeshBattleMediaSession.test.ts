import { describe, expect, it, vi } from "vitest";
import type { BattleRoomDetail } from "../../block-stacking/battle/room";
import type { GameMediaEventListener } from "../core/GameMediaEvent";
import type { GameMediaParticipantInfo, RemoteGameMediaParticipant } from "../core/GameMediaParticipant";
import type { GameMediaConnectOptions, GameMediaSession, GameMediaSessionState } from "../core/GameMediaSession";
import { MeshBattleMediaSession } from "./MeshBattleMediaSession";

describe("MeshBattleMediaSession", () => {
  it("maps a block room to Mesh participants and preserves the session for the same room", async () => {
    const media = new FakeGameMediaSession();
    const adapter = createAdapter(media);
    const stream = localStream();
    await adapter.connect(room(), stream);
    await adapter.connect(room(), stream);
    expect(media.connect).toHaveBeenCalledTimes(1);
    expect(media.syncParticipants).toHaveBeenCalledTimes(1);
    expect(media.lastOptions?.localStream).toBe(stream);
    expect(media.lastOptions?.participants.map(({ userId }) => userId)).toEqual(["local", "remote"]);
  });

  it("maps Mesh participant streams and state without exposing WebRTC to block pages", async () => {
    const media = new FakeGameMediaSession();
    const adapter = createAdapter(media);
    await adapter.connect(room(), localStream());
    const remoteStream = { getTracks: () => [] } as unknown as MediaStream;
    media.participants = [{ userId: "remote", displayName: "Remote", cameraEnabled: true, stream: remoteStream, connectionState: "CONNECTED" }];
    media.emit({ type: "REMOTE_STREAM_UPDATED", userId: "remote", stream: remoteStream });
    expect(adapter.getRemoteParticipants()[0]).toMatchObject({ participantId: "remote", stream: remoteStream, connectionState: "CONNECTED" });
  });

  it("disconnects peers without stopping the shared camera track", async () => {
    const media = new FakeGameMediaSession();
    const adapter = createAdapter(media);
    const stream = localStream();
    await adapter.connect(room(), stream);
    await adapter.disconnect();
    expect(media.disconnect).toHaveBeenCalledTimes(1);
    expect(stream.getVideoTracks()[0].stop).not.toHaveBeenCalled();
  });

  it("does not create a Mesh participant for a dev server bot", async () => {
    const media = new FakeGameMediaSession();
    const adapter = createAdapter(media);
    const baseRoom = room();
    const botRoom: BattleRoomDetail = {
      ...baseRoom,
      participants: [
        baseRoom.participants[0],
        { userId: "bot", displayName: "연습 봇", isHost: false, isBot: true },
      ],
    };

    await adapter.connect(botRoom, localStream());

    expect(media.lastOptions?.participants.map(({ userId }) => userId)).toEqual(["local"]);
  });
});

function createAdapter(media: FakeGameMediaSession) {
  return new MeshBattleMediaSession({
    localUser: { userId: "local", displayName: "Local" },
    createMediaSession: () => media,
    createSignalingTransport: () => ({ connect: async () => undefined, send: vi.fn(), subscribe: () => () => undefined, disconnect: vi.fn() }),
    loadIceServers: async () => [{ urls: "stun:test" }],
  });
}

class FakeGameMediaSession implements GameMediaSession {
  readonly connect = vi.fn(async (options: GameMediaConnectOptions) => { this.lastOptions = options; this.state = "CONNECTING"; });
  readonly syncParticipants = vi.fn(async (_participants: readonly GameMediaParticipantInfo[]) => undefined);
  readonly disconnect = vi.fn(async () => { this.state = "CLOSED"; });
  lastOptions: GameMediaConnectOptions | null = null;
  participants: RemoteGameMediaParticipant[] = [];
  state: GameMediaSessionState = "IDLE";
  private listener: GameMediaEventListener | null = null;
  async setCameraEnabled(enabled: boolean) { this.lastOptions?.localStream.getVideoTracks().forEach((track) => { track.enabled = enabled; }); }
  getLocalStream() { return this.lastOptions?.localStream ?? null; }
  getRemoteParticipants() { return this.participants; }
  getParticipant(userId: string) { return this.participants.find((participant) => participant.userId === userId); }
  getConnectionState() { return this.state; }
  subscribe(listener: GameMediaEventListener) { this.listener = listener; return () => { this.listener = null; }; }
  emit(event: Parameters<GameMediaEventListener>[0]) { this.listener?.(event); }
}

function room(): BattleRoomDetail {
  return {
    roomId: "room", title: "Battle", status: "FULL", playerCount: 2, maxPlayers: 2, hostUserId: "local", hostName: "Local",
    difficulty: "EASY", symbolRange: ["ㄱ"], createdAt: null, canJoin: false,
    participants: [{ userId: "local", displayName: "Local", isHost: true }, { userId: "remote", displayName: "Remote", isHost: false }],
    canStart: true, rematch: false, activeMatchId: null, matchStartAt: null,
  };
}
function localStream(): MediaStream {
  const track = { kind: "video", enabled: true, readyState: "live", stop: vi.fn() } as unknown as MediaStreamTrack;
  return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
}
