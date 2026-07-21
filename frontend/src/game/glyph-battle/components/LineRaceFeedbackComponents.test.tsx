// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { LineRaceUserFeedbackView } from "../feedback";
import { LineRaceActionFeedbackBanner } from "./LineRaceActionFeedbackBanner";
import { LineRaceAttackHand } from "./LineRaceAttackHand";
import { LineRaceIncomingObstaclePanel } from "./LineRaceIncomingObstaclePanel";
import { GAME_SYMBOL_REGISTRY } from "../../block-stacking/metadata/symbolRegistry";

afterEach(cleanup);
const input = { connectionState: "CONNECTED" as const, prediction: null, confirmedSymbol: null, lockedSymbol: null,
  lastResolution: null, feedback: { kind: "IDLE" as const, message: "대기" }, error: null };

describe("line-race user feedback components", () => {
  it("renders result-unknown recovery as a neutral resync state", () => {
    const { container } = render(<LineRaceActionFeedbackBanner feedback={{
      state: "RESULT_UNKNOWN",
      target: { kind: "ATTACK", symbols: ["ㄱ"], available: true, cooldownRemainingMs: 0 },
      message: "서버 상태를 다시 맞췄습니다.",
    }} />);

    expect(container.querySelector('[data-state="RESULT_UNKNOWN"]')).toBeTruthy();
    expect(screen.getByText("서버 상태를 다시 맞췄습니다.")).toBeTruthy();
  });

  it("marks only the current contextual attack card as recognizing", () => {
    const feedback: LineRaceUserFeedbackView = { state: "RECOGNIZING", target: { kind: "ATTACK", symbols: ["ㄱ", "ㄴ"], available: true, cooldownRemainingMs: 0 },
      symbol: "ㄴ", recognitionProgress: .5, message: "인식 중" };
    const { container, rerender } = render(<LineRaceAttackHand gateway={{ attackHand: ["ㄱ", "ㄴ"], attackCooldownEndsAt: 0,
      lastConsumedSymbol: null, lastDrawnSymbol: null, lastCommandId: null }} input={input} now={1_000} userFeedback={feedback} />);
    expect(container.querySelector('[data-symbol="ㄴ"]')?.getAttribute("data-feedback")).toBe("인식 중");
    expect(container.querySelector('[data-symbol="ㄱ"]')?.getAttribute("data-feedback")).toBe("공격 가능");
    rerender(<LineRaceAttackHand gateway={{ attackHand: ["ㄱ", "ㄴ"], attackCooldownEndsAt: 0,
      lastConsumedSymbol: null, lastDrawnSymbol: null, lastCommandId: null }} input={input} now={1_000}
      userFeedback={{ ...feedback, symbol: "ㄱ" }} />);
    expect(container.querySelector('[data-symbol="ㄴ"]')?.getAttribute("data-feedback")).toBe("공격 가능");
    expect(container.querySelector('[data-symbol="ㄱ"]')?.getAttribute("data-feedback")).toBe("인식 중");
  });

  it("renders card letters as actual Korean text instead of hand-built lookalike shapes", () => {
    const feedback: LineRaceUserFeedbackView = { state: "IDLE", target: { kind: "ATTACK", symbols: ["ㅂ", "ㅒ", "ㅢ"], available: true, cooldownRemainingMs: 0 }, message: "대기" };
    const { container } = render(<LineRaceAttackHand gateway={{ attackHand: ["ㅂ", "ㅒ", "ㅢ"], attackCooldownEndsAt: 0,
      lastConsumedSymbol: null, lastDrawnSymbol: null, lastCommandId: null }} input={input} now={1_000} userFeedback={feedback} />);
    expect(container.querySelector('[data-symbol="ㅂ"] strong[lang="ko"]')?.textContent).toBe("ㅂ");
    expect(container.querySelector('[data-symbol="ㅒ"] strong[lang="ko"]')?.textContent).toBe("ㅒ");
    expect(container.querySelector('[data-symbol="ㅢ"] strong[lang="ko"]')?.textContent).toBe("ㅢ");
    expect(container.querySelectorAll(".vectorGlyph")).toHaveLength(0);
  });

  it("renders every playable jamo card as its exact Unicode character", () => {
    const jamo=GAME_SYMBOL_REGISTRY.filter((entry)=>entry.category!=="DIGIT").map((entry)=>entry.symbol);
    for (const symbol of jamo) {
      const feedback: LineRaceUserFeedbackView = { state: "IDLE", target: { kind: "ATTACK", symbols: [symbol], available: true, cooldownRemainingMs: 0 }, message: "대기" };
      const view=render(<LineRaceAttackHand gateway={{ attackHand: [symbol], attackCooldownEndsAt: 0,
        lastConsumedSymbol: null, lastDrawnSymbol: null, lastCommandId: null }} input={input} now={1_000} userFeedback={feedback} />);
      const mark=view.container.querySelector(`[data-symbol="${symbol}"] strong[lang="ko"]`);
      expect(mark?.textContent, symbol).toBe(symbol);
      expect(mark?.childElementCount, symbol).toBe(0);
      view.unmount();
    }
  });

  it("keeps the opponent choice hidden while a counterable symbol is being recognized", () => {
    const feedback: LineRaceUserFeedbackView = { state: "RECOGNIZING", target: { kind: "COUNTER", symbols: ["ㄴ"], primarySymbol: "ㄴ", obstacleId: "o1", available: true },
      symbol: "ㄴ", obstacleId: "o1", recognitionProgress: .5, message: "인식 중" };
    render(<LineRaceIncomingObstaclePanel context={{ matchState: "PLAYING", attackHand: ["ㄱ"], attackCooldownEndsAt: 0, now: 1_000,
      pendingObstacleCount: 0, maxPendingObstacles: 3, supportedSymbols: ["ㄱ", "ㄴ"], counterableObstacles: [
        { obstacleId: "o1", symbol: "ㄴ", distanceToRunner: 10, counterDeadlineAt: 2_000, state: "ACTIVE" },
      ] }} baseSpeedPerSecond={10} userFeedback={feedback} />);
    expect(screen.getByText("기술 확정 완료")).toBeTruthy();
    expect(screen.getByText("두 선택이 모두 잠기면 동시에 공개됩니다.")).toBeTruthy();
    expect(document.querySelector('[data-locked="true"]')).toBeTruthy();
  });
});
