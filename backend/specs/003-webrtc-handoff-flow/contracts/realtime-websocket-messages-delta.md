# 방 내 실시간 WebSocket 메시지 계약 — 003 델타

`backend/specs/002-realtime-sse-websocket/contracts/realtime-websocket-messages.md`(기준본)에 대한 추가분만 정리한다. 엔드포인트(`/ws/game-rooms/{roomId}?ticket=...`)와 기존 메시지 6종(`PEER_DISCONNECTED`/`PEER_RECONNECTED`/`PEER_LEFT`/`GAME_STARTED`/`SIGNAL`/`ERROR`)은 변경 없이 그대로 유지된다. 이번 스펙은 대전 모드에만 적용되며(솔로는 이 WebSocket 자체를 쓰지 않음), 신규 메시지 2종을 추가한다.

## 클라이언트 → 서버 (신규)

| type | 의미 | payload | 대응 FR |
|---|---|---|---|
| `WEBRTC_CONNECTED` | 영상 통화(WebRTC) 연결이 실제로 성립되어, 더 이상 필요 없는 방 실시간 연결을 클라이언트가 의도적으로 종료하겠다는 신호. **이 연결이 아직 열려 있는 동안 반드시 이 신호를 먼저 보낸 뒤에** 연결을 끊어야 한다 — 끊은 뒤에는 이 신호를 보낼 방법이 없다(FR-003). | 없음 (`{"type": "WEBRTC_CONNECTED"}`) | FR-003 |

**서버 동작**: 이 메시지를 받으면 해당 참가자를 "의도된 종료 대기" 상태로 표시한다. 그 직후 연결이 종료되면 참가자를 이탈로 처리하지 않고 계속 정상 참가자로 유지한다(FR-004) — `PEER_LEFT`가 발송되지 않는다. 이 신호 없이 연결이 끊기면 기존과 동일하게 유예 시간(`leave-grace-seconds`)을 두고 이탈 처리한다(FR-005, 회귀 없음).

## 서버 → 클라이언트 (신규)

| type | 발생 시점 | payload | 대응 FR |
|---|---|---|---|
| `PEER_READY_CHANGED` | 같은 방 상대방이 준비 상태를 변경했을 때(`PATCH /game-rooms/{roomId}/ready` 처리 직후) | `{ "userId": number, "isReady": boolean }` | FR-030 |

**서버 동작**: 준비 상태 변경 API가 성공하면 커밋 직후 상대방에게만(본인 제외) 이 메시지를 전송한다. 상대방의 실시간 연결이 없거나 끊긴 상태여도 이 전송 실패가 준비 상태 변경 API 자체를 실패시키지 않는다(FR-031, 기존 `send()`의 방어 로직과 동일한 방식).

## 연결 종료 (델타)

기존 "정상 종료"/"비정상 종료" 두 경우에 하나가 추가된다:

- **의도된 종료(신규, FR-003/004)**: `WEBRTC_CONNECTED` 수신 직후 연결이 끊기면, 유예 타이머를 시작하지 않고 참가자를 그대로 유지한다. `PEER_LEFT`도 `PEER_DISCONNECTED`도 발송되지 않는다 — 상대방에게 아무 알림도 없이 조용히 방 실시간 연결만 정리된다(방 정원이 2명이라 상대방은 항상 한 명뿐이다).
- **비정상 종료(기존, 회귀 없음)**: `WEBRTC_CONNECTED` 신호 없이 끊기면 기존과 동일하게 `afterConnectionClosed`가 유예 타이머를 시작하고 `PEER_DISCONNECTED`를 발송한다(FR-005).
- 게임 시작 후 일정 시간 안에 `WEBRTC_CONNECTED`가 오지 않으면, 서버는 연결을 강제로 끊지 않고 계속 열어둔다 — 이 경우 방 실시간 연결이 게임이 끝날 때까지 최소한의 연결 상태 감지 수단으로 계속 쓰인다(FR-006).
