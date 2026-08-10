import type { LineRaceResolvedInput } from "./LineRaceInputContext";

export interface LineRaceSignFeedback {
  readonly kind: "IDLE" | "ATTACK" | "COUNTER" | "INVALID" | "ERROR";
  readonly message: string;
  readonly symbol?: string;
  readonly occurredAt?: number;
}

export const IDLE_LINE_RACE_SIGN_FEEDBACK: LineRaceSignFeedback = {
  kind: "IDLE",
  message: "지문자 입력을 기다리고 있습니다.",
};

export function feedbackForResolvedInput(input: LineRaceResolvedInput, occurredAt: number): LineRaceSignFeedback {
  if (input.type === "ATTACK") return { kind: "ATTACK", symbol: input.symbol, occurredAt, message: `${input.symbol} 공격 동작 인식` };
  if (input.type === "COUNTER") return { kind: "COUNTER", symbol: input.symbol, occurredAt, message: `${input.symbol} 카운터 동작 인식` };
  const messages = {
    MATCH_NOT_PLAYING: "경기 중에만 입력할 수 있습니다.",
    SYMBOL_NOT_IN_HAND: "현재 공격 패에 없는 지문자입니다.",
    ATTACK_COOLDOWN: "공격 재사용 대기 중입니다.",
    NO_AVAILABLE_ACTION: "현재 실행할 수 있는 공격이나 카운터가 없습니다.",
  } as const;
  return { kind: "INVALID", symbol: input.symbol, occurredAt, message: messages[input.reason] };
}
