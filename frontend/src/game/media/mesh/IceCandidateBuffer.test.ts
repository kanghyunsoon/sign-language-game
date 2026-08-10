import { describe, expect, it, vi } from "vitest";
import { IceCandidateBuffer } from "./IceCandidateBuffer";

describe("IceCandidateBuffer", () => {
  it("flushes candidates in arrival order and clears them", async () => {
    const buffer = new IceCandidateBuffer();
    buffer.push({ candidate: "first" });
    buffer.push({ candidate: "second" });
    const addIceCandidate = vi.fn(async (_candidate: RTCIceCandidateInit | null) => undefined);
    await buffer.flush({ addIceCandidate } as unknown as RTCPeerConnection);
    expect(addIceCandidate.mock.calls.map(([candidate]) => candidate?.candidate)).toEqual(["first", "second"]);
    expect(buffer.size).toBe(0);
  });
});
