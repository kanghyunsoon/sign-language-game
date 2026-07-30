-- Activity sessions provide the idempotency boundary for growth rewards.

CREATE TABLE practice_sessions (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id      BIGINT NOT NULL,
    started_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,

    CONSTRAINT fk_practice_session_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_practice_session_user_completed (user_id, completed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE test_sessions
    ADD COLUMN correct_count INT NULL AFTER completed_at,
    ADD COLUMN total_count INT NULL AFTER correct_count;

-- V3 may already contain completed sessions without an authoritative score.
-- Preserve them as non-rewarding legacy completions so the new invariant can
-- be enforced without retroactive XP.
UPDATE test_sessions
SET correct_count = 0,
    total_count = 1
WHERE completed_at IS NOT NULL;

ALTER TABLE test_sessions
    ADD CONSTRAINT chk_test_session_result CHECK (
        (completed_at IS NULL AND correct_count IS NULL AND total_count IS NULL)
        OR
        (completed_at IS NOT NULL
            AND total_count >= 1
            AND correct_count BETWEEN 0 AND total_count)
    );

CREATE TABLE solo_sessions (
    id                   VARCHAR(36) PRIMARY KEY,
    user_id              BIGINT NOT NULL,
    difficulty           VARCHAR(50) NOT NULL,
    play_mode            VARCHAR(20) NOT NULL,
    started_at           DATETIME(6) NOT NULL,
    completed_at         DATETIME(6) NULL,
    final_score          INT NULL,
    max_combo            INT NULL,
    removed_symbol_count INT NULL,
    play_duration_ms     BIGINT NULL,
    ended_at             DATETIME(6) NULL,

    CONSTRAINT fk_solo_session_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_solo_session_completion CHECK (
        (completed_at IS NULL
            AND final_score IS NULL
            AND max_combo IS NULL
            AND removed_symbol_count IS NULL
            AND play_duration_ms IS NULL
            AND ended_at IS NULL)
        OR
        (completed_at IS NOT NULL
            AND final_score >= 0
            AND max_combo >= 0
            AND removed_symbol_count >= 0
            AND play_duration_ms >= 0
            AND ended_at IS NOT NULL)
    ),
    INDEX idx_solo_session_user_completed (user_id, completed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE solo_session_symbols (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    solo_session_id VARCHAR(36) NOT NULL,
    position        INT NOT NULL,
    symbol          VARCHAR(20) NOT NULL,

    CONSTRAINT fk_solo_session_symbol_session
        FOREIGN KEY (solo_session_id) REFERENCES solo_sessions(id) ON DELETE CASCADE,
    CONSTRAINT uk_solo_session_symbol_position UNIQUE (solo_session_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE solo_symbol_statistics (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    solo_session_id   VARCHAR(36) NOT NULL,
    symbol            VARCHAR(20) NOT NULL,
    correct_count     INT NOT NULL,
    incorrect_count   INT NOT NULL,
    confirmed_count   INT NOT NULL,

    CONSTRAINT fk_solo_statistic_session
        FOREIGN KEY (solo_session_id) REFERENCES solo_sessions(id) ON DELETE CASCADE,
    CONSTRAINT uk_solo_statistic_session_symbol UNIQUE (solo_session_id, symbol),
    CONSTRAINT chk_solo_statistic_counts CHECK (
        correct_count >= 0 AND incorrect_count >= 0 AND confirmed_count >= 0
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE game_results
    ADD COLUMN solo_session_id VARCHAR(36) NULL AFTER score,
    ADD COLUMN play_duration_ms BIGINT NULL AFTER solo_session_id,
    ADD CONSTRAINT fk_game_result_solo_session
        FOREIGN KEY (solo_session_id) REFERENCES solo_sessions(id) ON DELETE RESTRICT,
    ADD CONSTRAINT uk_game_result_solo_session UNIQUE (solo_session_id),
    ADD CONSTRAINT chk_game_result_solo_duration CHECK (
        play_duration_ms IS NULL OR play_duration_ms >= 0
    ),
    ADD INDEX idx_game_result_solo_ranking (game_type, play_duration_ms);
