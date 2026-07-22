# Quickstart: 실시간 로비/게임방 알림(SSE)과 WebRTC 시그널링 도입

`./gradlew bootRun`으로 `backend/suhwa`를 기동한 상태를 전제로 한다(001 quickstart와 동일). 아래 §1~§8은 Part A(선행 안정화, 반드시 먼저 통과) → §9~§16은 Part B(실시간 계층) 순서로 검증한다. Part A가 전부 통과하기 전에는 Part B 엔드포인트 자체가 존재하지 않아야 한다(SC-001).

## 사전 준비

- 001 quickstart §2로 발급한 access token 2개(사용자 A, B) 준비.
- 이번 스펙의 수동 DDL 적용: `data-model.md`의 `ALTER TABLE game_rooms ADD COLUMN version ...` 실행.
- 환경 변수: `CORS_ALLOWED_ORIGINS`, `GAME_ROOM_WAITING_RETENTION_MINUTES`, `REALTIME_TICKET_TTL_SECONDS`, `GAME_ROOM_LEAVE_GRACE_SECONDS`, `GAME_ROOM_JOIN_CONFIRMATION_SECONDS`, `WEBRTC_STUN_URLS` 등(`data-model.md` 설정값 표 참고) — `env.sample`에 예시 추가.

## Part A — 선행 안정화 검증

### §1. 401/403 응답 형식 통일 (FR-001)

```bash
curl -i http://localhost:8080/users/me                 # 토큰 없음 → 401
curl -i -H "Authorization: Bearer <A의 토큰>" \
     http://localhost:8080/game-rooms/9999/leave -X POST  # 존재/권한 없는 리소스 → 403 또는 404
```

**기대 결과**: 두 응답 모두 바디가 `{"code": "...", "message": "..."}` 형태로 `GlobalExceptionHandler`가 만드는 다른 오류(예: 404 `ROOM_NOT_FOUND`)와 동일한 스키마.

### §2. 동시 요청 충돌 (FR-002)

같은 `roomId`에 대해 `POST /game-rooms/{roomId}/ready` 요청 2개를 거의 동시에 보내(스크립트로 병렬 실행) 하나는 200, 다른 하나는 409(`CONCURRENT_UPDATE_CONFLICT`)를 받는지 확인.

### §3. WAITING 방 준비 상태 가드 (FR-003)

방을 생성 → 시작해 `IN_PROGRESS`로 전환 → 그 상태에서 `POST /ready` 호출 시 409(`ROOM_NOT_WAITING`) 확인.

### §4. WAITING 방 자동 정리 확장 (FR-004)

`GAME_ROOM_WAITING_RETENTION_MINUTES`를 짧게(예: 1분) 설정 후 방을 하나 생성만 하고 방치, 스케줄러 주기 경과 후 `GET /game-rooms/{roomId}` 등으로 삭제됐는지 확인(직접 조회 API가 없다면 DB로 확인).

### §5. 스케줄러 스레드풀 분리 (FR-005)

정성적 검증: 로그 또는 스레드 덤프로 `GameRoomCleanupScheduler` 실행 스레드 이름이 전용 풀(`ThreadPoolTaskScheduler`)에서 온 것인지 확인. 자동화 테스트에서는 풀 크기(`getPoolSize() >= 4`) 어서션으로 대체 가능.

### §6. 서비스 DTO 반환 (FR-006)

`POST /game-rooms`, `POST /game-rooms/join`, `POST /game-rooms/{roomId}/ready`, `POST /game-rooms/{roomId}/start` 응답 필드가 001 quickstart §4에서 확인한 것과 동일한지 재확인(회귀 없음).

### §7. CORS (FR-007)

```bash
curl -i -H "Origin: http://localhost:5173" http://localhost:8080/rankings
curl -i -H "Origin: http://evil.example.com" http://localhost:8080/rankings
```

**기대 결과**: 허용 목록에 있는 Origin은 `Access-Control-Allow-Origin` 헤더 포함, 없는 Origin은 미포함(브라우저에서 차단됨을 서버 헤더 부재로 대신 확인).

### §8. 실시간 티켓 발급 (FR-008)

```bash
curl -i -X POST -H "Authorization: Bearer <A의 토큰>" http://localhost:8080/auth/sse-ticket
# → {"ticket": "...", "expiresInSeconds": 30}
```

같은 티켓으로 §9의 SSE 연결을 두 번 시도해 두 번째는 거부되는지, `expiresInSeconds` 경과 후 시도 시에도 거부되는지 확인(FR-008 시나리오 3/4).

**Part A 체크포인트**: §1~§8이 전부 기대대로 동작해야 Part B로 진행한다(SC-001).

## Part B — 실시간 계층 검증

### §9. 로비 SSE 구독 (FR-009~FR-014)

```bash
curl -N "http://localhost:8080/game-rooms/subscribe?ticket=<§8에서 발급받은 티켓>"
```

다른 터미널에서 사용자 B로 방을 생성 → 위 curl 세션에 `event: update`로 새 방이 나타나는지(3초 이내, SC-002) 확인. 응답 헤더에 `X-Accel-Buffering: no` 포함 여부 `curl -i`로 재확인.

### §10. 방 입장 응답의 실시간 인원 정보 (FR-015)

