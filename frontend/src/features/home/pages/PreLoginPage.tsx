import { useNavigate } from "react-router-dom";

import backgroundLeft from "../assets/background_left.png";
import backgroundRight from "../assets/background_right.png";
import otterBook from "../assets/otter_book.png";
import "./PreLoginPage.css";

export function PreLoginPage() {
  const navigate = useNavigate();

  // 지금 시작하기 버튼을 누르면 로그인 화면으로 이동
  function handleStartClick() {
    navigate("/login");
  }

  return (
    <main className="pre-login-page">
      <div className="pre-login-canvas">
        {/* 배경 왼쪽 아래 장식 */}
        <img
          className="pre-login-background-decoration pre-login-decoration-left"
          src={backgroundLeft}
          alt=""
          aria-hidden="true"
        />

        {/* 배경 오른쪽 위 장식 */}
        <img
          className="pre-login-background-decoration pre-login-decoration-right"
          src={backgroundRight}
          alt=""
          aria-hidden="true"
        />

        {/* 로그인 전 화면의 중앙 콘텐츠 카드 */}
        <section className="pre-login-card">
          {/* 서비스 캐릭터 이미지 영역 */}
          <div className="pre-login-image-area">
            <img
              className="pre-login-image"
              src={otterBook}
              alt="책을 읽고 있는 수달 캐릭터"
            />
          </div>

          {/* 서비스 소개 및 시작 버튼 영역 */}
          <div className="pre-login-content">
            <h1 className="pre-login-title">수어의 달인</h1>

            <p className="pre-login-description">
              수어가 처음이어도 괜찮아요.
              <br />
              수달과 함께 차근차근 재미있게 익혀보세요.
            </p>

            <button
              className="pre-login-button"
              type="button"
              onClick={handleStartClick}
            >
              지금 시작하기 →
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}