import type { LineRaceMatchFinishedEvent } from "../contracts";
import type { LineRaceDeviceObservedSummary } from "../feedback";
const results=new Map<string,LineRaceMatchFinishedEvent>(), deviceSummaries=new Map<string,LineRaceDeviceObservedSummary>();
export const LineRaceRoomSessionAdapter={
  saveResult(event:LineRaceMatchFinishedEvent, deviceSummary?:LineRaceDeviceObservedSummary){results.set(event.matchId,event);if(deviceSummary)deviceSummaries.set(event.matchId,deviceSummary)},
  getResult(matchId:string){return results.get(matchId)},getDeviceSummary(matchId:string){return deviceSummaries.get(matchId)},
  clearResult(matchId:string){results.delete(matchId);deviceSummaries.delete(matchId)}
};
