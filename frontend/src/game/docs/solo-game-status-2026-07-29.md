# 솔로 지문자 테트리수 작업 상태 — 2026-07-29

관련 장애 원인과 해결책은 `solo-game-troubleshooting-2026-07-29.md`를 기준으로 한다.

## 완료 범위

- 수달 종이 중심 목표 방식과 인식 성공 시 중앙 낙하
- 종이 글자 확대와 Matter/Pixi 물리 블록의 단일 위치 hand-off
- 첫 목표 stale 인식 방지와 빠른 재인식 입력 잠금 개선
- 충돌체 편집기 및 글자별 획 단위 기본 충돌 JSON 적용
- 바닥 이탈·광범위 겹침 완화를 위한 물리 경계/충돌체 보정
- 새로 정착한 블록 기준 결승선 즉시 종료
- 결과 오버레이 전면 표시
- 경과 초 저장 및 랭킹 표시
- 오답 가중치 API 연동, 약한 가중치와 연속 중복 방지

## 게임 흐름

1. 게임 시작 시 지문자 목록과 오답 가중치를 한 번 읽는다.
2. 수달 종이에 직전 글자와 다른 목표를 표시한다.
3. 목표 인식 성공 시 종이 글자가 760ms 동안 최종 물리 크기로 확대된다.
4. 같은 위치에 물리 블록을 한 번만 만들고 자연 낙하시킨다.
5. 블록이 종이 영역을 벗어나면 다음 목표를 표시한다.
6. 새로 정착한 블록이 결승선을 넘으면 즉시 종료한다.
7. 경과 초를 저장하고 백엔드가 계산한 내 순위를 결과 화면에 표시한다.

## 운영 API

- 결과: `POST /api/solo-results?userId={userId}` body `{score: elapsedSeconds}`
- 랭킹: `GET /api/rankings?userId={userId}&gameType=TETRIS_SOLO`
- 가중치: `GET /api/wrong-answers/tetris-weights`
- 자음 매핑: `GET /api/signs?category=CONSONANT`
- 모음 매핑: `GET /api/signs?category=VOWEL`

솔로 전용 원격 session start API는 호출하지 않는다.

## 가중치 정책

- 서버 가중치 증가분의 20%만 반영한다.
- 유효 가중치는 최대 `1.2`다.
- 같은 문자는 연속 선택하지 않는다.
- API나 응답 계약 실패 시 모두 `1.0`으로 진행한다.

## 충돌 편집

- 개발 전용 URL: `/game/solo?collisionAudit=1`
- 기준 파일: `frontend/src/game/block-stacking/glyphs/glyphCollisionDefaults.json`
- 브라우저 저장은 편집 중 복구용이다. 배포 기본값은 기준 JSON 파일이다.

## 남은 외부 확인

`TETRIS_SOLO` 랭킹이 낮은 `score`를 더 높은 순위로 계산하는지는 백엔드 정책이다. 프런트는 경과 초 제출과 `me.rank` 표시만 담당한다.

## 검증 결과

- 솔로 런타임·Matter 물리·가중치 API·결과 API·결과 매퍼·세션·게임 모듈 관련 테스트: 7개 파일, 52개 통과
- TypeScript/Vite production build: 통과
- 전체 프런트 테스트: 141개 파일 중 137개 통과, 579개 테스트 중 574개 통과
- 전체 테스트의 남은 5개는 이번 솔로 변경 목록 밖의 기존 계약 불일치다.
  - 학습 데이터 설명을 정확히 2줄로 제한하는 테스트 2개
  - 제거된 사용자 등록 과정을 전제로 하는 인식 세션 테스트 2개
  - 1:1 봇 대전의 6초 결승선 arm/정착 지속 조건을 반영하지 않은 테스트 1개
