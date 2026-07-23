# Implementation Plan: 방 실시간 연결 자동화 및 영상 통화 전환 시 안전한 정리

**Branch**: `003-webrtc-handoff-flow` | **Date**: 2026-07-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `backend/specs/003-webrtc-handoff-flow/spec.md`

## Summary

002에서 구현된 방 실시간 연결(WebSocket)·영상 통화 시그널링 위에 두 가지 축을 더한다. **(a) 연결 자동화/안전 정리**: 방 생성·입장 응답에 실시간 티켓을 동봉해 별도 API 호출 없이 WebSocket이 자동으로 붙게 하고(US1), 영상 통화(WebRTC)가 실제로 붙으면 클라이언트가 "전환 신호"를 보낸 뒤 방 WebSocket을 끊어도 그걸 방 이탈로 오인하지 않게 하며(US2), 준비 상태 변경도 REST가 아니라 이미 열린 WebSocket으로 상대방에게 실시간 통보한다(US10). **(b) 게임 종류 확장**: 게임방은 지문자 1:1 대전과 테트리스 대전 두 종류로 나뉘고(US6, 둘 다 "대전 모드" — 정원 2, 실시간 연결 필요), 결과는 점수 대신 승자 정보(무승부 포함)만 보고한다(US4). 반면 테트리스 솔로는 상대가 없으므로 게임방 개념 자체를 쓰지 않고 점수 보고 API 하나로 끝나는 완전히 별도의 경량 흐름이다(US8). 세 게임 종류는 "게임 종류 + 점수"라는 하나의 공통 저장 구조에 기록되며(대전은 승리 시 점수 1을 남겨 SUM 집계 = 승수, 솔로는 실제 점수를 남겨 MAX 집계 = 최고 점수), 기존 `users.win_count`/`loss_count`도 예외 없이 이 구조로 마이그레이션되어 랭킹은 게임 종류별로 완전히 분리 조회된다(US9). 방 실시간 연결이 끊긴 뒤에는(전환 신호에 따른 정리든 예기치 않은 단절이든) 게임 중 이탈을 실시간으로 다시 감지하지 않고 결과 보고 시점에만 참가자 유효성을 검증한다(US5, 재대결도 여기 얹힌다).

## Technical Context

**Language/Version**: Java 17 (001/002와 동일, `backend/suhwa/build.gradle` toolchain 유지)

**Primary Dependencies**: Spring Boot 4.0.7 — 002까지 이미 확보된 `spring-boot-starter-webmvc`/`spring-boot-starter-websocket`/`spring-boot-starter-security`/`springdoc-openapi-starter-webmvc-ui`를 그대로 재사용한다. 이번 스펙에서 새로 추가하는 외부 의존성은 없다.

