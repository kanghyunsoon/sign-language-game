# 백엔드 계약 정렬 기준 — 2026-07-23

이 문서는 배포 Swagger와 프런트 코드의 현재 경계를 정의한다. 과거 개발용 STOMP/라인레이스 계약은 운영 근거로 사용하지 않는다.

## REST

| 기능 | 계약 |
| --- | --- |
| 방 생성 | `POST /game-rooms?userId={id}`, body `{gameType}` |
| 참가 | `POST /game-rooms/join?userId={id}`, body `{roomCode}` |
| 준비 | `POST /game-rooms/{roomId}/ready?userId={id}`, body `{isReady}` |
| 시작 | `POST /game-rooms/{roomId}/start?userId={id}` |
| 퇴장 | `POST /game-rooms/{roomId}/leave?userId={id}` |
| 결과 | `POST /game-rooms/{roomId}/results?userId={id}`, body `{winnerUserId}` |
| ICE/TURN | `GET /webrtc/ice-servers` |

`gameType`은 `TETRIS_DUEL` 또는 `SIGN_DUEL`을 사용한다. 결과는 점수를 직접 보내지 않는다. 백엔드가 승자 ID를 역할에 매핑하여 승자 1, 패자 0으로 기록한다.

## SSE

- 티켓 발급: `POST /auth/sse-ticket` + Bearer 인증
- 구독: `GET /game-rooms/subscribe?ticket=...`
- 최초 `snapshot`, 이후 `update`
- 1회용/만료 티켓은 재사용하지 않는다.
- `EventSource` 요청에 Authorization 헤더를 억지로 붙이지 않는다.

## Room WebSocket

- URL: `/ws/game-rooms/{roomId}?ticket=...`
- 프로토콜: native WebSocket
- 클라이언트 발신: `SIGNAL`
- 서버 이벤트: peer 연결 상태, room start, signal, error
- STOMP CONNECT/SUBSCRIBE/SEND와 destination은 사용하지 않는다.

## P2P 게임

- media와 `game-v1` DataChannel은 동일한 RTCPeerConnection을 사용한다.
- 게임 envelope는 `GAME_P2P_V1`이다.
- 방장은 게임 명령의 권위자이며 command ID, 참가자 ID, match/turn을 검증한다.
- Room WebSocket으로 게임 상태를 보내지 않는다.
- 재연결 시 새 ticket으로 signaling을 다시 열고 ICE restart 후 snapshot을 요청한다.

## 결과와 재대결

- 양쪽 클라이언트가 동일한 host-authoritative 최종 snapshot에서 계산한 같은 `winnerUserId`를 제출한다.
- body는 `{winnerUserId: number}`다.
- `201`이면 승패 저장과 방 `WAITING` 복귀가 완료됐다.
- `409`는 이미 처리된 결과 또는 더 이상 진행 중이 아닌 매치이므로 멱등 종료로 처리한다.
- 이 방식은 참가자가 결과 화면을 먼저 떠나는 경쟁 조건과 방장의 결과 직후 연결 종료에도 결과 저장을 보강한다.
- 재대결 화면은 ready를 양쪽 false로 초기화한다.

## 배포 합격 기준

- 두 게임의 생성 요청에 올바른 `gameType`이 포함된다.
- SSE 목록이 게임 종류별로 분리된다.
- 두 계정이 ready/start 후 실제 DataChannel을 연다.
- 실제 손 인식 입력이 P2P 명령으로 전달된다.
- 양쪽 종료 결과가 일치한다.
- 결과 요청이 실제 승자 ID를 보내고 백엔드 랭킹에 1/0으로 반영된다.
- 결과 뒤 동일 방 재대결이 가능하다.
- 서로 다른 NAT에서 TURN relay가 동작한다.
- 백엔드 소스 변경은 없다.

## 2026-07-30 결과·재접속 계약 보정

- join은 기존 참가자에게 멱등이며 권위 room state와 fresh ticket을 반환한다.
- 결과 제출자는 방장 한 명이다. 참가자는 P2P `RESULT_RECORDED` ACK로 저장 완료를 확인한다.
- 결과 201만 방 `WAITING` 전환의 성공 근거로 사용한다.
- 409 전체를 성공으로 흡수하지 않는다. stale 또는 무효 상태이면 저장 세션과 media를 정리한다.
- create/join 뒤 Room WebSocket 확인 제한은 15초, 비정상 종료 재접속 유예는 10초다.
- WebRTC 연결 뒤 signaling socket handoff 전 `WEBRTC_CONNECTED`를 보낸다.
- 대기방 권위 이벤트는 `PEER_JOINED`, `PEER_READY_CHANGED`, `PEER_LEFT`, `GAME_STARTED`, `ERROR`다.
- 새로고침 복구는 `join(roomCode)` 응답이 `PLAYING`인 경우에만 수행한다.

자동 테스트와 build 범위는 완료됐고, TURN/WSS/실제 계정 DB 반영은 배포 smoke test에서 확인한다.
