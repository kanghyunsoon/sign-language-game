# SUDAL-PLAY 배포·통합 가이드

## 1. 목적과 현재 범위

SUDAL-PLAY는 Vercel에 React/Vite 정적 프런트를 배포하고, 운영 중인 백엔드·인프라와 직접 통신한다. Vercel은 API, SSE, WebSocket 또는 TURN 서버를 호스팅하지 않는다.

- 프런트 기준 브랜치: `frontend`
- 백엔드 기준 브랜치: `backend` (소스 변경은 백엔드 담당)
- AI 기준 브랜치: `feature/khs-ai-fingerspelling-server` (학습 완료 전까지 운영 연결 보류)
- 서비스 표시명: **수어의 달인**
- Vercel 운영 도메인: `https://sudal-play.vercel.app`
- Vercel 프로젝트/기본 도메인: 소문자 영문 slug 사용 (`sudal-play`)

## 2. Vercel 프런트 배포 구성

### 현재 배포 구조

루트의 `package.json`과 `vercel.json`은 monorepo 형태에서 `frontend` 하위 Vite 앱을 빌드하기 위한 배포 어댑터다.

| 항목 | 값 |
| --- | --- |
| Node.js | `22.x` |
| 설치·빌드 | `npm --prefix frontend ci && npm --prefix frontend run build` |
| 산출물 | `frontend/dist` |
| SPA fallback | 모든 프런트 경로를 `index.html`로 rewrite |

`game-contracts/recognition/readiness.json`은 프런트 빌드에 필요하므로 Vercel 소스에 반드시 함께 포함한다. `frontend` 폴더만 단독 업로드하면 TypeScript 모듈 해석이 실패한다.

### Vercel 환경변수

`VITE_*` 값은 브라우저 번들에 포함되므로 비밀값을 넣지 않는다.

```dotenv
VITE_API_BASE_URL=https://i15a405.p.ssafy.io/api
VITE_GAME_ROOM_API_BASE_URL=https://i15a405.p.ssafy.io/api
VITE_GAME_WEBSOCKET_URL=wss://i15a405.p.ssafy.io/api/ws/game-rooms
```

2026-07-26 기준 위 세 값은 Vercel 프로젝트 `sudal-play`의 **Production** 환경변수로 등록하고 재배포했다. Preview 배포로 실연동을 검증할 경우에도 같은 값을 Preview 환경에 추가하고 다시 배포한다.

중요: 현재 저장소의 `.env.production` 기본값은 동일 origin Nginx 배포용 `/api`다. Vercel에는 `/api` reverse proxy가 없으므로 위 값을 Vercel 환경변수로 등록하고 재배포한다. 등록하지 않으면 로그인·회원가입 요청이 `https://sudal-play.vercel.app/api/auth/*`로 가서 404가 난다.

AI 운영 주소가 확정되기 전에는 `VITE_AI_WEBSOCKET_URL`을 등록하지 않는다.

## 3. 백엔드 연결 요청 사항

백엔드 배포 담당자는 확정된 Vercel Production URL과 Preview URL을 CORS 허용 목록에 등록한다. Origin 비교는 scheme·host·port가 정확히 일치해야 하므로 끝의 `/`를 포함하지 않는다.

```text
PROD_CORS_ALLOWED_ORIGINS=https://sudal-play.vercel.app,https://<preview-vercel-domain>
```

### 즉시 전달할 인계 내용

```text
프런트 운영 Origin: https://sudal-play.vercel.app
요청: GitLab CI/CD 변수 PROD_CORS_ALLOWED_ORIGINS에 위 Origin을 추가한 뒤 백엔드 운영 배포
주의: URL 끝의 /는 넣지 않음. REST CORS와 게임 WebSocket Origin 정책 모두 동일 값 사용
```

2026-07-26 확인 결과 GitLab 프로젝트 변수 `PROD_CORS_ALLOWED_ORIGINS`는 존재하며 `All (default)` 범위로 적용돼 있다. 값은 Masked 상태이므로 프런트에서는 실제 포함 여부를 열람·검증할 수 없다. 백엔드/인프라 담당자가 변수 값을 확인하거나 수정한 뒤 운영 배포 완료 사실을 공유해야 한다.

확인 범위는 REST뿐 아니라 다음 전체다.

1. 인증 및 일반 REST API
2. SSE 구독 (`/auth/sse-ticket` 발급 후 게임방 구독)
3. 게임방 WebSocket signaling (`/ws/game-rooms/{roomId}?ticket=...`)
4. ICE 서버 정보 조회 및 WebRTC 연결
5. 경기 종료 결과 전송: 호스트 승리 `1:0`, 도전자 승리 `0:1`

