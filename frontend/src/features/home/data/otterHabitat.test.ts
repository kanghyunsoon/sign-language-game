// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  findHabitatIndex,
  readOtterHabitatId,
  resetOtterHabitatForTest,
  writeOtterHabitatId,
} from "./otterHabitat";

const IDS = ["log", "rock", "cave"] as const;

beforeEach(resetOtterHabitatForTest);
afterEach(resetOtterHabitatForTest);

describe("otterHabitat 저장소", () => {
  it("기록이 없으면 null을 준다", () => {
    expect(readOtterHabitatId()).toBeNull();
  });

  it("남긴 선택을 그대로 읽는다", () => {
    writeOtterHabitatId("cave");

    expect(readOtterHabitatId()).toBe("cave");
  });

  it("다시 고르면 마지막 선택만 남는다", () => {
    writeOtterHabitatId("cave");
    writeOtterHabitatId("rock");

    expect(readOtterHabitatId()).toBe("rock");
  });
});

describe("findHabitatIndex", () => {
  it("저장된 id의 순번을 찾는다", () => {
    expect(findHabitatIndex(IDS, "cave")).toBe(2);
  });

  it("기록이 없으면 첫 집을 쓴다", () => {
    expect(findHabitatIndex(IDS, null)).toBe(0);
  });

  it("목록에 없는 id는 첫 집으로 돌린다", () => {
    // 그림을 지웠거나 저장값을 손으로 고친 경우.
    expect(findHabitatIndex(IDS, "pond")).toBe(0);
  });

  it("순서를 바꿔도 같은 집을 가리킨다", () => {
    // id로 찾기 때문에 목록 순서에 영향받지 않는다.
    expect(findHabitatIndex(["cave", "log", "rock"], "cave")).toBe(0);
  });
});
