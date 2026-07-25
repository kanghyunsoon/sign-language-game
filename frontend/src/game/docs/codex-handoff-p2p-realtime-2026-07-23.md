# P2P 실시간 게임 최종 핸드오프 — 2026-07-23

## 후속 문서

- `post-integration-next-steps-2026-07-24.md`: 실제 운영 배포 전후의 남은 작업과 완료 조건
- `vercel-deployment-guide-2026-07-24.md`: Vercel 설정, 환경변수, smoke test, 운영 유의사항

## 절대 규칙

- 백엔드 소스는 수정하지 않는다.
- Room WebSocket은 ticket 기반 native WebSocket이다.
- STOMP는 런타임, 의존성, 신규 코드에서 사용하지 않는다.
- 라인레이스는 사용자 기능이 아니며 턴 배틀로 대체됐다.

## 완료된 구조

- REST: 방 생성·참가·ready·start·leave·result
- Lobby SSE: Bearer 인증 티켓 발급 후 `EventSource` ticket query
- Room WebSocket: 방 이벤트와 WebRTC `SIGNAL` 전용
- WebRTC: 로컬/상대 영상과 `game-v1` DataChannel
- 게임 payload: `GAME_P2P_V1` command/event/snapshot
- 블럭쌓기: `P2pBattleTransport` host authority
- 턴 배틀: `P2pGlyphTurnMatchTransport` host authority
- 결과: 실제 `winnerUserId` 제출, 백엔드가 호스트/도전자에게 1/0 기록
- 결과 제출: 양쪽이 같은 host-authoritative 최종 snapshot을 제출하고 후속 `409`는 멱등 성공 처리
- 화면 역할: 본인은 항상 왼쪽, 상대는 항상 오른쪽. 방장은 스카프 수달·파란 HP, 도전자는 머리띠 수달·주황 HP로 역할에 따라 고정

## 최신 Swagger 변경 반영

2026-07-23 배포 Swagger 재확인 결과:

- 방 생성 body의 `gameType`은 필수다.
- 방 응답에 `gameType`과 `realtimeTicket`이 포함된다.
- 결과 body는 점수 DTO가 아니라 `{winnerUserId}`다.
- 결과 처리 뒤 방은 `CLOSED`가 아니라 `WAITING`으로 돌아간다.
- `409`는 중복 보고 또는 무효화된 매치다.
- 솔로 결과 `POST /solo-results`가 공개됐다.

프런트는 1:1 범위에서 위 계약을 반영했다. 솔로 결과 저장 연결은 1:1 배포 범위와 별도 작업으로 관리한다.

## 검증 기록

- 블럭쌓기 두 브라우저 1:1 전체 흐름과 `DANGER_LINE` 종료 확인
- 턴 배틀 두 브라우저 1:1 전체 흐름과 최종 HP/승패 대칭 확인
- 실제 WebRTC DataChannel 사용
- 턴 배틀 종료는 로컬 AI가 없는 환경에서 E2E 전용 trigger 사용
- 운영 빌드에는 카드 클릭 경로가 없고 손 인식 확정만 허용
- 전체 프런트 130개 테스트 파일, 477개 테스트 통과
- TypeScript 및 Vite production build 통과
- 최종 턴 배틀 방 `100004`: 11턴, HP `89:0`/`0:89`, 양쪽 결과 저장 완료, 동일 방 재입장과 ready 초기화 확인

## 배포 직후 smoke test

1. 인증된 두 계정과 서로 다른 네트워크를 준비한다.
2. 각 게임 종류로 방을 생성해 SSE 목록이 서로 섞이지 않는지 확인한다.
3. 참가 코드 입장, 양쪽 ready, 방장 start를 확인한다.
4. 로컬 영상과 블럭쌓기의 상대 영상, 턴 배틀의 로컬 손 인식 화면을 확인한다.
5. 브라우저 WebRTC 통계에서 TURN `relay` candidate 사용 여부를 확인한다.
6. 실제 손 인식으로 양쪽 명령을 발생시켜 종료한다.
7. 결과 API가 승자의 `winnerUserId`를 받아 호스트 승 `1:0` 또는 도전자 승 `0:1`로 반영하는지 확인한다.
8. 결과 뒤 방이 `WAITING`으로 돌아가고 ready가 초기화되는지 확인한다.
9. 짧은 네트워크 단절 뒤 새 ticket과 ICE restart로 복구되는지 확인한다.

## 알려진 운영 경계

순수 P2P 연결 상태만으로는 네트워크 분할 상황에서 실제 이탈자를 신뢰성 있게 판정할 수 없다. 양쪽이 동시에 상대를 이탈자로 볼 수 있기 때문이다. 자동 몰수패는 서버가 알려주는 인증된 peer presence를 권위 근거로 삼는 방식이 확정돼야 한다. 정상 종료와 결과 저장은 이 제한과 무관하게 배포 가능한 상태다.
