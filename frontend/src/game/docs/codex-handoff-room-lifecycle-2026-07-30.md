# 1:1 WebRTC 방 생명주기 최종 핸드오프 — 2026-07-30

## 작업 기준

- 작업 브랜치: `feature/bugfix/webrtc-room-lifecycle-403-409`
- 기준 프런트: `origin/frontend` `41236fa`
- 확인한 백엔드: `origin/backend` `1399ee2`
- 확인한 AI: `origin/ai` `053b9ee`
- 배포 계약: `https://i15a405.p.ssafy.io/api/swagger-ui/index.html`
- 백엔드와 AI 소스는 수정하지 않았다.

## 반영 커밋

| 커밋 | 내용 |
| --- | --- |
| `b09600b` | 방 생성·참가·결과 처리에서 403/409 및 stale session 방어 |
| `5e80dac` | 재접속, ready 이벤트, 결과 ACK, AI sequence reset, 뒤로가기 정리 |
| `7d2808b` | 게임 고정 캔버스 제거와 브라우저 확대·축소 반응형 처리 |

## 확인된 백엔드 계약

- 기존 참가자의 `join`은 멱등 요청이다. 현재 방 상태와 새 `realtimeTicket`을 반환하므로 프런트가 409를 캐시 성공으로 바꾸지 않는다.
- create/join 뒤 Room WebSocket 확인은 15초 안에 이뤄져야 한다.
- 비정상 Room WebSocket 종료에는 10초 재접속 유예가 있다.
- WebRTC/DataChannel 준비 후 Room WebSocket을 의도적으로 닫을 때는 먼저 `WEBRTC_CONNECTED`를 보낸다.
- ready 변경은 `PEER_READY_CHANGED {userId, isReady}`로 전파된다.
- 참가와 퇴장은 `PEER_JOINED`, `PEER_LEFT`로 전파되며 방장 퇴장 시 `newHostUserId`가 올 수 있다.
- start는 대기 상태가 아니거나 두 참가자가 모두 ready가 아니면 409가 정상이다.
- result는 `IN_PROGRESS`에서만 허용되며 성공 시 201과 함께 방이 `WAITING`으로 돌아간다.
- 중복 결과, 종료·무효화된 매치 결과는 409이고 방 참가자가 아니면 403이다.
- 진행 중 명시적 leave는 방을 종료한다.

## 확인된 AI 계약

- 게임 AI 요청: `GET_CAPABILITIES`, `LANDMARK_FRAME`, `HAND_NOT_DETECTED`, `RESET_SEQUENCE`
- AI 응답은 capability와 prediction이며 최종 확정은 프런트 decoder 책임이다.
- 연결 단위 frame sequence가 있으므로 새 매치와 솔로 재시작 전에 로컬 pending frame/decoder를 비우고 `RESET_SEQUENCE`를 보낸다.

## 프런트 최종 동작

### 대기방

- mount와 새로고침 시 저장된 `roomCode`로 멱등 `join`을 호출해 서버 상태와 새 ticket을 다시 받는다.
- `PEER_JOINED`, `PEER_READY_CHANGED`, `PEER_LEFT`를 로컬 방 상태에 반영한다.
- `NOT_ROOM_PARTICIPANT`, `ROOM_NOT_FOUND`, 권한 오류에서는 저장된 방 세션과 미디어를 정리하고 방 목록으로 복귀한다.
- ready는 REST 성공 응답과 서버 이벤트를 기준으로 확정한다.
- 브라우저 뒤로가기와 나가기 버튼은 REST leave, Room WebSocket 종료, WebRTC 종료, 카메라 종료, sessionStorage 정리를 같은 경로로 수행한다.

### 게임 중 새로고침·재접속

- `PLAYING` 세션은 새로고침 뒤 복원할 수 있지만 그대로 신뢰하지 않는다.
- 멱등 `join(roomCode)`으로 서버의 권위 상태가 `PLAYING`인지 확인한 뒤에만 카메라와 WebRTC를 다시 연결한다.
- 서버 상태가 `WAITING`이면 대기방, `FINISHED` 또는 참가자 아님이면 방 목록으로 이동한다.
- 재접속은 fresh ticket을 사용하며 과거 1회용 ticket을 재사용하지 않는다.

### 결과와 재대결

- 결과 REST 저장은 방장만 한 번 수행한다. 양쪽 동시 제출로 발생하던 두 번째 409를 만들지 않는다.
- 201 성공 뒤 방장은 `RESULT_RECORDED` P2P ACK를 전송한다.
- 참가자는 ACK를 받은 뒤에만 재대결 버튼을 활성화한다.
- 409를 무조건 성공으로 숨기지 않는다. stale/invalid 상태는 오류로 처리하고 저장 세션과 미디어를 정리한다.
- 결과 저장 성공 뒤 양쪽 로컬 상태는 ready false, `activeMatchId: null`, `WAITING/FULL`로 맞춘다.

### 뒤로가기와 새로고침