`POST /game-rooms/join` 응답에 `participantCount`/`capacity`/`status`가 그 순간 실제 값과 일치하는지 확인(001 계약 재사용, 값의 실시간성만 신규 검증 대상).

### §11. 퇴장 유예 시간과 재접속 (FR-016~FR-020)

`POST /auth/sse-ticket`으로 B 명의 티켓을 새로 발급받은 뒤, WebSocket 클라이언트(예: `wscat -c "ws://localhost:8080/ws/game-rooms/{roomId}?ticket=<B의 티켓>"` — `Authorization` 헤더가 아니라 SSE와 동일한 티켓 쿼리 파라미터 방식, `realtime-websocket-messages.md` 참고)로 B를 연결한 뒤 강제 종료(Ctrl+C) → A 쪽 연결에 `PEER_DISCONNECTED` 수신 확인 → 유예 시간 안에 B가 (새 티켓을 재발급받아) 재연결하면 `PEER_RECONNECTED`, 유예 시간을 넘기면 `PEER_LEFT` 수신 확인(FR-019).

**명시적 나가기 브로드캐스트**: B를 다시 연결한 상태에서, B가 `POST /game-rooms/{roomId}/leave`를 호출(강제 종료가 아니라 정상 API 호출) → A 쪽 WebSocket 연결에 유예 시간 없이 즉시 `PEER_LEFT`가 수신되는지 확인(FR-016).

**재입장(reentry) 인식**: 대기 중인 방에서 B가 이미 guest로 참가한 상태에서 `POST /game-rooms/join`을 같은 roomCode로 다시 호출 → `ROOM_FULL`이 아니라 200과 함께 기존 상태(`participantCount` 변화 없음)가 그대로 반환되는지 확인(FR-020, research.md #14-1 — 001 `join()`의 기존 결함이 수정됐는지에 대한 회귀 검증).

### §12. 게임 시작 브로드캐스트 (FR-021~FR-022)

양쪽 다 `ready` 후 방장이 `POST /start` 호출 → 두 WebSocket 클라이언트 모두 `GAME_STARTED` 수신, §9의 SSE 세션에서는 해당 방이 다음 `update`에서 사라지는지 확인.

### §13. 실시간 연결 인증/소속 검증 (FR-022~FR-024)

- 티켓 없이 `/game-rooms/subscribe` 연결 시도 → 401.
- 방 참가자가 아닌 사용자 명의로 발급받은 티켓으로 `/ws/game-rooms/{roomId}?ticket=...` 핸드셰이크 시도 → 연결 거부(티켓 자체는 유효하지만 방 소속 검증에서 실패, 핸드셰이크 단계에서 거부).

### §14. WebRTC 시그널링 릴레이 및 ICE 서버 정보 (FR-025~FR-027)

```bash
curl -i -H "Authorization: Bearer <A의 토큰>" http://localhost:8080/webrtc/ice-servers
```

A의 WebSocket 클라이언트에서 `{"type":"SIGNAL","payload":{"sdp":"..."}}` 전송 → B의 WebSocket 클라이언트가 동일 payload를 그대로 수신하는지 확인. 다른 방에 있는 사용자 C의 연결에는 전달되지 않는지 함께 확인.

### §15. 방치된 참가자 자동 정리 (FR-029)

- **호스트 방치**: A가 `POST /game-rooms`로 방을 생성하고, `GAME_ROOM_JOIN_CONFIRMATION_SECONDS` 동안(기본 15초) 그 방의 WebSocket을 열지 않음 → 시간 경과 후 방이 자동으로 `CLOSED` 되는지 DB로 확인(게스트가 없으므로 위임 없이 종료).
- **게스트 방치**: A가 방을 생성하고 WebSocket을 정상적으로 연 상태에서, B가 `POST /game-rooms/join`만 호출하고 WebSocket은 열지 않음 → 15초 후 B의 guest 자리가 비워져 다른 사용자가 `join` 가능한지 확인. 이 동안 A의 WebSocket에는 유예 시간 없이 즉시 `PEER_LEFT`가 수신되는지도 함께 확인(§11의 브로드캐스트 경로 재사용).
- **재입장으로 인한 타이머 미연장**: B가 방치 상태에서(15초가 지나기 전) `POST /game-rooms/join`을 같은 roomCode로 다시 호출 → FR-020에 따라 정상 응답을 받지만, 최초 join 시점 기준 15초가 지나면 여전히 자동 정리되는지 확인(재호출로 타이머가 연장되지 않음).

### §16. 접속 중인 방은 WAITING 정리 대상에서 제외 (FR-030)

`GAME_ROOM_WAITING_RETENTION_MINUTES`를 짧게(예: 1분) 설정 → A가 방을 생성하고 WebSocket을 정상적으로 연 뒤(확정 상태), 아무 것도 하지 않고 보관 기간을 넘김 → 정리 스케줄러 실행 후에도 그 방이 삭제되지 않고 그대로 남아있는지 DB로 확인(§4의 Part A 검증과 달리, 이번엔 실시간 연결이 있는 방이 예외 처리되는지가 핵심).

## Part A/B 공통: 재시작 정합화 (FR-028)

방을 WAITING 또는 IN_PROGRESS 상태로 만든 채 서버를 재시작(`Ctrl+C` 후 `./gradlew bootRun` 재실행) → 기동 직후 해당 방이 `CLOSED`로 전환됐는지 DB로 확인.
