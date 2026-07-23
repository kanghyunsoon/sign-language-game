-- ============================================
-- spec 003 — game_results 신설 (FR-025/026/029/032, data-model.md)
-- 세 게임 종류(지문자 1:1 대전/테트리스 대전/테트리스 솔로) 공통 결과 기록. 랭킹 집계 원본.
-- 대전 모드는 승자 score=1/패자 score=0 행을 함께 남기고(무승부는 기록 없음), 솔로는 보고할
-- 때마다 실제 점수를 그대로 남긴다(research.md #5).
-- ============================================
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
  COMMENT='세 게임 종류(지문자 1:1 대전/테트리스 대전/테트리스 솔로) 공통 결과 기록 — 랭킹 집계 원본';
