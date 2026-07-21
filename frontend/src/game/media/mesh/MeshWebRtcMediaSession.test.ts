import { describe, expect, it, vi } from "vitest";

import type { GameMediaParticipantInfo } from "../core/GameMediaParticipant";
import type { ClientRtcSignalingMessage, ServerRtcSignalingMessage } from "../signaling/WebRtcSignalingMessages";
import type { WebRtcSignalingTransport } from "../signaling/WebRtcSignalingTransport";
import { MeshWebRtcMediaSession } from "./MeshWebRtcMediaSession";

describe("MeshWebRtcMediaSession", () => {
  it.each([2, 3, 4])("connects a %i participant room with one slot per remote", async (count) => {
    const harness = createHarness();
    await harness.connect(participants(count));
    expect(harness.session.getPeerConnectionCount()).toBe(count - 1);
    expect(harness.peers).toHaveLength(count - 1);
    expect(harness.peers.every((peer) => peer.addedTracks[0] === harness.localTrack)).toBe(true);
  });

  it("caps each user at three peer connections", async () => {
    const harness = createHarness();
    await harness.connect(participants(4));
    expect(harness.session.getRemoteParticipants()).toHaveLength(3);
  });

  it("can exclude a bot participant without creating fake signaling", async () => {
    const peers: FakePeerConnection[] = [];
    const transport = new MockSignalingTransport();
    const session = new MeshWebRtcMediaSession({
      createPeerConnection: () => { const peer = new FakePeerConnection(); peers.push(peer); return peer as unknown as RTCPeerConnection; },
      createMediaStream: () => new FakeMediaStream() as unknown as MediaStream,
      shouldConnectParticipant: (participant) => !participant.displayName.startsWith("[BOT]"),
    });
    const track = fakeTrack("local");
    const stream = new FakeMediaStream([track]) as unknown as MediaStream;
    await session.connect({ roomId: "room", localUserId: "local", localDisplayName: "Local", localStream: stream,
      participants: [info("local"), { ...info("bot"), displayName: "[BOT] Practice" }], signalingTransport: transport, iceServers: [] });
    expect(peers).toHaveLength(0);
    expect(transport.sent.some((message) => message.type === "RTC_OFFER")).toBe(false);
  });

  it("creates offers only when the local user id sorts first", async () => {
    const offerer = createHarness("a-local");
    await offerer.connect([info("a-local"), info("z-remote")]);
    expect(offerer.transport.sent.some((message) => message.type === "RTC_OFFER")).toBe(true);
    const answerer = createHarness("z-local");
    await answerer.connect([info("z-local"), info("a-remote")]);
    expect(answerer.transport.sent.some((message) => message.type === "RTC_OFFER")).toBe(false);
  });

  it("answers a valid offer and applies buffered ICE after remote description", async () => {
    const harness = createHarness("z-local");
    await harness.connect([info("z-local"), info("a-remote")]);
    harness.transport.emit(serverMessage("RTC_ICE_CANDIDATE", "a-remote", "offer-1", { candidate: "early", sdpMid: "0", sdpMLineIndex: 0 }));
    harness.transport.emit(serverMessage("RTC_OFFER", "a-remote", "offer-1", { sdp: "offer-sdp" }));
    await vi.waitFor(() => expect(harness.transport.sent.some((message) => message.type === "RTC_ANSWER")).toBe(true));
    const peer = harness.peers.at(-1)!;
    expect(peer.remoteDescription?.type).toBe("offer");
    expect(peer.addedCandidates.map((candidate) => candidate.candidate)).toContain("early");
  });

  it("applies an answer and later ICE immediately", async () => {
    const harness = createHarness("a-local");
    await harness.connect([info("a-local"), info("z-remote")]);
    const offer = harness.transport.sent.find((message) => message.type === "RTC_OFFER")!;
    harness.transport.emit(serverMessage("RTC_ANSWER", "z-remote", offer.connectionId, { sdp: "answer-sdp" }));
    await vi.waitFor(() => expect(harness.peers[0].remoteDescription?.type).toBe("answer"));
    harness.transport.emit(serverMessage("RTC_ICE_CANDIDATE", "z-remote", offer.connectionId, { candidate: "late", sdpMid: null, sdpMLineIndex: null }));
    await vi.waitFor(() => expect(harness.peers[0].addedCandidates).toHaveLength(1));
  });

  it("adds and removes only the participant named by room events", async () => {
    const harness = createHarness();
    await harness.connect([info("local"), info("peer-a")]);
    harness.transport.emit(serverMessage("RTC_PEER_JOINED", "peer-b", "room-event", info("peer-b")));
    await vi.waitFor(() => expect(harness.session.getPeerConnectionCount()).toBe(2));
    harness.transport.emit(serverMessage("RTC_PEER_LEFT", "peer-a", "room-event", { userId: "peer-a" }));
    await vi.waitFor(() => expect(harness.session.getParticipant("peer-a")).toBeUndefined());
    expect(harness.session.getParticipant("peer-b")).toBeDefined();
  });

  it("keeps healthy peers when one peer fails and reports partial connectivity", async () => {
    const harness = createHarness();
    await harness.connect(participants(3));
    harness.peers[0].changeState("connected");
    harness.peers[1].changeState("failed");
    await vi.waitFor(() => expect(harness.session.getConnectionState()).toBe("PARTIALLY_CONNECTED"));
    expect(harness.peers[0].closed).toBe(false);
  });

  it("does not stop a shared local track when a peer or the whole mesh closes", async () => {
    const harness = createHarness();
    await harness.connect(participants(3));
    harness.session.closePeer("peer-1");
    expect(harness.localTrack.stop).not.toHaveBeenCalled();
    await harness.session.disconnect();
    expect(harness.localTrack.stop).not.toHaveBeenCalled();
  });

  it("clears every peer and signaling listener on disconnect", async () => {
    const harness = createHarness();
    await harness.connect(participants(4));
    await harness.session.disconnect();
    expect(harness.session.getPeerConnectionCount()).toBe(0);
    expect(harness.transport.unsubscribe).toHaveBeenCalledTimes(1);
    expect(harness.transport.disconnect).toHaveBeenCalledTimes(1);
    expect(harness.peers.every((peer) => peer.closed)).toBe(true);
  });

  it("toggles existing video tracks and broadcasts media state", async () => {
    const harness = createHarness();
    await harness.connect(participants(2));
    await harness.session.setCameraEnabled(false);
    expect(harness.localTrack.enabled).toBe(false);
    await harness.session.setCameraEnabled(true);
    expect(harness.localTrack.enabled).toBe(true);
    expect(harness.transport.sent.filter((message) => message.type === "RTC_MEDIA_STATE_CHANGED")).toHaveLength(2);
  });

  it("keeps existing peers and emits an error for a five-person snapshot", async () => {
    const harness = createHarness();
    const errors: Error[] = [];
    harness.session.subscribe((event) => { if (event.type === "SIGNALING_ERROR") errors.push(event.error); });
    await harness.connect(participants(2));
    const existing = harness.session.getParticipant("peer-1");
    harness.transport.emit(serverMessage("RTC_PARTICIPANT_SNAPSHOT", "server", "snapshot", { roomId: "room", participants: participants(5) }));
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(harness.session.getParticipant("peer-1")).toEqual(existing);
    expect(harness.session.getPeerConnectionCount()).toBe(1);
  });

  it("recreates only the requested peer", async () => {
    const harness = createHarness();
    await harness.connect(participants(3));
    const healthy = harness.peers[1];
    await harness.session.reconnectPeer("peer-1");
    expect(harness.peers[0].closed).toBe(true);
    expect(healthy.closed).toBe(false);
    expect(harness.session.getPeerConnectionCount()).toBe(2);
  });

  it("keeps remote tracks isolated per participant", async () => {
    const harness = createHarness();
    await harness.connect(participants(3));
    const firstTrack = fakeTrack("remote-a");
    const secondTrack = fakeTrack("remote-b");
    harness.peers[0].emitTrack(firstTrack);
    harness.peers[1].emitTrack(secondTrack);
    expect(harness.session.getParticipant("peer-1")?.stream?.getTracks()).toEqual([firstTrack]);
    expect(harness.session.getParticipant("peer-2")?.stream?.getTracks()).toEqual([secondTrack]);
  });
});

