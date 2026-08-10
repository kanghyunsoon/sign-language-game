import { describe, expect, it } from "vitest";

import { createDevAuthHeaders } from "./devAuthHeaders";

describe("createDevAuthHeaders", () => {
  it("encodes a Korean display name as an ASCII-only header value", () => {
    const headers = createDevAuthHeaders({ userId: "user-1", displayName: "개발 사용자" });
    expect(headers["X-Dev-User-Name"]).toBe("%EA%B0%9C%EB%B0%9C%20%EC%82%AC%EC%9A%A9%EC%9E%90");
    expect([...headers["X-Dev-User-Name"]].every((character) => character.charCodeAt(0) <= 0x7f)).toBe(true);
  });
});
