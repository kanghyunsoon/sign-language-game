import { describe, expect, it } from "vitest";

import {
  DAYS_PER_WEEK,
  buildMonthCalendar,
  currentStreak,
  formatMonthTitle,
  shiftMonth,
  startOfWeek,
  streakEndingAt,
  toDateKey,
  toMonthCursor,
} from "./attendance";

/** 테스트에서 날짜를 읽기 쉽게 만든다(월은 1부터). */
const at = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day);

describe("toDateKey", () => {
  it("현지 시간 기준으로 YYYY-MM-DD를 만든다", () => {
    expect(toDateKey(at(2026, 7, 30))).toBe("2026-07-30");
    expect(toDateKey(at(2026, 8, 1))).toBe("2026-08-01");
  });

  it("자정에도 날짜가 밀리지 않는다", () => {
    // UTC로 바꾸면 하루 밀릴 수 있는 시점을 확인한다.
    expect(toDateKey(new Date(2026, 6, 30, 0, 0, 0))).toBe("2026-07-30");
    expect(toDateKey(new Date(2026, 6, 30, 23, 59, 59))).toBe("2026-07-30");
  });
});

describe("startOfWeek", () => {
  it("주 시작은 월요일이다", () => {
    // 2026-07-30은 목요일, 그 주 월요일은 07-27.
    expect(toDateKey(startOfWeek(at(2026, 7, 30)))).toBe("2026-07-27");
  });

  it("월요일은 그대로 둔다", () => {
    expect(toDateKey(startOfWeek(at(2026, 7, 27)))).toBe("2026-07-27");
  });

  it("일요일은 그 주 월요일로 6일 되돌린다", () => {
    // 2026-08-02는 일요일. 앞선 월요일은 07-27이다.
    expect(toDateKey(startOfWeek(at(2026, 8, 2)))).toBe("2026-07-27");
  });
});

describe("streakEndingAt", () => {
  it("그 날에서 거슬러 이어진 일수를 센다", () => {
    const attended = ["2026-07-28", "2026-07-29", "2026-07-30"];

    expect(streakEndingAt(attended, at(2026, 7, 30))).toBe(3);
    expect(streakEndingAt(attended, at(2026, 7, 29))).toBe(2);
    expect(streakEndingAt(attended, at(2026, 7, 28))).toBe(1);
  });

  it("출석하지 않은 날은 0이다", () => {
    expect(streakEndingAt(["2026-07-29"], at(2026, 7, 30))).toBe(0);
  });

  it("하루라도 비면 그 앞은 세지 않는다", () => {
    const attended = ["2026-07-27", "2026-07-29", "2026-07-30"];

    // 07-28이 비어 있으므로 07-30 기준 연속은 2일이다.
    expect(streakEndingAt(attended, at(2026, 7, 30))).toBe(2);
  });

  it("월을 넘겨도 이어서 센다", () => {
    const attended = ["2026-07-30", "2026-07-31", "2026-08-01"];

    expect(streakEndingAt(attended, at(2026, 8, 1))).toBe(3);
  });
});

describe("currentStreak", () => {
  it("오늘 출석했으면 오늘까지 센다", () => {
    const attended = ["2026-07-29", "2026-07-30"];

    expect(currentStreak(attended, at(2026, 7, 30))).toBe(2);
  });

  it("오늘 아직 출석하지 않았으면 어제까지의 연속을 유지한다", () => {
    const attended = ["2026-07-28", "2026-07-29"];

    expect(currentStreak(attended, at(2026, 7, 30))).toBe(2);
  });

  it("어제도 빠졌으면 0이다", () => {
    const attended = ["2026-07-27"];

    expect(currentStreak(attended, at(2026, 7, 30))).toBe(0);
  });

  it("기록이 없으면 0이다", () => {
    expect(currentStreak([], at(2026, 7, 30))).toBe(0);
  });
});


describe("월 이동", () => {
  it("제목에 연도와 월을 적는다", () => {
    expect(formatMonthTitle({ year: 2026, month: 7 })).toBe("2026년 7월");
  });

  it("앞뒤 달로 옮긴다", () => {
    const july = { year: 2026, month: 7 };

    expect(shiftMonth(july, 1)).toEqual({ year: 2026, month: 8 });
    expect(shiftMonth(july, -1)).toEqual({ year: 2026, month: 6 });
  });

  it("연을 넘겨도 바르게 옮긴다", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({
      year: 2027,
      month: 1,
    });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({
      year: 2025,
      month: 12,
    });
  });

  it("날짜에서 그 달을 얻는다", () => {
    expect(toMonthCursor(at(2026, 7, 30))).toEqual({ year: 2026, month: 7 });
  });
});

