# 백엔드 계약

배포 Swagger와 프런트 코드의 경계를 정의한다. 과거 개발용 STOMP/라인레이스 계약은 운영 근거로 사용하지 않는다.

기준 확인일은 2026-07-23이고 2026-07-30·08-02 보정을 반영했다. 백엔드 소스는 이 범위에서 변경하지 않았다.

## 1. 전송 경계 요약

```text
방 생성/참가/준비/시작/결과   → REST
로비 목록                     → SSE (1회용 ticket query)
SDP/ICE 교환                  → Room native WebSocket (1회용 ticket query)
─────────── 여기까지만 서버 ───────────
게임 명령/권위 이벤트/스냅샷   → WebRTC DataChannel `GAME_P2P_V1`
```

프런트 런타임과 의존성에 STOMP를 사용하지 않는다.

## 2. REST

| 기능 | 계약 |
| --- | --- |
| 방 생성 | `POST /game-rooms?userId={id}`, body `{gameType}` |
| 참가 | `POST /game-rooms/join?userId={id}`, body `{roomCode}` |
| 준비 | `POST /game-rooms/{roomId}/ready?userId={id}`, body `{isReady}` |
| 시작 | `POST /game-rooms/{roomId}/start?userId={id}` |
| 퇴장 | `POST /game-rooms/{roomId}/leave?userId={id}` |
| 결과 | `POST /game-rooms/{roomId}/results?userId={id}`, body `{winnerUserId}` |
| ICE/TURN | `GET /webrtc/ice-servers` |

`gameType`은 `TETRIS_DUEL` 또는 `SIGN_DUEL`이며 생성 body의 필수 필드다. 방 응답에는 `gameType`과 `realtimeTicket`이 포함된다.

결과는 점수를 직접 보내지 않는다. 백엔드가 승자 ID를 역할에 매핑해 승자 1, 패자 0으로 기록한다.

## 3. SSE

- 티켓 발급: `POST /auth/sse-ticket` + Bearer 인증
- 구독: `GET /game-rooms/subscribe?ticket=...`
- 최초 `snapshot`, 이후 `update`
- 1회용·만료 티켓은 재사용하지 않는다

브라우저 `EventSource`는 임의 인증 헤더를 붙일 수 없다. **구독 URL에 Bearer 헤더를 억지로 붙이지 않는다.** Bearer는 티켓 발급 요청에만 쓴다.

## 4. Room WebSocket

- URL: `/ws/game-rooms/{roomId}?ticket=...`
- 프로토콜: native WebSocket
- **클라이언트 발신은 `SIGNAL` 하나뿐이다**
- 서버 이벤트: `PEER_DISCONNECTED`, `PEER_RECONNECTED`, `PEER_LEFT`, `PEER_READY_CHANGED`, `GAME_STARTED`, `SIGNAL`, `ERROR`
- STOMP CONNECT/SUBSCRIBE/SEND와 destination은 사용하지 않는다

재연결 정책은 절대 예산 8초(`DEFAULT_RECONNECT_BUDGET_MS`), 재시도 간격 `[0, 300, 600, 1000, 1500, 2000, 2500]ms`, 시도마다 새 ticket 발급이다. 백엔드의 10초 disconnect grace보다 먼저 끝나야 `PEER_RECONNECTED`로 등록된다. 401/403은 신원이 거부된 것이므로 즉시 중단해 ticket을 낭비하지 않는다.

## 5. P2P 게임

- media와 게임 DataChannel은 동일한 `RTCPeerConnection`을 사용한다.
- 게임 envelope는 `{ protocol: "GAME_P2P_V1", roomId, kind, payload }`다. `roomId` 불일치나 프로토콜 불일치는 폐기한다.
- 방장이 게임 명령의 권위자이며 command ID, 참가자 ID, match/turn을 검증한다.
- 커맨드 발신자는 애플리케이션 필드가 아니라 **WebRTC peer로 식별한다.** 게스트가 `userId`를 위조해도 소용이 없다.
- Room WebSocket으로 게임 상태를 보내지 않는다.
- 재연결 시 새 ticket으로 signaling을 다시 열고 ICE restart 후 snapshot을 요청한다.
- WebSocket 폴백을 두지 않는다. 두 경로를 유지하면 어느 경로로 도착한 이벤트인지에 따라 권위 판단이 갈리고 그 조합을 테스트할 수 없다.

## 6. 결과와 재대결

- 양쪽 클라이언트가 동일한 host-authoritative 최종 snapshot에서 계산한 같은 `winnerUserId`를 제출한다.
- body는 `{winnerUserId: number}`다.
- `201`이면 승패 저장과 방 `WAITING` 복귀가 완료됐다.
- `409`는 이미 처리된 결과 또는 진행 중이 아닌 매치이므로 멱등 종료로 처리한다.
- 이 방식이 참가자가 결과 화면을 먼저 떠나는 경쟁 조건과 방장의 결과 직후 연결 종료에도 결과 저장을 보강한다.
- 재대결 화면은 ready를 양쪽 false로 초기화한다.

