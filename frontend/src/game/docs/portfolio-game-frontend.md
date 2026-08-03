# 수어의 달인 — 게임 파트 프론트엔드

웹캠으로 한국 수어 지문자를 인식해 플레이하는 실시간 대전 게임. 게임 선택 화면 이후의 모든 화면과 게임 엔진, 인식 파이프라인, 실시간 통신을 담당했다.

- 기간: 2026-07 ~ 2026-08 (SSAFY 15기 공통 프로젝트, 6인 팀)
- 담당: `frontend/src/game` 전체 — 게임 UI, 물리·렌더 엔진, MediaPipe 인식, WebRTC 1:1, 방 생명주기
- 배포: https://sudal-play.vercel.app
- 규모: TypeScript/TSX 517개 파일 약 36,000줄, 테스트 141개 파일

---

## 1. 무엇을 만들었나

| 모드 | 라우트 | 내용 |
| --- | --- | --- |
| 솔로 프링글수 | `/game/solo` | 제시된 지문자를 손으로 만들면 그 글자가 물리 블록으로 떨어져 쌓인다. 결승선에 닿으면 종료, 경과 시간으로 랭킹 |
| 1:1 프링글수 | `/game/battle/*` | 두 사람이 같은 목표 글자를 두고 경쟁. 먼저 인식한 사람의 보드에만 블록이 떨어지고, 3연속 성공 시 상대 블록을 빼앗는다 |
| 지문자 턴 배틀 | `/game/turn-battle/*` | 자모를 기술 카드로 쓰는 턴제 대전. 자모 종류별로 공격·방어·결계·공명·필살기 역할이 다르고 3원 상성이 있다 |
| 봇 연습 | `/game/turn-battle/practice` | 결정적 PRNG 기반 로컬 봇 |

핵심 제약이 세 개 있었다. **백엔드는 게임 진행을 중계하지 않는다**(방 생성·참가·결과 저장만 REST로 제공), **AI 모델의 인식률이 완전하지 않다**(31개 자모 중 7개는 신뢰할 수 없음), **카메라·MediaPipe·물리·렌더링·네트워크가 한 브라우저의 메인 스레드를 공유한다**. 이 세 제약이 아래 설계 대부분의 이유다.

---

## 2. 기술 스택

| 영역 | 기술 | 선택 이유 |
| --- | --- | --- |
| 프레임워크 | React 19, TypeScript 7, Vite 8 | 팀 공통 스택. 게임 모듈을 호스트 앱에 `<Route path="/game/*">` 한 줄로 마운트할 수 있게 설계 |
| 물리 | matter-js 0.20 | 2D 강체 시뮬레이션. 한글 획을 compound body로 조립할 수 있어 선택 |
| 렌더링 | PixiJS 8 (WebGL) + DOM 레이어 | 파티클·이펙트는 Pixi, 실제 글자는 CSS mask DOM. 이유는 4.1에 서술 |
| 손 인식 | @mediapipe/tasks-vision 0.10 (Hand/Pose Landmarker) | 브라우저에서 21개 손 랜드마크 + 33개 포즈 랜드마크 추출. Web Worker 실행 + 메인 스레드 폴백 |
| 실시간 통신 | WebRTC DataChannel, native WebSocket, SSE | 게임 진행은 P2P, 시그널링만 서버. 이유는 4.4에 서술 |
| 영상 | WebRTC mesh (최대 4인, 1인당 peer 3개) | 상대 얼굴 표시 |
| 상태 관리 | React Context + 명시적 상태 머신 클래스 | 전역 store 없이 게임 모듈을 독립 패키지로 유지 |
| 테스트 | Vitest 4, Testing Library | 141개 파일. 타이머·랜덤·소켓을 전부 주입 가능하게 설계해 결정적 검증 |

의존성을 의도적으로 적게 유지했다. 상태 관리 라이브러리, 애니메이션 라이브러리, WebRTC 래퍼, HTTP 클라이언트를 모두 쓰지 않고 표준 API와 얇은 어댑터로 구현했다. 게임 모듈이 호스트 앱의 `package.json`을 오염시키지 않는 것이 병합 조건이었기 때문이다.

---

## 3. 아키텍처 — 포트-어댑터로 모듈 경계 만들기

6인이 하나의 프론트 저장소를 공유했다. 게임은 화면 수가 많고 카메라·WebRTC 같은 전역 자원을 쓰므로, 경계를 명시하지 않으면 병합 충돌이 계속 생긴다. 그래서 게임을 **주입 가능한 포트만 노출하는 독립 모듈**로 만들었다.

```
호스트 앱 (다른 팀원 담당)
  └─ <Route path="/game/*" element={<GameModule user={...} accessToken={...} config={...} />} />
        │
        └─ GameServiceProvider — 여기서만 구현체를 조립한다
             ├─ soloGameApi            : HttpSoloGameApi | LocalSoloGameApi
             ├─ battleRoomGateway      : Swagger | Backend | Dev
             ├─ battleGameTransport    : P2P | NativeWebSocket | Mock | LocalBot
             ├─ recognitionVision      : MediaPipe | Remote
             ├─ roomRealtimeSocket     : ticket 기반 native WebSocket
             └─ glyphTurnMatchTransport: P2P 권위 해석기
```

`contracts/GameModuleServices.ts`가 주입 포트 9개를 인터페이스로 정의한다. 호스트가 공유하는 파일은 라우터 한 줄, 환경 설정, `package.json`뿐이고 게임 화면은 전부 `src/game` 아래에 있다. 전역 store나 호스트 CSS를 import하지 않는다.

이 구조 덕에 실제로 얻은 것:

