import type { GameDataChannel } from "../core/GameDataChannel";
import type { GameMediaEvent, GameMediaEventListener } from "../core/GameMediaEvent";
import type { GameMediaParticipantInfo, GameMediaPeerConnectionState, RemoteGameMediaParticipant } from "../core/GameMediaParticipant";
import type { GameMediaConnectOptions, GameMediaSession, GameMediaSessionState } from "../core/GameMediaSession";
import { isRecord } from "../signaling/WebRtcSignalingMessageParser";
import type {
  ClientRtcSignalingEnvelope, RtcIceCandidatePayload, RtcMediaStateChangedPayload, RtcOfferPayload,
  RtcParticipantInfo, RtcParticipantSnapshotPayload, ServerRtcSignalingMessage,
} from "../signaling/WebRtcSignalingMessages";
import { PeerConnectionRegistry } from "./PeerConnectionRegistry";
import { PeerConnectionSlot } from "./PeerConnectionSlot";
import { isLocalPeerOfferer } from "./PeerOfferPolicy";

const MAX_ROOM_PARTICIPANTS = 4;

export interface MeshWebRtcMediaSessionOptions {
  readonly createPeerConnection?: (configuration: RTCConfiguration) => RTCPeerConnection;
  readonly createMediaStream?: () => MediaStream;
  readonly createConnectionId?: () => string;
  readonly disconnectGraceMs?: number;
  readonly setTimer?: typeof setTimeout;
  readonly clearTimer?: typeof clearTimeout;
  readonly now?: () => number;
  readonly shouldConnectParticipant?: (participant: GameMediaParticipantInfo) => boolean;
  readonly shouldCreateOffer?: (localUserId: string, remoteUserId: string) => boolean;
}

export class MeshWebRtcMediaSession implements GameMediaSession {
  private readonly registry = new PeerConnectionRegistry();
  private readonly gameDataListeners = new Set<(payload: string, remoteUserId: string) => void>();
  private readonly gameDataStateListeners = new Set<(open: boolean) => void>();
  private readonly listeners = new Set<GameMediaEventListener>();
  private readonly createPeerConnection: (configuration: RTCConfiguration) => RTCPeerConnection;
  private readonly createMediaStream: () => MediaStream;
  private readonly createConnectionId: () => string;
  private readonly disconnectGraceMs: number;
  private readonly setTimer: typeof setTimeout;
  private readonly clearTimer: typeof clearTimeout;
  private readonly now: () => number;
  private readonly shouldConnectParticipant: (participant: GameMediaParticipantInfo) => boolean;
  private readonly shouldCreateOffer: (localUserId: string, remoteUserId: string) => boolean;
  private options: GameMediaConnectOptions | null = null;
  private unsubscribeSignaling: (() => void) | null = null;
  private state: GameMediaSessionState = "IDLE";
  private controlConnectionId = "";
  private controlSequence = 0;
  private signalingSuspended = false;

  constructor(options: MeshWebRtcMediaSessionOptions = {}) {
    this.createPeerConnection = options.createPeerConnection ?? ((configuration) => new RTCPeerConnection(configuration));
    this.createMediaStream = options.createMediaStream ?? (() => new MediaStream());
    this.createConnectionId = options.createConnectionId ?? defaultConnectionId;
    this.disconnectGraceMs = options.disconnectGraceMs ?? 3_000;
    // Browser timer functions are Web-IDL methods in some engines. Keeping an
    // unbound reference and later invoking it as `this.clearTimer(...)` can
    // throw "Illegal invocation" exactly when a peer becomes connected.
    this.setTimer = options.setTimer ?? ((handler, timeout, ...args) => globalThis.setTimeout(handler, timeout, ...args));
    this.clearTimer = options.clearTimer ?? ((timer) => globalThis.clearTimeout(timer));
    this.now = options.now ?? Date.now;
    this.shouldConnectParticipant = options.shouldConnectParticipant ?? (() => true);
    this.shouldCreateOffer = options.shouldCreateOffer ?? isLocalPeerOfferer;
  }

