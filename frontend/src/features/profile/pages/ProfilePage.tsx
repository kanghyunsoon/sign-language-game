import { Flame, Leaf, Pencil, Settings, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import {
  AuthApiError,
  deleteAccount,
  getProfile,
  updateProfile,
} from "../../auth/api/authApi";
import { DeleteAccountModal } from "../components/DeleteAccountModal";
import graduationIcon from "../assets/graduation.png";
import learningRecordIcon from "../assets/learning-record-icon.png";
import otterProfile from "../assets/otter_profile.png";
import profileRingLeft from "../assets/profile-ring-left.png";
import profileRingRight from "../assets/profile-ring-right.png";
import profileRingTop from "../assets/profile-ring-top.png";
import sproutIcon from "../assets/sprout.png";
import wrongAnswerNoteIcon from "../assets/wrong-answer-note-icon.png";
import "./ProfilePage.css";

const profileStats = [
  { label: "LEVEL", value: "10", current: "7", total: "10", tone: "gold" },
  { label: "학습", value: "170", current: "170", total: "200", tone: "coral" },
  { label: "연습일", value: "7", current: "7", total: "20", tone: "green" },
  { label: "승리 횟수", value: "24", current: "24", total: "50", tone: "blue" },
] as const;

export function ProfilePage() {
  const navigate = useNavigate();
  const { accessToken, user, logout, updateDisplayName } = useAuth();
  const [nickname, setNickname] = useState(user?.displayName ?? "");
  const [nicknameDraft, setNicknameDraft] = useState(user?.displayName ?? "");
  const [editingNickname, setEditingNickname] = useState(false);
  const [savingNickname, setSavingNickname] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
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
        const profileNickname =
          typeof profile.nickname === "string" ? profile.nickname.trim() : "";
        if (profileNickname) {
          setNickname(profileNickname);
          setNicknameDraft(profileNickname);
          updateDisplayName(profileNickname);
        }
      })
      .catch((caught) => {
        if (cancelled) return;
        setProfileError(
          caught instanceof AuthApiError
            ? caught.message
            : "프로필 정보를 불러오지 못했습니다.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, user?.userId, updateDisplayName]);

  async function handleNicknameSave() {
    const nextNickname = nicknameDraft.trim();
    if (!accessToken || !user?.userId || savingNickname) return;

    if (!nextNickname) {
      setProfileError("닉네임을 입력해주세요.");
      return;
    }

    if (nextNickname === nickname) {
      setEditingNickname(false);
      setProfileError(null);
      return;
    }

    setSavingNickname(true);
    setProfileError(null);
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
      setEditingNickname(false);
    } catch (caught) {
      setProfileError(
        caught instanceof AuthApiError
          ? caught.message
          : "닉네임을 변경하지 못했습니다.",
      );
    } finally {
      setSavingNickname(false);
    }
  }

  async function handleLogout() {
    try {
      await logout();
    } finally {
      navigate("/login");
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
          : "회원탈퇴 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.",
      );
    } finally {
      setDeletingAccount(false);
    }
  }

  return (
    <main className="profile-page">
      <div className="profile-canvas">
        <img className="profile-ring profile-ring-left" src={profileRingLeft} alt="" aria-hidden="true" />
        <img className="profile-ring profile-ring-top" src={profileRingTop} alt="" aria-hidden="true" />
        <img className="profile-ring profile-ring-right" src={profileRingRight} alt="" aria-hidden="true" />

        <header className="profile-header">
          <nav className="profile-nav" aria-label="주요 메뉴">
            <Link to="/main">메인페이지</Link>
            <Link to="/practice">연습</Link>
            <Link to="/test">테스트</Link>
            <Link to="/dictionary">사전</Link>
            <Link to="/review-notes">오답노트</Link>
            <Link to="/game">게임</Link>
          </nav>

          <Link
            className="profile-mypage-button active"
            to="/profile"
            aria-current="page"
          >
            마이페이지
          </Link>

          {/* <div className="profile-header-summary">
            <span><Leaf aria-hidden="true" size={13} />오늘 학습 <strong>12 / 20</strong></span>
            <span><Flame aria-hidden="true" size={13} />연속 학습 <strong>7일</strong></span>
            <button type="button" aria-label="설정"><Settings aria-hidden="true" size={15} /></button>
          </div> */}
        </header>

        <section className="profile-hero" aria-labelledby="profile-title">
          <div className="profile-achievement">
            <Sparkles aria-hidden="true" size={24} />
            <h1 id="profile-title">열심히 수련중</h1>
            <Sparkles aria-hidden="true" size={24} />
          </div>

          <div className="profile-character-stage">
            <img src={otterProfile} alt="머리띠를 두르고 수어를 연습하는 수달 캐릭터" />
          </div>

          <button className="profile-floating-item profile-item-sprout" type="button">
            <img src={sproutIcon} alt="" aria-hidden="true" />
          </button>

          <button className="profile-floating-item profile-item-cap" type="button">
            <img src={graduationIcon} alt="" aria-hidden="true" />
          </button>

          <Link className="profile-floating-item profile-item-note" to="/review-notes">
            <img src={wrongAnswerNoteIcon} alt="" aria-hidden="true" />
            <span>오답 노트</span>
          </Link>

          <button className="profile-floating-item profile-item-record" type="button">
            <img src={learningRecordIcon} alt="" aria-hidden="true" />
            <span>학습 기록</span>
          </button>

          {/* <section className="profile-level-card" aria-label="학습 레벨">
            <div>
              <span>학습 레벨</span>
              <strong>Lv. 10</strong>
            </div>
            <div className="profile-level-progress">
              <span><i /></span>
              <small>1,250 / 2,000 XP</small>
            </div>
            <div className="profile-level-goal">
              <span className="profile-reward-icon" aria-hidden="true">🎁</span>
              <span><strong>다음 보상</strong>Lv.15 보상</span>
            </div>
          </section> */}
        </section>

        <aside className="profile-sidebar" aria-label="프로필 정보">
          <section className="profile-user-card">
            <div className="profile-avatar" aria-hidden="true" />
            {editingNickname ? (
              <div className="profile-nickname-editor">
                <input
                  type="text"
                  value={nicknameDraft}
                  maxLength={20}
                  autoFocus
                  disabled={savingNickname}
                  aria-label="새 닉네임"
                  onChange={(event) => setNicknameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void handleNicknameSave();
                    if (event.key === "Escape") {
                      setNicknameDraft(nickname);
                      setEditingNickname(false);
                      setProfileError(null);
                    }
                  }}
                />
                <div className="profile-nickname-editor-actions">
                  <button
                    type="button"
                    disabled={savingNickname}
                    onClick={() => void handleNicknameSave()}
                  >
                    {savingNickname ? "저장 중" : "저장"}
                  </button>
                  <button
                    type="button"
                    disabled={savingNickname}
                    onClick={() => {
                      setNicknameDraft(nickname);
                      setEditingNickname(false);
                      setProfileError(null);
                    }}
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <div className="profile-name">
                <strong>{nickname || user?.displayName || "닉네임 불러오는 중"}</strong>
                <button
                  type="button"
                  aria-label="닉네임 수정"
                  onClick={() => {
                    setNicknameDraft(user?.displayName || nickname);
                    setEditingNickname(true);
                    setProfileError(null);
                  }}
                >
                  <Pencil aria-hidden="true" size={30} />
                </button>
              </div>
            )}
            <button className="profile-image-change" type="button">프로필 변경</button>
            {profileError && <p className="profile-user-error" role="alert">{profileError}</p>}
          </section>

          {/* <section className="profile-stat-card">
            <div className="profile-stat-list">
              {profileStats.map((stat) => (
                <div className="profile-stat-row" key={stat.label}>
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                  <div className={`profile-stat-track profile-stat-${stat.tone}`}>
                    <i />
                    <small>{stat.current} / {stat.total}</small>
                  </div>
                </div>
              ))}
            </div>

            <div className="profile-total-xp">
              <span>성장 포인트</span>
              <strong>1,250 XP</strong>
            </div>

          </section> */}

          <div className="profile-quick-actions">
            <button type="button">회원 정보 수정</button>
            <button type="button" onClick={handleLogout}>로그아웃</button>
          </div>

          <button
            className="profile-main-button"
            type="button"
            onClick={() => setIsDeleteAccountModalOpen(true)}
          >
            회원탈퇴
          </button>
        </aside>
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
