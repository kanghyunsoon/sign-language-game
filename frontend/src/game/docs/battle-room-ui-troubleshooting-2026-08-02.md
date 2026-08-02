# 프링글수 로비·결과 UI 트러블슈팅 — 2026-08-02

## 1. 방 제목 대신 초대 코드, 닉네임 대신 `방장`이 표시되는 문제

### 증상

- 생성한 방 카드 제목이 `대전방 ABC123`처럼 보인다.
- 방장 닉네임 자리에 사용자 이름이 아니라 `방장`이 표시된다.
- 설정은 항상 `기본`, 생성 정보는 `서버 정보 없음`으로 보인다.

### 원인

배포 Swagger의 create 요청은 `gameType`만 받고 로비 SSE도 제목·닉네임·난이도·출제 범위를 보내지 않는다. 프런트는 생성 폼에서 받은 값을 API에 전달할 수 없었고, 초대 코드와 역할명을 임의 fallback으로 사용하고 있었다.

### 해결

- 생성 직후 폼의 제목·현재 사용자 닉네임·난이도·출제 범위를 `SwaggerBattleRoomGateway`의 방 ID별 메모리에 저장한다.
- SSE의 선택 메타데이터 필드가 존재하면 메모리보다 우선 사용한다.
- 카드의 `기본` 표시는 제거하고 실제 심볼 배열을 `자음`, `모음`, `기초 혼합`으로 분류한다.
- 생성 시간이 없으면 생성 행을 렌더링하지 않는다.
- 서버 정보가 전혀 없는 다른 사용자 화면에서는 중립 문구를 쓰되 초대 코드나 `방장`을 사용자 정보처럼 표시하지 않는다.

### 남은 경계

gateway 메모리는 서버 저장소가 아니다. 새로고침·다른 브라우저·다른 사용자에게 같은 값을 보여주려면 백엔드 create/response/SSE 계약 확장이 필요하다. 프런트 localStorage로 공유 데이터처럼 꾸미면 사용자별 값이 달라지므로 사용하지 않는다.

## 2. 결과 화면 제목이 왼쪽으로 밀려 보이는 문제

### 원인

결과 헤더를 `본문 + 점수 카드` 2열 grid로 만들면 본문은 헤더 전체가 아니라 첫 번째 열 안에서만 중앙 정렬된다. 점수 카드 너비만큼 승리 문구가 왼쪽으로 밀린다.

### 해결

- 헤더 본문은 전체 너비 중앙 정렬을 유지한다.
- 최종 점수 카드는 데스크톱에서 우측 absolute 배치한다.
- 모바일 media query에서는 점수 카드를 static으로 되돌려 제목과 겹치지 않게 한다.

## 3. 대전 종료 직후 가득 찬 방이 게임방 목록에 노출되는 문제

### 원인

결과 API가 재대결을 위해 방 상태를 `WAITING`으로 되돌린다. 로비가 상태만 보고 `WAITING` 방을 표시하면 아직 두 참가자가 결과 화면에 있는 `2/2` 방도 입장 가능한 방처럼 노출된다.

### 해결

로비 출력은 다음 조건을 모두 만족한 방만 허용한다.

```ts
room.gameType === expected
  && room.status === "WAITING"
  && room.participantCount < room.capacity
```

`toSummary().canJoin`만 false로 만드는 것으로는 부족하다. 카드 자체가 노출되지 않도록 `currentRooms()`에서 필터링해야 한다.

## 4. 결과의 `게임방 목록`이 게임 선택 화면으로 이동하는 문제

### 원인

결과 모달에 `onRoomList`와 `onModeSelect`가 함께 있었고, 버튼 라벨과 callback 연결이 뒤섞였다.

### 해결

- `다시 하기`와 `같은 방으로`는 `returnToWaiting()`을 사용한다.
- `게임방 목록`만 `leaveBattle("/game/battle")`을 사용한다.
- 더 이상 필요 없는 `/game` 이동 callback은 결과 모달 계약에서 제거한다.

