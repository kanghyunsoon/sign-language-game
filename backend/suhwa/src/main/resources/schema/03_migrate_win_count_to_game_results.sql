-- ============================================
-- spec 003 — users.win_count/loss_count를 game_results로 백필 (FR-032, research.md #6)
-- COUNT(*) - SUM(score) 공식으로 패수를 계산하려면 승/패 횟수와 행(row) 개수가 1:1로
-- 일치해야 한다 — 단일 스냅샷 행이 아니라 승수만큼 score=1 행을, 패수만큼 score=0 행을
-- 각각 반복해서 삽입한다. 반드시 02_create_game_results.sql 적용 이후에 실행한다.
-- MySQL 기본 cte_max_recursion_depth(1000)보다 아래 NumberSequence 상한(10000)이 커서
-- 세션 값을 먼저 올려야 한다(실제 적용 중 발견).
-- ============================================
SET SESSION cte_max_recursion_depth = 10000;

INSERT INTO game_results (user_id, game_type, score, recorded_at)
WITH RECURSIVE NumberSequence AS (
    SELECT 1 AS n
    UNION ALL
    SELECT n + 1 FROM NumberSequence WHERE n < 10000 -- 적절한 최대 승/패수 상한선
)
SELECT u.id, 'SIGN_DUEL', 1, NOW()
FROM users u
JOIN NumberSequence ns ON ns.n <= u.win_count
UNION ALL
SELECT u.id, 'SIGN_DUEL', 0, NOW()
FROM users u
JOIN NumberSequence ns ON ns.n <= u.loss_count;
