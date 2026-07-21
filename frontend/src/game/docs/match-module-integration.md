# Match 모듈 교체 계약

## 목표

나는 방, 인증, WebSocket, RTC, AI 인식 서버를 게임 규칙과 분리했다. 새 백엔드에서는 외곽 인프라를 다시 만들더라도 게임별 Match 모듈이 아래 계약만 구현하면 프런트의 블록게임과 지문자 대전을 연결할 수 있어야 한다.

## 경계

Match 모듈이 맡는 것:

- 경기 시작, 턴 또는 Tick 진행, 종료
- 참가자별 권위 상태
- `commandId` 중복 방지와 명령 검증
- 점수, 체력, 집중력, 방어, 라운드, 승패 계산
- 재접속 Snapshot
- Match 단위 단조 증가 `sequence`

Match 모듈이 맡지 않는 것:

- 방 생성과 참가
- 로그인과 사용자 인증
- STOMP 연결 및 세션 관리
- RTC 영상
- Python 수어 인식

## 백엔드 리드와 게임 파트의 소유권

이 문서에서 전제하는 역할 분담은 다음과 같다.

- 백엔드 리드는 방 생성·참가·퇴장, 로그인과 Principal, 연결 세션, REST/STOMP 라우팅, 운영 저장소와 트랜잭션 인프라를 소유한다.
- 게임 파트는 방에서 확정된 `roomId`와 `matchId`, 참가자 목록을 어댑터 경계에서 받아 Match를 시작하고, 명령 검증·시간 진행·점수/체력·승패·재접속 Snapshot을 소유한다. 지문자 use case에는 `matchId`와 참가자만 넘기고 `roomId -> matchId` 관계는 리드 서버 어댑터가 유지한다.
- 백엔드 리드의 인바운드 어댑터는 인증 Principal을 `playerId`로 변환한 뒤 game-module의 input port를 호출한다. 요청 body의 `playerId`를 신뢰하지 않는다.
- game-module이 반환한 Snapshot과 도메인 이벤트는 백엔드 리드의 아웃바운드 어댑터가 해당 방의 개인 큐 또는 Match topic으로 발행한다.
- 방이 없어지거나 참가자가 나가면 백엔드 리드가 그 사실을 게임 input port에 전달한다. 게임 파트가 리드 서버의 Room/JPA/STOMP 클래스를 직접 import하지 않는다.

즉 리드 서버가 방까지 만들고, 게임 파트가 방별 값을 받아 Match 상태를 관리한 뒤 결과를 리드 서버의 전송 경계로 돌려주는 방향이다.

```text
리드 서버 Room/Auth/STOMP
  -> 인바운드 어댑터(인증 ID + room/match 정보 변환)
  -> game-module input port
  -> 게임 규칙과 Match 권위 상태
  -> Snapshot/domain event 반환
  -> 아웃바운드 어댑터(DB/Redis, 개인 큐, Match topic)
  -> 리드 서버가 해당 방 사용자에게 전달
```

## 리드 서버에 붙이는 최소 절차

운영 서버에는 `game-dev-backend/game-module`만 Gradle project dependency 또는 사내 라이브러리로 추가한다. `dev-app`은 동작 예시일 뿐 복사 대상이 아니다.

1. 리드 서버의 방 시작 로직에서 확정된 `matchId`, 두 `playerId`, 선택적 `botPlayerId`를 게임 시작 input port에 전달한다.
2. 리드 서버 저장 방식에 맞춰 output repository port를 구현한다. 초기 연결 단계에서는 메모리, 운영 단계에서는 트랜잭션이 보장되는 DB/Redis 어댑터를 사용할 수 있다.
3. 리드 서버의 인증된 REST/STOMP handler가 input use case만 호출하도록 연결한다.
4. 반환 Snapshot과 event를 리드 서버의 `/queue/game/player/{playerId}` 및 `/topic/game/match/{matchId}` 형식에 매핑한다. 실제 destination은 환경 변수로 바꿀 수 있다.
5. 스케줄러는 `advance...` use case를 호출할 뿐 자체적으로 점수·턴을 계산하지 않는다.
6. `commandId` unique 제약과 Match `sequence` 원자 갱신을 저장소 트랜잭션에 포함한다.

