-- spec 004 FR-017 (GAME-02-14-T03 / RANK-01-04 재확정)
--
-- 방치 방 정리 스케줄러(FR-013)의 두 조회와 로비 목록 조회는 모두 game_rooms를
-- (status, updated_at) 조건으로 훑는다. 기존 idx_room_status(status)는 status만 인덱스로
-- 좁히고 updated_at은 행을 읽은 뒤 필터링한다(EXPLAIN: type=ref, key_len=1,
-- Extra="Using where"). 복합 인덱스로 바꾸면 두 조건이 모두 인덱스 안에서 해결된다.
--
-- idx_room_status는 새 인덱스의 최좌측 접두사와 정확히 같아 중복이므로 함께 제거한다.
-- status 단독 조회(findByStatus, 로비 목록)도 새 인덱스가 그대로 커버한다.
--
-- 랭킹 집계(game_results의 game_type별 SUM/MAX)에는 인덱스를 추가하지 않는다 —
-- 실행계획상 기존 idx_game_result_type_score(game_type, score)가 game_type 조건을 커버하며
-- possible_keys에 정상 노출된다. 현재 전체 스캔이 선택되는 것은 행 수가 적어 옵티마이저가
-- 그렇게 판단한 결과일 뿐 인덱스 부재 때문이 아니다. RANK-01-04 원안의
-- users(deleted_at, win_count, loss_count) 인덱스는 win_count 컬럼 삭제로 이미 무효.
--
-- 버전 번호: T023(게임결과 정합성 제약)이 마이그레이션 불필요로 결론나 V2가 비었으므로
-- 그 번호를 당겨 쓴다(tasks.md T023 결정 기록 참조).

ALTER TABLE game_rooms
    DROP INDEX idx_room_status,
    ADD INDEX idx_room_status_updated_at (status, updated_at);
