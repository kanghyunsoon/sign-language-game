import type { GameMediaParticipantInfo, GameMediaPeerConnectionState, RemoteGameMediaParticipant } from "../core/GameMediaParticipant";
import { IceCandidateBuffer } from "./IceCandidateBuffer";

export class PeerConnectionSlot {
  readonly iceCandidateBuffer = new IceCandidateBuffer();
  readonly remoteStream: MediaStream;
  offerCreated = false;
  remoteDescriptionSet = false;
  connectionState: GameMediaPeerConnectionState = "NEW";
  disconnectGraceTimer: ReturnType<typeof setTimeout> | null = null;
  restartTimer: ReturnType<typeof setTimeout> | null = null;
  cleanedUp = false;
  sequence = 0;

  constructor(
    readonly remoteUserId: string,
    readonly connectionId: string,
    readonly peerConnection: RTCPeerConnection,
    private participant: GameMediaParticipantInfo,
    createMediaStream: () => MediaStream,
  ) {
    this.remoteStream = createMediaStream();
  }

  updateParticipant(participant: GameMediaParticipantInfo): void { this.participant = participant; }
  nextSequence(): number { return ++this.sequence; }
  snapshot(): RemoteGameMediaParticipant {
    return { ...this.participant, stream: this.remoteStream.getTracks().length > 0 ? this.remoteStream : null, connectionState: this.connectionState };
  }

  cleanup(clearTimer: (timer: ReturnType<typeof setTimeout>) => void): void {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    if (this.disconnectGraceTimer) clearTimer(this.disconnectGraceTimer);
    if (this.restartTimer) clearTimer(this.restartTimer);
    this.disconnectGraceTimer = null;
    this.restartTimer = null;
    this.iceCandidateBuffer.clear();
    this.peerConnection.onicecandidate = null;
    this.peerConnection.ontrack = null;
    this.peerConnection.onconnectionstatechange = null;
    this.peerConnection.oniceconnectionstatechange = null;
    this.peerConnection.close();
    this.connectionState = "CLOSED";
  }
}
