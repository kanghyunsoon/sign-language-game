ALTER TABLE game_rooms
    ADD COLUMN room_title  VARCHAR(50) NOT NULL DEFAULT '새로운 방' AFTER room_code,
    ADD COLUMN symbol_range VARCHAR(20) NOT NULL DEFAULT 'ALL' AFTER game_type;
