import {describe,expect,it} from "vitest";import {EstimatedLineRaceServerClock} from "./LineRaceServerClock";
describe("EstimatedLineRaceServerClock",()=>{it("estimates offset from the request midpoint",()=>{const clock=new EstimatedLineRaceServerClock(()=>1200);clock.updateOffset({serverTime:1500,clientSentAt:900,clientReceivedAt:1100});expect(clock.now()).toBe(1700);});});
