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

/** 달력 첫 줄에 놓는 요일 이름. 주 시작이 월요일이라 월요일부터 적는다. */
export const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"] as const;

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

/**
 * 비트를 고루 흩는다.
 *
 * 스탬프를 고를 때 나머지 연산으로 하위 두 비트만 쓰기 때문에, 해시값이
 * 날짜에 조금이라도 규칙적으로 따라가면 그 규칙이 그대로 화면에 드러난다.
 * 실제로 처음 쓴 곱셈 해시(×31)는 7일 간격이 같은 값으로 떨어져 달력의
 * 같은 요일 열에 같은 조개가 줄줄이 찍혔다. 그래서 상위 비트를 하위로
 * 되섞어(murmur3의 마무리 단계) 한 비트만 달라도 값 전체가 바뀌게 한다.
 */
function avalanche(value: number): number {
  let hash = value | 0;

  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x21f0aaad);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x735a2d97);
  hash ^= hash >>> 15;

  return hash >>> 0;
}

/**
 * 그 날에 찍을 스탬프 그림의 순번. 날짜 키를 섞어 만든다.
 *
 * Math.random()을 쓰면 다시 그릴 때마다(달을 옮기거나 출석을 누를 때) 이미
 * 찍힌 스탬프가 바뀌어 깜빡인다. 날짜에서 값을 끌어내면 규칙은 보이지 않으면서
 * 같은 날은 언제나 같은 그림이 된다.
 *
 * 연·월·일을 모두 섞으므로 다른 달·다른 해의 같은 날짜도 서로 다른 그림이 된다.
 */
export function stampVariantFor(key: DateKey, variantCount: number): number {
  if (variantCount <= 0) return 0;

  // FNV-1a: 글자마다 XOR 후 곱해, 자리마다 값이 크게 벌어진다.
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return avalanche(hash) % variantCount;
}

/** 출석체크 격자의 한 칸. */
export interface AttendanceDay {
  readonly key: DateKey;
  /** 칸 왼쪽 위에 적을 날짜. 보통 숫자만, 달이 바뀌는 자리에는 8/1처럼 적는다. */
  readonly label: string;
  /** 보고 있는 달에 속한 날인지. 앞뒤 달에서 채운 칸은 흐리게 보여준다. */
  readonly isCurrentMonth: boolean;
  readonly isToday: boolean;
  /** 오늘보다 뒤인 날. 아직 출석할 수 없다. */
  readonly isFuture: boolean;
  readonly isAttended: boolean;
  /** 출석한 날이면 그 날 기준 연속 일수, 아니면 0. */
  readonly streak: number;
}

/** 격자 한 행(월~일)의 칸 수. */
export const DAYS_PER_WEEK = 7;

/** 달력이 보고 있는 달. month는 1~12. */
export interface MonthCursor {
  readonly year: number;
  readonly month: number;
}

/** 그 날짜가 속한 달. */
export function toMonthCursor(date: Date): MonthCursor {
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

/** 달력 상단에 적을 제목. */
export function formatMonthTitle(cursor: MonthCursor): string {
  return `${cursor.year}년 ${cursor.month}월`;
}

/** 달을 delta만큼 옮긴다. 연 넘김은 Date가 알아서 처리한다. */
export function shiftMonth(cursor: MonthCursor, delta: number): MonthCursor {
  const moved = new Date(cursor.year, cursor.month - 1 + delta, 1);

  return toMonthCursor(moved);
}

/**
 * 한 달 전체를 주 단위로 채운 달력.
 *
 * 첫 줄을 월요일로 맞추려고 앞뒤 달 날짜로 빈칸을 메운다. 라벨 규칙은
 * - 보고 있는 달: 숫자만 (30)
 * - 앞 달에서 끌어온 칸: 첫 칸에만 달을 함께 (6/29), 나머지는 숫자만
 * - 뒤 달에서 끌어온 칸: 1일에만 달을 함께 (8/1), 나머지는 숫자만
 */
export function buildMonthCalendar(
  attendedDates: readonly DateKey[],
  cursor: MonthCursor,
  today: Date,
): AttendanceDay[] {
  const firstOfMonth = new Date(cursor.year, cursor.month - 1, 1);
  const gridStart = startOfWeek(firstOfMonth);
  const lastOfMonth = new Date(cursor.year, cursor.month, 0);
  const gridEnd = addDays(startOfWeek(lastOfMonth), DAYS_PER_WEEK - 1);

  const dayCount =
    Math.round((gridEnd.getTime() - gridStart.getTime()) / 86_400_000) + 1;
  const todayKey = toDateKey(today);

  return Array.from({ length: dayCount }, (_, offset) => {
    const date = addDays(gridStart, offset);
    const key = toDateKey(date);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const isCurrentMonth =
      date.getFullYear() === cursor.year && month === cursor.month;
    const isAttended = attendedDates.includes(key);

    // 달이 바뀌는 자리에만 월을 덧붙여, 어느 달인지 헷갈리지 않게 한다.
    const needsMonth = !isCurrentMonth && (offset === 0 || day === 1);

    return {
      key,
      label: needsMonth ? `${month}/${day}` : String(day),
      isCurrentMonth,
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