  async connect(options: GameMediaConnectOptions): Promise<void> {
    if (this.options) throw new Error("Game media session is already connected.");
    this.options = options;
    this.controlConnectionId = this.createConnectionId();
    this.setState("CONNECTING");
    this.signalingSuspended = false;
    try {
      await options.signalingTransport.connect();
      this.unsubscribeSignaling = options.signalingTransport.subscribe((message) => {
        void this.handleSignalingMessage(message).catch((cause) => this.emitError("SIGNALING_ERROR", cause));
      });
      await this.syncParticipants(options.participants);
      this.send({
        type: "RTC_PARTICIPANT_SNAPSHOT",
        connectionId: this.controlConnectionId,
        payload: { roomId: options.roomId, participants: this.currentParticipantInfos() } satisfies RtcParticipantSnapshotPayload,
      });
      this.refreshSessionState();
    } catch (cause) {
      this.setState("FAILED");
      this.emitError("SIGNALING_ERROR", cause);
      throw cause;
    }
  }

  async syncParticipants(participants: readonly GameMediaParticipantInfo[]): Promise<void> {
    const options = this.requireOptions();
    const byUserId = new Map(participants.map((participant) => [participant.userId, participant]));
    if (!byUserId.has(options.localUserId)) {
      byUserId.set(options.localUserId, { userId: options.localUserId, displayName: options.localDisplayName, cameraEnabled: this.localCameraEnabled() });
    }
    if (byUserId.size > MAX_ROOM_PARTICIPANTS) {
      this.emitError("SIGNALING_ERROR", new Error("A mesh media room supports at most four participants."));
      return;
    }

    const remoteIds = new Set([...byUserId.entries()]
      .filter(([userId, participant]) => userId !== options.localUserId && this.shouldConnectParticipant(participant))
      .map(([userId]) => userId));
    for (const slot of this.registry.values()) {
      if (!remoteIds.has(slot.remoteUserId)) this.removePeer(slot.remoteUserId, true);
    }
    for (const userId of remoteIds) {
      const participant = byUserId.get(userId)!;
      const existing = this.registry.get(userId);
      if (existing) {
        existing.updateParticipant(participant);
        continue;
      }
      const slot = this.createSlot(participant, this.createConnectionId());
      this.emit({ type: "PARTICIPANT_ADDED", participant: slot.snapshot() });
      if (this.shouldCreateOffer(options.localUserId, userId)) await this.createAndSendOffer(slot);
    }
    this.refreshSessionState();
  }

  async setCameraEnabled(enabled: boolean): Promise<void> {
    const options = this.requireOptions();
    for (const track of options.localStream.getVideoTracks()) track.enabled = enabled;
    this.emit({ type: "LOCAL_CAMERA_STATE_CHANGED", enabled });
    if (!this.signalingSuspended) this.send({
      type: "RTC_MEDIA_STATE_CHANGED",
      connectionId: this.controlConnectionId,
      payload: { cameraEnabled: enabled, microphoneEnabled: false } satisfies RtcMediaStateChangedPayload,
    });
  }

  getLocalStream(): MediaStream | null { return this.options?.localStream ?? null; }
  getRemoteParticipants(): readonly RemoteGameMediaParticipant[] { return this.registry.values().map((slot) => slot.snapshot()); }
  getParticipant(userId: string): RemoteGameMediaParticipant | undefined { return this.registry.get(userId)?.snapshot(); }
  getGameDataChannel(): GameDataChannel {
    return {
      send: (payload) => {
        const channels = this.registry.values().map((slot) => slot.dataChannel)
          .filter((channel): channel is RTCDataChannel => channel?.readyState === "open");
        if (channels.length === 0) throw new Error("The WebRTC game data channel is not connected.");
        for (const channel of channels) channel.send(payload);
      },
      subscribe: (listener) => {
        this.gameDataListeners.add(listener);
        return () => this.gameDataListeners.delete(listener);
      },
      subscribeState: (listener) => {
        this.gameDataStateListeners.add(listener);
        listener(this.isGameDataChannelOpen());
        return () => this.gameDataStateListeners.delete(listener);
      },
      isOpen: () => this.isGameDataChannelOpen(),
    };
  }
  getConnectionState(): GameMediaSessionState { return this.state; }
  getPeerConnectionCount(): number { return this.registry.size; }