- **백엔드 완성 전에 게임을 끝까지 개발**했다. dev 모드는 `DevBattleRoomGateway` + `LocalSoloGameApi`, 운영 모드는 `SwaggerBattleRoomGateway` + `HttpSoloGameApi`로 `accessToken` 유무에 따라 자동 분기한다.
- 배포 Swagger의 결과 저장 계약이 `{hostScore, guestScore}` → `{winnerUserId}`로 바뀌었을 때, 게임 규칙 코드를 건드리지 않고 gateway 한 곳만 고쳤다.
- MediaPipe를 서버 추론으로 교체하는 경로를 `RemoteRecognitionVisionAdapter` 골격으로 열어 두면서도, `HandCamera`와 게임 페이지에는 구현체 분기를 넣지 않았다.

상태는 문자열 유니온 + 전이 화이트리스트를 가진 클래스로 관리했다. `BattleStateMachine`은 `IDLE / CONNECTING / WAITING_START / COUNTDOWN / PLAYING / RECONNECTING / FINISHED / ERROR` 8상태, `ActivePlayerStateMachine`은 7상태, `SignDecoderStateMachine`은 6상태이고 정의되지 않은 전이는 예외를 던진다. 실시간 코드에서 "어떻게 여기 왔는지 모르는 상태"가 가장 비싼 버그라서, 잘못된 전이를 조용히 넘기지 않고 테스트에서 터지게 했다.

---

## 4. 구현 상세

### 4.1 한글 글자를 물리 블록으로 만들기

가장 먼저 푼 문제. 테트리스 블록은 사각형이지만 `ㄹ`, `ㅢ`, `ㅎ`은 획 사이에 빈 공간이 있다. 글자 외곽 전체를 하나의 사각형으로 근사하면 `ㅡ` 위에 블록이 공중부양하고, `ㅢ`의 두 획 사이 빈틈이 막힌다.

**해결: 브라우저 캔버스에서 글자를 렌더링하고 알파 채널을 읽어 콜라이더를 자동 생성한다.**

`block-stacking/glyphs/glyphRaster.ts`:

1. 오프스크린 캔버스에 `700 200px "Noto Sans KR"`로 글자를 그린다.
2. `getImageData`로 픽셀을 읽고 8px 셀 단위로 알파 평균을 낸다. 커버리지 0.025 이상이면 점유 셀.
3. 점유 셀을 그리디 최대 사각형으로 병합한다(가로로 최대 확장 → 아래로 확장 반복).
4. 결과를 텍스처 중심 기준 좌표로 변환해 콜라이더 사각형 목록으로 반환한다.

`LetterBodyFactory`는 이 결과로 Matter compound body를 만든다. 폴백이 3단이다.

| 우선순위 | 방식 | 사용 시점 |
| --- | --- | --- |
| 1 | 래스터 기반 compound (파트 1~48개) | 브라우저 캔버스 사용 가능 |
| 2 | 획 템플릿 compound (`GLYPH_STROKE_TEMPLATES`, 자모 31자 수동 정의) | 캔버스 불가 (jsdom 테스트, 저사양) |
| 3 | 잉크 박스 단일 사각형 | 위 둘 다 실패 |

2단 폴백을 굳이 손으로 만든 이유는 합성모음이다. `ㅢ`, `ㅚ`, `ㅟ`는 래스터를 못 쓸 때도 획이 분리돼야 빈 공간이 한 덩어리 사각형으로 뭉치지 않는다. `H()`(가로획), `V()`(세로획), `D()`(대각획), `RING()`(사각링) 헬퍼로 `ㄹ` 5획, `ㅅ` 대각 2획(±π/3), `ㅎ` = 링 + 가로획 2개 식으로 정의했다.

**개발 도구도 같이 만들었다.** `/game/solo?collisionAudit=1`로 들어가면 글자별 콜라이더를 브라우저에서 직접 편집·저장하고 JSON으로 내보낼 수 있다(`GlyphCollisionAudit.tsx`, localStorage 오버라이드 → `glyphCollisionDefaults.json` → 런타임 래스터 순으로 우선). `glyphCollisionDefaults.json`에 자모 31자의 충돌체가 커밋돼 있고, 이를 코드 재빌드 없이 튜닝했다.

**주의해서 지킨 불변식:** 아트워크(외곽선 두께, 색)를 바꿔도 물리 치수는 바뀌지 않아야 한다. `createGlyphRaster()`는 별도 소스 캔버스에 `strokeText` + `fillText`로 그린 뒤 원래 잉크 박스 크기로 축소해 넣는다. 회귀 테스트 `"renders a strong contrasting outline without changing collider metrics"`가 이걸 고정한다.

물리 튜닝 값(`DEFAULT_PHYSICS_CONFIG`): `gravityY 0.34`, `maxFallSpeed 4.4`, `restitution 0.02`, `friction 0.34`, `rotationInertiaScale 0.68`. 정착 판정은 선형속도 0.07·각속도 0.01 이하를 900ms 연속 유지(`SettlementDetector`). 반발력을 낮게, 마찰은 중간으로 둬서 "불안정하게 놓인 블록은 굴러가지만 바닥 전체로 튀어 흩어지지는 않는" 느낌을 맞췄다.

프레임 스파이크 대응: `MatterPhysicsWorld`는 17~20ms짜리 늦은 프레임을 `ceil(delta/16.67)`개의 서브스텝으로 쪼개 실행한다. 한 번에 큰 delta로 적분하면 블록이 바닥을 통과하거나 접촉 후 위로 튀어오른다. 반대로 모든 바디가 sleeping이면 `Engine.update` 자체를 건너뛴다.

