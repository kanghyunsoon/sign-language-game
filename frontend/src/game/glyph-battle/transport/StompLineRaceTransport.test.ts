import { describe, expect, it, vi } from "vitest";
import { StompLineRaceTransport } from "./StompLineRaceTransport";
import type { StompClientLike } from "../../block-stacking/battle/transport/StompBattleTransport";

const playerId = "10000000-0000-4000-8000-000000000001";
const matchId = "40000000-0000-4000-8000-000000000001";

class Client implements StompClientLike {
  listeners = new Map<string, (frame: { body: string }) => void>();
  sent: string[] = [];
  unsubscribed: string[] = [];
  connect(_headers: Readonly<Record<string, string>>, ok: () => void) { ok(); }
  disconnect = vi.fn();
  subscribe(destination: string, listener: (frame: { body: string }) => void) {
    this.listeners.set(destination, listener);
    return { unsubscribe: () => this.unsubscribed.push(destination) };
  }
  send(destination: string, _headers: Readonly<Record<string, string>>, body: string) {
    this.sent.push(destination + "|" + body);
  }
  emit(destination: string, event: unknown) {
    this.listeners.get(destination)?.({ body: JSON.stringify(event) });
  }
}

describe("StompLineRaceTransport", () => {
  it("reuses the common game endpoint, private queue and match topic then cleans subscriptions", async () => {
    const client = new Client();
    const transport = new StompLineRaceTransport(() => client);
    await transport.connect({ url: "ws://game", playerId, roomId: "30000000-0000-4000-8000-000000000001" });
    expect(client.listeners.has(`/queue/game/player/${playerId}`)).toBe(true);
    transport.requestSnapshot(matchId);
    expect(client.sent[0]).toContain("/app/game/message|");
    expect(client.listeners.has(`/topic/game/match/${matchId}`)).toBe(true);
    transport.disconnect();
    expect(client.unsubscribed).toHaveLength(2);
    expect(client.disconnect).toHaveBeenCalled();
  });

  it("delivers the initial private snapshot before a concurrently arriving obstacle event", async () => {
    const client = new Client();
    const transport = new StompLineRaceTransport(() => client);
    const received: string[] = [];
    transport.subscribe(event => received.push(event.type));
    await transport.connect({ url: "ws://game", playerId, roomId: "30000000-0000-4000-8000-000000000001" });
    transport.requestSnapshot(matchId);

    client.emit(`/topic/game/match/${matchId}`, obstacleEvent(4));
    expect(received).toEqual([]);
    client.emit(`/queue/game/player/${playerId}`, snapshotEvent(5));

    expect(received).toEqual(["LINE_RACE_MATCH_SNAPSHOT"]);
  });
});

function snapshotEvent(sequence: number) {
  return { type:"LINE_RACE_MATCH_SNAPSHOT",eventId:"70000000-0000-4000-8000-000000000005",matchId,sequence,occurredAt:1_000,
    snapshot:{matchId,roomId:"30000000-0000-4000-8000-000000000001",status:"COUNTDOWN",serverTime:1_000,startAt:2_000,finishDeadlineAt:62_000,sequence:sequence-1,myAttackHand:["ㄱ","ㄴ","ㅁ"],
      config:{raceLength:1_000,baseSpeedPerSecond:28,matchDurationMs:60_000,countdownMs:3_000,handSize:3,attackCooldownMs:900,counterWindowMs:2_500,obstacleLeadDistance:180,minimumObstacleSpacing:90,maxPendingObstacles:6,reconnectGraceMs:10_000,supportedSymbols:["ㄱ","ㄴ","ㅁ"]},
      players:[player(playerId),player("20000000-0000-4000-8000-000000000001")],obstacles:[]}};
}
function obstacleEvent(sequence: number) { return {type:"LINE_RACE_OBSTACLE_CREATED",eventId:"70000000-0000-4000-8000-000000000004",matchId,sequence,occurredAt:900,obstacleId:"50000000-0000-4000-8000-000000000001",obstacle:{obstacleId:"50000000-0000-4000-8000-000000000001",templateId:"jamo-giyeok-v1",symbol:"ㄱ",attackerPlayerId:"20000000-0000-4000-8000-000000000001",targetPlayerId:playerId,coursePosition:180,penaltyMs:1_800,createdAt:900,warningEndsAt:1_600,counterDeadlineAt:3_400,status:"WARNING"}}; }
function player(id: string) { return {playerId:id,progress:0,score:0,combo:0,maxCombo:0,pendingObstacleIds:[],accumulatedPenaltyMs:0,connected:true,state:"RUNNING"}; }
