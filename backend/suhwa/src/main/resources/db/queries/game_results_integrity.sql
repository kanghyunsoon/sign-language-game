-- game_results 운영 무결성 진단 쿼리
-- 모든 조회 결과는 정상 상태에서 0건이어야 한다.

-- 존재하지 않거나 탈퇴한 사용자의 결과
SELECT gr.id, gr.user_id, gr.game_type, gr.score, gr.recorded_at
FROM game_results gr
LEFT JOIN users u ON u.id = gr.user_id
WHERE u.id IS NULL
   OR u.deleted_at IS NOT NULL;

-- 대전 결과는 승자 1, 패자 0만 허용
SELECT gr.id, gr.user_id, gr.game_type, gr.score
FROM game_results gr
WHERE gr.game_type IN ('SIGN_DUEL', 'TETRIS_DUEL')
  AND gr.score NOT IN (0, 1);

-- 솔로 score는 완료까지 걸린 초이므로 양수만 허용
SELECT gr.id, gr.user_id, gr.game_type, gr.score
FROM game_results gr
WHERE gr.game_type = 'TETRIS_SOLO'
  AND gr.score <= 0;

-- 사용자별 솔로 최고 기록과 경쟁 순위 진단
SELECT ranked.user_id,
       ranked.best_score,
       RANK() OVER (ORDER BY ranked.best_score ASC) AS competition_rank
FROM (
    SELECT user_id, MIN(score) AS best_score
    FROM game_results
    WHERE game_type = 'TETRIS_SOLO'
    GROUP BY user_id
) ranked
ORDER BY ranked.best_score ASC, ranked.user_id ASC;
