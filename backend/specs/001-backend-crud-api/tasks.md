---

description: "Task list for 백엔드 CRUD API 1차 구축"
---

# Tasks: 백엔드 CRUD API 1차 구축

**Input**: Design documents from `backend/specs/001-backend-crud-api/`

**Prerequisites**: [plan.md](./plan.md) (required), [spec.md](./spec.md) (required for user stories), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: 포함됨 — plan.md Summary에서 사용자가 명시적으로 "구현 후 테스트로 문제 없음을 검증"을 요청했다. **단, 이 프로젝트는 TDD(테스트 선작성)가 아니라 "구현 → 검증" 순서를 따른다.** 그래서 각 스토리 단계 내에서 Implementation을 먼저, Tests(검증)를 그 다음에 배치했다 — 표준 스펙 템플릿의 "테스트 먼저 작성 후 실패 확인" 순서와 의도적으로 다르다. 모든 테스트가 통과(`./gradlew test`)해야 해당 스토리가 완료된 것으로 간주한다(plan.md).

**Organization**: User Story(P1~P5, spec.md 기준)별로 그룹화. `growth`(펫/출석) 도메인은 어떤 User Story에도 속하지 않는(엔티티만 준비, FR-034/FR-035) 별도 단계로 분리했다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 실행 가능(다른 파일, 선행 작업 완료에 의존하지 않음)
- **[Story]**: 이 작업이 속한 User Story(US1~US5). Setup/Foundational/Polish 단계에는 라벨 없음
- 모든 작업에 정확한 파일 경로 포함 (기준 패키지: `backend/suhwa/src/main/java/backend/ssafy/suhwa/`, 테스트는 `backend/suhwa/src/test/java/backend/ssafy/suhwa/`)

## Path Conventions

