import { describe, expect, it } from "vitest";
import { parseLineRaceCommand, parseLineRaceEvent } from "./lineRaceMessageParser";

const matchId = "51000000-0000-4000-8000-000000000001";

describe("lineRaceMessageParser", () => {
  it("parses attack and counter commands", () => {
    expect(parseLineRaceCommand({
      type: "LINE_RACE_SIGN_ATTACK_COMMAND",
      commandId: "41000000-0000-4000-8000-000000000001",
      matchId,
      symbol: "ㄱ",
      recognizedAt: 1784100010000,
    }).type).toBe("LINE_RACE_SIGN_ATTACK_COMMAND");

    expect(parseLineRaceCommand({
      type: "LINE_RACE_COUNTER_COMMAND",
      commandId: "41000000-0000-4000-8000-000000000002",
      matchId,
      obstacleId: "61000000-0000-4000-8000-000000000001",
      symbol: "ㄴ",
      recognizedAt: 1784100012000,
    }).type).toBe("LINE_RACE_COUNTER_COMMAND");
  });

  it("parses a server event and tolerates future fields", () => {
    const event = parseLineRaceEvent(JSON.stringify({
      type: "LINE_RACE_HAND_DEALT",
      eventId: "71000000-0000-4000-8000-000000000001",
      matchId,
      playerId: "21000000-0000-4000-8000-000000000001",
      hand: ["ㄱ", "ㄴ", "ㄷ"],
      sequence: 1,
      occurredAt: 1784100010000,
      futureField: true,
    }));
    expect(event.type).toBe("LINE_RACE_HAND_DEALT");
  });

  it("rejects a missing required field", () => {
    expect(() => parseLineRaceCommand({
      type: "LINE_RACE_SIGN_ATTACK_COMMAND",
      commandId: "41000000-0000-4000-8000-000000000001",
      matchId,
      symbol: "ㄱ",
    })).toThrow("recognizedAt");
  });

  it("rejects malformed UUID and negative epoch values", () => {
    expect(() => parseLineRaceCommand({
      type: "LINE_RACE_SIGN_ATTACK_COMMAND",
      commandId: "not-a-uuid",
      matchId,
      symbol: "ㄱ",
      recognizedAt: 1,
    })).toThrow("UUID");

    expect(() => parseLineRaceCommand({
      type: "LINE_RACE_SIGN_ATTACK_COMMAND",
      commandId: "41000000-0000-4000-8000-000000000001",
      matchId,
      symbol: "ㄱ",
      recognizedAt: -1,
    })).toThrow("recognizedAt");
  });

  it("does not accept RTC signaling or block battle event types", () => {
    expect(() => parseLineRaceEvent({ type: "RTC_OFFER" })).toThrow("Unsupported line-race event type");
    expect(() => parseLineRaceEvent({ type: "MATCH_FINISHED" })).toThrow("Unsupported line-race event type");
  });
});
