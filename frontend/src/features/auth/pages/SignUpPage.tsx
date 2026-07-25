import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AuthApiError, signup } from "../api/authApi";
import backgroundLeft from "../assets/background_left.png";
import backgroundRight from "../assets/background_right.png";
import otterBook from "../assets/otter_book.png";
import "./SignUpPage.css";

export function SignUpPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSignUpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const formData = new FormData(event.currentTarget);
    const nickname = String(formData.get("nickname") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

    setError(null);
    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setSubmitting(true);
    try {
      await signup({ email, password, nickname });
      // 가입 성공 시 로그인 화면으로 이동한다.
      navigate("/login");
    } catch (caught) {
      setError(
        caught instanceof AuthApiError
          ? caught.message
          : "회원가입 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.",
      );
    } finally {
      setSubmitting(false);
    }
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
              {error && (
                <p className="signup-error" role="alert" style={{ color: "#d64545", margin: 0 }}>
                  {error}
                </p>
              )}

              <button className="signup-submit-button" type="submit" disabled={submitting}>
                {submitting ? "가입 중…" : "가입하기"}
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