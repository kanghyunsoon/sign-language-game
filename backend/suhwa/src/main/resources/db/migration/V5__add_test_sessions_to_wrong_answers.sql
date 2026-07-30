-- Group individual wrong-answer events by test attempt.
--
-- Existing wrong_answer_logs cannot be assigned to a test reliably, so the
-- new foreign key remains nullable. New test flows should create one
-- test_sessions row and attach its id to every wrong answer from that test.

CREATE TABLE test_sessions (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id      BIGINT NOT NULL,
    started_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,

    CONSTRAINT fk_test_session_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,

    INDEX idx_test_session_user_completed (user_id, completed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='User test attempts for grouping wrong-answer events';

ALTER TABLE wrong_answer_logs
    ADD COLUMN test_session_id BIGINT NULL AFTER sign_id,
    ADD INDEX idx_wronglog_test_session (test_session_id),
    ADD CONSTRAINT fk_wronglog_test_session
        FOREIGN KEY (test_session_id) REFERENCES test_sessions(id) ON DELETE RESTRICT;
