-- ============================================
-- spec 003 — game_rooms.game_type 컬럼 추가 (FR-017/018/020, data-model.md)
-- 대전 모드 게임 종류(지문자 1:1 대전/테트리스 대전) 구분. 기존 행은 SIGN_DUEL로 백필된다.
-- 반드시 scripts/schema.sql로 game_rooms가 이미 생성된 이후에 적용한다.
-- ============================================
ALTER TABLE game_rooms ADD COLUMN game_type VARCHAR(20) NOT NULL DEFAULT 'SIGN_DUEL';
