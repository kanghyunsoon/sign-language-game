-- RankingService의 대전(duel) 랭킹은 game_type 조건으로 game_results 전체 행을 애플리케이션
-- 힙에 로드한 뒤 Java에서 user_id별 SUM(score)/COUNT(*)로 집계했다(RankingService.getDuelRankings).
-- 이를 SQL GROUP BY로 옮기며(RankingService.java 참고), 그 GROUP BY가 인덱스만으로 처리되도록
-- (game_type, user_id, score) 커버링 인덱스로 바꾼다.
--
-- 솔로 랭킹의 기존 집계 쿼리(findBestScoresByGameType: WHERE game_type=? GROUP BY user_id,
-- MIN(score))도 이 인덱스로 함께 커버된다 — user_id가 game_type 다음 컬럼이라 GROUP BY user_id에
-- loose index scan을 쓸 수 있다.
--
-- V2__game_room_cleanup_index.sql에서 "행 수가 적어 풀스캔이 최적, 인덱스 불필요"라고 판단했던
-- idx_game_result_type_score(game_type, score)는 그 결론의 전제(적은 행 수)가 더 이상 유효하지
-- 않아 대체한다. score가 두 번째 컬럼이라 GROUP BY user_id에는 애초에 못 썼다.
ALTER TABLE game_results
    DROP INDEX idx_game_result_type_score,
    ADD INDEX idx_game_result_type_user_score (game_type, user_id, score);
