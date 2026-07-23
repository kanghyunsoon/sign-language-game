---

description: "Task list for 방 실시간 연결 자동화 및 영상 통화 전환 시 안전한 정리"
---

# Tasks: 방 실시간 연결 자동화 및 영상 통화 전환 시 안전한 정리

**Input**: Design documents from `backend/specs/003-webrtc-handoff-flow/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: 이 스펙은 테스트 작성을 명시적으로 요청하지 않았지만, plan.md Project Structure가 각 스토리별 테스트 파일을 이미 지정해뒀으므로(002 관례 유지) 포함한다.

**Organization**: 태스크는 spec.md의 User Story(P1/P2)별로 그룹화되어 있어 각 스토리를 독립적으로 구현·검증할 수 있다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 실행 가능(다른 파일, 선행 의존성 없음)
- **[Story]**: 이 태스크가 속한 User Story(US1, US2 등)
- 모든 태스크는 정확한 파일 경로를 포함한다

## Path Conventions

단일 백엔드 프로젝트: `backend/suhwa/src/main/java/backend/ssafy/suhwa/`, `backend/suhwa/src/test/java/backend/ssafy/suhwa/`(plan.md Project Structure 기준)

---

> **참고**: 태스크 번호가 T004부터 시작하는 이유 — 원래 T001~T003은 스키마 변경 도구 관련 선행 확인 태스크였으나 해당 의존성이 제거되면서 삭제됨. 기존 태스크 번호(T004~T069)는 다운스트림 참조 유지를 위해 그대로 보존.

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: 모든 User Story가 공유하는 핵심 엔티티·스키마·저장소 — 이 단계 없이는 어떤 스토리도 완결되지 않는다

**⚠️ CRITICAL**: 이 단계가 끝나기 전에는 어떤 User Story 구현도 시작할 수 없다

---

- [X] T004 `game/domain/GameType.java` enum 생성(`SIGN_DUEL`, `TETRIS_DUEL`) — `game_rooms` 전용, research.md #3
- [X] T005 `gameresult/domain/GameResultType.java` enum 생성(`SIGN_DUEL`, `TETRIS_DUEL`, `TETRIS_SOLO`) — `game_results` 전용, `GameType`과는 별도 enum(research.md #3/#5)
- [X] T006 [P] `gameresult/domain/GameResult.java` JPA 엔티티 생성(`id, userId, gameType(GameResultType), score, recordedAt`) — data-model.md `game_results` 스키마 기준
- [X] T007 [P] `gameresult/repository/GameResultRepository.java` 생성 — `GameRoomService`/`SoloResultService`/`RankingService` 3곳이 공유(plan.md Structure Decision, STABLE-08-11 ArchUnit 경계와의 긴장 관계 인지)
- [X] T008 스키마 변경 SQL 작성(`src/main/resources/schema/01_add_game_type_to_game_rooms.sql`) — `ALTER TABLE game_rooms ADD COLUMN game_type VARCHAR(20) NOT NULL DEFAULT 'SIGN_DUEL'`(data-model.md)
- [X] T009 스키마 변경 SQL 작성(`src/main/resources/schema/02_create_game_results.sql`) — `game_results` 테이블 생성(FK, `idx_game_result_user_type`, `idx_game_result_type_score` 인덱스 포함, data-model.md DDL 그대로)
- [X] T010 `game/domain/GameRoom.java`에 `@Enumerated(EnumType.STRING) private GameType gameType` 필드 추가(FR-017/018/020)
- [X] T011 `game/realtime/ParticipantLiveState.java`에 `expectingIntentionalClose`(boolean, 초기값 false) 필드 추가(FR-003/004, data-model.md)
- [X] T012 `game/realtime/RoomRealtimeNotifier.java` 인터페이스에 `notifyReadyChanged(roomId, userId, isReady)` 메서드 추가하고 `WebSocketRoomRealtimeNotifier` 구현 반영(FR-030, research.md #2)
- [X] T013 `game/realtime/dto/LobbyRoomSummary.java`에 `gameType` 필드 추가(FR-018, research.md #3 — `GameRoomResponse`와 별개 record이므로 따로 추가해야 함)

**Checkpoint**: 공통 엔티티·저장소·스키마가 준비되어 이후 모든 User Story 구현을 병렬로 시작할 수 있다

---

## Phase 2: User Story 1 - 방에 입장하면 실시간 연결이 자동으로 맺어진다 (Priority: P1) 🎯 MVP

**Goal**: 대전 모드 방 생성/입장 응답에 실시간 연결 티켓을 동봉해 추가 API 호출 없이 WebSocket이 즉시 연결되게 한다

**Independent Test**: 방 생성 또는 입장 API를 한 번 호출한 뒤, 그 응답 정보만으로 WebSocket이 연결되는지 확인(quickstart.md §1)

### Tests for User Story 1

- [X] T014 [P] [US1] `game/service/GameRoomServiceTest.java`에 "생성/입장 응답에 realtimeTicket 포함" 케이스 추가

### Implementation for User Story 1

- [X] T015 [P] [US1] `game/dto/CreateRoomRequest.java` 신설(`gameType` 필수 필드, FR-017) — contracts/game-rooms-api-delta.yaml `CreateRoomRequest` 스키마
- [X] T016 [US1] `game/dto/GameRoomResponse.java`에 `gameType`, `realtimeTicket` 필드 추가(FR-001/002/018)
- [X] T017 [US1] `game/service/GameRoomService.java`의 `create(gameType)`/`join()` 시그니처 변경 — `gameType` 파라미터 반영, 커밋 직후 실시간 티켓 발급(FR-001)
- [X] T018 [US1] `game/controller/GameRoomController.java`의 `createRoom`이 `CreateRoomRequest`(gameType)를 받도록 변경, `gameType` 누락 시 400(FR-017, contracts "400")

**Checkpoint**: User Story 1이 독립적으로 완결되어 검증 가능 — 방 생성/입장만으로 WebSocket이 바로 연결된다

---

## Phase 3: User Story 2 - 영상 통화 연결로 전환하면 방 실시간 연결이 오작동 없이 정리된다 (Priority: P1)

**Goal**: `WEBRTC_CONNECTED` 신호 이후의 WebSocket 종료를 방 이탈로 오인하지 않게 한다

**Independent Test**: 신호를 보내고 연결을 끊으면 참가자가 유지되고, 신호 없이 끊기면 기존과 동일하게 유예 처리 후 이탈되는지 확인(quickstart.md §4)

### Tests for User Story 2

- [ ] T019 [P] [US2] `game/realtime/GameRoomWebSocketHandlerTest.java`에 "WEBRTC_CONNECTED 수신 후 정상 종료(유예 없음)" 케이스 추가
- [ ] T020 [P] [US2] `game/realtime/GameRoomWebSocketHandlerTest.java`에 "신호 없는 종료는 기존과 동일하게 유예 처리(회귀)" 케이스 추가

### Implementation for User Story 2

- [ ] T021 [US2] `game/realtime/GameRoomWebSocketHandler.java`의 `handleTextMessage`에 `WEBRTC_CONNECTED` 타입 분기 추가 — 수신 시 해당 참가자 `ParticipantLiveState.expectingIntentionalClose = true`(FR-003, research.md #1)
- [ ] T022 [US2] `game/realtime/GameRoomWebSocketHandler.java`의 `afterConnectionClosed`가 `expectingIntentionalClose == true`면 유예 타이머(`leave-grace-seconds`)를 걸지 않고 참가자를 정상 상태로 유지(FR-004) — `false`면 기존 유예 타이머 그대로 적용(FR-005, 회귀 없음)
- [ ] T023 [US2] 게임 시작 후 `WEBRTC_CONNECTED`가 오지 않아도 WebSocket을 강제 종료하지 않는지 확인(FR-006, 별도 코드 변경 없이 회귀 테스트로만 검증)

**Checkpoint**: User Story 1·2가 함께 독립적으로 동작 — 실시간 연결 자동화 + 영상 통화 전환 시 안전한 정리

---

## Phase 4: User Story 3 - 게임 시작부터 영상 통화 연결까지, 기존 기능이 이어서 정상 동작한다 (Priority: P2, 회귀 검증)

**Goal**: US1·US2로 흐름이 바뀐 뒤에도 게임 시작 통보, ICE 서버 조회, 시그널링 중계(002 기능)가 문제없이 이어지는지 확인

**Independent Test**: 준비 완료 → 시작 요청 → 게임 시작 통보 → ICE 서버 조회 → 시그널링 중계까지 끊김 없이 동작하는지 확인(quickstart.md §3)

### Tests for User Story 3

- [ ] T024 [P] [US3] 기존 `game/realtime/GameRoomWebSocketHandlerTest.java`/`webrtc` 관련 테스트가 US1/US2 변경 이후에도 통과하는지 회귀 실행(신규 테스트 아님)

### Implementation for User Story 3

- [ ] T025 [US3] quickstart.md §3에 따라 게임 시작 통보(`GAME_STARTED`), `GET /webrtc/ice-servers`, `SIGNAL` 중계 회귀를 수동/통합 검증한다(코드 변경 없음 — 002 기능 그대로 재사용 확인)

**Checkpoint**: 대전 모드 흐름 전체(연결→전환→시작→시그널링)가 끊김 없이 검증됨

---

## Phase 5: User Story 6 - 대전 모드 게임방은 게임 종류를 구분해서 생성된다 (Priority: P1)

**Goal**: 대전 모드 방 생성 시 게임 종류(지문자 1:1 대전/테트리스 대전)를 필수로 받고, 응답과 로비 목록에 노출한다

**Independent Test**: 게임 종류를 지정해 방을 만들고, 응답과 로비 실시간 목록에 정확히 노출되는지 확인(quickstart.md §7)

> US1(T015~T018)에서 이미 `gameType` 생성 요청/응답 배관을 구현했으므로, 이 스토리는 로비 목록 노출과 정원 회귀 확인에 집중한다.

### Tests for User Story 6

- [ ] T026 [P] [US6] `game/service/GameRoomServiceTest.java`에 "gameType 생략 시 400" 케이스 추가(FR-017)

### Implementation for User Story 6

- [ ] T027 [US6] `game/realtime/LobbyBroadcastService.java`가 `LobbyRoomSummary` 조립 시 `gameType`을 채우도록 반영(T013의 필드 추가 활용, FR-018)
- [ ] T028 [US6] 대전 모드 정원이 게임 종류와 무관하게 항상 2명으로 적용되는지 회귀 확인(`GameRoomResponse.CAPACITY`, FR-020, 코드 변경 없음)

**Checkpoint**: 서로 다른 게임 종류의 방이 로비 목록에서 각자의 gameType과 함께 구분되어 보인다

---

## Phase 6: User Story 4 - 대전 모드 게임이 끝나면 결과가 승패 정보만으로 안전하게 기록된다 (Priority: P1)

**Goal**: 점수 없이 승자 정보(무승부 포함)만으로 결과를 보고하고, `game_results`에 승자/패자 행을 함께 기록한다

**Independent Test**: 승자 정보만으로 결과를 보고해 정상 기록되는지, 중복 보고가 거부되는지, 비참가자가 거부되는지 확인(quickstart.md §5)

### Tests for User Story 4

- [ ] T029 [P] [US4] `game/service/GameRoomServiceTest.java`에 "승자 정보만으로 결과 보고 → game_results에 승자 score=1, 패자 score=0 행 반영" 케이스 추가(FR-021, research.md #5)
- [ ] T030 [P] [US4] `game/service/GameRoomServiceTest.java`에 "무승부(winnerUserId 없음) → game_results 미반영" 케이스 추가(FR-033)
- [ ] T031 [P] [US4] `game/service/GameRoomServiceTest.java`에 "중복 결과 보고 거부(409)", "비참가자 결과 보고 거부(403)" 회귀 케이스 추가(FR-011/012)

### Implementation for User Story 4

- [ ] T032 [US4] `game/dto/GameResultRequest.java`를 `record GameResultRequest(Long winnerUserId)`로 교체(hostScore/guestScore 제거, FR-021/033, research.md #4)
- [ ] T033 [US4] `game/dto/GameResultResponse.java`에서 `hostScore`/`guestScore`/`gameSessionId` 제거, `winnerUserId`만 남김(research.md #8)
- [ ] T034 [US4] `game/service/GameRoomService.java`의 `reportResult()`를 재작성 — 점수 비교(`computeWinner`) 대신 `winnerUserId` 직접 검증(방 참가자인지 확인, 아니면 400), `GameSession` 생성 코드 제거
- [ ] T035 [US4] `game/service/GameRoomService.java`에 승자에게 `GameResult(score=1)`, 패자에게 `GameResult(score=0)` 저장 로직 추가 — 무승부(`winnerUserId == null`)면 아무 것도 저장하지 않음(FR-033, research.md #5) — 기존 `updateUserRecords`(users.win_count/loss_count 증감) 로직 제거
- [ ] T036 [US4] `game/controller/GameRoomController.java`의 결과 보고 엔드포인트가 새 `GameResultRequest`를 받도록 반영

**Checkpoint**: 대전 모드 결과가 승패 정보만으로 안전하게 기록되고 랭킹 집계 원본(`game_results`)에 반영된다

---

## Phase 7: User Story 5 - 게임이 끝나면 방은 다시 대기 상태로 돌아가 재대결할 수 있다 (Priority: P2)

**Goal**: 결과 보고 후 방이 CLOSED 대신 WAITING으로 복귀해 재대결 가능하게 한다

**Independent Test**: 결과 보고 직후 방이 WAITING인지, 준비 상태가 초기화됐는지, 재입장 시 새 티켓을 받는지 확인(quickstart.md §6)

> US4(T034~T035)에서 구현하는 `reportResult()`에 이어붙는 스토리다.

### Tests for User Story 5

- [ ] T037 [P] [US5] `game/service/GameRoomServiceTest.java`에 "결과 보고 후 두 참가자 모두 남아있으면 WAITING 복귀 + ready 초기화 + 인원 유지" 케이스 추가(FR-013)
- [ ] T038 [P] [US5] `game/service/GameRoomServiceTest.java`에 "상대방이 결과 보고 전 명시적으로 leave() → 방 CLOSED → 이후 결과 보고는 409로 거부" 케이스 추가(FR-014, data-model.md 상태 전이 변경분)

### Implementation for User Story 5

- [ ] T039 [US5] `game/service/GameRoomService.java`의 `reportResult()`에서 `room.close()` 대신, 두 참가자가 모두 남아있으면 `WAITING` 전환 + 양쪽 `ready` 플래그 초기화(FR-013) — 참가자가 1명뿐이면 기존 `leave()`의 거부 규칙이 이미 앞단(`room.getStatus() != IN_PROGRESS` 체크)에서 걸러지므로 별도 분기 불필요(FR-014)
- [ ] T040 [US5] `game/service/GameRoomService.java`의 재입장(`join`) 로직이 WAITING 복귀 후에도 새 `realtimeTicket`을 발급하는지 확인 — US1(T017)의 티켓 발급 로직 재사용 여부 검증(FR-016)
- [ ] T041 [US5] 방이 WAITING으로 복귀하면 로비 실시간 목록에도 다시 노출되는지 확인 — `LobbyBroadcastService.broadcastUpdate()`가 결과 보고 커밋 직후에도 호출되는지 반영(FR-015, SC-006)

**Checkpoint**: 재대결 흐름(결과 보고 → WAITING → 재입장 → 재준비 → 재시작)이 완결된다

---

## Phase 8: User Story 10 - 준비 상태 변경이 상대방에게 실시간으로 전달된다 (Priority: P1)

**Goal**: 준비 상태 변경을 REST 응답이 아니라 WebSocket으로 상대방에게 즉시 통보한다

**Independent Test**: 한쪽이 준비 상태를 바꾸면 상대방이 별도 조회 없이 실시간으로 통보받는지 확인(quickstart.md §2)

### Tests for User Story 10

- [ ] T042 [P] [US10] `game/realtime/GameRoomWebSocketHandlerTest.java` 또는 `GameRoomServiceTest.java`에 "준비 상태 변경 시 상대방에게 PEER_READY_CHANGED 통보" 케이스 추가(FR-030)
- [ ] T043 [P] [US10] "상대방 실시간 연결이 없어도 준비 상태 변경 API 자체는 성공" 케이스 추가(FR-031)

### Implementation for User Story 10

- [ ] T044 [US10] `game/service/GameRoomService.java`의 `setReady()`가 커밋 직후(`afterCommit`) `RoomRealtimeNotifier.notifyReadyChanged(roomId, userId, isReady)`를 호출하도록 반영(research.md #2, T012에서 추가한 메서드 사용)
- [ ] T045 [US10] `WebSocketRoomRealtimeNotifier`의 `notifyReadyChanged` 구현이 기존 `sendToOthers` 헬퍼(요청자 본인 제외, 세션 없음/닫힘 방어 포함)를 재사용하는지 확인(FR-031)

**Checkpoint**: 준비 상태 변경이 상대방에게 1초 이내 실시간 통보된다(SC-009)

---

## Phase 9: User Story 8 - 테트리스 솔로는 방/실시간 연결 없이 결과만 보고하면 끝난다 (Priority: P1)

**Goal**: 게임방 개념과 완전히 무관한 솔로 결과 보고 API 하나만 제공한다

**Independent Test**: 방 생성이나 실시간 연결 없이 점수 보고 API만 호출해도 결과가 기록되는지 확인(quickstart.md §8)

> Foundational 단계(T005~T007)에서 만든 `GameResult`/`GameResultRepository`를 그대로 재사용한다.

### Tests for User Story 8

- [ ] T046 [P] [US8] `gameresult/` 테스트 패키지에 `SoloResultControllerTest`(또는 `SoloResultServiceTest`) 생성 — "점수 보고만으로 201 + 결과 기록" 케이스(FR-028, SC-007)
- [ ] T047 [P] [US8] "동일 사용자가 짧은 시간에 여러 번 보고해도 각각 개별 기록" 케이스 추가(중복 방지 없음, spec.md Assumptions)

### Implementation for User Story 8

- [ ] T048 [P] [US8] `gameresult/dto/SoloResultRequest.java` 생성(`score`, `@Min(0)`)
- [ ] T049 [P] [US8] `gameresult/dto/SoloResultResponse.java` 생성(`resultId`, `score`)
- [ ] T050 [US8] `gameresult/service/SoloResultService.java` 생성 — 검증·중복 방지 없이 `GameResultRepository.save(new GameResult(userId, TETRIS_SOLO, score))`만 호출(FR-027/028, research.md #9)
- [ ] T051 [US8] `gameresult/controller/SoloResultController.java` 생성 — `POST /solo-results`(JWT 인증, contracts/solo-results-api.yaml)

**Checkpoint**: 솔로 모드가 방/실시간 연결 없이 결과 보고 API 하나만으로 완결된다

---

## Phase 10: User Story 9 - 랭킹은 게임 종류별로 완전히 분리되어 보여진다 (Priority: P2)

**Goal**: 세 게임 종류(지문자 1:1 대전/테트리스 대전/테트리스 솔로)가 완전히 독립된 랭킹을 가지며, 대전은 승수(동률 시 패수), 솔로는 최고 점수 기준으로 정렬된다

**Independent Test**: 게임 종류별로 랭킹을 조회했을 때 다른 종류의 결과가 섞이지 않는지, 동률 처리와 최고 점수 집계가 올바른지 확인(quickstart.md §9)

> US4(T035)에서 대전 모드가, US8(T050)에서 솔로가 이미 `game_results`에 기록을 남기고 있어야 랭킹 조회 결과가 의미 있다.

### Tests for User Story 9

- [ ] T052 [P] [US9] `ranking/service/RankingServiceTest.java`에 "gameType 파라미터 없으면 400" 케이스 추가(FR-025)
- [ ] T053 [P] [US9] `ranking/service/RankingServiceTest.java`에 "게임 종류별 완전 분리(한 종류 결과가 다른 종류에 영향 없음)" 케이스 추가(FR-025, SC-008)
- [ ] T054 [P] [US9] `ranking/service/RankingServiceTest.java`에 "승수 동률 시 패수 오름차순 2차 정렬" 케이스 추가(FR-026, research.md #5)
- [ ] T055 [P] [US9] `ranking/service/RankingServiceTest.java`에 "솔로는 MAX(score) 기준 정렬" 케이스 추가(FR-029)
- [ ] T056 [P] [US9] `ranking/service/RankingServiceTest.java`에 "한 번도 플레이하지 않은 게임 종류 조회 시 me: null" 케이스 추가(US9 AC4)

### Implementation for User Story 9

- [ ] T057 [US9] `ranking/controller/RankingController.java`가 `gameType` 쿼리 파라미터를 필수로 받도록 변경(누락 시 400, FR-025, contracts/ranking-api-delta.yaml)
- [ ] T058 [US9] `gameresult/repository/GameResultRepository.java`에 대전 모드 집계 쿼리 추가 — `game_type` 필터, `SUM(score)`(승수) DESC, 동률 시 `COUNT(*) - SUM(score)`(패수) ASC 정렬로 Top 5 조회(FR-026, data-model.md 집계 규칙)
- [ ] T059 [US9] `gameresult/repository/GameResultRepository.java`에 솔로 집계 쿼리 추가 — `game_type='TETRIS_SOLO'` 필터, `MAX(score)` DESC Top 5 조회(FR-029)
- [ ] T060 [US9] `ranking/service/RankingService.java`를 재작성 — `users.win_count`/`loss_count` 대신 `GameResultRepository`의 집계 쿼리 사용, 탈퇴 사용자 제외 조건 유지(research.md #5/#7)
- [ ] T061 [US9] `ranking/dto/RankingResponse.java`의 `me`를 nullable로 변경 — 요청자가 해당 게임 종류를 한 번도 플레이하지 않았으면 `null` 반환(US9 AC4, research.md #10)

**Checkpoint**: 세 게임 종류의 랭킹이 완전히 독립적으로 조회되고, 동률 처리가 기존 001 규칙과 동일하게 동작한다

---

## Phase 11: `users.win_count`/`loss_count` 마이그레이션 및 `game_sessions` 제거 (FR-032, 회귀 없음 필수)

**Purpose**: 기존 데이터를 새 공통 구조로 옮기고, write-only였던 `game_sessions`를 완전히 제거한다 — US4/US9 구현이 끝나 `game_results` 스키마·집계 쿼리가 안정된 뒤에 진행한다

**⚠️ CRITICAL**: 이 단계는 US4(Phase 6)와 US9(Phase 10)가 모두 완료된 뒤에만 실행한다 — 마이그레이션이 참조하는 `game_results` 집계 로직이 그 전에 확정되어 있어야 한다

- [ ] T062 스키마 변경 SQL 작성(`src/main/resources/schema/03_migrate_win_count_to_game_results.sql`) — `win_count`만큼 `score=1` 행을, `loss_count`만큼 `score=0` 행을 사용자별로 반복 삽입(research.md #6 — 단일 스냅샷이 아니라 승/패 횟수와 행 개수가 1:1 일치해야 `COUNT(*)-SUM(score)` 공식이 정확함)
- [ ] T063 스키마 변경 SQL 작성(`src/main/resources/schema/04_drop_game_sessions_and_users_counters.sql`) — `DROP TABLE game_sessions`, `ALTER TABLE users DROP COLUMN win_count, DROP COLUMN loss_count`(data-model.md, research.md #8, 반드시 T062 이후 실행)
- [ ] T064 [P] `game/domain/GameSession.java`, `game/repository/GameSessionRepository.java` 삭제(research.md #8)
- [ ] T065 마이그레이션 후 `RankingService`(T060)와 `GameRoomService.reportResult()`(T034/T035)가 더 이상 `win_count`/`loss_count`/`GameSession`을 참조하지 않는지 전수 확인(research.md #7)

**Checkpoint**: 레거시 컬럼·테이블이 완전히 제거되고 마이그레이션 데이터가 새 랭킹 집계와 정확히 일치한다(SC-005/SC-008 회귀 없음)

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: 여러 스토리에 걸친 마무리 검증

- [ ] T066 [P] quickstart.md 전체(§1~§9)를 처음부터 끝까지 순서대로 수동 실행해 모든 기대 결과가 성립하는지 확인
- [ ] T067 [P] 002 quickstart §1~§16(Part A/기존 실시간 기능) 회귀를 재실행해 이번 변경으로 깨진 것이 없는지 확인(quickstart.md "참고" 섹션)
- [ ] T068 `.specify`/Jira 동기화 — 완료된 태스크에 대응하는 Jira 서브태스크 상태를 갱신한다(이 프로젝트의 기존 관례)
- [ ] T069 [P] ArchUnit 규칙(STABLE-08-11)이 이미 적용되어 있다면 `GameResultRepository`를 3개 서비스가 공유하는 구조에 대한 예외를 등록하거나 규칙을 조정한다(plan.md Structure Decision)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: 선행 없음 — 즉시 시작. 모든 User Story를 막는다
- **User Stories (Phase 2~10)**: Foundational 완료 후 시작 가능. 우선순위(P1 먼저) 또는 병렬 진행 모두 가능하나, 아래 "스토리 간 의존"에 유의
- **Phase 11(마이그레이션/game_sessions 제거)**: US4(Phase 6) + US9(Phase 10) 완료 후에만 진행
- **Polish (Phase 12)**: 원하는 모든 스토리 + Phase 11 완료 후

### User Story Dependencies

- **US1(P1, Phase 2)**: Foundational 이후 바로 시작 가능 — 다른 스토리 의존 없음. **MVP**
- **US2(P1, Phase 3)**: Foundational 이후 시작 가능 — US1과 독립적이나 실제 흐름상 US1 이후 검증하는 게 자연스러움
- **US3(P2, Phase 4)**: US1·US2 완료 후 진행하는 회귀 검증 스토리(신규 코드 없음)
- **US6(P1, Phase 5)**: US1(T015~T018의 gameType 배관)에 의존 — 로비 노출만 추가
- **US4(P1, Phase 6)**: Foundational(GameResult 엔티티) 이후 시작 가능 — US1/US6과 독립적으로 구현 가능
- **US5(P2, Phase 7)**: US4의 `reportResult()`(T034/T035)에 이어붙는 스토리 — US4 완료 후 진행
- **US10(P1, Phase 8)**: Foundational(T012 notifyReadyChanged) 이후 시작 가능 — 다른 스토리 독립
- **US8(P1, Phase 9)**: Foundational(GameResult/GameResultRepository) 이후 시작 가능 — 게임방 도메인과 완전히 독립
- **US9(P2, Phase 10)**: US4(대전 기록)와 US8(솔로 기록)이 남기는 `game_results` 데이터에 의존 — 두 스토리 완료 후 의미 있는 검증 가능(코드 자체는 더 일찍 작성 가능하나 통합 검증은 이후)
- **Phase 11**: US4 + US9 완료 후에만(마이그레이션이 집계 로직 확정을 전제로 함)

### Parallel Opportunities

- Foundational 내 T004~T007(엔티티·저장소)은 서로 다른 파일이라 병렬 가능
- Foundational 완료 후 US1/US4/US8/US10은 서로 다른 파일이라 병렬 착수 가능(US2/US6/US5/US9는 각각 US1/US4에 이어지므로 순서 고려)
- 각 스토리 내 [P] 표시된 테스트·DTO·엔티티 태스크는 서로 다른 파일이라 병렬 가능

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1(Foundational) 완료
2. Phase 2(US1) 완료 → 독립 검증(quickstart.md §1)
3. 배포/데모 가능

### Incremental Delivery

1. Foundational → 기반 준비
2. US1 → 검증 → 배포(MVP)
3. US2 → 검증 → 배포(영상 통화 전환 안전 정리)
4. US6 → 검증 → 배포(게임 종류 구분)
5. US4 → 검증 → 배포(결과 보고)
6. US5 → 검증 → 배포(재대결)
7. US10 → 검증 → 배포(준비 상태 실시간 통보)
8. US8 → 검증 → 배포(솔로 모드)
9. US9 → 검증 → 배포(랭킹 분리)
10. Phase 11(레거시 제거) → Phase 12(Polish)

---

## Notes

- [P] 태스크 = 서로 다른 파일, 선행 의존 없음
- [Story] 라벨은 태스크를 특정 User Story에 매핑해 추적성을 준다
- Phase 11(마이그레이션/`game_sessions` 삭제)는 되돌리기 어려운 파괴적 스키마 변경이므로 US4/US9가 안정된 뒤 마지막에 배치했다 — 순서를 앞당기지 말 것
- `game_sessions`를 참조하던 기존 코드(`GameRoomService.reportResult()`)가 새 로직(US4)으로 완전히 대체된 뒤에 테이블을 드롭해야 한다(data-model.md "순서 주의")