## 5. 뒤로가기 뒤 `재입장`, 다시 방 만들기 때 `이미 참여 중인 방`이 뜨는 문제

### 실제 경쟁 순서

1. 대기실 mount의 멱등 join이 진행된다.
2. 사용자가 뒤로가기를 눌러 leave를 시작한다.
3. 늦게 완료된 join이 로컬 세션을 다시 기록하거나, leave 완료 전에 create가 전송된다.

### 해결

- gateway의 create/join/leave를 단일 Promise queue로 직렬화한다.
- 대기실 leave는 `leavePromiseRef`로 한 번만 실행한다.
- leave 시작 플래그가 켜진 뒤 도착한 join 응답은 무시한다.
- 화면 이동 전에 로컬 재입장 세션을 먼저 비우고 원격 leave 완료 뒤 다시 비운다. 원격 오류가 나도 사용자가 나가기로 결정한 방의 재입장 세션은 복원하지 않는다.
- 퇴장 중에는 `rememberRoom`을 차단해 늦게 도착한 join·주기 확인·SSE 응답이 세션을 다시 기록하지 못하게 한다.
- popstate와 버튼 퇴장이 동일 cleanup 함수를 사용하도록 한다.

### 서버 판정

- 방장 혼자 있던 방: 방 삭제
- 2명인 방에서 방장 이탈: 남은 참가자에게 방장 위임

프런트가 host를 임의 선정하지 않고 서버 응답과 SSE를 권위 상태로 사용해야 한다.

## 6. 1:1 화면을 솔로 스타일로 바꾼 뒤 기존 대전 동작이 사라지는 문제

스타일 변경은 다음 런타임 요소를 제거하거나 합치지 않는다.

- 두 개의 독립 게임판과 한 개의 공유 배경
- 공유 목표·목표 소진·낙하·제거·공격 애니메이션
- 낮·밤 전환과 야간 중앙 경계 처리
- 로컬·상대 카메라와 연결 상태
- 화면 결승선과 동일 좌표의 승리 판정

격자 제거, 패널 크기, 로고·뒤로가기 위치, 글자 크기·색은 CSS/renderer 표현 책임이다. 보드 controller, P2P message, 물리 좌표 계약과 섞지 않는다.

## 7. Windows 로컬 검증이 실행되지 않는 문제

### PowerShell 실행 정책

`npx.ps1` 실행이 막히면 `npx.cmd`를 사용한다.

```powershell
npx.cmd tsc -p tsconfig.app.json --noEmit --incremental false --pretty false
```

### Vite 임시 폴더 `EPERM`

`node_modules/.vite-temp` 접근 오류가 나면 중복 dev/test 프로세스를 확인하고, 같은 repository와 Node 설치를 사용하는 터미널에서 다시 실행한다. 임시 폴더를 강제로 삭제하기 전에 점유 프로세스를 확인한다.

### `127.0.0.1:5174` 연결 거부

```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5174
```

기존 5174 프로세스가 있으면 새 프로세스를 더 띄우지 말고 해당 Vite 프로세스의 로그와 포트 점유를 먼저 확인한다.

## 회귀 검증

```powershell
cd frontend
npx.cmd vitest run src/game/block-stacking/battle/components/BattleResultModal.test.tsx
npx.cmd vitest run src/game/block-stacking/battle/components/BattleRoomCard.test.ts src/game/block-stacking/battle/room/SwaggerBattleRoomGateway.test.ts src/game/realtime/LobbySseClient.test.ts
npx.cmd tsc -p tsconfig.app.json --noEmit --incremental false --pretty false
```

실제 두 계정 검증은 방 생성 → 참가 → 게임 종료 → 결과 화면 유지 → 로비 비노출 → 한 명 퇴장 → 로비 노출 또는 방 삭제 → 새 방 생성 순서로 수행한다.