### 계약 변경 이력

2026-07-23 배포 Swagger가 `{hostScore, guestScore}` → `{winnerUserId}`로 바뀌었고 결과 처리 뒤 방을 `CLOSED`가 아니라 `WAITING`으로 복귀시키도록 변경됐다. 기존 프런트를 그대로 배포하면 결과 요청이 400으로 실패하거나 응답 파싱이 실패하고, 재대결 버튼이 로컬 방 캐시를 삭제해 대기실 상세 정보를 잃는다.

조치로 `BattleResultClient`가 숫자 승자 ID를 전송하고, `SwaggerBattleRoomGateway.returnToWaiting`은 캐시를 삭제하지 않고 `WAITING`과 양쪽 ready false를 반영한다.

## 7. 2026-07-30 결과·재접속 보정

- join은 기존 참가자에게 멱등이며 권위 room state와 fresh ticket을 반환한다.
- 결과 제출자는 방장 한 명이다. 참가자는 P2P `RESULT_RECORDED` ACK로 저장 완료를 확인한다.
- 결과 201만 방 `WAITING` 전환의 성공 근거로 사용한다.
- 409 전체를 성공으로 흡수하지 않는다. stale이나 무효 상태이면 저장 세션과 media를 정리한다.
- create/join 뒤 Room WebSocket 확인 제한은 15초, 비정상 종료 재접속 유예는 10초다.
- WebRTC 연결 뒤 signaling socket handoff 전 `WEBRTC_CONNECTED`를 보낸다.
- 대기방 권위 이벤트는 `PEER_JOINED`, `PEER_READY_CHANGED`, `PEER_LEFT`, `GAME_STARTED`, `ERROR`다.
- 새로고침 복구는 `join(roomCode)` 응답이 `PLAYING`인 경우에만 수행한다.

## 8. 솔로 결과 API

2026-07-29 기준 운영 Swagger에 맞춘 계약이다.

### 세션

백엔드에는 인가된 솔로 세션 시작 API가 없다. `HttpSoloGameApi.startSession()`은 브라우저 안에서만 세션 ID와 시작 시각을 만든다. **게임 시작을 원격 세션 API 성공에 의존시키지 않는다.**

운영에서 `POST /api/game/solo/sessions`가 401을 반환한 사례가 있었다. 백엔드가 레거시 solo-session start/complete 계약을 제공하지 않기 때문이며, Vercel·CORS·WebSocket 문제가 아니다. 인증된 방·결과 계약이 이를 포함한다고 추론하면 안 된다. 자세한 경위는 `game-troubleshooting.md`의 「결과 저장 계약」 절에 있다.

### 결과 저장

```http
POST /api/solo-results?userId={userId}
Authorization: Bearer {accessToken}
Content-Type: application/json

{"score": 87}
```

- `score`는 게임 포인트가 아니라 결승선 도달까지 걸린 **정수 초**다.
- 프런트는 `ceil(playTimeMs / 1000)`으로 계산한다.
- 카메라 프레임, 이미지, 랜드마크, 글자별 인식 통계는 전송하지 않는다.

원격 저장이 불가능한 환경에서는 `LocalSoloGameApi`가 완료 점수를 사용자 ID 범위의 브라우저 local storage(`sudal-play.solo-results.{userId}.v1`)에 저장한다. `VITE_ENABLE_REMOTE_SOLO_GAME_API`는 백엔드가 계약과 인가 정책을 공식 제공한 뒤에만 켠다.

### 랭킹 조회

```http
GET /api/rankings?userId={userId}&gameType=TETRIS_SOLO
Authorization: Bearer {accessToken}
```

프런트는 응답의 `me.rank`를 결과 화면에 표시하며 전체 순위를 다시 계산하지 않는다. `TETRIS_SOLO`는 기록이 짧을수록 높은 순위여야 하므로 **백엔드 정책이 `score ASC` 또는 MIN 기준이어야 한다.** 운영 랭킹이 높은 점수 우선이면 백엔드에서 수정해야 한다.

### 오답 가중치

게임 시작 시 한 번 호출한다.

```http
GET /api/wrong-answers/tetris-weights
GET /api/signs?category=CONSONANT
GET /api/signs?category=VOWEL
Authorization: Bearer {accessToken}
```

`signId`는 signs 응답의 `id`와 `label`로 연결한다. 게임에서는 다양성을 위해 서버 가중치를 완화한다.

```text
effectiveWeight = min(1.2, 1 + (serverWeight - 1) * 0.2)
```

