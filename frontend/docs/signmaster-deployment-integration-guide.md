# SignMaster 배포·통합 가이드

## 1. 목적과 현재 범위

SignMaster는 Vercel에 React/Vite 정적 프런트를 배포하고, 운영 중인 백엔드·인프라와 직접 통신한다. Vercel은 API, SSE, WebSocket 또는 TURN 서버를 호스팅하지 않는다.

- 프런트 기준 브랜치: `frontend`
- 백엔드 기준 브랜치: `backend` (소스 변경은 백엔드 담당)
- AI 기준 브랜치: `feature/khs-ai-fingerspelling-server` (학습 완료 전까지 운영 연결 보류)
- 서비스 표시명: **SignMaster(싸인마스터)**
- Vercel 프로젝트/기본 도메인: 소문자 영문 slug 사용 (`signmaster` 계열)

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

Production과 Preview에 아래 공개 주소만 등록한다. `VITE_*` 값은 브라우저 번들에 포함되므로 비밀값을 넣지 않는다.

```dotenv
VITE_API_BASE_URL=https://i15a405.p.ssafy.io/api
VITE_GAME_ROOM_API_BASE_URL=https://i15a405.p.ssafy.io/api
VITE_GAME_WEBSOCKET_URL=wss://i15a405.p.ssafy.io/api/ws/game-rooms
```

AI 운영 주소가 확정되기 전에는 `VITE_AI_WEBSOCKET_URL`을 등록하지 않는다.

## 3. 백엔드 연결 요청 사항

백엔드 배포 담당자는 확정된 Vercel Production URL과 Preview URL을 CORS 허용 목록에 등록한다.

```text
PROD_CORS_ALLOWED_ORIGINS=https://<production-vercel-domain>,https://<preview-vercel-domain>
```

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