  subscribe(listener: GameMediaEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async disconnect(): Promise<void> {
    for (const slot of this.registry.values()) slot.cleanup(this.clearTimer);
    this.registry.clear();
    this.unsubscribeSignaling?.();
    this.unsubscribeSignaling = null;
    this.options?.signalingTransport.disconnect();
    this.options = null;
    this.controlConnectionId = "";
    this.gameDataListeners.clear();
    this.gameDataStateListeners.clear();
    this.controlSequence = 0;
    this.signalingSuspended = false;
    this.setState("CLOSED");
    this.listeners.clear();
  }

  closePeer(userId: string): void { this.removePeer(userId, false); }

  async reconnectPeer(userId: string): Promise<void> {
    await this.resumeSignaling();
    const participant = this.registry.get(userId)?.snapshot();
    if (!participant) throw new Error(`Unknown remote participant: ${userId}`);
    this.removePeer(userId, false);
    const slot = this.createSlot(participant, this.createConnectionId());
    if (this.shouldCreateOffer(this.requireOptions().localUserId, userId)) await this.createAndSendOffer(slot);
    else this.send({ type: "RTC_ICE_RESTART_REQUEST", targetUserId: userId, connectionId: slot.connectionId, payload: {} });
    this.refreshSessionState();
  }

  private createSlot(participant: GameMediaParticipantInfo, connectionId: string): PeerConnectionSlot {
    const options = this.requireOptions();
    const peer = this.createPeerConnection({ iceServers: [...options.iceServers] });
    const slot = new PeerConnectionSlot(participant.userId, connectionId, peer, participant, this.createMediaStream);
    this.registry.set(slot);
    for (const track of options.localStream.getTracks()) peer.addTrack(track, options.localStream);
    slot.connectionState = "CONNECTING";
    peer.onicecandidate = (event) => this.sendIceCandidate(slot, event.candidate);
    peer.ontrack = (event) => this.receiveRemoteTrack(slot, event.track);
    peer.ondatachannel = (event) => this.attachDataChannel(slot, event.channel);
    if (this.shouldCreateOffer(options.localUserId, participant.userId)) {
      this.attachDataChannel(slot, peer.createDataChannel("game-v1", { ordered: true }));
    }
    peer.onconnectionstatechange = () => this.handlePeerState(slot);
    peer.oniceconnectionstatechange = () => this.handlePeerState(slot);
    return slot;
  }

  private async createAndSendOffer(slot: PeerConnectionSlot): Promise<void> {
    if (slot.cleanedUp || slot.offerCreated) return;
    slot.offerCreated = true;
    const offer = await slot.peerConnection.createOffer();
    await slot.peerConnection.setLocalDescription(offer);
    this.send({
      type: "RTC_OFFER", targetUserId: slot.remoteUserId, connectionId: slot.connectionId,
      payload: { sdp: slot.peerConnection.localDescription?.sdp ?? offer.sdp ?? "" } satisfies RtcOfferPayload,
    }, slot);
  }

  private async handleSignalingMessage(message: ServerRtcSignalingMessage): Promise<void> {
    const options = this.requireOptions();
    if (message.roomId !== options.roomId || message.senderUserId === options.localUserId) return;
    switch (message.type) {
      case "RTC_PARTICIPANT_SNAPSHOT": {
        const payload = message.payload as RtcParticipantSnapshotPayload;
        if (!Array.isArray(payload.participants)) throw new Error("Invalid participant snapshot.");
        await this.syncParticipants(payload.participants);
        for (const participant of payload.participants) {
          if (participant.userId === options.localUserId || !this.shouldCreateOffer(options.localUserId, participant.userId)) continue;
          const slot = this.registry.get(participant.userId);
          if (!slot || slot.connectionState === "CONNECTED") continue;
          const localOffer = slot.peerConnection.localDescription;
          if (localOffer?.type === "offer" && localOffer.sdp) {
            this.send({
              type: "RTC_OFFER",
              targetUserId: slot.remoteUserId,
              connectionId: slot.connectionId,
              payload: { sdp: localOffer.sdp } satisfies RtcOfferPayload,
            }, slot);
          } else {
            await this.createAndSendOffer(slot);
          }
        }
        break;
      }
      case "RTC_PEER_JOINED": {
        const joined = message.payload as RtcParticipantInfo;
        await this.syncParticipants([...this.currentParticipantInfos(), joined]);
        break;
      }
      case "RTC_PEER_LEFT": {
        const userId = isRecord(message.payload) && typeof message.payload.userId === "string" ? message.payload.userId : message.senderUserId;
        this.removePeer(userId, true);
        break;
      }
      case "RTC_OFFER": await this.receiveOffer(message); break;
      case "RTC_ANSWER": await this.receiveAnswer(message); break;
      case "RTC_ICE_CANDIDATE": await this.receiveIceCandidate(message); break;
      case "RTC_ICE_RESTART_REQUEST":
        if (this.shouldCreateOffer(options.localUserId, message.senderUserId) && this.registry.has(message.senderUserId)) {
          await this.reconnectPeer(message.senderUserId);
        }
        break;
      case "RTC_MEDIA_STATE_CHANGED": this.receiveMediaState(message); break;
    }
  }

  private async receiveOffer(message: ServerRtcSignalingMessage): Promise<void> {
    const options = this.requireOptions();
    if (this.shouldCreateOffer(options.localUserId, message.senderUserId)) throw new Error("Offer received from the non-offering peer.");
    const slot = this.ensureIncomingSlot(message.senderUserId, message.connectionId);
    const payload = message.payload as RtcOfferPayload;
    if (typeof payload.sdp !== "string") throw new Error("Invalid RTC offer payload.");
    await slot.peerConnection.setRemoteDescription({ type: "offer", sdp: payload.sdp });
    slot.remoteDescriptionSet = true;
    await slot.iceCandidateBuffer.flush(slot.peerConnection);
    const answer = await slot.peerConnection.createAnswer();
    await slot.peerConnection.setLocalDescription(answer);
    this.send({
      type: "RTC_ANSWER", targetUserId: slot.remoteUserId, connectionId: slot.connectionId,
      payload: { sdp: slot.peerConnection.localDescription?.sdp ?? answer.sdp ?? "" },
    }, slot);
  }

  private async receiveAnswer(message: ServerRtcSignalingMessage): Promise<void> {
    const slot = this.registry.get(message.senderUserId);
    if (!slot || slot.connectionId !== message.connectionId) return;
    const payload = message.payload as RtcOfferPayload;
    if (typeof payload.sdp !== "string") throw new Error("Invalid RTC answer payload.");
    await slot.peerConnection.setRemoteDescription({ type: "answer", sdp: payload.sdp });
    slot.remoteDescriptionSet = true;
    await slot.iceCandidateBuffer.flush(slot.peerConnection);
  }

  private async receiveIceCandidate(message: ServerRtcSignalingMessage): Promise<void> {
    const slot = this.ensureIncomingSlot(message.senderUserId, message.connectionId);
    const payload = message.payload as RtcIceCandidatePayload;
    if (typeof payload.candidate !== "string") throw new Error("Invalid ICE candidate payload.");
    const candidate: RTCIceCandidateInit = { candidate: payload.candidate, sdpMid: payload.sdpMid, sdpMLineIndex: payload.sdpMLineIndex, usernameFragment: payload.usernameFragment ?? undefined };
    if (!slot.remoteDescriptionSet && !slot.peerConnection.remoteDescription) slot.iceCandidateBuffer.push(candidate);
    else await slot.peerConnection.addIceCandidate(candidate);
  }

  private ensureIncomingSlot(remoteUserId: string, connectionId: string): PeerConnectionSlot {
    const current = this.registry.get(remoteUserId);
    if (current?.connectionId === connectionId) return current;
    if (!current && this.registry.size >= MAX_ROOM_PARTICIPANTS - 1) {
      throw new Error("A mesh media session cannot create more than three remote peers.");
    }
    if (current) this.removePeer(remoteUserId, false);
    const info = current?.snapshot() ?? { userId: remoteUserId, displayName: remoteUserId, cameraEnabled: false };
    return this.createSlot(info, connectionId);
  }

  private sendIceCandidate(slot: PeerConnectionSlot, candidate: RTCIceCandidate | null): void {
    if (slot.cleanedUp) return;
    if (this.signalingSuspended) return;
    this.send({
      type: "RTC_ICE_CANDIDATE", targetUserId: slot.remoteUserId, connectionId: slot.connectionId,
      payload: candidate ? candidate.toJSON() : { candidate: "", sdpMid: null, sdpMLineIndex: null },
    }, slot);
  }

  private receiveRemoteTrack(slot: PeerConnectionSlot, track: MediaStreamTrack): void {
    if (!slot.remoteStream.getTracks().includes(track)) slot.remoteStream.addTrack(track);
    this.emit({ type: "REMOTE_STREAM_UPDATED", userId: slot.remoteUserId, stream: slot.remoteStream });
  }

  private receiveMediaState(message: ServerRtcSignalingMessage): void {
    const slot = this.registry.get(message.senderUserId);
    if (!slot || !isRecord(message.payload) || typeof message.payload.cameraEnabled !== "boolean") return;
    const participant = slot.snapshot();
    slot.updateParticipant({ userId: participant.userId, displayName: participant.displayName, cameraEnabled: message.payload.cameraEnabled });
    if (participant.stream) this.emit({ type: "REMOTE_STREAM_UPDATED", userId: slot.remoteUserId, stream: participant.stream });
  }

  private handlePeerState(slot: PeerConnectionSlot): void {
    if (slot.cleanedUp) return;
    const raw = slot.peerConnection.connectionState;
    const next: GameMediaPeerConnectionState = raw === "connected" ? "CONNECTED"
      : raw === "failed" ? "FAILED"
      : raw === "disconnected" ? "DISCONNECTED"
      : raw === "closed" ? "CLOSED" : "CONNECTING";
    if (next === slot.connectionState) return;
    slot.connectionState = next;
    if (next === "CONNECTED" && slot.disconnectGraceTimer) {
      this.clearTimer(slot.disconnectGraceTimer);
      slot.disconnectGraceTimer = null;
    }
    this.emit({ type: "PARTICIPANT_CONNECTION_STATE_CHANGED", userId: slot.remoteUserId, state: next });
    this.refreshSessionState();
    if (next === "DISCONNECTED" && !slot.disconnectGraceTimer) {
      slot.disconnectGraceTimer = this.setTimer(() => {
        slot.disconnectGraceTimer = null;
        if (slot.connectionState === "DISCONNECTED") void this.recoverPeer(slot);
      }, this.disconnectGraceMs);
    } else if (next === "FAILED") {
      void this.recoverPeer(slot);
    }
  }

  private async recoverPeer(slot: PeerConnectionSlot): Promise<void> {
    try {
      await this.resumeSignaling();
      const options = this.requireOptions();
      if (this.shouldCreateOffer(options.localUserId, slot.remoteUserId)) await this.reconnectPeer(slot.remoteUserId);
      else this.send({ type: "RTC_ICE_RESTART_REQUEST", targetUserId: slot.remoteUserId, connectionId: slot.connectionId, payload: {} }, slot);
    } catch (cause) {
      this.emitError("PEER_CONNECTION_ERROR", cause, slot.remoteUserId);
    }
  }

  private removePeer(userId: string, notify: boolean): void {
    const slot = this.registry.get(userId);
    if (!slot) return;
    slot.cleanup(this.clearTimer);
    this.registry.delete(userId);
    if (notify) this.emit({ type: "PARTICIPANT_REMOVED", userId });
    this.refreshSessionState();
  }
  private attachDataChannel(slot: PeerConnectionSlot, channel: RTCDataChannel): void {
    if (slot.cleanedUp) { channel.close(); return; }
    slot.dataChannel?.close();
    slot.dataChannel = channel;
    channel.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      for (const listener of this.gameDataListeners) listener(event.data, slot.remoteUserId);
    };
    channel.onopen = () => {
      if (slot.dataChannel !== channel) return;
      this.notifyGameDataChannelState();
      this.refreshSessionState();
    };
    channel.onclose = () => {
      if (slot.dataChannel !== channel || slot.cleanedUp) return;
      this.notifyGameDataChannelState();
      this.refreshSessionState();
      void this.recoverPeer(slot);
    };
    channel.onerror = () => this.emitError("PEER_CONNECTION_ERROR", new Error("WebRTC game data channel failed."), slot.remoteUserId);
  }

