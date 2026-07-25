# Phase 1 Data Model: Backend Refactoring & Hardening

리팩토링 백로그이므로 신규 엔티티는 없다. 기존 엔티티에 대한 **제약/인덱스/접근 방식 변경**만 정리한다.

## User (회원)

- **변경 없음(구조)**. `win_count`/`loss_count` 카운터는 RANK-01-02 마이그레이션으로 이미 삭제됨(전적은 `game_results` 집계). 활성 판정(FR-001)은 `deleted_at` 단일 기준으로 통합, soft delete를 Hibernate 레벨(`@SQLRestriction`/`@SQLDelete` 등)에서 강제(FR-007)해 모든 조회 경로에 일관 적용.
- 비밀번호 해시: 해싱을 트랜잭션 밖에서 수행(FR-003) — 저장 값 형식 불변.
- **State**: `ACTIVE`(deleted_at IS NULL) ↔ `WITHDRAWN`(deleted_at 설정, 이메일 변형). 도달 불가능한 `ACCOUNT_WITHDRAWN` 분기 제거.

## RefreshToken (갱신 토큰)

- **스키마 변경 없음**. 처리 책임을 `RefreshTokenService`로 분리(FR-002)하는 구조 리팩토링만.
- `revokeAllByUserId` 벌크 UPDATE는 이미 `@Modifying(clearAutomatically=true, flushAutomatically=true)`로 명시됨(FR-008, 검증 완료).
- **범위 제외**: 재사용 탐지/만료 정리 배치(USER-01-10)는 이번 스펙에 포함하지 않음.

## GameResult (게임 결과)

- **현행 스키마**: `game_results(id, user_id, game_type, score, recorded_at)` — 세 게임 종류 공통 결과 기록. 구 `game_sessions` 테이블은 RANK-01-02 마이그레이션(`04_drop_game_sessions_and_users_counters.sql`)으로 **삭제됨**.
- **제약 보강(FR-015) [재확인 필요]**: GAME-02-16 원안(game_sessions·win_count 파생캐시 불일치)은 무효화됨. 현행 `game_results` 기준으로 대전 결과 중복 행 방지 등 남은 정합성 제약만 재확정 후 Flyway로 반영.
- 저장 후 검증 쿼리로 기록 정합성 확인.

## GameRoom (게임방)

- **정리 쿼리(FR-013)**: `GameRoomCleanupScheduler.cleanupStaleRooms`가 `SELECT` 후 `gameRoomRepository.deleteAll(targets)`로 엔티티마다 개별 DELETE(N+1)를 발생시킴 → 단일 `@Modifying` 벌크 DELETE로 전환. (startup reconciler의 `closeAllActiveRooms`는 상태 UPDATE로 별개 연산이며, 그쪽의 `@Modifying(clearAutomatically=true)`에 `flushAutomatically`는 **불필요 — 기동 1회·독립 트랜잭션·선행 dirty 엔티티 없음, FR-008 결론**)
- **코드 생성(FR-014)**: 유니크 코드 충돌 반복 실패 시 도메인 커스텀 예외.
- 실시간 상태(`RoomLiveState`/`ParticipantLiveState`)는 DB 아님(ConcurrentHashMap). 입장 신호(FR-016)는 상태 변경 없이 브로드캐스트만 추가.

## WrongAnswerLog (오답 로그)

- **조회 변경(FR-009, FR-010)**: 2쿼리+인메모리 조인 → DTO 프로젝션 단일 쿼리. 연관관계 없는 엔티티 간 ad-hoc JPQL JOIN 패턴 정리. 스키마 불변.

## Content (학습 콘텐츠)

- **접근 변경(FR-011)**: 카테고리별 조회에 로컬 캐시 적용. 스키마 불변.

## Ranking (game_results 집계 조회)

- **집계 방식**: 랭킹은 `game_results`를 game_type별로 집계(대전=SUM(score), 솔로=MAX(score)), `users`와 조인해 `deleted_at IS NULL`만 포함. (구 `users.win_count` 직접 조회 방식은 폐기됨)
- **인덱스(FR-017) [재확인 필요]**: 원안의 `users(win_count …)` 인덱스는 무효. 기존 `idx_game_result_type_score(game_type, score)`·`idx_game_result_user_type(user_id, game_type)`로 충분한지 실행계획 확인 후 필요 시 보강.
- **캐시는 적용하지 않음(범위 제외)**: 랭킹은 결과마다 바뀌는 쓰기 민감 데이터·게임 타입별 분리로 무효화 복잡도가 큰 반면 성능은 인덱스로 충분. RANK-01-03(Top-5 캐시)은 제외.

## 스키마 이력 (신규 인프라, FR-018)

- Flyway 도입. 현행 DB 상태(기존 `resources/schema/` 증분 4개의 누적 결과)를 풀 DDL로 덤프해 `V1__baseline.sql` 기준선으로 삼고, 이후 FR-015(제약)·FR-017(인덱스) 변경을 증분 마이그레이션으로 관리. (현재 `resources/schema/` 수동 관리에서 Flyway로 이관하며 `ddl-auto`는 기존대로 `none` 유지)