function createHarness(localUserId = "local") {
  const peers: FakePeerConnection[] = [];
  const localTrack = fakeTrack("local-video");
  const localStream = new FakeMediaStream([localTrack]) as unknown as MediaStream;
  let connection = 0;
  const transport = new MockSignalingTransport();
  const session = new MeshWebRtcMediaSession({
    createPeerConnection: () => { const peer = new FakePeerConnection(); peers.push(peer); return peer as unknown as RTCPeerConnection; },
    createMediaStream: () => new FakeMediaStream() as unknown as MediaStream,
    createConnectionId: () => `connection-${++connection}`,
    disconnectGraceMs: 0,
  });
  return {
    session, peers, localTrack, transport,
    connect: (members: readonly GameMediaParticipantInfo[]) => session.connect({
      roomId: "room", localUserId, localDisplayName: localUserId, localStream, participants: members,
      signalingTransport: transport, iceServers: [{ urls: "stun:test" }],
    }),
  };
}

class MockSignalingTransport implements WebRtcSignalingTransport {
  readonly sent: ClientRtcSignalingMessage[] = [];
  readonly unsubscribe = vi.fn();
  readonly disconnect = vi.fn();
  private listener: ((message: ServerRtcSignalingMessage) => void) | null = null;
  async connect() {}
  send(message: ClientRtcSignalingMessage) { this.sent.push(message); }
  subscribe(listener: (message: ServerRtcSignalingMessage) => void) { this.listener = listener; return () => { this.listener = null; this.unsubscribe(); }; }
  emit(message: ServerRtcSignalingMessage) { this.listener?.(message); }
}