plan.md Project Structure를 따름 — 프론트엔드 없는 단일 Spring Boot 프로젝트, 도메인별 패키지(package-by-feature): `common/`, `user/`, `auth/`, `learning/`, `game/`, `ranking/`, `growth/`. 각 도메인은 `domain/ dto/ repository/ service/ controller/` 하위 패키지를 가지며, `controller/`는 `{Domain}Api` 인터페이스(Swagger 어노테이션) + `{Domain}Controller` 구현체로 분리(plan.md, research.md #1).

---

## Phase 1: Setup

**Purpose**: 프로젝트 기본 구조 및 DB 스키마 준비

- [ ] T001 [P] `backend/suhwa/src/main/java/backend/ssafy/suhwa/` 아래 도메인 패키지 스켈레톤 생성: `common/{config,security,exception,dto}`, `user/{domain,dto,repository,service,controller}`, `auth/{domain,dto,repository,service,controller}`, `learning/{domain,dto,repository,service,controller}`, `game/{domain,dto,repository,service,controller,scheduler}`, `ranking/{dto,repository,service,controller}`, `growth/{domain,repository}` — 그리고 동일 구조를 `backend/suhwa/src/test/java/backend/ssafy/suhwa/`에 미러링
- [ ] T002 [P] `data-model.md` 기준으로 로컬/개발 MySQL 스키마 적용 — `backend/jira-crud-backlog.md`의 기존 DDL에 `game_rooms.guest_user_id`, `game_rooms.host_ready`, `game_rooms.guest_ready`, `game_rooms.updated_at` 컬럼을 추가해 반영

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 모든 User Story가 공통으로 의존하는 핵심 인프라. 이 단계가 끝나야 이후 스토리 작업을 시작할 수 있다.

**⚠️ CRITICAL**: 이 단계 완료 전에는 어떤 User Story 작업도 시작하지 않는다.

- [ ] T003 [P] `BaseTimeEntity`(`@MappedSuperclass`, `@EntityListeners(AuditingEntityListener.class)`, `createdAt`/`updatedAt`) 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/common/domain/BaseTimeEntity.java`, `SuhwaApplication.java`에 `@EnableJpaAuditing` 추가
- [ ] T004 [P] 공통 `ErrorResponse` DTO + `GlobalExceptionHandler`(`@RestControllerAdvice`) 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/common/exception/`
- [ ] T005 [P] `User` 엔티티(email/passwordHash/nickname/profileImageUrl/winCount/lossCount/deletedAt, `BaseTimeEntity` 상속) + `UserRepository` 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/user/domain/User.java`, `backend/suhwa/src/main/java/backend/ssafy/suhwa/user/repository/UserRepository.java` — 거의 모든 도메인이 FK로 참조하므로 Foundational에 배치
- [ ] T006 [P] `JwtTokenProvider`(access token 발급/파싱) 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/common/security/JwtTokenProvider.java`
- [ ] T007 `JwtAuthenticationFilter`(`Authorization: Bearer` 파싱 후 `SecurityContext` 설정) 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/common/security/JwtAuthenticationFilter.java` (T006 의존)
- [ ] T008 `SecurityConfig`(`SecurityFilterChain`: `/auth/signup`,`/auth/login`,`/auth/refresh`,`/swagger-ui/**`,`/v3/api-docs/**` permitAll, 그 외 인증 필요, JWT 필터 등록) 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/common/config/SecurityConfig.java` (T007 의존)
- [ ] T009 [P] `@LoginUser` 커스텀 어노테이션 + `CurrentUserArgumentResolver`(`SecurityContext`에서 인증된 `userId` 추출) 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/common/security/CurrentUserArgumentResolver.java` — 인증이 필요한 모든 컨트롤러가 사용

**Checkpoint**: Foundation ready — 이제 User Story 구현을 시작할 수 있다.

---

## Phase 3: User Story 1 - API 명세 문서를 가장 먼저 제공 (Priority: P1) 🎯 MVP

**Goal**: 다른 도메인 API가 구현되기 전에 API 문서화 체계(Swagger)를 먼저 갖춘다 — 인증 시험 호출, 도메인별 그룹핑 포함.

**Independent Test**: 실제 도메인 API가 하나도 없는 상태에서 문서화 체계·Authorize 기능·Tag 그룹핑만으로 독립 검증 가능(spec.md).

### Implementation for User Story 1

- [ ] T010 [US1] `OpenApiConfig`(`OpenAPI` Bean: title/description, `SecurityScheme "bearerAuth"`(HTTP bearer/JWT), 도메인별 Tag 목록 `Auth/Users/Learning/GameRooms/Ranking` 사전 선언) 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/common/config/OpenApiConfig.java`

### Tests for User Story 1 (구현 검증)

- [ ] T011 [P] [US1] `/v3/api-docs` 응답에 `bearerAuth` 시큐리티 스킴과 5개 도메인 Tag가 포함되는지 검증하는 통합 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/common/config/OpenApiConfigTest.java`

**Checkpoint**: API 문서화 인프라 완료 — Swagger UI(`/swagger-ui/index.html`)에서 Authorize 가능. 이후 스토리에서 엔드포인트가 추가될 때마다 자동 반영되는지는 각 스토리 완료 시 재확인(quickstart.md §1).

---

## Phase 4: User Story 2 - 회원가입, 로그인, 계정 관리 (Priority: P2)

**Goal**: 이메일 회원가입, 로그인/로그아웃/토큰 재발급, 프로필 조회/수정, 회원 탈퇴(Soft Delete).

**Independent Test**: 가입 → 로그인 → 프로필 조회/수정 → 로그아웃 → 재로그인 차단 확인 → 탈퇴 → 탈퇴 계정 로그인 차단 확인(spec.md).

### Implementation for User Story 2

- [ ] T012 [P] [US2] `RefreshToken` 엔티티(userId/token/expiresAt/revokedAt) + `RefreshTokenRepository` 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/auth/domain/RefreshToken.java`, `backend/suhwa/src/main/java/backend/ssafy/suhwa/auth/repository/RefreshTokenRepository.java`
- [ ] T013 [P] [US2] DTO 생성(`SignupRequest`/`LoginRequest`/`RefreshRequest`/`TokenResponse`, `UserProfileResponse`/`UpdateProfileRequest`) — `contracts/auth-api.yaml`, `contracts/users-api.yaml` 기준 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/auth/dto/`, `backend/suhwa/src/main/java/backend/ssafy/suhwa/user/dto/`
- [ ] T014 [US2] `UserService` 구현(가입 시 이메일 중복 검증+BCrypt 해싱 FR-005/006, 프로필 조회/수정 FR-011/012, 탈퇴 시 Soft Delete+이메일 변형+보유 refresh 토큰 일괄 무효화 FR-013/014) in `backend/suhwa/src/main/java/backend/ssafy/suhwa/user/service/UserService.java` (T005, T012 의존)
- [ ] T015 [US2] `AuthService` 구현(로그인 시 탈퇴 계정 차단 FR-010, 토큰 발급+저장 FR-007, 재발급 시 `revoked_at IS NULL AND expires_at > now()` 검증 FR-008, 로그아웃 시 토큰 무효화 FR-009) in `backend/suhwa/src/main/java/backend/ssafy/suhwa/auth/service/AuthService.java` (T006, T012, T005 의존)
- [ ] T016 [P] [US2] `UserApi` 인터페이스 + `UserController` 구현(`GET/PATCH/DELETE /users/me`) — `contracts/users-api.yaml` 기준 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/user/controller/` (T014, T009 의존)
- [ ] T017 [P] [US2] `AuthApi` 인터페이스 + `AuthController` 구현(`POST /auth/signup|login|refresh|logout` — `logout`은 `bearerAuth`이며 요청 본문 없이 인증된 사용자 식별이 필요하므로 `@LoginUser` 사용) — `contracts/auth-api.yaml` 기준 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/auth/controller/` (T015, T009 의존)

### Tests for User Story 2 (구현 검증)

- [ ] T018 [P] [US2] `RefreshTokenRepository` 유효성 조회 쿼리 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/auth/repository/RefreshTokenRepositoryTest.java`
- [ ] T019 [P] [US2] `AuthController`(signup/login/refresh/logout) MockMvc 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/auth/controller/AuthControllerTest.java`
- [ ] T020 [P] [US2] `UserController`(get/patch/delete profile) MockMvc 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/user/controller/UserControllerTest.java`
- [ ] T021 [US2] 가입→로그인→갱신→로그아웃→로그인차단, 탈퇴→재가입 전체 흐름 통합 테스트(quickstart.md §2) in `backend/suhwa/src/test/java/backend/ssafy/suhwa/user/UserLifecycleIntegrationTest.java`

**Checkpoint**: User Story 1+2 독립적으로 완전히 동작·검증 가능.

---

## Phase 5: User Story 3 - 학습 콘텐츠 열람과 오답 관리 (Priority: P3)

**Goal**: 카테고리별 학습 콘텐츠 조회, 오답 신고/조회, 테스트 결과 보고.

**Independent Test**: 콘텐츠 목록 조회 → 오답 신고 → 오답노트에서 확인(spec.md).

### Implementation for User Story 3

- [ ] T022 [P] [US3] `Sign` 엔티티(category/label/referenceMediaUrl/tip/isActive) + `SignRepository`(category+is_active 조회) 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/learning/domain/Sign.java`, `backend/suhwa/src/main/java/backend/ssafy/suhwa/learning/repository/SignRepository.java`
- [ ] T023 [P] [US3] `WrongAnswerLog` 엔티티(userId/signId/wrongAt) + `WrongAnswerLogRepository`(user+category 최근 5개, Sign 조인 `ORDER BY wrong_at DESC LIMIT 5`) 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/learning/domain/WrongAnswerLog.java`, `backend/suhwa/src/main/java/backend/ssafy/suhwa/learning/repository/WrongAnswerLogRepository.java`
- [ ] T024 [P] [US3] DTO 생성(`SignResponse`/`WrongAnswerRequest`/`WrongAnswerResponse`/`TestResultRequest`) — `contracts/learning-api.yaml` 기준 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/learning/dto/`
- [ ] T025 [US3] `SignService` 구현(카테고리별 활성 콘텐츠 조회 FR-015) in `backend/suhwa/src/main/java/backend/ssafy/suhwa/learning/service/SignService.java` (T022 의존)
- [ ] T026 [US3] `WrongAnswerService` 구현(오답 신고 시 존재하지 않는 sign_id 거부 Edge Case, 신고 FR-016, 카테고리별 최근 5개 조회 FR-017) in `backend/suhwa/src/main/java/backend/ssafy/suhwa/learning/service/WrongAnswerService.java` (T022, T023 의존)
- [ ] T027 [US3] `TestResultService` 구현(총 문제 수/정답 수 기록 FR-018 — 펫 경험치 반영 로직 없음, Out of Scope) in `backend/suhwa/src/main/java/backend/ssafy/suhwa/learning/service/TestResultService.java`
- [ ] T028 [US3] `LearningApi` 인터페이스 + `LearningController` 구현(`GET /signs`, `POST/GET /wrong-answers`, `POST /test-results`) — `contracts/learning-api.yaml` 기준 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/learning/controller/` (T025, T026, T027, T009 의존)

### Tests for User Story 3 (구현 검증)

- [ ] T029 [P] [US3] `WrongAnswerLogRepository` 카테고리별 최근 5개 조회 쿼리 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/learning/repository/WrongAnswerLogRepositoryTest.java`
- [ ] T030 [P] [US3] `LearningController`(콘텐츠 조회, 오답 신고/조회, 테스트 결과 보고) MockMvc 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/learning/controller/LearningControllerTest.java`
- [ ] T031 [US3] 오답 신고 → 오답노트 조회 반영 확인 통합 테스트(quickstart.md §3) in `backend/suhwa/src/test/java/backend/ssafy/suhwa/learning/LearningIntegrationTest.java`

**Checkpoint**: User Story 1~3 독립적으로 완전히 동작·검증 가능.

---

## Phase 6: User Story 4 - 게임방 생성·참가·진행 관리 (Priority: P4)

**Goal**: 1:1 게임방 생성/입장/나가기/준비/시작/결과 저장(REST, CRUD 범위 — WebSocket/SSE 제외).

**Independent Test**: A가 방 생성 → B가 코드로 입장 → 둘 다 준비 완료 → 시작 → 결과 보고 후 승/패 반영 확인(spec.md).

### Implementation for User Story 4

- [ ] T032 [P] [US4] `GameRoom` 엔티티(roomCode/hostUserId/guestUserId/hostReady/guestReady/status, `BaseTimeEntity` 상속으로 `updated_at` 확보) + `GameRoomRepository`(room_code 조회, CLOSED+5분 경과 방 조회) 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/domain/GameRoom.java`, `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/repository/GameRoomRepository.java`
- [ ] T033 [P] [US4] `GameSession` 엔티티(player1Id/player2Id/player1Score/player2Score/winnerId nullable/startedAt/endedAt) + `GameSessionRepository` 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/domain/GameSession.java`, `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/repository/GameSessionRepository.java`
- [ ] T034 [P] [US4] DTO 생성(`GameRoomResponse`/`JoinRoomRequest`/`ReadyRequest`/`GameResultRequest`/`GameResultResponse`) — `contracts/game-rooms-api.yaml` 기준(결과 요청은 `hostScore`/`guestScore` 역할 기반, `winnerUserId` 없음) in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/dto/`
- [ ] T035 [US4] `GameRoomService.create`/`join` 구현(room_code 생성+UNIQUE 충돌 시 재시도 research.md#5, 정원 초과·IN_PROGRESS 방 입장 거부 FR-020) in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/service/GameRoomService.java` (T032, T005 의존)
- [ ] T036 [US4] `GameRoomService.leave` 구현(WAITING: 명시적 퇴장 즉시 처리 FR-021, 방장이면 위임 FR-022, 마지막 인원이면 CLOSED FR-023; IN_PROGRESS: 위임 없이 즉시 CLOSED+결과 미저장 FR-021/023) — HTTP 타입 없이 `roomId`/`userId` 순수 파라미터만 사용(research.md#9) in 같은 파일 (T035 의존)
- [ ] T037 [US4] `GameRoomService.setReady`/`start` 구현(준비 상태 갱신 FR-025, `hostReady && guestReady`일 때만 시작 허용 후 IN_PROGRESS 전환 FR-026) in 같은 파일 (T036 의존)
- [ ] T038 [US4] `GameRoomService.reportResult` 구현 — **`room.status == IN_PROGRESS`일 때만 처리 허용, 그 외(중복 보고로 이미 CLOSED / FR-023 나가기로 무효화되어 CLOSED 모두 포함)는 사유 구분 없이 예외로 거부(409, FR-028)**(data-model.md GameSession 검증 규칙 참고). 통과 시 host_user_id→player1_id, guest_user_id→player2_id 고정 매핑, 두 점수 비교로 서버가 winner 계산·동점 시 null, `game_sessions` 저장+`users.win_count`/`loss_count` 갱신을 트랜잭션으로 처리, 방 CLOSED 전환(FR-027/029) in 같은 파일 (T033, T037, T005 의존)
- [ ] T039 [US4] `GameRoomApi` 인터페이스 + `GameRoomController` 구현(생성/입장/나가기/준비/시작/결과 6개 엔드포인트, 요청자가 방 참가자인지 검증 후 서비스에 `userId` 전달) — `contracts/game-rooms-api.yaml` 기준 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/controller/` (T038, T009 의존)
- [ ] T040 [US4] `GameRoomCleanupScheduler`(`@Scheduled` + `@EnableScheduling`, `status = CLOSED AND updated_at < now() - 5분` 방 삭제, research.md#3) 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/scheduler/GameRoomCleanupScheduler.java` (T032 의존)

### Tests for User Story 4 (구현 검증)

- [ ] T041 [P] [US4] `GameRoomRepository` room_code 조회/정원·상태 필터 쿼리 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/game/repository/GameRoomRepositoryTest.java`
- [ ] T042 [P] [US4] `GameRoomService` 상태 전이 규칙 테스트(WAITING 나가기=위임, IN_PROGRESS 나가기=즉시 CLOSED+무효화, ready 게이트, 승자 계산/동점 처리, `status != IN_PROGRESS`인 방에 대한 결과 보고 거부 — 중복 보고 케이스와 무효화된 방 케이스 둘 다 검증 FR-028) in `backend/suhwa/src/test/java/backend/ssafy/suhwa/game/service/GameRoomServiceTest.java`
- [ ] T043 [P] [US4] `GameRoomController` 6개 엔드포인트 및 403/404/409 응답 MockMvc 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/game/controller/GameRoomControllerTest.java`
- [ ] T044 [US4] 생성→입장→준비→시작→결과보고(중복 포함) 전체 흐름 통합 테스트(quickstart.md §4) in `backend/suhwa/src/test/java/backend/ssafy/suhwa/game/GameRoomLifecycleIntegrationTest.java`
- [ ] T045 [P] [US4] `GameRoomCleanupScheduler`가 CLOSED+5분 경과 방만 삭제하고 나머지는 건드리지 않는지 검증하는 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/game/scheduler/GameRoomCleanupSchedulerTest.java`

**Checkpoint**: User Story 1~4 독립적으로 완전히 동작·검증 가능.

---

## Phase 7: User Story 5 - 랭킹 조회 (Priority: P5)

**Goal**: 승수 기준 Top 5 랭킹과 본인 순위 조회.

**Independent Test**: 승/패 기록이 있는 여러 계정으로 조회했을 때 Top5 및 본인 순위가 정확히 반환되는지 확인(spec.md).

### Implementation for User Story 5

- [ ] T046 [US5] `UserRepository`에 랭킹 쿼리 메서드 추가(`deleted_at IS NULL`, `win_count DESC, loss_count ASC` Top5, 본인 순위 계산 — research.md#6) in `backend/suhwa/src/main/java/backend/ssafy/suhwa/user/repository/UserRepository.java` (T005 의존)
- [ ] T047 [P] [US5] DTO 생성(`RankingEntry`/`RankingResponse`) — `contracts/ranking-api.yaml` 기준 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/ranking/dto/`
- [ ] T048 [US5] `RankingService` 구현(Top5 + 요청자 본인 순위 조합, 동점자는 패 수 적은 순 FR-032) in `backend/suhwa/src/main/java/backend/ssafy/suhwa/ranking/service/RankingService.java` (T046 의존)
- [ ] T049 [US5] `RankingApi` 인터페이스 + `RankingController` 구현(`GET /rankings`) — `contracts/ranking-api.yaml` 기준 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/ranking/controller/` (T048, T009 의존)

### Tests for User Story 5 (구현 검증)

- [ ] T050 [P] [US5] 랭킹 쿼리 테스트(Top5 정렬, 동점자 패수 적은 순, 탈퇴 유저 제외) in `backend/suhwa/src/test/java/backend/ssafy/suhwa/ranking/repository/RankingQueryTest.java`
- [ ] T051 [P] [US5] `RankingController` MockMvc 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/ranking/controller/RankingControllerTest.java`
- [ ] T052 [US5] 여러 계정 승/패 데이터 기반 Top5+본인순위+탈퇴제외 통합 테스트(quickstart.md §5) in `backend/suhwa/src/test/java/backend/ssafy/suhwa/ranking/RankingIntegrationTest.java`

**Checkpoint**: User Story 1~5 전부 독립적으로 완전히 동작·검증 가능.

---

## Phase 8: 펫/출석 엔티티 준비 (User Story 없음 — FR-034/FR-035)

**Purpose**: 어떤 User Story에도 속하지 않는 항목. 성장 요소(펫)·출석체크는 이번 1차 범위에서 **데이터 구조(엔티티)만** 준비하고 API/서비스/컨트롤러는 만들지 않는다(spec.md Out of Scope). 다른 어떤 단계와도 의존 관계가 없어 언제 수행해도 무방하다.

- [ ] T053 [P] `UserPet` 엔티티(userId UNIQUE, name/level/exp, `BaseTimeEntity` 상속) + `UserPetRepository` 생성(서비스·컨트롤러 없음) in `backend/suhwa/src/main/java/backend/ssafy/suhwa/growth/domain/UserPet.java`, `backend/suhwa/src/main/java/backend/ssafy/suhwa/growth/repository/UserPetRepository.java`
- [ ] T054 [P] `Attendance` 엔티티(userId+attendanceDate UNIQUE, streakCount) + `AttendanceRepository` 생성(서비스·컨트롤러 없음) in `backend/suhwa/src/main/java/backend/ssafy/suhwa/growth/domain/Attendance.java`, `backend/suhwa/src/main/java/backend/ssafy/suhwa/growth/repository/AttendanceRepository.java`
- [ ] T055 [P] `UserPet`/`Attendance` 매핑 오류 없이 JPA 컨텍스트가 로드되는지 확인하는 테스트(quickstart.md §6) in `backend/suhwa/src/test/java/backend/ssafy/suhwa/growth/GrowthEntityMappingTest.java`

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: 전체 스토리에 걸친 마무리 점검

- [ ] T056 `./gradlew test` 전체 통과 확인(plan.md Summary의 기능 완료 기준)
- [ ] T057 `quickstart.md` §1~§6 전체 시나리오 수동/curl 검증
- [ ] T058 [P] Swagger UI에서 구현된 18개 REST 엔드포인트가 모두 올바른 도메인 Tag로 노출되는지 최종 확인(SC-001)
- [ ] T059 각 서비스가 던지는 예외를 `GlobalExceptionHandler`가 빠짐없이 처리하는지 점검(404/403/409 등 계약된 응답 코드와 일치하는지 `contracts/*.yaml` 대조)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 의존성 없음 — 즉시 시작 가능
- **Foundational (Phase 2)**: Setup 완료 후 — 모든 User Story를 블로킹
- **User Stories (Phase 3~7)**: 전부 Foundational 완료에만 의존. 서로 다른 스토리끼리는 의존하지 않으므로 우선순위 순서(P1→P2→P3→P4→P5)대로 진행하거나 병렬 진행 가능
- **펫/출석 (Phase 8)**: 어떤 단계와도 의존 관계 없음 — 아무 때나 수행 가능
- **Polish (Phase 9)**: 완료하고자 하는 모든 User Story 이후

### User Story Dependencies

- **User Story 1 (P1)**: Foundational 이후 시작 가능, 다른 스토리에 의존하지 않음
- **User Story 2 (P2)**: Foundational 이후 시작 가능, 다른 스토리에 의존하지 않음(단, `User` 엔티티는 Foundational에서 이미 준비됨)
- **User Story 3 (P3)**: Foundational 이후 시작 가능, 다른 스토리에 의존하지 않음
- **User Story 4 (P4)**: Foundational 이후 시작 가능. `User` 엔티티(Foundational)만 참조하고 US2/US3와는 독립적으로 테스트 가능(단, 실제 데모 시나리오상 로그인된 사용자가 필요하므로 US2가 먼저 동작하는 편이 자연스러움)
- **User Story 5 (P5)**: Foundational 이후 시작 가능. `users.win_count`/`loss_count`만 있으면 되므로 US4 없이도(테스트 데이터로 직접 시드) 독립 검증 가능

### Within Each User Story

- Implementation 작업을 먼저 완료(엔티티 → 서비스 → 컨트롤러 순)
- 그 다음 Tests(구현 검증) 작업으로 `./gradlew test` 통과 확인
- 각 스토리 완료 후 다음 우선순위 스토리로 이동

### Parallel Opportunities

- Setup의 T001, T002는 병렬 가능
- Foundational의 T003, T004, T005, T006, T009는 서로 다른 파일이라 병렬 가능(T007은 T006 이후, T008은 T007 이후)
- Foundational 완료 후에는 User Story 1~5를 인력이 허용하는 한 병렬로 진행 가능
- 각 스토리 내 엔티티/DTO 생성 작업([P] 표시)은 서로 병렬 가능
- 각 스토리 내 Tests 작업 대부분([P] 표시)은 서로 병렬 가능(통합 테스트 1개만 순서상 마지막)
- Phase 8(펫/출석)은 다른 모든 작업과 병렬 가능

---

## Parallel Example: User Story 4

```bash
# 엔티티/DTO를 함께 생성 (서로 다른 파일):
Task: "Create GameRoom entity + GameRoomRepository in game/domain/GameRoom.java, game/repository/GameRoomRepository.java"
Task: "Create GameSession entity + GameSessionRepository in game/domain/GameSession.java, game/repository/GameSessionRepository.java"
Task: "Create DTOs per contracts/game-rooms-api.yaml in game/dto/"

# 구현 완료 후 테스트를 함께 작성 (통합 테스트 제외):
Task: "GameRoomRepository query test in game/repository/GameRoomRepositoryTest.java"
Task: "GameRoomService state-transition test in game/service/GameRoomServiceTest.java"
Task: "GameRoomController MockMvc test in game/controller/GameRoomControllerTest.java"
Task: "GameRoomCleanupScheduler test in game/scheduler/GameRoomCleanupSchedulerTest.java"
```

---

## Implementation Strategy

### MVP First (User Story 1만)

1. Phase 1: Setup 완료
2. Phase 2: Foundational 완료(필수 — 모든 스토리를 블로킹)
3. Phase 3: User Story 1 완료
4. **멈추고 검증**: quickstart.md §1로 Swagger UI/Authorize 독립 확인
5. 필요 시 이 상태로 데모

### Incremental Delivery

1. Setup + Foundational 완료 → 기반 준비
2. User Story 1 추가 → 독립 검증(MVP) → 이후 모든 스토리의 API가 자동 문서화됨
3. User Story 2 추가(회원/인증) → 독립 검증 → 이후 스토리들이 인증을 사용할 수 있게 됨
4. User Story 3 추가(학습/오답노트) → 독립 검증
5. User Story 4 추가(게임방 매칭) → 독립 검증
6. User Story 5 추가(랭킹) → 독립 검증
7. Phase 8(펫/출석 엔티티)은 아무 시점에나 끼워 넣어도 무방
8. Phase 9(Polish)로 마무리

### Parallel Team Strategy

여러 인원이 작업할 경우:

1. Setup + Foundational은 함께 완료(공유 인프라이므로 충돌 방지를 위해 우선 완료)
2. Foundational 완료 후:
   - 개발자 A: User Story 2(회원/인증) — 다른 스토리들이 인증에 의존하므로 우선 배정 권장
   - 개발자 B: User Story 1(API 문서화) 또는 User Story 3(학습/오답노트)
   - 개발자 C: User Story 4(게임방 매칭)
   - 개발자 D: User Story 5(랭킹) 또는 Phase 8(펫/출석 엔티티)
3. 각 스토리는 독립적으로 완료·통합 가능

---

## Notes

- `[P]` 작업 = 서로 다른 파일, 선행 의존성 없음
- `[Story]` 라벨은 작업을 특정 User Story에 추적 가능하게 연결(Setup/Foundational/Phase 8/Polish는 라벨 없음)
- 이 프로젝트는 TDD가 아니라 "구현 → 검증" 순서를 따른다(plan.md Summary) — 각 스토리 안에서 Implementation을 먼저 완료하고, 그 다음 Tests(구현 검증) 작업으로 `./gradlew test`를 통과시킨다
- `game/service/GameRoomService.java`처럼 여러 작업이 같은 파일을 순차적으로 채워나가는 경우(T035~T038) `[P]` 표시를 붙이지 않았다 — 동시 편집 충돌을 피하기 위함
- 커밋은 각 작업 또는 논리적 묶음 단위로 수행
- 각 체크포인트에서 멈춰 해당 스토리가 독립적으로 동작하는지 검증
- 지양할 것: 모호한 작업 설명, 같은 파일에 대한 병렬 작업 충돌, 스토리 간 독립성을 깨는 교차 의존
