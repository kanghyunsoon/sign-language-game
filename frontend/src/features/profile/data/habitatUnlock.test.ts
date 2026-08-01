import { describe, expect, it } from "vitest";
import { findNewlyUnlockedHabitatLevel } from "./habitatUnlock";

describe("findNewlyUnlockedHabitatLevel", () => {
  it("해금 레벨을 통과하면 해당 레벨을 반환한다", () => {
    expect(findNewlyUnlockedHabitatLevel(4, 5)).toBe(5);
    expect(findNewlyUnlockedHabitatLevel(9, 10)).toBe(10);
    expect(findNewlyUnlockedHabitatLevel(14, 15)).toBe(15);
    expect(findNewlyUnlockedHabitatLevel(19, 20)).toBe(20);
  });

  it("해금 레벨을 통과하지 않으면 null을 반환한다", () => {
    expect(findNewlyUnlockedHabitatLevel(5, 5)).toBeNull();
    expect(findNewlyUnlockedHabitatLevel(6, 7)).toBeNull();
  });

  it("여러 해금 레벨을 한 번에 통과하면 가장 높은 레벨을 반환한다", () => {
    expect(findNewlyUnlockedHabitatLevel(4, 16)).toBe(15);
  });
});
