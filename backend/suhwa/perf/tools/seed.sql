-- 측정용 데이터 시딩. API 가 아니라 SQL 로 하는 이유:
--   setup() 에서 500명을 signup 하면 BCrypt 500회가 setup 에 들어가고 계정이 매 실행마다
--   누적된다. 생성 비용(측정 대상 아님)만 없애고 검증 비용(측정 대상)은 그대로 남겨야 한다.
--
-- 실행 전제: tools/seed.sh 가 먼저 POST /auth/signup 으로 계정 한 개를 만들어 둔다.
--   그 계정의 password_hash 를 복사해 N명을 만들므로, 앱의 BCrypt 강도·인코더 설정이
--   무엇이든 자동으로 일치한다. 해시를 우리가 만들지 않는 것이 이 방식의 핵심이다.
--
-- 파라미터는 seed.sh 가 sed 로 치환한다: {{USERS}}, {{WAITING_ROOMS}}

SET SESSION cte_max_recursion_depth = 1000000;

-- 1) 사용자 -----------------------------------------------------------------
-- perf-seed@perf.local 이 seed.sh 가 API 로 만든 원본이다.
-- INSERT IGNORE 를 쓴다: MySQL 은 INSERT ... WITH RECURSIVE ... SELECT 뒤에
-- ON DUPLICATE KEY UPDATE 를 붙이는 것을 문법 오류로 거부한다. 재실행 시 기존 계정을
-- 건너뛰기만 하면 되므로 IGNORE 로 충분하다.
INSERT IGNORE INTO users (email, password_hash, nickname, created_at, updated_at)
WITH RECURSIVE seq(n) AS (
    SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < {{USERS}}
)
SELECT CONCAT('perf', seq.n, '@perf.local'),
       src.password_hash,
       CONCAT('perf', seq.n),
       NOW(), NOW()
FROM seq
CROSS JOIN (SELECT password_hash FROM users WHERE email = 'perf-seed@perf.local' LIMIT 1) src;

-- 2) 학습 콘텐츠 -------------------------------------------------------------
-- 마이그레이션에 INSERT 가 없어 signs 테이블이 비어 있다. 그대로 재면 /signs 는
-- 빈 배열 응답 시간을 재는 셈이 된다(시나리오 2 전제).
-- 재실행 시 중복 적재를 막기 위해 먼저 지운다 — label 에 유니크 제약이 없어 IGNORE 가 듣지 않는다.
DELETE FROM signs WHERE label LIKE 'label-%';
INSERT INTO signs (category, label, reference_media_url, tip, is_active, created_at)
WITH RECURSIVE seq(n) AS (
    SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 30
)
SELECT ELT(1 + (n % 4), 'CONSONANT', 'VOWEL', 'NUMBER', 'WORD'),
       CONCAT('label-', n),
       CONCAT('https://example.invalid/media/', n, '.mp4'),
       CONCAT('tip-', n),
       TRUE, NOW()
FROM seq;

-- 3) 배경 WAITING 방 -------------------------------------------------------
-- 팬아웃 비용은 O(구독자 수 × WAITING 방 수)다(PLAN.md §3-3). 구독자만 늘리면
-- 실제 규모를 놓치므로 이 축을 따로 만든다.
--
-- updated_at 을 반드시 NOW() 로 넣는다. 과거 시각이면 60초마다 도는
-- GameRoomCleanupScheduler 가 보관 기간(기본 30분) 초과로 판단해 즉시 지워버린다
-- (레지스트리에 confirmed 참가자가 없으므로 보호도 받지 못한다).
-- 30분 넘는 소크에서는 GAME_ROOM_WAITING_RETENTION_MINUTES 를 올려 적재량을 고정해야 한다.
INSERT IGNORE INTO game_rooms (room_code, host_user_id, guest_user_id, host_ready, guest_ready,
                        status, game_type, version, created_at, updated_at)
WITH RECURSIVE seq(n) AS (
    SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < GREATEST({{WAITING_ROOMS}}, 1)
)
SELECT CONCAT('BG', LPAD(seq.n, 4, '0')),
       (SELECT id FROM users WHERE email = 'perf-seed@perf.local'),
       NULL, FALSE, FALSE,
       'WAITING', 'SIGN_DUEL', 0, NOW(), NOW()
FROM seq
WHERE {{WAITING_ROOMS}} > 0;

-- 재실행 시 이미 있던 배경 방의 updated_at 을 현재로 밀어, 정리 배치의 대상이 되지 않게 한다.
UPDATE game_rooms SET updated_at = NOW() WHERE room_code LIKE 'BG%' AND status = 'WAITING';

SELECT (SELECT COUNT(*) FROM users)                                AS users,
       (SELECT COUNT(*) FROM signs)                                AS signs,
       (SELECT COUNT(*) FROM game_rooms WHERE status = 'WAITING')   AS waiting_rooms;
