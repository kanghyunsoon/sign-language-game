// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ReviewNotesPage } from "./ReviewNotesPage";
import { addReviewNote, removeReviewNotes } from "../data/reviewNotes";

/** 테스트마다 오답노트를 깨끗한 상태에서 시작한다. */
const resetNotes = () => {
  window.localStorage.clear();
  removeReviewNotes(["ㄱ", "ㄴ", "ㅏ", "1", "2"]);
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
  it("담긴 글자를 카드로 보여주고 첫 항목의 상세를 띄운다", () => {
    seedNotes();
    renderPage();

    expect(within(getGrid()).getAllByRole("button")).toHaveLength(4);
    expect(readDetailSymbol()).toBe("ㄱ");
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

  it("선택 취소를 누르면 액션 바가 사라진다", () => {
    seedNotes();
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "선택" }));
    fireEvent.click(screen.getByRole("button", { name: "ㄱ 기역" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 취소" }));

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