게임별 진입점과 필수 출력 포트는 다음과 같다.

- 블록쌓기 솔로: `StartSoloGameUseCase`, `CompleteSoloGameUseCase`, `GetSoloGameResultsUseCase` + `SoloSessionRepositoryPort`, `SoloResultRepositoryPort`, `GameClockPort`, `GameEventPublisherPort`
- 블록쌓기 1:1: `StartBattleMatchUseCase`, `HandleBattleOfficialCommandUseCase`, `AdvanceBattleMatchUseCase`, `FindBattleMatchUseCase` + `RoomQueryPort`, Battle repository/snapshot/message publisher port, 공통 clock/random/event port
- 라인레이스: `StartLineRaceMatchUseCase`, attack/counter/reconnect/advance/finish use case + LineRace match/result/message publisher port
- 지문자 턴 배틀: `GlyphTurnMatchUseCase` + `GlyphTurnMatchRepositoryPort`, `GameClockPort`. `start`, `choose`, `snapshot`, `advanceChangedMatches`의 반환 Snapshot을 전송 어댑터가 발행한다.

참고 구현은 `dev-app`의 `DevGameModuleConfiguration`, `DevGlyphTurnService`, `InMemoryGlyphTurnMatchRepository`다. 이 중 `DevGlyphTurnService`는 방/인증 검증과 STOMP DTO 매핑만 하며 Match 객체나 게임 규칙 상태를 직접 보관하지 않는다.

프런트 공통 포트는 다음 파일에 있다.

- `frontend/src/game/match/MatchModuleTransport.ts`
- `frontend/src/game/match/MatchChannelConfig.ts`
- `frontend/src/game/app/GameServiceProvider.tsx`

블록 1:1은 `battleGameTransportFactory`, 라인레이스는 `lineRaceTransportFactory`, 지문자 턴 배틀은 `glyphTurnMatchTransportFactory`를 `GameModuleServices`에 주입한다. 따라서 리드 서버가 STOMP가 아닌 다른 통신 구현을 쓰더라도 페이지 코드는 수정하지 않는다.

기존에 코드에 박혀 있던 STOMP 주소를 다음 환경 변수로 교체할 수 있게 했다.

```text
VITE_GAME_ROOM_API_BASE_URL=/api/dev
VITE_GAME_WEBSOCKET_URL=ws://localhost:8091/ws/game
VITE_MATCH_COMMAND_DESTINATION=/app/game/message
VITE_MATCH_PLAYER_DESTINATION=/queue/game/player/{playerId}
VITE_MATCH_BROADCAST_DESTINATION=/topic/game/match/{matchId}
```

기본 주소를 유지하면 별도 프런트 수정 없이 기존 셸과 연결된다. 주소가 다르면 환경 변수만 바꾼다.

## 공통 메시지 규칙

- 명령에는 `commandId`, 경기 명령에는 `matchId`를 넣는다.
- 이벤트에는 `eventId`, `matchId`, `sequence`, `occurredAt`을 넣는다.
- `commandId` 재전송은 같은 결과를 돌려주거나 무시한다.
- `sequence`는 Match마다 0 이상 단조 증가한다.
- 시간은 epoch milliseconds로 통일한다.
- 재접속 Snapshot은 한 화면을 완전히 복원할 수 있어야 한다.
- Snapshot 이후 프런트는 Snapshot `sequence`보다 작은 이벤트를 버린다.

## 블록게임 Match

블록게임은 현재 아래 명령을 사용한다.

- `REMOVE_LETTER_COMMAND`
- `PLAYER_GAME_OVER_COMMAND`
- `PLAYER_RECONNECTED`
- `REQUEST_MATCH_STATE`
- `BODY_TRANSFORM_BATCH`
- `BOARD_SNAPSHOT`

필수 서버 이벤트는 `MATCH_STARTED`, `SPAWN_LETTER`, `REMOVE_LETTER_ACCEPTED/REJECTED`, `SCORE_UPDATED`, `COMBO_UPDATED`, `ATTACK_CREATED`, `MATCH_FINISHED`, 접속 상태 이벤트와 보드 동기화 이벤트다. 실제 타입은 `frontend/src/game/block-stacking/battle/transport/battleTransportTypes.ts`에 있다.