### 4.2 실시간 인식 파이프라인 — 주기 분리와 latest-only

한 화면에서 카메라 프레임 갱신, Hand 추론, Pose 추론, 스켈레톤 캔버스 렌더, React 갱신, Pixi/Matter 렌더, AI 서버 전송, WebRTC 인코딩이 동시에 돌아간다. 모든 프레임을 순서대로 처리하려 하면 느린 추론 하나 때문에 큐가 쌓이고, 화면은 최신 손을 보여주는데 AI는 3초 전 손을 처리하는 상태가 된다.

**해결 두 가지.**

**(1) 작업별 주기를 분리했다.** `RecognitionFrameScheduler`가 단일 rAF 루프에서 프레임을 발행하고 render/hand/pose 소비자에게 각자의 FPS 예산으로 팬아웃한다. 프로필로 묶어 기기별 전환이 가능하다.

| 프로필 | render | hand | pose | AI |
| --- | ---: | ---: | ---: | ---: |
| HIGH | 60 | 30 | 12 | 15 |
| BALANCED (기본) | 30 | 24 | 8 | 12 |
| LOW_POWER | 30 | 18 | 6 | 8 |

브라우저 주사율이 카메라 FPS보다 높을 때 같은 프레임을 다시 추론하지 않도록 `video.currentTime`을 비교해 중복을 차단한다.

**(2) 실시간 인식은 "모든 프레임 처리"가 아니라 "최신 상태 유지"가 목표다.** `LatestOnlyInferenceController`는 in-flight 요청 1개 + 대기 프레임 최신 1개만 유지한다. 새 프레임이 오면 오래된 대기 프레임을 버리고 드롭 카운터를 올린다. 응답은 5중 게이트로 검증한다 — 미지의 frameId / 다른 sessionId / 다른 activeHandId / 시퀀스 역행 / 나이 초과(750ms).

여기서 한 번 크게 틀렸다. 처음엔 응답 나이를 **비디오 캡처 시각**부터 계산했는데, MediaPipe가 늦게 끝나면 정상적인 AI 응답이 전부 stale로 판정돼 인식이 아예 안 됐다. 나이 계산 기준을 **랜드마크가 준비된 시점**으로 옮겨서 해결했다. 이 케이스는 테스트로 고정해 뒀다(`"starts response freshness when delayed landmarks are ready"`).

성능은 추측하지 않고 계측했다. `RecognitionPerformanceMonitor`가 1초 슬라이딩 윈도로 camera/render/hand/pose/AI FPS, 240샘플 링버퍼로 평균·p95 지연, `PerformanceObserver`로 메인 스레드 롱태스크를 수집한다. 스냅샷 필드가 17개다.

### 4.3 "내 손"만 입력으로 받기

발표 환경을 생각하면 카메라 앞에 사람이 여러 명 있을 수 있다. `hands[0]`을 쓰면 뒤에 있는 사람이 손을 들 때 입력 주체가 바뀐다. Pose 결과 배열의 index도 사람의 영구 ID가 아니라서 두 사람이 교차하면 사용자가 뒤바뀐다.

**얼굴 인식은 쓰지 않기로 먼저 정했다.** 게임에 필요하지 않은 생체정보 문제를 만들기 때문이다. 대신 두 단계로 풀었다.

**(1) 사람 추적 (`PersonTrackManager`)** — 5개 신호의 가중합으로 검출-트랙을 배정한다. 가중치는 위치 0.25, bounding box 0.2, 포즈 0.25, 움직임 0.15, 외형 0.15이고 검증 함수가 **합계 1**을 강제한다. 외형 descriptor는 어깨폭·골반폭·몸통 비율과 16bin 토르소 색 히스토그램으로, 옷 색 같은 휘발성 값만 메모리에 두고 서버로 보내지 않는다. 배정은 트랙별 "미배정" 분기를 포함한 백트래킹 완전탐색으로 비용을 최소화한다(최대 4명이라 탐색 공간이 작다).

**(2) 손 소유권 (`HandOwnerResolver`)** — 6개 신호를 가중합한다. 포즈 손목 거리 0.3, 팔 방향 0.15, 시간 연속성 0.2, handedness 0.1, segmentation 0.15, Active Player 경계 0.1. 거리 점수는 `exp(-normalizedDistance * 1.8)`로 감쇠시키고, 스케일은 어깨폭으로 정규화해 카메라 거리에 무관하게 만들었다.

설계에서 신경 쓴 지점 세 개:

- **애매하면 입력을 버린다.** 최고 점수가 0.62 미만이거나 1·2위 차이가 0.05 미만이면 차단한다. 차단 사유를 `NO_ACTIVE_PLAYER / POSE_ANCHOR_UNAVAILABLE / LOW_CONFIDENCE / AMBIGUOUS / SUDDEN_JUMP / TEMPORARILY_LOST`로 구분해 디버깅 가능하게 했다. 다른 사람의 손을 잘못 받는 것보다 내 입력 한 번을 놓치는 게 낫다는 판단.
- **handedness는 보조 신호로만 썼다.** 셀피 미러링 때문에 좌우가 뒤집히므로 공간상 손목 거리를 주 신호로 두고 handedness는 하한 0.5로 제한했다.
- **1인 플레이는 우회 경로를 뒀다.** Pose는 8FPS, Hand는 24FPS라서 엄격한 다중 인물 점수를 그대로 적용하면 Pose 앵커가 없는 프레임에서 정상 손이 깜빡였다. 검출된 사람이 1명 이하이고 후보 손이 1개면 다중 인물 스코어링을 건너뛴다. 실제 대부분의 플레이가 이 경로다.

