import type { BattleRoomDetail } from "../../block-stacking/battle/room";
import type { BattleMediaSession } from "../core/BattleMediaSession";
import type { BattleMediaEventListener } from "../core/BattleMediaEvent";
import type { MediaConnectionState, RemoteGameParticipant } from "../core/mediaTypes";

export class MockBattleMediaSession implements BattleMediaSession {
  private readonly listeners = new Set<BattleMediaEventListener>();
  private localStream: MediaStream | null = null;
  private participants: readonly RemoteGameParticipant[] = [];
  private connectionState: MediaConnectionState = "DISCONNECTED";
  private cameraEnabled = true;

  async connect(_room: BattleRoomDetail, localStream: MediaStream): Promise<void> {
    this.localStream = localStream;
    this.setConnectionState("CONNECTED");
  }

  async syncParticipants(_room: BattleRoomDetail): Promise<void> {}

  async disconnect(): Promise<void> {
    this.localStream = null;
    this.participants = [];
    this.setConnectionState("DISCONNECTED");
    this.emitParticipants();
  }

  async setCameraEnabled(enabled: boolean): Promise<void> {
    this.cameraEnabled = enabled;
    this.localStream?.getVideoTracks().forEach((track) => { track.enabled = enabled; });
    this.emit({ type: "LOCAL_CAMERA_CHANGED", enabled });
  }

  getLocalStream(): MediaStream | null { return this.localStream; }
  getRemoteParticipants(): readonly RemoteGameParticipant[] { return this.participants; }
  getConnectionState(): MediaConnectionState { return this.connectionState; }
  isCameraEnabled(): boolean { return this.cameraEnabled; }

  subscribe(listener: BattleMediaEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setRemoteParticipants(participants: readonly RemoteGameParticipant[]): void {
    this.participants = participants.map((participant) => ({ ...participant }));
    this.emitParticipants();
  }

  setConnectionState(connectionState: MediaConnectionState): void {
    this.connectionState = connectionState;
    this.emit({ type: "CONNECTION_STATE_CHANGED", connectionState });
  }

  private emitParticipants(): void {
    this.emit({ type: "REMOTE_PARTICIPANTS_CHANGED", participants: this.participants });
  }

  private emit(event: Parameters<BattleMediaEventListener>[0]): void {
    this.listeners.forEach((listener) => listener(event));
  }
}