realtime ticket은 연결마다 새로 발급하고 재연결 시 재사용하지 않는다. STOMP는 사용하지 않는다.

## 4. 인프라 연결 요청 사항

인프라 담당자는 공개 도메인에서 아래 경로와 프로토콜을 검증한다.

| 대상 | 필수 조건 |
| --- | --- |
| Nginx API proxy | `/api/`가 백엔드로 전달되고 CORS preflight를 막지 않음 |
| SSE | 버퍼링 비활성화, 장시간 timeout, `X-Accel-Buffering: no` 유지 |
| WebSocket | `Upgrade`, `Connection` 헤더와 충분한 read timeout |
| coturn | TCP/UDP 3478, TCP/UDP 5349, UDP 49160-49200 및 public IP 후보 확인 |
| TLS | REST는 HTTPS, signaling은 WSS, mixed content 없음 |

서로 다른 네트워크의 두 브라우저에서 host–challenger 1:1을 열고, direct candidate 실패 시 TURN relay candidate로도 영상·DataChannel이 이어지는지 확인한다.

## 5. AI 서버 연결 순서

AI는 학습 모델 검증 완료 후 별도 WSS 서비스로 배포한다. 프런트는 AI 주소가 없을 때 기존 로컬/오프라인 UX가 깨지지 않아야 한다.

1. AI 브랜치에서 모델, 클래스 목록(자모·숫자), 입력 feature 계약, 모델 버전을 확정한다.
2. AI 공개 WSS 주소와 TLS 인증서를 준비한다.
3. Origin 정책에 Vercel Production/Preview 도메인을 허용한다.
4. Preview에 `VITE_AI_WEBSOCKET_URL=wss://<ai-domain>/<path>`를 먼저 등록한다.
5. 자모↔자모 및 자모↔숫자 혼동쌍, 카메라 권한 거부, 서버 끊김·재연결을 검증한다.
6. 통과한 모델 버전과 endpoint를 Production에 반영한다.

AI 주소를 `/ai/` reverse proxy로 제공할지 별도 서브도메인으로 제공할지는 인프라·AI 담당이 TLS, WebSocket timeout, 확장 방식을 기준으로 결정한다.

## 6. 운영 전 최종 검증

1. Vercel URL에서 `/`, `/login`, `/game/*` 직접 진입과 새로고침을 확인한다.
2. 서로 다른 계정·브라우저에서 방 생성, 입장, SSE 방 목록 갱신, WSS signaling을 확인한다.
3. 블록쌓기와 턴 배틀을 각각 host/challenger 조합으로 처음부터 종료 결과 저장까지 수행한다.
4. 양쪽의 캐릭터·체력바·사용자 ID·영상 표시와 host/challenger 승패 스코어 방향을 확인한다.
5. 서로 다른 네트워크에서 WebRTC 영상, DataChannel, TURN relay fallback을 확인한다.
6. AI 연결 후 손 인식, 자모·숫자 혼동쌍, 실패 UX와 재연결을 확인한다.

배포마다 Vercel URL, Git SHA, API/AI 모델 버전, 테스트 계정 역할, TURN 사용 여부, 결과와 rollback 여부를 Jira 및 트러블슈팅 문서에 남긴다.

## 7. 현재 상태와 다음 작업 순서

1. **백엔드·인프라**: `PROD_CORS_ALLOWED_ORIGINS`에 `https://sudal-play.vercel.app` 포함 여부를 확인·반영하고 백엔드를 재배포한다.
2. **프런트·백엔드 연동 확인**: 운영 URL에서 신규 회원가입과 로그인을 실행한다. 성공 시 인증 쿠키/토큰이 유지되는지와 API 요청이 `i15a405.p.ssafy.io/api`로 향하는지 확인한다.
3. **실시간 기능 확인**: 서로 다른 계정·브라우저·가능하면 서로 다른 네트워크로 SSE, WSS signaling, WebRTC 영상, DataChannel 및 TURN fallback을 점검한다.
4. **게임 완주 확인**: 블록쌓기와 턴 배틀 각각에서 host와 challenger를 바꿔가며 시작부터 `1:0` 또는 `0:1` 결과 저장까지 확인한다.
5. **AI 연동 보류·재개**: AI 모델 학습·배포 endpoint가 확정된 뒤 Preview에서 `VITE_AI_WEBSOCKET_URL`을 추가해 자모↔자모·자모↔숫자 혼동쌍과 재연결을 검증한다.
6. **기록**: 위 각 단계의 날짜, 담당자, 배포 SHA, 테스트 결과·실패 로그를 Jira와 트러블슈팅 문서에 갱신한다.
