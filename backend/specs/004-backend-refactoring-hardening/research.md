# Phase 0 Research: Backend Refactoring & Hardening

기존 코드베이스가 확정돼 있어 대부분 NEEDS CLARIFICATION이 없다. 구현 방식 선택이 필요한 지점만 정리한다.

## R1. 로컬 캐시 방식 (FR-011 콘텐츠 — 랭킹은 범위 제외)

- **Decision**: Spring Cache 추상화 + **Caffeine** provider로 통일(지라 LEARN-01-02 명시). 학습 콘텐츠(`SignService.getActiveSignsByCategory`)는 사실상 정적이므로 무기한 캐시.
  - **콘텐츠 무효화(#9 점검 결과)**: 현재 Sign 쓰기/관리 API가 없어(learning의 유일한 쓰기는 `POST /wrong-answers`) 런타임에 콘텐츠가 바뀌지 않으므로 무기한 캐시가 안전하다. **향후 콘텐츠 관리 API가 추가되면 그 시점에 `@CacheEvict`가 필요**하다(현재는 불필요).
  - **랭킹은 캐시 적용 안 함**: RANK-01-03(Top-5 캐시)은 쓰기 민감·게임 타입별 분리·무효화 훅 부재로 조기 최적화라 범위에서 제외(spec 참조). 랭킹 성능은 복합 인덱스(FR-017)로만 해결.
- **Rationale**: 단일 인스턴스 전제라 분산 캐시 불필요. `@Cacheable`로 코드 변경 최소화.
- **Alternatives**: 수동 `ConcurrentHashMap`(보일러플레이트↑), Redis(범위 밖, 현 규모 과함).
- **의존성**: `com.github.ben-manes.caffeine:caffeine` + `spring-boot-starter-cache` 추가 필요(현재 build.gradle에 없음).

## R2. Flyway 도입 및 기준선 (FR-018)

- **Decision**: Flyway 의존성 추가 후, 현행 스키마(v6)를 `V1__baseline.sql` 기준선으로 삼고 `baseline-on-migrate`로 기존 DB에 적용. 이후 스키마 변경은 증분 마이그레이션으로만.
- **Rationale**: 이미 운영 스키마가 존재하므로 baseline이 필요. 이후 FR-015(`game_results` 제약), FR-017(인덱스 보강) 등 스키마 변경을 마이그레이션으로 관리.
- **현행 확인**: `application.yaml`은 이미 `ddl-auto=${JPA_DDL_AUTO:none}`(기본 none)이고, 스키마는 `resources/schema/` SQL을 수동 적용해왔다. Flyway 도입은 이 수동 방식을 대체하는 것이며 `ddl-auto`는 none 그대로 유지한다.
- **Alternatives**: `ddl-auto=update`(이력 추적 불가·위험 — 채택 안 함), Liquibase(팀 표준 아님).

## R3. 모듈 경계 강제 (FR-020 ArchUnit)

- **Decision**: 테스트 의존성 ArchUnit 추가, 도메인 패키지 간 허용 의존 규칙과 `realtime → service` 방향(단방향) 규칙을 테스트로 고정.
- **Rationale**: 계약(RoomRealtimeNotifier 인터페이스 주입) 등 이미 정한 경계를 코드로 강제해 회귀 방지.
- **Alternatives**: 코드리뷰 수동 확인(강제력 없음), 멀티모듈 분리(과함).

## R4. 트랜잭션/쿼리 타임아웃·풀·배치·open-in-view (FR-021, FR-022, FR-023)

- **Decision (초기값, #5)**: 전역 트랜잭션 타임아웃 `3s`(배치 cleanup 스케줄러만 `30s` 오버라이드), 쿼리 타임아웃 `jakarta.persistence.query.timeout=3000ms`, HikariCP `maximum-pool-size=10`·`connection-timeout=3000ms`·`validation-timeout=3000ms`, JDBC 배치 `hibernate.jdbc.batch_size=30`·`order_inserts/order_updates=true`. `spring.jpa.open-in-view=false`.
- **Rationale**: BCrypt를 트랜잭션 밖으로 분리(FR/USER-01-07)하면 커넥션 점유가 짧아져 풀 10으로 충분할 가능성이 높다. 3s는 느린 요청 차단과 정상 쿼리 여유의 절충. 최종 풀 크기는 STABLE-08-14 부하 테스트로 `hikaricp_connections_pending=0` 되는 최소값으로 확정.
- **open-in-view 회귀 위험(#7 점검 결과)**: 코드베이스에 JPA 연관관계(`@OneToMany/@ManyToOne/LAZY`)가 **전무**하다. 지연로딩 자체가 없어 OSIV 비활성화 시 `LazyInitializationException` 회귀 지점이 없음(안전).
- **Alternatives**: 기본값 유지(장애 시 무한 대기 위험).

## R5. CORS 미설정 동작 (FR-019)

- **Decision**: `CORS_ALLOWED_ORIGINS`가 비었을 때의 동작을 "허용 오리진 없음(차단)"으로 명시 정의하고 기동 로그로 경고. 설정 시 해당 목록만 허용.
- **Rationale**: 안전한 기본값(fail-closed). 프론트 분리 배포를 위해 설정값 주입 필요.
- **Alternatives**: 미설정 시 전체 허용(보안 위험), 기동 실패(운영 불편) — 경고+차단 절충.

## R6. 입장 실시간 신호 (FR-016 / GAME-02-21)

- **Decision**: 서버→클라 메시지 타입 `PEER_JOINED` 신설. `afterConnectionEstablished`의 **비-재접속(최초 확정)** 경로에서만 `RoomRealtimeNotifier.notifyPeerJoined(roomId, userId)`로 상대에게 브로드캐스트. 재접속은 기존 `PEER_RECONNECTED` 유지.
- **Rationale**: 기존 메시지 패턴(PEER_DISCONNECTED/RECONNECTED/LEFT/GAME_STARTED)과 동일 구조. 기존 재접속 분기 로직(`reconnect` 플래그)이 이미 존재해 최소 변경.
- **Alternatives**: 클라 폴링(현행 공백), 별도 REST 통지(실시간성↓).

## R7. reportResult 데드락 방지 (FR-012)

- **Decision**: 다중 행(참가자/방/세션) 잠금 획득 순서를 식별자 기준 오름차순 등 **고정 순서**로 통일.
- **Rationale**: 교차 잠금 순서가 데드락 원인. 순서 고정은 표준적 해법.
- **Alternatives**: 낙관적 락(충돌 재시도 복잡), 전역 락(동시성↓).

## R8. 게임방 코드 생성 실패 예외 (FR-014)

- **Decision**: 반복 충돌로 유니크 코드 생성 실패 시 표준 예외 대신 도메인 커스텀 예외를 던지고 공통 `ErrorCode`/`ErrorResponse`로 매핑.
- **Rationale**: 오류 응답 일관성(FR-004/기존 ErrorResponse 계약)과 원인 식별성.
- **Alternatives**: `IllegalStateException` 등 표준 예외(식별성·응답 일관성↓).

## R9. game_results 정합성 (FR-015) [재확인 필요]

- **Decision**: 현행 `game_results`(user_id/game_type/score/recorded_at)에 대전 결과 중복 행 방지 등 필요한 정합성 제약을 재확정 후 Flyway로 반영 + 저장 후 검증 쿼리.
- **주의**: GAME-02-16 원안의 `game_sessions` 보강·`users.win_count` 파생캐시 불일치 전제는 RANK-01-02 마이그레이션(`game_sessions`·`win_count` 삭제)으로 무효화됨.
- **Rationale**: 결과 유실/중복 방지(SC-002).
- **Alternatives**: 애플리케이션 레벨 검증만(DB 제약 없이 경합 취약).

## 전제 / 코드 점검 확정 사항

- 캐시 provider: **Caffeine으로 확정**(R1). 랭킹 캐시는 제외.
- 타임아웃/풀: R4의 초기값으로 시작, 풀 크기만 STABLE-08-14 부하 테스트로 재확정.
- Flyway(R2/#6): 현행 `ddl-auto=none` + `resources/schema/` SQL 수동 관리에서 **Flyway 단일 소스로 통일**. 기존 `resources/schema` DDL을 `V1__baseline.sql`로 이관하고 이후 모든 변경은 `V{n}__*.sql`로만.
- N+1 DELETE(#8): 실제 대상은 `GameRoomCleanupScheduler.cleanupStaleRooms`의 `deleteAll(targets)`(개별 DELETE). startup reconciler의 `closeAllActiveRooms`(UPDATE)와 별개 — FR-013은 전자를 단일 벌크 DELETE로 전환.
- open-in-view(#7): JPA 연관관계 부재로 회귀 위험 없음(확인 완료).
