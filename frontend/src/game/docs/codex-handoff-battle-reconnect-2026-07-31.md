# 1:1 지문자 대전 재연결 인수인계 — 2026-07-31

## 목적과 범위

이 문서만 읽고 다른 컴퓨터에서 1:1 지문자 대전의 새로고침·뒤로가기·나가기·상대 재접속 문제를 이어서 조사할 수 있도록 현재 코드, 확인된 원인, 미검증 항목을 정리한다.

- 작업 범위: `frontend/src/game/block-stacking/battle/**`, 게임 provider/media 연동
- 변경 금지: backend 및 AI 서버 소스
- 배포 API: `https://i15a405.p.ssafy.io/api/swagger-ui/index.html`
- 배포 프론트: `https://sudal-play.vercel.app`
- 원격 반영 브랜치: `frontend`
- 최근 원격 커밋: `c8c9090 fix: 대결 새로고침 복구 안정화`

## 현재 사용자 요구사항

1. 한 사람이 새로고침하거나 일시적으로 끊겨도 다른 사람의 게임판은 초기화되지 않고 계속 진행되어야 한다.
2. 돌아온 사람은 새 카운트다운이나 새 보드를 만들지 않고, 진행 중인 매치와 기존 블록·점수·목표를 따라와야 한다.
3. 나가기/뒤로가기는 미디어·카메라·P2P를 정리해야 하며, 이미 서버에서 제거된 상황 때문에 사용자 화면이 403에 막히면 안 된다.
4. 두 보드는 별개이고 배경만 공유한다. 게임 보드 안에는 흰 캔버스가 보여서는 안 된다.

## 아키텍처 핵심

```text
방 REST/SSE ── 방 상태, participant, realtime ticket
     │
Room WebSocket ── WebRTC SDP/ICE signaling
     │
WebRTC DataChannel ── P2pBattleTransport
     │                 ├─ 방장: shared target/claim/spawn 권위
     │                 └─ 참가자: claim·보드 transform 전송
BattleController ── 게임 상태/physics/AI 인식 연결
```

- `SwaggerBattleRoomGateway.joinRoom(roomCode)`는 기존 참가자에 대해 멱등 join으로 사용하며, fresh realtime ticket와 권위 있는 방 상태를 받는 재진입 경로다.
- `P2pBattleTransport`의 권위자는 `hostUserId`와 같은 방장 브라우저다. 서버가 매치 상태를 보관하지 않는다.
- 각 브라우저의 physics board는 로컬 렌더링이며, shared target·claim·spawn·snapshot만 DataChannel로 교환한다.

## 관련 파일과 책임

| 파일 | 책임 |
| --- | --- |
| `frontend/src/game/app/GameServiceProvider.tsx` | 유저별 대결 방 세션 저장·복원, media/camera 서비스 생성 |
| `frontend/src/game/block-stacking/pages/BattleWaitingRoomPage.tsx` | ready/start, 시작 전 PLAYING 세션 저장, 방 입장/퇴장 |
| `frontend/src/game/block-stacking/battle/pages/BattleGamePage.tsx` | play page media 재연결, controller lifecycle, leave/forfeit UI |
| `frontend/src/game/block-stacking/battle/core/BattleController.ts` | countdown/playing/reconnect/recognition/보드 상태 |
| `frontend/src/game/block-stacking/battle/transport/P2pBattleTransport.ts` | host 권위, shared target, 상태 snapshot, host localStorage 복원 |
| `frontend/src/game/block-stacking/battle/core/BattleExitCoordinator.ts` | leave 이후 media/camera/session 정리 |
| `frontend/src/game/block-stacking/battle/render/PixiGameRenderer.ts` | WebGL canvas와 게임판 렌더링 |

## 최근 수정 내용

### `a815e23` — 흰 게임판

- Pixi WebGL canvas가 공유 배경 위를 불투명 흰색으로 덮는 경우를 차단했다.
- 보드 내부 scenery는 끄고 (`showScenery: false`) 부모의 공유 sky/hills 배경을 사용한다.

### `53ef953` — 매치 재접속 동기화

- `MATCH_STARTED { resume: true }`와 player state/board snapshot으로 돌아온 peer가 카운트다운을 다시 만들지 않도록 했다.
- `PLAYER_DISCONNECTED` 또는 transport 단절 중에도 `PLAYING` 상태의 남은 peer는 재연결을 시도하도록 했다.

### `c8c9090` — 현재 최신

- 대결 세션을 sessionStorage와 localStorage에 저장하고, provider의 인증 userId hydrate 이후에도 다시 읽는다.
- 과거 숫자형 userId 저장값도 같은 사용자로 판정한다.
- 한 번 RTC가 연결된 게임은 상대 refresh로 RTC가 잠시 끊겨도 `mediaReady`를 false로 바꾸지 않는다. controller effect가 dispose되지 않아 남은 보드의 physics loop가 유지된다.
- play route에 유효 방 세션이 없으면 leave API를 호출하지 않고 로컬 리소스만 정리한다.
- 이미 제거된 참가자의 leave 403/404/409는 cleanup/navigation을 막지 않는다.

## 확인된 문제와 판단 기준

