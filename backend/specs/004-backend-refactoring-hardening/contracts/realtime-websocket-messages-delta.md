# 방 내 실시간 WebSocket 메시지 계약 — Delta (spec 004 / GAME-02-21)

**기준 문서**: `backend/specs/002-realtime-sse-websocket/contracts/realtime-websocket-messages.md`
**엔드포인트**: `/ws/game-rooms/{roomId}` (변경 없음)

이 스펙에서 관찰 가능한 유일한 계약 변경은 **신규 입장 신호 메시지 타입 1개 추가**다. 나머지 리팩토링(FR-001~015, 017~025)은 기존 REST/WS 계약을 보존한다.

## 추가: 서버 → 클라이언트 메시지

| type | 발생 시점 | payload | 대응 FR |
|---|---|---|---|
| `PEER_JOINED` | 같은 방에 **신규 참가자가 최초로 WS 연결을 확정**했을 때(재접속 아님). 본인 제외 나머지 참가자에게 전송 | `{ "userId": number }` | FR-016 (GAME-02-21) |

### 동작 규칙

- **재접속과 구분**: 이미 확정됐던 참가자의 재연결은 기존 `PEER_RECONNECTED`로 전송하며 `PEER_JOINED`를 보내지 않는다. 구분 기준은 핸들러의 기존 `reconnect` 판정(확정 이력 + pendingTask 존재)을 그대로 사용한다.
- **최초 확정 경로에서만**: `afterConnectionEstablished`에서 최초 확정(join 확인 대기 타이머 취소) 시에만 `PEER_JOINED`를 발송한다.
- **전송 실패 격리**: 상대 세션이 없거나 닫혀 있어 전송에 실패해도 연결 수립 자체는 성공으로 처리한다(기존 `send()` 무시 규칙과 동일).
- **payload**: 기존 `PEER_DISCONNECTED`/`PEER_RECONNECTED`와 동일하게 `{ "userId": <입장한 사용자> }`.

### 계약 미변경(보존) 항목

- 핸드셰이크(ticket 인증), `SIGNAL`/`WEBRTC_CONNECTED`/`PEER_LEFT`/`GAME_STARTED`/`PEER_READY_CHANGED`/`ERROR`, 연결 종료·유예 타이머 규칙은 모두 그대로다.
