import stampImage from "../../../shared/assets/stamp.webp";
import {
  DAYS_PER_WEEK,
  buildTwoWeekCalendar,
  currentStreak,
  fromDateKey,
  useAttendance,
  useMarkAttendance,
} from "../data/attendance";

interface AttendanceCardProps {
  /** 기준일. 테스트에서 시점을 고정하려고 주입할 수 있다. */
  readonly today?: Date;
}

/** 지난주·이번주 출석 현황을 보여주고 오늘 출석을 남기는 카드. */
export function AttendanceCard({ today = new Date() }: AttendanceCardProps) {
  const attendedDates = useAttendance();
  const markAttendance = useMarkAttendance();

  const days = buildTwoWeekCalendar(attendedDates, today);
  const streak = currentStreak(attendedDates, today);

  return (
    <section className="attendance-card" aria-label="출석체크">
      <header className="attendance-heading">
        <strong className="attendance-streak">
          {streak}일째 연속 학습 중이에요!
        </strong>

        <span className="attendance-total">총 {attendedDates.length}일 방문</span>
      </header>

      {/* 앞 7칸이 지난주, 뒤 7칸이 이번주다. 행 구분은 CSS 그리드가 맡는다. */}
      <ol className="attendance-grid">
        {days.map((day, index) => {
          const weekLabel = index < DAYS_PER_WEEK ? "지난주" : "이번주";

          return (
            <li
              className={[
                "attendance-day",
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
                  <img src={stampImage} alt="" aria-hidden="true" />

                  {/* 스탬프 위에 그 날 기준 연속 일수를 얹는다. */}
                  <span className="attendance-stamp-streak">{day.streak}</span>

                  <span className="attendance-day-reader">
                    {weekLabel} {day.label} 출석 완료, {day.streak}일째
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
          );
        })}
      </ol>
    </section>
  );
}
