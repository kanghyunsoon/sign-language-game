# 배포 백엔드 계약 기준 프런트 상태

확인일: 2026-07-23
기준: `https://i15a405.p.ssafy.io/api/swagger-ui/index.html`

백엔드 소스는 변경하지 않았다. 이 문서는 배포 Swagger를 브라우저에서 다시 읽어 확인한 현재 계약과 프런트 구현 상태만 기록한다.

## 현재 운영 흐름

1. `POST /game-rooms?userId=...`에 필수 body `{gameType}`을 보내 방을 생성한다.
   - 블럭쌓기 1:1: `TETRIS_DUEL`
   - 지문자 턴 배틀: `SIGN_DUEL`
2. 응답은 방 정보와 `gameType`, 1회용 `realtimeTicket`을 포함한다.
3. 로비는 Bearer 인증으로 `POST /auth/sse-ticket`을 호출해 티켓을 받은 뒤 `GET /game-rooms/subscribe?ticket=...`를 `EventSource`로 구독한다.
4. 참가자는 `POST /game-rooms/join` body `{roomCode}`로 입장한다.
5. ready/start/leave는 REST를 사용한다.
6. `/ws/game-rooms/{roomId}?ticket=...`는 ticket 기반 native WebSocket이다. STOMP frame이나 destination을 사용하지 않는다.
7. Room WebSocket은 방 이벤트와 WebRTC `SIGNAL` 중계만 담당한다.
8. 영상과 게임 `game-v1` DataChannel이 열린 뒤 게임 명령·이벤트·스냅샷은 `GAME_P2P_V1` envelope로만 교환한다.
9. 결과는 `POST /game-rooms/{roomId}/results?userId=...` body `{winnerUserId}`로 제출한다.
10. 백엔드는 승자에게 score 1, 패자에게 score 0을 기록하고 방을 `WAITING`으로 되돌린다. 프런트는 방장 요청의 201만 저장 완료로 사용한다.

## 프런트 구현 대응

- `SwaggerBattleRoomGateway`
  - 두 게임별 필수 `gameType`을 전송한다.
  - SSE 목록을 게임 종류별로 분리한다.
  - Swagger에 없는 방 상세 GET을 호출하지 않고 create/join/ready/start 응답을 캐시한다.
  - 결과 처리 뒤 백엔드의 `WAITING`, ready 초기화 상태를 로컬 캐시에 반영해 재대결 화면을 유지한다.
- `RealtimeTicketClient`, `LobbySseClient`
  - 티켓 발급 요청에는 Bearer 인증 헤더를 사용한다.
  - `EventSource`에는 임의 헤더 대신 1회용 ticket query를 사용한다.
  - 재연결할 때 소비된 티켓을 재사용하지 않는다.
- `RoomRealtimeSocket`, `NativeRoomWebRtcSignalingTransport`
  - native WebSocket과 `SIGNAL`만 사용한다.
- `MeshWebRtcMediaSession`
  - 영상과 `game-v1` DataChannel을 같은 peer connection에서 관리한다.
  - 재연결에는 새 티켓과 ICE restart를 사용한다.
- `P2pBattleTransport`, `P2pGlyphTurnMatchTransport`
  - host authority, 명령 중복 제거, match/turn 검증, 이벤트와 복구 snapshot을 DataChannel 위에서 처리한다.
- `BattleResultClient`
  - 최종 승자의 실제 숫자 사용자 ID를 `{winnerUserId}`로 제출한다.
  - 방장만 동일한 권위 snapshot의 결과를 제출하고 참가자는 P2P ACK로 완료를 확인한다.
  - 호스트 승리와 도전자 승리는 백엔드에서 각각 `1:0`, `0:1`로 저장된다.
  - 403/409를 무조건 성공으로 숨기지 않고 stale room session과 media를 정리한다.

## SSE 인증 해석

