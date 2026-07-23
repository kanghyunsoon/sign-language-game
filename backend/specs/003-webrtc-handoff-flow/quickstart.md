# Quickstart: 방 실시간 연결 자동화 및 영상 통화 전환 시 안전한 정리

`./gradlew bootRun`으로 `backend/suhwa`를 기동한 상태를 전제로 한다(001/002 quickstart와 동일). WebSocket 검증은 브라우저 개발자 콘솔의 `new WebSocket(url)` 또는 `wscat` 등 WS 클라이언트 도구로 수행한다(002 quickstart와 동일 방식).

## 사전 준비

- 001/002 quickstart로 발급한 access token 2개(사용자 A, B) 준비.
- **스키마 변경 SQL 적용 확인** — `data-model.md`의 스키마 변경(`game_rooms.game_type` 추가, `game_results` 신규, `game_sessions` 테이블 완전 제거, `users.win_count`/`loss_count` 컬럼 제거)이 전부 적용된 상태여야 한다.
- 환경 변수는 002와 동일(`GAME_ROOM_LEAVE_GRACE_SECONDS` 등 변경 없음). 이번 스펙에서 새로 추가되는 환경 변수는 없다.

## §1. 방 입장 시 실시간 연결 자동화 (US1, FR-001/002)

```bash
curl -i -X POST http://localhost:8080/game-rooms \
     -H "Authorization: Bearer <A의 토큰>" \
     -H "Content-Type: application/json" \
     -d '{"gameType": "SIGN_DUEL"}'
```

**기대 결과**: 응답(`GameRoomResponse`)에 `gameType: "SIGN_DUEL"`과 `realtimeTicket`(문자열)이 함께 포함된다. 이 `realtimeTicket` 값을 별도 API 호출 없이 곧바로 `/ws/game-rooms/{roomId}?ticket=<realtimeTicket>`에 사용해 WebSocket 연결을 시도 → 정상 연결되는지 확인. `POST /game-rooms/join`(B가 방 코드로 입장)에서도 동일하게 응답에 티켓이 포함되는지 확인.

## §2. 준비 상태 변경 실시간 통보 (US10, FR-030/031)

A, B 모두 §1의 티켓으로 방 WebSocket 연결을 맺은 상태에서:

```bash
curl -i -X PATCH http://localhost:8080/game-rooms/{roomId}/ready \
     -H "Authorization: Bearer <B의 토큰>" \
     -H "Content-Type: application/json" \
     -d '{"isReady": true}'
```

**기대 결과**: A의 WebSocket 연결에 별도 조회 없이 `{"type":"PEER_READY_CHANGED","payload":{"userId":<B의 ID>,"isReady":true}}`가 도착한다(SC-009, 1초 이내). B가 다시 준비를 취소해도 동일하게 통보되는지 확인.

## §3. 게임 시작~시그널링 회귀 검증 (US3, 기존 기능)

양쪽 `ready` 후 A(방장)가 `POST /game-rooms/{roomId}/start` 호출 → 두 WebSocket 모두 `GAME_STARTED` 수신(기존, 회귀 확인). 이어서 `GET /webrtc/ice-servers` 정상 응답 확인, A의 WS에서 `{"type":"SIGNAL","payload":{...}}` 전송 → B의 WS에 동일 payload 수신 확인(기존, 회귀 확인).

## §4. 영상 통화 전환 시 방 실시간 연결 안전 정리 (US2, FR-003~006)

§3에 이어 A의 WebSocket에서:

```json
{"type": "WEBRTC_CONNECTED"}
```

전송 직후 클라이언트가 그 WebSocket 연결을 닫는다.

**기대 결과**:
- 몇 초(유예 시간, 기본 7초) 기다려도 B 쪽에 `PEER_DISCONNECTED`나 `PEER_LEFT`가 오지 않는다 — A는 방에서 제외되지 않는다(FR-004, SC-002).
- 이후 A가 `POST /game-rooms/{roomId}/results`를 호출하면(§5) 정상 처리된다 — "방 이탈" 취급을 안 받았음을 결과 보고 성공으로 다시 확인.

**회귀 확인(신호 없는 단절)**: 별도 세션으로 B가 `WEBRTC_CONNECTED` 없이 WebSocket 연결을 강제로 끊으면(브라우저 탭 닫기 시뮬레이션), 유예 시간(7초) 후 A 쪽에 `PEER_DISCONNECTED`가 오고 이어서 이탈 처리되는지 확인(기존 002 동작, 회귀 없음, FR-005).

**폴백 확인(FR-006)**: `WEBRTC_CONNECTED`를 보내지 않고 게임 시작 후 일정 시간이 지나도, 방 WebSocket 연결이 서버에 의해 강제로 끊기지 않고 유지되는지 확인.

## §5. 대전 모드 결과 보고 — 승자 정보만 (US4, FR-021/033)

```bash
curl -i -X POST http://localhost:8080/game-rooms/{roomId}/results \
     -H "Authorization: Bearer <A의 토큰>" \
     -H "Content-Type: application/json" \
     -d '{"winnerUserId": <A의 사용자 ID>}'
```

