import type { LineRaceTransport } from "./LineRaceTransport";
import type {
  LocalLineRaceCommandGateway,
  LocalLineRaceGatewaySnapshot,
} from "./LocalLineRaceCommandGateway";
import type { NetworkLineRaceController } from "../core/NetworkLineRaceController";
export class NetworkLineRaceCommandGateway implements LocalLineRaceCommandGateway {
  readonly resultAuthority = "SERVER" as const;
  constructor(
    private readonly matchId: string,
    private readonly transport: LineRaceTransport,
    private readonly controller: NetworkLineRaceController,
  ) {}
  async submitAttack(command: {
    commandId: string;
    symbol: string;
    recognizedAt: number;
  }) {
    this.transport.send({
      type: "LINE_RACE_SIGN_ATTACK_COMMAND",
      matchId: this.matchId,
      ...command,
    });
  }
  async submitCounter(command: {
    commandId: string;
    obstacleId: string;
    symbol: string;
    recognizedAt: number;
  }) {
    this.transport.send({
      type: "LINE_RACE_COUNTER_COMMAND",
      matchId: this.matchId,
      ...command,
    });
  }
  getInputContext() {
    return this.controller.getInputContext();
  }
  getSnapshot(): LocalLineRaceGatewaySnapshot {
    const view = this.controller.getView();
    return {
      attackHand: view.hand,
      attackCooldownEndsAt: 0,
      lastConsumedSymbol: null,
      lastDrawnSymbol: null,
      lastCommandId: null,
    };
  }
}
