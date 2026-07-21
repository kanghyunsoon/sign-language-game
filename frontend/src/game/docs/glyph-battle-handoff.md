# 다른 컴퓨터 Codex 인수인계

> 이 문서는 프런트 게임 모듈의 턴 배틀 인수인계 기록이며 `frontend/src/game/docs`에서 관리한다.

## 2026-07-20 최신 인계 보충 — 이 절을 이전 내용보다 우선 적용

기존 설명 중 레이스 경로, 글자 장애물, 서버 봇 연습을 전제로 한 내용은 현재 턴 배틀과 맞지 않는다. 다음 작업자는 이 절과 `development-troubleshooting.md` 16~19절을 최종 기준으로 사용한다.

### 현재 실제 동작

- 로컬 턴제 봇 연습은 `/game/line-race/practice`이며 백엔드 봇을 만들지 않는다.
- 봇은 독립 타이머로 공격하지 않는다. 내가 지문자를 선택해야 한 턴이 시작된다.
- 양쪽은 비공개 동시 선택하고 모두 잠긴 뒤 동시에 공개·판정한다. 공개 전 상대 선택은 `?`다.
- 지문자 도로, 장애물, traversal 경로는 없으며 캐릭터가 글자 모양을 따라 이동하지 않는다.
- 851px 이상은 경기장·카메라·기술 카드·상태가 한 화면에 들어가고 모바일만 스크롤한다.

### 반드시 먼저 읽을 파일

1. `frontend/src/game/docs/match-module-integration.md`
2. `frontend/src/game/docs/development-troubleshooting.md` 16~19절
3. `frontend/src/game/glyph-battle/bot/LocalGlyphTurnPractice.ts`
4. `frontend/src/game/glyph-battle/pages/GlyphTurnBotPracticePage.tsx`
5. `frontend/src/game/glyph-battle/duel/GlyphTurnMatchContract.ts`
6. `frontend/src/game/glyph-battle/duel/GlyphCombatRules.ts`
7. `frontend/src/game/glyph-battle/duel/GlyphDuelModel.ts`
8. 파일명이 `LineRaceGameShell.tsx`인 컴포넌트
9. `frontend/src/game/glyph-battle/render/LineRaceRenderer.ts`
10. `frontend/src/game/glyph-battle/render/RaceRunnerRenderer.ts`
11. `frontend/src/styles.css`

### 절대 되돌리면 안 되는 조건

- 레거시 서버 봇 버튼, 자동 공격 interval, 사용자 입력과 무관한 턴 진행을 다시 넣지 않는다.
- 턴 배틀에 `JamoObstacleRenderer`, 글자 road, `TimeBasedObstaclePathFollower`를 다시 마운트하지 않는다.
- 상대 symbol/role/element를 두 선택이 잠기기 전에 노출하지 않는다.
- Pixi 생성 effect를 렌더마다 새로 생기는 config 객체 전체에 의존시키지 않는다.
- 수달 라인아트와 강변 결투장을 사람 졸라맨이나 단순 도형 배경으로 되돌리지 않는다.
- 운영 대전에서 프런트 로컬 계산을 권위 판정으로 사용하지 않는다.

### 현재 검증 상태

- 6개 테스트 파일, 39개 테스트 통과
- TypeScript `tsc -b`, Vite production build 통과
- 무입력 TURN 1/HP 100 유지, 실제 카메라 1회 인식으로 TURN 1 → TURN 2 진행 확인
- 공개 전 상대 `?`, 캔버스 1개, 864px 데스크톱 한 화면 표시 확인
- 새 UI 오류 없이 MediaPipe 기존 GL/NORM_RECT 경고만 존재

### 다음 작업 우선순위

1. 새 Match 모듈이 준비되면 `GLYPH_TURN_CHOICE_COMMAND`, `GLYPH_TURN_CHOICE_LOCKED`, `GLYPH_TURN_RESOLVED`, `GLYPH_DUEL_SNAPSHOT`을 실제 transport/parser/gateway에 연결한다.
2. 서버의 선택 비공개, 양쪽 잠금, 동시 공개, HP/focus/guardPercent/rounds/turn 권위 스냅샷 계약 테스트를 작성한다.
3. 로컬 엔진은 연습용으로 유지하고 온라인 대전만 서버 스냅샷 표시 모델로 교체한다.
4. 블록 게임 회귀, 턴 배틀 테스트, 전체 TypeScript 검사와 production build를 실행한다.

