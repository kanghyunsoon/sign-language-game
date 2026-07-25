# Feature Specification: Backend Refactoring & Hardening Backlog

**Feature Branch**: `004-backend-refactoring-hardening`

**Created**: 2026-07-24

**Status**: Draft

**Input**: User description: "지금까지 지라에서 가져온 스토리, 서브테스크들에 대한 Spec문서를 작성해줘"

> 이 스펙은 기능 신규 개발이 아니라, 지라에 리팩토링용으로 남겨둔 **"진행 중" 상태의 리팩토링 스토리와 그 하위 작업**을 하나의 작업 단위로 묶어 문서화한 것이다. 대응 지라 항목: 에픽 Backend-00/01/02/03/05/08 아래의 USER-01-05~09·11~13, LEARN-01-02, TEST-01-04~05, GAME-02-13~16, GAME-02-21, RANK-01-04, STABLE-08-09~16. (USER-01-10 Refresh Token 재사용 탐지/정리 배치와 RANK-01-03 랭킹 Top-5 캐시는 현 규모에서 제외 — 하단 "범위 제외" 참조. USER-01-06 `RefreshTokenService` 추출은 단순 구조 리팩토링이라 포함)

## User Scenarios & Testing *(mandatory)*

<!-- "사용자"는 대개 서비스 최종 사용자지만, 리팩토링 백로그이므로 일부 스토리는 운영자/개발팀을 수혜자로 한다. 각 스토리는 독립적으로 개발·검증·배포 가능하다. -->

### User Story 1 - 인증·회원 도메인 정확성 및 안전성 보강 (Priority: P1)

회원가입/로그인/탈퇴를 사용하는 사용자로서, 경계 상황(익명 접근, 초장문 비밀번호, 탈퇴 직후 재요청)에서도 예측 가능한 오류 응답과 일관된 "활성 사용자" 판정을 받고 싶다.

**Why this priority**: 인증은 모든 기능의 진입점이며, 500 오류·도달 불가능 코드는 보안/신뢰와 직결된다. (USER-01-05·06·07·08·09·11·12·13)

**Independent Test**: 인증 모듈만 두고 익명 인증·비밀번호 상한·탈퇴 후 AT 지연·soft delete 판정·서비스 분리 후 동작 동일성을 각각 시나리오로 검증할 수 있다.

**Acceptance Scenarios**:

1. **Given** 익명(미인증) 요청, **When** 인증이 필요한 자원에 접근, **Then** 500이 아니라 정의된 인증 실패 응답이 반환된다.
2. **Given** 허용 상한을 초과한 비밀번호, **When** 회원가입/변경 요청, **Then** 검증 오류로 거부된다.
3. **Given** 탈퇴(soft delete)된 계정, **When** "활성 사용자" 판정이 필요한 모든 경로, **Then** 단일 통합 기준으로 비활성 처리되며 도달 불가능한 `ACCOUNT_WITHDRAWN` 분기는 존재하지 않는다.
4. **Given** 갱신 토큰 책임이 `RefreshTokenService`로 분리된 뒤, **When** 로그인/갱신/로그아웃, **Then** 분리 이전과 관찰 가능한 동작이 동일하다. (FR-002)
5. **Given** 로그아웃/탈퇴 직후 아직 만료되지 않은 Access Token, **When** 유효 지연 구간 동안 요청, **Then** 그 동작이 문서에 정의된 대로 예측 가능하게 처리된다. (FR-006)

---

### User Story 2 - 게임방 동시성 안전성 및 결과 정합성 (Priority: P1)

대전 게임을 하는 사용자로서, 동시 요청·결과 보고·방 정리 과정에서 데드락이나 결과 유실 없이 내 전적이 정확히 기록되기를 원한다.

**Why this priority**: 데드락·결과 누락은 사용자 신뢰와 랭킹 정확성을 직접 훼손하며, 방 정리·코드 생성의 견고성도 게임방 도메인 안정성에 포함된다. (GAME-02-13~16)

**Independent Test**: 게임방 서비스에 동시 `reportResult`/`leave`를 주입해 잠금 순서 고정과 `game_results` 정합성 검증 쿼리를 확인하고, 대량 방 정리와 코드 생성 실패 경로를 별도로 검증한다.

**Acceptance Scenarios**:

