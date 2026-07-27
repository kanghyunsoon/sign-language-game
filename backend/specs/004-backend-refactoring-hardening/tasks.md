---
description: "Task list for Backend Refactoring & Hardening Backlog"
---

# Tasks: Backend Refactoring & Hardening Backlog

**Input**: Design documents from `backend/specs/004-backend-refactoring-hardening/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: 포함함 — 대응 지라 스토리들이 테스트 서브태스크를 명시하고, spec의 회귀 0(SC-006) 기준을 검증해야 하므로 각 스토리에 테스트 태스크를 둔다.

**Organization**: 스토리(US1~US5, 우선순위 P1→P3)별로 그룹화하여 독립 구현·검증 가능하게 한다.

**경로 기준**: `backend/suhwa/src/main/java/backend/ssafy/suhwa/` (이하 `.../`로 축약), 테스트는 `backend/suhwa/src/test/java/backend/ssafy/suhwa/`, 마이그레이션은 `backend/suhwa/src/main/resources/db/migration/`.

**범위 제외**: USER-01-10(RT 재사용/정리 배치), RANK-01-03(랭킹 Top-5 캐시).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 신규 의존성·공통 설정 도입 (현재 build.gradle에 없음 — research R1/R2/R3)

- [X] T001 [P] `backend/suhwa/build.gradle`에 Flyway 의존성 추가: `org.flywaydb:flyway-core` **+ MySQL 8이므로 별도 artifact `org.flywaydb:flyway-mysql` 필수**. 버전은 Spring Boot 4 BOM이 관리하면 생략, 아니면 명시 (FR-018)
- [X] T002 [P] `backend/suhwa/build.gradle`에 `spring-boot-starter-cache` + `com.github.ben-manes.caffeine:caffeine` 추가 (FR-011)
- [X] T003 [P] `backend/suhwa/build.gradle`에 `com.tngtech.archunit:archunit-junit5` (testImplementation) 추가 — **Spring Boot BOM 미관리이므로 버전 명시 필요**(예: `:1.3.0`) (FR-020)
- [X] T004 [P] Caffeine 기반 `CacheConfig` 작성 `.../common/config/CacheConfig.java` + `@EnableCaching` (FR-011 준비, LEARN-01-02-T01)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 이후 모든 스키마 변경(FR-015 게임결과 제약, FR-017 인덱스)의 전제. Flyway 단일 소스로 통일.

**⚠️ CRITICAL**: T006 완료 전에는 스키마를 건드리는 스토리 태스크(T023, T033)를 시작할 수 없다.

- [X] T005 `backend/suhwa/src/main/resources/application.yaml`에 Flyway 활성화(`spring.flyway.enabled=true`, `baseline-on-migrate=true`) 설정, `ddl-auto`가 `none`인지 확인 (STABLE-08-09-T01/T02)
- [X] T006 `.../resources/db/migration/V1__baseline.sql` 작성: 기존 `resources/schema/`의 증분 SQL 4개(`01_add_game_type`~`04_drop_game_sessions_and_users_counters`)를 **누적 적용한 현재 DB 상태 전체를 풀 DDL로 덤프**해 기준선으로 삼음(증분 파일 단순 복사 아님). 이후 `resources/schema` 수동 관리 폐기 (FR-018, STABLE-08-09-T03)

**Checkpoint**: 스키마 이력 관리 준비 완료 — 스토리 구현 시작 가능

---

## Phase 3: User Story 1 - 인증·회원 도메인 정확성 및 안전성 보강 (Priority: P1) 🎯 MVP

**Goal**: 경계 상황(익명·초장문 비번·탈퇴 직후·서비스 분리)에서 예측 가능한 응답과 일관된 활성 판정.

**Independent Test**: 인증 모듈만으로 익명 401·비번 상한 400·탈퇴 조회 차단·로그인/갱신/로그아웃 동작 동일성을 검증.

### Tests (US1)

- [X] T007 [P] [US1] 익명 인증 시 401(500 아님)·비밀번호 상한 400·탈퇴 계정 조회 차단 회귀 테스트 `.../test/.../auth/AuthSecurityTest.java`, `.../user/UserWithdrawTest.java` (USER-01-05-T03·08-T02·09-T02·12-T03)

### Implementation (US1)

- [X] T008 [P] [US1] `UserService.findActiveByEmail` 추가 + `AuthService.login`이 재사용, `ErrorCode.ACCOUNT_WITHDRAWN` 및 관련 분기 삭제 `.../user/service/UserService.java`, `.../auth/service/AuthService.java`, `.../common/exception/ErrorCode.java` (FR-001)
- [X] T009 [P] [US1] `RefreshTokenService`(issue/rotate/revokeAll/hash) 신설 `.../auth/service/RefreshTokenService.java` (FR-002)
- [X] T010 [US1] `AuthService`가 `RefreshTokenService`를 조립만 하도록 리팩터링, `AuthService.TokenPair` 제거하고 `TokenResponse` 직접 반환, `UserService.withdraw`가 `RefreshTokenService.revokeAll(userId)` 호출 `.../auth/service/AuthService.java`, `.../user/service/UserService.java` (FR-002, depends T009)
- [X] T011 [P] [US1] `AuthService.login`·`UserService.signup`의 BCrypt 대조/인코딩을 `@Transactional` 밖으로 분리(토큰 발급만 쓰기 트랜잭션) (FR-003)
- [X] T012 [P] [US1] ~~`CurrentUserArgumentResolver`에 `instanceof Long` 캐스팅 방어 추가~~ **미도입 결정(N/A)**: 현행 `SecurityConfig`가 `.anyRequest().authenticated()`라 보호 경로는 리졸버 도달 전 상류에서 401 차단되고, `permitAll` + `@LoginUser` 조합이 코드베이스에 없어 익명 principal이 리졸버까지 도달하는 경로가 없음. 도달 불가능한 500을 위한 방어 코드는 도입하지 않음(코드 우선 원칙) `.../common/security/CurrentUserArgumentResolver.java` (FR-004, USER-01-08)
- [X] T013 [P] [US1] 비밀번호 상한 검증 추가 — `SignupRequest`는 이미 `@Size(min=8)`이 있으므로 **`max=64`만 추가**, `LoginRequest`는 password에 검증이 전혀 없으므로 상한 `@Size(max=64)` 추가(로그인은 min 불필요, DB 대조 전 초장문 차단 목적) `.../auth/dto/SignupRequest.java`, `.../auth/dto/LoginRequest.java` (FR-005, USER-01-09)
- [X] T014 [P] [US1] 로그아웃/탈퇴 후 Access Token 유효 지연 트레이드오프를 `spec.md`/`data-model.md`에 한 줄 명시 (FR-006, USER-01-11)
- [X] T015 [P] [US1] `User`에 `@SQLRestriction("deleted_at IS NULL")` 적용, 네이티브/벌크 DML 우회 경로 문서화 `.../user/domain/User.java`. **적용 후 중복이 되는 수동 필터 정리**: `RankingService.getRankings`의 `.filter(u -> !u.isDeleted())`(L42) 등 각 서비스의 수동 `isDeleted()` 체크가 @SQLRestriction으로 대체 가능한지 감사·제거(단 login 등 명시적 오류 응답이 필요한 곳은 유지) `.../ranking/service/RankingService.java` (FR-007, USER-01-12-T02)
- [X] T016 [US1] `withdraw` flush 순서 확정 반영: `RefreshTokenRepository.revokeAllByUserId`의 `@Modifying(flushAutomatically,clearAutomatically)` 유지 확인(현행 정상) `.../auth/repository/RefreshTokenRepository.java` (FR-008)

**Checkpoint**: US1 독립 검증 가능 (인증 회귀 스위트 그린)

---

## Phase 4: User Story 2 - 게임방 동시성 안전성 및 결과 정합성 (Priority: P1)

**Goal**: 동시 결과 보고·정리·코드 생성에서 데드락/유실 없이 정확 기록.

**Independent Test**: 동시 `reportResult`로 데드락 0·1건 확정, 대량 방 정리 단일 벌크 DML, 코드 생성 실패 커스텀 예외, game_results 정합성 쿼리 0건.

### Tests (US2)

- [X] T017 [P] [US2] 동시 `reportResult` 경합/데드락 재현 테스트 `.../test/.../game/ReportResultConcurrencyTest.java` (GAME-02-13-T03. **재확인: 현행은 User 행 갱신이 없고 `game_results` INSERT뿐이라 원안 데드락 구조가 없을 수 있음 — 실제 경합 여부부터 테스트로 확인**)
- [X] T018 [P] [US2] 대전 결과 `game_results` 기록 정합성(같은 방/게임 중복 행 없음) 검증 테스트 `.../test/.../gameresult/GameResultIntegrityTest.java` (GAME-02-16-T04. **스키마 변경 반영: `game_sessions`·`users.win_count`는 RANK-01-02 마이그레이션(04_drop)으로 이미 삭제됨 → 검증 대상은 `game_results`**)

### Implementation (US2)

- [X] T019 [US2] **[재확인 필요]** `reportResult` 데드락 안전성 확보. **주의: GAME-02-13 원안(winnerId/loserId 정렬 후 `users` 단일 조회·갱신)은 win_count 삭제로 User 갱신이 사라져 무효.** 현행 `game_results` INSERT 2건(winner score=1 / loser score=0)의 FK 락 순서 등 실제 경합이 T017에서 확인되면 삽입 순서 고정 등으로 대응, 없으면 조치 불요 `.../game/service/GameRoomService.java` (FR-012, GAME-02-13) — **결정(조치 불요)**: 현행 `reportResult`는 User 행 갱신 없이 `game_results` INSERT + `game_rooms` 상태전이(`@Version` 낙관적 락)뿐이라 원안 데드락 구조가 없음. 동시 보고는 낙관적 락 충돌(409) 또는 상태 가드(ROOM_NOT_IN_PROGRESS)로 정확히 1회만 기록됨을 `ReportResultConcurrencyTest`(T017)로 확인. 코드 변경 없음.
- [X] T020 [US2] **[조건부]** `GlobalExceptionHandler`에 `DataAccessException` 전용 핸들러(`ErrorResponse` 500) 추가 — 현재 없음. 단 T041의 catch-all `Exception`→500이 들어가면 사실상 커버되므로, DB 오류를 별도 로깅/코드로 구분할 필요가 있을 때만 별도 추가 `.../common/exception/GlobalExceptionHandler.java` (FR-012→FR-024, GAME-02-13-T02) — **결정(US5 T041로 위임)**: `DataAccessException` 전용 핸들러는 추가하지 않고, US5의 catch-all `Exception`→500(T041, `ErrorResponse` 일관 포맷)으로 커버. 현시점 DB 오류를 별도 코드로 구분할 요구가 없음.
- [X] T021 [US2] `GameRoomCleanupScheduler.cleanupStaleRooms`의 `deleteAll(targets)`를 `@Modifying` 단일 벌크 DELETE로 전환 `.../game/scheduler/GameRoomCleanupScheduler.java`, `.../game/repository/GameRoomRepository.java` (FR-013, GAME-02-14-T01)
- [X] T022 [P] [US2] `ErrorCode.ROOM_CODE_GENERATION_FAILED` 추가 + `generateUniqueRoomCode` 실패를 `BusinessException`으로 전환 `.../common/exception/ErrorCode.java`, `.../game/service/GameRoomService.java` (FR-014, GAME-02-15-T01)
- [X] T023 [US2] **[재확인 필요]** `game_results` 결과 기록 정합성 강화. **주의: GAME-02-16 원안(`game_sessions` 보강·`started_at` 컬럼·win_count 파생캐시 불일치)은 RANK-01-02 마이그레이션으로 `game_sessions`/`win_count`가 삭제되며 대부분 무효화됨.** 남은 실질 작업은 대전 결과 중복 행 방지 제약(예: 방·게임 단위 유니크)이 필요한지 현행 `game_results` 스키마 기준으로 재확정 후, 필요 시 `V2__game_results_integrity.sql` 작성 `.../resources/db/migration/` (FR-015, GAME-02-16, depends T006. **버전 선점: `V2`, T033=`V3`**) — **결정(마이그레이션 불필요)**: `game_results`는 insert-only 로그이고 `room_id`가 없으며 재대결마다 행이 누적되는 것이 정상이라 중복방지 유니크 제약이 오히려 부정확함. 낙관적 락(T019)이 동시 중복 기록을 이미 차단. 따라서 V2 미작성 — **`V2` 버전 번호는 미사용으로 남고, T033은 그대로 `V2`로 당겨 사용 가능**. 정합성은 사후 진단 쿼리(T024)로 대체.
- [X] T024 [US2] `game_results` 기반 랭킹/전적 정합성 검증 쿼리 작성·문서화(중복·누락 탐지). game_sessions/win_count 대조는 폐기 `data-model.md` 또는 `.../resources/db/queries/` (FR-015, GAME-02-16-T03)

**Checkpoint**: US1 + US2 각각 독립 동작

---

## Phase 5: User Story 3 - 입장 실시간 신호 전파 (Priority: P2)

**Goal**: 신규 참가자 최초 WS 연결 시 상대에게 즉시 입장 신호. 재접속과 구분.

**Independent Test**: A 연결 후 B 최초 연결 → A가 `PEER_JOINED` 수신, 재접속 시 `PEER_RECONNECTED`만, 상대 없음/끊김에도 연결 수립 성공.

### Tests (US3)

- [X] T025 [P] [US3] 최초 입장→상대 `PEER_JOINED` 수신 & 재접속 분기·전송 실패 격리 통합 테스트 `.../test/.../game/realtime/GameRoomWebSocketHandlerTest.java` (GAME-02-21-T04/T05) — 3건 추가(최초 입장 전파 / 재접속은 `PEER_RECONNECTED`만 / 상대 세션 없어도 연결 수립 성공). **기존 테스트 3건 기대값 갱신**: 먼저 접속한 참가자의 큐에 `PEER_JOINED`가 선행하므로 `setReady`·`startGame`·`SIGNAL` 테스트에서 `drainPeerJoined`로 명시 소비(계약 추가에 따른 정상 변경)

### Implementation (US3)

- [X] T026 [US3] `PEER_JOINED` 메시지 타입을 `backend/specs/002-realtime-sse-websocket/contracts/realtime-websocket-messages.md`에 추가(본 스펙 contracts delta 반영) (FR-016, GAME-02-21-T01) — 서버→클라이언트 표에 행 추가 + 핸드셰이크 "성공 시" 항목에 최초 확정/재접속 분기 명시. FR 번호가 spec 002의 FR-016(PEER_LEFT)과 겹치므로 `spec 004 FR-016`으로 표기
- [X] T027 [US3] `RoomRealtimeNotifier.notifyPeerJoined(roomId, userId)` 추가 + `WebSocketRoomRealtimeNotifier` 구현(sendToOthers PEER_JOINED) `.../game/realtime/RoomRealtimeNotifier.java`, `.../game/realtime/WebSocketRoomRealtimeNotifier.java` (FR-016, GAME-02-21-T02)
- [X] T028 [US3] `afterConnectionEstablished`의 **최초 확정(비-재접속)** 경로에서 `notifyPeerJoined` 호출 `.../game/realtime/GameRoomWebSocketHandler.java` (FR-016, GAME-02-21-T03, depends T027) — 기존 `reconnect` 판정만으로는 부족: 이미 확정된 세션이 살아있는 상태의 추가 연결(멀티탭)은 `reconnect=false`라 `else`로 두면 `PEER_JOINED`가 중복 발송된다. `setConfirmed(true)` 이전 값을 `firstConfirmation`으로 따로 캡처해 최초 확정에서만 발송

**Checkpoint**: US1~US3 독립 동작

---

## Phase 6: User Story 4 - 조회 성능 최적화 (Priority: P2)

**Goal**: 오답노트 단일 쿼리, 콘텐츠 Caffeine 캐시, 랭킹 복합 인덱스.

**Independent Test**: 오답노트 조회 단일 쿼리, 콘텐츠 2회차 캐시 히트(DB 미조회), 랭킹 실행계획에서 인덱스 사용.

### Tests (US4)

- [X] T029 [P] [US4] 오답노트 단일 쿼리·콘텐츠 캐시 히트·랭킹 인덱스 사용 검증 테스트 `.../test/.../learning/`, `.../test/.../ranking/` (TEST-01-04-T02, LEARN-01-02, RANK-01-04) — `LearningQueryOptimizationTest` 신설, Hibernate 통계(`generate_statistics`)의 PreparedStatement 수로 검증: ① 오답노트 조회 = 정확히 1쿼리, ② 콘텐츠 2회차 조회 = 추가 쿼리 0(캐시 히트). **랭킹 인덱스 사용 검증은 대상 없음(N/A)** — T033에서 인덱스를 추가하지 않기로 확정했고, EXPLAIN 결과는 환경(행 수)에 따라 달라져 단위 테스트로 고정하면 거짓 실패를 낳는다. 근거는 T033에 실행계획으로 기록

### Implementation (US4)

- [X] T030 [US4] 오답노트 조회를 DTO 프로젝션 단일 쿼리로 전환(`getRecentWrongAnswers`) `.../learning/repository/WrongAnswerLogRepository.java`, `.../learning/service/WrongAnswerService.java` (FR-009, TEST-01-04-T01/T02) — 중첩 생성자 표현식으로 `WrongAnswerResponse(… new SignResponse(…) …)`를 쿼리에서 직접 생성. 서비스의 `findAllById` + 인메모리 조인 제거, 더 이상 쓰이지 않는 `WrongAnswerResponse.of` 삭제
- [X] T031 [US4] 연관관계 없는 엔티티 간 ad-hoc JPQL JOIN 패턴 정리(T030 반영 후 잔존 확인) `.../learning/` (FR-010, TEST-01-05) — **결정(연관관계 매핑 미도입)**: 이 코드베이스는 `GameRoom.hostUserId` 등 전반이 연관관계 없이 식별자 참조로 통일돼 있어 `WrongAnswerLog`에만 `@ManyToOne`을 넣으면 오히려 패턴이 갈린다. 대신 ad-hoc JOIN을 서비스가 아닌 리포지토리 프로젝션 쿼리 한 곳으로 수렴시키고 의도를 주석으로 고정. T030 반영 후 main 전체에 남은 ad-hoc JOIN은 이 1건뿐임을 확인
- [X] T032 [US4] `SignService.getActiveSignsByCategory`에 `@Cacheable`(CacheConfig 재사용) `.../learning/service/SignService.java` (FR-011, LEARN-01-02-T02, depends T004) — 캐시에 담기는 `Sign`은 세터·연관관계·쓰기 API가 없어 detach 공유가 안전함을 주석으로 명시
- [X] T033 [US4] **[재확인 필요]** `V3__ranking_indexes.sql`: 정리 스케줄러용 `game_rooms(status, updated_at)` 인덱스 추가. **주의: RANK-01-04 원안의 `users(deleted_at, win_count DESC, loss_count ASC)` 인덱스는 `win_count` 삭제로 무효** — 랭킹은 이제 `game_results`(game_type+score) 집계이며 `idx_game_result_type_score(game_type, score)`·`idx_game_result_user_type(user_id, game_type)`가 이미 존재하므로, 집계 쿼리 실행계획을 보고 **추가 인덱스가 실제 필요한지 재확정** 후 반영 `.../resources/db/migration/` (FR-017, RANK-01-04·GAME-02-14-T03, depends T006. **버전 `V3` 고정 — T023(`V2`)와 충돌 금지**) — **결정(로컬 MySQL 실행계획 확인 후)**: 파일명은 `V2__game_room_cleanup_index.sql`(T023이 V2를 안 써서 당겨 씀).
    - **랭킹 인덱스 추가 안 함**: `SELECT … FROM game_results WHERE game_type=?`의 EXPLAIN에서 `possible_keys=idx_game_result_type_score`로 기존 인덱스가 정상 후보다. 현재 `type=ALL`인 것은 행이 67건뿐이라 옵티마이저가 전체 스캔을 고른 결과일 뿐 인덱스 부재가 아니다. 정렬·집계는 서비스 계층에서 하므로 커버링 인덱스 이득도 없음
    - **`game_rooms(status, updated_at)` 복합 인덱스 추가**: `WHERE status=? AND updated_at<?`가 `type=ref, key_len=1, Extra="Using where"` — status만 인덱스로 좁히고 updated_at은 행 필터였다. 중복이 되는 `idx_room_status`(새 인덱스의 최좌측 접두사)는 함께 제거
    - **⚠️ 미적용 상태**: 이 마이그레이션은 **아직 어떤 DB에도 적용되지 않는다**. Spring Boot 4는 자동설정이 모듈로 분리돼 `org.flywaydb:flyway-core`만으로는 Flyway 자동설정이 활성화되지 않고 `org.springframework.boot:spring-boot-flyway` 모듈이 필요한데 build.gradle에 없다(runtimeClasspath에 `spring-boot-jpa`·`spring-boot-cache`는 있으나 `spring-boot-flyway`는 없음). 실제로 로컬 MySQL에 `flyway_schema_history` 테이블이 생성된 적이 없어 V1 baseline조차 실행된 적 없음 → **T005/T006(Foundational)의 재작업 필요**. 이 브랜치 범위 밖이라 별도 처리

**Checkpoint**: US1~US4 독립 동작

---

## Phase 7: User Story 5 - 운영 안정성 및 유지보수성 기반 정비 (Priority: P3)

**Goal**: open-in-view·타임아웃·풀/배치·CORS 미설정 동작·ArchUnit·예외 정리·필터체인 테스트.

**Independent Test**: 각 설정이 프로퍼티에 반영, ArchUnit 위반 실패, CORS 미설정 동작, 필터체인 통합 테스트 400/401 포맷.

### Tests (US5)

- [ ] T034 [P] [US5] 필터 체인을 켠 `@SpringBootTest` 통합 테스트(유효 토큰+잘못된 파라미터/토큰 없음/깨진 JSON → 400/401 포맷) `.../test/.../common/FilterChainIntegrationTest.java` (FR-025, STABLE-08-16-T01)
- [ ] T035 [P] [US5] `CorsConfig` 값 설정/미설정 양쪽 동작 테스트 `.../test/.../common/config/CorsConfigTest.java` (FR-019, STABLE-08-10-T01/T04)

### Implementation (US5)

- [ ] T036 [P] [US5] `application.yaml`에 `spring.jpa.open-in-view: false` (FR-021, STABLE-08-12 — 연관관계 부재로 회귀 위험 없음)
- [ ] T037 [P] [US5] 트랜잭션/쿼리 타임아웃 설정 — `application.yaml`에 전역 기본(3s), **cleanup 스케줄러 30s override는 `GameRoomCleanupScheduler.cleanupStaleRooms`에 `@Transactional(timeout=30)`로 직접 적용** `backend/suhwa/src/main/resources/application.yaml`, `.../game/scheduler/GameRoomCleanupScheduler.java` (FR-022, STABLE-08-13)
- [ ] T038 [P] [US5] `application.yaml`에 HikariCP(`maximum-pool-size`, `connection-timeout=3000`) + `hibernate.jdbc.batch_size=30`/`order_inserts`/`order_updates` (FR-023, STABLE-08-14-T01; 최종 풀 크기는 부하 테스트로 확정 STABLE-08-14-T02)
- [ ] T039 [US5] CORS 빈 값 동작 명시화 — **현재 `CorsConfig`는 빈 값 시 `setAllowedOrigins([])`로 이미 "차단"(fail-closed) 동작함**(우리 정책 R5와 일치, 지라 STABLE-08-10 원안의 "전체 허용"과는 반대이므로 정책 확정 필요). 실제 남은 작업은 **미설정 시 기동 경고 로그 추가** + 정책 주석/문서화. `RealtimeWebSocketConfig`도 동일 확인 `.../common/config/CorsConfig.java`, `.../game/realtime/RealtimeWebSocketConfig.java` (FR-019, STABLE-08-10-T02/T03)
- [ ] T040 [US5] ArchUnit 모듈 경계 규칙 3종(리포지토리 접근 제한, 컨트롤러 리포지토리 직접참조 금지, 서비스 표준예외 금지) 작성 `.../test/.../architecture/ModuleBoundaryTest.java` (FR-020, STABLE-08-11-T02/T03, depends T003. **주의: 현재 `auth↔user` 양방향 의존(`AuthService→user.UserRepository`, `UserService→auth.RefreshTokenRepository`)이 존재하고 T008/T010 후에도 유지됨 → "리포지토리는 같은 모듈에서만 접근" 규칙이 이를 위반으로 잡음. 규칙에 허용 예외를 두거나 두 모듈 간 의존을 서비스 인터페이스로 정리할지 STABLE-08-11-T04에서 함께 결정**)
- [ ] T041 [US5] `GlobalExceptionHandler` 보강 — **이미 존재**(추가 금지): `BusinessException`, `OptimisticLockingFailureException`→409, `MissingServletRequestParameter`/`MethodArgumentTypeMismatch`→400, `MethodArgumentNotValid`→400. **실제로 없어서 추가할 것만**: `HttpMessageNotReadableException`→400(깨진 JSON), `ConstraintViolationException`→400, **catch-all `Exception`→500+`log.error`**, 그리고 `JwtTokenProvider.getUserId`의 `NumberFormatException` 방어 `.../common/exception/GlobalExceptionHandler.java`, `.../common/security/JwtTokenProvider.java` (FR-024, STABLE-08-15. **동일 파일을 수정하는 T020(DataAccessException)보다 뒤에 수행 — T020 → T041 순서. catch-all은 `DataAccessException` 등 구체 핸들러보다 특이도가 낮아 공존 가능**)

**Checkpoint**: 전 스토리 독립 동작

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T042 [P] 운영 배포 문서에 CORS 필수 환경변수·Flyway 컨벤션 명시 `docs/` 또는 `quickstart.md` (STABLE-08-09-T05, STABLE-08-10-T05)
- [ ] T043 `quickstart.md` 검증 시나리오 전체 실행(회귀 0 확인)
- [ ] T044 `./gradlew build` 그린 확인(기존 + 신규 테스트 통과, SC-006)

---

## Dependencies & Execution Order

### Phase Dependencies
- Setup(P1) → 의존 없음, 즉시 시작. T004는 T002 후.
- Foundational(P2) → Setup 후. T006이 **T023·T033을 블록**.
- User Stories(P3~7) → Foundational 후. US1~US5는 서로 독립(병렬 가능). 단 스키마 변경 태스크(T023·T033)만 T006 의존.
- Polish(P8) → 원하는 스토리 완료 후.

### 스토리 내부 순서
- 테스트(있으면) → 모델/스키마 → 서비스 → 엔드포인트/핸들러 → 통합
- US1: T009 → T010 (RefreshTokenService 신설 후 AuthService 조립)
- US3: T027 → T028 (notifier 추가 후 handler 연결)

### Parallel Opportunities
- Setup: T001·T002·T003 병렬(T004는 T002 후)
- US1 구현: T008·T009·T011·T012·T013·T014·T015 병렬(T010은 T009 후, T016 독립)
- US2 구현: T022 병렬, T019/T020/T021/T023 파일 겹침 주의
- 스토리 단위: 팀 인원 있으면 US1~US5 동시 진행 가능(공유 파일 충돌만 조율)

### 공유 파일 조율 규칙 (병렬 시 필수)
- **마이그레이션 버전**: T023=`V2`, T033=`V3` 고정. 두 태스크를 독립 병렬 작성해도 번호가 겹치지 않도록 선점(누가 먼저 끝나든 파일명 고정).
- **`GlobalExceptionHandler.java`**: T020(US2, `DataAccessException`) → T041(US5, 400/409/catch-all 500) **순서로 수정**. 같은 파일이므로 순차 처리하며, catch-all은 구체 핸들러보다 특이도가 낮아 로직 충돌 없이 공존.
- **`application.yaml`**: T005·T036·T037·T038이 같은 파일을 편집 — 한 스토리(US5)가 T036~T038을 묶어 처리하고 T005(Foundational)와만 순서 조율.

---

## Parallel Example: User Story 1

```bash
# US1 구현 병렬 착수(서로 다른 파일):
Task: "UserService.findActiveByEmail + ACCOUNT_WITHDRAWN 제거 (T008)"
Task: "RefreshTokenService 신설 (T009)"
Task: "BCrypt 트랜잭션 분리 (T011)"
Task: "CurrentUserArgumentResolver 타입검증 (T012)"
Task: "비밀번호 @Size 상한 (T013)"
Task: "User @SQLRestriction (T015)"
```

---

## Implementation Strategy

### MVP First (US1)
1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → 4. 인증 회귀 스위트로 독립 검증 → 5. 배포/데모.

### Incremental Delivery
Setup+Foundational → US1(P1) → US2(P1) → US3(P2) → US4(P2) → US5(P3). 각 스토리는 이전을 깨지 않고 가치 추가.

### 주의(공유 파일 충돌)
- `common/exception/ErrorCode.java`·`GlobalExceptionHandler.java`, `resources/application.yaml`, `resources/db/migration/`은 여러 스토리가 건드리므로 동시 작업 시 머지 조율 필요.

## Notes
- **⚠️ 코드 우선 확인 원칙(필수)**: 이 태스크들은 원래 지라 스토리 설명 기준으로 작성돼, 이후 마이그레이션·구현으로 **이미 부분 구현되었거나(예: `@Size(min=8)`, GlobalExceptionHandler 일부 핸들러, CORS 차단 동작) 전제가 무효화된(예: `game_sessions`/`win_count` 삭제 → FR-012·015·017) 항목**이 있다. **각 태스크 착수 전 반드시 해당 파일을 먼저 열어 현재 상태를 확인**하고, "이미 되어 있는 부분"과 "실제로 남은 작업"을 구분해 진행한다. `[재확인 필요]` 표시 태스크(T019·T023·T033)는 특히 현행 `game_results`/실행계획을 보고 범위를 확정한 뒤 착수.
- 대응 지라: 각 태스크 끝의 `USER-*/GAME-*/TEST-*/LEARN-*/RANK-*/STABLE-*` 코드 참조.
- [P] = 다른 파일·의존 없음. 테스트는 구현 전 실패 확인(회귀 방지망).
- 커밋은 태스크 또는 논리 그룹 단위.
