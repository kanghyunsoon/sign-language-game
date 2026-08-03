# Implementation Plan: 출석 및 펫 성장

**Branch**: `005-growth-attendance-pet` | **Date**: 2026-07-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `backend/specs/005-growth-attendance-pet/spec.md`

## Summary

기존 출석·테스트·1대1 보상과 20레벨·5단계 펫 성장을 유지하면서 불필요한 연습 및 솔로 세션 저장 구조를 제거한다. 솔로 완료는 기존 `POST /solo-results`에서 초 단위 `score` 하나만 받아 `game_results`에 저장하고, 같은 트랜잭션에서 점수 구간별 펫 경험치를 누적한다. 솔로 랭킹은 사용자별 `MIN(score)` 오름차순과 공동 순위로 변경한다.

기존 Flyway 마이그레이션은 수정하지 않는다. 후속 V8 마이그레이션에서 V6가 만든 `practice_sessions`, `solo_sessions`, `solo_session_symbols`, `solo_symbol_statistics`와 `game_results.solo_session_id`, `game_results.play_duration_ms`를 안전하게 제거한다.

## Technical Context

**Language/Version**: Java 17

**Primary Dependencies**: Spring Boot 4.0.7 (Web MVC, Data JPA, Security, Validation), Flyway, springdoc-openapi 3.0.2, Lombok

**Storage**: MySQL 운영 DB, H2 테스트 DB. 스키마 변경은 Flyway만 사용하고 `ddl-auto=none` 유지

**Testing**: JUnit Platform, Spring Boot Web MVC/Data JPA/Security Test, MockMvc, ArchUnit, MySQL Testcontainers 기반 Flyway 검증

**Target Platform**: Linux 단일 백엔드 인스턴스, Asia/Seoul 서비스 날짜

**Project Type**: Spring Boot 단일 웹 서비스. 프론트엔드와 게임 서버는 별도 프로젝트

**Performance Goals**: 펫 상태 조회 95% 이상 2초 이내, 출석 완료 결과 5초 이내, 솔로 랭킹은 전체 원본을 애플리케이션 메모리에 적재하지 않고 DB 집계 결과만 조회

**Constraints**: 사용자당 이름 없는 펫 1개, 레벨당 20 XP, 5·10·15·20레벨 자동 진화, 최대 레벨 20, 경험치 지급 원장 없음, 연습 보상·세션·API 없음, 솔로 세션·상세 통계·`duration_ms` 없음, 기존 모듈 Repository 직접 참조 금지

**Scale/Scope**: 프로토타입 단일 인스턴스. 출석, 테스트, 솔로, 1대1 보상과 펫 조회 및 게임 종류별 랭킹

**Unknowns**: 없음. 솔로 `score`의 단위·보상 경계·랭킹 방향, 세션 제거 범위와 기존 데이터 이관 규칙을 Phase 0에서 확정했다.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md`는 비준되지 않은 플레이스홀더 템플릿이므로 강제 게이트가 없다. 현재 코드베이스의 다음 검증 규칙을 설계 게이트로 적용한다.

- Controller는 Repository를 직접 호출하지 않는다.
- 다른 도메인의 Repository를 직접 참조하지 않고 공개 Service를 통해 연동한다.
- 활동 결과 저장과 XP 갱신은 하나의 트랜잭션으로 커밋 또는 롤백한다.
- 운영 스키마는 Flyway로만 변경하고 기존 마이그레이션을 수정하지 않는다.
- 인증 사용자는 `@LoginUser`로 식별하며 요청 본문에서 보상 대상 사용자 ID를 받지 않는다.
- 삭제되는 API·필드·테이블은 계약, Swagger, 테스트와 마이그레이션에서 함께 제거한다.

**Pre-design result**: PASS. 위반을 요구하는 설계가 없다.

**Post-design result**: PASS. 성장 연동은 Service 경계를 사용하고, 솔로 저장·보상은 단일 트랜잭션이며, V6/V7을 수정하지 않고 V8을 추가한다.

## Project Structure

### Documentation (this feature)

```text
backend/specs/005-growth-attendance-pet/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── growth-api.yaml
│   └── activity-reward-api-delta.yaml
└── tasks.md             # $speckit-tasks에서 재생성
```

### Source Code (repository root)

```text
backend/suhwa/src/main/java/backend/ssafy/suhwa/
├── growth/              # 출석, 펫, 성장 정책과 잠금 기반 XP 누적
├── learning/            # 테스트 완료 보상만 유지, 연습 세션 제거
├── gameresult/          # score 전용 GameResult와 SoloResult 처리
├── game/                # 1대1 최초 정상 결과와 승·패 보상
├── ranking/             # 대전 승수 및 솔로 MIN(score) 집계
├── user/                # 가입 시 초기 펫 생성
└── common/              # 보안, OpenAPI, 공통 오류

