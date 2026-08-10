import type { PhysicsLetterState } from "../../physics/types";
import type { BattleBodyTransform } from "../transport/battleTransportTypes";

export function serializeBoard(states: readonly PhysicsLetterState[], width: number, height: number): readonly BattleBodyTransform[] {
  if (width <= 0 || height <= 0) throw new RangeError("Board dimensions must be positive.");
  return states.map((state) => ({ id: state.id, symbol: state.symbol, x: clamp(state.x / width), y: clamp(state.y / height), angle: state.angle, velocityX: state.velocityX, velocityY: state.velocityY, angularVelocity: state.angularVelocity, state: state.settled ? "SETTLED" : "FALLING" }));
}
const clamp = (value: number) => Math.max(-0.25, Math.min(1.25, value));