1. **Given** 두 참가자가 동시에 결과 보고, **When** `reportResult`가 병렬 실행, **Then** 고정된 잠금 순서로 데드락 없이 정확히 1건만 확정된다.
2. **Given** 게임 종료, **When** 결과가 저장, **Then** 스키마 보강과 검증 쿼리로 누락/중복 없이 기록된다.
3. **Given** 정리 대상 방이 다수, **When** 정리 스케줄러 실행, **Then** N+1 DELETE가 아닌 단일 벌크 DML로 처리되어 대량에서도 지연이 없다. (FR-013)
4. **Given** 게임방 코드 생성이 반복 충돌로 실패, **When** 생성 시도, **Then** 표준 예외가 아닌 도메인 커스텀 예외로 식별 가능하게 처리된다. (FR-014)

---

### User Story 3 - 입장 실시간 신호 전파 (Priority: P2)

방에 먼저 들어와 있는 사용자로서, 상대방이 입장해 실시간 연결을 맺는 순간을 폴링 없이 즉시 알고 싶다.

**Why this priority**: 후속 WebRTC 연결/화면 갱신 트리거의 공백을 메운다. (GAME-02-21)

**Independent Test**: 신규 참가자 WS 최초 연결 시 상대 세션이 입장 신호를 수신하는지, 재접속과 혼동되지 않는지 통합 테스트한다.

**Acceptance Scenarios**:

1. **Given** 방에 한 명이 연결된 상태, **When** 신규 참가자가 최초로 WS 연결, **Then** 기존 참가자에게 즉시 입장 신호가 전달된다.
2. **Given** 상대 연결이 없거나 끊긴 상태, **When** 입장 발생, **Then** 통보 실패가 연결 수립을 실패시키지 않는다.

---

### User Story 4 - 조회 성능 최적화 (쿼리/캐시/인덱스) (Priority: P2)

사용자로서, 오답노트·랭킹·학습 콘텐츠 조회가 데이터가 늘어도 빠르게 응답하기를 원한다.

**Why this priority**: 반복 조회 경로의 응답성과 DB 부하를 개선한다. (TEST-01-04~05, LEARN-01-02, RANK-01-04)

**Independent Test**: 각 조회를 단일 쿼리/캐시/인덱스 적용 전후로 쿼리 수·응답시간을 비교한다.

**Acceptance Scenarios**:

1. **Given** 오답노트 조회, **When** 요청, **Then** 2쿼리+인메모리 조인이 아니라 DTO 프로젝션 단일 쿼리로 처리된다.
2. **Given** 랭킹 Top-5 조회, **When** 요청, **Then** 복합 인덱스를 사용해 빠르게 응답한다. (캐시는 적용하지 않음 — 범위 제외 참조)
3. **Given** 카테고리별 지문자 콘텐츠 조회, **When** 반복 요청, **Then** 로컬 캐시로 응답한다.
4. **Given** 연관관계 없는 엔티티에 걸쳐 있던 오답노트 조회, **When** 요청, **Then** ad-hoc JPQL JOIN이 정리된 일관 패턴으로 처리된다. (FR-010)

---

### User Story 5 - 운영 안정성 및 유지보수성 기반 정비 (Priority: P3)

운영자·개발팀으로서, 스키마 이력 관리·모듈 경계·타임아웃·커넥션 풀·예외 처리·CORS 미설정 동작이 명시적으로 정의되어 장애와 회귀를 예방하기를 원한다.

**Why this priority**: 직접적 기능 변화는 없지만 장기 안정성과 배포 안전성의 토대다. (STABLE-08-09~16)

**Independent Test**: Flyway 마이그레이션 적용, ArchUnit 규칙 통과, 타임아웃/풀 설정 반영, 필터체인 통합 테스트, CORS 미설정 시 정의된 동작을 각각 검증한다.

**Acceptance Scenarios**:

1. **Given** 스키마 변경, **When** 애플리케이션 기동, **Then** Flyway가 버전 순서대로 마이그레이션을 적용한다.
2. **Given** 모듈 경계 위반 코드, **When** 빌드/테스트, **Then** ArchUnit이 실패시킨다.
3. **Given** `CORS_ALLOWED_ORIGINS` 미설정, **When** 기동, **Then** 정의된 기본 동작(명시된 정책)대로 처리된다.
4. **Given** 장시간 실행 트랜잭션/쿼리, **When** 실행, **Then** 설정된 타임아웃으로 중단된다.

---

### Edge Cases

