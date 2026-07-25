export interface PeerDisconnectForfeitOptions {
  readonly graceMs?: number;
  readonly setTimer?: typeof setTimeout;
  readonly clearTimer?: typeof clearTimeout;
  readonly onForfeit: (disconnectedUserId: string) => void;
}

/** DataChannel/PeerConnection watchdog. Room WebSocket is not used for this decision. */
export class PeerDisconnectForfeit {
  private readonly graceMs: number;
  private readonly setTimer: typeof setTimeout;
  private readonly clearTimer: typeof clearTimeout;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disconnectedUserId: string | null = null;

  constructor(private readonly options: PeerDisconnectForfeitOptions) {
    this.graceMs = options.graceMs ?? 10_000;
    this.setTimer = options.setTimer ?? setTimeout;
    this.clearTimer = options.clearTimer ?? clearTimeout;
  }

  disconnected(userId: string): void {
    this.cancel();
    this.disconnectedUserId = userId;
    this.timer = this.setTimer(() => {
      const disconnectedUserId = this.disconnectedUserId;
      this.timer = null;
      this.disconnectedUserId = null;
      if (disconnectedUserId) this.options.onForfeit(disconnectedUserId);
    }, this.graceMs);
  }

  reconnected(userId: string): void {
    if (this.disconnectedUserId === userId) this.cancel();
  }

  cancel(): void {
    if (this.timer) this.clearTimer(this.timer);
    this.timer = null;
    this.disconnectedUserId = null;
  }

  getRemainingUserId(): string | null {
    return this.disconnectedUserId;
  }
}