**Storage**: MySQL(001/002와 동일). 신규 테이블 `game_results`(게임 종류+점수 공통 구조, 대전 모드는 승자 `score=1`/패자 `score=0` 행을 함께 기록, data-model.md), `game_rooms.game_type` 컬럼 추가, `game_sessions` 테이블 완전 제거(research.md #8 — 아무도 읽지 않던 테이블, `game_results`가 승/패 집계를 전부 대체), `users.win_count`/`loss_count` 데이터를 `game_results`로 백필 후 컬럼 제거. 준비 상태 변경 브로드캐스트(US10)는 DB를 거치지 않고 002의 `RoomParticipantRegistry`(인메모리) 경유로만 처리한다.

**Testing**: JUnit 5 + MockMvc + `StandardWebSocketClient`(002와 동일 스택 유지). 솔로 결과 API는 방/실시간 연결 없이 단독 호출되는 케이스가 핵심이라 순수 `MockMvc` 통합 테스트로 충분하다.

**Target Platform**: Linux 서버 + Nginx 리버스 프록시(002와 동일, 변경 없음).

**Project Type**: 단일 백엔드 웹 서비스(`backend/suhwa`).

**Performance Goals**: spec.md SC-001(3초 이내 실시간 연결), SC-004(2초 이내 시작 통보, 기존), SC-006(3초 이내 로비 재노출), SC-009(1초 이내 준비 상태 통보). 그 외 정량 목표 없음(교육 프로젝트 규모, 001/002와 동일).

**Constraints**: 솔로 결과는 위·변조 검증을 하지 않는다(spec.md Assumptions, 의도적 리스크 수용). 방 실시간 연결이 정리된 이후에는 게임 중 이탈을 실시간으로 감지하지 않는다(FR-007). 대전 모드 정원은 항상 2명, 솔로는 "방" 개념 자체가 없어 정원이라는 개념도 없다.

**Scale/Scope**: 신규/변경 REST 엔드포인트 4개(`POST /game-rooms` 응답에 `gameType`/티켓 필드 추가는 기존 엔드포인트 확장, `POST /game-rooms/{roomId}/results` 요청 형식 변경, `POST /solo-results` 신규, `GET /rankings`에 쿼리 파라미터 추가). 방 WebSocket 메시지 타입 2종 추가(서버→클라이언트 `PEER_READY_CHANGED`, 클라이언트→서버 `WEBRTC_CONNECTED`). 신규 테이블 1개(`game_results`), 기존 테이블 1개 완전 제거(`game_sessions`, research.md #8).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md`가 001/002와 동일하게 플레이스홀더 템플릿 상태로, 이 프로젝트에 특정된 원칙이 정의되어 있지 않다. 따라서 이번 계획에 적용할 추가 게이트는 없으며, Spec Kit 기본 원칙(스펙 대비 최소 복잡도, 정당화 없는 편차 금지)만 따른다. **위반 사항 없음 — Complexity Tracking 불필요.**

**Post-Design Re-check (Phase 1 완료 후)**: research.md/data-model.md/contracts/quickstart.md 작성 결과, 신규 테이블(`game_results`)은 spec.md가 명시한 "세 게임 종류 공통 저장 구조" 결정(Assumptions)의 직접적 결과이지 임의의 복잡도 추가가 아니다. 솔로 결과 API를 게임방 도메인과 완전히 분리한 것도 spec.md FR-027이 명시한 요구사항을 그대로 반영한 것이다. 게이트 위반 없음 — 재확인 통과.

## Project Structure

### Documentation (this feature)

```text
backend/specs/003-webrtc-handoff-flow/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
│   ├── game-rooms-api-delta.yaml
│   ├── solo-results-api.yaml
│   ├── ranking-api-delta.yaml
│   └── realtime-websocket-messages-delta.md
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
│   │   │   ├── game/
│   │   │   │   ├── domain/
│   │   │   │   │   ├── GameRoom.java                # [변경] gameType 필드 추가(GameType enum, US6)
│   │   │   │   │   ├── GameType.java                 # [신규] enum SIGN_DUEL, TETRIS_DUEL (대전 모드 2종)
│   │   │   │   │   └── GameSession.java               # [삭제] game_sessions 테이블 자체가 제거됨(research.md #8) — write-only였고 game_results가 승/패 집계를 전부 대체
│   │   │   │   ├── dto/
│   │   │   │   │   ├── GameRoomResponse.java          # [변경] gameType, realtimeTicket 필드 추가(US1/US6)
│   │   │   │   │   ├── CreateRoomRequest.java         # [신규] gameType 필수 필드(US6) — 지금은 요청 바디 없이 POST /game-rooms 호출
│   │   │   │   │   ├── GameResultRequest.java         # [변경] hostScore/guestScore 제거, winnerUserId(nullable) 하나로 대체(FR-021/033)
│   │   │   │   │   └── GameResultResponse.java        # [변경] score, gameSessionId 필드 제거(FR-021, research.md #8) — winnerUserId만 남음
│   │   │   │   ├── repository/
│   │   │   │   │   ├── GameRoomRepository.java        # 변경 없음
│   │   │   │   │   └── GameSessionRepository.java      # [삭제] GameSession과 함께 제거
│   │   │   │   ├── service/
│   │   │   │   │   └── GameRoomService.java           # [변경] create(gameType) 시그니처 변경 + 커밋 직후 티켓 발급(FR-001), reportResult가 점수 비교 대신 winnerUserId 직접 반영(FR-021/033) + 결과 후 CLOSED 대신 WAITING 복귀(FR-013~016) + game_results에 승자(score=1)·패자(score=0) 행 함께 기록(더 이상 GameSession을 생성하지 않음), setReady가 커밋 직후 준비 상태 브로드캐스트(FR-030)
│   │   │   │   ├── realtime/
│   │   │   │   │   ├── GameRoomWebSocketHandler.java   # [변경] 클라이언트 메시지 타입에 WEBRTC_CONNECTED 분기 추가(FR-003/004), afterConnectionClosed가 "의도된 종료 대기" 상태면 유예 타이머 생략(FR-004)
│   │   │   │   │   ├── ParticipantLiveState.java       # [변경] expectingIntentionalClose(boolean) 필드 추가 — WEBRTC_CONNECTED 수신 시 true, 유예 타이머 분기에 사용
│   │   │   │   │   ├── RoomRealtimeNotifier.java       # [변경] notifyReadyChanged(roomId, userId, isReady) 메서드 추가(FR-030) — WebSocketRoomRealtimeNotifier도 함께 변경
│   │   │   │   │   └── dto/LobbyRoomSummary.java        # [변경] gameType 필드 추가(FR-018) — LobbyBroadcastService가 조립하는 로비 SSE 전용 record, GameRoomResponse와 별개라 따로 추가 필요
│   │   │   │   └── controller/
│   │   │   │       └── GameRoomController.java         # [변경] createRoom이 gameType 파라미터를 받음
│   │   │   ├── gameresult/                              # [신규 최상위 패키지] 게임방 도메인과 완전히 독립(FR-027), 세 게임 종류 공통 저장소를 대전/솔로/랭킹 3개 서비스가 공유
│   │   │   │   ├── domain/
│   │   │   │   │   ├── GameResult.java                 # [신규] 세 게임 종류 공통 엔티티(game_results 테이블)
│   │   │   │   │   └── GameResultType.java              # [신규] enum SIGN_DUEL, TETRIS_DUEL, TETRIS_SOLO (게임 결과 3종, game/domain/GameType과는 다른 별도 enum)
│   │   │   │   ├── repository/
│   │   │   │   │   └── GameResultRepository.java       # [신규] GameRoomService/SoloResultService/RankingService 3곳에서 공유(Structure Decision 참고)
│   │   │   │   ├── dto/
│   │   │   │   │   ├── SoloResultRequest.java           # [신규] score 하나만
│   │   │   │   │   └── SoloResultResponse.java          # [신규]
│   │   │   │   ├── service/
│   │   │   │   │   └── SoloResultService.java           # [신규] 검증 없이 저장만(FR-028)
│   │   │   │   └── controller/
│   │   │   │       └── SoloResultController.java        # [신규] POST /solo-results
│   │   │   ├── ranking/
│   │   │   │   ├── controller/
│   │   │   │   │   └── RankingController.java           # [변경] gameType 쿼리 파라미터 필수
│   │   │   │   ├── dto/
│   │   │   │   │   └── RankingResponse.java              # [변경] me가 nullable(미플레이 시 랭킹 없음, US9 AC4)
│   │   │   │   └── service/
│   │   │   │       └── RankingService.java               # [변경] users.win_count/loss_count 대신 game_results SUM(승수)/MAX(솔로 최고점) 집계, 대전 동률 시 COUNT(*)-SUM(패수) 오름차순 2차 정렬(FR-025/026/029/032)
│   │   │   └── (auth/ user/ learning/ growth/ webrtc/ — 변경 없음, 002 그대로 재사용)
│   │   └── resources/
│   │       ├── schema/                                   # [신규 디렉터리] 스키마 변경 SQL 스크립트 (순서대로 실행)
│   │       │   ├── 01_add_game_type_to_game_rooms.sql
│   │       │   ├── 02_create_game_results.sql
│   │       │   ├── 03_migrate_win_count_to_game_results.sql
│   │       │   └── 04_drop_game_sessions_and_users_counters.sql
│   │       └── application.yaml                          # [변경] jpa.hibernate.ddl-auto 설정 유지
│   └── test/
│       └── java/backend/ssafy/suhwa/
│           ├── game/service/GameRoomServiceTest.java      # 케이스 추가: gameType 생성, 결과 보고(승자/패자 game_results 반영, 무승부), 결과 후 WAITING 복귀
│           ├── game/realtime/GameRoomWebSocketHandlerTest.java  # 케이스 추가: WEBRTC_CONNECTED 수신 후 정상 종료(유예 없음), 신호 없는 종료는 기존과 동일(회귀), 준비 상태 브로드캐스트
│           ├── gameresult/                                 # [신규 패키지 미러링] 컨트롤러/서비스 테스트
│           └── ranking/service/RankingServiceTest.java      # 케이스 추가: 게임 종류별 분리, 승수 동률 시 패수 오름차순 정렬, 미플레이 시 me=null
└── build.gradle            # 변경 없음
```

**Structure Decision**: 솔로 결과·공통 결과 저장소는 게임방 도메인과 완전히 무관한 별도 최상위 패키지 `gameresult/`로 분리한다 — spec.md FR-027이 "게임방 개념을 전혀 쓰지 않는다"를 명시적으로 요구하므로, `game/` 패키지 아래 두면 "게임방과 무관하다"는 설계 의도가 패키지 구조에서부터 흐려진다(webrtc/가 게임방 도메인과 독립된 최상위 패키지로 분리된 002의 선례를 따름). 패키지명을 `soloresult`가 아니라 `gameresult`로 정한 이유는, 이 패키지가 실제로는 솔로 결과 API(`SoloResultController`)뿐 아니라 **대전 모드 승/패 기록까지 함께 담는 `GameResult`/`GameResultRepository`**를 갖고 있어 "솔로"라는 이름이 범위를 잘못 좁혀 보이게 하기 때문이다 — 패키지 이름은 공통 저장 구조(`GameResult`) 기준으로, API 경로(`/solo-results`)는 FR-027의 "솔로 전용" 의도 기준으로 각각 독립적으로 정했다(research.md #9).

`game_results`(공통 저장 구조)는 대전 모드의 결과(GameRoomService, 승자/패자 행 함께 기록)와 솔로 결과(SoloResultService), 랭킹 집계(RankingService) 세 서비스가 함께 참조하는 테이블이라, `gameresult/domain/GameResult.java`에 두고 세 서비스 모두 `GameResultRepository`를 직접 참조하도록 한다. 이건 spec.md가 명시한 "세 게임 종류가 하나의 공통 구조를 쓴다"는 결정 자체가 만드는 자연스러운 결합이라 임의의 복잡도 증가는 아니지만, 3개의 서로 다른 도메인 서비스가 하나의 리포지토리를 직접 참조하는 구조는 이 프로젝트가 기존 백로그에서 잡아둔 ArchUnit 모듈 경계 원칙("리포지토리는 같은 모듈의 서비스에서만 접근", STABLE-08-11)과 정면으로 부딪힌다. 003 구현 시점에 STABLE-08-11의 ArchUnit 규칙이 이미 적용되어 있다면 `GameResultRepository`에 대해 그 규칙의 명시적 예외로 등록하거나, 규칙 자체를 "공통 저장 구조는 예외"로 다듬는 조정이 필요하다 — 이 계획 문서 범위에서는 결합 자체를 만드는 결정만 확정하고, ArchUnit 규칙과의 구체적 조율은 구현 착수 시점(STABLE-08-11 완료 여부에 따라) 확인하도록 남겨둔다.

## Complexity Tracking

> Constitution Check에 위반 사항이 없으므로 이 표는 비워둔다.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
