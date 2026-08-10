-- ============================================
-- 한컴수화연습 (suhwa) — 백엔드 CRUD API 1차 구축
-- backend/specs/001-backend-crud-api/data-model.md 기준 스키마
--
-- DB 이름은 애플리케이션 설정(env.sample/application.yaml)과 통일해 `suhwa`를 사용한다.
-- (원본 소스 자료인 backend/jira-crud-backlog.md의 DDL은 `hancom_sign_practice`라는
--  이름을 썼지만, 실제 커밋된 Spring 프로젝트 설정 기준으로 이 파일에서 통일했다.)
--
-- JPA_DDL_AUTO=none 이므로 Hibernate가 스키마를 관리하지 않는다 — 이 스크립트로 직접 적용한다.
-- ============================================

-- MySQL(MariaDB와 달리)은 CREATE DATABASE에 COMMENT 절을 지원하지 않아 생략한다.
CREATE DATABASE IF NOT EXISTS suhwa
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;

USE suhwa;

-- ============================================
-- 1. users
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    email               VARCHAR(255) NOT NULL UNIQUE,
    password_hash       VARCHAR(255) NOT NULL,
    nickname            VARCHAR(50) NOT NULL,
    profile_image_url   VARCHAR(500) NULL,
    win_count           INT NOT NULL DEFAULT 0,
    loss_count          INT NOT NULL DEFAULT 0,
    deleted_at          DATETIME NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='회원';

-- ============================================
-- 2. refresh_tokens — 로그아웃/탈퇴 시 즉시 무효화를 위한 DB 화이트리스트
-- ============================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    token       VARCHAR(500) NOT NULL UNIQUE,
    expires_at  DATETIME NOT NULL,
    revoked_at  DATETIME NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_refresh_token_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,

    INDEX idx_refresh_token_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='refresh token 화이트리스트';

-- ============================================
-- 3. signs — 학습 콘텐츠 마스터 데이터 (조회 전용)
-- ============================================
CREATE TABLE IF NOT EXISTS signs (
    id                      BIGINT AUTO_INCREMENT PRIMARY KEY,
    category                ENUM('CONSONANT','VOWEL','NUMBER','WORD') NOT NULL,
    label                   VARCHAR(50) NOT NULL,
    reference_media_url     VARCHAR(500) NULL,
    tip                     VARCHAR(500) NULL,
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_signs_category_active (category, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='학습 콘텐츠(자음/모음/숫자/단어)';

-- ============================================
-- 4. wrong_answer_logs — 오답 발생 로그(카테고리별 최근 5개 조회용, 비율 계산 없음)
-- ============================================
CREATE TABLE IF NOT EXISTS wrong_answer_logs (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    sign_id     BIGINT NOT NULL,
    wrong_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_wronglog_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_wronglog_sign FOREIGN KEY (sign_id) REFERENCES signs(id) ON DELETE RESTRICT,

    INDEX idx_wronglog_user_time (user_id, wrong_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='오답 발생 로그';

-- ============================================
-- 5. game_rooms — 1:1 대전 매칭 전용, 임시 리소스
--    CLOSED 5분 경과 시 스케줄러가 하드 삭제(game_sessions는 참조하지 않으므로 무관)
-- ============================================
CREATE TABLE IF NOT EXISTS game_rooms (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    room_code       VARCHAR(20) NOT NULL UNIQUE,
    host_user_id    BIGINT NOT NULL,
    guest_user_id   BIGINT NULL,
    host_ready      BOOLEAN NOT NULL DEFAULT FALSE,
    guest_ready     BOOLEAN NOT NULL DEFAULT FALSE,
    status          ENUM('WAITING','IN_PROGRESS','CLOSED') NOT NULL DEFAULT 'WAITING',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    version         BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT fk_room_host FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_room_guest FOREIGN KEY (guest_user_id) REFERENCES users(id) ON DELETE RESTRICT,

    INDEX idx_room_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='게임방 (1:1 전용, 매칭 용도로만 사용)';

-- ============================================
-- 6. game_sessions — 1:1 대전 매치 결과 요약. game_rooms와 완전히 독립.
-- ============================================
CREATE TABLE IF NOT EXISTS game_sessions (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    player1_id          BIGINT NOT NULL,
    player2_id          BIGINT NOT NULL,
    player1_score       INT NOT NULL DEFAULT 0,
    player2_score       INT NOT NULL DEFAULT 0,
    winner_id           BIGINT NULL,
    started_at          DATETIME NOT NULL,
    ended_at            DATETIME NULL,

    CONSTRAINT fk_session_player1 FOREIGN KEY (player1_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_session_player2 FOREIGN KEY (player2_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_session_winner FOREIGN KEY (winner_id) REFERENCES users(id) ON DELETE RESTRICT,

    INDEX idx_session_player1 (player1_id),
    INDEX idx_session_player2 (player2_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='1:1 대전 매치 결과';

-- ============================================
-- 7. attendance — 엔티티만 정의(API/로직 없음, FR-035)
-- ============================================
CREATE TABLE IF NOT EXISTS attendance (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id             BIGINT NOT NULL,
    attendance_date     DATE NOT NULL,
    streak_count        INT NOT NULL DEFAULT 1,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_attendance_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT uk_attendance_user_date UNIQUE (user_id, attendance_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='출석 체크 (엔티티만, API 없음)';

-- ============================================
-- 8. user_pets — 엔티티만 정의(API/로직 없음, FR-034), 1인 1펫
-- ============================================
CREATE TABLE IF NOT EXISTS user_pets (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT NOT NULL UNIQUE,
    name        VARCHAR(50) NULL,
    level       INT NOT NULL DEFAULT 1,
    exp         INT NOT NULL DEFAULT 0,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_userpet_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='펫 (엔티티만, API 없음)';
