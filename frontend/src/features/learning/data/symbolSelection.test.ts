import { describe, expect, it } from "vitest";

import { formatSymbolSelection, parseSymbolSelection } from "./symbolSelection";

describe("parseSymbolSelection", () => {
  it("단어를 단어 테스트 항목으로 바꾼다", () => {
    const [entry] = parseSymbolSelection("비행기");

    expect(entry?.categoryId).toBe("word");
    expect(
      entry && "recognitionSymbol" in entry
        ? entry.recognitionSymbol
        : undefined,
    ).toBe("airplane");
  });

  it("쉼표로 구분된 글자를 지문자 항목으로 바꾼다", () => {
    const entries = parseSymbolSelection("ㄱ,ㅏ,1");

    expect(entries.map((entry) => entry.symbol)).toEqual(["ㄱ", "ㅏ", "1"]);
    expect(entries.map((entry) => entry.categoryId)).toEqual([
      "consonant",
      "vowel",
      "number",
    ]);
  });

  it("넘어온 순서를 유지한다", () => {
    const entries = parseSymbolSelection("ㅎ,ㄱ,ㄴ");

    expect(entries.map((entry) => entry.symbol)).toEqual(["ㅎ", "ㄱ", "ㄴ"]);
  });

  it("이름과 설명을 함께 담아 상세 표시에 바로 쓸 수 있다", () => {
    const [entry] = parseSymbolSelection("ㄱ");

    expect(entry?.name).toBe("기역");
    expect(entry?.categoryLabel).toBe("자음");
    expect(entry?.image).toBeTruthy();
  });

  it("공백을 다듬고 빈 조각은 버린다", () => {
    const entries = parseSymbolSelection(" ㄱ , ,ㄴ, ");

    expect(entries.map((entry) => entry.symbol)).toEqual(["ㄱ", "ㄴ"]);
  });

  it("사전에 없는 글자는 버린다", () => {
    const entries = parseSymbolSelection("ㄱ,쀍,zz,ㄴ");

    expect(entries.map((entry) => entry.symbol)).toEqual(["ㄱ", "ㄴ"]);
  });

  it("중복된 글자는 한 번만 남긴다", () => {
    const entries = parseSymbolSelection("ㄱ,ㄴ,ㄱ,ㄴ,ㄱ");

    expect(entries.map((entry) => entry.symbol)).toEqual(["ㄱ", "ㄴ"]);
  });

  it("값이 없거나 비어 있으면 빈 배열이다", () => {
    expect(parseSymbolSelection(null)).toEqual([]);
    expect(parseSymbolSelection(undefined)).toEqual([]);
    expect(parseSymbolSelection("")).toEqual([]);
    expect(parseSymbolSelection(" , , ")).toEqual([]);
  });
});

describe("formatSymbolSelection", () => {
  it("parseSymbolSelection이 되돌릴 수 있는 형태로 만든다", () => {
    const raw = formatSymbolSelection(["ㄱ", "ㅏ", "1"]);

    expect(raw).toBe("ㄱ,ㅏ,1");
    expect(parseSymbolSelection(raw).map((entry) => entry.symbol)).toEqual([
      "ㄱ",
      "ㅏ",
      "1",
    ]);
  });
});
