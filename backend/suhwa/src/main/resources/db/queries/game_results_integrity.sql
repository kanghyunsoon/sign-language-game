-- ============================================
-- game_results 정합성 점검 쿼리 (spec 004 FR-015, GAME-02-16-T03)
--
-- 운영 중 랭킹/전적 원본(game_results)의 이상 데이터를 탐지하기 위한 진단 쿼리 모음.
-- 애플리케이션 로직으로 강제되는 불변식을 DB에서 사후 검증한다(정상 시 모두 0건).
--
-- 배경: 구 game_sessions·users.win_count 대조 방식은 RANK-01-02 마이그레이션
-- (04_drop_game_sessions_and_users_counters)으로 폐기됨. 아래는 현행 game_results
-- 스키마(id, user_id, game_type, score, recorded_at) 기준이다.
--
-- 참고: game_results는 insert-only 로그이며 재대결마다 행이 누적되는 것이 정상이다.
-- 따라서 "중복 행"을 유니크 제약으로 막지 않는다 — 아래 쿼리는 값 범위/참조 무결성만 본다.
-- ============================================

-- [1] 존재하지 않는(또는 탈퇴로 소프트 삭제된) 사용자를 참조하는 결과 — FK로 물리 삭제는
--     막히지만, 소프트 삭제(users.deleted_at) 사용자의 잔존 결과를 점검한다. (정상: 0건)
SELECT gr.id, gr.user_id, gr.game_type, gr.score, gr.recorded_at
FROM game_results gr
         LEFT JOIN users u ON u.id = gr.user_id
WHERE u.id IS NULL
   OR u.deleted_at IS NOT NULL;

-- [2] 대전(1:1) 결과 score 범위 위반 — SIGN_DUEL/TETRIS_DUEL은 승자 1 / 패자 0만 허용.
--     (정상: 0건)
SELECT gr.id, gr.user_id, gr.game_type, gr.score
FROM game_results gr
WHERE gr.game_type IN ('SIGN_DUEL', 'TETRIS_DUEL')
  AND gr.score NOT IN (0, 1);

-- [3] 음수 점수 — 어떤 게임 종류에서도 점수는 음수가 될 수 없다. (정상: 0건)
SELECT gr.id, gr.user_id, gr.game_type, gr.score
FROM game_results gr
WHERE gr.score < 0;

-- [4] (참고 지표) 게임 종류별 결과 분포 — 이상 급증/급감 모니터링용. 0건 기대 쿼리가 아님.
SELECT game_type, COUNT(*) AS total, SUM(CASE WHEN score = 1 THEN 1 ELSE 0 END) AS wins
FROM game_results
GROUP BY game_type;
