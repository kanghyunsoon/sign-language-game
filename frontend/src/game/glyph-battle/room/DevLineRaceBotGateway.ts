import type { LineRaceRoomGatewayOptions } from "./lineRaceRoomTypes";
import { roomRequest } from "../../block-stacking/battle/room/roomRequest";
export interface DevLineRaceBotMatch {
  readonly roomId: string;
  readonly matchId: string;
  readonly botPlayerId: string;
  readonly difficulty: "EASY" | "NORMAL" | "HARD";
  readonly randomSeed: number;
}
export interface DevLineRaceBotGateway {
  create(
    difficulty: "EASY" | "NORMAL" | "HARD",
    matchDurationMs: number,
  ): Promise<DevLineRaceBotMatch>;
  stop(matchId: string): Promise<void>;
}
export class BackendDevLineRaceBotGateway implements DevLineRaceBotGateway {
  constructor(private readonly options: LineRaceRoomGatewayOptions) {}
  async create(
    difficulty: "EASY" | "NORMAL" | "HARD",
    matchDurationMs: number,
  ) {
    return (await roomRequest(this.options, "/line-race/bot-matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ difficulty, matchDurationMs }),
    })) as DevLineRaceBotMatch;
  }
  async stop(matchId: string) {
    await roomRequest(
      this.options,
      "/line-race/bot-matches/" + encodeURIComponent(matchId),
      { method: "DELETE" },
    );
  }
}