- 익명/만료 인증 컨텍스트에서 타입 캐스팅 실패가 500으로 새지 않는가?
- 탈퇴 직후에도 유효한 Access Token의 지연 유효 구간이 문서화·정의되어 있는가?
- `withdraw`의 벌크 쿼리가 flush 순서에 의존하는 지점이 명시되어 있는가?
- 정리 스케줄러의 N+1 DELETE가 단일 벌크 DML로 대체되어 대량 방에서도 지연이 없는가?
- 게임방 코드 생성 반복 실패 시 표준 예외 대신 도메인 커스텀 예외로 식별 가능한가?
- 백그라운드 정리 작업과 실시간 신호 발송이 서로를 지연시키지 않는가?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 시스템은 "활성 사용자" 판정을 단일 기준으로 통합하고 도달 불가능한 `ACCOUNT_WITHDRAWN` 분기를 제거해야 한다.
- **FR-002**: 비대해진 `AuthService`에서 갱신 토큰 관련 책임을 별도 서비스(`RefreshTokenService`)로 분리해야 한다. (구조 리팩토링 — 저장소 교체와 무관)
- **FR-003**: 비밀번호 해싱은 트랜잭션 경계 밖에서 수행되어야 한다.
- **FR-004**: 익명/미인증 컨텍스트의 타입 처리 실패가 500이 아닌 정의된 인증 실패 응답으로 이어져야 한다.
- **FR-005**: 비밀번호에 상한 길이 검증을 적용해야 한다.
- **FR-006**: 로그아웃/탈퇴 후 Access Token의 유효 지연 구간을 문서화해야 한다.
- **FR-007**: soft delete를 Hibernate 레벨에서 강제해 조회 경로에서 일관 적용되어야 한다.
- **FR-008**: 벌크 연산(`@Modifying`) 시 flush/clear 순서 의존성을 명시화해야 한다. **[검증 결과 부분 완료]** `withdraw`가 호출하는 `RefreshTokenRepository.revokeAllByUserId`는 이미 `@Modifying(clearAutomatically = true, flushAutomatically = true)`로 명시돼 있음(추가 조치 불필요). 반면 startup reconciler가 호출하는 `GameRoomRepository.closeAllActiveRooms`(상태 UPDATE)는 `clearAutomatically = true`만 있고 `flushAutomatically = true`가 없으나 — **결론: 불필요(현행 유지).** 기동 시 독립 트랜잭션에서 1회 실행되며 선행 dirty 엔티티가 없어 flush 대상이 없고, `clearAutomatically`로 stale 캐시도 방지되기 때문. (FR-013의 N+1 DELETE 대상인 `GameRoomCleanupScheduler`와는 별개 연산)
- **FR-009**: 오답노트 조회를 DTO 프로젝션 단일 쿼리로 전환해야 한다.
- **FR-010**: 연관관계 없는 엔티티 간 ad-hoc JPQL JOIN 패턴을 정리해야 한다.
- **FR-011**: 카테고리별 지문자 학습 콘텐츠에 로컬 캐시를 적용해야 한다.
- **FR-012**: `reportResult` 동시 실행의 데드락 안전성을 확보해야 한다. **[재확인 필요]** GAME-02-13 원안(host/guest `users` 행 락 순서 정렬)은 `win_count` 삭제·결과가 `game_results` INSERT 전용으로 바뀌며 대상 락이 사라져 무효화됨 — 현행 코드(`game_results` INSERT 2건 + `GameRoom.returnToWaiting()`)에서 실제 데드락/경합 지점이 있는지 재확인하고, 있으면 그에 맞게 대응한다(없으면 조치 불요).
- **FR-013**: 정리 스케줄러의 N+1 DELETE를 단일 벌크 DML로 대체해야 한다.
- **FR-014**: 게임방 코드 생성 실패를 도메인 커스텀 예외로 표현해야 한다.
- **FR-015**: 게임 결과 기록 정합성을 `game_results` 스키마 제약(중복 방지 등)과 검증 쿼리로 강화해야 한다. **[재확인 필요]** GAME-02-16 원안의 `game_sessions` 보강·`users.win_count` 파생캐시 불일치 전제는 RANK-01-02 마이그레이션(`game_sessions`·`win_count` 삭제)으로 대부분 무효화됨 — 현행 `game_results` 기준으로 남은 정합성 항목만 재확정한다.
- **FR-016**: 신규 참가자의 최초 실시간 연결 시 같은 방 상대방에게 입장 신호를 전파하되, 재접속 신호와 구분되고 통보 실패가 연결 수립을 실패시키지 않아야 한다.
- **FR-017**: 랭킹 집계 쿼리(`game_results`의 game_type별 SUM/MAX)에 필요한 인덱스를 검토·보강해야 한다. **[재확인 필요]** RANK-01-04 원안의 `users(win_count DESC, loss_count ASC)` 인덱스는 `win_count` 삭제로 무효 — 기존 `idx_game_result_type_score`/`idx_game_result_user_type`로 충분한지 실행계획으로 확인 후 필요 시 추가.
- **FR-018**: 스키마 이력 관리를 위해 Flyway를 도입해야 한다.
- **FR-019**: `CORS_ALLOWED_ORIGINS` 미설정 시 동작을 명시적으로 정의해야 한다.
- **FR-020**: 모듈 경계를 ArchUnit으로 코드에 강제해야 한다.
- **FR-021**: `spring.jpa.open-in-view`를 비활성화해야 한다.
- **FR-022**: 트랜잭션/쿼리 타임아웃을 설정해야 한다.
- **FR-023**: 커넥션 풀 / JDBC 배치 기본 튜닝을 적용해야 한다.
- **FR-024**: 예외 처리 catch-all 및 ERROR 디스패치 경로를 정리해야 한다.
- **FR-025**: 필터 체인을 켠 통합 테스트를 보강해야 한다.