### 다음 컴퓨터 Codex에 보낼 문장

```text
현재 열려 있는 handpractice 저장소에서 frontend/src/game/docs/glyph-battle-handoff.md를 처음부터 끝까지 읽고, 특히 "2026-07-20 최신 인계 보충"과 frontend/src/game/docs/development-troubleshooting.md 16~19절을 이전 내용보다 우선 적용해. 문서의 다음 작업 우선순위를 실제로 구현하고 검증해. 요약만 하고 멈추지 말고, 백엔드·인증·RTC·Python AI 서버는 수정하지 마. 레거시 서버 봇, 글자 도로/장애물/경로 추종, 자동 봇 공격을 다시 넣지 마. 새 Match 백엔드가 아직 없으면 계약 테스트와 프런트 어댑터까지만 준비하고 운영 판정을 프런트 로컬 계산으로 대체하지 마.
```

## 사용 방법

다른 컴퓨터에서 `handpractice` 프로젝트를 Codex로 연 다음 아래 한 문장만 전달하면 된다.

```text
frontend/src/game/docs/glyph-battle-handoff.md를 처음부터 끝까지 읽고, 문서 안의 "복사용 프롬프트"를 내 지시로 간주해서 작업을 그대로 이어서 진행해줘. 문서 요약만 하고 멈추지 마.
```

이 문서를 읽는 Codex는 현재 저장소 루트를 기준으로 모든 상대 경로를 해석해야 한다. 원래 경로는 `C:\Users\khsoo\Desktop\handpractice`였지만 다른 컴퓨터에서 경로가 다르면 현재 열려 있는 `handpractice` 저장소를 사용한다. 원래 경로가 없다는 이유로 새 프로젝트를 만들거나 작업을 중단하지 않는다.

## 먼저 읽을 파일

1. `frontend/src/game/docs/match-module-integration.md`
2. `frontend/src/game/docs/development-troubleshooting.md`의 16, 17, 18절
3. `frontend/src/game/match/MatchModuleTransport.ts`
4. `frontend/src/game/match/MatchChannelConfig.ts`
5. `frontend/src/game/glyph-battle/duel/GlyphTurnMatchContract.ts`
6. `frontend/src/game/glyph-battle/duel/GlyphCombatRules.ts`
7. `frontend/src/game/glyph-battle/duel/GlyphDuelModel.ts`
8. `frontend/src/game/glyph-battle/pages/LineRaceGamePage.tsx`
9. `frontend/src/game/glyph-battle/render/LineRaceRenderer.ts`
10. `frontend/src/game/glyph-battle/render/RaceRunnerRenderer.ts`
11. `frontend/src/game/glyph-battle/assets/turn-otter-player.png`
12. `frontend/src/game/glyph-battle/assets/turn-otter-rival.png`

## 복사용 프롬프트

