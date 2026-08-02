# 1:1 대결 새로고침·이탈 트러블슈팅 — 2026-08-02 업데이트

## 증상

- 진행 중 한쪽을 새로고침하면 그쪽은 모든 연결 상태가 DISCONNECTED, 보드는 빈 상태로 보인다.
- 반대쪽도 이미 떨어진 블록·shared target·낙하가 사라지거나 처음 카운트다운으로 되돌아간다.
- 새로고침 직후 나가기에서 `POST /api/game-rooms/{roomId}/leave?userId=...`가 403을 반환한다.
- 게임판이 흰색 WebGL 캔버스로 공유 배경을 덮는다.

## 확인된 원인

1. RTC 일시 단절이 `mediaReady=false`로 전파되면 `BattleGamePage`의 controller effect cleanup이 실행되어 local physics board가 dispose된다.
2. React provider가 인증 userId보다 먼저 mount하면 저장된 방 세션을 초기화 시점에 읽지 못해 play route가 재입장 정보를 잃는다.
3. 서버가 새로고침/소켓 종료 후 참가자를 이미 제거한 경우, 브라우저가 다시 leave API를 호출하면 403이 정상적으로 발생할 수 있다.
4. Pixi renderer의 캔버스가 board 내부 scenery를 렌더링하지 않는 상태에서도 불투명 배경을 유지할 수 있다.
5. 재접속 시 매치 시작/보드 스냅샷을 양쪽에 무조건 적용하면, 새로고침하지 않은 플레이어가
   진행 중인 Matter.js 보드를 복구 스냅샷으로 되감게 된다. 반대로 재접속한 쪽이 자기
   스냅샷을 받기 전에 physics를 재시작하면 빈 보드나 새 카운트다운으로 보인다.

## 적용한 프론트 조치

| 문제 | 조치 | 커밋 |
| --- | --- | --- |
| 흰 배경 | board WebGL canvas가 공유 scenery를 덮지 않도록 처리 | `a815e23` |
| 재접속 시 카운트다운 재시작 | `resume` match state와 board/player snapshot 복원 | `53ef953` |
| 반대쪽 보드 초기화 | 최초 RTC 성공 뒤 `mediaReady`를 latch하여 controller를 유지 | `c8c9090` |
| 새로고침 세션 유실 | userId별 sessionStorage + localStorage 저장, auth hydrate 후 재읽기 | `c8c9090` |
| stale leave 403 | 세션이 없는 play route는 remote leave 생략, 이미 종료된 leave 응답은 local cleanup 지속 | `c8c9090` |

### 2026-08-02 재접속 스냅샷 보강

| 문제 | 조치 |
| --- | --- |
| 살아 있는 플레이어의 보드가 복구 스냅샷으로 덮어써짐 | `restoreForPlayerId`를 사용해 요청한 플레이어만 자신의 snapshot을 적용 |
| 복귀 중 빈 보드가 전송되지 않음 | 빈 보드도 `BOARD_SNAPSHOT`으로 전송하고 양쪽 board payload를 함께 보냄 |
| 낙하 중 블록 위치가 복귀 시 달라짐 | snapshot 뒤 240ms settle window에서 남은 peer의 `PEER_BOARD_VIEW` 최신 위치를 적용 |
| 단순 RTC 재연결 때 새 매치가 시작됨 | transport의 `hasConnected` 상태로 최초 연결과 재연결을 구분 |
| 복귀 후 로컬 낙하가 상대에게 전달되지 않음 | `BattleController`가 `LocalBoardPublisher`를 새 runtime에 재부착 |

## 재현 및 판정

1. 새 방에서 두 명이 ready/start 한다.
2. 최소 하나의 블록이 화면에 있는 동안 B만 새로고침한다.
3. A의 board가 dispose되지 않고 기존 블록과 target이 계속 남아 있으면 1차 성공이다.
4. B가 `join(roomCode)`으로 PLAYING 상태를 확인한 뒤 snapshot/resume으로 같은 보드를 보이면 성공이다.
5. B에서 나가기 후 DevTools Network에 새로운 leave 403이 없고 로비로 이동하면 성공이다.

## 실패 시 코드 점검 순서

1. `GameServiceProvider.tsx`: 유저 ID가 확정될 때 `readBattleRoomSession`이 호출되는지, storage key가 존재하는지 확인한다.
2. `BattleGamePage.tsx`: media reconnect effect가 PLAYING session의 `roomCode`로 join하는지 확인한다.
3. 같은 파일에서 `mediaReady`가 reconnect 중 false가 되어 controller effect cleanup을 유발하지 않는지 확인한다.
4. `P2pBattleTransport.ts`: host/guest가 같은 `hostPlayerId`, `playerIds`, `matchId`로 연결되는지 확인한다.
5. `BattleController.ts`: `MATCH_STARTED.resume`이 새 countdown이 아니라 `PLAYING`과 local board start로 처리되는지 확인한다.
6. `BattleExitCoordinator.ts`: 현재 세션이 없는 경우 API leave가 호출되지 않는지 확인한다.

## 방장 영구 이탈 정책

방장 브라우저가 영구 이탈하면 host authority를 다른 브라우저에 이전하지 않는다. 남은 참가자가 다음 shared target을 독자 생성하면 split-brain이 생길 수 있기 때문이다.

- 상대 단절 직후에는 현재 board를 유지하며 10초 재접속 유예를 시작한다.
- 상대 board snapshot 또는 resume 이벤트가 유예 안에 도착하면 timeout을 취소하고 계속 진행한다.
- 유예가 끝나면 남은 참가자는 `RECONNECT_TIMEOUT` 사유의 승자가 되고 board는 중지된다.
- 명시적 나가기는 기존 forfeit/leave로 즉시 방을 닫고, 남은 참가자는 승리 결과를 받는다.

## 검증 기록

- `npm test -- --run src/game/block-stacking/battle src/game/block-stacking/pages/BattleGamePage.test.tsx src/game/block-stacking/pages/BattleWaitingRoomPage.test.tsx src/game/block-stacking/pages/BattleRoomListPage.test.tsx`: 24 files / 170 passed
- `npm run build`: passed
- 실제 배포 두 PC smoke test: 최신 커밋 배포 후 수행 필요
