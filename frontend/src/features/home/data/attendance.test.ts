import { describe, expect, it } from "vitest";

import {
  DAYS_PER_WEEK,
  buildTwoWeekCalendar,
  currentStreak,
  formatDayLabel,
  startOfWeek,
  streakEndingAt,
  toDateKey,
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

describe("formatDayLabel", () => {
  it("날짜와 요일을 함께 적는다", () => {
    expect(formatDayLabel(at(2026, 7, 30))).toBe("30(목)");
  });

  it("매달 1일에는 월도 함께 적는다", () => {
    expect(formatDayLabel(at(2026, 8, 1))).toBe("8/1(토)");
    expect(formatDayLabel(at(2027, 1, 1))).toBe("1/1(금)");
  });

  it("요일을 월요일부터 바르게 매긴다", () => {
    const labels = Array.from({ length: DAYS_PER_WEEK }, (_, offset) =>
      formatDayLabel(at(2026, 7, 27 + offset)),
    );

    expect(labels).toEqual([
      "27(월)",
      "28(화)",
      "29(수)",
      "30(목)",
      "31(금)",
      "8/1(토)",
      "2(일)",
    ]);
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

describe("buildTwoWeekCalendar", () => {
  const today = at(2026, 7, 30); // 목요일

  it("지난주 월요일부터 이번주 일요일까지 14칸을 만든다", () => {
    const days = buildTwoWeekCalendar([], today);

    expect(days).toHaveLength(14);
    expect(days[0].key).toBe("2026-07-20"); // 지난주 월요일
    expect(days[6].key).toBe("2026-07-26"); // 지난주 일요일
    expect(days[7].key).toBe("2026-07-27"); // 이번주 월요일
    expect(days[13].key).toBe("2026-08-02"); // 이번주 일요일
  });

  it("오늘 칸만 isToday로 표시한다", () => {
    const days = buildTwoWeekCalendar([], today);
    const todayCells = days.filter((day) => day.isToday);

    expect(todayCells).toHaveLength(1);
    expect(todayCells[0].key).toBe("2026-07-30");
  });

  it("오늘 이후만 미래로 본다. 오늘은 미래가 아니다", () => {
    const days = buildTwoWeekCalendar([], today);
    const futureKeys = days.filter((day) => day.isFuture).map((day) => day.key);

    expect(futureKeys).toEqual(["2026-07-31", "2026-08-01", "2026-08-02"]);
  });

  it("출석한 칸에 그 날 기준 연속 일수를 담는다", () => {
    const attended = ["2026-07-28", "2026-07-29", "2026-07-30"];
    const days = buildTwoWeekCalendar(attended, today);
    const byKey = new Map(days.map((day) => [day.key, day]));

    expect(byKey.get("2026-07-28")?.streak).toBe(1);
    expect(byKey.get("2026-07-29")?.streak).toBe(2);
    expect(byKey.get("2026-07-30")?.streak).toBe(3);
  });

  it("출석하지 않은 칸은 streak이 0이다", () => {
    const days = buildTwoWeekCalendar(["2026-07-30"], today);
    const byKey = new Map(days.map((day) => [day.key, day]));

    expect(byKey.get("2026-07-29")?.isAttended).toBe(false);
    expect(byKey.get("2026-07-29")?.streak).toBe(0);
  });

  it("월이 바뀌는 주에도 라벨과 순서가 맞는다", () => {
    const days = buildTwoWeekCalendar([], today);

    expect(days[12].label).toBe("8/1(토)");
    expect(days[13].label).toBe("2(일)");
  });

  it("오늘이 일요일이어도 이번주 마지막 칸이 오늘이다", () => {
    const sunday = at(2026, 8, 2);
    const days = buildTwoWeekCalendar([], sunday);

    expect(days[13].key).toBe("2026-08-02");
    expect(days[13].isToday).toBe(true);
    expect(days.some((day) => day.isFuture)).toBe(false);
  });

  it("오늘이 월요일이면 이번주 첫 칸이 오늘이다", () => {
    const monday = at(2026, 7, 27);
    const days = buildTwoWeekCalendar([], monday);

    expect(days[7].key).toBe("2026-07-27");
    expect(days[7].isToday).toBe(true);
  });
});
