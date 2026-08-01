// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ReviewNotesPage } from "./ReviewNotesPage";
import { addReviewNote, removeReviewNotes } from "../data/reviewNotes";
import { learningEntries } from "../data/learningEntries";

/**
 * 테스트마다 오답노트를 깨끗한 상태에서 시작한다.
 * 저장소가 값을 캐시하므로 localStorage만 비우면 남아 있어, 전체 글자를 지운다.
 */
const resetNotes = () => {
  window.localStorage.clear();
  removeReviewNotes(learningEntries.map((entry) => entry.symbol));
};

beforeEach(resetNotes);
afterEach(() => {
  cleanup();
  resetNotes();
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <ReviewNotesPage />
    </MemoryRouter>,
  );

/** 자음 2개·모음 1개·숫자 1개를 담아 필터를 검증할 수 있게 한다. */
const seedNotes = () => {
  ["ㄱ", "ㄴ", "ㅏ", "1"].forEach(addReviewNote);
};

const getGrid = () => screen.getByRole("list");

/** 우측 상세 영역에 표시된 글자를 읽는다. */
const readDetailSymbol = () => screen.getByRole("heading", { level: 2 }).textContent;

describe("ReviewNotesPage 빈 상태", () => {
  it("오답노트가 비어 있으면 안내 문구를 보여준다", () => {
    renderPage();

    expect(screen.getAllByText("오답노트가 비어있습니다.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByRole("button", { name: "선택" }).hasAttribute("disabled")).toBe(
      true,
    );
  });
});

describe("ReviewNotesPage 목록", () => {
  it("단어 오답을 저장하고 단어 필터에서 준비 중 상세를 보여준다", () => {
    addReviewNote("비행기");
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "단어" }));

    expect(screen.getByRole("button", { name: "비행기 비행기" })).toBeTruthy();
    expect(readDetailSymbol()).toBe("비행기");
    expect(screen.getByText("수어 동작 영상은 준비 중입니다.")).toBeTruthy();
  });

  it("담긴 글자를 카드로 보여주고 첫 항목의 상세를 띄운다", () => {
    seedNotes();
    renderPage();

    expect(within(getGrid()).getAllByRole("button")).toHaveLength(4);
    expect(readDetailSymbol()).toBe("ㄱ");
  });

  it("담은 순서가 아니라 자음-모음-숫자 사전 순서로 보여준다", () => {
    // 일부러 거꾸로 담아도 사전 순서로 정렬되어야 한다.
    ["10", "ㅑ", "ㅏ", "ㄴ", "ㄱ", "1"].forEach(addReviewNote);
    renderPage();

    const symbols = within(getGrid())
      .getAllByRole("button")
      .map((card) => card.querySelector(".review-notes-card-symbol")?.textContent);

    expect(symbols).toEqual(["ㄱ", "ㄴ", "ㅏ", "ㅑ", "1", "10"]);
  });

  it("카드를 누르면 상세가 그 글자로 바뀐다", () => {
    seedNotes();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "ㅏ 아" }));

    expect(readDetailSymbol()).toBe("ㅏ");
  });

  it("분류 필터가 카드 목록을 걸러낸다", () => {
    seedNotes();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "자음" }));

    expect(within(getGrid()).getAllByRole("button")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "숫자" }));

    expect(within(getGrid()).getAllByRole("button")).toHaveLength(1);
  });
});

describe("ReviewNotesPage 다중 선택", () => {
  it("선택 모드에서 카드를 고르면 액션 바가 나타난다", () => {
    seedNotes();
    renderPage();

    expect(screen.queryByRole("button", { name: "삭제하기" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "선택" }));
    fireEvent.click(screen.getByRole("button", { name: "ㄱ 기역" }));
    fireEvent.click(screen.getByRole("button", { name: "ㄴ 니은" }));

    expect(screen.getByText("2개 선택됨")).toBeTruthy();
    expect(screen.getByRole("button", { name: "연습하기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "테스트하기" })).toBeTruthy();
  });

  it("취소를 누르면 액션 바가 사라진다", () => {
    seedNotes();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "선택" }));
    fireEvent.click(screen.getByRole("button", { name: "ㄱ 기역" }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(screen.queryByRole("button", { name: "삭제하기" })).toBeNull();
  });

  it("전체 선택은 선택 모드에서만 보인다", () => {
    seedNotes();
    renderPage();

    expect(screen.queryByRole("button", { name: "전체 선택" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "선택" }));

    expect(screen.getByRole("button", { name: "전체 선택" })).toBeTruthy();
  });

  it("전체 선택은 보이는 카드를 모두 고른다", () => {
    seedNotes();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "선택" }));
    fireEvent.click(screen.getByRole("button", { name: "전체 선택" }));

    expect(screen.getByText("4개 선택됨")).toBeTruthy();
  });

  it("전체 선택은 필터에 걸린 카드만 고른다", () => {
    seedNotes();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "자음" }));
    fireEvent.click(screen.getByRole("button", { name: "선택" }));
    fireEvent.click(screen.getByRole("button", { name: "전체 선택" }));

    expect(screen.getByText("2개 선택됨")).toBeTruthy();
  });

  it("이미 전부 고른 상태에서 전체 선택을 누르면 모두 해제된다", () => {
    seedNotes();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "선택" }));
    fireEvent.click(screen.getByRole("button", { name: "전체 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "전체 선택" }));

    expect(screen.queryByRole("button", { name: "삭제하기" })).toBeNull();
  });

  it("삭제하기는 선택한 카드를 지우고 알림을 띄운다", () => {
    seedNotes();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "선택" }));
    fireEvent.click(screen.getByRole("button", { name: "ㄱ 기역" }));
    fireEvent.click(screen.getByRole("button", { name: "ㄴ 니은" }));
    fireEvent.click(screen.getByRole("button", { name: "삭제하기" }));

    expect(within(getGrid()).getAllByRole("button")).toHaveLength(2);
    expect(
      screen.getByText("선택한 단어를 오답노트에서 삭제했어요."),
    ).toBeTruthy();
  });
});

describe("ReviewNotesPage 상세 삭제", () => {
  it("상세에서 삭제하면 다음 항목으로 넘어가고 알림을 띄운다", () => {
    seedNotes();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "오답노트 삭제하기" }));

    expect(readDetailSymbol()).toBe("ㄴ");
    expect(
      screen.getByText("'ㄱ(기역)'을 오답노트에서 삭제했어요."),
    ).toBeTruthy();
  });

  it("마지막 항목까지 지우면 빈 상태 뷰로 돌아간다", () => {
    addReviewNote("ㄱ");
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "오답노트 삭제하기" }));

    expect(screen.getAllByText("오답노트가 비어있습니다.").length).toBeGreaterThan(0);
  });
});
