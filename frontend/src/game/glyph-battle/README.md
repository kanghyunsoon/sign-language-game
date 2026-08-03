# Glyph battle

지문자 턴 배틀의 로컬 봇 연습, 사람 1:1, 방·대기실·결과 화면을 소유한다.

## 소유 라우트

- `/game/turn-battle`: 방 목록
- `/game/turn-battle/:roomId`: 대기실
- `/game/turn-battle/:roomId/play`: 온라인 1:1
- `/game/turn-battle/practice`: 로컬 봇 연습

## LineRace 코드에 대해

이 디렉터리에는 `LineRace*` 이름의 파일이 다수 남아 있다. 사용자용 라인레이스 라우트는 제거됐고, 남은 코드는 두 용도다.

- 턴 배틀이 재사용하는 방 게이트웨이, 장애물 레지스트리, 피드백·오디오 계층
- 개발 전용 harness(`dev/LineRaceDevHarnessPage.tsx`)

`GameModuleServices`의 `lineRaceRoomGateway`, `lineRaceBotGateway`, `lineRaceTransportFactory`도 harness 전용 선택 포트다. 새 기능은 `LineRace*` 이름을 늘리지 말고 `GlyphTurn*` 경계에 추가한다.

## 권위 경계

온라인 1:1은 `GlyphTurnMatchTransport`를 필수로 사용하며 레거시 공격 Gateway로 폴백하지 않는다. HP·집중·방어·라운드·턴 연출은 `GLYPH_TURN_*` 이벤트만 권위 입력으로 사용한다. 상세 규칙과 과거 사고 기록은 `../docs/game-troubleshooting.md`의 「지문자 턴 배틀」 절에 있다.
