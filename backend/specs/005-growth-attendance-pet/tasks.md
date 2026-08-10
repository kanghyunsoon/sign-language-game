# Tasks: 출석 및 펫 성장

**Input**: Design documents from `backend/specs/005-growth-attendance-pet/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: 명세의 경계값·동시성·원자성·OpenAPI·마이그레이션 성공 기준을 검증하기 위해 테스트 작업을 포함한다.

**Organization**: 공통 스키마 정리를 먼저 수행하고, 사용자 스토리별로 독립 검증 가능한 구현을 진행한다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일을 다루며 선행 작업 완료 후 병렬 실행 가능
- **[Story]**: spec.md의 사용자 스토리
- 모든 경로는 저장소 루트 기준

## Phase 1: Setup

**Purpose**: 생성 산출물이 구현 변경과 섞이지 않도록 저장소 기본 상태를 정리한다.

- [X] T001 Java/Gradle 생성물인 `backend/suhwa/bin/`, `backend/suhwa/build/`, `backend/suhwa/.gradle/`이 추적되지 않도록 `.gitignore`를 검증하고 누락 패턴을 추가한다

---

## Phase 2: Foundational - 스키마·공통 모델 정리

**Purpose**: 제거하기로 한 연습·솔로 세션 구조와 `duration_ms` 의존성을 없애 모든 사용자 스토리의 공통 기반을 확정한다.

**⚠️ CRITICAL**: 이 단계가 끝나기 전에는 활동 보상과 랭킹 구현을 완료할 수 없다.

- [ ] T002 [P] V7→V8에서 `play_duration_ms` 올림 변환, 솔로 행 수 보존, 제거 테이블·컬럼 부재를 검증하는 테스트를 `backend/suhwa/src/test/java/backend/ssafy/suhwa/common/migration/FlywayMigrationTest.java`에 먼저 작성한다
- [ ] T003 T002를 통과하도록 `backend/suhwa/src/main/resources/db/migration/V8__remove_obsolete_activity_sessions.sql`에 솔로 시간의 초 단위 `score` 이관과 `practice_sessions`, `solo_sessions`, `solo_session_symbols`, `solo_symbol_statistics`, `solo_session_id`, `play_duration_ms` 제거를 구현한다
- [ ] T004 [P] `backend/suhwa/src/main/java/backend/ssafy/suhwa/gameresult/domain/GameResult.java`에서 `soloSessionId`, `playDurationMs`를 제거하고 `userId`, `gameType`, `score`, `recordedAt` 모델만 유지한다
- [ ] T005 [P] 연습 시작·완료 메서드와 의존성을 `backend/suhwa/src/main/java/backend/ssafy/suhwa/learning/controller/LearningApi.java`, `backend/suhwa/src/main/java/backend/ssafy/suhwa/learning/controller/LearningController.java`에서 제거하고 `PracticeSession` domain/repository/service/dto 파일을 삭제한다
- [ ] T006 T004 이후 `backend/suhwa/src/main/java/backend/ssafy/suhwa/gameresult/`의 `SoloSession`, `SoloSessionSymbol`, `SoloSymbolStatistic` domain/repository/service/controller/dto 파일과 참조를 삭제한다
- [ ] T007 [P] `backend/suhwa/src/main/java/backend/ssafy/suhwa/growth/config/GrowthPolicyProperties.java`와 `backend/suhwa/src/main/resources/application.yaml`에서 연습 XP를 제거하고 솔로 `score` 경계 60·90·120과 XP 15·10·5를 명시한다

**Checkpoint**: 애플리케이션이 연습·솔로 세션 타입과 별도 시간 필드 없이 컴파일된다.

---

## Phase 3: User Story 1 - 하루 출석과 연속 출석 (Priority: P1) 🎯 MVP

**Goal**: 사용자는 하루 한 번 출석하고 연속 출석 일수와 XP 3이 반영된 펫 상태를 확인한다.

**Independent Test**: 첫 출석, 같은 날 재요청, 연속 날짜, 결석 후 재시작과 동시 요청에서 출석 행과 XP가 정확히 한 번 반영된다.

### Tests for User Story 1

- [ ] T008 [US1] KST 날짜 경계, 최초 XP 3, 같은 날 재요청 무보상과 동시 출석을 `backend/suhwa/src/test/java/backend/ssafy/suhwa/growth/service/AttendanceServiceTest.java` 및 `backend/suhwa/src/test/java/backend/ssafy/suhwa/growth/AttendanceIntegrationTest.java`에서 검증한다

### Implementation for User Story 1

- [ ] T009 [US1] T008을 통과하도록 `backend/suhwa/src/main/java/backend/ssafy/suhwa/growth/service/AttendanceService.java`의 날짜별 고유 처리, streak 계산, 펫 잠금과 XP 지급을 보완한다
- [ ] T010 [US1] 출석 조회·완료 응답과 외부 연동 설명을 `backend/suhwa/src/main/java/backend/ssafy/suhwa/growth/controller/GrowthApi.java`, `backend/suhwa/src/main/java/backend/ssafy/suhwa/growth/dto/AttendanceResponse.java`, `backend/suhwa/src/main/java/backend/ssafy/suhwa/growth/dto/AttendanceCompletionResponse.java`에 맞추고 `GrowthControllerTest.java`로 검증한다

**Checkpoint**: User Story 1을 다른 활동 없이 독립적으로 시연할 수 있다.

---

## Phase 4: User Story 2 - 활동 보상으로 펫 성장 (Priority: P1)

**Goal**: 테스트·솔로·1대1 결과가 명세의 경험치로 `user_pets.exp`에 원자적으로 누적되고, 솔로 랭킹이 초 단위 최소 `score`와 공동 순위를 사용한다.

**Independent Test**: 테스트 79/80%, 솔로 60/61/90/91/120/121초, 대전 승·패·무승부 경계와 솔로 공동 순위에서 저장 결과와 펫 상태가 예상값과 일치한다.

### Tests for User Story 2

- [ ] T011 [P] [US2] 솔로 `score` 60/61/90/91/120/121의 XP 15/10/5/0 경계와 최대 레벨 무변경을 `backend/suhwa/src/test/java/backend/ssafy/suhwa/gameresult/service/SoloResultServiceTest.java`에 먼저 작성한다
- [ ] T012 [P] [US2] 솔로 결과 저장과 `user_pets.exp`가 함께 커밋·롤백되는 통합 테스트를 `backend/suhwa/src/test/java/backend/ssafy/suhwa/growth/GrowthRewardIntegrationTest.java`에 먼저 작성한다
- [ ] T013 [P] [US2] 사용자별 `MIN(score)`, 오름차순, `1,1,3` 공동 순위, Top 5와 `me`를 `backend/suhwa/src/test/java/backend/ssafy/suhwa/ranking/service/RankingServiceTest.java` 및 `backend/suhwa/src/test/java/backend/ssafy/suhwa/ranking/RankingIntegrationTest.java`에 먼저 작성한다
- [ ] T014 [P] [US2] 테스트 정답률 79/80%, 동일 결과 재전송과 다른 결과 충돌을 `backend/suhwa/src/test/java/backend/ssafy/suhwa/learning/service/TestSessionServiceTest.java`에 검증한다
- [ ] T015 [P] [US2] 대전 승자 XP 10·패자 XP 3, 무승부·무효 종료 무보상과 중복 결과 방지를 `backend/suhwa/src/test/java/backend/ssafy/suhwa/gameresult/GameResultIntegrityTest.java` 및 `backend/suhwa/src/test/java/backend/ssafy/suhwa/game/service/GameRoomServiceTest.java`에 검증한다

### Implementation for User Story 2

- [ ] T016 [US2] T011·T012를 통과하도록 `backend/suhwa/src/main/java/backend/ssafy/suhwa/gameresult/service/SoloResultService.java`에서 결과 저장, 펫 잠금과 `score` 구간별 XP 지급을 하나의 트랜잭션으로 구현한다
- [ ] T017 [US2] 솔로 입력·응답의 초 단위 의미와 검증을 `backend/suhwa/src/main/java/backend/ssafy/suhwa/gameresult/dto/SoloResultRequest.java`, `SoloResultResponse.java`, `controller/SoloResultApi.java`에 반영하고 `SoloResultControllerTest.java`를 갱신한다
- [ ] T018 [US2] 사용자별 솔로 최소 점수 집계를 `backend/suhwa/src/main/java/backend/ssafy/suhwa/gameresult/repository/GameResultRepository.java`와 필요한 projection 타입에 구현한다
- [ ] T019 [US2] T013을 통과하도록 `backend/suhwa/src/main/java/backend/ssafy/suhwa/ranking/service/RankingService.java`를 최소 `score` 오름차순·공동 순위로 변경하고 `ranking/dto/RankingEntry.java`, `RankingResponse.java`에서 `playDurationMs`를 제거한다
- [ ] T020 [US2] 솔로와 대전 `score` 의미, Top 5와 공동 순위를 `backend/suhwa/src/main/java/backend/ssafy/suhwa/ranking/controller/RankingApi.java`에 문서화하고 `RankingControllerTest.java`를 갱신한다
- [ ] T021 [US2] T014를 통과하도록 `backend/suhwa/src/main/java/backend/ssafy/suhwa/learning/domain/TestSession.java`와 `learning/service/TestSessionService.java`의 80% 판정·최초 완료 보상을 보완한다
- [ ] T022 [US2] T015를 통과하도록 `backend/suhwa/src/main/java/backend/ssafy/suhwa/gameresult/service/GameResultService.java`와 `game/service/GameRoomService.java`의 승·패 결과 저장과 XP 10·3 원자성을 보완한다
- [ ] T023 [US2] 삭제된 연습·솔로 세션 테스트를 제거하고 유효한 활동 보상 테스트로 대체하도록 `backend/suhwa/src/test/java/backend/ssafy/suhwa/learning/`, `gameresult/`, `growth/GrowthRewardIntegrationTest.java`를 정리한다
- [ ] T024 [US2] 외부 연동에 필요한 활동 API만 노출하도록 `backend/suhwa/src/main/java/backend/ssafy/suhwa/common/config/OpenApiConfig.java`와 각 Api/DTO의 Swagger 설명을 정리하고 `OpenApiConfigTest.java`에서 연습·솔로 세션 경로 부재를 검증한다
- [ ] T025 [US2] 실제 Swagger와 목표 계약이 일치하도록 `backend/specs/005-growth-attendance-pet/contracts/activity-reward-api-delta.yaml` 및 `backend/specs/005-growth-attendance-pet/contracts/growth-api.yaml`을 최종 구현에 맞춰 갱신한다

**Checkpoint**: 모든 활동 보상과 솔로 랭킹을 User Story 1과 독립적으로 검증할 수 있다.

---

## Phase 5: User Story 3 - 펫 레벨과 진화 상태 조회 (Priority: P2)

**Goal**: 사용자는 이름 없는 단일 펫의 레벨, XP, 다음 레벨까지 XP와 5단계 자동 진화를 조회한다.

**Independent Test**: 레벨 1·5·10·15·20, XP 20 경계, 다중 레벨 상승, 기존 10레벨 펫과 최대 레벨 상태의 응답이 예상값과 일치한다.

### Tests for User Story 3

- [ ] T026 [P] [US3] XP 20 경계, 다중 레벨 상승, 5·10·15·20 진화, 19→20 초과 XP 제거와 기존 10레벨 재성장을 `backend/suhwa/src/test/java/backend/ssafy/suhwa/growth/domain/UserPetTest.java` 및 `growth/service/PetGrowthServiceTest.java`에 검증한다
- [ ] T027 [P] [US3] 펫 상태 응답의 단계·잔여 XP·최대 레벨 null 규칙을 `backend/suhwa/src/test/java/backend/ssafy/suhwa/growth/service/PetQueryServiceTest.java` 및 `growth/controller/GrowthControllerTest.java`에 검증한다

### Implementation for User Story 3

- [ ] T028 [US3] T026을 통과하도록 `backend/suhwa/src/main/java/backend/ssafy/suhwa/growth/domain/UserPet.java`, `EvolutionStage.java`, `growth/service/PetGrowthService.java`에 최대 20레벨과 5단계 계산을 확정한다
- [ ] T029 [US3] T027을 통과하도록 `backend/suhwa/src/main/java/backend/ssafy/suhwa/growth/service/PetQueryService.java`, `growth/dto/PetStatusResponse.java`, `growth/controller/GrowthApi.java`의 조회 응답과 Swagger 필드 설명을 확정한다

**Checkpoint**: 모든 사용자 스토리가 독립적으로 동작하고 펫 상태가 최신 보상을 반영한다.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 최종 스키마, 문서, 정합성 진단과 전체 회귀를 검증한다.

- [ ] T030 [P] `game_type`별 `score` 규칙과 제거된 필드 부재를 점검하도록 `backend/suhwa/src/main/resources/db/queries/game_results_integrity.sql`을 갱신한다
- [ ] T031 [P] 삭제된 타입·경로·`playDurationMs`·`practiceExp` 참조가 남지 않았는지 `backend/suhwa/src/main/`, `backend/suhwa/src/test/`, `backend/specs/005-growth-attendance-pet/contracts/`를 정적 검색하고 발견된 참조를 제거한다
- [ ] T032 H2 환경에서 `backend/suhwa`의 `./gradlew.bat test` 전체 테스트를 실행하고 실패를 수정한다
- [ ] T033 Docker 가능 환경에서 `backend/suhwa`의 `./gradlew.bat benchmark`를 실행해 V1→V8·V7→V8 MySQL 마이그레이션과 랭킹 집계를 검증하고 `backend/specs/005-growth-attendance-pet/quickstart.md`의 완료 판정을 갱신한다

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup** → 즉시 시작
- **Phase 2 Foundational** → Phase 1 이후, 모든 스토리를 차단
- **US1** → Foundational 이후 독립 실행 가능
- **US2** → Foundational 이후 실행, 솔로·랭킹·테스트·대전 테스트를 먼저 작성
- **US3** → Foundational 이후 실행 가능하나 최종 상태 검증은 US2 이후 권장
- **Polish** → 선택한 모든 사용자 스토리 완료 후 실행

### User Story Dependency Graph

```text
Setup
  └─ Foundational
      ├─ US1 출석 ──────────┐
      ├─ US2 활동 보상·랭킹 ├─ Polish
      └─ US3 펫 상태 ───────┘
