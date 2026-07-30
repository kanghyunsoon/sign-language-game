import "./SiteFooter.css";

interface SiteFooterProps {
  /**
   * 캔버스 방식에 맞는 크기 변형.
   * - "fixed": 1920x1200 캔버스를 transform으로 축소하는 화면(테스트·사전·오답노트).
   *   캔버스가 통째로 축소되므로 px으로 적어야 다른 요소와 같은 비율로 줄어든다.
   * - "fluid": min(vw, vh)로 크기를 적는 화면(메인·연습·마이페이지).
   */
  readonly sizing?: "fixed" | "fluid";
}

/** 모든 화면 하단에 공통으로 놓이는 바. */
export function SiteFooter({ sizing = "fluid" }: SiteFooterProps) {
  return (
    <footer className={`site-footer site-footer-${sizing}`}>
      <a href="#">이용약관</a>
      <a href="#">개인정보처리방침</a>
      <a href="#">문의하기</a>
    </footer>
  );
}