| 상황 | 기대 결과 | 현재 상태 |
| --- | --- | --- |
| 참가자만 새로고침 | 방장은 블록/목표/낙하 유지, 참가자는 join 후 snapshot 복구 | 코드 보강 완료, 실제 두 PC smoke test 필요 |
| 방장만 새로고침 | 참가자는 보드 유지, 방장은 동일 match resume | 코드 보강 완료, 실제 두 PC smoke test 필요 |
| 새로고침 뒤 나가기 | stale session이면 leave 403 없이 로컬 정리·로비 이동 | 코드/단위 테스트 완료, 배포 smoke test 필요 |
| 방장 영구 이탈 | 10초 재접속 유예 후 방 종료, 남은 참가자 승리 | `RECONNECT_TIMEOUT` 승리 처리 |
| 보드 배경 | 두 보드에는 투명 영역, 부모 레이어의 sky/hills만 보임 | `a815e23` 이후 재확인 필요 |

## 영구 이탈 정책

방장이 영구 이탈했을 때 권위를 guest로 이전하지 않는다. shared target 권위가 방장 브라우저에 있으므로, 남은 참가자가 새 target을 임의로 만들면 split-brain이 생길 수 있다.

- peer 단절 직후에도 남은 보드는 유지하고 재접속을 10초 기다린다.
- 유예 안에 `MATCH_STARTED { resume: true }`, `PLAYER_RECONNECTED`, 또는 상대 board snapshot이 오면 timeout을 해제하고 같은 매치를 계속한다.
- 유예가 끝나면 남은 참가자를 승자로, 단절된 참가자를 패자로 한 `MATCH_FINISHED`를 로컬에 확정하고 보드를 중지한다.
- 명시적인 방장 나가기는 기존 forfeit/leave 경로로 방을 닫는다. 백엔드의 방 종료 상태가 최종 방 정리를 담당한다.

## 배포 검증 절차

배포가 `c8c9090`을 포함한 뒤 두 컴퓨터/두 브라우저에서 새 방으로 검증한다. 기존에 깨진 방은 서버 참가 상태와 local 저장값이 이미 어긋났을 수 있으므로 사용하지 않는다.

1. A가 방 생성, B가 코드로 입장, 둘 다 ready, A가 시작한다.
2. 두 화면에서 GAME/VIDEO/AI/CAMERA가 CONNECTED이고 같은 target이 보이는지 확인한다.
3. 블록을 최소 하나 떨어뜨린 뒤 B만 새로고침한다.
4. A 화면에서 기존 블록과 target이 사라지지 않고 계속 낙하하는지 확인한다. A는 카운트다운으로 돌아가면 안 된다.
5. B가 복구되면 동일 매치의 기존 블록/점수/target을 따라오는지 확인한다. 새 target이나 새 countdown이 보이면 실패다.
6. 이번에는 A만 새로고침해 3~5를 반복한다.
7. 새로고침 후 play 화면에서 나가기를 누르고 Network/Console에 `leave ... 403`이 새로 발생하지 않는지 확인한다.
8. 브라우저 뒤로가기도 같은 cleanup 결과인지 확인한다.
9. 한쪽을 10초 넘게 복귀시키지 않아 남은 쪽에 승리 결과와 `재접속 시간 초과` 사유가 표시되는지 확인한다.
10. 80%, 100%, 125%, 150% 줌에서 배경이 두 보드에 공유되고 흰 사각형/가로 overflow가 없는지 확인한다.

### 실패 시 반드시 남길 증거

- roomId, roomCode, host/guest userId, 어느 쪽을 refresh했는지
- refresh 직전과 직후의 GAME/VIDEO/AI/CAMERA 상태
- Network의 `join`, `leave`, ticket, start 요청 URL/status/response body
- Console 첫 오류와 발생 시각
- 양쪽 화면 스크린샷
- sessionStorage/localStorage는 값 자체를 외부에 공유하지 말고 키 존재 여부만 기록

## 로컬 검증 명령

```powershell
cd C:\Users\khsoo\Desktop\S15P11A405\frontend
npm test -- --run src/game/block-stacking/battle/core/BattleExitCoordinator.test.ts src/game/block-stacking/battle/core/BattleController.test.ts
npm run build
```

최근 실행 결과:

- `BattleExitCoordinator`, `BattleController`: 2 files / 25 tests passed
- `npm run build`: TypeScript + Vite production build passed

## Git 작업 규칙

- 사용자가 별도 지시하기 전까지는 검증된 프론트 변경만 `origin frontend`에 직접 push한다.
- 커밋 제목 형식: `fix: 한글 명사형 제목` 등 `git-workflow.md`의 `<type>: <title>` 규칙을 따른다.
- `git add -A`를 쓰지 말고 관련 파일만 명시적으로 stage한다.
- backend/AI는 읽기·계약 확인만 하고 소스 변경하지 않는다.

## 참고 문서

- `codex-handoff-room-lifecycle-2026-07-30.md` — 최초 계약 조사 및 이전 이력
- `battle-refresh-effect-troubleshooting-2026-07-30.md` — 새로고침/403/409 트러블슈팅
- `room-lifecycle-and-zoom-troubleshooting-2026-07-30.md` — lifecycle/zoom 이력
- `backend-contract-alignment-2026-07-23.md` — Swagger/백엔드 계약 정리
