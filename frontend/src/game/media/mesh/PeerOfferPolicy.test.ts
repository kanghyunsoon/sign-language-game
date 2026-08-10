import { describe, expect, it } from "vitest";
import { isLocalPeerOfferer } from "./PeerOfferPolicy";

describe("PeerOfferPolicy", () => {
  it("selects exactly one offerer by stable user id ordering", () => {
    expect(isLocalPeerOfferer("a-user", "b-user")).toBe(true);
    expect(isLocalPeerOfferer("b-user", "a-user")).toBe(false);
    expect(() => isLocalPeerOfferer("same", "same")).toThrow();
  });
});