일시 가림에는 유예를 주되(1.5초 후 재식별 모드, 5초 후 사용자 상실) 등록 사용자를 잃었다고 근처 다른 사람으로 자동 전환하지는 않는다. 사용자 등록은 한 손을 머리 위로 700ms 유지하는 제스처로 하고, 후보가 2명 이상이면 `AMBIGUOUS`로 두고 등록하지 않는다.

### 4.4 서버 없이 1:1 대전 구현 — 브라우저 호스트 권위

배포된 백엔드는 게임 진행을 중계하지 않는다. Room WebSocket은 참가 확인, presence, `GAME_STARTED`, WebRTC `SIGNAL` 릴레이만 하고 게임 상태 타입을 허용하지 않는다. 백엔드 소스를 수정할 수 없는 상황에서 실시간 1:1을 만들어야 했다.

**선택: WebRTC DataChannel로 게임을 진행하고, 방장 브라우저가 권위(host authority)를 갖는다.**

```
방 생성/참가/준비/시작 → REST + SSE (서버)
1회용 ticket 발급 → POST /auth/sse-ticket (Bearer)
SDP/ICE 교환 → Room native WebSocket (ticket query)
─────────── 여기까지만 서버 ───────────
게임 명령/권위 이벤트/복구 스냅샷 → WebRTC DataChannel `GAME_P2P_V1`
```

`P2pBattleTransport`가 방장 브라우저에서 권위 서버 역할을 한다. 게스트는 커맨드 11종을 보내고, 호스트가 검증해 이벤트 20종을 발행한다. 커맨드 발신자는 WebRTC peer ID로 식별하므로 위조할 수 없다.

**공유 목표 경쟁이 핵심 규칙이다.** 두 사람에게 같은 글자가 제시되고 먼저 인식한 사람의 보드에만 블록이 떨어진다. 각 브라우저가 인식 즉시 로컬 spawn을 하면 동시 인식 때 글자가 두 개 생기거나 두 보드가 어긋난다. 그래서:

- `SHARED_TARGET` → `CLAIM_SHARED_TARGET` → `SHARED_TARGET_CLAIMED` 메시지 흐름을 두고
- 호스트가 **첫 유효 claim만** 승인해 결과를 발행하고
- 공유 목표 모드에서는 로컬 낙관적 spawn을 비활성화하고
- 다음 목표는 claim이 해소된 뒤에만(`NEXT_TARGET_DELAY_MS 1150`) 발행해 목표 세대가 겹치지 않게 했다.

연출은 양쪽에서 같은 권위 claim을 렌더링하고 실제 spawn만 승자 보드에 적용한다. 그래서 이긴 사람이 아니어도 "상대가 먼저 가져갔다"는 피드백을 볼 수 있다.

**몰수패는 의도적으로 보수적으로 뒀다.** DataChannel/PeerConnection 상태만으로 자동 몰수패를 결정하면 네트워크 분할 시 양쪽이 모두 자신을 생존자로 판단한다. 상대 단절 후 10초 재접속 유예를 주고, 유예 안에 스냅샷이나 resume 이벤트가 오면 계속 진행한다. 유예가 끝나면 남은 참가자가 `RECONNECT_TIMEOUT` 사유의 승자가 된다. 서버가 인증된 `PEER_DISCONNECTED`를 권위 근거로 제공하기 전까지 그 이상은 하지 않기로 정했다. 방장이 영구 이탈해도 권위를 이전하지 않는다 — 남은 참가자가 독자적으로 다음 목표를 만들면 split-brain이 생기기 때문.

### 4.5 두 보드 동기화 — 보간·외삽·무결성

상대 보드는 물리 시뮬레이션을 두 번 돌리지 않고, 권위 변환값을 받아 재생한다. 설정은 `InterpolationConfig`에 모았다.

| 값 | 설정 | 이유 |
| --- | --- | --- |
| 변환 전송 | 30Hz | 이동 중인 바디만 전송 |
| 렌더 지연 | 140ms | 이 시점을 타깃으로 두 샘플 사이를 보간 |
| 최대 외삽 | 70ms | 패킷이 늦으면 마지막 FALLING 변환을 등속 예측. 그 이상은 권위 상태와 멀어지므로 금지 |
| 전체 스냅샷 | 5초 | 단, 정착·제거·구조 변경 시 즉시 전송 |
| 스냅 임계 | 거리 2 / 각도 π | 넘으면 보간 대신 순간이동 |
| 백프레셔 | bufferedAmount 12000 | 넘으면 그 프레임 전송을 건너뜀 |

세부적으로 챙긴 것:

- **좌표를 정규화해 전송한다.** `x/width`, `y/height`로 보내고 `[-0.25, 1.25]`로 클램프해서 두 사람의 화면 해상도가 달라도 같은 위치가 되게 했다.
- **각도는 최단 경로로 보간한다.** `atan2(sin, cos)`로 -π~π 경계에서 한 바퀴 도는 문제를 막았다.
- **정착 바디만 권위 상태로 고정한다.** 이동 중인 바디는 로컬 시뮬레이션을 유지한다. 그렇지 않으면 네트워크 지터가 낙하 애니메이션 지터로 그대로 보인다.
- **무결성 검사.** 보드 상태를 id 정렬 후 좌표를 양자화해 FNV-1a 32bit 체크섬으로 만든다. 불일치하면 스냅샷을 폐기하고 무결성 실패를 기록한다. 좌표 양자화는 JSON 포맷 차이로 인한 오탐을 막기 위한 것.
- **제거된 글자 툼스톤 128개**를 유지해 늦게 도착한 패킷이 이미 사라진 블록을 부활시키지 못하게 했다. 상한을 둔 이유는 4.7에.
- **클럭 오프셋 보정.** 첫 패킷의 `receivedAt - sentAt`을 송신자 시계 오프셋으로 고정해 이후 모든 `sentAt`을 로컬 타임라인으로 변환한다.