물리 좌표는 화면 동기화 자료일 뿐 점수와 승패의 절대 근거로 신뢰하지 않는다. 글자 제거, 점수, 공격, 게임 오버는 Match 모듈이 검증한다.

## 지문자 턴 배틀 Match

### 동시 비공개 선택

순차 턴으로 상대 기술을 먼저 보여 주면 공격과 방어의 심리전이 사라진다. 그래서 한 턴은 다음 순서로 처리한다.

1. 두 사용자가 동시에 기술을 선택한다.
2. `GLYPH_TURN_CHOICE_COMMAND`는 Match 모듈만 받는다.
3. 서버는 개인 ACK 또는 `GLYPH_TURN_CHOICE_LOCKED`만 보낸다.
4. 상대에게 보내는 LOCK 이벤트에는 `symbol`, 역할, 속성을 절대 넣지 않는다.
5. 두 선택이 모두 잠기거나 제한 시간이 끝나면 `GLYPH_TURN_RESOLVED`로 동시에 공개한다.
6. 피해, 방어 감소율, 집중력, 라운드를 한 번에 계산한 권위 상태를 포함한다.

타입 초안은 `frontend/src/game/glyph-battle/duel/GlyphTurnMatchContract.ts`에 있다.

선택 제한 시간에 응답하지 않은 사용자는 기본 방어를 선택한 것으로 처리하거나 Match 정책에 따라 패널티를 준다. 어떤 정책이든 클라이언트가 임의 판정하지 않는다.

### 지문자 역할 기준

역할은 임의 분류가 아니라 글자 형태와 생성 강도를 따른다.

- `ㅇ`, `ㅁ`: 닫힌 형태라서 방어
- 모음 획: 방향을 만들기 때문에 집중
- `ㄱ`, `ㄴ`, `ㄷ`, `ㄹ`, `ㅂ`, `ㅅ`, `ㅈ`: 각진 기본 획이라서 공격
- 격음, 쌍자음 등 강한 자음: 집중력을 소비하는 필살

상성은 세 개만 사용한다.

```text
획(공격) > 결(방어) > 울림(집중) > 획(공격)
```

필살은 무속성이고 집중력 35가 필요하다. 집중력이 부족해도 기술은 나가지만 위력이 크게 감소한다.

### 난이도와 보상

인식 모델의 순간 confidence를 밸런스에 사용하지 않는다. 모델 오류가 공격력으로 바뀌면 안 되기 때문이다. 대신 고정된 동작 난이도를 사용한다.

- 난이도 1: 기본 피해/방어/집중
- 난이도 2: 기본값의 약 1.14배
- 난이도 3: 기본값의 약 1.28배

난이도 테이블과 실제 수치는 `GlyphCombatRules.ts`가 기준이다. Match 모듈로 옮길 때 같은 테이블을 서버 코드와 계약 테스트로 고정해야 한다.

매 턴 선택 패에는 가능하면 공격, 방어, 집중이 최소 하나씩 포함돼야 한다. 필살만 여러 장 나오거나 방어가 전혀 없는 패를 만들지 않는다.

## 프런트 표현 규칙

- 캐릭터는 외부 이미지 대신 흑백 선 캐릭터로 렌더링한다.
- 내 캐릭터는 왼쪽 아래 전경, 상대는 오른쪽 위 후경에 둔다.
- 배경은 종이 질감, 중앙선, 원형 경기장, 낮은 대비 관중선만 사용한다.
- 선택 잠금은 카드 뒤집기, 공개는 중앙 충돌로 표현한다.
- 공격은 베기 선, 방어는 원형 결계, 집중은 동심원, 필살은 방사형 폭발로 구분한다.
- 포인트 색은 기술 순간에만 사용한다.

## 현재 연결 상태와 주의점

