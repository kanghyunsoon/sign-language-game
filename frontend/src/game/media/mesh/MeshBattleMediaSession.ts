import type { GameModuleUser } from "../../app/GameModule";
import type { BattleRoomDetail } from "../../block-stacking/battle/room";
import type { BattleMediaEvent, BattleMediaEventListener } from "../core/BattleMediaEvent";
import type { BattleMediaSession } from "../core/BattleMediaSession";
import type { GameMediaEvent } from "../core/GameMediaEvent";
import type { GameMediaParticipantInfo } from "../core/GameMediaParticipant";
import type { GameMediaSession } from "../core/GameMediaSession";
import type { MediaConnectionState, RemoteGameParticipant } from "../core/mediaTypes";
import type { WebRtcSignalingTransport } from "../signaling/WebRtcSignalingTransport";
import { MeshWebRtcMediaSession } from "./MeshWebRtcMediaSession";

export interface MeshBattleMediaSessionOptions {
  readonly localUser: GameModuleUser;
  readonly createSignalingTransport: () => WebRtcSignalingTransport;
  readonly loadIceServers: () => Promise<readonly RTCIceServer[]>;
  readonly createMediaSession?: () => GameMediaSession;
}

/** Keeps block-battle pages independent from Mesh signaling and participant DTOs. */
export class MeshBattleMediaSession implements BattleMediaSession {
  private readonly listeners = new Set<BattleMediaEventListener>();
  private mediaSession: GameMediaSession | null = null;
  private unsubscribeMedia: (() => void) | null = null;
  private roomId: string | null = null;
  private localStream: MediaStream | null = null;
  private connectionState: MediaConnectionState = "DISCONNECTED";

  constructor(private readonly options: MeshBattleMediaSessionOptions) {}

  async connect(room: BattleRoomDetail, localStream: MediaStream): Promise<void> {
    if (this.mediaSession && this.roomId === room.roomId && this.localStream === localStream && this.connectionState !== "FAILED") {
      await this.syncParticipants(room);
      return;
    }
    if (this.mediaSession) await this.disconnect();
    this.roomId = room.roomId;
    this.localStream = localStream;
    this.setConnectionState("CONNECTING");
    const mediaSession = this.options.createMediaSession?.() ?? new MeshWebRtcMediaSession({
      shouldConnectParticipant: (participant) => !isBotParticipant(participant),
    });
    this.mediaSession = mediaSession;
    this.unsubscribeMedia = mediaSession.subscribe((event) => this.receive(event));
    try {
      const iceServers = await this.options.loadIceServers();
      await mediaSession.connect({
        roomId: room.roomId,
        localUserId: this.options.localUser.userId,
        localDisplayName: this.options.localUser.displayName,
        localStream,
        participants: this.toParticipants(room),
        signalingTransport: this.options.createSignalingTransport(),
        iceServers,
      });
      this.syncFromMediaSession();
    } catch (cause) {
      this.setConnectionState("FAILED");
      this.emit({ type: "ERROR", error: toError(cause) });
      throw cause;
    }
  }

  async syncParticipants(room: BattleRoomDetail): Promise<void> {
    if (!this.mediaSession || this.roomId !== room.roomId) return;
    await this.mediaSession.syncParticipants(this.toParticipants(room));
    this.syncFromMediaSession();
  }

  async disconnect(): Promise<void> {
    const mediaSession = this.mediaSession;
    this.mediaSession = null;
    this.unsubscribeMedia?.();
    this.unsubscribeMedia = null;
    if (mediaSession) await mediaSession.disconnect();
    this.roomId = null;
    this.localStream = null;
    this.setConnectionState("DISCONNECTED");
    this.emitParticipants();
  }

  async setCameraEnabled(enabled: boolean): Promise<void> {
    if (!this.mediaSession) throw new Error("영상 연결을 먼저 시작해 주세요.");
    await this.mediaSession.setCameraEnabled(enabled);
  }

  getLocalStream(): MediaStream | null { return this.localStream; }
  getRemoteParticipants(): readonly RemoteGameParticipant[] {
    return this.mediaSession?.getRemoteParticipants().map((participant) => ({
      participantId: participant.userId,
      displayName: participant.displayName,
      stream: participant.stream,
      cameraEnabled: participant.cameraEnabled,
      connectionState: mapPeerState(participant.connectionState),
    })) ?? [];
  }
  getConnectionState(): MediaConnectionState { return this.connectionState; }
  isCameraEnabled(): boolean { return this.localStream?.getVideoTracks().some((track) => track.enabled) ?? false; }
  subscribe(listener: BattleMediaEventListener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  private receive(event: GameMediaEvent): void {
    switch (event.type) {
      case "SESSION_STATE_CHANGED": this.setConnectionState(mapSessionState(event.state)); break;
      case "LOCAL_CAMERA_STATE_CHANGED": this.emit({ type: "LOCAL_CAMERA_CHANGED", enabled: event.enabled }); break;
      case "SIGNALING_ERROR":
      case "PEER_CONNECTION_ERROR": this.emit({ type: "ERROR", error: event.error }); break;
      default: this.emitParticipants(); break;
    }
  }

  private syncFromMediaSession(): void {
    if (!this.mediaSession) return;
    this.setConnectionState(mapSessionState(this.mediaSession.getConnectionState()));
    this.emitParticipants();
  }

  private toParticipants(room: BattleRoomDetail): GameMediaParticipantInfo[] {
    return room.participants.filter((participant) => !participant.isBot).map((participant) => ({
      userId: participant.userId,
      displayName: participant.displayName,
      cameraEnabled: participant.userId === this.options.localUser.userId
        ? this.isCameraEnabled()
        : this.mediaSession?.getParticipant(participant.userId)?.cameraEnabled ?? false,
    }));
  }

  private setConnectionState(connectionState: MediaConnectionState): void {
    if (this.connectionState === connectionState) return;
    this.connectionState = connectionState;
    this.emit({ type: "CONNECTION_STATE_CHANGED", connectionState });
  }
  private emitParticipants(): void { this.emit({ type: "REMOTE_PARTICIPANTS_CHANGED", participants: this.getRemoteParticipants() }); }
  private emit(event: BattleMediaEvent): void { for (const listener of this.listeners) listener(event); }
}

function mapSessionState(state: ReturnType<GameMediaSession["getConnectionState"]>): MediaConnectionState {
  switch (state) {
    case "CONNECTED": return "CONNECTED";
    case "PARTIALLY_CONNECTED": return "RECONNECTING";
    case "FAILED": return "FAILED";
    case "CONNECTING": return "CONNECTING";
    default: return "DISCONNECTED";
  }
}
function mapPeerState(state: NonNullable<ReturnType<GameMediaSession["getParticipant"]>>["connectionState"]): MediaConnectionState {
  switch (state) {
    case "CONNECTED": return "CONNECTED";
    case "FAILED": return "FAILED";
    case "DISCONNECTED": return "RECONNECTING";
    case "NEW":
    case "CONNECTING": return "CONNECTING";
    default: return "DISCONNECTED";
  }
}
function toError(cause: unknown): Error { return cause instanceof Error ? cause : new Error(String(cause)); }
function isBotParticipant(participant: GameMediaParticipantInfo): boolean {
  return /^(\[bot\]|bot\b|mock\b|연습 상대|연습 봇)/i.test(participant.displayName.trim());
}