  private isGameDataChannelOpen(): boolean {
    return this.registry.values().some((slot) => slot.dataChannel?.readyState === "open");
  }

  private notifyGameDataChannelState(): void {
    const open = this.isGameDataChannelOpen();
    for (const listener of this.gameDataStateListeners) listener(open);
  }


  private currentParticipantInfos(): GameMediaParticipantInfo[] {
    const options = this.requireOptions();
    return [
      { userId: options.localUserId, displayName: options.localDisplayName, cameraEnabled: this.localCameraEnabled() },
      ...this.registry.values().map((slot) => {
        const value = slot.snapshot();
        return { userId: value.userId, displayName: value.displayName, cameraEnabled: value.cameraEnabled };
      }),
    ];
  }

  private localCameraEnabled(): boolean { return this.options?.localStream.getVideoTracks().some((track) => track.enabled) ?? false; }

  private send(
    value: { readonly type: ClientRtcSignalingEnvelope<unknown>["type"]; readonly targetUserId?: string; readonly connectionId: string; readonly payload: unknown },
    slot?: PeerConnectionSlot,
  ): void {
    const options = this.requireOptions();
    options.signalingTransport.send({
      ...value,
      roomId: options.roomId,
      sequence: slot ? slot.nextSequence() : ++this.controlSequence,
      sentAt: this.now(),
    });
  }