backend/suhwa/src/main/resources/
├── application.yaml
├── db/migration/        # 신규 V8 정리 마이그레이션
└── db/queries/          # game_results 정합성 진단

backend/suhwa/src/test/java/backend/ssafy/suhwa/
├── growth/
├── learning/
├── gameresult/
├── game/
├── ranking/
├── user/
└── common/migration/
```

**Structure Decision**: 기존 단일 Spring Boot 모듈과 도메인별 패키지 구성을 유지한다. 삭제 대상 패키지를 새 추상화로 대체하지 않고, 기존 `SoloResultService`와 `GameResultService`를 결과 기록의 단일 진입점으로 사용한다.

## Design

### 성장 정책과 펫 상태

- 정책 기본값은 출석 3, 테스트 7, 솔로 15·10·5, 1대1 승자 10·패자 3, 레벨당 20, 진화 레벨 5·10·15·20, 최대 레벨 20이다.
- `practiceExp`와 `growth.practice-exp`는 제거한다.
- 솔로 경계는 초 단위 `score` 최대값 60·90·120으로 정책에 표현한다.
- `UserPet`은 사용자별 비관적 쓰기 잠금 후 XP를 더한다. 20 XP마다 반복 레벨업하고, 20레벨 도달 시 초과 XP를 0으로 만들며 이후 보상은 무시한다.
- 진화 단계는 저장하지 않고 레벨에서 `STAGE_1`~`STAGE_5`로 계산한다.

### 활동별 보상 트랜잭션

- 출석은 `(user_id, attendance_date)` 고유키와 펫 잠금으로 첫 출석에만 XP 3을 지급한다.
- 테스트는 기존 `TestSession`의 최초 완료 전이에서 `correctCount * 100 >= totalCount * 80`이면 XP 7을 지급한다.
- 솔로는 `SoloResultService`가 `TETRIS_SOLO` 결과를 저장하고 같은 트랜잭션에서 펫을 잠근 뒤 `score <= 60: 15`, `<= 90: 10`, `<= 120: 5`, 그 외 0 XP를 지급한다.
- 1대1은 기존 게임방 최초 정상 결과 전이에서 승자·패자 `game_results`를 각각 `score=1`, `score=0`으로 저장하고 XP 10·3을 지급한다.
- `user_pets.exp`는 DB 트리거나 결과 재집계로 계산하지 않는다. 결과 저장 시 서비스 계층에서 누적하고 JPA 변경 감지로 영속화한다.
- 솔로 결과의 유일성과 중복 전송 방지는 신뢰 게임 서버가 보장한다. 백엔드는 솔로 지급 원장이나 세션을 추가하지 않는다.

### `game_results`와 솔로 랭킹

- 최종 업무 필드는 `id`, `user_id`, `game_type`, `score`, `recorded_at`이다.
- `TETRIS_SOLO.score`는 게임 진행 시간(초)이며 양의 정수이고 낮을수록 좋다.
- `SIGN_DUEL`과 `TETRIS_DUEL`의 원본 `score`는 승리 1·패배 0이다. 랭킹 응답의 대전 `score`는 원본 합계인 승수다.
- 솔로 랭킹은 사용자별 `MIN(score)`를 DB에서 집계하고 오름차순으로 정렬한다. 순위는 자신보다 작은 최소 점수를 가진 사용자 수에 1을 더해 `1, 1, 3` 방식의 공동 순위를 만든다.
- 동점 사용자의 표시 순서는 `userId` 오름차순으로 안정화하되 순위 값은 같다.
- 기존 `(game_type, score)` 및 `(user_id, game_type)` 인덱스를 재사용하며 `play_duration_ms` 전용 인덱스는 제거한다.

### API와 신뢰 경계

- 유지: `POST /solo-results`, 요청 `{ "score": <초> }`, 응답은 생성된 결과 ID와 저장된 `score`.
- 제거: `/game/solo/sessions` 시작, 세션 완료, 솔로 세션 결과 조회 API와 모든 세션·통계 DTO.
- 제거: `/practice-sessions` 시작·완료 API와 연습 전용 DTO.
- 랭킹 응답에서 `playDurationMs`를 제거하고 `score` 하나만 노출한다.
- Swagger의 `SoloSessions`, `PracticeSessions` 태그와 경로를 제거하고 `SoloResults`의 초 단위 점수·보상 의미를 문서화한다.
- 별도 백엔드 인증 설정은 추가하지 않는다. 프로토타입에서는 신뢰 게임 서버가 기존 사용자 Bearer 토큰을 전달하고, 배포 계층이 `/solo-results`의 직접 외부 호출을 차단한다고 가정한다. 요청 본문에는 사용자 ID를 추가하지 않는다.

### Flyway V8 정리

1. V6와 V7은 체크섬 보존을 위해 수정하지 않는다.
2. `game_results`에서 `TETRIS_SOLO AND play_duration_ms IS NOT NULL`인 행은 `score = CEIL(play_duration_ms / 1000)`으로 먼저 이관한다. 부분 초를 내림해 더 좋은 구간을 받는 오류를 방지한다.
3. `play_duration_ms IS NULL`인 기존 솔로 행의 `score`는 사용자가 확정한 기존 초 단위 의미로 그대로 보존한다.
4. `game_results`의 솔로 세션 FK·유니크·체크·시간 인덱스를 제거한 뒤 `solo_session_id`, `play_duration_ms` 컬럼을 제거한다.
5. 자식부터 `solo_session_symbols`, `solo_symbol_statistics`, `solo_sessions`를 삭제한다.
6. `practice_sessions`를 삭제한다. `test_sessions`에 V6가 추가한 점수 필드와 제약은 유지한다.
7. 운영 적용 전 백업하고 MySQL에서 V7→V8 업그레이드, 솔로 행 수 보존, 변환 경계와 최종 스키마 부재를 검증한다.

### 테스트 전략

- 정책 경계: 솔로 `60/61/90/91/120/121`, 테스트 `79/80`, 출석 3, 대전 승 10·패 3.
- 성장 경계: XP 20, 다중 레벨업, 5·10·15·20 진화, 19→20 초과 XP 제거, 기존 10레벨 유지와 재성장.
- 트랜잭션: 솔로 결과 저장과 펫 XP가 함께 커밋 또는 롤백되고, 대전 양쪽 결과와 양쪽 XP가 원자적으로 반영되는지 검증한다.
- 랭킹: 사용자별 최소 점수, 오름차순, 공동 순위, 본인 순위, Top 5, 게임 종류 격리를 검증한다.
- 삭제 회귀: 연습·솔로 세션 경로가 OpenAPI에 없고, 삭제된 엔티티·테이블·컬럼을 코드와 최종 MySQL 스키마에서 찾을 수 없어야 한다.
- 마이그레이션: 빈 DB V1→V8과 기존 V7 DB→V8 모두 검증하며, 밀리초 이관은 올림된 초 값과 행 수 보존을 확인한다.

## Complexity Tracking

> Constitution Check 위반 없음 — 해당 없음.
