-- 랭킹 성능 측정 전용 시딩. RankingService.getRankings() 가 game_type 별 전체 game_results
-- 를 findByGameType() 으로 한 번에 읽어 Java 힙에서 SUM/MAX 집계 + 정렬하는 현재 구현이
-- 사용자 수(=GROUP BY 카디널리티)가 커질 때 실제로 얼마나 느려지는지 보기 위한 것이다.
--
-- 다른 부하 테스트 데이터와 섞이면 "몇 명이 실제로 다른지"가 흐려지므로, 이 시딩은
-- 반드시 깨끗한 DB(docker compose down -v 직후)에서 실행한다.
--
-- 전제: perf-seed@perf.local 계정이 API 로 이미 만들어져 있어야 한다(진짜 BCrypt 해시 확보용).
-- 파라미터는 seed-ranking.sh 가 sed 로 치환한다: {{USERS}}, {{ROWS_PER_USER}}

SET SESSION cte_max_recursion_depth = 1000000;

-- 1) 사용자 {{USERS}}명 -------------------------------------------------------
INSERT IGNORE INTO users (email, password_hash, nickname, created_at, updated_at)
WITH RECURSIVE seq(n) AS (
    SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < {{USERS}}
)
SELECT CONCAT('rank', seq.n, '@perf.local'),
       src.password_hash,
       CONCAT('rank', seq.n),
       NOW(), NOW()
FROM seq
CROSS JOIN (SELECT password_hash FROM users WHERE email = 'perf-seed@perf.local' LIMIT 1) src;

-- 2) game_results {{ROWS_PER_USER}}행/유저 ------------------------------------
-- 실제 게임처럼 승/패가 섞이도록 user_id 를 몇 가지 다른 나머지로 나눠 승패 패턴을 바꾼다.
-- RankingService 는 SUM(score)=승수, (행 수 - 승수)=패수로 계산하므로 분포 자체가
-- 랭킹 결과의 "그럴듯함"에 영향을 주진 않는다 — 여기서 재는 것은 집계 성능이지 랭킹의
-- 타당성이 아니다.
INSERT INTO game_results (user_id, game_type, score, recorded_at)
WITH RECURSIVE round_seq(r) AS (
    SELECT 1 UNION ALL SELECT r + 1 FROM round_seq WHERE r < {{ROWS_PER_USER}}
)
SELECT u.id, 'SIGN_DUEL',
       CASE WHEN (u.id + round_seq.r) % 2 = 0 THEN 1 ELSE 0 END,
       NOW()
FROM users u
CROSS JOIN round_seq
WHERE u.email LIKE 'rank%@perf.local';

SELECT (SELECT COUNT(*) FROM users WHERE email LIKE 'rank%@perf.local')             AS ranked_users,
       (SELECT COUNT(*) FROM game_results WHERE game_type = 'SIGN_DUEL')            AS sign_duel_rows,
       (SELECT COUNT(DISTINCT user_id) FROM game_results WHERE game_type='SIGN_DUEL') AS distinct_players;