### 4.6 새로고침·이탈 복구

가장 많은 시간을 쓴 부분이다. 실사용에서 발생한 증상이 서로 얽혀 있었다.

| 증상 | 원인 | 조치 |
| --- | --- | --- |
| 새로고침 후 Room WebSocket 403 반복 | `sessionStorage`의 방 상태를 서버 확인 없이 복원. 1회용 ticket을 재사용 | mount에서 멱등 `join(roomCode)`으로 서버 권위 상태와 새 ticket을 다시 받는다. 재연결마다 새 ticket 발급 |
| 새로고침한 쪽 보드가 빈 상태 | RTC 일시 단절이 `mediaReady=false`로 전파되며 controller cleanup이 물리 보드를 dispose | 최초 RTC 성공 뒤 `mediaReady`를 latch해 controller를 유지 |
| 새로고침 안 한 쪽 보드가 되감김 | 복구 스냅샷을 양쪽에 무조건 적용 | `restoreForPlayerId`로 요청한 플레이어만 자기 스냅샷을 적용. `BattleController`는 자기 보드 권위 스냅샷이 오기 전까지 `PLAYING`으로 가지 않는다 |
| 카운트다운이 처음부터 재시작 | 재연결과 신규 매치를 구분하지 않음 | `MATCH_STARTED.resume` 플래그 + transport의 `hasConnected` 상태로 구분 |
| 나가기에서 leave 403 | 서버가 이미 참가자를 제거한 뒤 다시 leave 호출 | 세션 없는 play route는 remote leave를 생략. 이미 종료된 응답에도 로컬 정리는 계속 |
| 뒤로가기로 화면만 이동 | history 이동과 버튼 퇴장이 다른 cleanup 경로 | `popstate`를 동일 cleanup 함수에 연결 |
| 뒤로가기 후 "이미 참여 중인 방" | 대기실 mount의 join과 leave가 경쟁 | gateway의 create/join/leave를 단일 Promise 큐로 직렬화. leave 시작 후 도착한 join 응답 무시 |

추가로 챙긴 것:

- **호스트 권위 상태를 localStorage에 직렬화**했다. 방장이 새로고침해도 진행 중인 매치의 sequence, 목표, 심볼 백, 보드 상태를 복원한다.
- 방 세션을 sessionStorage와 localStorage에 동시 기록하고 `storage` 이벤트를 구독해 **한 사용자가 두 탭에서 호스트가 되는 것**을 막았다.
- 재입장 재시도 백오프를 `[0, 350, 700, 1200, 1700, 2200, 2700]ms`로 두고, 409/5xx/네트워크 오류만 재시도하고 401/403/404/410은 즉시 중단해 ticket을 낭비하지 않게 했다.
- 새로고침 감지는 추측하지 않고 `performance.getEntriesByType("navigation")[0].type === "reload"`로 판정한다.
- `BattleExitCoordinator`가 퇴장 순서를 보장한다: 서버 leave → 미디어 세션 종료 → 카메라 정지 → 세션 삭제 → 화면 이동. 원격 실패해도 로컬 정리는 끝까지 수행한다.

React StrictMode의 setup → cleanup → setup 프로브도 문제였다. 이전 connect가 늦게 완료되며 새 연결을 덮어쓰는 현상을 `connectionGeneration` 카운터로 무효화하고, Provider의 자원 dispose는 `queueMicrotask`로 한 틱 미뤄 프로브에서는 실제로 닫지 않게 했다.

### 4.7 장시간 플레이의 누적 렉 제거

10분 넘게 플레이하면 프레임이 점점 떨어졌다. 글자가 쌓일수록 비용이 선형 증가하는 지점이 다섯 곳 있었다.

| 문제 | 조치 |
| --- | --- |
| DOM 글자마다 보이지 않는 Pixi `LetterView`를 중복 생성 | DOM 렌더 모드에서는 Pixi 뷰를 만들지 않는다 |
| 모든 글자에 영구 `will-change` → GPU 합성 레이어 점유 | 낙하 중에만 적용하고 정착 즉시 `auto`로 되돌려 레이어 반환 |
| 정착해 움직이지 않는 보드도 매 프레임 전체 순회 | 완전 정착 시 100ms(10FPS)로 다운시프트, 새 낙하가 시작되면 즉시 복귀 |
| 제거 이력·P2P 명령 이력이 무한 증가 | 툼스톤 128개, 명령 ID 256개로 상한 |
| 발행기가 매 갱신마다 임시 배열·Set 생성 | 구성 변화가 있을 때만 재구성 |

DOM 글자에 `contain: layout style paint`를 적용해 글자 갱신이 게임판 밖 레이아웃·페인트로 전파되지 않게 했다.

**캐시는 일부러 비우지 않았다.** "메모리가 증가하니 주기적으로 캐시를 비우자"는 접근을 시도했다가 되돌렸다. 글자 마스크·윤곽 캐시는 제한된 지문자 집합을 재사용하므로 비우면 래스터 재생성으로 순간 프레임 저하가 반복된다. 실제로 상한 없이 증가하던 **이력만** 제한하고 재사용 가치가 있는 정적 캐시는 유지하는 게 맞았다.

검증은 회귀 테스트와 수동 점검을 같이 했다. "정착 보드 60프레임 연속 호출 시 전체 순회가 약 10회로 제한되는지" 테스트를 두고, DevTools Performance Monitor에서 JS heap·DOM node·GPU memory가 입력 횟수와 함께 무제한 증가하지 않는지 10분 플레이로 확인했다.

