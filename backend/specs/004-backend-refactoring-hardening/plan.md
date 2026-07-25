# Implementation Plan: Backend Refactoring & Hardening Backlog

**Branch**: `004-backend-refactoring-hardening` | **Date**: 2026-07-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `backend/specs/004-backend-refactoring-hardening/spec.md`

## Summary

지라에 리팩토링용으로 남겨둔 스토리(USER-01-05~09·11~13, LEARN-01-02, TEST-01-04~05, GAME-02-13~16, GAME-02-21, RANK-01-04, STABLE-08-09~16 — USER-01-10·RANK-01-03 제외)를 하나의 작업 단위로 구현한다. 대부분 기존 API 계약과 관찰 동작을 보존하는 내부 개선이며, 유일한 관찰 가능 변경은 GAME-02-21의 신규 입장 실시간 신호(WebSocket 메시지 타입 추가)다. 핵심 접근: (1) 인증·회원 도메인 정확성/안전성 보강, (2) 게임방 동시성·정합성 강화, (3) 조회 성능 최적화(단일 쿼리·로컬 캐시·인덱스), (4) 운영 안정성 기반(Flyway·ArchUnit·타임아웃·풀·예외·CORS·테스트).

## Technical Context

**Language/Version**: Java 17

**Primary Dependencies**: Spring Boot 4.0.7 (Web MVC, Data JPA, Security, WebSocket, Validation, Actuator), springdoc-openapi 3.0.2, JJWT 0.12.6, Lombok. **신규 추가 필요**: Flyway(FR-018), `spring-boot-starter-cache` + Caffeine(FR-011), ArchUnit(FR-020, test) — 현재 build.gradle에 없음

**Storage**: MySQL (운영), H2 (테스트). 실시간 방 상태는 단일 인스턴스 `ConcurrentHashMap` (범위 유지)

**Testing**: JUnit Platform + Spring Boot Test 슬라이스(webmvc/security/data-jpa/websocket), H2 런타임

**Target Platform**: Linux 서버 (단일 인스턴스 배포)

**Project Type**: Web service (백엔드 단일 모듈 `backend/suhwa`), 프론트엔드·AI 서버는 분리

**Performance Goals**: 조회 경로 쿼리 수/응답시간 개선(오답노트 2쿼리+인메모리 조인 → 단일 쿼리, 콘텐츠 캐시 히트 시 DB 미조회, 랭킹은 복합 인덱스로 정렬 최적화), 대량 방 정리 시 단일 벌크 DML

**Constraints**: 기존 API 계약·관찰 동작 보존(회귀 0), 단일 인스턴스 전제, 로컬(인메모리) 캐시만 사용(분산 캐시 범위 밖)

**Scale/Scope**: 소규모 사용자 풀(그래서 RefreshToken 재사용 탐지/정리 배치 USER-01-10과 랭킹 Top-5 캐시 RANK-01-03은 제외). 대상 스토리 25개(USER-01-05·06·07·08·09·11·12·13, LEARN-01-02, TEST-01-04·05, GAME-02-13~16·21, RANK-01-04, STABLE-08-09~16) + 각 하위 작업. FR-001~025.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md`는 비준되지 않은 템플릿(플레이스홀더) 상태로, 강제 원칙/게이트가 정의돼 있지 않다. → **적용 게이트 없음(N/A)**. 위반 없음.

일반 원칙(암묵): 리팩토링은 기존 테스트를 깨지 않아야 하고, 관찰 가능한 회귀가 없어야 한다. 각 스토리는 독립적으로 개발·검증·배포 가능(spec의 Independent Test 참조).

## Project Structure

### Documentation (this feature)

```text
backend/specs/004-backend-refactoring-hardening/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (WS delta only)
└── tasks.md             # Phase 2 output — 아직 생성 안 됨(/speckit-tasks 실행 시 생성)
```

### Source Code (repository root)

```text
backend/suhwa/src/main/java/backend/ssafy/suhwa/
├── auth/            # RefreshTokenService 추출(FR-002), 인증 실패 응답 통일(FR-004)
│   ├── service/
│   └── repository/  # RefreshTokenRepository (@Modifying 검증됨)
├── user/            # 활성 사용자 판정 통합(FR-001), soft delete 강제(FR-007), 해싱 분리(FR-003), withdraw flush(FR-008)
│   ├── domain/ service/ repository/ controller/
├── game/            # reportResult 잠금순서(FR-012), 정리 N+1→벌크(FR-013), 코드생성 커스텀 예외(FR-014),
│   ├── realtime/    #   game_results 정합성(FR-015), 입장 신호 PEER_JOINED(FR-016)
│   ├── service/ repository/ scheduler/ controller/
├── learning/        # 콘텐츠 Caffeine 캐시(FR-011), 오답노트 단일쿼리(FR-009), ad-hoc JOIN 정리(FR-010)
│                    #   (오답노트는 learning 패키지 소속 — 별도 test 패키지 없음)
├── ranking/         # 복합 인덱스(FR-017). Top-5 캐시는 범위 제외
├── gameresult/ growth/ webrtc/  # 실재하는 도메인 패키지(참고 — 이 스펙 직접 대상 아님)
└── common/          # 예외 catch-all/ERROR 디스패치 정리(FR-024), CORS 설정화(FR-019),
    └── config/      #   타임아웃(FR-022)·풀/배치(FR-023)·open-in-view(FR-021) 설정, ArchUnit(FR-020)

backend/suhwa/src/main/resources/
└── db/migration/    # Flyway 마이그레이션 V1__baseline.sql 등 (FR-018, 신규). 기존 resources/schema DDL을 여기로 이관·통일

backend/suhwa/src/test/java/...  # 필터체인 통합 테스트 보강(FR-025), ArchUnit 규칙(FR-020)
```

**Structure Decision**: 기존 단일 백엔드 모듈(`backend/suhwa`)의 도메인 패키지 구조를 그대로 사용한다. 신규 디렉터리는 Flyway 마이그레이션용 `src/main/resources/db/migration`만 추가된다. 나머지는 기존 클래스 수정·분리다.

## Complexity Tracking

> Constitution Check 위반 없음 — 해당 없음.
