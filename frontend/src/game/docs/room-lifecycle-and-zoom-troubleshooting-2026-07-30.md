# 1:1 Room Lifecycle 및 게임 배율 트러블슈팅 — 2026-07-30

## 403/409, 새로고침, 뒤로가기

### 증상

- 대기방이나 진행 중 게임 새로고침 뒤 Room WebSocket 403 또는 ready/start/result 409가 반복된다.
- 정상 종료 때 양쪽 peer가 결과를 제출해 두 번째 요청이 409가 된다.
- 결과 저장보다 재대결 전환이 먼저 실행된다.
- 브라우저 뒤로가기로 화면만 이동하고 방 참가 상태, 카메라 또는 WebRTC가 남는다.

### 원인

- `sessionStorage`의 방 상태를 서버 확인 없이 복원했다.
- 1회용 ticket을 재사용하거나 권한 오류에도 재시도했다.
- 기존 참가자의 join이 멱등이라는 백엔드 계약 대신 프런트 캐시로 409를 숨겼다.
- 결과 저장 주체와 완료 ACK가 없었다.
- history 이동과 화면 버튼이 서로 다른 cleanup 경로를 사용했다.

### 해결

- mount에서 `join(roomCode)`으로 서버 권위 상태와 fresh ticket을 다시 받는다.
- 서버가 `PLAYING`일 때만 카메라와 WebRTC를 재연결한다.
- Room WebSocket handoff 전에 `WEBRTC_CONNECTED`를 보낸다.
- 결과는 방장만 저장하고 성공 뒤 `RESULT_RECORDED` P2P ACK를 보낸다.
- ACK 전에는 재대결을 비활성화한다.
- 403/409를 무조건 성공으로 바꾸지 않고 stale room session과 media를 정리한다.
- 대기방과 게임의 `popstate`를 leave/forfeit cleanup에 연결한다.
- 새 매치와 솔로 재시작에서 AI decoder/pending frame을 비우고 `RESET_SEQUENCE`를 보낸다.

### 재발 시 확인 순서

1. 실패 endpoint와 HTTP status/body를 기록한다.
2. roomId, roomCode, sessionStorage status, backend join 응답 status를 비교한다.
3. ticket이 이전 연결에서 소비된 값인지 확인한다.
4. Room WebSocket에서 `WEBRTC_CONNECTED`가 전송됐는지 확인한다.
5. result 요청자가 방장인지, 같은 match에서 이미 201이 있었는지 확인한다.
6. 결과 ACK 전 재대결 요청이 발생했는지 확인한다.
7. 뒤로가기 뒤 leave 요청과 media/camera cleanup이 모두 실행됐는지 확인한다.

## 게임 화면 확대·축소

### 증상

메인·학습 화면은 브라우저 확대 시 콘텐츠가 커지고 좁은 폭에서 재배치되지만 게임 화면은 거의 같은 물리 크기로 유지되거나 예상과 다르게 축소된다.

### 원인

- 게임 모듈이 1280×720 또는 1920×1080 고정 캔버스를 `window.innerWidth/innerHeight`로 다시 scale했다.
- 솔로 화면은 2048×1092 고정 캔버스를 한 번 더 scale했다.
- 브라우저 zoom이 CSS viewport를 줄이면 내부 transform도 같은 비율로 줄어 zoom 효과를 상쇄했다.

### 해결

- 게임 모듈과 솔로 화면의 JavaScript scale 계산 및 고정 transform wrapper를 제거했다.
- 일반 문서처럼 `width: 100%`, `100dvh`, CSS media query로 배치한다.
- 820px 이하 솔로 화면은 게임판과 카메라/가이드를 세로로 쌓는다.
- 고정 캔버스 전용 1:1 레이아웃 강제 규칙을 제거했다.

## 자동 검증과 운영 경계

- Room lifecycle 집중 테스트 58개 통과
- 주요 게임 라우트와 배율 테스트 20개 통과
- TypeScript/Vite production build 통과
- 1920×1080, 1536×864, 960×720, 800×720에서 `transform: none` 확인
- 확인한 화면에서 가로 overflow와 browser console 오류 없음

프런트 구현은 완료됐다. 실제 TURN relay, 배포 WSS 10초 재접속, 실제 두 계정의 결과 DB 반영과 재대결은 운영 smoke test가 남아 있다.