### 4.8 인식 신뢰성을 계약 파일로 게이팅

AI 모델을 평가해 보니 `ㅠ`는 표본 90개 전부가 `ㅅ`으로 분류됐고 `ㅅ`의 precision도 47%였다. threshold를 낮춰서 해결할 수 있는 문제가 아니었다.

**모델을 기다리는 대신, 검증되지 않은 글자를 게임에서 배제하는 계약을 만들었다.** `game-contracts/recognition/readiness.json`이 유일한 원천이고 서버 threshold, 프런트 출제 범위, 계약 테스트가 모두 이 파일을 읽는다.

- `modelVersion: jamo-31-v1`, 평가 표본 2790개
- 기준: 확정률 0.85 이상, 경쟁 precision 0.90 이상
- 31개 자모 중 **24개만 `competitiveEligible`**. 제외 7개는 사유를 명시했다(`ㅅ`/`ㅠ` 혼동, `ㅕ`/`ㅖ` 혼동, `ㅏ`/`ㅓ`/`ㅔ` 확정률 미달)

배틀 심볼 풀과 방 옵션(`자음`/`모음`/`기초 혼합`)은 이 필터를 통과한 글자만 사용한다. 시드 100회로 "제외된 심볼이 카드 드로우나 spawn에 절대 등장하지 않는지" 검증하는 통합 테스트를 뒀다.

솔직하게 남긴 것도 있다. 평가에 사용한 데이터가 세션 간 랜덤 분할이라 `trainingIndependent: false`이고, JSON에 "잠정 안전장치이지 독립 모델 인증이 아니다"라는 경고를 넣어 뒀다. 수치를 실제보다 좋게 보이게 쓰지 않는 것이 다음 사람에게 더 유용하다고 판단했다.

**확정 권위도 서버에서 프런트로 옮겼다.** AI 서버는 prediction과 top candidates만 주고, 게임 입력 확정과 잠금은 프런트의 `ContinuousSignDecoder`가 한다(`confirmationAuthority: FRONTEND_TEMPORAL_DECODER`). 손을 계속 들고 있으면 공격이 반복되는 문제를 서버 cooldown으로 숨기지 않고, 6상태 머신과 해제 조건 3개로 풀었다.

- 확정: 후보 창 4프레임 중 2표 이상 **그리고** 움직임이 100ms 이상 안정
- 해제 ①: 확정 포즈와의 거리 0.12 초과가 100ms 유지
- 해제 ②: 손 소실 80ms
- 해제 ③: 다른 심볼 2표

심볼별 confidence 임계값은 readiness의 실측값을 그대로 쓴다. 전체 임계를 낮추는 대신 글자별로 캘리브레이션했다.

### 4.9 카메라 단일 소유

대기방, 경기 화면, MediaPipe, 로컬 프리뷰, WebRTC가 각자 `getUserMedia()`를 부르면 권한 팝업이 반복되고, 한 컴포넌트가 unmount되며 다른 기능이 쓰는 track을 종료한다. 실제로 "RTC peer를 닫았더니 MediaPipe 카메라가 함께 꺼지는" 버그가 있었다.

`SharedGameCameraSession`을 카메라 track의 **유일한 소유자**로 만들었다.

- 동시에 여러 곳에서 `start()`해도 in-flight promise와 살아 있는 stream을 공유해 `getUserMedia`는 한 번만 호출된다.
- 로컬 프리뷰, MediaPipe, 랜드마크 생성, WebRTC peer 최대 3개가 같은 video track을 공유한다.
- 소비자는 `srcObject`와 sender 연결만 정리하고 원본 track을 stop하지 않는다.
- `generation` 카운터로, 시작 도중 화면을 이탈했으면 늦게 열린 stream을 즉시 종료한다.
- 라우트 감시(`GameCameraRouteLifecycle`)로 게임 라우트를 벗어나면 자동 정지한다.

기본 제약은 640×360, 15FPS ideal / 20FPS max, audio false. 해상도를 낮게 고정한 건 MediaPipe 추론과 WebRTC 인코딩이 같은 CPU를 쓰기 때문이다.

WebRTC mesh는 4인 상한(1인당 peer 3개)이고, offer/answer 역할은 `localUserId.localeCompare(remoteUserId) < 0`으로 결정적으로 배분해 양쪽이 동시에 offer를 만드는 경합을 없앴다. remote description 설정 전에 도착한 ICE candidate는 버퍼링 후 flush한다.

---

## 5. 품질과 테스트

**테스트 141개 파일** (비테스트 소스 373개 대비 약 1:2.6). 실시간·비동기 코드를 테스트 가능하게 만들기 위해 설계 단계에서 의존성을 전부 주입 가능하게 했다 — `now`, `setTimer`/`clearTimer`, `requestFrame`/`cancelFrame`, `createId`, `createWebSocket`, `createEventSource`, `getUserMedia`, `fetcher`. 그래서 **실제 시간을 기다리지 않고** 10초 재접속 유예나 900ms 정착 판정을 검증할 수 있다.

계층별로 나눴다.