**기대 결과**: `201`과 함께 `GameResultResponse`(`winnerUserId`) 반환. 점수 필드도 `gameSessionId`도 요청/응답 어디에도 없다(`game_sessions` 테이블 자체가 제거됨, research.md #8). 같은 방에 다시 결과를 보고하면 `409`(중복, 회귀 없음).

**무승부 확인(FR-033)**: 다른 방에서 `winnerUserId`를 생략(또는 `null`)하고 보고 → `201` 성공, 어느 쪽 승수·패수에도 반영되지 않는지 §9의 랭킹 조회로 확인.

**참가자 아님 거부**: 방 참가자가 아닌 사용자 토큰으로 같은 API 호출 → `403`(회귀 없음).

## §6. 결과 후 방 WAITING 복귀 및 재대결 (US5, FR-013~016)

§5(A 승리) 직후:

```bash
curl -s http://localhost:8080/game-rooms/subscribe?ticket=<로비 티켓>
```

**기대 결과**: 방 상태가 `CLOSED`가 아니라 `WAITING`으로 돌아오고, 양쪽 `ready`가 `false`로 초기화되며 `participantCount`는 그대로 2다. 3초 이내(SC-006) 로비 실시간 목록(SSE)에 그 방이 다시 나타나는지 확인. 이어서 A, B가 각자 `POST /game-rooms/join`(같은 roomCode)을 다시 호출 → 응답에 **새** `realtimeTicket`이 발급되는지 확인(FR-016, §1과 같은 필드지만 값은 갱신됨). 새 티켓으로 재연결 후 다시 `ready` → `start` → `results` 사이클이 정상 반복되는지 확인(재대결).

**상대가 이미 나간 경우**: 새 방에서 게임을 시작한 뒤, 결과를 보고하기 전에 상대방이 명시적으로 `POST /game-rooms/{roomId}/leave`를 호출(방이 `CLOSED`로 전환됨을 확인) → 그 뒤 결과 보고를 시도하면 `409`(`ROOM_NOT_IN_PROGRESS`)로 거부되는지 확인 — "leave() 경로를 따라간다"는 별도 분기가 아니라, 이미 `IN_PROGRESS`가 아닌 방에 대한 기존 거부 규칙이 그대로 적용되는 것뿐임을 확인(새 로직 없음, FR-014).

## §7. 대전 모드 게임 종류 구분 (US6, FR-017/018/020)

§1에서 `gameType: "TETRIS_DUEL"`로 방을 하나 더 생성 → 응답의 `gameType`이 정확히 반영되는지, `capacity`가 여전히 `2`인지 확인. `gameType`을 생략하고 `POST /game-rooms` 호출 → `400` 확인(FR-017). 로비 SSE 목록(§6)에 두 방(`SIGN_DUEL`, `TETRIS_DUEL`)이 각자의 `gameType`과 함께 노출되는지 확인.

## §8. 테트리스 솔로 — 게임방 없이 결과만 (US8, FR-027/028)

```bash
curl -i -X POST http://localhost:8080/solo-results \
     -H "Authorization: Bearer <A의 토큰>" \
     -H "Content-Type: application/json" \
     -d '{"score": 1234}'
```

**기대 결과**: 사전에 방을 만들거나 WebSocket을 연결하지 않고 이 호출 하나만으로 `201`과 `SoloResultResponse`(`resultId`, `score`)를 받는지 확인(SC-007). 같은 사용자가 연속으로 여러 번 호출해도 매번 별개 기록으로 저장되며 거부되지 않는지 확인(중복 방지 없음, spec.md Assumptions).

## §9. 랭킹 게임 종류별 완전 분리 (US9, FR-025/026/029/032)

```bash
curl -i -H "Authorization: Bearer <A의 토큰>" \
     "http://localhost:8080/rankings?gameType=SIGN_DUEL"

curl -i -H "Authorization: Bearer <A의 토큰>" \
     "http://localhost:8080/rankings?gameType=TETRIS_DUEL"

curl -i -H "Authorization: Bearer <A의 토큰>" \
     "http://localhost:8080/rankings?gameType=TETRIS_SOLO"
```

**기대 결과**:
- `gameType` 파라미터 없이 호출하면 `400`(FR-025, 필수 파라미터).
- `SIGN_DUEL` 랭킹에는 §5의 승리가 A의 `score`(승수)에 반영되어 있고, `TETRIS_DUEL`/`TETRIS_SOLO` 랭킹에는 전혀 영향이 없다(완전 분리 확인).
- `TETRIS_SOLO` 랭킹에서 A의 `score`가 §8에서 보고한 값 중 **최고값**과 일치하는지 확인(MAX 집계, 여러 번 보고했다면).
- 한 번도 플레이하지 않은 게임 종류로 B가 조회하면 `me: null`(US9 AC4, 001과 다름 — 예전엔 0승 0패로 항상 존재).

**동률 처리 확인(FR-026)**: 두 사용자가 같은 승수를 갖도록 여러 방에서 결과를 보고한 뒤(예: A, B 모두 2승), 그중 패수가 더 적은 쪽(예: A가 2승 0패, B가 2승 1패)이 랭킹에서 더 높은 순위로 나오는지 확인 — 승수 동률이면 패수 오름차순으로 정렬되는지 검증(기존 001 `users.win_count`/`loss_count` 동률 규칙과 동일, 회귀 없음).

**마이그레이션 검증(FR-032)**: 마이그레이션 전 `users.win_count`가 0보다 컸던 기존 사용자가 있다면, `SIGN_DUEL` 랭킹에 그 값이 그대로(또는 이후 추가 승리만큼 더해져) 반영되어 있는지 확인 — `users` 테이블에서 `win_count`/`loss_count` 컬럼 자체가 사라졌는지도 함께 확인(`DESCRIBE users;`).

## 참고: 002 quickstart §1~§16과의 관계

이 문서는 002의 검증 항목을 대체하지 않는다 — 002 §9~§16(로비 SSE, 재접속, 방치 정리 등)은 여전히 그대로 유효하며 회귀 없이 통과해야 한다(§3/§4가 그중 게임 시작~시그널링 부분만 다시 짚은 것). 002 §1~§8(Part A 선행 안정화)도 이 스펙과 무관하게 계속 통과 상태를 유지해야 한다.
