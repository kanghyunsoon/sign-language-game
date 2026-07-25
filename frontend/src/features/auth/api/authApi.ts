/**
 * 배포 백엔드(Swagger 확정 계약) 인증 API 클라이언트.
 *
 * 계약(https://i15a405.p.ssafy.io/api):
 * - POST /auth/login   {email,password}                 -> {accessToken, refreshToken}
 * - GET  /users/me     (Bearer)                         -> {id, nickname}
 * - POST /auth/signup  {email,password(>=8),nickname}   -> 201 {id,email,nickname}
 *
 * 인증 헤더: Authorization: Bearer <accessToken>
 */

/** VITE_API_BASE_URL(기본 "/api")에서 후행 슬래시를 제거한 API 베이스. */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL?.trim() || "/api").replace(/\/$/, "");

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}

export interface LoginResponse {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface SignupRequest {
  readonly email: string;
  /** 백엔드 계약상 8자 이상. */
  readonly password: string;
  readonly nickname: string;
}

export interface SignupResponse {
  readonly id: number | string;
  readonly email: string;
  readonly nickname: string;
}

/** GET /users/me 응답. userId는 String(id)로 파생한다(로그인 응답에는 userId가 없음). */
export interface MeResponse {
  readonly id: number | string;
  readonly nickname: string;
}

/** 서버가 내려준 메시지를 최대한 보존하는 인증 에러. */
export class AuthApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AuthApiError";
  }
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...init.headers,
      },
    });
  } catch {
    throw new AuthApiError("네트워크 오류로 요청을 완료하지 못했습니다.", 0);
  }

  if (!response.ok) {
    throw new AuthApiError(await extractErrorMessage(response), response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.clone().json()) as { message?: unknown; error?: unknown };
    const message = body.message ?? body.error;
    if (typeof message === "string" && message.trim().length > 0) return message;
  } catch {
    // JSON 본문이 아니면 상태 코드 기반 기본 메시지로 대체한다.
  }
  if (response.status === 401) return "이메일 또는 비밀번호가 올바르지 않습니다.";
  return `요청이 실패했습니다. (HTTP ${response.status})`;
}

function authHeader(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export function login(request: LoginRequest): Promise<LoginResponse> {
  return requestJson<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function signup(request: SignupRequest): Promise<SignupResponse> {
  return requestJson<SignupResponse>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function getMe(accessToken: string): Promise<MeResponse> {
  return requestJson<MeResponse>("/users/me", {
    method: "GET",
    headers: authHeader(accessToken),
  });
}

/**
 * 리프레시 토큰으로 accessToken을 재발급한다.
 *
 * 주의: 재발급 엔드포인트 경로는 확정 계약에 포함되지 않아 잠정값(POST /auth/refresh)이며,
 * 자동 재발급 배선은 이번 범위(P0-C)에 포함하지 않는다(별도 작업). 실제 경로 확인 후 연결한다.
 */
export function refresh(refreshToken: string): Promise<LoginResponse> {
  return requestJson<LoginResponse>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
}
