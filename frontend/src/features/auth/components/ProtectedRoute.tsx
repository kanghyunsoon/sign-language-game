import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";

import { useAuth } from "../AuthContext";

interface ProtectedRouteProps {
  readonly children: ReactNode;
}

/**
 * 인증된 사용자(accessToken + user)만 접근을 허용한다.
 * 세션 복원이 끝나기 전에는 성급한 리다이렉트를 막기 위해 아무것도 렌더링하지 않는다.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { accessToken, user, ready } = useAuth();

  if (!ready) return null;
  if (!accessToken || !user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
