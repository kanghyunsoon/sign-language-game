# Data Model: 실시간 로비/게임방 알림(SSE)과 WebRTC 시그널링 도입

001 스펙(`backend/specs/001-backend-crud-api/data-model.md`)에서 이미 정의된 `GameRoom`/`GameSession`/`User` 등은 그대로 유지하며, 이번 스펙에서 필요한 **델타(변경분)** 와 **인메모리 전용 구조**(DB 테이블이 아님)만 정리한다. 단일 인스턴스 운영 전제(spec.md Assumptions)라 인메모리 구조는 서버 재시작 시 사라지는 것이 설계상 정상 동작이다(FR-028이 그 이후의 DB 정합화를 담당).

## 기존 테이블 변경분

### GameRoom (`game_rooms`) — `version` 컬럼 추가 (CORR-1, FR-002)

| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| **version** | **BIGINT** | **NOT NULL DEFAULT 0** | **(신규)** JPA `@Version` 낙관적 락. 매 UPDATE마다 자동 증가, 커밋 시점에 값이 달라져 있으면 `ObjectOptimisticLockingFailureException` 발생 → `CONCURRENT_UPDATE_CONFLICT`(409)로 매핑(research.md #2) |

**필요한 수동 DDL** (JPA `ddl-auto=none`이므로 001과 동일하게 수동 반영 필요):

```sql
ALTER TABLE game_rooms ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
```

그 외 컬럼/상태 전이 규칙은 001 data-model.md와 동일(변경 없음).

## 신규 에러 코드 (`ErrorCode`, DB 테이블 아님 — 기존 enum 확장)

| 코드 | HTTP 상태 | 설명 |
|---|---|---|
| **ACCESS_DENIED** | 403 | Spring Security `AccessDeniedException` → `GlobalExceptionHandler` 통일 응답(FR-001, research.md #1) |
| **CONCURRENT_UPDATE_CONFLICT** | 409 | 낙관적 락 충돌(FR-002, research.md #2) |

## 인메모리 전용 구조 (서버 프로세스 메모리 내 상태 — DB 테이블 없음)

### RealtimeTicket (`auth` 패키지, `ConcurrentHashMap<String, TicketEntry>`)

| 필드 | 타입 | 설명 |
|---|---|---|
| ticket (key) | String | `SecureRandom` 기반 불투명 문자열, 발급 시 생성 |
| userId | Long | 발급 대상 사용자 |
| expiresAt | Instant | 짧은 유효 시간(설정값, 예: 30초) 경과 시 무효 |

**소비 규칙**: SSE 연결 시도 시 조회와 동시에 맵에서 **제거**(consume) → 1회성 보장(FR-008). 만료 전에도 소비되면 재사용 불가.

### LobbySubscription (`game/realtime` 패키지, `ConcurrentHashMap<String sessionId, SseEmitter>`)

| 필드 | 타입 | 설명 |
|---|---|---|
| sessionId (key) | String | 연결마다 발급되는 임의 식별자 |
| emitter | SseEmitter | 브로드캐스트 대상. `onCompletion/onTimeout/onError`에서 자동 제거(FR-014) |

### RoomLiveState (`game/realtime` 패키지, `ConcurrentHashMap<Long roomId, RoomLiveState>`)

방 하나(최대 참가자 2명)당 하나. 각 참가자(userId)별로 아래 하위 상태를 가진다.

| 필드 | 타입 | 설명 |
|---|---|---|
| roomId (key) | Long | `game_rooms.id`와 대응 |
| participants | `Map<Long userId, ParticipantLiveState>` | 아래 참고 |

**ParticipantLiveState**:

| 필드 | 타입 | 설명 |
|---|---|---|
| confirmed | boolean | **(신규)** WebSocket 연결이 한 번이라도 성공했는지 여부. `create()`/`join()` 직후 `false`로 시작하고, 첫 핸드셰이크 성공 시 `true`로 전환된 뒤 계속 유지된다(FR-029, research.md #14) |
| session | `WebSocketSession` (nullable) | **문자열 ID가 아니라 실제 세션 객체 참조** — 서버가 명시적 나가기(FR-016)·유예/확인 대기 만료(FR-018, FR-029)·중복 연결 정리(Edge Case) 시점에 이 세션을 직접 `close()`할 수 있어야 하므로, `sessionId`만 저장하면 닫을 대상이 없다(리뷰에서 발견해 수정). `confirmed=false`이거나 연결이 끊긴 동안은 `null`. 재접속 시(FR-020) 기존 `session`이 아직 열려 있으면 서버가 `close()`한 뒤 새 `session`으로 교체한다 |
| readyCache | boolean | `game_rooms.host_ready`/`guest_ready`의 쓰기-스루 캐시(research.md #11) — 원본 아님, DB가 원본 |
| pendingDeadline | `Instant` (nullable) | **최초 연결 확인 대기(`confirmed=false`, 15초) 또는 재접속 유예(`confirmed=true`였다가 연결이 끊김, 5~10초) 중 진행 중인 쪽의 만료 시각**, 둘 다 아니면 `null`(FR-017~019, FR-029, research.md #12 — 두 시나리오가 같은 필드를 공유) |
| pendingTask | `ScheduledFuture<?>` (nullable) | 만료 시 `leave()`를 실행할 예약 작업 참조. 핸드셰이크 성공(최초 연결 또는 재접속) 시 `cancel()`(research.md #12) |

**상태 전이**: 참가자가 방에 REST로 생성/입장(`create()`/`join()`) → 그 즉시 `ParticipantLiveState`가 `confirmed=false`, `pendingDeadline=+15초`로 생성되고 확인 대기 타이머 예약(FR-029) → WebSocket 핸드셰이크 성공 시 타이머 취소, `confirmed=true`, `session` 설정 → 이후 연결 비정상 종료 시 `session=null`, `pendingDeadline=+유예시간(5~10초)` 재설정 및 새 타이머 예약(FR-017) → (재접속 시 취소 후 `confirmed` 유지 / 확인 대기든 재접속 유예든 만료 시 `leave()` 호출 후 엔트리 제거) → 방 전체가 `CLOSED`되거나 참가자가 명시적으로 나가면 해당 참가자 엔트리 제거 → 방에 참가자가 0명이 되면 `roomId` 엔트리 자체를 제거.

### SignalMessage (전송 전용, 저장하지 않음)

| 필드 | 타입 | 설명 |
|---|---|---|
| type | String | `"SIGNAL"` (방 WebSocket 메시지 타입 중 하나, research.md #13) |
| payload | 임의 JSON (opaque) | offer/answer/ICE candidate — 서버는 내용을 파싱하지 않고 그대로 상대방에게 전달(FR-025) |

## 신규 설정값 (`@ConfigurationProperties`, DB 아님 — `application.yaml`/환경 변수)

| 설정 키 | 환경 변수 | 설명 |
|---|---|---|
| `cors.allowed-origins` | `CORS_ALLOWED_ORIGINS` | 콤마 구분 허용 Origin 목록(FR-007) |
| `game.room.waiting-room-retention` | `GAME_ROOM_WAITING_RETENTION_MINUTES` | 방치된 WAITING 방 보관 기간(FR-004, 기본값 예: 30분) |
| `game.room.realtime-ticket-ttl` | `REALTIME_TICKET_TTL_SECONDS` | 실시간 티켓 유효 시간(FR-008, 기본값 예: 30초) |
| `game.room.leave-grace-seconds` | `GAME_ROOM_LEAVE_GRACE_SECONDS` | 퇴장 유예 시간(FR-017, 5~10초 범위 내 기본값) |
| `game.room.join-confirmation-seconds` | `GAME_ROOM_JOIN_CONFIRMATION_SECONDS` | 방 생성/입장 후 최초 WebSocket 연결 확인 대기 시간(FR-029, 기본값 15초 — 퇴장 유예보다 여유를 둠) |
| `webrtc.stun-urls` | `WEBRTC_STUN_URLS` | STUN 서버 URL 목록(FR-027) |
| `webrtc.turn-url` / `turn-username` / `turn-credential` | `WEBRTC_TURN_URL` 등 | TURN 서버 접속 정보(FR-027) |

## 엔티티/구조 관계 요약

```text
User (1) ── (N) GameRoom [host_user_id]                         (001, 영속)
GameRoom (1) ── (0..1) RoomLiveState [roomId]                     (신규, 인메모리)
RoomLiveState (1) ── (0..2) ParticipantLiveState [userId]         (신규, 인메모리)
User (1) ── (0..N) RealtimeTicket [발급 시점, 소비 즉시 제거]        (신규, 인메모리)
(전역) LobbySubscription 목록 — 특정 GameRoom과 1:1 관계 아님(로비 전체 브로드캐스트 대상) (신규, 인메모리)
```
