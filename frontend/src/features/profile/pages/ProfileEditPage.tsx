import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { AppNav } from "../../../shared/nav/AppNav";
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
  const [email, setEmail] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showNewPasswordConfirm, setShowNewPasswordConfirm] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
        if (typeof profile.email === "string") setEmail(profile.email);
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(
          caught instanceof AuthApiError
            ? caught.message
            : "프로필 정보를 불러오지 못했습니다.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, user?.userId, updateDisplayName]);

  /** 닉네임과 비밀번호를 한 번에 저장한다. 입력하지 않은 항목은 건너뛴다. */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || saving) return;

    const nextNickname = nicknameDraft.trim();
    const nicknameChanged = nextNickname !== nickname;
    const passwordTouched =
      PASSWORD_CHANGE_ENABLED &&
      Boolean(currentPassword || newPassword || newPasswordConfirm);

    setError(null);
    setNotice(null);

    if (nicknameChanged) {
      if (
        nextNickname.length < NICKNAME_MIN_LENGTH ||
        nextNickname.length > NICKNAME_MAX_LENGTH
      ) {
        setError("닉네임은 2자 이상 10자 이하로 입력해 주세요.");
        return;
      }
    }

    if (passwordTouched) {
      if (!currentPassword) {
        setError("현재 비밀번호를 입력해 주세요.");
        return;
      }
      if (newPassword.length < PASSWORD_MIN_LENGTH) {
        setError("새 비밀번호는 8자 이상이어야 합니다.");
        return;
      }
      if (newPassword !== newPasswordConfirm) {
        setError("새 비밀번호가 일치하지 않습니다.");
        return;
      }
      if (newPassword === currentPassword) {
        setError("현재 비밀번호와 다른 비밀번호를 입력해 주세요.");
        return;
      }
    }

    if (!nicknameChanged && !passwordTouched) {
      setNotice("변경된 내용이 없습니다.");
      return;
    }

    setSaving(true);
    try {
      const changed: string[] = [];

      if (nicknameChanged) {
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
        changed.push("닉네임");
      }

      if (passwordTouched) {
        await changePassword(accessToken, { currentPassword, newPassword });
        setCurrentPassword("");
        setNewPassword("");
        setNewPasswordConfirm("");
        changed.push("비밀번호");
      }

      setNotice(`${changed.join("과 ")}를 변경했습니다.`);
    } catch (caught) {
      setError(
        caught instanceof AuthApiError ? caught.message : "정보를 수정하지 못했습니다.",
      );
    } finally {
      setSaving(false);
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
          <AppNav prefix="profile-edit" />
        </header>

        <div className="profile-edit-body">
          <section className="profile-edit-card" aria-labelledby="profile-edit-title">
            <h1 id="profile-edit-title">정보 수정</h1>

            <form className="profile-edit-form" onSubmit={handleSubmit}>
              <label className="profile-edit-field">
                <span>닉네임</span>
                <input
                  type="text"
                  value={nicknameDraft}
                  placeholder="2~10자 이내로 입력해주세요."
                  autoComplete="nickname"
                  minLength={NICKNAME_MIN_LENGTH}
                  maxLength={NICKNAME_MAX_LENGTH}
                  disabled={saving}
                  onChange={(event) => {
                    setNicknameDraft(event.target.value);
                    setError(null);
                    setNotice(null);
                  }}
                />
              </label>

              <div className="profile-edit-field">
                <span>이메일</span>
                <p className="profile-edit-readonly">{email || "-"}</p>
              </div>

              <label className="profile-edit-field">
                <span>현재 비밀번호</span>
                <div className="profile-edit-password-input">
                  <input
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    placeholder="현재 비밀번호를 입력해주세요"
                    autoComplete="current-password"
                    disabled={!PASSWORD_CHANGE_ENABLED || saving}
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
                    disabled={!PASSWORD_CHANGE_ENABLED || saving}
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
                    disabled={!PASSWORD_CHANGE_ENABLED || saving}
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

              {!PASSWORD_CHANGE_ENABLED && (
                <p className="profile-edit-pending">
                  비밀번호 변경은 서버 준비가 끝나는 대로 열립니다.
                </p>
              )}

              {error && (
                <p className="profile-edit-error" role="alert">
                  {error}
                </p>
              )}
              {notice && <p className="profile-edit-notice">{notice}</p>}

              <div className="profile-edit-actions">
                <button className="profile-edit-submit" type="submit" disabled={saving}>
                  {saving ? "저장 중…" : "수정"}
                </button>
                <button
                  className="profile-edit-delete"
                  type="button"
                  disabled={saving}
                  onClick={() => setIsDeleteAccountModalOpen(true)}
                >
                  회원 탈퇴
                </button>
              </div>
            </form>
          </section>
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