| 계층 | 예시 | 검증 내용 |
| --- | --- | --- |
| 도메인 단위 | `MatterPhysicsWorld.test.ts` (14 케이스) | 늦은 프레임 분할, 바닥 접촉 후 튀어오르지 않음, 리사이즈 시 정착 블록 정렬 유지, 하단 제거 시 상단 낙하, 합성모음 빈 공간 배제 |
| | `ContinuousSignDecoder.test.ts` (12) | 같은 포즈 유지 시 연타 방지, 손을 떼지 않고 다른 글자로 전환, A-B-C 빠른 연속 입력, 지터 예측은 확정하지 않음 |
| | `RemoteTransformBuffer.test.ts` (8) | 최단 각도 보간, 패킷 지연 시 짧은 외삽, 제거 후 변환 무시, 버퍼·툼스톤 상한 |
| 어댑터·파서 | `RoomRealtimeSocket.test.ts` (7) | 새 ticket으로만 연결, `SIGNAL`만 송신, 거부된 ticket은 재시도하지 않음, 핸드셰이크 성공 후 stale 에러 미보고 |
| | `MeshWebRtcMediaSession.test.ts` (16) | peer 3개 상한, offer 결정성, 버퍼된 ICE 적용, mesh 종료 시 공유 track 미정지 |
| 권위 로직 | `BattleController.test.ts` (35, 최대) | 서버 `startAt` 기준 시작, 자기 권위 보드 도착 후에만 복구, 모호한 전송 끊김에서 승자를 만들지 않음, 유예 초과 시 남은 사람 승리 |
| | `P2pBattleTransport.test.ts` (11) | 목표를 먼저 claim한 한 명에게만 낙하, 재접속 플레이어 복구, 3연속 성공 시 상대 블록 이전 |
| 통합 | `BattleBotPracticeRuntime.integration.test.ts` | 물리 + 렌더 + 전송 + 컨트롤러 전 계층을 브라우저 런타임에서 |
| | `LocalBotPracticeReadiness.integration.test.ts` | 시드 100회로 제외 심볼이 절대 등장하지 않음 |
| React | `HandCamera.sharedStream.test.tsx` 등 19개 | 카메라 단일 소유와 정리 |

테스트를 "커버리지 채우기"가 아니라 **한 번 겪은 버그를 다시 겪지 않기 위한 장치**로 썼다. 위 케이스 이름 대부분이 실제로 실사용에서 발견한 증상이다.

---

## 6. 협업

### 팀 구성과 경계

6인 팀에서 역할별로 통합 브랜치를 나눴다.

| 브랜치 | 담당 | 내용 |
| --- | --- | --- |
| `frontend` | 3인 (본인 포함) | 게임 / 학습·사전·오답노트 / 홈·프로필·UI |
| `backend` | 1인 | Spring, REST·SSE·WebSocket, 랭킹 |
| `ai` | 2인 | 지문자·단어 인식 모델, 추론 서버 |
| `infra` | 1인 | EC2, Nginx HTTPS, coturn(TURN), GitLab CI/CD, Docker |

작업 브랜치는 `feature/<Jira 이슈키>-<설명>` 규칙을 썼다(`feature/FE-873-detail-card-shared-layout`, `feature/Infra-587-coturn-server`, `feature/AI-006-image-preprocessing`). Jira는 에픽 → 스토리 → 작업 계층으로 도메인 접두어(`GAME-`, `FE-`, `AI-`, `Infra-`, `TEST-`, `USER-`)를 붙여 관리했다. 게임 파트는 `GAME-01`부터 `GAME-10`까지 10개 에픽으로 나눴다 — 진입·공통 실행 환경, 블록 싱글, 블록 1:1, 참가자 영상, 턴 배틀, 인식 안정성, UX·밸런스, 실제 환경 통합 검증, 협동, 배포·최종 검수.

### 같은 저장소를 쓰면서 충돌을 줄인 방법

프론트 3인이 한 저장소를 쓰는 게 가장 큰 리스크였다. 병합 단위를 먼저 문서로 합의했다.

- 게임 전용 영역: `frontend/src/game/`, `public/guides/`, `public/mediapipe/`, `scripts/setup-mediapipe-assets.mjs`
- 공유 파일(PR에서 별도 확인): `package.json`, lockfile, `App.tsx`, `main.tsx`, `styles.css`, `vite.config.ts`, `tsconfig*.json`

브라우저 라우터는 `main.tsx`가 한 번만 생성하고, `App.tsx`는 `/game/*` 한 지점에서 `GameModule`을 마운트한다. 게임 내부 라우팅은 `GameModuleRoutes`가 상대 경로만 소유해서, 다른 사람이 홈·학습·프로필 라우트를 추가해도 게임 화면 파일과 충돌하지 않는다. 개발·테스트 환경에서도 중첩 라우터를 만들지 않고 호스트 라우터를 주입하는 규칙을 지켰다.

### 백엔드와의 계약 협의

**"백엔드 소스는 수정하지 않는다"를 전제로 두고 프런트에서 흡수했다.** 백엔드 담당이 1명이고 다른 도메인 작업이 많았기 때문에, 게임이 백엔드 변경을 기다리면 양쪽이 다 막힌다.

- 배포 Swagger를 직접 읽고 계약 경계를 문서로 고정했다. 결과 body가 `{winnerUserId}`로 바뀐 것도 이 확인 과정에서 발견해, 배포 전에 프런트를 맞췄다.
- SSE에 Bearer 헤더를 붙일 수 없다는 브라우저 제약(`EventSource`)을 확인하고 1회용 ticket query 방식으로 정리했다.
- 인가되지 않은 `POST /game/solo/sessions`가 401을 반환하는 문제는 백엔드 계약을 요구하는 대신, 로컬 저장으로 플레이를 계속 가능하게 만들고 `VITE_ENABLE_REMOTE_SOLO_GAME_API` 플래그로 나중에 전환할 수 있게 남겼다.
- 반대로 **프런트가 임의로 결정하면 안 되는 것은 명시적으로 요청했다.** 방 제목·방장 닉네임·출제 범위는 브라우저 저장으로 보완하되 "다른 사용자에게 공유되는 권위 데이터가 아니다"라고 문서에 못 박고, create/response/SSE 계약 확장을 백엔드 과제로 남겼다. 10초 이후 자동 몰수패도 서버가 인증된 `PEER_DISCONNECTED`를 제공하기 전까지 활성화하지 않았다.

