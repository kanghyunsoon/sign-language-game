import { describe, expect, it, vi } from "vitest";
import { PeerDisconnectForfeit } from "./PeerDisconnectForfeit";

describe("PeerDisconnectForfeit", () => {
  it("declares a WebRTC forfeit after ten seconds", () => {
    vi.useFakeTimers();
    const onForfeit = vi.fn();
    const watchdog = new PeerDisconnectForfeit({ onForfeit });
    watchdog.disconnected("guest");
    vi.advanceTimersByTime(9_999);
    expect(onForfeit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onForfeit).toHaveBeenCalledWith("guest");
    vi.useRealTimers();
  });

  it("cancels the forfeit when the same peer reconnects", () => {
    vi.useFakeTimers();
    const onForfeit = vi.fn();
    const watchdog = new PeerDisconnectForfeit({ onForfeit });
    watchdog.disconnected("guest");
    watchdog.reconnected("guest");
    vi.advanceTimersByTime(10_000);
    expect(onForfeit).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
