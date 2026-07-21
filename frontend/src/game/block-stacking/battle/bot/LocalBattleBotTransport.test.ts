import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalBattleBotTransport } from "./LocalBattleBotTransport";

afterEach(()=>vi.useRealTimers());

describe("LocalBattleBotTransport",()=>{
  it("starts a two-player practice match and uses the normal removal contract",async()=>{
    vi.useFakeTimers();const transport=new LocalBattleBotTransport();const events:string[]=[];
    transport.subscribe((event)=>events.push(event.type));
    await transport.connect({url:"local://bot",roomId:"practice",playerId:"PLAYER"});
    await vi.advanceTimersByTimeAsync(900);
    expect(events).toContain("MATCH_STARTED");expect(events).toContain("SPAWN_LETTER");expect(events).toContain("BOARD_SNAPSHOT");
    transport.send({type:"REMOVE_LETTER_COMMAND",commandId:"c1",matchId:"block-bot-practice",letterId:"practice-local-0",symbol:"ㄱ",occurredAt:Date.now()});
    expect(events).toContain("REMOVE_LETTER_ACCEPTED");
    transport.disconnect();expect(transport.getConnectionState()).toBe("DISCONNECTED");expect(vi.getTimerCount()).toBe(0);
  });
  it("uses normalized board coordinates and removes the bot target every turn",async()=>{
    vi.useFakeTimers();const transport=new LocalBattleBotTransport();const snapshots:Array<{readonly bodies:readonly {readonly id:string;readonly x:number;readonly y:number}[]}>=[];const scores:number[]=[];
    transport.subscribe((event)=>{if(event.type==="BOARD_SNAPSHOT")snapshots.push(event);if(event.type==="SCORE_UPDATED"&&event.playerId==="BLOCK_PRACTICE_BOT")scores.push(event.score);});
    await transport.connect({url:"local://bot",roomId:"practice",playerId:"PLAYER"});await vi.advanceTimersByTimeAsync(50);
    const first=snapshots.at(-1)!;expect(first.bodies).toHaveLength(3);expect(first.bodies.every((body)=>body.x>=0&&body.x<=1&&body.y>=0&&body.y<=1)).toBe(true);const targetId=first.bodies[0]!.id;
    await vi.advanceTimersByTimeAsync(1800);const next=snapshots.at(-1)!;expect(next.bodies.some((body)=>body.id===targetId)).toBe(false);expect(scores).toEqual([100]);transport.disconnect();
  });
  it("finishes practice when the player reports the danger line",async()=>{
    vi.useFakeTimers();const transport=new LocalBattleBotTransport();const events:string[]=[];
    transport.subscribe((event)=>events.push(event.type));await transport.connect({url:"local://bot",roomId:"practice",playerId:"PLAYER"});await vi.advanceTimersByTimeAsync(50);
    transport.send({type:"PLAYER_GAME_OVER_COMMAND",commandId:"over",matchId:"block-bot-practice",occurredAt:Date.now()});
    expect(events).toContain("MATCH_FINISHED");expect(vi.getTimerCount()).toBe(0);transport.disconnect();
  });
});