### AI 팀과의 계약

`game-contracts/`를 프런트와 AI가 공유하는 계약 폴더로 썼다. 현재 이 폴더에 실제로 있는 파일은 `recognition/readiness.json` 하나다. AI가 평가 결과를 채우고 프런트가 출제 범위와 심볼별 임계값으로 읽는다.

밸런스 값도 같은 방식으로 계약화하려 했으나 끝까지 가지 못했다. `glyph-battle/core/LineRaceBalance.ts`의 주석은 `game-contracts/balance/line-race-obstacles.json`의 타입 미러라고 명시하지만 **그 JSON은 저장소에 없다.** drift 테스트(`LineRaceBalance.test.ts`)도 JSON을 import하지 않고 프런트 상수끼리만 비교한다. 계약 파일 없이 주석만 남은 상태이므로, 밸런스는 readiness처럼 단일 원천이 확보되지 않았다.

역할 분담을 이렇게 정리했다: **AI는 prediction과 후보만, 게임 입력 확정은 프런트.** 초기에는 서버가 cooldown으로 연타를 막는 방식을 논의했지만, 인식률 문제를 서버 지연으로 숨기는 구조가 되고 게임 반응성도 나빠져서 경계를 옮겼다. 대신 프런트는 모델에 없는 글자를 만들어내지 않고, 개인정보 경계(랜드마크만 전송, 영상·외형 descriptor·얼굴 정보 미전송)를 문서로 고정했다.

### 인프라 팀과의 협업

WebRTC는 프런트만으로 완성되지 않는다. 필요한 조건을 목록으로 만들어 전달했다 — Nginx의 `/api/` 프록시와 WebSocket `Upgrade` 헤더, SSE 버퍼링 비활성화(`X-Accel-Buffering: no`), coturn의 TCP/UDP 3478·5349와 UDP 49160-49200 포트, TLS/WSS mixed content 없음, CORS 허용 목록에 Vercel Origin 등록(끝의 `/` 없이, `*` 금지). 서로 다른 네트워크의 두 브라우저에서 TURN relay candidate로 연결되는지를 공동 검증 항목으로 뒀다.

### 문서화

작업 기록을 코드와 같은 저장소에 뒀다. 마지막에는 날짜별로 늘어난 트러블슈팅 문서 7개와 인수인계 스냅샷 여러 개를 정리해서, 기준 문서 3개(제품 명세 / 1:1 현재 동작 / 백엔드 계약)와 통합 트러블슈팅 1개, 기술 참조 14개, 문서 색인 1개로 재구성했다. 배포 문서 2개가 서로 다른 빌드 설정을 말하고 있던 것도 하나로 합쳤다.

문서에서 지킨 원칙은 **"내가 잘못 판단한 부분"을 같이 적는 것**이었다. 예를 들어 AI 응답 나이를 캡처 시각부터 계산한 실수, 캐시를 주기적으로 비우려다 되돌린 판단, 라인레이스 전제로 만든 기능이 턴 배틀과 맞지 않았던 기록을 남겼다. 원인만 적힌 문서보다 "이 접근은 실패했다"가 적힌 문서가 다음 사람의 시간을 더 아낀다고 봤다.

---

## 7. 남은 과제

- **몰수패 정책**: 서버가 인증된 peer 연결 상태를 권위 근거로 제공하면 10초 이후 자동 몰수패를 켤 수 있다.
- **방 메타데이터**: 백엔드 create/response/SSE에 `title`, `hostNickname`, `symbolRange`, `createdAt`이 영속화되면 브라우저 보완 로직을 제거할 수 있다.
- **모델 재평가**: 현재 readiness는 세션 간 랜덤 분할 결과다. 사용자 분리 validation으로 다시 평가해야 제외된 7개 글자를 되살릴 수 있다.
- **성능 실측**: Hand/Pose/AI p95 지연은 기기·브라우저에 따라 달라진다. 자동 테스트 수치를 실제 성능으로 기록하지 않았고, 다양한 기기의 측정치가 더 필요하다.

---

## 8. 정리

기술적으로 가장 의미 있었던 판단 세 가지.

1. **제약을 우회 대상이 아니라 설계 입력으로 다뤘다.** 백엔드가 게임을 중계하지 않는다는 제약에서 브라우저 호스트 권위 구조가 나왔고, 모델 인식률이 불완전하다는 제약에서 readiness 계약 게이팅이 나왔다. 둘 다 남을 기다리지 않고 진행할 수 있게 만든 구조다.

2. **경계를 인터페이스로 만들어 두면 계약이 바뀌어도 규칙 코드를 안 고친다.** 실제로 Swagger 계약 변경, 솔로 API 미지원, dev/운영 환경 차이를 모두 어댑터 교체로 흡수했다.

3. **애매할 때 조용히 추측하지 않게 만들었다.** 손 소유권이 애매하면 입력을 차단하고, 상태 머신은 정의되지 않은 전이에서 예외를 던지고, 체크섬이 어긋나면 스냅샷을 폐기하고, 네트워크가 분할되면 승자를 만들지 않는다. 실시간 시스템에서 잘못된 값을 넘기는 비용이 한 프레임을 놓치는 비용보다 훨씬 크다는 게 이 프로젝트에서 가장 크게 배운 것이다.