> **범위 제외**:
> - USER-01-10(Refresh Token 재사용 탐지 + 만료 토큰 정리 배치) — 사용자 풀이 작은 현 시점에 진행하지 않는다. 저장소·정리 방식 변경과 얽혀 있어 규모 확장 시 재검토한다.
> - RANK-01-03(랭킹 Top-5 로컬 캐시) — 랭킹은 게임 승리마다 바뀌는 쓰기 민감 데이터이고 게임 타입별로 분리(3종)돼 무효화 복잡도가 큰 반면, 성능은 복합 인덱스(FR-017)로 충분히 해결된다. 현 규모에선 조기 최적화라 제외하며, 필요 시 짧은 TTL 기반 캐시로 재검토한다.

### Key Entities *(include if feature involves data)*

- **User(회원)**: 활성/탈퇴(soft delete) 상태, 비밀번호 해시. 활성 판정의 기준. (`win_count`/`loss_count` 카운터는 RANK-01-02 마이그레이션으로 삭제됨 — 전적은 `game_results` 집계로 산출)
- **RefreshToken(갱신 토큰)**: 발급/무효화 상태. 엔티티 자체는 변경하지 않으나, 관련 처리 책임을 `RefreshTokenService`로 분리하는 대상(FR-002). (재사용 탐지/정리 배치는 범위 제외)
- **GameResult(게임 결과)**: `game_results(user_id, game_type, score, recorded_at)` — 세 게임 종류 공통 결과 기록. 정합성 검증(FR-015)과 랭킹 집계(FR-017)의 근거. (구 `game_sessions` 테이블은 삭제됨)
- **WrongAnswerLog(오답 로그)**: 카테고리별 최근 오답. 단일 쿼리 조회 대상.
- **Content(학습 콘텐츠)**: 카테고리별 지문자 메타데이터. 캐시 대상.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 인증 관련 미인증/경계 요청에서 500 오류 발생률 0%(정의된 오류 응답으로만 반환).
- **SC-002**: 게임 결과 보고 동시성 테스트에서 데드락 0건, 결과 누락/중복 0건.
- **SC-003**: 오답노트·랭킹·콘텐츠 조회의 DB 쿼리 수와 평균 응답 시간이 개선 전 대비 감소(오답노트는 단일 쿼리로 축소).
- **SC-004**: 신규 입장 시 기존 참가자가 폴링 없이 즉시(실시간) 입장을 인지.
- **SC-005**: 모듈 경계 위반·스키마 이력 누락이 CI에서 자동 차단(ArchUnit/Flyway 통과가 기동/빌드 조건).
- **SC-006**: 대상 스토리(USER-01-10 제외)와 그 하위 작업이 완료 상태로 전환되고 회귀 테스트 통과.

## Assumptions

- 리팩토링은 기존 API 계약과 사용자 관찰 동작을 보존하며, 관찰 가능한 회귀가 없어야 한다(GAME-02-21의 신규 입장 신호는 예외적 추가).
- 단일 인스턴스 기준 실시간 상태 관리(ConcurrentHashMap) 전제를 유지한다(다중화는 범위 밖).
- Flyway 도입은 기존 스키마(v6)를 기준선으로 삼는다.
- 각 스토리는 대응 지라 항목의 하위 작업(서브태스크) 범위를 그대로 구현 단위로 사용한다.
- AI 인식/정답 판정 등 프론트엔드·AI 서버 책임 영역은 범위 밖이다.
