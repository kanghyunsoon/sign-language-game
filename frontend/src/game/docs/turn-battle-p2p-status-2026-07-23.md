# Turn battle P2P status — 2026-07-23

## 완료 범위

- 백엔드 소스는 변경하지 않았다.
- 라인 레이스 사용자 경로는 제거했고 `/game/turn-battle`은 턴 배틀 방 목록·대기실·온라인 경기로 연결된다.
- 프런트 런타임과 package 의존성에서 STOMP를 제거했다.
- `TETRIS_DUEL`과 `SIGN_DUEL` 모두 동일한 REST/SSE/ticket/native WebSocket signaling 경계를 사용한다.
- 게임 데이터는 WebRTC DataChannel `GAME_P2P_V1`로 전송하며 Room WebSocket에는 게임 상태를 보내지 않는다.
- 온라인 턴 배틀은 host authority가 명령 중복, match/turn identity, 동시 선택 잠금, resolve, recovery snapshot을 관리한다.
- 두 1:1 모드 모두 정상 종료 시 양쪽이 동일한 host-authoritative snapshot에서 실제 승자의 `winnerUserId`를 보고한다. 먼저 처리된 요청 이후의 `409`는 멱등 성공이며, 백엔드가 호스트 승은 `1:0`, 참가자 승은 `0:1`로 저장한다.
- 턴 배틀은 상대 영상 타일을 제외하고, 봇전과 동일한 내 카메라·손 인식·큰 기술 카드·피해/집중/방어 설명·수달 전투 캔버스를 사용한다.

## SSE 인증 계약

`POST /auth/sse-ticket` 요청에는 Bearer 인증 헤더가 필요하다. 브라우저 EventSource 구독에는 custom header를 사용할 수 없으므로 `/game-rooms/subscribe?ticket=...` 형식의 일회용 ticket을 사용한다. 이를 "SSE 구독 요청에 Bearer 헤더가 필요하다"로 해석하면 브라우저 구현과 맞지 않는다.

## 실제 브라우저 검증 결과

- 블럭쌓기 1:1: 생성 → 참가 → 준비 → 시작 → P2P 게임/영상 연결 → `DANGER_LINE` 종료와 양쪽 승패 일치.
- 턴 배틀 1:1: 생성 → 참가 → 준비 → 시작 → DataChannel `CONNECTED` → 내 카메라와 공격/집중/방어 카드 확인 → E2E 전용 trigger로 11턴 명령 교환 → 최종 HP `89:0`/`0:89` 대칭 → 승리/패배 결과 일치.
- 결과 처리 뒤 동일 방이 `WAITING`으로 복귀하고 양쪽 ready가 초기화되는 재대결 경로를 사용한다.
- 최종 재검증 방 `100004`에서 방장/참가자 화면 모두 `다시 대기방`으로 동일 방에 복귀했고, 양쪽 준비 상태가 `준비 중`으로 초기화됐다.
- E2E 모드의 카메라는 합성 track이지만 RTCPeerConnection과 DataChannel은 실제 브라우저 구현이다.
- AI 서버 없이 화면에서 카드를 선택하는 경로는 `VITE_P2P_E2E=true` 또는 `devReady=1`인 개발 환경에서만 활성화된다. 운영 빌드에서는 클릭으로 카드를 선택할 수 없고 손 인식 확정만 입력으로 사용한다.
- 최종 전체 회귀는 130개 테스트 파일, 477개 테스트와 TypeScript/Vite production build가 통과했다.

## 배포 체크리스트

- 운영 TLS/WSS URL과 reverse proxy의 WebSocket upgrade 확인
- 실제 TURN credentials와 서로 다른 NAT 환경에서 relay candidate 확인
- 인증된 서로 다른 두 계정으로 room/SSE one-use ticket 재발급 확인
- 실제 카메라·MediaPipe·AI WebSocket 입력으로 두 모드 재검증
- 재접속 시 새 ticket, 새 signaling connection, DataChannel snapshot 복구 확인
- 최신 결과 계약 `{winnerUserId}`와 결과 뒤 방 `WAITING` 복귀·ready 초기화 확인
- P2P 단절의 자동 몰수패는 양쪽 네트워크 분할을 프런트만으로 판정하지 않고 서버 peer presence 정책이 확정된 뒤 활성화
- 온라인 턴 배틀의 위치는 시점 기준(본인 왼쪽·상대 오른쪽), 외형과 체력바는 역할 기준으로 고정한다. 방장은 스카프 수달·파랑 HP, 도전자는 머리띠 수달·주황 HP이며 도전자 화면에서는 왼쪽 머리띠/주황, 오른쪽 스카프/파랑으로 뒤집힌다. 캐릭터 아래에는 표시명과 축약 사용자 ID를 표시한다.

---

## 2026-07-30: shared-target block duel presentation

### Scope

- Frontend-only change. The backend room REST, SSE, native WebSocket signaling, and result contracts are unchanged.
- The P2P block duel now presents two solo-style boards side by side, with the local and remote video panels stacked in the right rail.
- A single paper-holding otter sits at the center of the split boards. It is a static target display in this mode; no otter transfer animation runs in the 1:1 game.

### Shared target flow

1. The host publishes `SHARED_TARGET` once the match has started.
2. Both peers render the same target symbol on the center paper.
3. A player who recognizes the symbol sends `CLAIM_SHARED_TARGET`.
4. The host accepts only the first valid claim, broadcasts `SHARED_TARGET_CLAIMED`, and sends a centered `SPAWN_LETTER` only to the winner's board.
5. The host schedules the next shared target after the claim is resolved.

This keeps target selection authoritative while preventing optimistic double-spawns when both players recognize the same symbol at nearly the same time.

### Validation

- Targeted battle controller, transport, and message-parser tests: 21 passed.
- Production build: passed.
- Local browser layout check: two boards and vertically split local/remote camera rail render at `/game/battle/:roomId/play`.

### Remaining live verification

- Validate the full two-browser WebRTC session against production signaling: ready state, shared target delivery, first-claim ownership, winner-only spawn, next-target synchronization, and result submission.
- The center target becomes visible only after the DataChannel reaches the match start state; the static route alone intentionally does not manufacture a target.