  private refreshSessionState(): void {
    if (!this.options || this.state === "CLOSED") return;
    const slots = this.registry.values();
    if (slots.length === 0) { this.setState("CONNECTING"); return; }
    const connected = slots.filter((slot) => slot.connectionState === "CONNECTED").length;
    const failed = slots.filter((slot) => slot.connectionState === "FAILED" || slot.connectionState === "DISCONNECTED").length;
    if (connected === slots.length) {
      this.setState("CONNECTED");
      if (slots.every((slot) => slot.dataChannel?.readyState === "open")) this.suspendSignaling();
    }
    else if (connected > 0 && connected < slots.length) this.setState("PARTIALLY_CONNECTED");
    else if (failed === slots.length) this.setState("FAILED");
    else this.setState("CONNECTING");
  }

  private suspendSignaling(): void {
    if (this.signalingSuspended || !this.options) return;
    const transport = this.options.signalingTransport;
    if (transport.suspend) transport.suspend();
    else transport.disconnect();
    this.signalingSuspended = true;
  }

  private async resumeSignaling(): Promise<void> {
    if (!this.signalingSuspended) return;
    const transport = this.requireOptions().signalingTransport;
    await transport.connect();
    this.signalingSuspended = false;
  }

  private setState(state: GameMediaSessionState): void {
    if (this.state === state) return;
    this.state = state;
    this.emit({ type: "SESSION_STATE_CHANGED", state });
  }

  private emit(event: GameMediaEvent): void { for (const listener of this.listeners) listener(event); }
  private emitError(type: "SIGNALING_ERROR" | "PEER_CONNECTION_ERROR", cause: unknown, userId?: string): void {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    if (type === "SIGNALING_ERROR") this.emit({ type, error });
    else this.emit({ type, userId: userId ?? "unknown", error });
  }
  private requireOptions(): GameMediaConnectOptions {
    if (!this.options) throw new Error("Game media session is not connected.");
    return this.options;
  }
}

let connectionCounter = 0;
function defaultConnectionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `rtc-${crypto.randomUUID()}`;
  connectionCounter += 1;
  return `rtc-${Date.now()}-${connectionCounter}`;
}
