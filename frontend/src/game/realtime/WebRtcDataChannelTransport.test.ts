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
});

class FakeChannel implements GameDataChannel {
  readonly sent: string[] = [];
  private readonly listeners = new Set<(payload: string, remoteUserId: string) => void>();
  send(payload: string): void { this.sent.push(payload); }
  subscribe(listener: (payload: string, remoteUserId: string) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  isOpen(): boolean { return true; }
  receive(payload: string): void { for (const listener of this.listeners) listener(payload, "remote"); }
}
