-- Growth prototype foundation: one nameless pet per user.

INSERT INTO user_pets (user_id, level, exp, created_at, updated_at)
SELECT u.id, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM users u
LEFT JOIN user_pets p ON p.user_id = u.id
WHERE p.id IS NULL;

ALTER TABLE user_pets
    DROP COLUMN name,
    ADD CONSTRAINT chk_user_pet_level CHECK (level BETWEEN 1 AND 10),
    ADD CONSTRAINT chk_user_pet_exp CHECK (
        (level < 10 AND exp BETWEEN 0 AND 19)
        OR (level = 10 AND exp = 0)
    );
