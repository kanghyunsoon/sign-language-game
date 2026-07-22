# Implementation Plan: 실시간 로비/게임방 알림(SSE)과 WebRTC 시그널링 도입 (선행 안정화 포함)

**Branch**: `002-realtime-sse-websocket` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `backend/specs/002-realtime-sse-websocket/spec.md`

## Summary

001에서 REST/DB CRUD로만 구현된 게임방 매칭(`backend/suhwa`)에 실시간성(SSE 로비 목록, WebSocket 방 내 알림/재접속, WebRTC 시그널링 릴레이)을 얹는다. 순서가 하드 제약이다: **Part A(P1~P8, 선행 안정화 6가지 결함 수정 + CORS + 실시간 티켓 발급)를 전부 완료·검증한 뒤에만 Part B(P9~P13, SSE/WebSocket 실 구현)에 착수**한다(SC-001). Part A는 401/403 오류 응답 통일, `GameRoom` 낙관적 락, `setReady` 상태 가드, WAITING 방 정리 확장 + 재시작 시 강제 정합화, 스케줄러 전용 스레드풀, `GameRoomService`의 DTO 반환 전환으로 구성된다. Part B는 `SseEmitter` 기반 로비 구독(Nginx `X-Accel-Buffering: no` 포함), 순수 WebSocket(`TextWebSocketHandler`, STOMP 미사용) 기반 방 내 실시간 연결(퇴장 유예, 재접속, 시작 알림, 시그널링 릴레이)로 구성된다. 또한 REST로 방을 생성/입장한 뒤 15초 안에 그 방의 WebSocket을 열지 않는 참가자(호스트/게스트 모두)는 자동으로 퇴장 처리되어(FR-029), "REST로는 들어왔지만 실제 연결하지 않는 사용자가 정원을 영구 점유하는" 문제를 이번 스펙에서 해소한다 — 001/002 초안에서 한 차례 범위 밖으로 미뤘던 결정을 번복한 것이다(research.md #14). 단일 인스턴스 운영이 확정돼 있어 모든 실시간 상태(로비 구독자, 방별 참가자/ready/유예 타이머)는 `ConcurrentHashMap` 기반 인메모리 구조로 관리하고 Redis 등 외부 상태 저장소는 도입하지 않는다.

## Technical Context

**Language/Version**: Java 17 (001과 동일, `backend/suhwa/build.gradle` toolchain 유지)

**Primary Dependencies**: Spring Boot 4.0.7 — `spring-boot-starter-webmvc`(`SseEmitter` 포함, 신규 의존성 불필요), `spring-boot-starter-websocket`(001에서 이미 "후속 WebSocket 기능을 위해 미리 추가"되어 있었던 것을 이번에 실제 사용, 신규 의존성 아님), `spring-boot-starter-security`(CORS/인증 확장), `springdoc-openapi-starter-webmvc-ui`(신규 엔드포인트 자동 문서화, 001에서 이미 구성). **이번 스펙에서 새로 추가하는 외부 의존성은 없다** — Redis/메시지 브로커/STOMP 라이브러리 전부 불필요(단일 인스턴스 결정, research.md #9/#10).

**Storage**: MySQL(001과 동일, `game_rooms`에 `version` 컬럼 1개만 추가). 실시간 상태(티켓, 로비 구독자, 방별 참가자 라이브 상태)는 DB가 아니라 인스턴스 메모리(`ConcurrentHashMap`)에 보관 — data-model.md 참고.

**Testing**: JUnit 5 + MockMvc(001과 동일 스택) 유지. 신규 필요 도구: WebSocket 테스트용 `org.springframework.web.socket.client.standard.StandardWebSocketClient`(`spring-boot-starter-websocket-test`에 이미 포함, 추가 의존성 없음)로 핸드셰이크 거부/메시지 송수신 통합 테스트. SSE는 `SseEmitter`를 감싸는 서비스 계층 단위 테스트 + `MockMvc`의 스트리밍 응답 검증으로 커버.

**Target Platform**: Linux 서버 + Nginx 리버스 프록시(001에서는 미확정이었으나 이번 스펙에서 아키텍처 결정으로 확정 — SSE 응답에 `X-Accel-Buffering: no` 필수).

**Project Type**: 단일 백엔드 웹 서비스(001과 동일, `backend/suhwa` 하나).

**Performance Goals**: 로비 목록 변경 전파 3초 이내(SC-002, spec.md clarify로 확정). 그 외 정량 목표 없음(교육 프로젝트 규모, 001과 동일).

**Constraints**: 단일 인스턴스 운영(Redis Pub/Sub 없음), 실시간 티켓은 1회용·단기 유효, CORS는 `CORS_ALLOWED_ORIGINS` 환경변수 기반 명시적 허용만, 서버 재시작 시 WAITING/IN_PROGRESS 방 전부 강제 CLOSED(FR-028, IN_PROGRESS도 예외 없음 — spec.md Assumptions에서 트레이드오프로 확정), 방 생성/입장 후 15초 안에 WebSocket을 열지 않으면 호스트/게스트 구분 없이 자동 퇴장 처리(FR-029) — 모두 spec.md Assumptions/Clarifications에 확정됨.

**Scale/Scope**: 001과 동일 소규모 프로젝트 범위. 신규 REST 엔드포인트 2개(`POST /auth/sse-ticket`, `GET /webrtc/ice-servers`) + SSE 엔드포인트 1개(`GET /game-rooms/subscribe`) + WebSocket 엔드포인트 1개(`/ws/game-rooms/{roomId}`, 서버→클라이언트 메시지 타입 6종: `PEER_DISCONNECTED`/`PEER_RECONNECTED`/`PEER_LEFT`/`GAME_STARTED`/`SIGNAL`/`ERROR`, 클라이언트→서버는 `SIGNAL` 1종).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md`가 001과 동일하게 플레이스홀더 템플릿 상태로, 이 프로젝트에 특정된 원칙이 정의되어 있지 않다. 따라서 이번 계획에 적용할 추가 게이트는 없으며, Spec Kit 기본 원칙(스펙 대비 최소 복잡도, 정당화 없는 편차 금지)만 따른다. **위반 사항 없음 — Complexity Tracking 불필요.**

**Post-Design Re-check (Phase 1 완료 후)**: `research.md`/`data-model.md`/`contracts/`/`quickstart.md` 작성 결과, 새로운 외부 의존성이나 별도 인프라(Redis, 메시지 브로커, STOMP)를 추가하지 않고 기존 `build.gradle` 의존성 범위 안에서 해결했음을 확인(research.md #9/#10). 인메모리 구조(`ConcurrentHashMap`) 도입은 spec.md가 명시한 아키텍처 결정(단일 인스턴스)의 직접적 결과이지 임의의 복잡도 추가가 아니다. 게이트 위반 없음 — 재확인 통과.

## Project Structure

### Documentation (this feature)

```text
backend/specs/002-realtime-sse-websocket/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
│   ├── auth-ticket-api.yaml
│   ├── realtime-sse-api.yaml
│   └── realtime-websocket-messages.md
├── checklists/
│   └── requirements.md
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/suhwa/
├── src/
│   ├── main/
│   │   ├── java/backend/ssafy/suhwa/
│   │   │   ├── common/
│   │   │   │   ├── config/
│   │   │   │   │   ├── SecurityConfig.java        # [변경] accessDeniedHandler 추가, 401/403 모두 HandlerExceptionResolver 위임(FR-001), .cors() 연결(FR-007)
│   │   │   │   │   ├── CorsConfig.java             # [신규] CorsConfigurationSource 빈, CORS_ALLOWED_ORIGINS 파싱(FR-007)
│   │   │   │   │   └── SchedulingConfig.java       # [변경] ThreadPoolTaskScheduler 빈 등록 + SchedulingConfigurer(FR-005)
│   │   │   │   ├── exception/
│   │   │   │   │   ├── ErrorCode.java              # [변경] ACCESS_DENIED, CONCURRENT_UPDATE_CONFLICT 추가
│   │   │   │   │   └── GlobalExceptionHandler.java # [변경] ObjectOptimisticLockingFailureException 핸들러 추가(FR-002)
│   │   │   │   └── security/                       # 변경 없음(001 그대로 재사용)
│   │   │   ├── auth/
│   │   │   │   ├── domain/                         # 변경 없음
│   │   │   │   ├── service/
│   │   │   │   │   └── RealtimeTicketService.java  # [신규] ConcurrentHashMap 기반 티켓 발급/1회 소비(FR-008, research.md #8)
│   │   │   │   └── controller/                      # [변경] AuthApi/AuthController에 POST /auth/sse-ticket 추가
│   │   │   ├── game/
│   │   │   │   ├── domain/
│   │   │   │   │   └── GameRoom.java               # [변경] @Version 필드 추가(CORR-1)
│   │   │   │   ├── repository/
│   │   │   │   │   └── GameRoomRepository.java     # [변경] WAITING+updatedAt 조회 메서드 추가, 시동 정합화용 상태 일괄 갱신 쿼리 추가
│   │   │   │   ├── service/
│   │   │   │   │   └── GameRoomService.java        # [변경] create/join/setReady/start가 GameRoomResponse 반환(ARCH-4), setReady에 WAITING 가드 추가(CORR-3), join()에 재입장 인식(isParticipant면 즉시 반환, FR-020) 추가(research.md #14-1), leave()가 RoomRealtimeNotifier를 주입받아 커밋 후 PEER_LEFT 브로드캐스트 트리거(FR-016/018/019, research.md #12) — REST 컨트롤러/WebSocket 유예 타이머 어느 쪽에서 호출되든 leave() 내부에서 한 번만 실행. create()/join()이 커밋 직후 RoomParticipantRegistry에 미확정 참가자를 등록하고 15초 확인 대기 타이머를 예약(FR-029, research.md #14). **추가로**: create()/join()(재입장 아닌 신규 배정 경로)/leave()/start()는 각자 커밋 직후 LobbyBroadcastService를 호출해 로비 목록 변경을 브로드캐스트하고(FR-010, research.md #9-1), start()는 여기에 더해 RoomRealtimeNotifier.notifyGameStarted(roomId)를 호출해 방 내 참가자에게 GAME_STARTED를 전송하며 LobbyBroadcastService에는 "목록에서 제거"로 알린다(FR-021/022) — 두 유틸 모두 leave()와 동일하게 서비스 메서드 내부 한 곳에서만 호출해 컨트롤러가 브로드캐스트를 잊거나 중복 호출할 위험을 없앤다
│   │   │   │   ├── scheduler/
│   │   │   │   │   ├── GameRoomCleanupScheduler.java     # [변경] CLOSED뿐 아니라 방치된 WAITING도 정리 대상에 포함(CORR-4, Part A). Part B 단계에서 RoomParticipantRegistry를 추가로 주입받아, confirmed 상태의 살아있는 참가자가 있는 WAITING 방은 삭제 대상에서 제외(FR-030, research.md #4)
│   │   │   │   │   └── GameRoomStartupReconciler.java    # [신규] ApplicationReadyEvent 리스너, WAITING/IN_PROGRESS 전부 CLOSED 강제 전환(FR-028)
│   │   │   │   ├── realtime/                        # [신규 하위 패키지] 이 기능의 핵심 — 인메모리 실시간 상태 + SSE + WebSocket
│   │   │   │   │   ├── LobbySubscriberRegistry.java       # ConcurrentHashMap<sessionId, SseEmitter>(FR-013/014)
│   │   │   │   │   ├── LobbyBroadcastService.java         # 방 생성/입장/퇴장/위임/상태전환 시 전체 구독자에게 브로드캐스트(FR-010)
│   │   │   │   │   ├── RoomParticipantRegistry.java       # ConcurrentHashMap<roomId, RoomLiveState>(data-model.md 참고) — 참가자 등록은 REST create()/join() 시점에 미확정 상태로 시작(FR-029), WebSocket 핸드셰이크 성공 시 확정 전환
│   │   │   │   │   ├── RoomRealtimeNotifier.java          # [신규] PEER_DISCONNECTED/RECONNECTED/PEER_LEFT/GAME_STARTED/SIGNAL 5종 모두를 방 세션들에 전송하는 유일한 통로 — GameRoomService가 PEER_LEFT/GAME_STARTED 트리거에 의존(FR-016/019/021), GameRoomWebSocketHandler가 SIGNAL 릴레이에 의존(FR-025)
│   │   │   │   │   ├── GameRoomWebSocketHandler.java      # TextWebSocketHandler — 연결/비정상 해제 감지/유예타이머 등록/SIGNAL 릴레이(FR-017~027). 실제 메시지 발송은 RoomRealtimeNotifier에 위임(중복 방지)
│   │   │   │   │   ├── GameRoomHandshakeInterceptor.java  # 티켓 검증(RealtimeTicketService 재사용) + RoomParticipantRegistry 조회로 방 참가자 여부 검증(FR-024, DB 재조회 불필요 — research.md #14) — 브라우저 WebSocket API는 커스텀 헤더 불가라 JWT 헤더 방식은 쓰지 않음. 성공 시 확인 대기/재접속 유예 타이머 취소 + 확정 처리(FR-029, FR-020)
│   │   │   │   │   ├── RealtimeWebSocketConfig.java       # WebSocketConfigurer, /ws/game-rooms/{roomId} 등록
│   │   │   │   │   └── controller/
│   │   │   │   │       └── LobbySseController.java        # GET /game-rooms/subscribe (SseEmitter, ticket 쿼리 검증)
│   │   │   │   └── controller/                       # 기존 GameRoomApi/GameRoomController — 변경 없음(반환 타입은 이미 DTO라 시그니처 그대로)
│   │   │   ├── webrtc/                                # [신규 최상위 패키지] STUN/TURN 설정 노출만 담당, 방 도메인과 독립
│   │   │   │   ├── config/
│   │   │   │   │   └── WebRtcProperties.java         # @ConfigurationProperties(prefix="webrtc")
│   │   │   │   └── controller/
│   │   │   │       └── IceServerController.java      # GET /webrtc/ice-servers (FR-027)
│   │   │   └── (learning/ ranking/ growth/ user/ — 변경 없음)
│   │   └── resources/
│   │       └── application.yaml   # [변경] cors.allowed-origins, game.room.*, webrtc.* 설정 키 추가
│   └── test/
│       └── java/backend/ssafy/suhwa/
│           ├── common/config/                        # SecurityConfig 401/403 통일 테스트, CorsConfig 테스트
│           ├── auth/service/RealtimeTicketServiceTest.java
│           ├── game/domain/                           # GameRoom 낙관적 락 테스트
│           ├── game/scheduler/                        # WAITING 정리 확장 + StartupReconciler 테스트
│           ├── game/realtime/                         # 로비 SSE, WebSocket 핸드셰이크/메시지, 유예 타이머 테스트(신규 패키지 미러링)
│           └── webrtc/controller/IceServerControllerTest.java
└── build.gradle            # 변경 없음(필요 의존성 이미 001에서 선반영됨 — websocket starter 등)
```

**Structure Decision**: 001과 동일하게 패키지-바이-피처 구조를 유지한다. 실시간 인프라(SSE 레지스트리, WebSocket 핸들러, 방 라이브 상태)는 REST 계약을 다루는 기존 `game/controller`·`game/service`와 분리해 `game/realtime` 하위 패키지에 모은다 — 두 계층(REST CRUD vs 실시간 브로드캐스트)이 같은 `GameRoomResponse` DTO를 공유하되(ARCH-4), 브로드캐스트 트리거/구독자 관리 로직이 기존 서비스 클래스를 비대하게 만들지 않도록 하기 위함이다. STUN/TURN 설정 노출은 게임방 도메인과 무관한 순수 인프라 설정 전달이라 별도 최상위 패키지 `webrtc/`로 분리한다(방 소속 검증이 필요 없는 엔드포인트이므로 `game` 패키지에 넣으면 오히려 관심사가 섞임).

`GameRoomService`의 메서드가 001부터 이미 순수 도메인 파라미터(`roomId`/`userId`)만 받도록 분리돼 있었던 결정(001 research.md #9)이 이번에 그대로 유용해진다 — `GameRoomWebSocketHandler`가 연결 종료 이벤트에서 `gameRoomService.leave(roomId, userId)`를 컨트롤러와 동일하게 재사용할 수 있다(research.md #12).

## Complexity Tracking

> Constitution Check에 위반 사항이 없으므로 이 표는 비워둔다.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
