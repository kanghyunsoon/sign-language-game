# P2P 대전 연동 이후 진행 사항 — 2026-07-24

이 문서는 현재 브랜치의 프런트·AI 문서 작업 이후 실제 서비스 배포까지 남은 일을 우선순위와 완료 조건으로 정리한다. 백엔드 소스 변경을 지시하는 문서가 아니며, 백엔드·인프라 담당자와 합의가 필요한 항목은 별도로 표시한다.

## 현재 완료된 범위

- STOMP 런타임과 의존성을 제거했다.
- 사용자용 라인레이스 경로를 제거하고 지문자 턴 배틀로 교체했다.
- 블럭쌓기와 턴 배틀은 REST/SSE ticket/native WebSocket signaling/WebRTC DataChannel을 사용한다.
- 배포 Swagger의 `gameType`, `realtimeTicket`, `{winnerUserId}`, 결과 후 `WAITING` 복귀 계약을 반영했다.
- 로컬 독립 사용자 두 브라우저에서 방 생성부터 결과 저장과 동일 방 재대결까지 확인했다.
- 전체 프런트 130개 테스트 파일, 477개 테스트와 TypeScript/Vite production build가 통과했다.
- 백엔드 디렉터리 변경은 없다.

## P0 — 운영 배포 전에 반드시 완료

### 1. 실제 인증을 게임 모듈에 연결

현재 `LoginPage`는 API를 호출하지 않고 `/main`으로 이동한다. `App.tsx`는 `/game/*`에 개발용 `StandaloneGameHarness`를 마운트하며, production build에서도 고정 개발 사용자와 토큰 없는 상태로 실행된다. 이 상태에서는 `GameServiceProvider`가 Swagger 운영 계약 대신 개발용 room gateway를 선택한다.

완료 조건:

- 로그인 API가 실제 access token 또는 서버 세션을 발급한다.
- 로그인한 사용자의 숫자 `userId`, 표시명, access token을 공용 인증 상태에서 읽는다.
- `/game/*`는 `StandaloneGameHarness`가 아니라 실제 사용자와 토큰을 전달하는 host component로 `GameModule`을 마운트한다.
- production에서 `X-Dev-User-*`, `devUser`, `VITE_P2P_E2E` 경로를 사용하지 않는다.
- 로그아웃·토큰 만료 시 카메라, Room WebSocket, PeerConnection, DataChannel을 정리하고 로그인 화면으로 이동한다.

담당 경계: 프런트 인증/공용 앱 조립. 백엔드 인증 계약은 기존 API를 사용한다.

### 2. 운영 endpoint와 origin 정책 확정

확정할 값:

- HTTP/SSE API: `https://<backend-host>/api`
- Room signaling: `wss://<backend-host>/api/ws/game-rooms`
- AI inference: `wss://<ai-host>/<path>`
- ICE/TURN: `GET https://<backend-host>/api/webrtc/ice-servers`

완료 조건:

- 프런트 HTTPS에서 `ws://` 또는 `http://` mixed content가 발생하지 않는다.
- Bearer로 SSE ticket을 발급하고 `EventSource`에는 ticket query만 사용한다.
- 백엔드 WebSocket Origin allowlist에 production과 고정 staging origin이 포함된다.
- TURN 응답에 단기 credential과 `turn:`/`turns:` URL이 포함되고 실제 `relay` candidate가 잡힌다.
- Preview URL을 무제한 wildcard로 허용할지, 고정 staging domain만 허용할지 보안 정책이 정해진다.

담당 경계: 인프라·백엔드 설정. 프런트는 확정된 URL을 build-time 환경변수로 받는다.

### 3. Vercel 또는 최종 호스팅 설정 반영

`vercel-deployment-guide-2026-07-24.md`의 설정을 적용한다. Vercel은 정적 프런트만 호스팅하고 Spring 백엔드와 Python AI WebSocket은 기존 인프라에서 별도로 운영한다.

완료 조건:

- Root Directory `frontend`, Build Command `npm run build`, Output Directory `dist`
- Node.js 22.x 사용
- SPA deep link rewrite 적용
- `/api` reverse proxy 또는 직접 API origin 중 한 가지 방식 확정
- Preview와 Production 환경변수 분리
- production에 개발/E2E 환경변수가 없는지 확인

