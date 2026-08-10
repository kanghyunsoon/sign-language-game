-- 기존 펫의 레벨과 경험치는 변경하지 않고 성장 가능 범위만 20레벨까지 확장한다.
ALTER TABLE user_pets
    DROP CHECK chk_user_pet_level,
    DROP CHECK chk_user_pet_exp,
    ADD CONSTRAINT chk_user_pet_level CHECK (level BETWEEN 1 AND 20),
    ADD CONSTRAINT chk_user_pet_exp CHECK (
        (level < 20 AND exp BETWEEN 0 AND 19)
        OR (level = 20 AND exp = 0)
    );
