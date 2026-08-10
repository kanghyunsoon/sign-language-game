# Research: 실시간 로비/게임방 알림(SSE)과 WebRTC 시그널링 도입 (선행 안정화 포함)

Technical Context의 결정 지점과, 001 스펙 research.md 말미에 "WebSocket 도입 시 재검토가 필요한 항목"으로 이미 예고돼 있던 두 가지 이월 과제를 함께 정리한다. 대부분 기존 `backend/suhwa` 코드베이스(001에서 이미 구현된 부분)를 그대로 확장하는 결정이라, 외부 리서치보다는 저장소 안에서 확인 가능한 사실 기반으로 결정했다.

## 1. 401/403 오류 응답을 `GlobalExceptionHandler`와 통일 (FR-001, SEC-1+SEC-5)

- **Decision**: `SecurityConfig`의 `authenticationEntryPoint`/`accessDeniedHandler`에서 응답을 직접 `write`하지 않고, `BusinessException(ErrorCode.UNAUTHENTICATED)` / `BusinessException(ErrorCode.ACCESS_DENIED)`(신규 코드, 403)를 만들어 Spring이 등록한 `HandlerExceptionResolver` 빈(`@Qualifier("handlerExceptionResolver")`로 주입되는 합성 리졸버)에 위임한다. 이 합성 리졸버는 `ExceptionHandlerExceptionResolver`를 포함하고 있어, 이미 존재하는 `GlobalExceptionHandler`(`@RestControllerAdvice`)의 `@ExceptionHandler(BusinessException.class)`가 그대로 실행되어 다른 API 오류와 완전히 동일한 `ErrorResponse` 바디가 나간다.
- **Rationale**: 현재 `SecurityConfig`(`common/config/SecurityConfig.java`)는 401을 하드코딩된 JSON 문자열로 직접 write하고, 403은 아예 핸들러가 없다(001 quickstart 검증 중 발견한 임시 조치가 그대로 남아있는 상태). 응답 포맷을 두 군데(Security 필터, GlobalExceptionHandler)에서 유지하면 실시간 인증(티켓, WebSocket 핸드셰이크)이 추가될 때마다 어긋날 위험이 커진다. `HandlerExceptionResolver` 위임은 기존 `GlobalExceptionHandler`를 재사용하는 표준 Spring Security 연동 패턴이라 코드 중복이 없다.
- **Alternatives considered**:
  - `AuthenticationEntryPoint`/`AccessDeniedHandler`에서 `ErrorResponse`를 직접 생성해 write — 포맷은 통일되지만 `GlobalExceptionHandler`와 별개 코드 경로가 유지되어, 향후 `ErrorResponse` 구조가 바뀌면 두 곳을 동시에 고쳐야 함. 채택하지 않음.

## 2. 낙관적 락과 충돌 응답 매핑 (FR-002, CORR-1)

- **Decision**: `GameRoom`에 `@Version private Long version` 필드를 추가한다(JPA 표준 낙관적 락). 서비스 계층에서 트랜잭션 커밋 시 발생하는 `ObjectOptimisticLockingFailureException`을 `GlobalExceptionHandler`에 새 `@ExceptionHandler`로 잡아 신규 `ErrorCode.CONCURRENT_UPDATE_CONFLICT`(409)로 매핑한다.
- **Rationale**: JPA 표준 기능만으로 해결 가능해 추가 의존성이 없다. `game_rooms`는 트래픽이 몰려도 행 단위 경합이 매우 낮은 테이블(방 하나당 최대 2명)이라 비관적 락(`SELECT ... FOR UPDATE`)의 대기 비용을 감수할 이유가 없다.
- **Alternatives considered**: 비관적 락 — 동시 접속자가 늘어도 방 하나의 동시 편집자는 최대 2명으로 고정이라 잠금 대기 오버헤드가 이득보다 크다고 판단해 제외.

## 3. 준비 상태 변경 가드 (FR-003, CORR-3)

- **Decision**: `GameRoomService.setReady()` 진입부에 `room.getStatus() != WAITING`이면 기존 `ErrorCode.ROOM_NOT_WAITING`을 던지는 한 줄을 추가한다.
- **Rationale**: 이미 존재하는 에러 코드를 재사용하면 되므로 별도 설계가 필요 없다. `start()`가 이미 같은 검사를 하고 있어(`GameRoomService.java`) 대칭성도 맞는다.
- **Alternatives considered**: 해당 없음(가장 단순한 해법이 곧 정답인 경우).

## 4. WAITING 방 정리 확장과 재시작 시 정합화 (FR-004, FR-028, CORR-4)

