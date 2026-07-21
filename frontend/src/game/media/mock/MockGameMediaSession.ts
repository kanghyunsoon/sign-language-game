import type { GameMediaEventListener } from "../core/GameMediaEvent";
import type { GameMediaParticipantInfo, RemoteGameMediaParticipant } from "../core/GameMediaParticipant";
import type { GameMediaConnectOptions, GameMediaSession, GameMediaSessionState } from "../core/GameMediaSession";

export class MockGameMediaSession implements GameMediaSession {
  private readonly listeners = new Set<GameMediaEventListener>();
  private readonly participants = new Map<string, RemoteGameMediaParticipant>();
  private options: GameMediaConnectOptions | null = null;
  private state: GameMediaSessionState = "IDLE";

  async connect(options: GameMediaConnectOptions): Promise<void> {
    this.options = options;
    await this.syncParticipants(options.participants);
    this.state = "CONNECTED";
    this.emitState();
  }
  async syncParticipants(participants: readonly GameMediaParticipantInfo[]): Promise<void> {
    if (!this.options) return;
    this.participants.clear();
    for (const participant of participants) if (participant.userId !== this.options.localUserId) {
      this.participants.set(participant.userId, { ...participant, stream: null, connectionState: "CONNECTED" });
    }
  }
  async setCameraEnabled(enabled: boolean): Promise<void> {
    this.options?.localStream.getVideoTracks().forEach((track) => { track.enabled = enabled; });
    for (const listener of this.listeners) listener({ type: "LOCAL_CAMERA_STATE_CHANGED", enabled });
  }
  getLocalStream(): MediaStream | null { return this.options?.localStream ?? null; }
  getRemoteParticipants(): readonly RemoteGameMediaParticipant[] { return [...this.participants.values()]; }
  getParticipant(userId: string): RemoteGameMediaParticipant | undefined { return this.participants.get(userId); }
  getConnectionState(): GameMediaSessionState { return this.state; }
  subscribe(listener: GameMediaEventListener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  async disconnect(): Promise<void> { this.participants.clear(); this.options = null; this.state = "CLOSED"; this.emitState(); }
  private emitState(): void { for (const listener of this.listeners) listener({ type: "SESSION_STATE_CHANGED", state: this.state }); }
}