예: `1.4 → 1.08`, `2.0 → 1.20`. 요청이나 계약이 실패하면 모든 글자에 기본값 `1.0`을 쓴다.

## 9. 백엔드 코드 재사용 참고

물리, 렌더, 점수, 인식 도메인은 Java 서버를 호출하지 않는다. 게임 영속화는 `GameResultRepository` 뒤에, 인식은 `SignRecognizer` 뒤에 있다.

`game-dev-backend/dev-app`은 `controller` / `application` / `domain` / `repository` / `dto`로 구성한 계약 참고 구현이다. 팀 백엔드는 DTO와 서비스 계약을 복사하고 `InMemoryGameResultRepository`를 JPA 구현으로 교체할 수 있다.

호환성 주의:

- 샘플은 Spring Boot 2.7과 `javax.validation`을 쓴다. Spring Boot 3에서는 `jakarta.validation`으로 바꿔야 한다.
- 샘플의 `X-User-Id` fallback은 개발 전용이다. 인증 principal로 교체한다. **운영 컨트롤러는 사용자 식별자를 요청 body나 헤더가 아니라 인증 principal에서 얻어야 한다.**
- in-memory 저장소는 재시작 시 데이터를 잃으므로 공유 배포에 적합하지 않다.
- CORS는 정확한 프런트 Origin으로 설정한다. 쿠키 인증은 양쪽 credentials가 필요하며 wildcard origin과 함께 쓸 수 없다.
- UTF-8 JSON을 반환해 한글 심볼이 변환 없이 보존되게 한다.
- `playedAt`은 ISO-8601 instant, `averageConfidence`는 0~1 JSON number로 유지한다.
- 중복 결과 제출을 막아야 하면 트랜잭션이나 멱등 정책을 쓴다.

### 인증 주입

쿠키 인증은 `VITE_GAME_API_CREDENTIALS=include`를 쓴다. bearer 인증은 헤더 provider를 주입해 매 요청마다 현재 토큰을 읽게 한다.

```ts
const repository = createGameResultRepository({
  config: runtimeIntegrationConfig,
  storage: window.localStorage,
  getGameApiHeaders: () => ({
    Authorization: `Bearer ${authStore.getAccessToken()}`,
  }),
});
```

페이지에 전달하는 factory는 안정적으로 유지한다. `signRecognizerFactory`가 바뀌면 React가 의존성 변경으로 보아 WebSocket을 재연결한다.

응답 DTO나 endpoint 경로가 다르면 `GameRuntime`을 고치지 말고 `GameResultRepository`를 구현한다.

### 실패 동작

`ResilientGameResultRepository`는 HTTP 영속화가 실패해도 플레이를 유지하고 결과를 local storage에 저장한다. 다만 **로컬 fallback 레코드를 나중에 서버로 동기화하지 않는다.** 기기 간 오프라인 기록에 의존하려면 명시적 동기화 정책을 먼저 추가해야 한다.

## 10. 배포 합격 기준

- 두 게임의 생성 요청에 올바른 `gameType`이 포함된다.
- SSE 목록이 게임 종류별로 분리된다.
- 두 계정이 ready/start 후 실제 DataChannel을 연다.
- 실제 손 인식 입력이 P2P 명령으로 전달된다.
- 양쪽 종료 결과가 일치한다.
- 결과 요청이 실제 승자 ID를 보내고 백엔드 랭킹에 1/0으로 반영된다.
- 결과 뒤 동일 방 재대결이 가능하다.
- 서로 다른 NAT에서 TURN relay가 동작한다.
- 백엔드 소스 변경은 없다.

자동 테스트와 build 범위는 완료됐다. TURN/WSS/실제 계정 DB 반영은 배포 smoke test에서 확인한다. 배포 절차와 환경변수는 `frontend/docs/deployment-guide.md`에 있다.

## 11. 백엔드에 남긴 요청

프런트가 임의로 결정하면 안 되는 항목이다.

| 항목 | 필요한 것 |
| --- | --- |
| 방 표시 메타데이터 | create/response/SSE에 `title`, `hostNickname`, `difficulty`, `symbolRange`, `createdAt` 영속화 |
| 자동 몰수패 | 인증된 `PEER_DISCONNECTED` / `PEER_RECONNECTED`를 권위 근거로 제공 |
| 솔로 랭킹 정책 | `TETRIS_SOLO`를 `score ASC` 또는 MIN 기준으로 확정 |
| 솔로 점수 영속화 | start/complete endpoint의 DTO와 인가 정책 공개 |

이들이 확정되기 전까지 프런트는 브라우저 저장으로 보완하되, 그 값을 다른 사용자에게 공유된 권위 데이터처럼 취급하지 않는다.
