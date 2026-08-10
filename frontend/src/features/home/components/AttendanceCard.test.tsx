// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AttendanceCard } from "./AttendanceCard";
import { markAttendance, resetAttendanceForTest } from "../data/attendance";

/** 2026-07-30(목)을 기준일로 고정한다. */
const TODAY = new Date(2026, 6, 30);
const at = (day: number) => new Date(2026, 6, day);

beforeEach(resetAttendanceForTest);
afterEach(() => {
  cleanup();
  resetAttendanceForTest();
});

const renderCard = () => render(<AttendanceCard today={TODAY} />);

/** 요일 줄과 날짜 격자가 모두 list라서 날짜 격자만 골라 쓴다. */
const grid = () =>
  document.querySelector(".attendance-grid") as HTMLElement;

const cells = () => within(grid()).getAllByRole("listitem");

describe("AttendanceCard 달력", () => {
  it("한 달 전체를 주 단위로 채워 보여준다", () => {
    renderCard();

    // 2026년 7월은 앞뒤 달을 채워 35칸이 된다.
    expect(cells()).toHaveLength(35);
  });

  it("첫 줄에 요일을 월요일부터 적는다", () => {
    renderCard();

    // 요일 줄은 aria-hidden이라 role로 찾을 수 없어 DOM에서 직접 읽는다.
    const weekdays = Array.from(
      document.querySelectorAll(".attendance-weekdays > li"),
      (item) => item.textContent,
    );

    expect(weekdays).toEqual(["월", "화", "수", "목", "금", "토", "일"]);
  });

  it("연도와 월을 제목으로 보여준다", () => {
    renderCard();

    expect(screen.getByText("2026년 7월")).toBeTruthy();
  });

  it("이번 달 칸은 숫자만, 달이 바뀌는 자리에만 달을 함께 적는다", () => {
    renderCard();

    // 앞 달 첫 칸과 뒤 달 1일에만 월이 붙는다.
    expect(within(grid()).getByText("6/29")).toBeTruthy();
    expect(within(grid()).getByText("8/1")).toBeTruthy();

    // 6/30과 7/30이 모두 "30"으로 적혀 두 개가 나온다(월을 붙이지 않는다).
    expect(within(grid()).getAllByText("30")).toHaveLength(2);

    // 이번 달 1일은 숫자만 적는다.
    const cellLabels = cells().map(
      (cell) => cell.querySelector(".attendance-day-label")?.textContent,
    );

    expect(cellLabels).toContain("1");
  });
});

describe("AttendanceCard 월 이동", () => {
  it("화살표로 앞뒤 달을 옮긴다", () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "지난 달 보기" }));
    expect(screen.getByText("2026년 6월")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "다음 달 보기" }));
    expect(screen.getByText("2026년 7월")).toBeTruthy();
  });

  it("다른 달을 보면 오늘의 [출석하기] 버튼이 사라진다", () => {
    renderCard();

    expect(screen.getByRole("button", { name: "출석하기" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "지난 달 보기" }));

    expect(screen.queryByRole("button", { name: "출석하기" })).toBeNull();
  });
});

describe("AttendanceCard 오늘 칸", () => {
  it("아직 출석하지 않았으면 [출석하기] 버튼이 뜬다", () => {
    renderCard();

    expect(screen.getByRole("button", { name: "출석하기" })).toBeTruthy();
  });

  it("[출석하기]를 누르면 스탬프와 연속 일수가 보인다", () => {
    markAttendance(at(28));
    markAttendance(at(29));
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "출석하기" }));

    // 28·29일에 이어 30일까지 3일 연속이 된다.
    expect(screen.queryByRole("button", { name: "출석하기" })).toBeNull();
    expect(screen.getByText("3일째 연속 학습 중이에요!")).toBeTruthy();
    expect(screen.getByText("총 3일 방문")).toBeTruthy();
  });

  it("이미 출석한 날에는 버튼이 없다", () => {
    markAttendance(TODAY);
    renderCard();

    expect(screen.queryByRole("button", { name: "출석하기" })).toBeNull();
  });
});

describe("AttendanceCard 헤더", () => {
  it("기록이 없으면 0일로 보여준다", () => {
    renderCard();

    expect(screen.getByText("0일째 연속 학습 중이에요!")).toBeTruthy();
    expect(screen.getByText("총 0일 방문")).toBeTruthy();
  });

  it("오늘 미출석이면 어제까지의 연속을 유지한다", () => {
    markAttendance(at(28));
    markAttendance(at(29));
    renderCard();

    expect(screen.getByText("2일째 연속 학습 중이에요!")).toBeTruthy();
    // 연속은 유지하면서 오늘 출석은 아직 가능해야 한다.
    expect(screen.getByRole("button", { name: "출석하기" })).toBeTruthy();
  });
});

describe("AttendanceCard 스탬프", () => {
  /** 그 날 칸에 찍힌 그림의 주소. 아무것도 없으면 null. */
  const stampSrc = (day: number) => {
    // 6/30과 7/30이 모두 "30"이므로 이번 달 칸만 고른다.
    const cell = cells().find(
      (item) =>
        !item.classList.contains("attendance-day-outside") &&
        item.querySelector(".attendance-day-label")?.textContent ===
          String(day),
    );

    return cell?.querySelector("img")?.getAttribute("src") ?? null;
  };

  it("출석한 날은 모두 조개로 찍는다", () => {
    [26, 27, 28, 29].forEach((day) => markAttendance(at(day)));
    renderCard();

    [26, 27, 28, 29].forEach((day) => {
      expect(stampSrc(day)).toContain("seashell");
    });
  });

  it("빈 날에는 아무 스탬프도 찍지 않는다", () => {
    markAttendance(at(29));
    renderCard();

    expect(stampSrc(27)).toBeNull();
  });

  it("출석을 누르면 그 날에도 조개가 찍힌다", () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "출석하기" }));

    expect(stampSrc(30)).toContain("seashell");
  });

  it("이미 찍힌 조개는 다시 그려도 바뀌지 않는다", () => {
    [26, 27, 28].forEach((day) => markAttendance(at(day)));
    renderCard();

    const before = [26, 27, 28].map(stampSrc);

    // 달을 옮겼다 돌아오고, 오늘 출석까지 눌러 화면을 다시 그린다.
    fireEvent.click(screen.getByRole("button", { name: "지난 달 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "다음 달 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "출석하기" }));

    expect([26, 27, 28].map(stampSrc)).toEqual(before);
  });

  it("한 달 안에서 네 종류가 모두 나온다", () => {
    Array.from({ length: 29 }, (_, index) => index + 1).forEach((day) =>
      markAttendance(at(day)),
    );
    renderCard();

    const shells = new Set(
      Array.from(grid().querySelectorAll("img"), (image) =>
        image.getAttribute("src"),
      ),
    );

    expect(shells.size).toBe(4);
  });
});

describe("AttendanceCard 미래 날짜", () => {
  it("오늘 이후 칸에는 출석 버튼이 없다", () => {
    renderCard();

    // 31일·8/1·2일은 미래다.
    const futureCell = cells().find((cell) => cell.textContent === "31");

    expect(futureCell).toBeTruthy();
    expect(
      within(futureCell as HTMLElement).queryByRole("button"),
    ).toBeNull();
  });
});
