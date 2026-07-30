# 1:1 새로고침·공유 타깃 연출 트러블슈팅 — 2026-07-30

## 증상

- 진행 중 새로고침 뒤 fresh ticket을 발급받아도 signaling 또는 방 확인에서 403이 반복됐다.
- 오래된 `sessionStorage` 상태로 ready/start/result를 다시 요청하면서 409가 발생했다.
- 양쪽 브라우저가 같은 결과를 동시에 제출해 첫 요청은 201, 두 번째 요청은 409가 됐다.
- 결과 저장이 끝나기 전에 참가자가 재대결을 눌러 다음 ready/start와 충돌했다.
- 브라우저 뒤로가기로 화면만 이동하고 서버 방 참가 상태, PeerConnection 또는 카메라가 남을 수 있었다.
- 정답자가 아닌 브라우저에서는 공유 타깃 claim 연출이 보이지 않았다.

## 원인

- 저장된 `PLAYING` 세션을 서버 확인 없이 신뢰했다.
- 1회용 ticket과 10초 재접속 유예의 경계를 구분하지 못했다.
- 결과 저장 주체가 하나로 정해지지 않았고 모든 409를 멱등 성공으로 숨겼다.
- 결과 REST 성공을 상대 peer가 확인하는 ACK가 없었다.
- UI 버튼 퇴장과 브라우저 history 이동이 서로 다른 cleanup 경로를 사용했다.
- 공유 타깃 효과가 각 보드에 귀속되어 권위 claim 이벤트를 양쪽이 동일하게 렌더링하지 않았다.

## 해결

- 새로고침 시 멱등 `join(roomCode)`으로 서버 참가 상태와 fresh ticket을 다시 확인한다.
- 서버가 `PLAYING`일 때만 카메라와 WebRTC를 다시 연결한다.
- WebRTC handoff로 Room WebSocket을 닫기 전 `WEBRTC_CONNECTED`를 보내 의도적 종료임을 알린다.
- 결과 REST는 방장만 제출하고, 201 이후 `RESULT_RECORDED` P2P ACK를 전송한다.
- 참가자는 결과 ACK 전까지 재대결 버튼을 사용할 수 없다.
- 403/409를 무조건 성공으로 바꾸지 않고 stale session이면 방 세션과 미디어를 폐기한다.
- 대기방과 게임 화면의 `popstate`를 기존 leave/forfeit cleanup 경로에 연결한다.
- 공유 paper black-hole은 양쪽에서 같은 authoritative claim을 렌더링하고 실제 spawn은 승리한 보드에만 지연 적용한다.

## 검증

- Room socket, waiting room, gateway, P2P transport, result modal, controller, AI recognizer 집중 테스트 58개 통과
- 뒤로가기 시 REST leave, WebRTC disconnect, 카메라 stop 테스트 포함
- 게임 주요 라우트와 배율 테스트 20개 통과
- TypeScript/Vite production build 통과
- 1536×864, 960×720, 800×720에서 가로 overflow 및 browser console 오류 없음

## 재발 시 확인 순서

1. 실패 endpoint와 HTTP status/body를 먼저 기록한다.
2. 현재 roomId, roomCode, sessionStorage status, backend join 응답 status를 비교한다.
3. ticket이 이전 연결에서 소비된 값인지 확인한다.
4. Room WebSocket에서 `WEBRTC_CONNECTED`가 전송됐는지 확인한다.
5. result 요청자가 방장인지, 같은 match에서 이미 201이 있었는지 확인한다.
6. 결과 ACK 전 재대결 요청이 발생했는지 확인한다.
7. 뒤로가기 뒤 leave 요청과 media/camera cleanup이 모두 실행됐는지 확인한다.
