import { describe, expect, it } from "vitest";

import type { GameDataChannel } from "../media/core/GameDataChannel";
import { WebRtcDataChannelTransport } from "./WebRtcDataChannelTransport";

type Command = { readonly type: "COMMAND"; readonly value: string };
type Event = { readonly type: "EVENT"; readonly value: string };

describe("WebRtcDataChannelTransport", () => {
  it("sends commands and accepts only same-room event envelopes", async () => {
    const channel = new FakeChannel();
    const transport = new WebRtcDataChannelTransport<Command, Event>(
      () => channel,
      (value): value is Event => !!value && typeof value === "object" && (value as { type?: unknown }).type === "EVENT",
    );
    const received: Event[] = [];
    transport.subscribe((event) => received.push(event));
    await transport.connect({ url: "unused", roomId: "room-a", playerId: "user-a" });
    transport.send({ type: "COMMAND", value: "hello" });
    expect(JSON.parse(channel.sent[0])).toMatchObject({ protocol: "GAME_P2P_V1", roomId: "room-a", kind: "COMMAND" });
    channel.receive(JSON.stringify({ protocol: "GAME_P2P_V1", roomId: "room-b", kind: "EVENT", payload: { type: "EVENT", value: "ignore" } }));
    channel.receive(JSON.stringify({ protocol: "GAME_P2P_V1", roomId: "room-a", kind: "EVENT", payload: { type: "EVENT", value: "apply" } }));
    expect(received).toEqual([{ type: "EVENT", value: "apply" }]);
  });

  it("publishes host authority events locally and as a DataChannel envelope", async () => {
    const channel = new FakeChannel();
    const transport = new WebRtcDataChannelTransport<Command, Event>(
      () => channel,
      (value): value is Event => !!value && typeof value === "object" && (value as { type?: unknown }).type === "EVENT",
    );
    const received: Event[] = [];
    transport.subscribe((event) => received.push(event));
    await transport.connect({ url: "unused", roomId: "room-a", playerId: "host" });

    transport.publishEvent({ type: "EVENT", value: "authority" });
    transport.publishSnapshot({ type: "EVENT", value: "recovery" });

    expect(received).toEqual([
      { type: "EVENT", value: "authority" },
      { type: "EVENT", value: "recovery" },
    ]);
    expect(channel.sent.map((value) => JSON.parse(value))).toEqual([
      expect.objectContaining({ kind: "EVENT", payload: { type: "EVENT", value: "authority" } }),
      expect.objectContaining({ kind: "SNAPSHOT", payload: { type: "EVENT", value: "recovery" } }),
    ]);
  });

  it("immediately reports a closed DataChannel instead of waiting for the next command", async () => {
    const channel = new FakeChannel();
    const transport = new WebRtcDataChannelTransport<Command, Event>(() => channel, (value): value is Event => !!value);
    const states: string[] = [];
    transport.subscribeConnectionState((state) => states.push(state));
    await transport.connect({ url: "unused", roomId: "room-a", playerId: "user-a" });

    channel.setOpen(false);

    expect(states).toEqual(["DISCONNECTED", "CONNECTING", "CONNECTED", "DISCONNECTED"]);
  });
});

class FakeChannel implements GameDataChannel {
  readonly sent: string[] = [];
  private readonly listeners = new Set<(payload: string, remoteUserId: string) => void>();
  private readonly stateListeners = new Set<(open: boolean) => void>();
  private open = true;
  send(payload: string): void { this.sent.push(payload); }
  subscribe(listener: (payload: string, remoteUserId: string) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  subscribeState(listener: (open: boolean) => void): () => void { this.stateListeners.add(listener); listener(this.open); return () => this.stateListeners.delete(listener); }
  isOpen(): boolean { return this.open; }
  setOpen(open: boolean): void { this.open = open; for (const listener of this.stateListeners) listener(open); }
  receive(payload: string): void { for (const listener of this.listeners) listener(payload, "remote"); }
}
