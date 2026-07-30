import { useState } from "react";

import stampImage from "../../../shared/assets/stamp.webp";
import seashell01 from "../assets/seashell_01.webp";
import seashell02 from "../assets/seashell_02.webp";
import seashell03 from "../assets/seashell_03.webp";
import seashell04 from "../assets/seashell_04.webp";
import {
  WEEKDAY_LABELS,
  buildMonthCalendar,
  currentStreak,
  formatMonthTitle,
  fromDateKey,
  shiftMonth,
  toMonthCursor,
  useAttendance,
  useMarkAttendance,
} from "../data/attendance";

/**
 * 연속 구간을 채우는 조개. 구간 안에서 순서대로 돌려 쓰므로 같은 그림이
 * 나란히 붙지 않고, 연속이 길어져도 네 종류가 반복된다.
 */
const seashellImages = [seashell01, seashell02, seashell03, seashell04];

/** 연속 구간의 n번째 날(streak)에 놓을 조개 그림. */
function seashellFor(streak: number) {
  return seashellImages[(streak - 1) % seashellImages.length];
}

interface AttendanceCardProps {
  /** 기준일. 테스트에서 시점을 고정하려고 주입할 수 있다. */
  readonly today?: Date;
}

/** 한 달 출석 현황을 보여주고 오늘 출석을 남기는 카드. */
export function AttendanceCard({ today = new Date() }: AttendanceCardProps) {
  const attendedDates = useAttendance();
  const markAttendance = useMarkAttendance();

  const [cursor, setCursor] = useState(() => toMonthCursor(today));

  const days = buildMonthCalendar(attendedDates, cursor, today);
  const streak = currentStreak(attendedDates, today);

  return (
    <section className="attendance-card" aria-label="출석체크">
      <header className="attendance-heading">
        <strong className="attendance-streak">
          {streak}일째 연속 학습 중이에요!
        </strong>

        <span className="attendance-total">총 {attendedDates.length}일 방문</span>
      </header>

      <div className="attendance-month">
        <button
          className="attendance-month-button"
          type="button"
          aria-label="지난 달 보기"
          onClick={() => setCursor((previous) => shiftMonth(previous, -1))}
        >
          ‹
        </button>

        <strong className="attendance-month-title" aria-live="polite">
          {formatMonthTitle(cursor)}
        </strong>

        <button
          className="attendance-month-button"
          type="button"
          aria-label="다음 달 보기"
          onClick={() => setCursor((previous) => shiftMonth(previous, 1))}
        >
          ›
        </button>
      </div>

      {/* 요일 줄과 날짜 칸이 같은 7열을 쓰도록 그리드를 나눠 둔다. */}
      <ol className="attendance-weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map((weekday) => (
          <li key={weekday}>{weekday}</li>
        ))}
      </ol>

      <ol className="attendance-grid">
        {days.map((day) => (
          <li
            className={[
              "attendance-day",
              day.isCurrentMonth ? "" : "attendance-day-outside",
              day.isToday ? "attendance-day-today" : "",
              day.isAttended ? "attendance-day-done" : "",
              day.isFuture ? "attendance-day-future" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            key={day.key}
          >
            <span className="attendance-day-label">{day.label}</span>

            {/*
              연속 구간의 마지막 날만 수달 스탬프에 연속 일수를 얹고,
              그 앞의 날들은 조개로 채운다. 오늘 출석을 누르면 어제가
              구간의 끝이 아니게 되므로 어제 칸은 자동으로 조개로 바뀐다.
            */}
            {day.isAttended && (
              <span
                className={
                  day.isRunEnd
                    ? "attendance-stamp"
                    : "attendance-stamp attendance-stamp-seashell"
                }
              >
                <img
                  src={day.isRunEnd ? stampImage : seashellFor(day.streak)}
                  alt=""
                  aria-hidden="true"
                />

                {day.isRunEnd && (
                  <span className="attendance-stamp-streak">{day.streak}</span>
                )}

                <span className="attendance-day-reader">
                  {day.key} 출석 완료, {day.streak}일째
                </span>
              </span>
            )}

            {day.isToday && !day.isAttended && (
              <button
                className="attendance-check-button"
                type="button"
                onClick={() => markAttendance(fromDateKey(day.key))}
              >
                출석하기
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