“SSE 헤더가 필요하다”는 말은 티켓을 발급받는 `POST /auth/sse-ticket` 요청에 Bearer 인증이 필요하다는 뜻이다. 브라우저 기본 `EventSource`는 임의 Authorization 헤더를 지원하지 않으므로 실제 SSE 연결은 Swagger 설명대로 `ticket` query를 사용한다.

## 확인된 검증 범위

- 블럭쌓기와 턴 배틀 모두 로컬 두 브라우저에서 방 생성 → 참가 → 양쪽 ready → start → 실제 RTCPeerConnection/DataChannel 연결 → 자연 종료 → 양쪽 승패 일치까지 확인했다.
- 턴 배틀의 로컬 종료 검증은 AI 서버 대신 개발/E2E 전용 카드 trigger를 사용했다. 운영 빌드에는 클릭 입력이 없고 실제 손 인식 확정만 명령으로 전송한다.
- 2026-07-30 기준 room lifecycle 집중 테스트 58개, 게임 배율·라우트 테스트 20개와 TypeScript/Vite production build가 통과했다.
- 과거 방 `100004`에서 양쪽 독립 사용자로 11턴을 진행해 최종 HP `89:0`/`0:89`, 승리/패배 일치와 동일 방 대기실 복귀를 확인했다. 당시 양쪽 결과 제출 방식은 현재 방장 단일 제출 방식으로 대체됐다.
- 프런트 런타임과 package 의존성에 STOMP는 없다.
- 사용자용 라인레이스 route는 제거됐고 `turn-battle`로 교체됐다.
- 백엔드 디렉터리 변경은 0건이다.

## 인프라 배포 후 반드시 확인할 항목

- 서로 다른 네트워크의 인증된 두 계정에서 HTTPS/WSS와 WebSocket upgrade
- `/webrtc/ice-servers`가 반환하는 실제 TURN credential과 relay candidate
- 실제 카메라 → MediaPipe → AI WebSocket → 손 인식 확정 → P2P 명령
- 일시 단절 후 새 ticket/ICE restart/DataChannel snapshot 복구
- 10초 이상 단절의 몰수패 판정 정책

마지막 항목은 순수 P2P 네트워크 분할 시 두 클라이언트가 서로를 단절자로 볼 수 있기 때문에 프런트만으로 신뢰할 수 있는 승자를 결정할 수 없다. 배포 단계에서는 백엔드가 제공하는 `PEER_DISCONNECTED`/`PEER_RECONNECTED` 권위 이벤트 또는 별도 서버 판정 정책이 확정되기 전까지 자동 몰수패를 활성화하지 않는다.

## 2026-07-30 소스 재확인에 따른 정정

이 절은 위 2026-07-23 기록 중 결과 제출과 409 처리 설명을 대체한다.

- 기존 참가자의 join은 백엔드에서 멱등이며 현재 방 상태와 새 `realtimeTicket`을 반환한다. 프런트는 join 409를 캐시된 성공으로 바꾸지 않는다.
- 결과 REST는 양쪽이 제출하지 않고 방장만 한 번 제출한다.
- 성공 201 뒤 방장이 `RESULT_RECORDED` P2P ACK를 전송하며 참가자는 ACK 전 재대결을 할 수 없다.
- 409는 무조건 멱등 성공으로 처리하지 않는다. 중복·무효·종료 상태를 구분하지 못하는 응답은 오류로 유지하고 stale session/media를 정리한다.
- ready 변경은 `PEER_READY_CHANGED`, 참가·퇴장과 방장 위임은 `PEER_JOINED`, `PEER_LEFT`를 반영한다.
- WebRTC handoff로 Room WebSocket을 닫을 때는 `WEBRTC_CONNECTED`를 먼저 보낸다.
- 새로고침은 저장된 `PLAYING`을 바로 신뢰하지 않고 멱등 join 결과가 `PLAYING`일 때만 media를 복구한다.
- 프런트 구현과 자동 검증은 완료됐다. 실제 TURN relay, 배포 WSS 재접속, 실제 두 계정의 결과·재대결은 운영 검증 대기다.
