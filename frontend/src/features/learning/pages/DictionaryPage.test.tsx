// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DictionaryPage } from "./DictionaryPage";

afterEach(cleanup);

const renderPage = () =>
  render(
    <MemoryRouter>
      <DictionaryPage />
    </MemoryRouter>,
  );

/** 우측 상세 영역에 표시된 글자를 읽는다. */
const readDetailSymbol = () =>
  screen.getByRole("heading", { level: 2 }).textContent;

const getSearchInput = () => screen.getByLabelText("지문자 검색");

describe("DictionaryPage 기본 상태", () => {
  it("진입 시 ㄱ 상세를 보여준다", () => {
    renderPage();

    expect(readDetailSymbol()).toBe("ㄱ");
    expect(screen.getByText("기역")).toBeTruthy();
    expect(screen.getByText("지문자 · 자음")).toBeTruthy();
    expect(
      screen.getByAltText("기역 지문자 동작").getAttribute("src"),
    ).toBeTruthy();
    // 제목 없이 설명 문장만 노출한다.
    expect(
      document.querySelectorAll(".fingerspelling-detail-description p").length,
    ).toBeGreaterThan(0);
  });

  it("자음 분류만 펼친 채 시작하고 선택된 칩을 표시한다", () => {
    renderPage();

    expect(
      screen.getByRole("button", { name: "ㄱ 기역" }).getAttribute("aria-pressed"),
    ).toBe("true");
    // 모음·숫자는 접혀 있어 칩이 렌더되지 않는다.
    expect(screen.queryByRole("button", { name: "ㅏ 아" })).toBeNull();
    expect(screen.queryByRole("button", { name: "1 하나" })).toBeNull();
  });
});

describe("DictionaryPage 분류 트리", () => {
  it("[지문자]를 접으면 하위 분류가 사라진다", () => {
    renderPage();
    const root = screen.getByRole("button", { name: /지문자/ });

    fireEvent.click(root);

    expect(root.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "ㄱ 기역" })).toBeNull();
  });

  it("[숫자]를 펼치면 0 없이 1~10 칩을 보여준다", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /숫자/ }));

    const numberChips = within(
      document.getElementById("dictionary-chips-number") as HTMLElement,
    ).getAllByRole("button");

    expect(numberChips.map((chip) => chip.textContent)).toEqual([
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
    expect(screen.queryByRole("button", { name: "0" })).toBeNull();
  });

  it("칩을 클릭하면 상세가 바뀌고 선택 표시가 한 곳만 남는다", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "ㅎ 히읗" }));

    expect(readDetailSymbol()).toBe("ㅎ");
    expect(screen.getByText("히읗")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "ㅎ 히읗" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "ㄱ 기역" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });
});

describe("DictionaryPage 검색", () => {
  it("단어를 검색하면 수어 동작 영상을 보여준다", () => {
    renderPage();

    fireEvent.change(getSearchInput(), { target: { value: "비행기" } });
    // 검색 결과의 단어 라벨은 "단어" 대신 소분류(탈것)를 보여준다.
    fireEvent.click(screen.getByRole("button", { name: /비행기.*탈것/ }));

    expect(readDetailSymbol()).toBe("비행기");
    const video = screen.getByLabelText("비행기 수어 동작 영상");
    expect(video.getAttribute("src")).toBe("/videos/words/airplane.webm");
    expect(screen.getByRole("button", { name: "영상 재생" })).toBeTruthy();
    expect(screen.getByLabelText("영상 재생 위치")).toBeTruthy();
  });

  it("호환 자모와 한글 이름 모두로 검색된다", () => {
    renderPage();

    fireEvent.change(getSearchInput(), { target: { value: "ㅏ" } });
    expect(screen.getByText("검색 결과 1개")).toBeTruthy();

    fireEvent.change(getSearchInput(), { target: { value: "기역" } });
    expect(screen.getByText("검색 결과 1개")).toBeTruthy();
  });

  it("숫자는 부분 일치로 검색된다", () => {
    renderPage();

    fireEvent.change(getSearchInput(), { target: { value: "1" } });

    expect(screen.getByText("검색 결과 2개")).toBeTruthy();
  });

  it("결과가 없으면 안내 문구를 보여준다", () => {
    renderPage();

    fireEvent.change(getSearchInput(), { target: { value: "zzz" } });

    expect(screen.getByText("검색 결과가 없어요.")).toBeTruthy();
  });

  it("검색 결과를 선택하면 상세가 바뀌고, 검색어를 지우면 해당 분류가 펼쳐진다", () => {
    renderPage();

    fireEvent.change(getSearchInput(), { target: { value: "여덟" } });
    fireEvent.click(screen.getByRole("button", { name: /여덟/ }));

    expect(readDetailSymbol()).toBe("8");

    fireEvent.click(screen.getByRole("button", { name: "검색어 지우기" }));

    // 검색 전 접혀 있던 숫자 분류가 선택 항목에 맞춰 펼쳐진다.
    const numberChip = screen.getByRole("button", { name: "8 여덟" });
    expect(numberChip.getAttribute("aria-pressed")).toBe("true");
  });
});