describe("buildMonthCalendar", () => {
  const july = { year: 2026, month: 7 };
  const today = at(2026, 7, 30);

  it("첫 줄이 월요일에서 시작한다", () => {
    const days = buildMonthCalendar([], july, today);

    // 2026-07-01은 수요일이므로 앞 달 6/29(월)부터 채운다.
    expect(days[0].key).toBe("2026-06-29");
    expect(startOfWeek(at(2026, 7, 1)).getDate()).toBe(29);
  });

  it("마지막 줄이 일요일에서 끝난다", () => {
    const days = buildMonthCalendar([], july, today);

    // 2026-07-31은 금요일이므로 뒤 달 8/2(일)까지 채운다.
    expect(days.at(-1)?.key).toBe("2026-08-02");
  });

  it("칸 수가 주 단위로 딱 맞는다", () => {
    const days = buildMonthCalendar([], july, today);

    expect(days.length % DAYS_PER_WEEK).toBe(0);
    expect(days).toHaveLength(35);
  });

  it("보고 있는 달의 칸은 숫자만 적는다", () => {
    const days = buildMonthCalendar([], july, today);
    const byKey = new Map(days.map((day) => [day.key, day]));

    expect(byKey.get("2026-07-01")?.label).toBe("1");
    expect(byKey.get("2026-07-30")?.label).toBe("30");
  });

  it("앞 달에서 끌어온 칸은 첫 칸에만 달을 함께 적는다", () => {
    const days = buildMonthCalendar([], july, today);

    expect(days[0].label).toBe("6/29");
    expect(days[1].label).toBe("30");
    expect(days[0].isCurrentMonth).toBe(false);
    expect(days[1].isCurrentMonth).toBe(false);
  });

  it("뒤 달에서 끌어온 칸은 1일에만 달을 함께 적는다", () => {
    const days = buildMonthCalendar([], july, today);
    const trailing = days.filter((day) => !day.isCurrentMonth).slice(-2);

    expect(trailing.map((day) => day.label)).toEqual(["8/1", "2"]);
  });

  it("달이 월요일에 시작하면 앞 칸을 채우지 않는다", () => {
    // 2026-06-01은 월요일이다.
    const days = buildMonthCalendar([], { year: 2026, month: 6 }, today);

    expect(days[0].key).toBe("2026-06-01");
    expect(days[0].isCurrentMonth).toBe(true);
    expect(days[0].label).toBe("1");
  });

  it("오늘 칸만 isToday로 표시한다", () => {
    const days = buildMonthCalendar([], july, today);
    const todayCells = days.filter((day) => day.isToday);

    expect(todayCells).toHaveLength(1);
    expect(todayCells[0].key).toBe("2026-07-30");
  });

  it("다른 달을 보고 있으면 오늘 칸이 없다", () => {
    const days = buildMonthCalendar([], { year: 2026, month: 5 }, today);

    expect(days.some((day) => day.isToday)).toBe(false);
  });

  it("오늘 이후만 미래로 본다", () => {
    const days = buildMonthCalendar([], july, today);
    const futureKeys = days.filter((day) => day.isFuture).map((day) => day.key);

    expect(futureKeys).toEqual(["2026-07-31", "2026-08-01", "2026-08-02"]);
  });

  it("출석한 칸에 그 날 기준 연속 일수를 담는다", () => {
    const attended = ["2026-07-28", "2026-07-29", "2026-07-30"];
    const days = buildMonthCalendar(attended, july, today);
    const byKey = new Map(days.map((day) => [day.key, day]));

    expect(byKey.get("2026-07-28")?.streak).toBe(1);
    expect(byKey.get("2026-07-30")?.streak).toBe(3);
    expect(byKey.get("2026-07-27")?.streak).toBe(0);
  });

  it("2월처럼 짧은 달도 주 단위로 맞춘다", () => {
    const days = buildMonthCalendar([], { year: 2027, month: 2 }, today);

    expect(days.length % DAYS_PER_WEEK).toBe(0);
    expect(days.filter((day) => day.isCurrentMonth)).toHaveLength(28);
  });
});
