import { Link, useLocation } from "react-router-dom";

import { BgmToggleButton } from "../bgm/BgmToggleButton";

/**
 * 학습 화면 공통 네비게이션 바.
 *
 * 페이지마다 `main-nav`, `test-nav`처럼 접두어만 다른 같은 마크업을 들고 있었다.
 * 마크업만 이곳으로 모으고 클래스 이름은 그대로 찍어, 페이지별 CSS는 손대지 않는다.
 */
const NAV_ITEMS = [
  { to: "/main", label: "메인페이지" },
  { to: "/practice", label: "연습" },
  { to: "/test", label: "테스트" },
  { to: "/review-notes", label: "오답노트" },
  { to: "/dictionary", label: "사전" },
  { to: "/game", label: "게임" },
] as const;

interface AppNavProps {
  /** 클래스 접두어. `main`을 주면 `main-nav`, `main-mypage-button`을 찍는다. */
  readonly prefix: string;
  /** 배경음악 버튼 크기 기준. 1920x1200 고정 캔버스 페이지는 "fixed". */
  readonly metric?: "viewport" | "fixed";
  /** 헤더 왼쪽에 뒤로가기 버튼이 있는 화면. 배경음악 버튼을 그 옆으로 민다. */
  readonly hasBackButton?: boolean;
}

function isActivePath(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function AppNav({ prefix, metric = "viewport", hasBackButton = false }: AppNavProps) {
  const { pathname } = useLocation();
  const onProfile = isActivePath(pathname, "/profile");

  return (
    <>
      <BgmToggleButton metric={metric} offsetForBackButton={hasBackButton} />

      <nav className={`${prefix}-nav`} aria-label="주요 메뉴">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            className={isActivePath(pathname, item.to) ? "active" : undefined}
            to={item.to}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <Link
        className={`${prefix}-mypage-button`}
        to="/profile"
        aria-current={onProfile ? "page" : undefined}
      >
        마이페이지
      </Link>
    </>
  );
}
