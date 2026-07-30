# 1:1 대결 새로고침·이탈 트러블슈팅 — 2026-07-31

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

## 적용한 프론트 조치

| 문제 | 조치 | 커밋 |
| --- | --- | --- |
| 흰 배경 | board WebGL canvas가 공유 scenery를 덮지 않도록 처리 | `a815e23` |
| 재접속 시 카운트다운 재시작 | `resume` match state와 board/player snapshot 복원 | `53ef953` |
| 반대쪽 보드 초기화 | 최초 RTC 성공 뒤 `mediaReady`를 latch하여 controller를 유지 | `c8c9090` |
| 새로고침 세션 유실 | userId별 sessionStorage + localStorage 저장, auth hydrate 후 재읽기 | `c8c9090` |
| stale leave 403 | 세션이 없는 play route는 remote leave 생략, 이미 종료된 leave 응답은 local cleanup 지속 | `c8c9090` |

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

## 프론트만으로 해결할 수 없는 경우

방장 브라우저가 영구 이탈하면 P2P host authority가 사라진다. 남은 참가자가 다음 shared target을 독자 생성하게 하면 split-brain이 생길 수 있다. 이 경우 backend가 authoritative match snapshot 또는 host handoff 이벤트를 제공해야 한다. backend/AI 소스는 이 작업 범위에서 수정하지 않는다.

## 검증 기록

- `npm test -- --run src/game/block-stacking/battle/core/BattleExitCoordinator.test.ts src/game/block-stacking/battle/core/BattleController.test.ts`: 25 passed
- `npm run build`: passed
- 실제 배포 두 PC smoke test: 최신 커밋 배포 후 수행 필요
