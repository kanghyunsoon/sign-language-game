const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL?.trim() || "/api").replace(/\/$/, "");

export interface PetGrowth {
  readonly level: number;
  readonly currentExp: number;
  readonly expToNextLevel: number | null;
  readonly evolutionStage: string;
  readonly maxLevel: number;
}

export interface AttendanceStatus {
  readonly attendanceDate: string;
  readonly attendedToday: boolean;
  readonly streakCount: number;
}

export type RankingGameType = "SIGN_DUEL" | "TETRIS_DUEL" | "TETRIS_SOLO";

export interface RankingEntry {
  readonly rank: number;
  readonly userId: number;
  readonly nickname: string;
  readonly score: number;
  readonly playDurationMs: number | null;
}

export interface RankingResponse {
  readonly top: readonly RankingEntry[];
  readonly me: RankingEntry | null;
}

export class ProfileApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ProfileApiError";
  }
}

async function getJson<T>(path: string, accessToken: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    throw new ProfileApiError("프로필 정보를 불러오는 중 네트워크 오류가 발생했습니다.", 0);
  }

  if (!response.ok) {
    throw new ProfileApiError(
      `프로필 정보를 불러오지 못했습니다. (HTTP ${response.status})`,
      response.status,
    );
  }

  return (await response.json()) as T;
}

export function getPetGrowth(accessToken: string): Promise<PetGrowth> {
  return getJson<PetGrowth>("/growth/pet", accessToken);
}

export function getAttendance(accessToken: string): Promise<AttendanceStatus> {
  return getJson<AttendanceStatus>("/growth/attendance", accessToken);
}

export function getRanking(
  accessToken: string,
  gameType: RankingGameType,
): Promise<RankingResponse> {
  return getJson<RankingResponse>(
    `/rankings?gameType=${encodeURIComponent(gameType)}`,
    accessToken,
  );
}
