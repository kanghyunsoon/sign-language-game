/**
 * accessToken / refreshToken을 localStorage에 저장·조회·삭제한다.
 *
 * localStorage 접근이 불가능한 환경(SSR, 프라이버시 모드 등)에서도 앱이 죽지 않도록
 * 모든 접근을 방어적으로 감싼다.
 */

const ACCESS_TOKEN_KEY = "handpractice.auth.accessToken";
const REFRESH_TOKEN_KEY = "handpractice.auth.refreshToken";

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(key: string): string | null {
  try {
    return safeStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    safeStorage()?.setItem(key, value);
  } catch {
    // 저장 실패는 무시한다(메모리 상태는 AuthContext가 유지).
  }
}

function remove(key: string): void {
  try {
    safeStorage()?.removeItem(key);
  } catch {
    // no-op
  }
}

export function getAccessToken(): string | null {
  return read(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return read(REFRESH_TOKEN_KEY);
}

export function setTokens(tokens: { accessToken: string; refreshToken?: string }): void {
  write(ACCESS_TOKEN_KEY, tokens.accessToken);
  if (tokens.refreshToken !== undefined) write(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export function clearTokens(): void {
  remove(ACCESS_TOKEN_KEY);
  remove(REFRESH_TOKEN_KEY);
}
