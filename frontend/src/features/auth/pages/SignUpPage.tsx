import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AuthApiError, signup } from "../api/authApi";
import backgroundLeft from "../assets/background_left.png";
import backgroundRight from "../assets/background_right.png";
import otterBook from "../assets/otter_book.png";
import { PasswordVisibilityIcon } from "../components/PasswordVisibilityIcon";
import "./SignUpPage.css";

export function SignUpPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  async function handleSignUpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const formData = new FormData(event.currentTarget);
    const nickname = String(formData.get("nickname") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

    setError(null);
    if (nickname.length < 2 || nickname.length > 10) {
      setError("닉네임은 2자 이상 10자 이하로 입력해주세요.");
      return;
    }
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
                  placeholder="2~10자 이내로 입력해주세요."
                  autoComplete="nickname"
                  minLength={2}
                  maxLength={10}
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

                <div className="signup-password-input">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    placeholder="영문, 숫자 포함 8자 이상"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="signup-password-toggle"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                    aria-pressed={showPassword}
                  >
                    <PasswordVisibilityIcon visible={showPassword} />
                  </button>
                </div>
              </label>

              <label className="signup-field">
                <span>비밀번호 확인</span>

                <div className="signup-password-input">
                  <input
                    type={showPasswordConfirm ? "text" : "password"}
                    name="passwordConfirm"
                    placeholder="비밀번호를 다시 입력해주세요"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="signup-password-toggle"
                    onClick={() =>
                      setShowPasswordConfirm((visible) => !visible)
                    }
                    aria-label={
                      showPasswordConfirm
                        ? "비밀번호 확인 숨기기"
                        : "비밀번호 확인 보기"
                    }
                    aria-pressed={showPasswordConfirm}
                  >
                    <PasswordVisibilityIcon visible={showPasswordConfirm} />
                  </button>
                </div>
              </label>

              {/* <label className="signup-agreement">
                <input
                  type="checkbox"
                  name="agreement"
                  required
                />

                <span>이용약관 및 개인정보처리방침에 동의합니다.</span>
              </label> */}
              {error && (
                <p className="signup-error" role="alert">
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
