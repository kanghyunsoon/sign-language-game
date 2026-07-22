---

description: "Task list for 실시간 로비/게임방 알림(SSE)과 WebRTC 시그널링 도입 (선행 안정화 포함)"
---

# Tasks: 실시간 로비/게임방 알림(SSE)과 WebRTC 시그널링 도입

**Input**: Design documents from `backend/specs/002-realtime-sse-websocket/`

**Prerequisites**: [plan.md](./plan.md) (required), [spec.md](./spec.md) (required for user stories), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: 001-backend-crud-api와 동일한 프로젝트 관례를 따른다 — TDD(테스트 선작성)가 아니라 **"구현 → 테스트로 검증"** 순서. 각 스토리 안에서 Implementation을 먼저, 그 다음 Tests(구현 검증)를 배치한다. 모든 테스트가 통과(`./gradlew test`)해야 해당 스토리가 완료된 것으로 간주한다.

**Organization**: spec.md의 User Story(P1~P14, 15개)별로 그룹화. spec.md가 명시한 하드 제약 — **Part A(US1~US8) 전체가 완료·검증되기 전에는 Part B(US9~US15)의 어떤 작업도 시작하지 않는다(SC-001)** — 를 Phase 순서 자체로 강제한다(User Story 8 완료 = Part A 체크포인트).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 실행 가능(다른 파일, 선행 작업 완료에 의존하지 않음)
- **[Story]**: 이 작업이 속한 User Story(US1~US15). Setup/Foundational/Polish 단계에는 라벨 없음
- 모든 작업에 정확한 파일 경로 포함 (기준 패키지: `backend/suhwa/src/main/java/backend/ssafy/suhwa/`, 테스트는 `backend/suhwa/src/test/java/backend/ssafy/suhwa/`)

## Path Conventions

001과 동일한 단일 Spring Boot 프로젝트(`backend/suhwa`), 패키지-바이-피처 구조를 그대로 확장한다. 신규 하위 패키지: `game/realtime/`(SSE 레지스트리·WebSocket 핸들러·방 라이브 상태), `webrtc/`(STUN/TURN 설정 노출). plan.md Project Structure 참고.

---

## Phase 1: Setup

**Purpose**: 신규 패키지 스켈레톤 준비. 001에서 이미 갖춰진 인프라(JWT, Security, Scheduling, Swagger)는 재사용하므로 별도 Setup 작업이 거의 없다.

- [ ] T001 [P] 신규 패키지 스켈레톤 생성: `game/realtime/{controller}`, `webrtc/{config,controller}` — 그리고 동일 구조를 `backend/suhwa/src/test/java/backend/ssafy/suhwa/`에 미러링(`game/realtime/`, `webrtc/controller/`)
- [ ] T002 [P] `env.sample`에 이번 스펙에서 추가되는 환경변수 자리만 미리 마련(값은 각 스토리에서 채움): `CORS_ALLOWED_ORIGINS`, `GAME_ROOM_WAITING_RETENTION_MINUTES`, `REALTIME_TICKET_TTL_SECONDS`, `GAME_ROOM_LEAVE_GRACE_SECONDS`, `GAME_ROOM_JOIN_CONFIRMATION_SECONDS`, `WEBRTC_STUN_URLS`, `WEBRTC_TURN_URL`, `WEBRTC_TURN_USERNAME`, `WEBRTC_TURN_CREDENTIAL`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 모든 User Story가 공통으로 의존하는 핵심 인프라.

**해당 없음** — 001에서 JWT/Security/Scheduling/GlobalExceptionHandler 등 공통 인프라가 이미 구축되어 있고, 이번 스펙은 그 위에 각 User Story별로 독립적인 결함 수정/신규 기능을 얹는 구조라 별도의 공유 Foundational 작업이 없다. **Part A(US1~US8) 전체가 사실상 Part B의 Foundational 역할을 한다** — 이는 Phase 자체의 순서(Part A 전부 완료 후 US9 착수)로 강제한다(SC-001, 아래 Dependencies 참고).

**Checkpoint**: Setup 완료 — Part A(US1) 착수 가능.

---

## Phase 3: User Story 1 - 인증/인가 실패 응답 형식 통일 (Priority: P1) [Part A]

**Goal**: Spring Security 필터 체인에서 발생하는 401/403이 `GlobalExceptionHandler`와 동일한 `ErrorResponse` 형식으로 나가도록 통일한다.

**Independent Test**: 인증 토큰 없이 보호된 API 호출(401), 다른 사용자 리소스 접근 시도(403) 시 응답 바디가 다른 오류(404 등)와 동일한 스키마인지 확인.

### Implementation for User Story 1

