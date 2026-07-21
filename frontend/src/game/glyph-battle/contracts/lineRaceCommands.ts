export interface LineRaceSignAttackCommand {
  readonly type: "LINE_RACE_SIGN_ATTACK_COMMAND";
  readonly commandId: string;
  readonly matchId: string;
  readonly symbol: string;
  readonly recognizedAt: number;
}

export interface LineRaceCounterCommand {
  readonly type: "LINE_RACE_COUNTER_COMMAND";
  readonly commandId: string;
  readonly matchId: string;
  readonly obstacleId: string;
  readonly symbol: string;
  readonly recognizedAt: number;
}

export type LineRaceClientCommand = LineRaceSignAttackCommand | LineRaceCounterCommand;