- 대기방 뒤로가기: 명시적 leave 후 방 목록으로 이동한다.
- 진행 중 뒤로가기: P2P 몰수 이벤트 전달을 짧게 기다리고, 방장이면 결과 저장을 마친 뒤 leave한다.
- 새로고침: sessionStorage만으로 게임을 재개하지 않고 서버 join 결과를 확인한다.
- 페이지 이탈 cleanup은 카메라, PeerConnection, DataChannel, Room WebSocket을 모두 포함한다.

### 게임 화면 배율

- `1280×720`, `1920×1080`, `2048×1092` 고정 캔버스와 브라우저 zoom을 상쇄하던 transform scale을 제거했다.
- 게임 선택, 모드 선택, 로비, 대기방, 1:1 게임, 솔로 게임은 일반 문서 폭과 `100dvh`를 사용한다.
- 솔로 화면은 820px 이하에서 게임판과 카메라/가이드를 세로로 배치한다.
- 확인한 뷰포트: 1920×1080, 1536×864, 960×720, 800×720. 확인 범위에서 가로 overflow와 console 오류는 없었다.

## 검증

- 방 생명주기 집중 테스트: 58개 통과
- 게임 배율·주요 라우트 테스트: 20개 통과
- `node --check scripts/p2p-e2e-relay.mjs` 통과
- TypeScript/Vite production build 통과
- 전체 suite 확인: 651개 중 645개 통과, 이번 변경과 무관한 기존 테스트 6개 실패
  - 학습 숫자 정책 3개
  - bot danger-line 시간 가정 1개
  - 기본 recognition active-player 정책 2개

## 해결 상태

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| 결과 중복 제출 409 | 구현 완료 | 방장 단일 제출 + `RESULT_RECORDED` ACK |
| 오래된 방 세션의 ready/start/result 403·409 | 구현 완료 | mount 시 멱등 join으로 권위 상태 hydrate |
| 1회용 ticket 재사용과 무한 403 retry | 구현 완료 | 연결마다 fresh ticket, 권한 오류 retry 중단 |
| 대기방 ready·참가·퇴장·방장 위임 동기화 | 구현 완료 | 공식 Room WS 이벤트 반영 |
| 진행 중 새로고침 | 구현 완료 | 서버가 `PLAYING`일 때만 media 재연결 |
| 뒤로가기 cleanup | 구현 완료 | waiting leave, playing forfeit/leave 경로 연결 |
| 새 매치 AI frame sequence 오염 | 구현 완료 | 로컬 decoder clear + `RESET_SEQUENCE` |
| 브라우저 확대·축소 상쇄 | 구현 완료 | 고정 canvas transform 제거 |
| 실제 TURN relay | 운영 검증 대기 | 서로 다른 NAT의 배포 환경 필요 |
| 배포 WSS 10초 재접속 | 운영 검증 대기 | 두 실제 계정으로 network interruption 필요 |
| 운영 결과·재대결 smoke test | 운영 검증 대기 | 실제 배포 backend DB/랭킹 확인 필요 |

따라서 프런트 구현과 자동 검증 범위는 완료됐지만, 위 세 운영 검증 항목까지 통과하기 전에는 전체 생명주기를 운영 검증 완료로 표시하지 않는다.

## 배포 직후 수동 확인

1. 서로 다른 인증 계정으로 방 생성 → 참가 → 양쪽 ready → start를 수행한다.
2. 양쪽 WebRTC/DataChannel 연결 뒤 Room WebSocket handoff에 403 무한 재시도가 없는지 본다.
3. 대기방과 게임 화면에서 각각 새로고침하고 10초 유예 안에 복구되는지 확인한다.
4. 대기방과 게임 화면에서 각각 브라우저 뒤로가기를 눌러 방 참가자와 카메라가 남지 않는지 확인한다.
5. 정상 종료 뒤 결과 API가 한 번만 201이고, 양쪽 재대결이 결과 ACK 뒤 활성화되는지 확인한다.
6. 80%, 100%, 125%, 150% 확대·축소에서 메인·학습과 동일하게 콘텐츠가 확대되고 좁은 폭에서 재배치되는지 확인한다.
7. 실제 TURN relay candidate와 서로 다른 NAT에서 재접속을 확인한다.

## 백엔드 추가 요청

현재 확인한 백엔드 구현만으로 프런트 수정 범위는 충족한다. 추가 요청은 없다. 다만 운영 로그에는 다음 항목을 남기면 재발 분석이 쉬워진다.

- roomId, userId, endpoint, HTTP status, backend error code
- ticket 발급 실패와 Room WebSocket close code/reason
- result 요청의 matchId와 중복 여부

## 관련 문서

- `room-lifecycle-and-zoom-troubleshooting-2026-07-30.md`
- `battle-refresh-effect-troubleshooting-2026-07-30.md`
- `backend-contract-alignment-2026-07-23.md`
- `backend-aligned-frontend-status-2026-07-23.md`
- `codex-handoff-p2p-realtime-2026-07-23.md`
- `reference/manual-test-checklist.md`