- [X] T003 [P] [US1] `ErrorCode`에 `ACCESS_DENIED(403)` 추가 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/common/exception/ErrorCode.java`
- [X] T004 [US1] `SecurityConfig`의 `authenticationEntryPoint`가 하드코딩 JSON을 직접 쓰지 않고 `BusinessException(ErrorCode.UNAUTHENTICATED)`을 `HandlerExceptionResolver`(`@Qualifier("handlerExceptionResolver")`)에 위임하도록 변경, `accessDeniedHandler`도 동일하게 `BusinessException(ErrorCode.ACCESS_DENIED)`로 위임하도록 신규 추가 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/common/config/SecurityConfig.java` (T003 의존, research.md #1)

### Tests for User Story 1 (구현 검증)

- [X] T005 [US1] 토큰 없는 요청(401)과 타인 리소스 접근(403)이 `GlobalExceptionHandler`가 만드는 다른 오류와 동일한 `{"code","message"}` 스키마로 응답하는지 검증하는 MockMvc 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/common/config/SecurityConfigTest.java`

**Checkpoint**: US1 독립적으로 완전히 동작·검증 가능.

---

## Phase 4: User Story 2 - 동시 요청에 따른 게임방 데이터 정합성 보장 (Priority: P2) [Part A]

**Goal**: `GameRoom`에 낙관적 락을 도입해 동시 변경 요청 중 하나만 반영되도록 한다.

**Independent Test**: 같은 방에 대한 두 변경 요청을 동시에 보내 하나만 성공, 다른 하나는 409로 거부되는지 확인.

### Implementation for User Story 2

- [X] T006 `data-model.md`의 DDL(`ALTER TABLE game_rooms ADD COLUMN version BIGINT NOT NULL DEFAULT 0;`)을 로컬/개발 DB에 적용
- [X] T007 [P] [US2] `GameRoom`에 `@Version private Long version` 필드 추가 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/domain/GameRoom.java` (T006 의존)
- [X] T008 [P] [US2] `ErrorCode`에 `CONCURRENT_UPDATE_CONFLICT(409)` 추가 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/common/exception/ErrorCode.java`
- [X] T009 [US2] `GlobalExceptionHandler`에 `ObjectOptimisticLockingFailureException` → `CONCURRENT_UPDATE_CONFLICT` 매핑 핸들러 추가 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/common/exception/GlobalExceptionHandler.java` (T008 의존, research.md #2)

### Tests for User Story 2 (구현 검증)

- [X] T010 [US2] 동일 `roomId`에 대한 동시 변경 요청 중 하나만 성공하고 나머지는 409(`CONCURRENT_UPDATE_CONFLICT`)로 거부되는지 검증하는 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/game/domain/GameRoomOptimisticLockTest.java` (T007, T009 의존)

**Checkpoint**: US1~US2 독립적으로 완전히 동작·검증 가능.

---

## Phase 5: User Story 3 - 준비 상태 변경은 대기 중인 방에서만 허용 (Priority: P3) [Part A]

**Goal**: `setReady()`가 `WAITING`이 아닌 방에서는 거부하도록 가드를 추가한다.

**Independent Test**: 대기 중 방에서는 준비 상태 변경 성공, 진행 중/종료 방에서는 거부되는지 확인.

### Implementation for User Story 3

- [X] T011 [US3] `GameRoomService.setReady()` 진입부에 `room.getStatus() != WAITING`이면 `ErrorCode.ROOM_NOT_WAITING`을 던지는 가드 추가 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/service/GameRoomService.java` (research.md #3)

### Tests for User Story 3 (구현 검증)

- [X] T012 [US3] `IN_PROGRESS`/`CLOSED` 방에서 `setReady()` 호출 시 409(`ROOM_NOT_WAITING`) 거부, `WAITING` 방에서는 정상 반영되는지 검증하는 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/game/service/GameRoomServiceTest.java`(기존 파일에 케이스 추가) (T011 의존)

**Checkpoint**: US1~US3 독립적으로 완전히 동작·검증 가능.

---

## Phase 6: User Story 4 - 방치된 대기방 자동 정리 (Priority: P4) [Part A]

**Goal**: CLOSED 방뿐 아니라 보관 기간을 초과한 WAITING 방도 정리 대상에 포함한다(단, 이 단계에서는 DB 타임스탬프 기준만 — 실시간 연결 인지는 US15/FR-030에서 추가).

**Independent Test**: 보관 기간을 초과한 WAITING 방은 삭제, 그 외(정상 대기 중/진행 중/최근 CLOSED)는 삭제되지 않는지 확인.

### Implementation for User Story 4

- [ ] T013 [P] [US4] `GameRoomRepository`에 `findByStatusAndUpdatedAtBefore(WAITING, threshold)` 조회 메서드 추가(기존 CLOSED용과 대칭) in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/repository/GameRoomRepository.java`
- [ ] T014 [US4] `GameRoomCleanupScheduler`가 CLOSED 삭제에 더해 `game.room.waiting-room-retention` 설정값 기준으로 방치된 WAITING 방도 같은 배치에서 삭제하도록 확장, `IN_PROGRESS`는 절대 포함하지 않음 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/scheduler/GameRoomCleanupScheduler.java` (T013 의존, research.md #4)
- [ ] T015 [P] [US4] `application.yaml`에 `game.room.waiting-room-retention` 설정 키(`${GAME_ROOM_WAITING_RETENTION_MINUTES:30}`) 추가

### Tests for User Story 4 (구현 검증)

- [ ] T016 [US4] 보관 기간 초과 WAITING 방은 삭제되고, 보관 기간 이내 WAITING/IN_PROGRESS/최근 CLOSED 방은 유지되는지 검증하는 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/game/scheduler/GameRoomCleanupSchedulerTest.java`(기존 파일에 케이스 추가) (T014 의존)

**Checkpoint**: US1~US4 독립적으로 완전히 동작·검증 가능.

---

## Phase 7: User Story 5 - 백그라운드 정리 작업과 향후 실시간 신호 발송이 서로를 지연시키지 않음 (Priority: P5) [Part A]

**Goal**: 스케줄러 전용 스레드풀을 도입해 향후 SSE Heartbeat 등과 실행 지연 없이 공존하게 한다.

**Independent Test**: 여러 주기 작업을 등록했을 때 하나가 지연돼도 다른 작업 실행 주기가 밀리지 않는지 확인.

### Implementation for User Story 5

- [X] T017 [US5] `SchedulingConfig`에 `ThreadPoolTaskScheduler` 빈(poolSize ≥ 4) 등록 + `SchedulingConfigurer.configureTasks()`로 지정 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/common/config/SchedulingConfig.java` (research.md #5)

### Tests for User Story 5 (구현 검증)

- [X] T018 [US5] 스케줄러 빈의 풀 크기가 4 이상이고, 오래 걸리는 작업이 있어도 다른 `@Scheduled` 작업의 실행 시각이 밀리지 않는지 검증하는 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/common/config/SchedulingConfigTest.java` (T017 의존)

**Checkpoint**: US1~US5 독립적으로 완전히 동작·검증 가능.

---

## Phase 8: User Story 6 - 게임방 API 응답이 내부 구현에 종속되지 않음 (Priority: P6) [Part A]

**Goal**: `GameRoomService`가 엔티티 대신 `GameRoomResponse` DTO를 직접 반환하도록 리팩토링한다(관찰 가능한 동작 변화 없음).

**Independent Test**: 생성/입장/준비/시작 API 응답 필드 구성이 리팩토링 전후 동일한지 확인.

### Implementation for User Story 6

- [ ] T019 [US6] `GameRoomService.create/join/setReady/start`가 `GameRoomResponse`를 직접 반환하도록 시그니처 변경(`leave()`는 기존 `void` 유지) in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/service/GameRoomService.java` (research.md #6)
- [ ] T020 [US6] `GameRoomController`에서 `GameRoomResponse.from(entity)` 변환 호출 제거(서비스가 이미 DTO 반환) in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/controller/GameRoomController.java` (T019 의존)

### Tests for User Story 6 (구현 검증)

- [ ] T021 [US6] 생성/입장/준비/시작 API 응답 필드가 리팩토링 전(001 테스트 기준)과 동일한지 확인하는 회귀 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/game/controller/GameRoomControllerTest.java`(기존 파일 재확인/보강) (T020 의존)

**Checkpoint**: US1~US6 독립적으로 완전히 동작·검증 가능.

---

## Phase 9: User Story 7 - 프론트엔드 분리 배포를 위한 접근 허용 정책 (Priority: P7) [Part A]

**Goal**: `CORS_ALLOWED_ORIGINS` 환경변수 기반 명시적 CORS 허용을 도입한다.

**Independent Test**: 허용 목록에 있는 Origin은 정상 응답, 없는 Origin은 브라우저에서 차단됨을 헤더 부재로 확인.

### Implementation for User Story 7

- [ ] T022 [P] [US7] `CorsConfig`(`CorsConfigurationSource` 빈, `CORS_ALLOWED_ORIGINS` 콤마 구분 파싱) 신규 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/common/config/CorsConfig.java` (research.md #7)
- [ ] T023 [US7] `SecurityConfig`의 `HttpSecurity`에 `.cors(...)` 연결 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/common/config/SecurityConfig.java` (T022 의존)
- [ ] T024 [P] [US7] `application.yaml`/`env.sample`에 `cors.allowed-origins: ${CORS_ALLOWED_ORIGINS:}` 반영

### Tests for User Story 7 (구현 검증)

- [ ] T025 [US7] 허용 목록에 있는 Origin은 `Access-Control-Allow-Origin` 헤더 포함, 없는 Origin은 미포함인지 검증하는 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/common/config/CorsConfigTest.java` (T023 의존)

**Checkpoint**: US1~US7 독립적으로 완전히 동작·검증 가능.

---

## Phase 10: User Story 8 - 실시간 연결 전용 단기 인증 티켓 발급 (Priority: P8) [Part A — 마지막 선행 작업]

**Goal**: 로비 SSE와 방 내 WebSocket 양쪽에서 쓰일 1회용 단기 티켓 발급 API를 만든다.

**Independent Test**: 티켓 발급 → 그 값으로 연결 성공 → 같은 값 재사용 시 거부, 유효시간 경과 후 거부되는지 확인(연결 자체는 US9/US11에서 완성되므로, 여기서는 발급/저장/소비 로직만 단위 테스트로 검증).

### Implementation for User Story 8

- [ ] T026 [P] [US8] `RealtimeTicketResponse` DTO 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/auth/dto/RealtimeTicketResponse.java`
- [ ] T027 [US8] `RealtimeTicketService`(`ConcurrentHashMap<String, TicketEntry(userId, expiresAt)>` 기반 발급/1회 소비(consume)/만료 청소) 신규 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/auth/service/RealtimeTicketService.java` (research.md #8)
- [ ] T028 [US8] `AuthApi`/`AuthController`에 `POST /auth/sse-ticket`(bearerAuth) 추가 — `contracts/auth-ticket-api.yaml` 기준 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/auth/controller/` (T026, T027 의존)
- [ ] T029 [P] [US8] `application.yaml`/`env.sample`에 `game.room.realtime-ticket-ttl: ${REALTIME_TICKET_TTL_SECONDS:30}` 반영

### Tests for User Story 8 (구현 검증)

- [ ] T030 [P] [US8] `RealtimeTicketService` 발급/1회 소비 후 재사용 거부/만료 후 거부 단위 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/auth/service/RealtimeTicketServiceTest.java` (T027 의존)
- [ ] T031 [US8] `POST /auth/sse-ticket` MockMvc 테스트(인증 필요, 201 응답 스키마) in `backend/suhwa/src/test/java/backend/ssafy/suhwa/auth/controller/AuthControllerTest.java`(기존 파일에 케이스 추가) (T028 의존)

**Checkpoint**: 🚧 **Part A 완료 게이트(SC-001)** — US1~US8 전부 `./gradlew test` 통과 및 quickstart.md §1~§8 수동 검증 완료 전에는 절대 Phase 11(User Story 9)로 넘어가지 않는다.

---

## Phase 11: User Story 9 - 대기 중인 게임방 목록을 실시간으로 조회 (Priority: P9) [Part B — Part A 완료 후]

**Goal**: `SseEmitter` 기반 로비 실시간 목록 구독을 구현한다.

**Independent Test**: 로비 실시간 연결을 연 상태에서 다른 사용자가 방을 생성/입장/퇴장/시작하면 폴링 없이 목록이 갱신되는지 확인(3초 이내, SC-002).

### Implementation for User Story 9

- [ ] T032 [P] [US9] `LobbyRoomSummary`/`LobbyRoomList` DTO 생성 — `contracts/realtime-sse-api.yaml` 기준 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/realtime/dto/`
- [ ] T033 [US9] `LobbySubscriberRegistry`(`ConcurrentHashMap<String sessionId, SseEmitter>`) 신규 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/realtime/LobbySubscriberRegistry.java`
- [ ] T034 [US9] `LobbyBroadcastService`(현재 WAITING 방 목록 스냅샷 조회 + 등록된 모든 emitter에 `event: snapshot`/`event: update` 전송) 신규 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/realtime/LobbyBroadcastService.java` (T032, T033 의존)
- [ ] T035 [US9] `LobbySseController`(`GET /game-rooms/subscribe`, `SseEmitter` 응답에 `X-Accel-Buffering: no` 헤더, `onCompletion/onTimeout/onError` 시 `LobbySubscriberRegistry`에서 제거) 신규 생성 — 이 단계에서는 티켓 없이도 임시로 동작 가능하게 두고 엄격한 거부는 US13에서 강화 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/realtime/controller/LobbySseController.java` (T033, T034 의존)
- [ ] T036 [US9] 15초 주기 SSE 하트비트(빈 이벤트 `send`)를 `ThreadPoolTaskScheduler`(US5에서 등록된 빈) 기반으로 발송하는 스케줄 작업 추가 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/realtime/LobbyBroadcastService.java`(T034에 이어서, research.md #9)

### Tests for User Story 9 (구현 검증)

- [ ] T037 [P] [US9] `LobbyBroadcastService`가 방 목록 스냅샷을 올바르게 만들고 등록된 emitter 전체에 전송하는지 단위 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/game/realtime/LobbyBroadcastServiceTest.java`
- [ ] T038 [US9] `GET /game-rooms/subscribe` 연결 시 스냅샷 수신, 연결 종료 시 레지스트리에서 제거되는지 검증하는 통합 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/game/realtime/controller/LobbySseControllerTest.java` (T035 의존)

**Checkpoint**: US9 독립적으로 완전히 동작·검증 가능(Part A + US9만으로).

---

## Phase 12: User Story 10 - 방 입장 시 현재 인원 상태를 실시간 기준으로 확인 (Priority: P9) [Part B]

**Goal**: 방 생성/입장 시 로비 구독자에게 즉시 브로드캐스트되도록 `GameRoomService`를 `LobbyBroadcastService`와 연결한다.

**Independent Test**: 방 생성/입장 직후 로비 SSE 세션에 변경분이 반영되는지, 입장 응답에 실시간 인원/정원/상태가 포함되는지 확인.

### Implementation for User Story 10

- [ ] T039 [US10] `GameRoomService.create()`/`join()`(재입장이 아니라 실제로 신규 배정된 경로에서만)이 커밋 직후 `LobbyBroadcastService`를 호출해 로비 목록 변경을 브로드캐스트하도록 연결 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/service/GameRoomService.java` (T034 의존, research.md #9-1)

### Tests for User Story 10 (구현 검증)

- [ ] T040 [US10] 방 생성/입장 시 로비 SSE 세션에 3초 이내 `event: update`가 도착하는지, `POST /game-rooms/join` 응답에 `participantCount`/`capacity`/`status`가 정확히 포함되는지 검증하는 통합 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/game/GameRoomLobbyBroadcastIntegrationTest.java` (T039 의존)

**Checkpoint**: US9~US10 독립적으로 완전히 동작·검증 가능.

---

## Phase 13: User Story 11 - 연결이 끊겨도 바로 퇴장 처리되지 않고 유예 시간을 둠 (Priority: P10) [Part B]

**Goal**: 방 내 WebSocket을 구현해 명시적 나가기·비정상 연결 끊김에 따른 유예 시간·재접속·재입장 인식을 처리한다. 이번 스펙에서 가장 핵심적인 스토리.

**Independent Test**: 연결이 예기치 않게 끊긴 뒤 유예 시간 안에 재접속하면 취소, 넘기면 실제 퇴장(위임/종료) 처리되는지, 명시적 나가기 시 상대방이 즉시 통보받는지, 재입장 시 인원수가 늘지 않는지 확인.

### Implementation for User Story 11

- [ ] T041 [P] [US11] `RoomParticipantRegistry`(`ConcurrentHashMap<Long roomId, RoomLiveState>`) + `RoomLiveState`/`ParticipantLiveState`(session, readyCache, pendingDeadline, pendingTask 필드 — data-model.md 참고) 신규 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/realtime/RoomParticipantRegistry.java`
- [ ] T042 [US11] `RoomRealtimeNotifier` 인터페이스+구현체(`PEER_DISCONNECTED`/`PEER_RECONNECTED`/`PEER_LEFT`/`GAME_STARTED`/`SIGNAL` 메시지를 `RoomParticipantRegistry`의 세션들에 전송) 신규 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/realtime/RoomRealtimeNotifier.java` (T041 의존)
- [ ] T043 [US11] `GameRoomHandshakeInterceptor`(티켓 검증 + `RoomParticipantRegistry` 조회로 참가자 여부 확인, 이 단계에서는 기본 성공/실패만 — 엄격한 거부 케이스는 US13에서 보강) 신규 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/realtime/GameRoomHandshakeInterceptor.java` (T027, T041 의존)
- [ ] T044 [US11] `RealtimeWebSocketConfig`(`WebSocketConfigurer`, `/ws/game-rooms/{roomId}` 등록 + 인터셉터 연결) 신규 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/realtime/RealtimeWebSocketConfig.java` (T043 의존)
- [ ] T045 [US11] `GameRoomWebSocketHandler`(`TextWebSocketHandler`) — 연결 성공 시 세션 등록, `afterConnectionClosed`가 비정상 종료면 유예 타이머(5~10초, `pendingDeadline`/`pendingTask`) 등록해 만료 시 `GameRoomService.leave(roomId, userId)` 호출, 재연결 시 타이머 취소 신규 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/realtime/GameRoomWebSocketHandler.java` (T041, T042 의존, research.md #12)
- [ ] T046 [US11] `application.yaml`/`env.sample`에 `game.room.leave-grace-seconds: ${GAME_ROOM_LEAVE_GRACE_SECONDS:7}` 반영
- [ ] T047 [US11] `GameRoomService.join()`에 재입장 인식 추가: `room.isParticipant(userId)`이면 인원수 변경 없이 즉시 현재 상태 반환(FR-020) in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/service/GameRoomService.java` (research.md #14-1 — 001 `join()`의 기존 결함 수정)
- [ ] T048 [US11] `GameRoomService.leave()`가 `RoomRealtimeNotifier`를 주입받아 커밋 직후 `PEER_LEFT` 브로드캐스트를 트리거하도록 연결(REST 컨트롤러/WebSocket 유예 타이머 어느 쪽에서 호출되든 이 한 곳에서만 실행) + 같은 커밋 직후 `LobbyBroadcastService`도 호출(FR-010) in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/service/GameRoomService.java` (T042, T034 의존, research.md #12)

### Tests for User Story 11 (구현 검증)

- [ ] T049 [P] [US11] `RoomParticipantRegistry`/`ParticipantLiveState` 등록·조회·제거 단위 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/game/realtime/RoomParticipantRegistryTest.java` (T041 의존)
- [ ] T050 [US11] `StandardWebSocketClient`로 연결 → 강제 종료 → 유예 시간 내 재접속 시 취소, 유예 시간 초과 시 `leave()` 호출(방장 위임/종료) 검증하는 통합 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/game/realtime/GameRoomWebSocketHandlerTest.java` (T045 의존)
- [ ] T051 [US11] 명시적 `POST /leave` 호출 시 유예 시간 없이 즉시 `PEER_LEFT`가 상대방에게 전송되는지 검증하는 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/game/realtime/GameRoomWebSocketHandlerTest.java`(같은 파일에 케이스 추가) (T048 의존)
- [ ] T052 [US11] 이미 참가 중인 사용자가 같은 방에 `POST /join`을 다시 호출해도 `ROOM_FULL`이 아니라 기존 상태를 그대로 반환하는지(인원수 미증가) 검증하는 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/game/service/GameRoomServiceTest.java`(기존 파일에 케이스 추가) (T047 의존)

**Checkpoint**: US9~US11 독립적으로 완전히 동작·검증 가능.

---

## Phase 14: User Story 12 - 게임 시작/종료 시점이 실시간으로 전파됨 (Priority: P11) [Part B]

**Goal**: 게임 시작 확정 시 방 내 `GAME_STARTED` 브로드캐스트와 로비 목록에서의 즉시 제거를 연결한다.

**Independent Test**: 양쪽 준비 완료 후 시작 요청 성공 시 두 참가자 모두 `GAME_STARTED` 수신, 동시에 로비 목록에서 그 방이 사라지는지 확인.

### Implementation for User Story 12

- [ ] T053 [US12] `GameRoomService.start()`가 커밋 직후 `RoomRealtimeNotifier.notifyGameStarted(roomId)`(FR-021)와 `LobbyBroadcastService`의 "목록에서 제거" 브로드캐스트(FR-022)를 모두 호출하도록 연결 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/service/GameRoomService.java` (T042, T034 의존, research.md #9-1)

### Tests for User Story 12 (구현 검증)

- [ ] T054 [US12] 양쪽 준비 완료 후 `POST /start` 성공 시 두 WebSocket 클라이언트 모두 `GAME_STARTED` 수신, 로비 SSE 세션에서는 해당 방이 다음 `update`에서 사라지는지 검증하는 통합 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/game/GameRoomStartBroadcastIntegrationTest.java` (T053 의존)

**Checkpoint**: US9~US12 독립적으로 완전히 동작·검증 가능.

---

## Phase 15: User Story 13 - 실시간 연결은 로그인/방 참가자 확인을 통과해야만 열림 (Priority: P12) [Part B]

**Goal**: 로비 SSE·방 내 WebSocket 모두 인증/참가자 검증을 엄격히 강제하도록 굳힌다(US9/US11에서 기본 골격은 이미 만들어짐).

**Independent Test**: 티켓 없이 로비 연결 시도, 참가자가 아닌 사용자의 방 WebSocket 연결 시도가 각각 거부되는지 확인.

### Implementation for User Story 13

- [ ] T055 [US13] `LobbySseController`가 유효하지 않거나 이미 소비/만료된 티켓이면 401(`ErrorResponse` 형식)로 연결 자체를 거부하도록 엄격화 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/realtime/controller/LobbySseController.java` (T035, T027 의존)
- [ ] T056 [US13] `GameRoomHandshakeInterceptor`가 참가자가 아닌 `userId`의 핸드셰이크를 명시적으로 거부하고, 메시지 수신 시마다 여전히 참가자인지 재검증(참가자 아니게 된 이후 메시지는 `ERROR` 응답 후 차단)하도록 보강 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/realtime/GameRoomHandshakeInterceptor.java`, `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/realtime/GameRoomWebSocketHandler.java` (T043, T045 의존)

### Tests for User Story 13 (구현 검증)

- [ ] T057 [P] [US13] 티켓 없이/만료된 티켓으로 `/game-rooms/subscribe` 연결 시도 시 401 거부 검증 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/game/realtime/controller/LobbySseControllerTest.java`(기존 파일에 케이스 추가) (T055 의존)
- [ ] T058 [P] [US13] 방 참가자가 아닌 사용자의 핸드셰이크 거부, 참가자였다가 나간 이후 메시지 전송 시 차단되는지 검증 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/game/realtime/GameRoomHandshakeInterceptorTest.java` (T056 의존)

**Checkpoint**: US9~US13 독립적으로 완전히 동작·검증 가능.

---

## Phase 16: User Story 14 - 영상 통화 연결을 위한 신호 중계 (Priority: P13) [Part B]

**Goal**: 방 WebSocket 위에 WebRTC 시그널링 릴레이(`SIGNAL` 메시지)와 ICE 서버 정보 제공 API를 얹는다.

**Independent Test**: 같은 방의 두 사용자 사이에서 시그널이 가공 없이 전달되고, 다른 방 참가자에게는 전달되지 않는지, ICE 서버 정보를 받을 수 있는지 확인.

### Implementation for User Story 14

- [ ] T059 [P] [US14] `WebRtcProperties`(`@ConfigurationProperties(prefix="webrtc")`, STUN/TURN 목록) 신규 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/webrtc/config/WebRtcProperties.java`
- [ ] T060 [P] [US14] `application.yaml`/`env.sample`에 `webrtc.stun-urls`/`webrtc.turn-url`/`webrtc.turn-username`/`webrtc.turn-credential` 반영
- [ ] T061 [US14] `IceServerController`(`GET /webrtc/ice-servers`, bearerAuth) 신규 생성 — `contracts/realtime-sse-api.yaml` 기준 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/webrtc/controller/IceServerController.java` (T059 의존)
- [ ] T062 [US14] `GameRoomWebSocketHandler`가 수신 메시지 `type: "SIGNAL"`을 파싱해 `RoomRealtimeNotifier`에 위임(같은 방 상대방 세션에만 payload 원본 그대로 전달)하도록 메시지 타입 분기 추가, 그 아래에 `// TODO: WebSocket 메시지 송수신 로직 구현 위치 (다른 담당자 작업 예정)` 마커 삽입 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/realtime/GameRoomWebSocketHandler.java`, `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/realtime/RoomRealtimeNotifier.java` (T042, T045 의존)

### Tests for User Story 14 (구현 검증)

- [ ] T063 [P] [US14] `GET /webrtc/ice-servers` 응답 스키마 검증 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/webrtc/controller/IceServerControllerTest.java` (T061 의존)
- [ ] T064 [US14] 같은 방 두 참가자 사이 `SIGNAL` 전달 성공, 다른 방 참가자에게는 미전달 검증하는 통합 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/game/realtime/GameRoomWebSocketHandlerTest.java`(기존 파일에 케이스 추가) (T062 의존)

**Checkpoint**: US9~US14 독립적으로 완전히 동작·검증 가능.

---

## Phase 17: User Story 15 - 방 생성/입장 후 실시간 연결을 확립하지 않으면 자동으로 방치가 정리됨 (Priority: P14) [Part B]

**Goal**: REST로 방을 생성/입장한 뒤 15초 안에 WebSocket을 열지 않는 참가자를 자동 정리하고(FR-029), 실시간 연결이 살아있는 WAITING 방은 정리 스케줄러 대상에서 제외한다(FR-030).

**Independent Test**: 호스트/게스트가 각각 15초 안에 연결하지 않으면 자동 정리(위임/종료/자리비움)되는지, 확인 대기 중에도 정원에 포함되는지, 접속 중인 방은 보관 기간을 넘겨도 삭제되지 않는지 확인.

### Implementation for User Story 15

- [ ] T065 [US15] `ParticipantLiveState`에 `confirmed`(boolean, 초기 `false`) 필드 추가 — `pendingDeadline`/`pendingTask`는 US11에서 이미 존재하는 필드를 재사용(최초 확인 대기 15초와 재접속 유예 5~10초가 같은 필드를 공유, research.md #12) in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/realtime/RoomParticipantRegistry.java`
- [ ] T066 [US15] `GameRoomService.create()`/`join()`(신규 배정 경로)이 커밋 직후 `RoomParticipantRegistry`에 해당 참가자를 `confirmed=false`로 등록하고 15초 확인 대기 타이머(`pendingTask` → 만료 시 `leave(roomId, userId)` 호출)를 예약하도록 연결 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/service/GameRoomService.java` (T065 의존, research.md #14)
- [ ] T067 [US15] `GameRoomHandshakeInterceptor`/`GameRoomWebSocketHandler`가 핸드셰이크 성공 시 해당 참가자가 미확정(`confirmed=false`)이었다면 확인 대기 타이머를 취소하고 `confirmed=true`로 전환하도록 보강(재접속과 동일 코드 경로) in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/realtime/GameRoomHandshakeInterceptor.java` (T066 의존)
- [ ] T068 [US15] `application.yaml`/`env.sample`에 `game.room.join-confirmation-seconds: ${GAME_ROOM_JOIN_CONFIRMATION_SECONDS:15}` 반영
- [ ] T069 [US15] `GameRoomCleanupScheduler`가 삭제 대상 후보 WAITING 방마다 `RoomParticipantRegistry`를 조회해 `confirmed=true`인 살아있는 참가자가 하나라도 있으면 삭제 대상에서 제외하도록 보강(FR-030) in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/scheduler/GameRoomCleanupScheduler.java` (T065 의존, research.md #4)

### Tests for User Story 15 (구현 검증)

- [ ] T070 [US15] 호스트가 15초 안에 연결하지 않으면 방이 종료되고(게스트 없음), 게스트가 15초 안에 연결하지 않으면 자리가 비워지며, 호스트가 연결하지 않았지만 게스트가 있으면 위임되는 3가지 시나리오를 검증하는 통합 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/game/realtime/JoinConfirmationTimeoutIntegrationTest.java` (T066 의존)
- [ ] T071 [US15] 확인 대기 중에도 정원 계산/실시간 목록 인원수에 포함되는지, 재입장 호출이 타이머를 연장시키지 않는지 검증하는 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/game/realtime/JoinConfirmationTimeoutIntegrationTest.java`(같은 파일에 케이스 추가) (T066, T047 의존)
- [ ] T072 [US15] 실시간 연결이 살아있는(confirmed) WAITING 방은 보관 기간을 넘겨도 정리 스케줄러가 삭제하지 않는지 검증하는 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/game/scheduler/GameRoomCleanupSchedulerTest.java`(기존 파일에 케이스 추가) (T069 의존)

**Checkpoint**: US9~US15(Part B 전체) 독립적으로 완전히 동작·검증 가능.

---

## Phase 18: FR-028 — 서버 재시작 시 정합화 (User Story 없음, Part B 인프라 전제)

**Purpose**: 어떤 단일 User Story에도 속하지 않지만 Part B 전체(인메모리 실시간 상태)가 성립하기 위한 안전장치. US9~US15 중 아무 때나(구현 순서상 US11 착수 시점 이후 아무 때나) 수행해도 무방하다.

- [ ] T073 [P] `GameRoomRepository`에 `status IN (WAITING, IN_PROGRESS)` 방을 일괄 `CLOSED`로 갱신하는 벌크 업데이트 쿼리 추가 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/repository/GameRoomRepository.java`
- [ ] T074 `GameRoomStartupReconciler`(`ApplicationReadyEvent` 리스너, 기동 직후 1회 T073 쿼리 실행) 신규 생성 in `backend/suhwa/src/main/java/backend/ssafy/suhwa/game/scheduler/GameRoomStartupReconciler.java` (T073 의존, research.md #4)
- [ ] T075 [P] 서버 재시작 시 WAITING/IN_PROGRESS 방이 모두 CLOSED로 전환되는지 검증하는 테스트 in `backend/suhwa/src/test/java/backend/ssafy/suhwa/game/scheduler/GameRoomStartupReconcilerTest.java` (T074 의존)

---

## Phase 19: Polish & Cross-Cutting Concerns

**Purpose**: 전체 스토리에 걸친 마무리 점검

- [ ] T076 `./gradlew test` 전체 통과 확인
- [ ] T077 `quickstart.md` §1~§16 전체 시나리오 수동 검증(Part A §1~§8 완료 게이트 재확인 후 Part B §9~§16 순서대로)
- [ ] T078 [P] Swagger UI에서 신규 REST 엔드포인트(`POST /auth/sse-ticket`, `GET /webrtc/ice-servers`)가 올바른 도메인 Tag로 노출되는지 확인
- [ ] T079 각 신규 서비스가 던지는 예외를 `GlobalExceptionHandler`가 빠짐없이 처리하는지 점검(`ACCESS_DENIED`, `CONCURRENT_UPDATE_CONFLICT` 포함 계약 대조)
- [ ] T080 [P] `RoomRealtimeNotifier`가 다루는 6종 메시지(`PEER_DISCONNECTED`/`PEER_RECONNECTED`/`PEER_LEFT`/`GAME_STARTED`/`SIGNAL`/`ERROR`) 전부에 실제 호출 지점이 존재하는지 코드 레벨로 최종 확인(research.md #9-1, #12)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 의존성 없음 — 즉시 시작 가능
- **Foundational (Phase 2)**: 해당 없음(001 인프라 재사용)
- **Part A User Stories (Phase 3~10, US1~US8)**: Setup 완료 후 시작 가능. 서로 다른 스토리끼리는 독립적이라 우선순위 순서(P1→P8)대로 진행하거나 병렬 진행 가능
- **Part A 완료 게이트**: US1~US8 전부 완료·검증(`./gradlew test` + quickstart §1~§8) 전에는 Phase 11(US9) 착수 금지(SC-001)
- **Part B User Stories (Phase 11~17, US9~US15)**: Part A 완료 게이트 통과 후 시작. US9(로비 SSE 기반)와 US11(방 WebSocket 기반)이 각각 US10/US12~US15가 딛고 서는 기반이라, 두 스토리를 먼저 완료하는 것을 권장(아래 User Story Dependencies 참고)
- **Phase 18(FR-028 재시작 정합화)**: 어떤 Part B 스토리와도 강하게 결합돼 있지 않음 — US11 착수 이후 아무 때나 수행 가능
- **Polish (Phase 19)**: 완료하고자 하는 모든 User Story 이후

### User Story Dependencies

- **US1~US8 (Part A)**: 서로 독립적 — 어떤 순서로 진행해도 무방
- **US9 (P9)**: Part A 완료 후 시작 가능, 다른 Part B 스토리에 의존하지 않음(로비 SSE의 기반)
- **US10 (P9)**: US9의 `LobbyBroadcastService`에 의존(같은 클래스를 재사용)
- **US11 (P10)**: US8의 티켓 발급에 의존(핸드셰이크 인증), 다른 Part B 스토리와는 독립 — 이 스펙에서 가장 많은 신규 클래스(`RoomParticipantRegistry`, `RoomRealtimeNotifier`, `GameRoomWebSocketHandler` 등)를 도입하므로 US12~US15가 이 스토리의 산출물에 의존
- **US12 (P11)**: US11의 `RoomRealtimeNotifier`, US10/US9의 `LobbyBroadcastService`에 의존
- **US13 (P12)**: US9의 `LobbySseController`, US11의 `GameRoomHandshakeInterceptor`를 보강(선행 스토리의 산출물이 있어야 "보강"이 의미를 가짐)
- **US14 (P13)**: US11의 `GameRoomWebSocketHandler`/`RoomRealtimeNotifier`에 의존, US13의 접근 제어를 재사용
- **US15 (P14)**: US11의 `RoomParticipantRegistry`/`ParticipantLiveState`(pendingDeadline/pendingTask 필드) 확장 + US4의 `GameRoomCleanupScheduler` 확장

### Within Each User Story

- Implementation 작업을 먼저 완료
- 그 다음 Tests(구현 검증) 작업으로 `./gradlew test` 통과 확인
- 각 스토리 완료 후 다음 우선순위 스토리로 이동

### Parallel Opportunities

- Setup의 T001, T002는 병렬 가능
- Part A(US1~US8) 내에서는 스토리 간 병렬 진행 가능(서로 독립적)
- 각 스토리 내 엔티티/DTO 생성 작업([P] 표시)은 서로 병렬 가능
- Phase 18(FR-028)은 US11 완료 후라면 다른 Part B 스토리와 병렬 가능

---

## Parallel Example: User Story 11 (핵심 스토리)

```bash
# 신규 클래스 스켈레톤을 함께 생성 (서로 다른 파일):
Task: "RoomParticipantRegistry + RoomLiveState/ParticipantLiveState in game/realtime/RoomParticipantRegistry.java"
# (RoomRealtimeNotifier, GameRoomHandshakeInterceptor는 RoomParticipantRegistry에 의존하므로 순차 진행)

# 구현 완료 후 테스트를 함께 작성:
Task: "RoomParticipantRegistry 단위 테스트 in game/realtime/RoomParticipantRegistryTest.java"
Task: "GameRoomWebSocketHandler 유예/재접속 통합 테스트 in game/realtime/GameRoomWebSocketHandlerTest.java"
```

---

## Implementation Strategy

### MVP First (Part A 전체 = SC-001이 요구하는 최소 단위)

1. Phase 1: Setup 완료
2. Phase 3~10: Part A(US1~US8) 전부 완료 — **이 시점에 이미 `GlobalExceptionHandler` 통일, 동시성 안전, DTO 계층 분리, CORS, 티켓 발급까지 갖춘 안정화된 REST 백엔드**가 된다
3. **멈추고 검증**: quickstart.md §1~§8로 Part A 게이트 통과 확인
4. 필요 시 이 상태로 데모(실시간 기능 없이도 001+Part A만으로 완결된 REST API)

### Incremental Delivery

1. Setup 완료 → Part A(US1~US8) 순서 무관하게 진행 → Part A 게이트 통과
2. US9(로비 SSE) 추가 → 독립 검증 → 실시간 목록 기능 데모 가능
3. US10 추가 → 독립 검증
4. US11(방 WebSocket 핵심) 추가 → 독립 검증 → 유예/재접속 기능 데모 가능
5. US12~US15 순서대로 추가 → 각각 독립 검증
6. Phase 18(재시작 정합화)은 US11 이후 아무 시점에나 끼워 넣어도 무방
7. Phase 19(Polish)로 마무리

### Parallel Team Strategy

여러 인원이 작업할 경우:

1. Setup은 함께 완료
2. Part A(US1~US8)는 서로 독립적이므로 개발자별로 나눠 병렬 진행(예: 개발자 A는 US1/US2, 개발자 B는 US4/US5, 개발자 C는 US7/US8) — 단, **전원이 Part A를 완료해야 Part B 착수 가능**(SC-001)
3. Part A 게이트 통과 후: 개발자 A는 US9/US10(로비), 개발자 B는 US11(방 WebSocket 핵심, 가장 오래 걸림), 개발자 C는 US14(시그널링, US11 완료 대기) 순으로 배정 권장
4. US12/US13/US15는 US11 완료 직후 병렬 배정 가능

---

## Notes

- `[P]` 작업 = 서로 다른 파일, 선행 의존성 없음
- `[Story]` 라벨은 작업을 특정 User Story에 추적 가능하게 연결(Setup/Foundational/Phase 18/Polish는 라벨 없음)
- 이 프로젝트는 TDD가 아니라 "구현 → 검증" 순서를 따른다(001과 동일 관례) — 각 스토리 안에서 Implementation을 먼저 완료하고, 그 다음 Tests 작업으로 `./gradlew test`를 통과시킨다
- `GameRoomService.java`처럼 여러 스토리(US3/US6/US11/US12/US15)가 같은 파일을 순차적으로 채워나가는 경우 `[P]` 표시를 붙이지 않았다 — 동시 편집 충돌을 피하기 위함
- **Part A → Part B 순서는 협상 불가능한 하드 게이트다(SC-001)** — Part A의 어떤 스토리라도 미완료 상태로 Part B 작업(Phase 11 이후)에 착수하지 않는다
- 커밋은 각 작업 또는 논리적 묶음 단위로 수행
- 각 체크포인트에서 멈춰 해당 스토리가 독립적으로 동작하는지 검증
- 지양할 것: 모호한 작업 설명, 같은 파일에 대한 병렬 작업 충돌, 스토리 간 독립성을 깨는 교차 의존, Part A 게이트를 건너뛰는 것
