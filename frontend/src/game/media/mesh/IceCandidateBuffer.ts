export class IceCandidateBuffer {
  private candidates: RTCIceCandidateInit[] = [];

  push(candidate: RTCIceCandidateInit): void { this.candidates.push(candidate); }
  get size(): number { return this.candidates.length; }

  async flush(peerConnection: RTCPeerConnection): Promise<void> {
    const pending = this.candidates;
    this.candidates = [];
    for (const candidate of pending) await peerConnection.addIceCandidate(candidate);
  }

  clear(): void { this.candidates = []; }
}
