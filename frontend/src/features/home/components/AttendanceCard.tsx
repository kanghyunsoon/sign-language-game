import { useEffect, useState } from "react";

import otterClapImage from "../../learning/assets/otter_clap.png";
import {
  checkIn,
  getAttendance,
  getAttendanceCalendar,
  getPetGrowth,
  type AttendanceCompletion,
  type AttendanceStatus,
  type PetGrowth,
} from "../../profile/api/profileApi";
import { HabitatUnlockModal } from "../../profile/components/HabitatUnlockModal";
import {
  findNewlyUnlockedHabitatLevel,
  type HabitatUnlockLevel,
} from "../../profile/data/habitatUnlock";
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
import "./AttendanceCard.css";

/** 출석한 날에 찍는 조개. 어느 것이 놓일지는 날짜마다 무작위로 정해진다. */
const seashellImages = [seashell01, seashell02, seashell03, seashell04];

interface AttendanceCardProps {
  /** 기준일. 테스트에서 시점을 고정하려고 주입할 수 있다. */
  readonly today?: Date;
  readonly accessToken?: string | null;
  readonly userId?: string | null;
  readonly onPetUpdated?: (pet: PetGrowth) => void;
  readonly onAttendanceUpdated?: (attendance: AttendanceCompletion) => void;
}

/** 한 달 출석 현황을 보여주고 오늘 출석을 남기는 카드. */
export function AttendanceCard({
  today = new Date(),
  accessToken,
  userId,
  onPetUpdated,
  onAttendanceUpdated,
}: AttendanceCardProps) {
  const localAttendedDates = useAttendance();
  const markAttendance = useMarkAttendance();

  const [cursor, setCursor] = useState(() => toMonthCursor(today));
  const [remoteAttendedDates, setRemoteAttendedDates] = useState<readonly string[]>([]);
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(Boolean(accessToken && userId));
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const [completion, setCompletion] =
    useState<AttendanceCompletion | null>(null);
  const [unlockedHabitatLevel, setUnlockedHabitatLevel] =
    useState<HabitatUnlockLevel | null>(null);

  const usesAttendanceApi = Boolean(accessToken && userId);

  useEffect(() => {
    if (!accessToken || !userId) {
      setAttendanceStatus(null);
      return;
    }

    let cancelled = false;
    void getAttendance(accessToken)
      .then((status) => {
        if (!cancelled) setAttendanceStatus(status);
      })
      .catch((caught) => {
        if (!cancelled) {
          setCheckInError(
            caught instanceof Error
              ? caught.message
              : "출석 상태를 불러오지 못했습니다.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, userId]);

  useEffect(() => {
    if (!accessToken || !userId) {
      setRemoteAttendedDates([]);
      setAttendanceLoading(false);
      return;
    }

    let cancelled = false;
    setAttendanceLoading(true);
    setCheckInError(null);
    const yearMonth = `${cursor.year}-${String(cursor.month).padStart(2, "0")}`;

    void getAttendanceCalendar(accessToken, userId, yearMonth)
      .then((calendar) => {
        if (!cancelled) setRemoteAttendedDates(calendar.attendedDates);
      })
      .catch((caught) => {
        if (!cancelled) {
          setRemoteAttendedDates([]);
          setCheckInError(
            caught instanceof Error
              ? caught.message
              : "출석 달력을 불러오지 못했습니다.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setAttendanceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, cursor.month, cursor.year, userId]);

  useEffect(() => {
    if (!completion) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCompletion(null);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [completion]);

  const attendedDates = usesAttendanceApi ? remoteAttendedDates : localAttendedDates;
  const days = buildMonthCalendar(attendedDates, cursor, today);
  const streak = usesAttendanceApi
    ? (attendanceStatus?.streakCount ?? 0)
    : currentStreak(attendedDates, today);

  const handleCheckIn = async (date: Date) => {
    if (!accessToken) {
      markAttendance(date);
      return;
    }

    setCheckingIn(true);
    setCheckInError(null);

    try {
      const previousGrowth = await getPetGrowth(accessToken).catch(() => null);
      const result = await checkIn(accessToken);
      setAttendanceStatus(result);
      onAttendanceUpdated?.(result);
      setRemoteAttendedDates((current) =>
        current.includes(result.attendanceDate)
          ? current
          : [...current, result.attendanceDate].sort(),
      );
      onPetUpdated?.(result.pet);
      if (result.newlyAttended && result.awardedExp > 0) {
        const unlockedLevel = previousGrowth
          ? findNewlyUnlockedHabitatLevel(
              previousGrowth.level,
              result.pet.level,
            )
          : null;

        if (unlockedLevel) {
          setUnlockedHabitatLevel(unlockedLevel);
        } else {
          setCompletion(result);
        }
      }
    } catch (caught) {
      setCheckInError(
        caught instanceof Error
          ? caught.message
          : "출석체크를 완료하지 못했습니다.",
      );
    } finally {
      setCheckingIn(false);
    }
  };

  return (
    <section className="attendance-card" aria-label="출석체크">
      <header className="attendance-heading">
        <strong className="attendance-streak">
          {streak}일째 연속 학습 중이에요!
        </strong>

        <span className="attendance-total">
          {usesAttendanceApi ? "이번 달" : "총"} {attendedDates.length}일 방문
        </span>
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
                disabled={checkingIn || attendanceLoading}
                onClick={() => void handleCheckIn(fromDateKey(day.key))}
              >
                출석하기
              </button>
            )}
          </li>
        ))}
      </ol>

      {checkInError && (
        <p className="attendance-check-error" role="alert">
          {checkInError}
        </p>
      )}

      {completion && (
        <div
          className="attendance-reward-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="attendance-reward-title"
        >
          <section className="attendance-reward-card">
            <button
              className="attendance-reward-close"
              type="button"
              aria-label="경험치 획득 창 닫기"
              onClick={() => setCompletion(null)}
            >
              ×
            </button>
            <img src={otterClapImage} alt="" aria-hidden="true" />
            <h2 id="attendance-reward-title">
              {completion.awardedExp}XP를 얻었어요!
            </h2>
            <p>출석체크를 해서 {completion.awardedExp}XP를 얻었어요.</p>
          </section>
        </div>
      )}
      {unlockedHabitatLevel && (
        <HabitatUnlockModal
          unlockedLevel={unlockedHabitatLevel}
          onClose={() => setUnlockedHabitatLevel(null)}
        />
      )}
    </section>
  );
}