공통 Match 포트, 채널 설정, 서비스 주입 구조가 구현돼 있다. 온라인 지문자 1:1 화면은 이제 `GlyphTurnMatchTransport`가 없으면 시작하지 않으며, 기술 선택을 기존 `LINE_RACE_*` 공격으로 폴백하지 않는다. 기존 라인레이스 이벤트는 경기 셸과 참가자 연결 상태를 유지하는 용도로만 사용하고 결투 HP·턴·연출에는 넣지 않는다.

- `/game/line-race/practice`: 같은 규칙과 렌더러를 쓰는 로컬 봇 연습
- `/game/line-race/matches/{matchId}`: `GLYPH_TURN_*` 계약만 판정 근거로 쓰는 사람 대 사람 1:1
- 온라인 Match에 `isBot=true` 참가자가 있으면 입장을 거부한다. 봇은 연습 경로에서만 사용한다.
- `GLYPH_TURN_RESOLVED`는 한 번만 연출하고 다음 `PLANNING` Snapshot에서 `lastMove`와 `resolvedMoves`를 반드시 비운다.

개발 백엔드의 `DevGlyphTurnService`는 방 멤버십과 STOMP 변환만 담당한다. 두 사람 또는 사람 대 봇의 선택, 10초 제한, 서버 권위 HP·집중·방어·라운드와 Snapshot은 `game-module`의 `GlyphTurnMatchApplicationService`가 관리하고 저장은 `GlyphTurnMatchRepositoryPort` 뒤에 있다. 운영 백엔드로 교체할 때도 클라이언트 계산으로 되돌리지 않는다.

## 한 게임 Match 상태 API 권장안

Match 상태는 API로 관리하는 편이 맞다. 다만 REST만 주기적으로 조회하는 구조가 아니라, **REST는 수명주기·복구·조회**, **WebSocket은 실시간 명령·이벤트**로 나누는 하이브리드가 적합하다.

권장 REST 경계:

```text
POST /api/glyph-matches                       경기 생성
POST /api/glyph-matches/{matchId}/join        참가
POST /api/glyph-matches/{matchId}/start       시작 조건 검증 후 시작
GET  /api/glyph-matches/{matchId}/state       권위 Snapshot 조회·재접속 복구
POST /api/glyph-matches/{matchId}/forfeit     기권
GET  /api/glyph-matches/{matchId}/result      종료 결과 조회
```

실시간 경계:

```text
client -> /app/game/message
  GLYPH_TURN_CHOICE_COMMAND
  GLYPH_TURN_SNAPSHOT_REQUEST

server -> /queue/game/player/{playerId}
  개인 ACK, 개인 Snapshot, 오류

server -> /topic/game/match/{matchId}
  GLYPH_TURN_CHOICE_LOCKED
  GLYPH_TURN_RESOLVED
  공개 Snapshot
```

서버 저장 상태에는 최소 `matchId`, 두 `playerId`, phase, turn, turnEndsAt, 각 플레이어 HP·집중·방어·라운드, 잠긴 선택, 사용한 `commandId`, 현재 `sequence`, 종료 결과를 둔다. 동시 선택은 Match 단위 락 또는 원자적 compare-and-set으로 처리하고, 선택 원문은 REVEAL 전까지 상대 응답과 공개 Snapshot에 절대 포함하지 않는다. 메모리 구현을 Redis/DB로 교체하더라도 이 불변식은 동일해야 한다.

REST Snapshot은 운영 확인과 재접속을 편하게 하지만 매 프레임 또는 매 턴 폴링 용도로 사용하지 않는다. 브라우저는 WebSocket 이벤트를 적용하다 sequence 누락이나 재접속이 발생했을 때만 Snapshot을 다시 받아야 한다.

## 백엔드 또는 AI 서버 교체 체크리스트

### 게임 백엔드 교체

