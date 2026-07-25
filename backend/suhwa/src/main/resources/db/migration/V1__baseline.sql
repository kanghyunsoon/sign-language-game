-- ============================================
-- Flyway baseline (spec 004 FR-018, STABLE-08-09) — V1
--
-- 현행 DB 상태 = scripts/schema.sql(기반) + resources/schema 증분 01~04의 누적 결과.
-- 즉 이 baseline은 다음 최종 상태를 반영한다:
--   - users: win_count/loss_count 제거(04_drop_game_sessions_and_users_counters)
--   - game_rooms: game_type 컬럼 포함(01_add_game_type_to_game_rooms)
--   - game_results 테이블 신설(02_create_game_results), 랭킹 집계 원본
--   - game_sessions 테이블 제거(04) — 여기 없음
--   - 03(win_count→game_results 데이터 백필)은 데이터 이관이라 스키마엔 반영 없음
--
-- 기존 운영 DB는 baseline-on-migrate로 V1을 건너뛰고(이미 이 상태), 신규/테스트 DB만 V1로 생성된다.
-- CREATE DATABASE/USE는 Flyway가 지정 스키마 안에서 실행하므로 포함하지 않는다.
-- ============================================

-- 1. users (win_count/loss_count 제거됨 — 전적은 game_results 집계)
CREATE TABLE IF NOT EXISTS users (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    email               VARCHAR(255) NOT NULL UNIQUE,
    password_hash       VARCHAR(255) NOT NULL,
    nickname            VARCHAR(50) NOT NULL,
    profile_image_url   VARCHAR(500) NULL,
    deleted_at          DATETIME NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='회원';

-- 2. refresh_tokens
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

-- 3. signs
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

-- 4. wrong_answer_logs
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

-- 5. game_rooms (game_type 포함)
CREATE TABLE IF NOT EXISTS game_rooms (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    room_code       VARCHAR(20) NOT NULL UNIQUE,
    host_user_id    BIGINT NOT NULL,
    guest_user_id   BIGINT NULL,
    host_ready      BOOLEAN NOT NULL DEFAULT FALSE,
    guest_ready     BOOLEAN NOT NULL DEFAULT FALSE,
    status          ENUM('WAITING','IN_PROGRESS','CLOSED') NOT NULL DEFAULT 'WAITING',
    game_type       VARCHAR(20) NOT NULL DEFAULT 'SIGN_DUEL',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    version         BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT fk_room_host FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_room_guest FOREIGN KEY (guest_user_id) REFERENCES users(id) ON DELETE RESTRICT,

    INDEX idx_room_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='게임방 (1:1 전용, 매칭 용도로만 사용)';

-- 6. game_results (세 게임 종류 공통 결과 기록 — 랭킹 집계 원본, game_sessions 대체)
CREATE TABLE IF NOT EXISTS game_results (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    game_type   VARCHAR(20) NOT NULL,
    score       INT NOT NULL,
    recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_game_result_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_game_result_user_type (user_id, game_type),
    INDEX idx_game_result_type_score (game_type, score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='세 게임 종류 공통 결과 기록 — 랭킹 집계 원본';

-- 7. attendance (엔티티만)
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

-- 8. user_pets (엔티티만, 1인 1펫)
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
