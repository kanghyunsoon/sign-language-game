/** Text-only game transport carried by the already-established WebRTC peer connection. */
export interface GameDataChannel {
  send(payload: string): void;
  subscribe(listener: (payload: string, remoteUserId: string) => void): () => void;
  isOpen(): boolean;
}