- 환경 변수의 REST base URL, WebSocket URL, command/player/topic destination을 새 서버와 맞춘다.
- STOMP 인증 Principal이 payload의 playerId가 아니라 실제 사용자 ID의 권위 근거가 되게 한다.
- UUID 형식, epoch milliseconds, `commandId` 멱등성, Match 단위 단조 증가 `sequence`를 유지한다.
- 두 명의 실제 사용자만 온라인 1:1 Match 참가자로 허용한다. 봇 ID나 연결되지 않은 가상 참가자를 자동 삽입하지 않는다.
- 턴 제한 10초는 서버 시각으로 판정하고 `turnEndsAt`을 Snapshot과 LOCK 이벤트에 포함한다.
- 재접속 Snapshot 하나로 HP·집중·방어·라운드·턴·phase·잠금 상태를 완전히 복원할 수 있어야 한다.
- 역방향 프록시에서 WebSocket Upgrade, CORS/Origin, TLS 종료, sticky session 또는 공유 Match 저장소를 확인한다.
- 여러 인스턴스가 같은 Match를 처리할 때 단일 writer, 분산 락 또는 원자적 버전 갱신으로 이중 판정을 막는다.

### AI 인식 서버 교체

- 브라우저 MediaPipe와 원격 비전 서버의 교체점은 `RecognitionVisionAdapterFactory`다. 페이지나 `HandCamera`에서 구현체를 직접 생성하지 않는다.
- 현재 기본 구현은 `MediaPipeRecognitionVisionAdapter`이며, 원격 서버는 `createRemoteRecognitionVisionAdapterFactory`에 `RemoteRecognitionVisionTransport` 구현을 주입한다.
- 게임 전체 교체는 `GameModuleServices.recognitionVisionAdapterFactory`에 한 번만 주입한다. 화면별로 서로 다른 구현을 섞지 않는다.
- 브라우저가 영상이 아니라 선택된 손의 21개 랜드마크만 전송한다는 개인정보 경계를 유지한다.
- 원격 비전 transport가 영상 인코딩을 필요로 한다면 전송 범위, 해상도, 보존 금지, 인증, 암호화 정책을 먼저 확정한다. 이 경우에도 게임 코어와 UI에는 transport DTO를 노출하지 않는다.
- 요청·응답의 session, frameId/sequence, capture timestamp, handedness, 좌표 정규화 규칙을 그대로 맞춘다.
- 모델 label index와 한글 지문자 문자열 매핑을 함께 배포하고 NFC/UTF-8 인코딩을 확인한다.
- confidence 한 번으로 확정하지 않고 기존 temporal decoder, contextual candidate, 520ms 선택 게이지, 손 해제 재무장 규칙을 유지한다.
- in-flight 1개와 latest pending 1개인 backpressure를 유지해 오래된 프레임이 누적되지 않게 한다.
- 늦은 이전 세션 응답은 버리고, 실제 손이 사라졌다는 신호와 단순 분류 변경을 구분한다.
- `ws://`/`wss://` 혼합 콘텐츠, 인증 헤더 전달 방식, health/readiness, 모델 warm-up 시간을 배포 전에 확인한다.
- 교체 후에는 단일 손, 빠른 동작, 손을 계속 든 상태, 손을 내렸다 다시 올린 상태, 두 사람이 화면에 있는 상태를 실제 카메라로 검증한다.

## 검증 명령

```powershell
cd frontend
npx.cmd vitest run src/game
npm.cmd run build
```

2026-07-21 회귀 검증에서는 블록쌓기 솔로, 블록쌓기 1:1, 지문자 턴 배틀 봇전, 지문자 턴 배틀 1:1 대표 테스트 8개 파일의 47개 테스트와 `src/game` 전체 122개 파일의 458개 테스트가 통과했고 production build도 통과했다. 백엔드는 `game-module` main 121개 소스, Glyph 더미 어댑터와 설정을 `javac`로 컴파일하고 사람 1:1/봇전 상태 진행 하네스를 실행했다.

이 환경에서는 로컬 주소를 앱 내 브라우저로 여는 정책이 허용되지 않아 실제 카메라를 켠 수동 플레이는 수행하지 못했다. 실제 장치에서 마지막으로 확인할 항목은 카메라 권한, MediaPipe 초기화, 두 브라우저의 STOMP/RTC 연결, 재접속 Snapshot이다. 자동 테스트는 명령·턴·상태·전송 경계를 실제 게임과 같은 순서로 검증하지만 물리 카메라와 두 명의 동시 조작을 대체하지는 않는다.