## P1 — 배포 직후 smoke test

아래 테스트는 동일 PC의 두 탭이 아니라 서로 다른 실제 계정과 가능하면 서로 다른 네트워크에서 수행한다.

| 순서 | 시나리오 | 완료 기준 |
| --- | --- | --- |
| 1 | 로그인과 새로고침 | 사용자·토큰이 유지되고 개발 사용자로 바뀌지 않음 |
| 2 | 블럭쌓기 방 생성·참가 | `TETRIS_DUEL`만 목록에 표시되고 양쪽 ready/start 성공 |
| 3 | 블럭쌓기 경기 | 양쪽 카메라, 상대 영상, DataChannel 보드 동기화, 자연 종료 확인 |
| 4 | 턴 배틀 방 생성·참가 | `SIGN_DUEL`만 목록에 표시되고 양쪽 ready/start 성공 |
| 5 | 턴 배틀 경기 | 내 카메라와 실제 손 인식으로 공격·집중·방어 명령 교환 |
| 6 | 결과 저장 | 호스트 승 `1:0`, 도전자 승 `0:1`, 무승부 null 계약 확인 |
| 7 | 재대결 | 동일 방 `WAITING`, 양쪽 ready false, 새 match로 재시작 |
| 8 | 일시 단절 | 새 ticket, ICE restart, authoritative snapshot으로 복구 |
| 9 | 퇴장·탭 종료 | 카메라 track, PeerConnection, DataChannel, room membership 정리 |

운영 검증에는 브라우저 콘솔, Network의 REST/SSE/WS, `chrome://webrtc-internals`, 백엔드/AI 로그의 동일 시간대를 함께 남긴다.

## P1 — 장애와 권위 정책 확정

### 자동 몰수패

순수 PeerConnection/DataChannel 상태만으로 10초 단절 승자를 결정하지 않는다. 네트워크 분할 시 양쪽이 모두 상대를 이탈자로 볼 수 있기 때문이다.

활성화 조건:

- 서버가 인증된 `PEER_DISCONNECTED`/`PEER_RECONNECTED` 또는 동등한 권위 이벤트를 제공한다.
- grace period의 시작 시각과 승자 판정을 서버가 한 번만 확정한다.
- 재연결 snapshot과 결과 API가 같은 match identity를 사용한다.

그전까지는 짧은 ICE 재연결과 snapshot 복구만 제공하고 자동 몰수패는 비활성 상태로 유지한다.

### 중복 결과

양쪽 클라이언트가 동일한 host-authoritative 최종 snapshot의 `winnerUserId`를 제출한다. 첫 요청은 `201`, 후속 요청은 `409` 멱등 성공이어야 한다. 서로 다른 승자를 제출한 경우는 정상 중복으로 숨기지 말고 서버 로그와 모니터링에서 충돌로 분류해야 한다.

## P2 — 안정화와 운영성

- 초기 JS bundle과 MediaPipe WASM을 route 단위로 지연 로딩한다.
- 카메라 거부, AI WebSocket 실패, TURN 실패를 사용자 문구와 관측 지표로 구분한다.
- Sentry 등 오류 수집 도구를 사용할 경우 access token, SSE ticket, SDP, ICE credential, 영상 데이터는 수집하지 않는다.
- 모바일·Safari는 지원 범위를 별도로 정하고, 우선 지원 데스크톱 Chrome/Edge 버전을 명시한다.
- 실제 조명·배경·두 사람 교차 환경의 손 소유권 오인식 횟수와 AI P95 지연을 기록한다.
- 운영 API 계약이 바뀌면 Swagger 확인일과 프런트 계약 문서를 함께 갱신한다.

## 릴리스 판정

다음 조건을 모두 만족해야 “운영 배포 완료”로 표시한다.

1. 실제 인증 host 연결이 완료됐다.
2. Preview 환경에서 두 실제 계정의 두 게임 전체 흐름이 통과했다.
3. Production 환경변수와 WSS/TURN이 검증됐다.
4. 결과 저장과 동일 방 재대결이 실제 백엔드에서 확인됐다.
5. rollback 대상 deployment와 담당자가 정해졌다.