```

### Parallel Opportunities

- T002, T004, T005, T007은 서로 다른 공통 파일에서 병렬 진행 가능하다.
- US2의 T011~T015는 서로 다른 도메인 테스트이므로 병렬 작성 가능하다.
- US3의 T026과 T027은 도메인 성장과 조회 계약을 병렬 검증할 수 있다.
- T030과 T031은 구현 완료 후 병렬 점검 가능하다.

## Parallel Examples

### User Story 2

```text
Task: T011 솔로 XP 경계 테스트
Task: T013 솔로 랭킹 공동 순위 테스트
Task: T014 테스트 80% 보상 테스트
Task: T015 대전 승·패 보상 테스트
```

### User Story 3

```text
Task: T026 UserPet 레벨·진화 도메인 테스트
Task: T027 PetStatus 조회·Controller 테스트
```

## Implementation Strategy

### MVP First

1. Phase 1 Setup
2. Phase 2 Foundational
3. Phase 3 User Story 1
4. 출석과 펫 XP 3을 독립 검증

### Full Increment

1. MVP 출석 완료
2. US2에서 테스트·솔로·대전 보상과 랭킹 완성
3. US3에서 20레벨·5단계 상태 조회 확정
4. 전체 테스트와 MySQL 마이그레이션 검증

## Notes

- 테스트 작업을 먼저 실행해 실패를 확인한 뒤 대응 구현을 진행한다.
- 기존 V6/V7 마이그레이션은 수정하지 않는다.
- 사용자 작업이 이미 존재하는 파일은 관련 변경을 보존하며 필요한 부분만 수정한다.
- 완료한 작업은 즉시 `[X]`로 표시한다.
