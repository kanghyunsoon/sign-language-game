-- ============================================
-- spec 003 — game_sessions 완전 제거 및 users 승패 카운터 컬럼 제거 (research.md #7/#8)
-- game_sessions는 read된 적이 없는 write-only 테이블이었고, game_results가 승/패 집계를
-- 전부 대체한다. users.win_count/loss_count는 03_migrate_win_count_to_game_results.sql로
-- 백필된 이후에만 제거해야 한다 — 반드시 그 스크립트 이후에 실행한다.
-- ============================================
DROP TABLE game_sessions;

ALTER TABLE users DROP COLUMN win_count, DROP COLUMN loss_count;
