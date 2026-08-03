import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { AppNav } from "../../../shared/nav/AppNav";
import { useAuth } from "../../auth/AuthContext";
import { AuthApiError, getProfile } from "../../auth/api/authApi";
import { AttendanceCard } from "../../home/components/AttendanceCard";
import {
  getAttendance,
  getPetGrowth,
  getRanking,
  type AttendanceStatus,
  type PetGrowth,
  type RankingEntry,
} from "../api/profileApi";
import { HabitatSelectionView } from "../components/HabitatSelectionView";
import homeIcon from "../assets/home.png";
import otterProfile from "../assets/otter_profile.png";
import profileRingLeft from "../assets/profile-ring-left.png";
import profileRingRight from "../assets/profile-ring-right.png";
import profileRingTop from "../assets/profile-ring-top.png";
import sproutIcon from "../assets/sprout.png";
import starIcon from "../assets/star.png";
import wrongAnswerNoteIcon from "../assets/wrong-answer-note-icon.png";
import "./ProfilePage.css";

const EMPTY_VALUE = "-";
const SHOW_LEVEL_CARD = true;
const SHOW_PROFILE_STATS = false;

export function ProfilePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { accessToken, user, logout, updateDisplayName } = useAuth();
  const [nickname, setNickname] = useState(user?.displayName ?? "");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [growth, setGrowth] = useState<PetGrowth | null>(null);
  const [attendance, setAttendance] = useState<AttendanceStatus | null>(null);
  const [soloRanking, setSoloRanking] = useState<RankingEntry | null>(null);
  const [statsLoading, setStatsLoading] = useState(Boolean(accessToken));
  const [isAttendanceOpen, setIsAttendanceOpen] = useState(false);
  const [isExperienceGuideOpen, setIsExperienceGuideOpen] = useState(false);
  const [isHabitatSelectionOpen, setIsHabitatSelectionOpen] = useState(false);

  useEffect(() => {
    setNickname(user?.displayName ?? "");
  }, [user?.displayName]);

  useEffect(() => {
    if (searchParams.get("openHabitat") !== "true") return;

    setIsHabitatSelectionOpen(true);
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("openHabitat");
    setSearchParams(nextSearchParams, { replace: true });
  }, [searchParams, setSearchParams]);

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
          updateDisplayName(nextNickname);
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

  useEffect(() => {
    if (!accessToken) {
      setStatsLoading(false);
      return;
    }

    let cancelled = false;
    setStatsLoading(true);
    setStatsError(null);

    void Promise.allSettled([
      getPetGrowth(accessToken),
      getAttendance(accessToken),
      getRanking(accessToken, "TETRIS_SOLO"),
    ]).then(([growthResult, attendanceResult, rankingResult]) => {
      if (cancelled) return;

      if (growthResult.status === "fulfilled") setGrowth(growthResult.value);
      if (attendanceResult.status === "fulfilled") setAttendance(attendanceResult.value);
      if (rankingResult.status === "fulfilled") setSoloRanking(rankingResult.value.me);

      if (
        growthResult.status === "rejected" ||
        attendanceResult.status === "rejected" ||
        rankingResult.status === "rejected"
      ) {
        setStatsError("일부 학습 정보를 불러오지 못했습니다.");
      }
      setStatsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const experienceTotal = growth
    ? growth.expToNextLevel === null
      ? growth.currentExp
      : growth.currentExp + growth.expToNextLevel
    : 0;

  const experiencePercent = useMemo(() => {
    if (!growth) return 0;
    if (growth.expToNextLevel === null) return 100;
    if (experienceTotal <= 0) return 0;
    return Math.min(100, Math.max(0, (growth.currentExp / experienceTotal) * 100));
  }, [growth, experienceTotal]);

  async function handleLogout() {
    try {
      await logout();
    } finally {
      navigate("/login");
    }
  }

  const statValue = (value: number | undefined) =>
    statsLoading ? "…" : value === undefined ? EMPTY_VALUE : value.toLocaleString();

  return (
    <main className="profile-page">
      <div className="profile-canvas">
        <img className="profile-ring profile-ring-left" src={profileRingLeft} alt="" />
        <img className="profile-ring profile-ring-top" src={profileRingTop} alt="" />
        <img className="profile-ring profile-ring-right" src={profileRingRight} alt="" />

        <header className="profile-header">
          <AppNav prefix="profile" />
        </header>

        <section className="profile-hero" aria-labelledby="profile-title">
          <div className="profile-achievement">
            <Sparkles aria-hidden="true" />
            <h1 id="profile-title">열심히 수련중</h1>
            <Sparkles aria-hidden="true" />
          </div>

          <div className="profile-character-stage">
            <img src={otterProfile} alt="수어를 연습하는 수달" />
          </div>

          <button
            className="profile-floating-item profile-item-sprout"
            type="button"
            onClick={() => setIsAttendanceOpen(true)}
          >
            <img src={sproutIcon} alt="" />
            <span>출석 현황</span>
          </button>
          <button
            className="profile-floating-item profile-item-home"
            type="button"
            onClick={() => setIsHabitatSelectionOpen(true)}
          >
            <img src={homeIcon} alt="" />
            <span>이사가기</span>
          </button>
          <Link className="profile-floating-item profile-item-note" to="/review-notes">
            <img src={wrongAnswerNoteIcon} alt="" />
            <span>오답 노트</span>
          </Link>
          <button
            className="profile-floating-item profile-item-star"
            type="button"
            onClick={() => setIsExperienceGuideOpen(true)}
          >
            <img src={starIcon} alt="" />
            <span>경험치 얻기</span>
          </button>

          {SHOW_LEVEL_CARD && <section className="profile-level-card" aria-label="학습 레벨">
            <div className="profile-level-heading">
              <span>학습 레벨</span>
              <strong>Lv. {statValue(growth?.level)}</strong>
            </div>
            <div className="profile-level-progress">
              <span>
                <i style={{ width: `${experiencePercent}%` }} />
              </span>
              <small>
                {growth
                  ? growth.expToNextLevel === null
                    ? `현재 경험치 ${growth.currentExp.toLocaleString()} XP · 최고 레벨`
                    : `현재 경험치 ${growth.currentExp.toLocaleString()} XP`
                  : statsLoading
                    ? "불러오는 중"
                    : "로그인이 필요합니다"}
              </small>
            </div>
            <div className="profile-level-goal">
              <span>다음 레벨</span>
              <strong>
                {growth
                  ? growth.expToNextLevel === null
                    ? "MAX"
                    : `Lv. ${Math.min(growth.level + 1, growth.maxLevel)}`
                  : EMPTY_VALUE}
              </strong>
            </div>
          </section>}
        </section>

        <aside className="profile-sidebar" aria-label="프로필 정보">
          <section className="profile-user-card">
            {/* 닉네임 수정은 정보 수정 페이지(/profile/edit)로 일원화했다. */}
            <div className="profile-name">
              <strong>{nickname || user?.displayName || "게스트"}</strong>
            </div>
            {profileError && <p className="profile-user-error" role="alert">{profileError}</p>}
          </section>

          {SHOW_PROFILE_STATS && <section className="profile-stat-card">
            <div className="profile-stat-row">
              <span>LEVEL</span>
              <strong>{statValue(growth?.level)}</strong>
              <div className="profile-stat-track profile-stat-gold">
                <i style={{ width: `${growth ? (growth.level / growth.maxLevel) * 100 : 0}%` }} />
                <small>{growth ? `${growth.level} / ${growth.maxLevel}` : EMPTY_VALUE}</small>
              </div>
            </div>
            <div className="profile-stat-row">
              <span>최고 점수</span>
              <strong>{statValue(soloRanking?.score)}</strong>
              <div className="profile-stat-track profile-stat-coral">
                <i style={{ width: soloRanking ? "100%" : "0%" }} />
                <small>{soloRanking ? `${soloRanking.score.toLocaleString()}점` : "기록 없음"}</small>
              </div>
            </div>
            <div className="profile-stat-row">
              <span>연속 출석일</span>
              <strong>{statValue(attendance?.streakCount)}</strong>
              <div className="profile-stat-track profile-stat-green">
                <i style={{ width: `${Math.min(100, (attendance?.streakCount ?? 0) * 10)}%` }} />
                <small>{attendance ? `${attendance.streakCount}일` : EMPTY_VALUE}</small>
              </div>
            </div>
            <div className="profile-stat-row">
              <span>랭킹</span>
              <strong>{soloRanking ? soloRanking.rank : EMPTY_VALUE}</strong>
              <div className="profile-stat-track profile-stat-blue">
                <i style={{ width: soloRanking ? "100%" : "0%" }} />
                <small>{soloRanking ? `${soloRanking.rank}위` : "기록 없음"}</small>
              </div>
            </div>

            <div className="profile-current-xp">
              <span>현재 경험치</span>
              <strong>{growth ? `${growth.currentExp.toLocaleString()} XP` : EMPTY_VALUE}</strong>
            </div>
            {statsError && <p className="profile-stats-error">{statsError}</p>}
          </section>}

          <div className="profile-quick-actions">
            {accessToken ? (
              <>
                <button type="button" onClick={() => void handleLogout()}>로그아웃</button>
                <button type="button" onClick={() => navigate("/profile/edit")}>
                  정보 수정
                </button>
              </>
            ) : (
              <button className="profile-login-button" type="button" onClick={() => navigate("/login")}>
                로그인
              </button>
            )}
          </div>
        </aside>
      </div>

      {isAttendanceOpen && (
        <div
          className="learning-guide-overlay profile-attendance-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-attendance-title"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setIsAttendanceOpen(false);
            }
          }}
        >
          <section className="learning-guide-modal attendance-modal">
            <button
              className="learning-guide-close"
              type="button"
              aria-label="출석체크 닫기"
              onClick={() => setIsAttendanceOpen(false)}
            >
              ×
            </button>
            <h2 id="profile-attendance-title">출석체크</h2>
            <AttendanceCard
              accessToken={accessToken}
              onPetUpdated={setGrowth}
            />
          </section>
        </div>
      )}

      {isExperienceGuideOpen && (
        <div
          className="profile-experience-guide-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-experience-guide-title"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setIsExperienceGuideOpen(false);
            }
          }}
        >
          <section className="profile-experience-guide">
            <button
              className="profile-experience-guide-close"
              type="button"
              aria-label="경험치 얻는 방법 닫기"
              onClick={() => setIsExperienceGuideOpen(false)}
            >
              ×
            </button>

            <h2 id="profile-experience-guide-title">경험치 얻는 방법</h2>
            <p className="profile-experience-guide-intro">
              출석하고, 테스트와 게임에 참여해 수달을 성장시켜 보세요!
            </p>

            <ol className="profile-experience-methods">
              <li>
                <span>1</span>
                <strong>매일 출석하기</strong>
                <p>하루에 한 번 출석체크하고 3XP를 받아요.</p>
              </li>
              <li>
                <span>2</span>
                <strong>테스트 도전하기</strong>
                <p>정답률 80% 이상을 달성하면 7XP를 받아요.</p>
              </li>
              <li>
                <span>3</span>
                <strong>블록 쌓기 기록 도전</strong>
                <p>120초 안에 완료하면 기록에 따라 최대 15XP를 받아요.</p>
              </li>
              <li>
                <span>4</span>
                <strong>친구와 대전하기</strong>
                <p>대전에서 승리하면 10XP, 패배해도 3XP를 받아요.</p>
              </li>
            </ol>

            <p className="profile-experience-guide-footer">
              획득한 경험치는 프로필에서 확인할 수 있어요.
            </p>
          </section>
        </div>
      )}

      {isHabitatSelectionOpen && (
        <HabitatSelectionView
          currentLevel={growth?.level ?? 1}
          onClose={() => setIsHabitatSelectionOpen(false)}
        />
      )}
    </main>
  );
}
