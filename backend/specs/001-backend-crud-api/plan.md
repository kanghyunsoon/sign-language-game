# Implementation Plan: 백엔드 CRUD API 1차 구축

**Branch**: `001-backend-crud-api` | **Date**: 2026-07-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `backend/specs/001-backend-crud-api/spec.md`

## Summary

1차 목표는 WebSocket/SSE 기반 실시간 기능(실시간 방 목록 구독, 게임 중 실시간 동기화, WebRTC 시그널링)을 제외한 **REST 기반 CRUD API**를 기존 Spring Boot 프로젝트(`backend/suhwa`)에 스펙의 우선순위대로 구현하는 것이다: **P1 API 문서화(Swagger) → P2 회원/인증 → P3 학습 콘텐츠·테스트/오답노트 → P4 게임방 매칭(CRUD 범위) → P5 랭킹**. 펫(user_pets)·출석(attendance)은 이번 범위에서 데이터 구조(JPA 엔티티)만 준비하고 API/로직은 만들지 않는다.

각 도메인은 Controller–Service–Repository 계층형 구조로 구현하고, `springdoc-openapi`가 코드로부터 자동 생성하는 Swagger UI를 다른 도메인보다 먼저 구성해 이후 추가되는 모든 엔드포인트가 별도 수작업 없이 문서에 반영되도록 한다. **비즈니스 로직(Controller 구현체)에 Swagger 어노테이션이 섞이지 않도록, 도메인별로 `{Domain}Api` 인터페이스에 `@Operation`/`@ApiResponse` 등 API 명세 어노테이션을 몰아두고, `{Domain}Controller` 구현체는 그 인터페이스를 구현(`implements`)만 하는 방식으로 API 문서와 비즈니스 로직을 분리한다.**

각 기능 구현 직후에는 JUnit 5 + Spring Boot Test 기반 자동화 테스트(레포지토리 슬라이스 테스트, MockMvc 컨트롤러 테스트, 필요 시 `@SpringBootTest` 통합 테스트)로 spec.md의 Acceptance Scenario를 검증하고, `./gradlew test`가 통과해야 해당 기능이 완료된 것으로 간주한다 — 사용자가 이번 `/speckit-plan` 실행 시 명시적으로 요청한 "구현 후 테스트로 문제 없음을 검증" 요구사항을 반영한 것이다.

## Technical Context

**Language/Version**: Java 17 (기존 `backend/suhwa/build.gradle`의 toolchain 설정)

**Primary Dependencies**: Spring Boot 4.0.7 — `spring-boot-starter-webmvc`, `spring-boot-starter-data-jpa`, `spring-boot-starter-security`, `spring-boot-starter-validation`, `spring-boot-starter-websocket`(현재 의존성엔 포함되어 있으나 1차 범위에서는 미사용, 후속 WebSocket 기능을 위해 미리 추가되어 있음), `springdoc-openapi-starter-webmvc-ui:3.0.2`(Swagger UI, User Story 1), Lombok. 이미 `build.gradle`에 선언되어 있어 추가 의존성 도입 없이 진행 가능.

**Storage**: MySQL (`com.mysql:mysql-connector-j`, 런타임), 스키마는 `backend/jira-crud-backlog.md`에 초안이 이미 존재(users, refresh_tokens, signs, wrong_answer_logs, game_rooms, game_sessions, attendance, user_pets) — `game_rooms`에는 최근 clarify 논의로 `updated_at`(상태 변경 시각) 컬럼 추가가 확정됨. 상세는 [data-model.md](./data-model.md) 참고.

**Testing**: JUnit 5(`spring-boot-starter-*-test` 계열이 이미 `build.gradle`에 선언됨) — Repository 계층은 `@DataJpaTest`, Controller 계층은 `@WebMvcTest` + MockMvc, 도메인 간 연동(회원가입 시 pet 미생성 확인, 게임 결과 저장 시 랭킹 반영 등)은 `@SpringBootTest`로 검증. 테스트용 DB 전략은 [research.md](./research.md) 참고.

**Target Platform**: Linux 서버(컨테이너 배포 가정) — 저장소에 아직 Dockerfile/CI 설정 없음, 이번 기능 범위 밖(별도 인프라 작업으로 취급).

