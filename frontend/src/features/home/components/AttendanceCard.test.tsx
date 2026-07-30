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

const cells = () => within(screen.getByRole("list")).getAllByRole("listitem");

describe("AttendanceCard 격자", () => {
  it("지난주·이번주 14칸을 보여준다", () => {
    renderCard();

    expect(cells()).toHaveLength(14);
  });

  it("월이 바뀌는 날은 월을 함께 적는다", () => {
    renderCard();

    expect(screen.getByText("8/1(토)")).toBeTruthy();
    expect(screen.getByText("30(목)")).toBeTruthy();
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

describe("AttendanceCard 미래 날짜", () => {
  it("오늘 이후 칸에는 출석 버튼이 없다", () => {
    renderCard();

    // 31일(금)·8/1(토)·2(일)은 미래다.
    const futureCell = cells().find((cell) =>
      cell.textContent?.startsWith("31(금)"),
    );

    expect(futureCell).toBeTruthy();
    expect(
      within(futureCell as HTMLElement).queryByRole("button"),
    ).toBeNull();
  });
});
