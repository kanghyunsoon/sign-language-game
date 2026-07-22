import { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import backgroundLeft from "../assets/background_left.png";
import backgroundRight from "../assets/background_right.png";
import otterBook from "../assets/otter_book.png";
import "./SignUpPage.css";

export function SignUpPage() {
  const navigate = useNavigate();

  function handleSignUpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // 회원가입 API 연결 전 임시로 로그인 페이지로 이동
    navigate("/login");
  }

  return (
    <main className="signup-page">
      <div className="signup-canvas">
        <img
          className="signup-background-decoration signup-decoration-left"
          src={backgroundLeft}
          alt=""
          aria-hidden="true"
        />

        <img
          className="signup-background-decoration signup-decoration-right"
          src={backgroundRight}
          alt=""
          aria-hidden="true"
        />

        <section className="signup-card">
          <div className="signup-image-area">
            <img
              className="signup-image"
              src={otterBook}
              alt="책을 읽고 있는 수달 캐릭터"
            />
          </div>

          <div className="signup-content">
            <span className="signup-eyebrow">WELCOME</span>

            <h1 className="signup-title">회원가입</h1>

            <form className="signup-form" onSubmit={handleSignUpSubmit}>
              <label className="signup-field">
                <span>닉네임</span>

                <input
                  type="text"
                  name="nickname"
                  placeholder="닉네임을 입력해주세요"
                  autoComplete="nickname"
                  required
                />
              </label>

              <label className="signup-field">
                <span>이메일</span>

                <input
                  type="email"
                  name="email"
                  placeholder="example@email.com"
                  autoComplete="email"
                  required
                />
              </label>

              <label className="signup-field">
                <span>비밀번호</span>

                <input
                  type="password"
                  name="password"
                  placeholder="영문, 숫자 포함 8자 이상"
                  autoComplete="new-password"
                  required
                />
              </label>

              <label className="signup-field">
                <span>비밀번호 확인</span>

                <input
                  type="password"
                  name="passwordConfirm"
                  placeholder="비밀번호를 다시 입력해주세요"
                  autoComplete="new-password"
                  required
                />
              </label>

              <label className="signup-agreement">
                <input
                  type="checkbox"
                  name="agreement"
                  required
                />

                <span>이용약관 및 개인정보처리방침에 동의합니다.</span>
              </label>
              <button className="signup-submit-button" type="submit">
                가입하기
              </button>
            </form>

            <p className="signup-login-guide">
              이미 계정이 있으신가요?

              <Link to="/login">로그인</Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}