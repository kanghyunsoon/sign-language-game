import { useCallback, useSyncExternalStore } from "react";

/**
 * 출석 기록 저장소와 날짜 계산.
 *
 * 백엔드에 출석 API가 아직 없어 localStorage에 날짜 목록만 담아 둔다.
 * 화면은 아래 훅과 조작 함수만 쓰므로, API로 바꿀 때 read/write 구현만 교체하면 된다.
 * 날짜 계산은 순수 함수로 분리해 today를 주입받는다(테스트에서 시점을 고정하기 위해).
 */
const STORAGE_KEY = "handpractice.attendance";

/** 하루를 나타내는 키. 현지 시간 기준 YYYY-MM-DD. */
export type DateKey = string;

/** localStorage를 못 쓰는 환경(SSR·프라이빗 모드)에서 쓰는 대체 저장소. */
let memoryFallback: DateKey[] | null = null;

/** 마지막으로 읽어 둔 목록. useSyncExternalStore가 같은 참조를 받도록 캐시한다. */
let cachedDates: readonly DateKey[] | null = null;

const listeners = new Set<() => void>();

/**
 * 현지 시간 기준으로 날짜 키를 만든다.
 * toISOString은 UTC로 바꿔 자정 무렵 하루가 밀리므로 쓰지 않는다.
 */
export function toDateKey(date: Date): DateKey {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/** 날짜 키를 그 날 자정의 Date로 되돌린다. */
export function fromDateKey(key: DateKey): Date {
  const [year, month, day] = key.split("-").map(Number);

  return new Date(year, month - 1, day);
}

/** 기준일에서 days만큼 옮긴 날짜. 월·연 넘김은 Date가 알아서 처리한다. */
function addDays(date: Date, days: number): Date {
  const moved = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  moved.setDate(moved.getDate() + days);

  return moved;
}

/**
 * 그 주의 월요일. 주 시작을 월요일로 두므로 일요일(0)은 6일 전으로 돌린다.
 */
export function startOfWeek(date: Date): Date {
  const dayOfWeek = date.getDay();
  const offsetFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  return addDays(date, -offsetFromMonday);
}

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"] as const;

/**
 * 칸에 표시할 날짜 라벨.
 * 매달 1일은 어느 달인지 알 수 있게 월을 함께 적는다. (30(목) / 8/1(토))
 */
export function formatDayLabel(date: Date): string {
  const day = date.getDate();
  const weekday = WEEKDAY_LABELS[(date.getDay() + 6) % 7];
  const dayText = day === 1 ? `${date.getMonth() + 1}/${day}` : String(day);

  return `${dayText}(${weekday})`;
}

/**
 * 그 날짜에서 끝나는 연속 출석 일수. 출석하지 않은 날은 0이다.
 * 칸에 오버레이할 숫자와 헤더의 연속 일수가 같은 계산을 쓴다.
 */
export function streakEndingAt(
  attendedDates: readonly DateKey[],
  date: Date,
): number {
  const attended = new Set(attendedDates);
  let streak = 0;
  let cursor = date;

  while (attended.has(toDateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

/**
 * 헤더에 보여줄 현재 연속 일수.
 * 오늘 아직 출석하지 않았다면 어제까지의 연속을 그대로 보여준다(오늘 끊긴 것으로 치지 않는다).
 */
export function currentStreak(
  attendedDates: readonly DateKey[],
  today: Date,
): number {
  const todayStreak = streakEndingAt(attendedDates, today);

  return todayStreak > 0
    ? todayStreak
    : streakEndingAt(attendedDates, addDays(today, -1));
}

/** 출석체크 격자의 한 칸. */
export interface AttendanceDay {
  readonly key: DateKey;
  readonly label: string;
  readonly isToday: boolean;
  /** 오늘보다 뒤인 날. 아직 출석할 수 없다. */
  readonly isFuture: boolean;
  readonly isAttended: boolean;
  /** 출석한 날이면 그 날 기준 연속 일수, 아니면 0. */
  readonly streak: number;
}

/** 격자 한 행(월~일)의 칸 수. */
export const DAYS_PER_WEEK = 7;

/**
 * 지난주 월요일부터 이번주 일요일까지 14칸.
 * 앞 7칸이 지난주, 뒤 7칸이 이번주다.
 */
export function buildTwoWeekCalendar(
  attendedDates: readonly DateKey[],
  today: Date,
): AttendanceDay[] {
  const thisMonday = startOfWeek(today);
  const firstDay = addDays(thisMonday, -DAYS_PER_WEEK);
  const todayKey = toDateKey(today);

  return Array.from({ length: DAYS_PER_WEEK * 2 }, (_, offset) => {
    const date = addDays(firstDay, offset);
    const key = toDateKey(date);
    const isAttended = attendedDates.includes(key);

    return {
      key,
      label: formatDayLabel(date),
      isToday: key === todayKey,
      isFuture: key > todayKey,
      isAttended,
      streak: isAttended ? streakEndingAt(attendedDates, date) : 0,
    };
  });
}

/* ------------------------------- 저장소 ------------------------------- */

function readStorage(): DateKey[] {
  if (memoryFallback) return memoryFallback;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // 손으로 고친 값이 섞여도 화면이 깨지지 않게 형식을 확인한다.
    return parsed.filter(
      (value): value is DateKey =>
        typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value),
    );
  } catch {
    return [];
  }
}

function writeStorage(dates: readonly DateKey[]) {
  cachedDates = dates;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dates));
  } catch {
    // 저장이 막힌 환경에서도 화면 동작은 유지한다.
    memoryFallback = [...dates];
  }

  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 저장된 날짜 목록. 내용이 바뀌지 않았다면 같은 배열 참조를 돌려준다. */
function getSnapshot(): readonly DateKey[] {
  if (!cachedDates) cachedDates = readStorage();
  return cachedDates;
}

/** 서버 렌더링 스냅샷. 매번 같은 참조여야 하므로 모듈 상수로 둔다. */
const EMPTY_DATES: readonly DateKey[] = [];

/** 그 날을 출석 처리한다. 이미 출석했으면 아무 일도 하지 않는다. */
export function markAttendance(date: Date) {
  const key = toDateKey(date);
  const dates = getSnapshot();
  if (dates.includes(key)) return;

  writeStorage([...dates, key].sort());
}

/** 출석한 날짜 목록. */
export function useAttendance(): readonly DateKey[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_DATES);
}

/** 출석 처리 콜백. 컴포넌트에서 안정적인 참조로 쓰려고 훅으로 감쌌다. */
export function useMarkAttendance() {
  return useCallback((date: Date) => markAttendance(date), []);
}

/** 테스트에서 저장소를 비운다. */
export function resetAttendanceForTest() {
  memoryFallback = null;
  cachedDates = null;

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 저장소를 못 쓰는 환경이면 위의 초기화만으로 충분하다.
  }
}
