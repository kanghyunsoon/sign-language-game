import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import {
  AuthApiError,
  changePassword,
  deleteAccount,
  getProfile,
  updateProfile,
} from "../../auth/api/authApi";
import { PasswordVisibilityIcon } from "../../auth/components/PasswordVisibilityIcon";
import { DeleteAccountModal } from "../components/DeleteAccountModal";
import "./ProfileEditPage.css";

/**
 * 비밀번호 변경 API가 백엔드에 아직 없다.
 * 배포되면 이 상수를 true로 바꾸고 authApi의 PASSWORD_CHANGE_PATH를 실제 계약에 맞춘다.
 */
const PASSWORD_CHANGE_ENABLED = false;

const NICKNAME_MIN_LENGTH = 2;
const NICKNAME_MAX_LENGTH = 10;
const PASSWORD_MIN_LENGTH = 8;

export function ProfileEditPage() {
  const navigate = useNavigate();
  const { accessToken, user, logout, updateDisplayName } = useAuth();

  const [nickname, setNickname] = useState(user?.displayName ?? "");
  const [nicknameDraft, setNicknameDraft] = useState(user?.displayName ?? "");
  const [savingNickname, setSavingNickname] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [nicknameNotice, setNicknameNotice] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showNewPasswordConfirm, setShowNewPasswordConfirm] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);

  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    setNickname(user?.displayName ?? "");
    setNicknameDraft(user?.displayName ?? "");
  }, [user?.displayName]);

  useEffect(() => {
    if (!accessToken || !user?.userId) return;

    let cancelled = false;
    void getProfile(accessToken)
      .then((profile) => {
        if (cancelled) return;
        const nextNickname =
          typeof profile.nickname === "string" ? profile.nickname.trim() : "";
        if (nextNickname) {
          setNickname(nextNickname);
          setNicknameDraft(nextNickname);
          updateDisplayName(nextNickname);
        }
      })
      .catch((caught) => {
        if (cancelled) return;
        setNicknameError(
          caught instanceof AuthApiError
            ? caught.message
            : "프로필 정보를 불러오지 못했습니다.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, user?.userId, updateDisplayName]);

  async function handleNicknameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || savingNickname) return;

    const nextNickname = nicknameDraft.trim();
    setNicknameError(null);
    setNicknameNotice(null);

    if (
      nextNickname.length < NICKNAME_MIN_LENGTH ||
      nextNickname.length > NICKNAME_MAX_LENGTH
    ) {
      setNicknameError("닉네임은 2자 이상 10자 이하로 입력해 주세요.");
      return;
    }
    if (nextNickname === nickname) {
      setNicknameNotice("기존 닉네임과 같습니다.");
      return;
    }

    setSavingNickname(true);
    try {
      const updatedProfile = await updateProfile(accessToken, {
        nickname: nextNickname,
        profileImageUrl: null,
      });
      const savedNickname =
        typeof updatedProfile.nickname === "string" && updatedProfile.nickname.trim()
          ? updatedProfile.nickname.trim()
          : nextNickname;
      setNickname(savedNickname);
      setNicknameDraft(savedNickname);
      updateDisplayName(savedNickname);
      setNicknameNotice("닉네임을 변경했습니다.");
    } catch (caught) {
      setNicknameError(
        caught instanceof AuthApiError ? caught.message : "닉네임을 변경하지 못했습니다.",
      );
    } finally {
      setSavingNickname(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || savingPassword) return;

    setPasswordError(null);
    setPasswordNotice(null);

    if (!currentPassword) {
      setPasswordError("현재 비밀번호를 입력해 주세요.");
      return;
    }
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setPasswordError("새 비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setPasswordError("새 비밀번호가 일치하지 않습니다.");
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError("현재 비밀번호와 다른 비밀번호를 입력해 주세요.");
      return;
    }

    setSavingPassword(true);
    try {
      await changePassword(accessToken, { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setPasswordNotice("비밀번호를 변경했습니다.");
    } catch (caught) {
      setPasswordError(
        caught instanceof AuthApiError
          ? caught.message
          : "비밀번호를 변경하지 못했습니다.",
      );
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleDeleteAccount() {
    if (!accessToken || deletingAccount) return;

    setDeleteAccountError(null);
    setDeletingAccount(true);
    try {
      await deleteAccount(accessToken);
      await logout();
      navigate("/login");
    } catch (caught) {
      setDeleteAccountError(
        caught instanceof AuthApiError
          ? caught.message
          : "회원 탈퇴 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setDeletingAccount(false);
    }
  }

  return (
    <main className="profile-edit-page">
      <div className="profile-edit-canvas">
        <header className="profile-edit-header">
          <nav className="profile-edit-nav" aria-label="주요 메뉴">
            <Link to="/main">메인페이지</Link>
            <Link to="/practice">연습</Link>
            <Link to="/test">테스트</Link>
            <Link to="/review-notes">오답노트</Link>
            <Link to="/dictionary">사전</Link>
            <Link to="/game">게임</Link>
          </nav>
          <Link className="profile-edit-mypage-button" to="/profile">
            마이페이지
          </Link>
        </header>

        <div className="profile-edit-body">
          <div className="profile-edit-titlebar">
            <h1>정보 수정</h1>
            <p>닉네임과 비밀번호를 변경할 수 있어요.</p>
          </div>

          <section className="profile-edit-card" aria-labelledby="profile-edit-nickname-title">
            <h2 id="profile-edit-nickname-title">닉네임</h2>

            <form className="profile-edit-form" onSubmit={handleNicknameSubmit}>
              <label className="profile-edit-field">
                <span>닉네임</span>
                <input
                  type="text"
                  value={nicknameDraft}
                  placeholder="2~10자 이내로 입력해주세요."
                  autoComplete="nickname"
                  minLength={NICKNAME_MIN_LENGTH}
                  maxLength={NICKNAME_MAX_LENGTH}
                  disabled={savingNickname}
                  onChange={(event) => {
                    setNicknameDraft(event.target.value);
                    setNicknameError(null);
                    setNicknameNotice(null);
                  }}
                />
              </label>

              {nicknameError && (
                <p className="profile-edit-error" role="alert">
                  {nicknameError}
                </p>
              )}
              {nicknameNotice && <p className="profile-edit-notice">{nicknameNotice}</p>}

              <button
                className="profile-edit-submit"
                type="submit"
                disabled={savingNickname}
              >
                {savingNickname ? "저장 중…" : "닉네임 저장"}
              </button>
            </form>
          </section>

          <section className="profile-edit-card" aria-labelledby="profile-edit-password-title">
            <h2 id="profile-edit-password-title">비밀번호</h2>

            {!PASSWORD_CHANGE_ENABLED && (
              <p className="profile-edit-pending">
                비밀번호 변경은 서버 준비가 끝나는 대로 열립니다.
              </p>
            )}

            <form className="profile-edit-form" onSubmit={handlePasswordSubmit}>
              <label className="profile-edit-field">
                <span>현재 비밀번호</span>
                <div className="profile-edit-password-input">
                  <input
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    placeholder="현재 비밀번호를 입력해주세요"
                    autoComplete="current-password"
                    disabled={!PASSWORD_CHANGE_ENABLED || savingPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    className="profile-edit-password-toggle"
                    disabled={!PASSWORD_CHANGE_ENABLED}
                    onClick={() => setShowCurrentPassword((visible) => !visible)}
                    aria-label={showCurrentPassword ? "현재 비밀번호 숨기기" : "현재 비밀번호 보기"}
                    aria-pressed={showCurrentPassword}
                  >
                    <PasswordVisibilityIcon visible={showCurrentPassword} />
                  </button>
                </div>
              </label>

              <label className="profile-edit-field">
                <span>새 비밀번호</span>
                <div className="profile-edit-password-input">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    placeholder="영문, 숫자 포함 8자 이상"
                    autoComplete="new-password"
                    disabled={!PASSWORD_CHANGE_ENABLED || savingPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    className="profile-edit-password-toggle"
                    disabled={!PASSWORD_CHANGE_ENABLED}
                    onClick={() => setShowNewPassword((visible) => !visible)}
                    aria-label={showNewPassword ? "새 비밀번호 숨기기" : "새 비밀번호 보기"}
                    aria-pressed={showNewPassword}
                  >
                    <PasswordVisibilityIcon visible={showNewPassword} />
                  </button>
                </div>
              </label>

              <label className="profile-edit-field">
                <span>새 비밀번호 확인</span>
                <div className="profile-edit-password-input">
                  <input
                    type={showNewPasswordConfirm ? "text" : "password"}
                    value={newPasswordConfirm}
                    placeholder="새 비밀번호를 다시 입력해주세요"
                    autoComplete="new-password"
                    disabled={!PASSWORD_CHANGE_ENABLED || savingPassword}
                    onChange={(event) => setNewPasswordConfirm(event.target.value)}
                  />
                  <button
                    type="button"
                    className="profile-edit-password-toggle"
                    disabled={!PASSWORD_CHANGE_ENABLED}
                    onClick={() => setShowNewPasswordConfirm((visible) => !visible)}
                    aria-label={
                      showNewPasswordConfirm ? "새 비밀번호 확인 숨기기" : "새 비밀번호 확인 보기"
                    }
                    aria-pressed={showNewPasswordConfirm}
                  >
                    <PasswordVisibilityIcon visible={showNewPasswordConfirm} />
                  </button>
                </div>
              </label>

              {passwordError && (
                <p className="profile-edit-error" role="alert">
                  {passwordError}
                </p>
              )}
              {passwordNotice && <p className="profile-edit-notice">{passwordNotice}</p>}

              <button
                className="profile-edit-submit"
                type="submit"
                disabled={!PASSWORD_CHANGE_ENABLED || savingPassword}
              >
                {savingPassword ? "변경 중…" : "비밀번호 변경"}
              </button>
            </form>
          </section>

          <div className="profile-edit-danger">
            <button type="button" onClick={() => setIsDeleteAccountModalOpen(true)}>
              회원 탈퇴
            </button>
          </div>
        </div>
      </div>

      {isDeleteAccountModalOpen && (
        <DeleteAccountModal
          error={deleteAccountError}
          submitting={deletingAccount}
          onClose={() => setIsDeleteAccountModalOpen(false)}
          onConfirmDelete={handleDeleteAccount}
        />
      )}
    </main>
  );
}