```text
현재 열려 있는 handpractice 프로젝트의 작업을 이어서 진행해줘. 원래 작업 경로는 C:\Users\khsoo\Desktop\handpractice였지만, 현재 컴퓨터에서 경로가 다르면 지금 열려 있는 저장소 루트를 기준으로 아래 상대 경로를 해석해.

먼저 아래 문서를 전부 읽고 현재 구현을 임의로 되돌리지 마.
- frontend/src/game/docs/match-module-integration.md
- frontend/src/game/docs/development-troubleshooting.md의 16, 17, 18절
- frontend/src/game/docs/glyph-battle-handoff.md

시각 방향도 임의로 되돌리지 마.
- 사람 선 캐릭터는 폐기했고 굵은 흑백 선의 수달 결투 캐릭터 두 종을 사용한다.
- 배경은 큰 원형 도형이 아니라 강변 다리, 관중, 깃발, 수면, 목재 대련장을 Pixi 선화로 그린다.
- 캐릭터 모션은 IDLE/LOCKED/ATTACK/GUARD/FOCUS/FINISHER/HIT로 구분하며 서버 판정의 role, attackerId, targetId, calloutAt과 연결한다.

현재 우선순위는 새 백엔드의 Match 모듈만 연결하면 블록게임과 지문자 턴 배틀이 동작하는 구조를 완성하는 것이다. 방, 인증, STOMP 셸, RTC, Python AI 서버는 다른 담당 영역이므로 수정하지 마.

이미 완료된 내용:
- 공통 MatchModuleTransport 포트
- 설정 가능한 STOMP command/player/match destination
- 블록게임과 지문자게임 transport의 공통 채널 적용
- GameServiceProvider가 line-race transport override를 실제로 사용하도록 수정
- 동시 비공개 선택 방식의 GlyphTurnMatchContract 타입 초안
- 공격/방어/집중/필살 역할과 3속성 상성
- 고정 지문자 난이도 1~3에 따른 피해/방어 감소율/집중 보상
- 흑백 강변 대련장, 플레이어·상대 수달 캐릭터, 기술별 판정 애니메이션
- 첫 사용자 온보딩과 기술 설명 카드
- 결과 화면에서 완주 시간, 진행도, 장애물, 지연 표시 제거

현재 검증 상태:
- 수달 캐릭터는 frontend/src/game/glyph-battle/assets/turn-otter-player.png와 turn-otter-rival.png를 사용한다. 임의로 재생성하거나 사람 선 캐릭터로 되돌리지 않는다.
- IDLE/LOCKED/ATTACK/GUARD/FOCUS/FINISHER/HIT 모션과 공격자·피격자 구분 테스트가 구현돼 있다.
- 관련 렌더러·결투 모델 테스트 3개 파일의 12개 테스트가 통과했다.
- TypeScript 검사와 Vite production build가 통과했다.
- 개발 브라우저에서 수달 투명 배경, 강변 선화, 원근 배치, 이름표 위치, 경기 시작 모션을 직접 확인했다.
- 브라우저 콘솔에는 새 UI 오류가 없었고 MediaPipe의 기존 GL/NORM_RECT 경고만 확인됐다.

다음으로 해야 할 일:
1. GlyphTurnMatchContract의 GLYPH_TURN_CHOICE_COMMAND, GLYPH_TURN_CHOICE_LOCKED, GLYPH_TURN_RESOLVED, GLYPH_DUEL_SNAPSHOT을 실제 transport parser와 command gateway에 연결한다.
2. 상대 LOCK 이벤트에는 symbol/role/element가 포함되지 않는 계약 테스트를 만든다.
3. 두 선택이 모두 잠긴 뒤에만 공개되도록 통합 테스트를 만든다.
4. 서버 Snapshot이 HP, focus, guardPercent, rounds, turn, lockedPlayerIds를 완전히 복원하는지 테스트한다.
5. 새 Match 모듈 연결 후 GlyphDuelModel의 로컬 판정을 제거하고 서버 상태 표시 모델로 축소한다.
6. 블록게임 회귀 테스트와 프런트 production build를 실행한다.
7. localhost 브라우저에서 봇전을 여러 턴 플레이하며 선택 잠금, 공개, 상성, 방어 감소, 집중, 필살, 라운드, 재접속, 결과 화면을 직접 검증한다.

중요한 게임 규칙:
- 양쪽은 동시에 비공개 선택한다. 상대 기술은 공개 전까지 절대 보이면 안 된다.
- 획 > 결 > 울림 > 획, 필살은 무속성이다.
- ㅇ/ㅁ은 방어, 모음은 집중, 기본 각진 자음은 공격, 강한 자음은 필살이다.
- 인식 confidence가 아니라 고정 동작 난이도로 보상을 조절한다.
- 매 턴 패에는 공격/방어/집중 선택지가 가능하면 하나씩 있어야 한다.
- 프런트 로컬 계산을 운영 판정으로 사용하지 않는다.

UI 방향:
- 포켓몬 전투의 정보 구조만 참고하고 캐릭터나 원본 그래픽을 복제하지 않는다.
- 내 캐릭터는 왼쪽 아래, 상대는 오른쪽 위에 둔다.
- 흑백 종이·연필 선화가 기본이며 기술 순간에만 포인트 색을 사용한다.
- 화면을 설명문으로 채우지 말고 카드 한 장 안에 역할, 속성, 난이도, 수치, 형태 근거만 보여준다.

기존 사용자 변경이 많은 dirty worktree이므로 git reset, checkout, 대규모 포맷을 하지 마. 백엔드 코드는 사용자 승인 없이 수정하지 마. 구현 후 관련 테스트와 전체 build를 실행하고, 실제 브라우저 플레이 결과와 남은 서버 의존성을 정확히 보고해줘.
```