class FakeMediaStream {
  constructor(private readonly tracks: MediaStreamTrack[] = []) {}
  getTracks() { return this.tracks; }
  getVideoTracks() { return this.tracks.filter((track) => track.kind === "video"); }
  addTrack(track: MediaStreamTrack) { this.tracks.push(track); }
}

class FakePeerConnection {
  connectionState: RTCPeerConnectionState = "new";
  iceConnectionState: RTCIceConnectionState = "new";
  localDescription: RTCSessionDescription | null = null;
  remoteDescription: RTCSessionDescription | null = null;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  readonly addedTracks: MediaStreamTrack[] = [];
  readonly addedCandidates: RTCIceCandidateInit[] = [];
  closed = false;
  addTrack(track: MediaStreamTrack) { this.addedTracks.push(track); return {} as RTCRtpSender; }
  async createOffer(): Promise<RTCSessionDescriptionInit> { return { type: "offer", sdp: "local-offer" }; }
  async createAnswer(): Promise<RTCSessionDescriptionInit> { return { type: "answer", sdp: "local-answer" }; }
  async setLocalDescription(description: RTCLocalSessionDescriptionInit) { this.localDescription = description as RTCSessionDescription; }
  async setRemoteDescription(description: RTCSessionDescriptionInit) { this.remoteDescription = description as RTCSessionDescription; }
  async addIceCandidate(candidate: RTCIceCandidateInit) { this.addedCandidates.push(candidate); }
  close() { this.closed = true; this.connectionState = "closed"; }
  changeState(state: RTCPeerConnectionState) { this.connectionState = state; this.onconnectionstatechange?.(); }
  emitTrack(track: MediaStreamTrack) { this.ontrack?.({ track } as RTCTrackEvent); }
}

function fakeTrack(id: string) {
  return { id, kind: "video", enabled: true, readyState: "live", stop: vi.fn() } as unknown as MediaStreamTrack & { stop: ReturnType<typeof vi.fn> };
}
function info(userId: string): GameMediaParticipantInfo { return { userId, displayName: userId, cameraEnabled: true }; }
function participants(count: number): GameMediaParticipantInfo[] { return [info("local"), ...Array.from({ length: count - 1 }, (_, index) => info(`peer-${index + 1}`))]; }
function serverMessage(type: ServerRtcSignalingMessage["type"], senderUserId: string, connectionId: string, payload: unknown): ServerRtcSignalingMessage {
  return { type, roomId: "room", senderUserId, connectionId, sequence: 1, sentAt: 1, payload };
}
