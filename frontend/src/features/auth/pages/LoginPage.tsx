import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../AuthContext";
import { AuthApiError } from "../api/authApi";
import backgroundLeft from "../assets/background_left.png";
import backgroundRight from "../assets/background_right.png";
import otterBook from "../assets/otter_book.png";
import "./LoginPage.css";

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    setError(null);
    setSubmitting(true);
    try {
      // 로그인 성공 시 토큰 저장 + /users/me로 userId 확보(AuthContext.login 내부 처리) 후 이동.
      await login(email, password);
      navigate("/main");
    } catch (caught) {
      setError(
        caught instanceof AuthApiError
          ? caught.message
          : "로그인 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-canvas">
        <img
          className="login-background-decoration login-decoration-left"
          src={backgroundLeft}
          alt=""
          aria-hidden="true"
        />

        <img
          className="login-background-decoration login-decoration-right"
          src={backgroundRight}
          alt=""
          aria-hidden="true"
        />

        <section className="login-card">
          <div className="login-image-area">
            <img
              className="login-image"
              src={otterBook}
              alt="책을 읽고 있는 수달 캐릭터"
            />
          </div>

          <div className="login-content">
            <span className="login-eyebrow">WELCOME</span>
            <h1 className="login-title">로그인</h1>
            <form className="login-form" onSubmit={handleLoginSubmit}>
              
              <label className="login-field">
                <span>이메일</span>
                <input
                  type="email"
                  name="email"
                  placeholder="example@email.com"
                  autoComplete="email"
                  required
                />
              </label>

              <label className="login-field">
                <span>비밀번호</span>

                <input
                  type="password"
                  name="password"
                  placeholder="영문, 숫자 포함 8자 이상"
                  autoComplete="current-password"
                  required
                />
              </label>

              <div className="login-options">
                <label className="login-remember">
                  <input type="checkbox" name="remember" />
                  <span>로그인 유지</span>
                </label>

                <div className="login-help-links">
                  <a href="#">아이디 찾기</a>
                  <span aria-hidden="true">·</span>
                  <a href="#">비밀번호 찾기</a>
                </div>
              </div>

              {error && (
                <p className="login-error" role="alert" style={{ color: "#d64545", margin: 0 }}>
                  {error}
                </p>
              )}

              <button className="login-submit-button" type="submit" disabled={submitting}>
                {submitting ? "로그인 중…" : "로그인"}
              </button>
            </form>


            <p className="login-signup-guide">
              아직 회원이 아니신가요?

              <Link to="/signup">회원가입</Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}