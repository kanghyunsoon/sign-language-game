import { describe, expect, it } from "vitest";

import {
  DEFAULT_FINGERSPELLING_SYMBOL,
  fingerspellingCategories,
  fingerspellingEntries,
  fingerspellingItems,
  findFingerspellingEntry,
  searchFingerspellingEntries,
} from "./fingerspelling";

describe("fingerspellingItems", () => {
  it("분류별 지문자 개수를 보유한 이미지 수와 맞춘다", () => {
    expect(fingerspellingItems.consonant).toHaveLength(14);
    expect(fingerspellingItems.vowel).toHaveLength(17);
    expect(fingerspellingItems.number).toHaveLength(10);
  });

  it("숫자는 0 없이 1~10을 순서대로 제공한다", () => {
    expect(fingerspellingItems.number.map((item) => item.symbol)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
    ]);
  });

  it("모든 항목이 이미지와 수형 설명을 갖는다", () => {
    for (const entry of fingerspellingEntries) {
      expect(entry.image, `${entry.symbol} 이미지`).toBeTruthy();
      expect(entry.name, `${entry.symbol} 이름`).toBeTruthy();
      // 문장 수는 설명 길이에 따라 다르다. 줄바꿈 위치를 조절하려고 쪼개기도 한다.
      expect(
        entry.description.length,
        `${entry.symbol} 수형 설명`,
      ).toBeGreaterThan(0);
      entry.description.forEach((sentence) => {
        expect(sentence.trim(), `${entry.symbol} 빈 문장`).toBeTruthy();
      });
    }
  });
});

describe("fingerspellingEntries", () => {
  it("전체 41개를 분류 순서대로 평탄화한다", () => {
    expect(fingerspellingEntries).toHaveLength(41);
    expect(fingerspellingEntries[0].symbol).toBe("ㄱ");
    expect(fingerspellingEntries[0].categoryLabel).toBe("자음");
    expect(fingerspellingEntries.at(-1)?.symbol).toBe("10");
  });

  it("symbol이 전체에서 유일해 조회 키로 쓸 수 있다", () => {
    const symbols = fingerspellingEntries.map((entry) => entry.symbol);

    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it("분류 메타데이터의 대표 글자가 실제 목록의 첫 항목과 일치한다", () => {
    for (const category of fingerspellingCategories) {
      expect(fingerspellingItems[category.id][0].symbol).toBe(category.symbol);
    }
  });
});

describe("findFingerspellingEntry", () => {
  it("글자로 항목을 찾는다", () => {
    expect(findFingerspellingEntry(DEFAULT_FINGERSPELLING_SYMBOL)?.name).toBe(
      "기역",
    );
    expect(findFingerspellingEntry("10")?.name).toBe("열");
    expect(findFingerspellingEntry("ㅢ")?.categoryLabel).toBe("모음");
  });

  it("없는 글자는 undefined를 돌려준다", () => {
    expect(findFingerspellingEntry("ㄲ")).toBeUndefined();
    expect(findFingerspellingEntry("0")).toBeUndefined();
  });
});

describe("searchFingerspellingEntries", () => {
  it("호환 자모와 한글 이름을 모두 검색할 수 있다", () => {
    // "ㄱ"(U+3131)은 조합 음절 "기역"에 포함되지 않으므로 두 경로를 모두 확인한다.
    expect(searchFingerspellingEntries("ㄱ").map((e) => e.name)).toEqual([
      "기역",
    ]);
    expect(searchFingerspellingEntries("기역").map((e) => e.symbol)).toEqual([
      "ㄱ",
    ]);
  });

  it("숫자는 부분 일치로 검색한다", () => {
    expect(searchFingerspellingEntries("1").map((e) => e.name)).toEqual([
      "하나",
      "열",
    ]);
  });

  it("이름 일부로 여러 항목을 검색한다", () => {
    expect(searchFingerspellingEntries("여").map((e) => e.name)).toEqual([
      "여",
      "여섯",
      "여덟",
    ]);
  });

  it("분류명으로 해당 분류 전체를 검색한다", () => {
    expect(searchFingerspellingEntries("숫자")).toHaveLength(10);
  });

  it("앞뒤 공백을 무시하고, 빈 검색어는 빈 배열을 돌려준다", () => {
    expect(searchFingerspellingEntries("  기역  ").map((e) => e.symbol)).toEqual(
      ["ㄱ"],
    );
    expect(searchFingerspellingEntries("")).toEqual([]);
    expect(searchFingerspellingEntries("   ")).toEqual([]);
  });

  it("일치하는 항목이 없으면 빈 배열을 돌려준다", () => {
    expect(searchFingerspellingEntries("zzz")).toEqual([]);
  });
});
