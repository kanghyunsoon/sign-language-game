import { Flame, Leaf, Pencil, Settings, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

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
  return (
    <main className="profile-page">
      <div className="profile-canvas">
        <img className="profile-ring profile-ring-left" src={profileRingLeft} alt="" aria-hidden="true" />
        <img className="profile-ring profile-ring-top" src={profileRingTop} alt="" aria-hidden="true" />
        <img className="profile-ring profile-ring-right" src={profileRingRight} alt="" aria-hidden="true" />

        <header className="profile-header">
          <Link className="profile-home-button" to="/main" aria-label="메인페이지로 이동">
            <span>메인 페이지</span>
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

          <button className="profile-floating-item profile-item-note" type="button">
            <img src={wrongAnswerNoteIcon} alt="" aria-hidden="true" />
            <span>오답 노트</span>
          </button>

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
            <div className="profile-name">
              <strong>닉네임</strong>
              <button type="button" aria-label="닉네임 수정"><Pencil aria-hidden="true" size={30} /></button>
            </div>
            <button className="profile-image-change" type="button">프로필 변경</button>
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
            <button type="button">로그아웃</button>
          </div>

          <button className="profile-main-button" type="button">회원탈퇴</button>
        </aside>
      </div>
    </main>
  );
}
