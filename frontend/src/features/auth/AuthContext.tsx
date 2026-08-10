import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import { getAccessToken, clearTokens, setTokens } from "./token/tokenStore";
import { AuthApiError, getMe, login as loginRequest, logout as logoutRequest } from "./api/authApi";

/** GameModule이 요구하는 형태와 동일한 인증 사용자. userId = String(id), displayName = nickname. */
export interface AuthUser {
  readonly userId: string;
  readonly displayName: string;
}

export interface AuthContextValue {
  readonly accessToken: string | null;
  readonly user: AuthUser | null;
  /** 초기 세션 복원(localStorage 토큰 검증)이 끝났는지 여부. */
  readonly ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateDisplayName: (displayName: string) => void;
}

const USER_CACHE_KEY = "handpractice.auth.user";

const AuthContext = createContext<AuthContextValue | null>(null);

function readCachedUser(): AuthUser | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    if (typeof parsed.userId === "string" && typeof parsed.displayName === "string") {
      return { userId: parsed.userId, displayName: parsed.displayName };
    }
  } catch {
    // 손상된 캐시는 무시한다.
  }
  return null;
}

function writeCachedUser(user: AuthUser | null): void {
  try {
    if (typeof window === "undefined") return;
    if (user) window.localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(USER_CACHE_KEY);
  } catch {
    // no-op
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [accessToken, setAccessToken] = useState<string | null>(() => getAccessToken());
  const [user, setUser] = useState<AuthUser | null>(() => readCachedUser());
  const [ready, setReady] = useState(false);
  const mountedRef = useRef(true);

  const logout = useCallback(async () => {
    const token = getAccessToken();
    try {
      if (token) await logoutRequest(token);
    } finally {
      clearTokens();
      writeCachedUser(null);
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const updateDisplayName = useCallback((displayName: string) => {
    setUser((currentUser) => {
      if (!currentUser) return currentUser;
      const updatedUser = { ...currentUser, displayName };
      writeCachedUser(updatedUser);
      return updatedUser;
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await loginRequest({ email, password });
    setTokens(tokens);
    // 로그인 응답에는 userId가 없어 /users/me로 확보한다.
    const me = await getMe(tokens.accessToken);
    const authUser: AuthUser = { userId: String(me.id), displayName: me.nickname };
    writeCachedUser(authUser);
    setAccessToken(tokens.accessToken);
    setUser(authUser);
  }, []);

  // 초기 세션 복원: 저장된 토큰이 유효한지 /users/me로 검증한다.
  useEffect(() => {
    mountedRef.current = true;
    const token = getAccessToken();
    if (!token) {
      setReady(true);
      return () => {
        mountedRef.current = false;
      };
    }
    void (async () => {
      try {
        const me = await getMe(token);
        if (!mountedRef.current) return;
        const authUser: AuthUser = { userId: String(me.id), displayName: me.nickname };
        writeCachedUser(authUser);
        setAccessToken(token);
        setUser(authUser);
      } catch (error) {
        if (!mountedRef.current) return;
        // 401 등 토큰 무효 시 세션을 정리한다(네트워크 오류는 캐시 유지).
        if (error instanceof AuthApiError && error.status === 401) void logout();
      } finally {
        if (mountedRef.current) setReady(true);
      }
    })();
    return () => {
      mountedRef.current = false;
    };
  }, [logout]);

  const value = useMemo<AuthContextValue>(
    () => ({ accessToken, user, ready, login, logout, updateDisplayName }),
    [accessToken, user, ready, login, logout, updateDisplayName],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth는 <AuthProvider> 내부에서만 사용할 수 있습니다.");
  return context;
}
