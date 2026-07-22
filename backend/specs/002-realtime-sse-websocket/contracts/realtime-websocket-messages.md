# 방 내 실시간 WebSocket 메시지 계약

**엔드포인트**: `/ws/game-rooms/{roomId}`
**대응 스펙**: User Story 11/12/13/14 (FR-016~FR-027)

OpenAPI 3.0은 WebSocket을 표현할 수 없어 이 문서에서 별도로 정의한다. 순수 `TextWebSocketHandler`(STOMP 미사용, research.md #10) 기반이며, 모든 메시지는 `{"type": "...", "payload": {...}}` 형태의 JSON이다.

## 핸드셰이크 (연결 수립)

- **엔드포인트**: `/ws/game-rooms/{roomId}?ticket=...` — 브라우저 표준 `WebSocket` API는 `EventSource`와 마찬가지로 핸드셰이크에 커스텀 헤더를 실어보낼 수 없으므로(초안에서 "Authorization 헤더로 검증"이라고 잘못 설계했던 부분을 리뷰로 발견해 수정), 로비 SSE와 동일하게 `POST /auth/sse-ticket`으로 발급받은 단기 1회용 티켓을 쿼리 파라미터로 전달한다(FR-024, research.md #8).
- **인증**: `HandshakeInterceptor`가 `ticket` 쿼리 파라미터를 조회 즉시 소비(consume)해 `userId`를 얻는다. 유효하지 않거나 이미 소비된 티켓이면 핸드셰이크를 거부한다.
- **방 소속 검증**: 인증된 `userId`가 해당 `roomId`의 `RoomParticipantRegistry`에 참가자로 등록돼 있는지 확인한다. `create()`/`join()` 시점에 이미 등록돼 있으므로(FR-029, research.md #14) 정상 경로에서는 DB 재조회가 필요 없다. 등록돼 있지 않으면 핸드셰이크 자체를 거부(FR-024, User Story 13).
- **성공 시**: 해당 참가자의 `ParticipantLiveState`가 아직 미확정(`confirmed=false`, 방금 생성/입장한 직후)이었다면 확인 대기 타이머를 취소하고 확정 처리하며, 이미 확정된 참가자의 재접속이었다면 유예 타이머를 취소한다 — 두 경우 모두 같은 코드 경로다(FR-020, FR-029, research.md #12). 기존 세션이 아직 열려 있으면(멀티탭 등) 서버가 `close()`한 뒤 새 세션 참조로 교체한다.

## 서버 → 클라이언트 메시지

| type | 발생 시점 | payload | 대응 FR |
|---|---|---|---|
| `PEER_DISCONNECTED` | 같은 방의 상대방 연결이 끊겨 유예 시간이 시작될 때 | `{ "userId": number }` | FR-019 |
| `PEER_RECONNECTED` | 유예 시간 안에 상대방이 재접속에 성공했을 때 | `{ "userId": number }` | FR-019 |
| `PEER_LEFT` | 다음 세 경로 중 하나로 `leave()`가 호출된 결과: (1) 재접속 유예 시간이 만료되어 실제 퇴장이 확정됐을 때, (2) 상대방이 명시적으로 `POST /game-rooms/{roomId}/leave`를 호출해 즉시 퇴장했을 때, (3) 방 생성/입장 후 최초 연결 확인 대기 시간(15초)이 만료됐을 때(FR-029) — 세 경로 모두 `GameRoomService.leave()` 내부의 동일한 브로드캐스트 호출 하나로 처리된다(research.md #12) | `{ "userId": number, "newHostUserId": number \| null }` | FR-016, FR-018, FR-019, FR-029 |
| `GAME_STARTED` | 방장의 시작 요청이 성공해 방 상태가 `IN_PROGRESS`로 전환됐을 때 | `{ "roomId": number }` | FR-021 |
| `SIGNAL` | 같은 방 상대방이 영상 통화 연결 신호를 보냈을 때 (서버는 payload를 가공하지 않고 그대로 전달) | 클라이언트가 보낸 payload 원본 | FR-025, FR-026 |
| `ERROR` | 방 소속이 아니게 된 이후에도 메시지를 보내는 등 검증 실패 시 | `{ "code": string, "message": string }` (기존 `ErrorResponse`와 동일한 필드 구성) | FR-024 |

## 클라이언트 → 서버 메시지

| type | 의미 | payload | 대응 FR |
|---|---|---|---|
| `SIGNAL` | 영상 통화 연결 신호(offer/answer/ICE candidate)를 상대방에게 중계 요청 | 임의 JSON (서버는 파싱하지 않음) | FR-025 |

> 문제 배포/정답 판정/점수·콤보 계산 등 실제 게임 진행 메시지는 이 스펙의 책임이 아니다(Out of Scope). 그 메시지 타입들은 이 WebSocket 연결이 이미 열려 있다는 전제 위에서 별도 담당자가 정의한다.

```text
// TODO: WebSocket 메시지 송수신 로직 구현 위치 (다른 담당자 작업 예정)
// 이 핸들러의 메시지 타입 분기(SIGNAL 이후, 게임 진행 관련 type)에 추가될 예정.
```

## 연결 종료

- **정상 종료(명시적 나가기, `POST /game-rooms/{roomId}/leave` 호출 후)**: 서버가 같은 방에 남아있는 다른 참가자의 세션에 `PEER_LEFT`를 먼저 전송한 뒤, 나간 사용자의 세션을 `CloseStatus.NORMAL`로 닫는다. 유예 타이머를 시작하지 않는다(FR-016, 즉시 처리).
- **비정상 종료(네트워크 단절, 새로고침 등)**: `afterConnectionClosed`가 `NORMAL`이 아닌 상태로 호출되면 유예 타이머 시작(FR-017).
