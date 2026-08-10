-- Preserve V6 solo completion times as the canonical whole-second score.
-- Ceiling avoids treating a partial second as a faster result at reward boundaries.
UPDATE game_results
SET score = CEIL(play_duration_ms / 1000.0)
WHERE game_type = 'TETRIS_SOLO'
  AND play_duration_ms IS NOT NULL;

ALTER TABLE game_results
    DROP FOREIGN KEY fk_game_result_solo_session,
    DROP INDEX uk_game_result_solo_session,
    DROP CHECK chk_game_result_solo_duration,
    DROP INDEX idx_game_result_solo_ranking,
    DROP COLUMN solo_session_id,
    DROP COLUMN play_duration_ms;

DROP TABLE solo_session_symbols;
DROP TABLE solo_symbol_statistics;
DROP TABLE solo_sessions;
DROP TABLE practice_sessions;