- **Decision**: 두 가지를 분리해서 구현한다.
  1. `GameRoomRepository`에 `findByStatusAndUpdatedAtBefore(WAITING, threshold)` 조회를 추가(기존 CLOSED용 메서드와 대칭)하고, `GameRoomCleanupScheduler`가 CLOSED 삭제에 더해 WAITING도 같은 배치에서 함께 삭제하되 보관 기간 값은 별도 설정(`game.room.waiting-room-retention`, 예: 30분)으로 분리한다. `IN_PROGRESS`는 이 조회 대상에 절대 포함하지 않는다(FR-004에서 이미 확정).
  2. FR-028(서버 재시작 시 정합화)은 별개의 매커니즘이다 — `ApplicationReadyEvent` 리스너(`GameRoomStartupReconciler`)가 애플리케이션 기동 직후 1회, `status IN (WAITING, IN_PROGRESS)`인 모든 방을 대량 `UPDATE`로 `CLOSED` 전환한다. 스케줄러(주기적, 보관 기간 기준)와 시동 정합화(1회성, 상태 기준)는 트리거 조건이 다르므로 같은 클래스에 두지 않는다.
- **Rationale**: 스케줄러는 "얼마나 오래 방치됐는가"를, 시동 정합화는 "재시작 직후라 인메모리 실시간 상태를 신뢰할 수 없다"는 서로 다른 문제를 푼다. 재시작 정합화를 스케줄러 주기에 맡기면 재시작 직후 최대 한 주기(예: 1분)만큼 좀비 방이 노출되는 창이 생기므로, `ApplicationReadyEvent`로 즉시(동기적으로) 처리한다.
- **Alternatives considered**: FR-028을 스케줄러의 "첫 실행"에 끼워 넣는 방식 — 스케줄러 주기와 결합되어 두 관심사가 한 클래스에 섞이고, 재시작 시 지연 없이 즉시 정리해야 한다는 요구(FR-028)를 스케줄 주기가 대신 보장해줄 수 없어 채택하지 않음.
- **Part B 정교화(리뷰로 발견, FR-030)**: FR-004(WAITING 방 정리)는 Part A 시점에는 `game_rooms.updated_at`만 기준으로 삼는다 — 이 시점엔 아직 실시간 연결 개념 자체가 없기 때문이다. 그런데 Part B가 도입된 뒤에는 이 기준만으로 판단하면, 방을 만들고 실시간 연결까지 확립한 뒤 상대를 오래 기다리기만 하는(READY 토글 등 DB를 갱신할 이유가 전혀 없는) 정상적인 호스트의 방까지 "방치"로 오판해 삭제하는 문제가 생긴다(리뷰에서 발견). 이를 막기 위해 `GameRoomCleanupScheduler`가 삭제 대상 후보 방마다 `RoomParticipantRegistry`를 함께 조회해, `confirmed=true`인 살아있는 참가자가 하나라도 있으면 그 방은 삭제 대상에서 제외한다(FR-030). 이 정교화는 Part B의 산출물(`RoomParticipantRegistry`)에 의존하므로 Part A 시점에는 구현하지 않고, Part B 작업으로 분류한다 — `game/scheduler`가 `game/realtime`에 의존하게 되는 셈이지만, `game/service`가 이미 같은 방향으로 의존하고 있어(research.md #12) 새로운 패턴은 아니다.
- **Alternatives considered(FR-030)**: `game_rooms.updated_at`을 살아있는 WebSocket 연결이 있는 동안 주기적으로 "하트비트 갱신"하는 방식 — 매 하트비트마다 불필요한 DB write가 발생해 트래픽이 늘수록 부담이 커지므로, 삭제 시점에만 레지스트리를 조회하는 훨씬 저렴한 방식을 채택.

## 5. 스케줄러 전용 스레드풀 분리 (FR-005, PERF-7)

- **Decision**: `ThreadPoolTaskScheduler` 빈을 `SchedulingConfig`에 등록하고(`poolSize` 4 이상), `SchedulingConfigurer.configureTasks()`에서 이 스케줄러를 사용하도록 지정한다. 기존 `@Scheduled` 메서드(`GameRoomCleanupScheduler`, 신규 `GameRoomStartupReconciler`는 `@Scheduled`가 아니라 이벤트 기반이라 무관)와 향후 추가될 SSE Heartbeat(15초 주기)가 이 풀을 공유한다.
- **Rationale**: Spring Boot는 `@EnableScheduling`만 있으면 기본적으로 풀 크기 1인 단일 스레드 스케줄러를 사용해, 한 작업이 오래 걸리면 다른 주기 작업의 실행 시각이 그대로 밀린다(FR-005가 명시적으로 금지하는 상황). `ThreadPoolTaskScheduler`는 Spring 표준 빈이라 추가 의존성이 없다.
- **Alternatives considered**: 작업마다 별도 `@Async` 스레드 — 스케줄 트리거 자체는 여전히 단일 스레드에서 순차 디스패치되므로 근본 해결이 아니어서 제외.

## 6. 서비스가 엔티티 대신 DTO 반환 (FR-006, ARCH-4)

- **Decision**: `GameRoomService.create/join/leave/setReady/start`가 `GameRoomResponse`(기존 DTO, `reportResult`는 이미 이 패턴을 따름)를 직접 반환하도록 시그니처를 바꾸고, `GameRoomController`의 `GameRoomResponse.from(entity)` 호출을 제거한다. `leave()`는 반환값이 없던 기존 시그니처(`void`)를 유지한다 — 나가기 이후 조회할 대상이 없기 때문(달라지는 건 나머지 4개 메서드뿐).
- **Rationale**: 서비스가 리포지토리에서 막 조회한 영속 엔티티를 그대로 반환하면, 이후 실시간 브로드캐스트(FR-010 등)가 REST 응답과 SSE/WebSocket 페이로드에 각각 다른 변환 로직을 두게 될 위험이 있다. 변환을 서비스 경계로 당겨두면 두 경로(REST 응답, 브로드캐스트 페이로드) 모두 같은 `GameRoomResponse.from(...)` 호출 하나만 재사용한다.
- **Alternatives considered**: 컨트롤러에 변환을 그대로 두고 브로드캐스트 유틸에서 별도로 변환 — 변환 로직이 두 곳에 존재하게 되어 필드 하나가 추가될 때마다 두 곳을 동기화해야 함. 채택하지 않음.

## 7. CORS 허용 정책 (FR-007)

- **Decision**: `CorsConfigurationSource` 빈을 추가해 `CORS_ALLOWED_ORIGINS`(콤마 구분 문자열) 환경 변수를 파싱한 목록을 허용 Origin으로 등록하고, `SecurityConfig`의 `HttpSecurity`에 `.cors(...)`로 연결한다. 로컬 개발 기본값은 `env.sample`에 빈 값 또는 `http://localhost:5173` 같은 예시로 남긴다.
- **Rationale**: Spring Security 6+ 이후 CORS는 `SecurityFilterChain`에 명시적으로 연결하지 않으면 무시되므로, `WebMvcConfigurer.addCorsMappings`만으로는 Security가 적용된 API 경로에는 반영되지 않는다. `CorsConfigurationSource` + `.cors()` 연결이 표준 방식이다.
- **Alternatives considered**: `@CrossOrigin` 어노테이션을 컨트롤러마다 부착 — 엔드포인트가 늘어날 때마다 누락 위험이 있고 환경별 Origin 전환(env var)이 불가능해 제외.

## 8. 실시간 인증 티켓 설계 — 로비 SSE와 방 내 WebSocket 공통 (FR-008, FR-023, FR-024)

- **Decision**: DB 테이블을 새로 만들지 않고, `ConcurrentHashMap<String ticket, TicketEntry(userId, expiresAt)>` 기반의 인메모리 저장소(`RealtimeTicketService`, `auth` 패키지)로 구현한다. `POST /auth/sse-ticket`은 `SecureRandom` 기반 불투명 문자열을 발급해 맵에 저장한다. **이 티켓은 로비 SSE(`GET /game-rooms/subscribe?ticket=...`)뿐 아니라 방 내 WebSocket 핸드셰이크(`/ws/game-rooms/{roomId}?ticket=...`)에도 동일하게 사용된다** — 브라우저 표준 `WebSocket` API 역시 `EventSource`와 마찬가지로 핸드셰이크에 커스텀 헤더를 실어보낼 수 없기 때문이다(초안 단계에서 "WebSocket은 커스텀 헤더를 보낼 수 있다"고 잘못 가정했던 부분을 리뷰로 발견해 수정 — `wscat`/Postman 같은 CLI 도구는 가능하지만 실제 브라우저 `new WebSocket(url)`은 불가능). 두 경우 모두 연결 시도 시점에 필터/인터셉터가 맵에서 조회 즉시 **제거(consume)** 하여 1회성을 보장한다. 만료된 항목은 스케줄러(같은 `ThreadPoolTaskScheduler` 재사용)로 주기적으로 청소한다.
- **Rationale**: 단일 인스턴스 운영이 확정되어 있고(Assumptions) 티켓 수명이 수 초~수십 초로 매우 짧아, DB 왕복 비용을 감수할 이유가 없다. 서버 재시작 시 미사용 티켓이 사라지는 것도 티켓의 일회성·단기성과 자연스럽게 부합한다(재로그인 없이 재발급만 요청하면 됨). 두 연결 종류에 서로 다른 인증 방식(티켓 vs Authorization 헤더)을 쓰면 `HandshakeInterceptor`와 SSE 인터셉터가 별개 로직을 유지해야 해 불필요하게 복잡해지므로, 동일한 티켓 발급/소비 로직을 재사용한다.
- **Alternatives considered**: `refresh_tokens`처럼 DB 테이블로 관리 — 티켓 하나의 수명이 초 단위인데 DB 테이블/정리 스케줄까지 두는 것은 과설계(YAGNI)라 제외. 방 WebSocket에서는 기존 로그인 인증 정보(JWT)를 Authorization 헤더로 직접 검증 — 브라우저 표준 WebSocket API가 커스텀 헤더를 지원하지 않아 실제 프론트엔드 연동 시 핸드셰이크가 항상 실패하므로 제외(리뷰에서 발견해 폐기).

## 9. 로비 SSE 구현 방식 (FR-009~FR-014)

- **Decision**: `GET /game-rooms/subscribe`를 `SseEmitter` 기반으로 구현하고, `LobbySubscriberRegistry`(`ConcurrentHashMap<String sessionId, SseEmitter>`)로 구독자를 관리한다. 응답에는 `X-Accel-Buffering: no` 헤더를 명시적으로 추가한다(Nginx 프록시 버퍼링 방지, 아키텍처 결정 사항). `LobbyBroadcastService`가 방 생성/입장/퇴장/방장위임/인원변경/상태전환(FR-010) 지점에서 호출되어 등록된 모든 emitter에 최신 목록(또는 변경분)을 `send()`한다. `emitter.onCompletion/onTimeout/onError`에서 레지스트리 제거 콜백을 등록한다(FR-014). 15초 주기 하트비트(빈 이벤트 `send`)를 스케줄러(#5의 풀 재사용)로 발송해 Nginx/브라우저 타임아웃을 방지한다.
- **Rationale**: `SseEmitter`는 `spring-boot-starter-webmvc`에 이미 포함돼 있어 추가 의존성이 없다. 단일 인스턴스 + 인메모리 레지스트리는 Redis Pub/Sub 없이 브로드캐스트를 구현할 수 있는 가장 단순한 방법(아키텍처 결정 1).
- **Alternatives considered**: Server 자체 폴링 대신 클라이언트 폴링 — 스펙이 명시적으로 "폴링 없이" 반영을 요구(FR-009)해 제외. WebFlux `SseEmitter`(Reactive) 전환 — 현재 스택이 `spring-boot-starter-webmvc`(서블릿 기반)이고 굳이 리액티브 스택 전체를 도입할 필요가 없어 제외.

## 9-1. 로비/방 브로드캐스트 호출 위치 — `leave()`와 동일한 원칙으로 통일 (FR-010, FR-021, FR-022, 리뷰로 발견)

- **Decision**: `LobbyBroadcastService`(FR-010)와 `RoomRealtimeNotifier.notifyGameStarted()`(FR-021)를 호출하는 지점을 `GameRoomController`가 아니라 `GameRoomService`의 각 메서드 내부(커밋 직후)로 명시적으로 고정한다 — `create()`(방 생성 브로드캐스트), `join()`(단, 재입장이 아니라 실제로 새 참가자가 배정된 경로에서만), `leave()`(이미 #12에서 확정), `start()`(로비 목록에서 제거 + 방 내 `GAME_STARTED` 두 가지 모두)가 각각 트랜잭션 커밋 직후 해당 유틸을 호출한다.
- **Rationale**: `leave()`의 `PEER_LEFT` 브로드캐스트 설계(#12)를 컨트롤러가 아닌 서비스 내부에 고정한 것과 정확히 같은 이유다 — 브로드캐스트 호출을 컨트롤러 쪽에 맡기면 향후 새 진입점(예: 관리자 API, 배치 작업)이 추가될 때마다 그 진입점에서도 브로드캐스트 호출을 빠뜨리지 않아야 하는 부담이 생긴다. 서비스 메서드 안에 고정해두면 그 메서드를 호출하는 진입점이 몇 개든 브로드캐스트가 자동으로 따라온다. 리뷰 중 `RoomRealtimeNotifier.java`의 클래스 설명에는 "`GameRoomService`가 FR-021 때문에 의존한다"고 이미 적어뒀으면서 정작 `GameRoomService.java` 계획에는 `start()`가 그 인터페이스를 호출한다는 내용이 빠져 있던 것과, `LobbyBroadcastService`는 아예 호출 시점 자체가 명시돼 있지 않았던 것을 발견해 이번에 통일했다.
- **Alternatives considered**: `GameRoomController`가 서비스 호출 후 별도로 브로드캐스트 유틸을 호출 — 컨트롤러 메서드마다 "서비스 호출 + 브로드캐스트 호출" 두 줄을 항상 짝지어 기억해야 해서, 하나라도 빠뜨리면(리뷰에서 실제로 한 번 빠졌던 것처럼) 조용히 무음 처리되는 위험이 있어 채택하지 않음.

## 10. 방 내 실시간 연결 전송 방식: 순수 WebSocket vs STOMP

- **Decision**: STOMP(`spring-boot-starter-websocket`의 메시지 브로커 추상화) 대신 **순수 `TextWebSocketHandler`**로 구현한다. 엔드포인트는 `/ws/game-rooms/{roomId}`이며, 메시지는 `{"type": "...", "payload": {...}}` 형태의 단순 JSON으로 직접 파싱/전송한다.
- **Rationale**: STOMP는 다대다 토픽 구독/브로커 릴레이(예: RabbitMQ 연동)에 강점이 있는데, 이 기능은 방 하나에 최대 2명만 있는 1:1 구조라 브로커의 이점이 거의 없다. `HandshakeInterceptor`로 티켓+참가자 검증(FR-024, #8 참고)을 걸기도 순수 WebSocket 쪽이 더 직접적이다.
- **Alternatives considered**: STOMP + `SimpMessagingTemplate` — 세션 대 방 매핑을 위한 커스텀 코드가 STOMP를 쓰든 안 쓰든 필요해, 브로커 추상화가 주는 이득이 이 규모에서는 복잡도 증가에 미치지 못한다고 판단해 제외.

## 11. Live Room Membership과 기존 DB `ready` 컬럼의 관계 (FR-012, FR-019~FR-020, 001 이월 항목 해소)

- **Decision**: `RoomParticipantRegistry`(`ConcurrentHashMap<Long roomId, RoomLiveState>`)가 참가자별 연결 세션(WebSocket session), 확정 여부(`confirmed`), ready 상태, 대기 타이머(최초 연결 확인 대기 또는 재접속 유예, #14 참고)를 인메모리로 관리한다. 이 레지스트리 엔트리는 **WebSocket 연결이 처음 열릴 때가 아니라, REST `create()`/`join()`이 참가자를 확정하는 시점에 이미 생성**된다(`confirmed=false`, `session=null` 상태로 시작 — #14의 확인 대기 타이머와 맞물린 결정). 단, ready 상태의 **원본(source of truth)은 여전히 `game_rooms.host_ready`/`guest_ready` 컬럼**이다(001의 REST `/ready` 엔드포인트가 그대로 유지되므로, Out of Scope에 명시). `RoomLiveState`의 ready 필드는 REST `/ready` 처리 직후 서비스가 함께 갱신해주는 **쓰기-스루(write-through) 캐시**로, WebSocket 연결/재연결 시 매번 DB를 다시 읽지 않고 즉시 현재 상태를 내려주기 위한 용도로만 존재한다.
- **Rationale**: 001 research.md가 "Ready 토글의 쓰기 전략"을 WebSocket 도입 시점의 재검토 과제로 명시적으로 남겨뒀다. 이번 스펙에서 결론: **컬럼을 없애거나 쓰기 경로를 DB에서 완전히 메모리로 옮기지는 않는다** — 001의 REST 계약(FR-025/026, 이미 구현됨)을 그대로 재사용하기로 확정했으므로(Assumptions) DB가 여전히 필요하다. 대신 인메모리 캐시를 얹어 재접속·브로드캐스트 시 추가 DB 조회를 피한다. 이는 롤백이 아니라 001이 예상한 "쓰기 시점/방식의 최적화"에 해당한다.
- **Alternatives considered**: DB 컬럼을 완전히 제거하고 인메모리만 신뢰 — 재시작 시 FR-028로 방을 강제 CLOSED하므로 데이터 유실 자체는 감수 가능하지만, 001에서 이미 확정·구현된 REST 계약(`GameRoomResponse.hostReady/guestReady`)을 깨야 해서 채택하지 않음(Out of Scope 위반).

## 12. 퇴장 유예 타이머와 재접속 처리 — 최초 연결 확인 대기(#14)와 동일한 타이머 재사용 (FR-017~FR-020, FR-029)

- **Decision**: 하나의 일반화된 메커니즘으로 두 시나리오를 모두 처리한다 — (a) REST로 참가자가 확정된 직후 아직 한 번도 연결하지 않은 "최초 확인 대기"(#14, 15초)와 (b) 확정된 참가자의 WebSocket 연결이 비정상 종료된 "재접속 유예"(5~10초). 두 경우 모두 `ParticipantLiveState`에 데드라인(`pendingDeadline`)과 1회성 지연 작업(`pendingTask: ScheduledFuture`, 같은 스케줄러 풀 #5 재사용)을 기록해두고, 취소되지 않으면 `GameRoomService.leave(roomId, userId)`(001에서 이미 순수 도메인 파라미터만 받도록 분리돼 있음, research.md #9)를 그대로 호출한다. WebSocket 핸드셰이크가 성공하면(최초 연결이든 재연결이든 동일한 코드 경로) 등록된 `pendingTask`를 `cancel()`하고, `confirmed=true`로 표시하며 `session`을 갱신한다. 이때 `ParticipantLiveState.session`이 이전 세션 객체를 여전히 들고 있다면(예: 여러 탭에서 중복 연결) 새 세션으로 교체하기 전에 이전 세션을 서버가 명시적으로 `close()`한다(data-model.md 참고 — 문자열 ID만으로는 이 close 자체가 불가능하므로 세션 객체를 직접 보관하는 이유).
- **Rationale**: 001의 research.md #9가 정확히 이 상황("소켓 연결 종료 이벤트에서도 leave 로직 재사용")을 예상하고 서비스 계층을 미리 HTTP-비종속으로 분리해뒀다 — 지금 그 설계가 그대로 들어맞는다. 재사용 가능한 `ScheduledFuture` 취소 방식은 별도 폴링 없이 정확한 시점에 1회 실행된다. "최초 확인 대기"와 "재접속 유예"를 같은 필드/타이머로 묶은 이유는, 두 상태가 한 참가자에게 동시에 존재할 수 없고(아직 확정되지 않았거나 확정 후 끊겼거나 둘 중 하나) 취소·만료 처리 로직이 완전히 동일하기 때문이다(차이는 오직 데드라인 값 15초 vs 5~10초와 시작 트리거뿐).
- **Alternatives considered**: 별도 폴링 스케줄러가 매초 만료된 유예 상태를 스캔 — 폴링 주기만큼 지연이 생기고 5~10초라는 짧은 유예 시간에는 오차가 체감될 수 있어, 정확한 1회성 타이머(`ScheduledFuture`)를 채택. "최초 확인 대기"용 필드를 "재접속 유예"용 필드와 별도로 두는 방안 — 두 상태를 동시에 가질 일이 없어 필드를 중복시키는 것이 불필요한 복잡도라 판단해 하나로 통합.
- **추가 결정(리뷰로 발견)**: `PEER_LEFT` 브로드캐스트는 유예 만료 경로뿐 아니라 `POST /game-rooms/{roomId}/leave`(명시적 나가기, FR-016)에서도 동일하게 발생해야 한다 — 그렇지 않으면 상대방이 아직 방 WebSocket에 연결돼 있는 동안 상대의 명시적 퇴장을 실시간으로 알 방법이 없다(폴링/새로고침 전까지는 방장 위임·인원 변경을 모른 채 남게 됨). 이 브로드캐스트 호출은 **`GameRoomController`나 `GameRoomWebSocketHandler`가 각자 호출하는 것이 아니라, `GameRoomService.leave(roomId, userId)` 내부에서 한 번만** 트리거한다 — `leave()`는 두 경로(REST 컨트롤러의 명시적 나가기, WebSocket 유예 타이머 만료) 모두에서 동일하게 호출되는 단일 진입점이므로(001 research.md #9의 설계가 그대로 유효), 브로드캐스트를 `leave()` 안에 두면 두 호출자 모두에서 자동으로 동작하고 어느 한쪽에서 호출을 빠뜨릴 위험이 없다. 이를 위해 `game/realtime`에 `RoomRealtimeNotifier`(인터페이스 + 구현체)를 두고 `GameRoomService`가 이를 주입받아 `leave()` 트랜잭션 커밋 후 `notifyPeerLeft(roomId, leftUserId, newHostUserIdOrNull)`을 호출한다. `GameRoomController.leaveRoom()`은 그대로 변경 없음(서비스 호출만 하던 기존 코드 그대로 유지). (참고: `game/service`가 `game/realtime`의 인터페이스에 의존하고 `game/realtime`(WebSocket 유예 타이머)이 다시 `game/service`를 호출하는 양방향 패키지 참조가 생기지만, 클래스 단위로는 순환이 아니라 Spring DI로 정상 동작한다. `ApplicationEventPublisher`로 완전히 분리하는 대안도 있으나, 리스너 등록/이벤트 클래스 설계 비용이 이 규모의 기능(방 하나당 최대 2명)에는 과하다고 판단해 직접 인터페이스 주입을 채택했다.)

## 13. WebRTC 시그널링 릴레이와 ICE 서버 정보 전달 (FR-024~FR-027)

- **Decision**: 시그널 메시지(offer/answer/candidate)는 방 WebSocket(#10)의 메시지 타입 중 하나(`type: "SIGNAL"`)로 취급해, 같은 방의 상대방 세션에만 payload를 가공 없이 그대로 전달한다(FR-025/026). STUN/TURN 접속 정보는 `@ConfigurationProperties(prefix = "webrtc")`로 환경 변수(`WEBRTC_STUN_URLS`, `WEBRTC_TURN_URL`, `WEBRTC_TURN_USERNAME`, `WEBRTC_TURN_CREDENTIAL`)에서 읽어, 별도 REST 엔드포인트 `GET /webrtc/ice-servers`(일반 JWT 인증만 요구, 방 소속 여부는 무관 — 자격 증명 자체가 인프라 설정값이라 방마다 다르지 않음)로 제공한다(FR-027).
- **Rationale**: 시그널링을 별도 WebSocket 엔드포인트로 분리하지 않고 방 WebSocket에 메시지 타입으로 얹으면, 참가자 인증/방 소속 검증(FR-024, User Story 13)을 중복 구현하지 않고 재사용할 수 있다. ICE 서버 정보는 요청마다 바뀌지 않는 정적 설정값이라 굳이 방별 WebSocket 핸드셰이크에 끼워 넣기보다 캐시 가능한 REST로 분리하는 편이 단순하다.
- **Alternatives considered**: ICE 서버 정보를 WebSocket 최초 연결 시 서버가 push — 방 참가자마다 다시 계산할 이유가 없는 정적 값을 굳이 실시간 채널로 보낼 필요가 없어 제외.

## 14-1. 재입장(reentry) 인식 — 기존 `join()`이 FR-020을 위반하는 격차 해소 (FR-020)

- **Decision**: `GameRoomService.join()` 시작부, `room.getStatus() != WAITING`/`room.isFull()` 검사보다 먼저 `if (room.isParticipant(userId)) { return GameRoomResponse.from(room); }`을 추가한다. `isParticipant()`(호스트이거나 `guestUserId`와 일치)는 001에서 이미 구현돼 있어 재사용만 하면 된다.
- **Rationale**: 현재 001의 `join()`은 "이미 이 방의 참가자인가"를 전혀 확인하지 않고 `isFull()`(`guestUserId != null`)만 검사한다. 그 결과 (1) 이미 guest인 사용자가 같은 방에 재입장을 시도하면 `guestUserId`가 이미 자기 자신이라 `isFull()`이 `true`가 되어 `ROOM_FULL`로 **잘못 거부**되고, (2) guest 자리가 비어 있는 상태에서 host 본인이 `join()`을 다시 호출하면 `assignGuest(hostUserId)`가 실행되어 **host와 guest가 같은 사람이 되는 데이터 손상**이 발생한다. 둘 다 FR-020("인원수를 추가로 늘리지 않고 기존 참가자로 인식")을 정면으로 위반하는, 001 코드에 원래부터 있던 잠재적 결함이다. `#12`(퇴장 유예/재접속)는 WebSocket 재연결 시나리오만 다루고 REST `/join` 재호출 시나리오는 다루지 않아 이 항목이 계획에서 누락돼 있었다(리뷰에서 발견).
- **Alternatives considered**: WebSocket 핸드셰이크 단의 재입장 인식(#12)만으로 충분하다고 보고 `/join`은 그대로 둠 — 프론트엔드가 방 코드/링크로 재입장할 때 WebSocket을 열기 전에 항상 `/join`을 먼저 호출하는 흐름(User Story 10과 동일)을 전제로 하는 이상, `/join` 자체가 안전하지 않으면 그 이전 단계에서 이미 실패하므로 제외.

## 14. "허깨비 참가자" — 방치 시 자동 정리(PENDING 확인 대기) 도입으로 결정 번복 (FR-029, User Story 15)

- **이전 결정 번복**: 001 research.md가 예고했던 "REST로는 입장했지만 실제 WebSocket에 연결하지 않고 이탈하는 사용자가 정원을 영구 점유하는 문제"를, 이번 스펙 초안에서는 한 차례 "다음 스펙으로 이월"하기로 했었다. 이후 "완결성 있게 동작하는 백엔드를 이번에 만들고 싶다"는 요청에 따라 **이번 스펙에서 실제로 해소하기로 결정을 번복**했다(FR-029, User Story 15).
- **Decision**: `/join`의 REST 시맨틱(즉시 `guestUserId` 확정) 자체는 바꾸지 않는다 — 대신 `GameRoomService.create()`/`join()`이 참가자를 확정한 직후, `RoomParticipantRegistry`에 그 참가자를 **미확정(미확정=WebSocket 연결이 아직 한 번도 성공하지 않음)** 상태로 등록하면서 15초 확인 대기 타이머(`ScheduledFuture`)를 함께 예약한다. 이 타이머는 `#12`(퇴장 유예 타이머)와 **완전히 동일한 메커니즘**이다 — 취소되지 않으면 `GameRoomService.leave(roomId, userId)`를 그대로 호출해, 기존 나가기 규칙(호스트면 위임/종료, 게스트면 자리 비움, FR-018)을 그대로 재사용한다. WebSocket 핸드셰이크가 처음 성공하는 순간 이 타이머가 취소되고 해당 참가자가 "확정"으로 전환된다 — 이는 재접속 시 유예 타이머를 취소하는 것과 코드 경로가 동일하다(`ParticipantLiveState`를 "미확정 최초 연결 대기"와 "확정 후 재접속 대기" 두 경우 모두에 재사용, #11 참고). 즉 새로 설계해야 하는 로직은 사실상 없다 — **"REST로 참가자가 확정된 시점에 유예 타이머를 한 번 미리 걸어두는 것"** 뿐이다.
- **Rationale**: `/join`/`create()`의 REST 계약(즉시 확정, 001에서 이미 구현되어 Out of Scope)을 바꾸지 않고도 목표(방치된 참가자가 정원을 영구 점유하지 않음)를 달성할 수 있다는 것을 #12 설계 재사용으로 깨달았다 — "PENDING 상태"라는 새로운 개념을 추가하는 대신, "확정된 참가자에게 최초 연결 유예 타이머를 건다"는 기존 개념의 자연스러운 확장으로 재정의했다. 호스트에도 동일하게 적용하기로 한 이유는, 호스트가 방을 만들고 연결을 열지 않는 경우도 근본적으로 같은 문제(방치)이기 때문이며, 게스트가 없으면 `leave()`가 그대로 방을 `CLOSED`시켜 기존 FR-004(WAITING 정리)보다 훨씬 빠르게(15초 vs 분 단위) 해소한다. 확인 대기 시간(15초)은 퇴장 유예(5~10초)보다 여유를 둔다 — 티켓 발급 왕복, 페이지 로딩, 최초 핸드셰이크에 걸리는 시간이 재접속보다 더 걸릴 수 있기 때문이다.
- **파생 효과**: `RoomParticipantRegistry`가 이제 REST 요청 처리 시점(생성/입장)에 이미 참가자 엔트리를 갖게 되므로, WebSocket 핸드셰이크의 방 소속 검증(FR-024)이 DB를 다시 조회하지 않고 인메모리 레지스트리 조회만으로 끝난다 — 초안 단계의 `contracts/realtime-websocket-messages.md`가 "`RoomLiveState` 또는 DB 조회"라고 병기했던 부분도 이번 결정으로 레지스트리 조회 단독으로 정리했다(레지스트리에 없는 `userId`는 애초에 참가자가 아니므로).
- **Alternatives considered**: 정원 계산에서 미확정 참가자를 제외(즉 `capacity` 상 "실제 연결된 사람"만 인원수로 집계) — User Story 15 시나리오 5에서 확인했듯, 미확정 상태도 정원에는 포함되어야 한다는 결정과 상충하므로 제외(그렇지 않으면 두 사용자가 동시에 "1자리 남음"으로 보고 함께 입장을 시도하는 새로운 경쟁 조건이 생긴다).

## 미해결 항목

없음 — Technical Context의 모든 항목이 이 문서에서 해소되었다. (#14는 초안 단계에서 한 차례 "보류"로 남겼다가, 이후 결정을 번복해 이번 스펙 범위에 포함하기로 확정했다 — 최종 상태는 "보류"가 아니라 "결정 완료".)
