/** Text-only game transport carried by the already-established WebRTC peer connection. */
export interface GameDataChannel {
  send(payload: string): void;
  subscribe(listener: (payload: string, remoteUserId: string) => void): () => void;
  /** Notifies when the underlying WebRTC game channel opens or closes. */
  subscribeState?(listener: (open: boolean) => void): () => void;
  isOpen(): boolean;
}
