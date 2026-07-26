# SignMaster 프런트 배포 후 연동 작업

## 범위와 현재 배포

- Vercel 프로젝트: `SignMaster`
- GitLab 기준 브랜치: `frontend`
- Root Directory: `frontend`
- 이 배포는 React/Vite 정적 프런트만 호스팅한다.
- AI 추론 서버는 학습이 끝날 때까지 연결하지 않는다. 따라서 카메라·게임 화면은 배포할 수 있지만 AI 손 인식은 운영 완료 조건이 아니다.

## Vercel 설정

| 항목 | 값 |
| --- | --- |
| Framework | Vite |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js | 22.x |
| Production Branch | 팀이 확정한 운영 브랜치 |

`vercel.json`은 게임 딥링크를 포함한 SPA 요청을 `index.html`로 돌린다. API와 WebSocket은 Vercel Function이나 rewrite에 의존하지 않고, 운영 백엔드에 직접 연결한다.

## Preview/Production 환경변수

AI가 준비되기 전에는 AI URL을 설정하지 않는다. 다른 값은 Vercel Dashboard의 환경별 변수로 넣는다.

```dotenv
VITE_API_BASE_URL=https://i15a405.p.ssafy.io/api
VITE_GAME_ROOM_API_BASE_URL=https://i15a405.p.ssafy.io/api
VITE_GAME_WEBSOCKET_URL=wss://i15a405.p.ssafy.io/api/ws/game-rooms
```

AI 배포 뒤에만 아래 값을 Preview에서 먼저 검증하고 Production에 승격한다.

```dotenv
VITE_AI_WEBSOCKET_URL=wss://<AI-공개-호스트>/<확정-경로>
```

`VITE_*` 값은 브라우저에 공개된다. JWT, TURN 비밀번호, Vercel token, DB 비밀번호는 넣지 않는다. STOMP 관련 `VITE_MATCH_*`와 개발용 `VITE_DEV_USER_ID`, `VITE_P2P_E2E`, `VITE_LINE_RACE_DEV_TOOLS`도 운영에 넣지 않는다.

## 백엔드·인프라에 요청할 작업

### 백엔드

Vercel 운영 Origin과 고정 staging Origin을 다음 GitLab CI/CD 변수에 등록한다.

```text
PROD_CORS_ALLOWED_ORIGINS=https://<signmaster-production-domain>,https://<fixed-staging-domain>
```

이 허용 목록은 REST, SSE, 게임방 WebSocket에 공통 적용된다. `*`는 사용하지 않는다. SSE와 WebSocket은 연결마다 별도의 1회용 realtime ticket이 필요하다.

### 인프라

1. `feature/Infra-507-nginx-https`의 `/api/ -> 127.0.0.1:8080/` nginx 설정이 실제 서버에 적용됐는지 확인한다.
2. `wss://i15a405.p.ssafy.io/api/ws/game-rooms/{roomId}`의 Upgrade·timeout을 실환경에서 확인한다.
3. coturn의 외부 relay를 검증한다: TCP/UDP 3478, TCP/UDP 5349, UDP 49160-49200.
4. AI 학습 완료 뒤 내부 서비스 포트, 공개 WSS 주소, TLS, Origin 정책을 확정하고 nginx `/ai/` 프록시 또는 별도 AI 도메인을 배포한다.

## 실사용 완료 기준

1. Vercel URL에서 `/`, `/login`, `/game`, 깊은 게임 URL을 직접 열고 새로고침한다.
2. 서로 다른 두 계정으로 로그인한다.
3. REST 방 생성·입장, SSE 로비 갱신, WebSocket signaling을 확인한다.
4. 서로 다른 네트워크에서 WebRTC DataChannel과 TURN relay candidate를 확인한다.
5. 블럭쌓기와 턴 배틀을 각각 결과 전송·재대결까지 완료한다.
6. AI WSS가 배포된 뒤 카메라 권한, 손 인식, AI 연결 실패 UX, 실제 지문자 입력을 별도 회귀 검증한다.

## 운영 기록

배포마다 Vercel URL, Git commit SHA, 테스트 계정 역할, 방 ID, 결과·재대결 여부, TURN relay 사용 여부, 실패 로그와 rollback 여부를 트러블슈팅 문서 및 Jira에 남긴다.
