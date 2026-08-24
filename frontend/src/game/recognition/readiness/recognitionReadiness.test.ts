import { describe, expect, it } from "vitest";
import { COMPETITIVE_RECOGNITION_SYMBOLS, RECOGNITION_CLASS_READINESS, RECOGNITION_READINESS, readinessForSymbol } from "./recognitionReadiness";
import { LINE_RACE_SYMBOLS } from "../../glyph-battle/components/LineRaceCreateRoomForm";

describe("recognition readiness", () => {
  it("covers every model output exactly once", () => {
    expect(RECOGNITION_CLASS_READINESS).toHaveLength(31);
    expect(new Set(RECOGNITION_CLASS_READINESS.map((item) => item.symbol)).size).toBe(31);
  });

  /**
   * 제외된 자모 이름을 여기에 적지 않는다. 모델을 재측정하면 제외 목록이 바뀌고
   * (bfa7f13에서 ㅅ·ㅏ·ㅕ·ㅠ·ㅔ·ㅖ가 풀리고 ㅗ·ㅜ·ㅡ가 대신 막혔다) 그때마다
   * 데이터가 아니라 이 테스트가 깨진다. 대신 계약이 스스로 선언한 기준과
   * 일치하는지만 본다.
   */
  it("keeps every class consistent with the contract's own criteria", () => {
    const { minimumCompetitivePrecision, minimumConfirmationRate } = RECOGNITION_READINESS.criteria;
    for (const item of RECOGNITION_CLASS_READINESS) {
      const meetsCriteria =
        item.precision >= minimumCompetitivePrecision && item.confirmationRate >= minimumConfirmationRate;
      expect(item.competitiveEligible, `${item.symbol} eligibility`).toBe(meetsCriteria);
      // 제외 이유는 사람이 읽어야 하므로 비어 있으면 안 된다.
      if (!item.competitiveEligible) expect(item.reason, `${item.symbol} reason`).toBeTruthy();
    }
  });

  it("exposes exactly the eligible classes as the competitive set", () => {
    const eligible = RECOGNITION_CLASS_READINESS.filter((item) => item.competitiveEligible).map((item) => item.symbol);
    const quarantined = RECOGNITION_CLASS_READINESS.filter((item) => !item.competitiveEligible).map((item) => item.symbol);

    expect(COMPETITIVE_RECOGNITION_SYMBOLS).toEqual(eligible);
    expect(eligible.length).toBeGreaterThan(0);
    for (const symbol of quarantined) {
      expect(COMPETITIVE_RECOGNITION_SYMBOLS).not.toContain(symbol);
      expect(readinessForSymbol(symbol)).toMatchObject({ competitiveEligible: false });
    }
  });

  it("is the exact frontend line-race competitive symbol source", () => {
    expect(LINE_RACE_SYMBOLS).toEqual(COMPETITIVE_RECOGNITION_SYMBOLS);
  });
});
