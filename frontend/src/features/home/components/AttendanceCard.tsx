import { useState } from "react";

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
  stampVariantFor,
  toMonthCursor,
  useAttendance,
  useMarkAttendance,
} from "../data/attendance";

/** 출석한 날에 찍는 조개. 어느 것이 놓일지는 날짜마다 무작위로 정해진다. */
const seashellImages = [seashell01, seashell02, seashell03, seashell04];

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

            {day.isAttended && (
              <span className="attendance-stamp">
                <img
                  src={
                    seashellImages[
                      stampVariantFor(day.key, seashellImages.length)
                    ]
                  }
                  alt=""
                  aria-hidden="true"
                />

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
