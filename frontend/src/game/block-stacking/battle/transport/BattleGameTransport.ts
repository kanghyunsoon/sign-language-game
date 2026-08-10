import type { BattleConnectionOptions, BattleConnectionState, ClientBattleMessage, ServerBattleMessage } from "./battleTransportTypes";
import type { MatchModuleTransport } from "../../../match";

export interface BattleGameTransport extends MatchModuleTransport<ClientBattleMessage, ServerBattleMessage, BattleConnectionState, BattleConnectionOptions> {
  getBufferedAmount?(): number;
}

export interface BattleGameTransportFactory { create(roomId: string): BattleGameTransport; }
