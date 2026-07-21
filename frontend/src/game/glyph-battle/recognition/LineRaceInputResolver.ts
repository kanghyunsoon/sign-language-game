import type { LineRaceInputContext, LineRaceResolvedInput } from "./LineRaceInputContext";
import { isCompetitiveRecognitionReady } from "../../recognition/readiness/recognitionReadiness";

export interface LineRaceInputResolver {
  resolveConfirmedSymbol(symbol: string, context: LineRaceInputContext): LineRaceResolvedInput;
}

export class DefaultLineRaceInputResolver implements LineRaceInputResolver {
  resolveConfirmedSymbol(symbol: string, context: LineRaceInputContext): LineRaceResolvedInput {
    if (context.matchState !== "PLAYING") return { type: "INVALID", symbol, reason: "MATCH_NOT_PLAYING" };
    if (!isCompetitiveRecognitionReady(symbol)) return { type: "INVALID", symbol, reason: "NO_AVAILABLE_ACTION" };

    const counter = context.counterableObstacles
      .filter((obstacle) => obstacle.symbol === symbol && obstacle.counterDeadlineAt >= context.now)
      .sort((left, right) => left.distanceToRunner - right.distanceToRunner)[0];
    if (counter) return { type: "COUNTER", obstacleId: counter.obstacleId, symbol };

    const supported = context.supportedSymbols.includes(symbol);
    const inHand = context.attackHand.includes(symbol);
    if (!supported || !inHand) {
      return {
        type: "INVALID",
        symbol,
        reason: supported ? "SYMBOL_NOT_IN_HAND" : "NO_AVAILABLE_ACTION",
      };
    }
    if (context.now < context.attackCooldownEndsAt) return { type: "INVALID", symbol, reason: "ATTACK_COOLDOWN" };
    if (context.pendingObstacleCount >= context.maxPendingObstacles) return { type: "INVALID", symbol, reason: "NO_AVAILABLE_ACTION" };
    return { type: "ATTACK", symbol };
  }
}