**Project Type**: 단일 백엔드 웹 서비스(REST API) — `backend/suhwa` Spring Boot 프로젝트 하나로 구성, 별도 프론트엔드/모바일 프로젝트는 이 계획 범위 밖.

**Performance Goals**: 별도 정량 목표 없음(교육 프로젝트 규모) — spec.md의 SC-001~SC-006(문서화 100% 반영, 3분 이내 가입 흐름, 결과 유실 없는 100건 연속 처리 등)을 기능적 완료 기준으로 삼는다.

**Constraints**: JWT 기반 Bearer 인증 + `refresh_tokens` DB 화이트리스트(Redis 미사용), 회원 탈퇴는 Soft Delete(`deleted_at`), 게임방은 1:1 전용, CLOSED 방은 5분 내 자동 정리, 랭킹 동점자는 패 수 적은 순 — 모두 spec.md Assumptions/Clarifications에 확정됨.

**Scale/Scope**: 소규모 팀 프로젝트(SSAFY 특화 프로젝트) 수준, 명시적 동시 사용자 목표 없음. 도메인 5개(문서화 제외), REST 엔드포인트 총 18개.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md`가 아직 플레이스홀더 템플릿 상태로, 이 프로젝트에 특정된 원칙(Principle)이 정의되어 있지 않다. 따라서 이번 계획에 적용할 추가 게이트는 없으며, Spec Kit 기본 원칙(스펙 대비 최소 복잡도, 정당화 없는 편차 금지)만 따른다. **위반 사항 없음 — Complexity Tracking 불필요.**

향후 여러 기능을 거치며 팀의 컨벤션(예: 테스트 우선 여부, 계층 구조 규칙)이 반복적으로 드러난다면, `/speckit-constitution`으로 명문화하는 것을 권장한다.

**Post-Design Re-check (Phase 1 완료 후)**: `research.md`/`data-model.md`/`contracts/`/`quickstart.md` 작성 결과 새로운 외부 의존성이나 아키텍처 복잡도가 추가되지 않았음(기존 `build.gradle` 의존성 범위 내에서 해결). 게이트 위반 없음 — 재확인 통과.

## Project Structure

### Documentation (this feature)

```text
backend/specs/001-backend-crud-api/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── auth-api.yaml
│   ├── users-api.yaml
│   ├── learning-api.yaml
│   ├── game-rooms-api.yaml
│   └── ranking-api.yaml
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/suhwa/
├── src/
│   ├── main/
│   │   ├── java/backend/ssafy/suhwa/
│   │   │   ├── SuhwaApplication.java
│   │   │   ├── common/
│   │   │   │   ├── config/        # SecurityConfig, OpenApiConfig(Swagger 전역 설정: Tag/Authorize), SchedulingConfig(방 정리 스케줄러)
│   │   │   │   ├── security/      # JWT 발급/검증, 인증 필터, 인증 사용자 컨텍스트
│   │   │   │   ├── exception/     # GlobalExceptionHandler, 도메인 예외, 공통 에러 응답
│   │   │   │   └── dto/           # 공통 응답 래퍼 등
│   │   │   ├── user/              # User 엔티티/가입·프로필·탈퇴 (User Story 2)
│   │   │   │   ├── domain/ dto/ repository/ service/
│   │   │   │   └── controller/    # UserApi(인터페이스, Swagger 어노테이션) + UserController(구현체, implements UserApi)
│   │   │   ├── auth/              # RefreshToken 엔티티/로그인·재발급·로그아웃 (User Story 2)
│   │   │   │   ├── domain/ dto/ repository/ service/
│   │   │   │   └── controller/    # AuthApi + AuthController
│   │   │   ├── learning/          # Sign, WrongAnswerLog / 콘텐츠 조회·오답 신고·오답노트 (User Story 3)
│   │   │   │   ├── domain/ dto/ repository/ service/
│   │   │   │   └── controller/    # LearningApi + LearningController (Sign 조회, 오답 신고/조회)
│   │   │   ├── game/              # GameRoom, GameSession / 생성·입장·나가기·준비·시작·결과 (User Story 4)
│   │   │   │   ├── domain/ dto/ repository/ service/ scheduler/  # scheduler: CLOSED 방 5분 정리 배치
│   │   │   │   └── controller/    # GameRoomApi + GameRoomController
│   │   │   ├── ranking/           # 랭킹 조회 (User Story 5, 읽기 전용 — users 테이블 집계)
│   │   │   │   ├── dto/ repository/ service/
│   │   │   │   └── controller/    # RankingApi + RankingController
│   │   │   └── growth/            # Attendance, UserPet — 엔티티/레포지토리만 (API·서비스·컨트롤러 없음, FR-034/035)
│   │   │       └── domain/ repository/
│   │   └── resources/
│   │       └── application.yaml   # 기존 파일 (DB, 서버 포트 설정)
│   └── test/
│       └── java/backend/ssafy/suhwa/
│           ├── user/ auth/ learning/ game/ ranking/   # 각 도메인과 동일한 패키지 구조로 미러링
│           └── SuhwaApplicationTests.java             # 기존 파일 (컨텍스트 로드 테스트)
└── build.gradle            # 기존 파일, 변경 없음(필요 의존성 이미 포함)
```

**Structure Decision**: 프론트엔드/모바일이 이 계획 범위에 없으므로 템플릿의 "Option 2: Web application"(frontend+backend 분리) 대신, 기존 `backend/suhwa` Spring Boot 프로젝트 하나를 **도메인별 패키지(package-by-feature)** 구조로 확장한다. `src/models/services/cli/lib` 같은 범용 템플릿 대신 Spring Boot 관례(Controller–Service–Repository–Domain–DTO)를 따르고, 테스트는 동일 패키지 구조를 `src/test/java` 아래 미러링한다. 별도 `tests/contract`, `tests/integration`, `tests/unit` 디렉터리를 추가로 만들지 않고, 대신 클래스 접미사(`*RepositoryTest`, `*ControllerTest`, `*IntegrationTest`)로 테스트 성격을 구분한다 — Gradle에 별도 source set을 추가하는 복잡도를 도입하지 않기 위함(YAGNI).

각 도메인의 `controller/` 패키지는 **`{Domain}Api` 인터페이스 + `{Domain}Controller` 구현체**의 두 파일로 나눈다. `@Tag`, `@Operation`, `@ApiResponse`, `@Parameter` 등 Swagger/OpenAPI 어노테이션은 전부 인터페이스 쪽 메서드 시그니처에만 붙이고, `@RestController`/`@RequestMapping`이 붙는 구현체는 인터페이스를 `implements`한 뒤 실제 위임 로직만 담아 어노테이션 없이 깔끔하게 유지한다. 이는 User Story 1(문서화 최우선)과 맞물려, 문서 명세 변경이 비즈니스 로직 코드를 건드리지 않도록 관심사를 분리하기 위함이다.

**게임방 도메인 서비스는 전송 계층(REST)과 완전히 분리한다.** `GameRoomService`의 메서드(`create(hostUserId)`, `join(roomCode, userId)`, `leave(roomId, userId)`, `setReady(roomId, userId, isReady)`, `start(roomId, userId)`, `reportResult(roomId, hostScore, guestScore)` 등)는 `HttpServletRequest`, `Authentication`, DTO 등 HTTP에 종속된 타입을 파라미터로 받지 않고 **`roomId`/`userId`/원시 값 같은 순수 도메인 파라미터만** 받는다. 인증 주체 추출·요청 바디 파싱은 `{Domain}Controller`에서 끝내고 서비스에는 이미 해석된 값만 넘긴다. 이렇게 하는 이유는, 방 나가기·방장 위임·CLOSED 전환 같은 상태 전이 로직이 지금은 `POST /leave` REST 호출로만 트리거되지만, 향후 WebSocket이 도입되면 소켓 연결 종료(disconnect) 이벤트에서도 **동일한 로직**이 실행되어야 하기 때문이다(리뷰에서 지적됨). 서비스 메서드가 HTTP에 묶여 있지 않으면, 그때 가서 WebSocket 핸들러가 `gameRoomService.leave(roomId, userId)`를 그대로 재사용할 수 있어 로직을 두 번 구현할 필요가 없다. 이 규칙은 추가 비용이 들지 않으므로(YAGNI 위반 아님) 1차부터 적용한다.

## Complexity Tracking

> Constitution Check에 위반 사항이 없으므로 이 표는 비워둔다.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
