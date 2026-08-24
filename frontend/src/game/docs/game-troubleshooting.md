# 게임 트러블슈팅 통합 기록

마지막 정리: 2026-08-03

이 문서는 `frontend/src/game`에서 실제로 겪고 해결한 문제의 단일 기록이다. 이전에는 날짜별 트러블슈팅 문서 7개로 흩어져 있었고 같은 원인이 여러 파일에 중복돼 있었다. 새 트러블슈팅 문서를 따로 만들지 말고 해당 주제 절에 추가한다.

- 현재 동작과 서버 계약 경계는 `battle-ui-and-rooms.md`와 `backend-contracts.md`를 우선한다.
- 제품 기준은 `game-spec.md`, 모듈 경계는 `architecture.md`, 엔진 세부는 `game-engine.md`, 인식은 `recognition.md`를 본다.
- 라인 레이스, STOMP 기반 Match, 프로토타입 저장소 시절의 기록은 현재 코드와 맞지 않으므로 옮기지 않았다.

## 목차

1. [인식과 카메라](#1-인식과-카메라)
2. [솔로 프링글수](#2-솔로-프링글수)
3. [1:1 방 생명주기와 재접속](#3-11-방-생명주기와-재접속)
4. [1:1 누적 성능](#4-11-누적-성능)
5. [화면 배율과 UI](#5-화면-배율과-ui)
6. [지문자 턴 배틀](#6-지문자-턴-배틀)
7. [결과 저장 계약](#7-결과-저장-계약)
8. [로컬 검증 환경](#8-로컬-검증-환경)
9. [재발 시 확인 순서](#9-재발-시-확인-순서)

---

## 1. 인식과 카메라

### 1.1 MediaPipe 렌더링과 추론이 메인 스레드를 함께 점유해 버벅임

**증상.** 카메라 프레임 갱신, Hand/Pose 추론, 스켈레톤 Canvas 렌더링, React 갱신, Pixi/Matter 렌더링, AI 랜드마크 전송, WebRTC 인코딩이 한 화면에서 동시에 메인 스레드를 사용했다. 느린 추론 하나 때문에 오래된 프레임이 쌓이고, 화면은 최신 손을 보여주는데 AI는 과거 손을 처리했다.

**원인.** 작업 주기와 backpressure가 분리되지 않았다. 렌더링은 60FPS가 유리하지만 Hand, Pose, AI를 같은 주기로 실행할 필요가 없다. 실시간 인식에서는 모든 과거 프레임 처리보다 최신 상태 유지가 중요하다.

**조치.**

- `RecognitionFrameScheduler`에서 Render/Hand/Pose 주기를 분리한다. 기본 프로필 `BALANCED`는 Render 30, Hand 24, Pose 8, AI 12FPS이고 `HIGH`는 60/30/12/15, `LOW_POWER`는 30/18/6/8이다(`RecognitionPerformanceProfiles.ts`). `RecognitionRateConfig`의 `RESPONSIVE_GAMEPLAY`는 Render 20, Hand 24, Pose 4, AI 18로 두는데, 24Hz latest-only가 과부하된 30~60Hz 큐보다 종단 지연이 낮기 때문이다.
- Hand/Pose와 AI 요청 모두 in-flight 하나 + 최신 pending 하나만 유지하는 latest-only 방식을 쓴다. 새 프레임이 오면 오래된 pending을 교체하고 drop 수치를 올린다.
- AI 응답에 frameId, session, sequence, active hand를 연결해 오래된 세션이나 늦게 도착한 응답을 버린다.
- AI age budget(`maximumPredictionAgeMs`, 기본 750ms)은 원본 비디오 캡처 시각이 아니라 랜드마크가 준비된 시점부터 계산한다. 그러지 않으면 MediaPipe 지연 때문에 정상 응답이 stale로 오판된다.
- Worker에서 Hand/Pose를 실행하고 초기화·실행 실패 시 같은 설정의 메인 스레드 구현으로 폴백한다.
- Landmark smoothing을 용도별로 분리한다. 움직임 분석은 raw, AI는 약한 smoothing, Canvas 표시는 강한 smoothing.
- 성능 패널의 React 갱신은 초당 최대 4회로 제한한다.
- 같은 `video.currentTime` 프레임을 Hand/Pose 추론에 다시 제출하지 않는다.

**관련 구현.** `RecognitionFrameScheduler.ts`, `LatestFrameBuffer.ts`, `LatestOnlyInferenceController.ts`, `RecognitionPerformanceMonitor.ts`, `AdaptiveHandLandmarker.ts`, `HandLandmarkerWorkerClient.ts`, `RecognitionPerformanceProfiles.ts`, `recognition/vision/*`

**남은 경계.** CPU 사용률과 Hand/Pose/AI P95 지연은 기기·브라우저에 따라 달라진다. 자동 테스트 수치를 실제 성능 수치로 기록하지 않는다. 카메라+AI, 1:1, 4인 시나리오는 개발 성능 패널로 별도 측정한다.

### 1.2 주변 사람의 손이 입력으로 들어옴

**증상.** Hand Landmarker의 첫 번째 손을 그대로 쓰면 다른 사람이 카메라에 가까이 오거나 손을 크게 들 때 입력 주체가 바뀐다. Pose 결과 배열 index는 사람의 영구 ID가 아니어서 두 사람이 교차하거나 confidence 순서가 바뀌면 사용자가 뒤바뀐다.

**쓰지 않은 접근.** `hands[0]`/`poses[0]` 고정, 화면 중앙 우선, 얼굴 인식 식별, handedness 단독 판정, 사용자를 잃었을 때 가장 가까운 사람으로 자동 전환. 교차·가림에 약하거나 게임에 필요하지 않은 생체정보 문제를 만든다.

**조치(구현했으나 게임에서는 비활성).** 아래 구조를 다 만든 뒤 게임 모드에서는 껐다.
`88a01df`에서 `HandCamera`의 `userRegistrationEnabled = false`와
`DEFAULT_GAME_RECOGNITION_OPTIONS`의 `requireActivePlayerLock: false`로 UI·세션 두
층에서 함께 비활성화했고, 지금은 디버그 도구(`/game/recognition/crowd-test`)로만
쓴다. 게임 입력은 감지된 첫 손을 그대로 받는다(`safetyMode: "LEGACY_HAND_ONLY"`).
따라서 **이 증상 자체는 아직 열려 있다.** 아래는 되살릴 때 쓰는 구현 기록이다.

- 경기 전 한쪽 손을 머리 위로 일정 시간 유지해 Active Player를 등록한다.
- `PersonTrackManager`가 위치, bounding box, Pose 특징, 움직임, 몸통 appearance descriptor를 함께 사용해 내부 Track ID를 유지한다.
- 상태를 `UNREGISTERED`, `REGISTERING`, `LOCKED`, `TEMPORARILY_LOST`, `REIDENTIFYING`, `AMBIGUOUS`, `USER_LOST`로 분리한다.
- 일시 가림에는 grace time을 주되 등록 사용자를 잃었다고 다른 사람으로 자동 전환하지 않는다.
- `HandOwnerResolver`가 Pose 손목 거리, 팔 방향, 이전 손과의 시간 연속성, handedness, 선택적 segmentation, Active Player bounds를 가중 합산한다.
- 최고 후보 점수가 부족하거나 1·2위 차이가 작으면 입력을 차단한다. 잘못된 사람의 손을 고르는 것보다 입력 한 번을 놓치는 편이 안전하다.
- 미러링 화면과 MediaPipe 원본 좌표를 구분한다. 공간상 손목 거리를 주 신호로, handedness는 보조 신호로만 쓴다.
- 1인·1손 상황에는 fast path를 둔다. 느린 Pose 주기 때문에 정상 손이 깜빡이던 문제를 피하고, 경쟁 후보가 있을 때만 엄격한 다중 사용자 판정을 적용한다.
- Active Player나 Active Hand 세션이 바뀌면 이전 AI 응답을 무효화한다.

**개인정보 경계.** 얼굴 검출·embedding·crop을 사용하지 않는다. appearance descriptor는 옷 색상·Pose 비율 같은 휘발성 값이며 메모리에만 둔다. descriptor, segmentation, 영상은 AI 서버나 백엔드로 보내지 않는다. AI 서버에는 최종 선택된 손 랜드마크만 보낸다.

**관련 구현.** `active-player/PersonTrackManager.ts`, `ActivePlayerSession.ts`, `ActivePlayerRegistrationController.ts`, `HandOwnerResolver.ts`, `ActiveHandTracker.ts`, `PersonReIdentificationAdapter.ts`

**남은 경계.** 실제 여러 사람이 교차·가리는 장면은 조명, 옷 색상, 카메라 화각의 영향을 크게 받는다. 합성 좌표 테스트는 통과했지만 실제 군중 테스트의 ID switch 횟수는 측정하지 못했다. 그 검증 없이 켜면 정상 입력까지 차단할 수 있어 게임에서는 끈 상태로 뒀다. 다시 켜려면 `userRegistrationEnabled`와 `requireActivePlayerLock`을 함께 되살리고, 등록 UX와 Pose 추적 CPU 비용을 실기에서 재야 한다.

### 1.3 카메라 카드에 보이지 않는 손이 인식됨

**증상.** 원본 웹캠 영상에는 손이 있지만 `object-fit`으로 잘린 카메라 카드에는 보이지 않는데도 관절선과 인식 결과가 갱신됐다.

**원인.** MediaPipe 좌표를 전체 원본 영상 기준으로 투영하고, 실제 화면에 노출되는 crop 범위를 판정하지 않았다.

**조치.** 카메라 컨테이너와 원본 영상 비율로 보이는 source crop을 계산한다. 손의 21개 랜드마크가 모두 crop 내부에 있을 때만 캔버스 렌더링과 AI 판정으로 전달한다.

### 1.4 화면마다 카메라를 다시 열던 문제

**증상.** 대기방, 경기 화면, MediaPipe, 로컬 영상, WebRTC가 각각 `getUserMedia()`를 호출하거나 각자 track을 종료해 권한·초기화 반복, 중복 점유, 한 컴포넌트 unmount로 다른 기능의 track이 종료되는 문제가 생겼다.

**조치.** `SharedGameCameraSession`을 카메라 track의 유일한 소유자로 둔다.

- 기본 제약은 640×360, 15FPS ideal, 20FPS max, audio false.
- 동시에 여러 곳에서 `start()`해도 진행 중인 Promise와 살아 있는 stream을 재사용한다.
- 로컬 preview, MediaPipe, 랜드마크 생성, 최대 3개 WebRTC peer가 같은 video track을 공유한다.
- 페이지 컴포넌트와 peer slot은 `srcObject`와 sender 연결만 정리하고 원본 track을 stop하지 않는다.
- 방 이탈 또는 GameModule 종료 시 peer와 signaling을 먼저 정리한 뒤 Shared Camera만 track을 종료한다.
- 시작 도중 화면을 이탈하면 generation을 비교해 늦게 열린 stream을 즉시 종료한다.

### 1.5 같은 지문자를 계속 들고 있으면 입력이 반복됨

**원인.** 프레임마다 같은 글자를 높은 confidence로 예측했다고 매번 입력으로 바꾸면 손을 유지하는 동안 공격이 반복된다. 반대로 안정화 시간을 길게 잡으면 반응이 늦다.

**조치.**

- AI 서버는 prediction과 top candidates만 제공하고 게임 Command 확정과 lock은 프런트의 연속 지문자 Decoder가 담당한다.
- 후보 window, confidence, 연속 안정성, 손 움직임을 함께 사용해 한 번만 확정한다.
- 확정 후 같은 자세를 유지해도 다시 입력하지 않는다.
- 손이 사라지거나 자세 거리가 충분히 변한 상태가 일정 시간 유지돼야 `RELEASED`로 전환한다.
- 목표가 바뀌거나 다른 문자가 확정되면 이전 입력 잠금을 즉시 해제한다. 같은 문자의 중복 확정만 차단한다.
- 응답이 늦게 도착해도 session/sequence/active hand가 다르면 무시한다.

인식률 문제를 서버 cooldown으로 숨기지 않고 손 해제와 temporal 상태로 해결한다.

### 1.6 AI 서버가 자주 끊겨 보이고 일부 지문자가 인식되지 않음

**확인 결과.**

- 실행 중인 AI 서버에 20회 연속 WebSocket 연결을 시도해 모두 성공했다. 서버가 지속적으로 끊기는 현상은 재현되지 않았다.
- 화면의 `CONNECTED/DISCONNECTED` 표시는 카메라·MediaPipe 상태가 아니라 AI WebSocket 상태였다. 기존 문구가 두 상태를 하나처럼 보이게 했다.
- worker 또는 main-thread landmarker의 일시 오류가 추론 loop 전체를 중단할 수 있었다.
- 사용자·손 추적 유예값이 짧아 landmark가 몇 프레임 누락되거나 handedness가 흔들릴 때 재등록 체감이 컸다.
- 모델 자체 문제도 있었다. `ㅠ`는 표본 전부가 `ㅅ`으로 분류되고 `ㅅ` precision도 약 47%여서 threshold 조정으로 해결할 수 없다. 이 결과는 1.7의 readiness 게이팅으로 반영했다.

**조치.**

- AI WebSocket은 0.5초부터 최대 8초까지 지수 backoff로 자동 재접속하고, 생성·오류·종료 어느 경로에서도 다음 재접속을 예약한다.
- worker 실패 시 즉시 main-thread tracker로 전환한다. main-thread의 일시 실패는 해당 프레임만 버리고 다음 프레임에서 tracker를 다시 초기화한다.
- 사용자 추적 grace/re-identification과 손 소유권 grace를 늘리고 pose/ownership 임계값을 실사용 흔들림에 맞게 완화한다. 손이 잠시 사라진 동안은 세션만 유지하고 게임 입력은 차단한다.
- 상태 문구를 `AI 인식 서버`로 명시해 카메라/MediaPipe 상태와 구분한다.
- 방 생성, bot 출제, 게임 spawn은 `ai/contracts/recognition/readiness.json`에서 `competitiveEligible`인 글자만 허용한다.

모델이 좋아졌다고 기록하지 않는다.

### 1.7 출제 가능 글자 게이팅

인식 성능이 검증되지 않은 글자를 경기에 넣으면 승패가 모델 오류에 좌우된다. 그래서 출제 범위를 코드 상수가 아니라 계약 파일 하나로 통제한다.

`ai/contracts/recognition/readiness.json`이 유일한 원천이다. 현재 값은 다음과 같다.

- `modelVersion`: `jamo-31-v1`, `confirmationAuthority`: `FRONTEND_TEMPORAL_DECODER`
- 평가 표본 1900개(`jamo-31-ensemble-v2` 측정), 기준은 `minimumConfirmationRate 0.85`, `minimumCompetitivePrecision 0.90`
- 31개 자모 가운데 `competitiveEligible`은 27개다. 제외된 4개와 사유는 다음과 같다.

| 제외 글자 | 사유 |
| --- | --- |
| `ㅓ` | 확정률 85% 미만. `ㅡ`로 오독된다 |
| `ㅗ` | 확정률 85% 미만이다 |
| `ㅜ` | 확정률 85% 미만. 예측은 맞지만 일부 표본의 confidence가 0.5를 넘지 못한다 |
| `ㅡ` | precision 90% 미만. `ㅓ`를 일부 흡수한다 |

위 목록은 재측정마다 바뀐다. 판정 여유 게이트를 넣고 전 클래스를 다시 측정한
`bfa7f13`에서 `ㅅ ㅏ ㅕ ㅠ ㅔ ㅖ`가 풀리고 `ㅗ ㅜ ㅡ`가 대신 막혔다(1.6의 `ㅅ`/`ㅠ`
기록은 그 이전 상태다).

배틀 심볼 풀(`P2pBattleTransport.BATTLE_TARGET_SYMBOLS`)과 방 옵션 `symbolRange`(`자음`/`모음`/`기초 혼합`)는 모두 `isCompetitiveRecognitionReady()`를 통과한 글자만 사용한다. 서버 threshold, 프런트 출제 범위, 계약 테스트가 같은 파일을 읽으므로 한쪽만 바뀌는 drift가 생기지 않는다.

지숫자 1~9는 `GAME_SYMBOL_REGISTRY`에 `modelSupported: false`로 등록되어 있고 `assets/guides/number-1.png`~`number-9.png` 안내 이미지도 있지만, `readiness.json`에 클래스가 없으므로 AI 경쟁 출제에는 포함되지 않는다. 0과 10은 등록 자체를 하지 않는다.

제외 글자를 다시 활성화하려면 새 사용자·새 촬영 세션 데이터로 재학습한 뒤 사용자 분리 validation에서 readiness 조건을 다시 통과시키고 이 JSON을 갱신해야 한다. 평가 항목의 `trainingIndependent`가 `false`이고 경고 문구가 붙어 있는 것도 그대로 유지한다. 이 수치는 잠정 안전장치이지 독립 모델 인증이 아니다.

## 2. 솔로 프링글수

### 2.1 첫 글자가 인식 직후 바로 터짐

**원인.** 게임 시작 전에 발생한 인식 확정 이벤트가 새 목표가 그려진 프레임에 전달됐다.

**조치.** 새 종이 목표마다 80ms arming guard를 두고 이 시간의 확정 입력은 소비하지 않는다. 목표가 없는 구간에는 인식 gate와 입력 잠금을 초기화한다.

### 2.2 확대된 글자가 두 번 보이거나 순간 이동함

**원인.** 종이 글자 애니메이션과 Matter/Pixi 물리 글자를 동시에 생성해 서로 다른 레이어와 시작 좌표에서 두 사본이 보였다.

**조치.** 확대가 끝날 때까지 물리 body를 만들지 않는다. 완료 시 종이 글자의 최종 중심과 같은 위치에 한 번만 body를 만들고 전면 글자 레이어에서 렌더한다. 물리 글자가 종이 영역을 빠져나갈 때까지 다음 목표도 숨긴다.

### 2.3 충돌체가 획과 어긋나거나 블록이 바닥을 벗어남

**원인.** 폰트 외곽 전체를 하나의 큰 충돌 사각형으로 근사했고, 브라우저 편집 결과가 제품 기본 JSON에 반영되지 않은 경우가 있었다. 글자 충돌 패딩, 바닥 경계, 표시 크기의 기준도 서로 달랐다.

**조치.**

- `glyphCollisionDefaults.json`을 단일 기준으로 삼고 획별 파트를 사용한다. `ㅢ`, `ㅟ`처럼 분리된 획은 별도 파트로 유지한다.
- `/game/solo?collisionAudit=1`에서 최종 JSON을 확인한 뒤 파일에 반영한다.
- 충돌체를 획에 가깝게 축소하고 최소 패딩만 유지한다. 바닥 경계는 보드 내부 기준으로 고정하고 충돌 감사 테스트를 유지한다.

### 2.4 충돌 시 기존 더미가 지나치게 무너짐

**원인.** 블록이 커지면서(1:1 `BATTLE_LETTER_SIZE 240`) 질량과 낙하 충격에 비해 반발력과 낙하 에너지가 높았다.

**조치.** `DEFAULT_PHYSICS_CONFIG`를 반발력 `restitution 0.02`, 중력 `gravityY 0.34`, 최대 낙하 속도 `maxFallSpeed 4.4`, 마찰 `friction 0.34`, 회전 관성 배율 `rotationInertiaScale 0.68`로 조정했다. 마찰은 낮게 유지해 불안정하게 놓인 블록은 굴러가되 바닥 전체로 튀어 흩어지지 않게 했다.

### 2.5 종료 판정이 한 블록 이르거나 늦음

**원인.** 매 프레임 모든 body 위치로 판정하면 낙하·반동 중인 글자도 종료를 만들고, 다음 생성 시점에만 검사하면 한 글자 늦었다.

**조치.** 해당 프레임에 `LETTER_SETTLED`가 발생한 블록만 검사한다. 그 블록의 보이는 상단이 결승선을 넘으면 같은 프레임에 종료한다. 1:1의 결승선 시각 위치와 승리 판정은 게임판 높이의 `1 / 6`로 통일한다.

### 2.6 결승선에 멈춘 뒤 결과 화면이 늦게 표시됨

**원인.** 자연스러운 굴러감을 위해 늘린 일반 정착 시간(`settleDurationMs`)이 게임 종료 판정에도 그대로 적용됐다.

**조치.** 일반 정착과 결승선 종료를 분리했다. 현재 `SettlementDetector`의 일반 정착 기준은 선형 속도 `0.07`, 각속도 `0.01` 이하를 `settleDurationMs 900` 연속 유지하는 것이고, 1:1의 게임오버는 `BattleLocalBoardRuntime`의 `DANGER_CONFIRMATION_MS 1200`으로 별도 판정한다. 속도나 회전이 다시 커지면 누적 시간을 초기화한다.

### 2.7 높은 더미에서 다음 목표가 나오지 않음

**증상.** 방금 떨어진 글자가 결승선 아래 안전한 위치에 멈췄는데도 다음 목표가 표시되지 않았다.

**원인.** 다음 목표 대기 조건이 방출 글자의 `y` 위치만 확인했다. 글자가 커지고 더미가 높아지면서 종이 아래 임계값을 통과하기 전에 정착할 수 있었고, 이 경우 대기가 영구히 풀리지 않았다.

**조치.** 방출 글자가 아직 움직이는 동안에만 위치 임계값을 기다린다. 이미 정착한 글자는 안전선 판정과 별개로 다음 목표를 즉시 큐에 넣는다. 큰 글자(1:1은 `BATTLE_LETTER_SIZE 240`)가 높은 위치에서 정착하는 회귀 테스트가 있다.

### 2.8 플레이 시간이 카메라·인식 상태에 따라 끊겨 보임

**원인.** 물리 안정화를 위해 제한한 프레임 델타를 플레이 시간 누적에도 그대로 사용했고, 화면 갱신도 게임 이벤트 중심이었다.

**조치.** 물리 계산에는 델타 제한을 유지하되 플레이 시간은 실제 경과 델타 전체를 누적한다. `RUNNING` 상태에서 100ms 단위로 스냅샷을 갱신해 카메라·MediaPipe와 무관하게 시간 표시가 계속 흐른다.

### 2.9 경과 시간 랭킹 방향

프런트는 `POST /solo-results`에 올림한 경과 초를 보내고 `GET /rankings?...gameType=TETRIS_SOLO`의 `me.rank`를 표시한다. 낮은 기록 우선 정렬은 백엔드 책임이다. 운영 랭킹이 높은 점수 우선이면 백엔드의 `TETRIS_SOLO` 정책을 MIN/ASC로 수정해야 한다.

### 2.10 오답 가중치가 게임 다양성을 훼손함

서버 가중치를 그대로 쓰지 않고 증가분의 20%만 반영하며 최댓값을 `1.2`로 제한한다. 직전 문자는 후보에서 완전히 제외한다. API 실패 시 균등 가중치로 진행한다.

### 2.11 결과 화면보다 물리 글자가 앞에 보임

**원인.** 물리 글자 전용 전면 레이어의 쌓임 순서가 결과 오버레이보다 높았다.

**조치.** 게임 종료 오버레이를 최상위 결과 계층으로 올리고, 종료 상태에서는 입력·물리 화면보다 결과 카드가 우선 보이게 한다.

---

## 3. 1:1 방 생명주기와 재접속

### 3.1 새로고침·뒤로가기 뒤 403/409가 반복됨

**증상.**

- 대기방이나 진행 중 게임 새로고침 뒤 Room WebSocket 403 또는 ready/start/result 409가 반복된다.
- 정상 종료 때 양쪽 peer가 결과를 제출해 두 번째 요청이 409가 된다.
- 결과 저장보다 재대결 전환이 먼저 실행된다.
- 브라우저 뒤로가기로 화면만 이동하고 방 참가 상태, 카메라, WebRTC가 남는다.

**원인.**

- `sessionStorage`의 방 상태를 서버 확인 없이 복원했다.
- 1회용 ticket을 재사용하거나 권한 오류에도 재시도했다. 1회용 ticket과 10초 재접속 유예의 경계를 구분하지 못했다.
- 기존 참가자의 join이 멱등이라는 백엔드 계약 대신 프런트 캐시로 409를 숨겼다.
- 결과 저장 주체와 완료 ACK가 없었다.
- history 이동과 화면 버튼이 서로 다른 cleanup 경로를 사용했다.

**조치.**

- mount에서 멱등 `join(roomCode)`으로 서버 권위 상태와 fresh ticket을 다시 받는다.
- 서버가 `PLAYING`일 때만 카메라와 WebRTC를 재연결한다.
- WebRTC handoff로 Room WebSocket을 닫기 전 `WEBRTC_CONNECTED`를 보내 의도적 종료임을 알린다.
- 결과 REST는 방장만 제출하고 성공 뒤 `RESULT_RECORDED` P2P ACK를 보낸다. ACK 전에는 재대결을 비활성화한다.
- 403/409를 무조건 성공으로 바꾸지 않고 stale session이면 방 세션과 미디어를 폐기한다.
- 대기방과 게임의 `popstate`를 기존 leave/forfeit cleanup 경로에 연결한다.
- 새 매치와 솔로 재시작에서 AI decoder/pending frame을 비우고 `RESET_SEQUENCE`를 보낸다.

### 3.2 한쪽 새로고침이 양쪽 보드를 망가뜨림

**증상.**

- 진행 중 한쪽을 새로고침하면 그쪽은 모든 연결이 DISCONNECTED, 보드는 빈 상태로 보인다.
- 반대쪽도 이미 떨어진 블록·shared target·낙하가 사라지거나 처음 카운트다운으로 되돌아간다.
- 새로고침 직후 나가기에서 `POST /api/game-rooms/{roomId}/leave?userId=...`가 403을 반환한다.
- 게임판이 흰색 WebGL 캔버스로 공유 배경을 덮는다.

**원인.**

1. RTC 일시 단절이 `mediaReady=false`로 전파되면 `BattleGamePage`의 controller effect cleanup이 실행되어 local physics board가 dispose된다.
2. React provider가 인증 userId보다 먼저 mount하면 저장된 방 세션을 초기화 시점에 읽지 못해 play route가 재입장 정보를 잃는다.
3. 서버가 이미 참가자를 제거한 뒤 브라우저가 다시 leave API를 호출하면 403이 정상적으로 발생한다.
4. Pixi renderer 캔버스가 board 내부 scenery를 렌더링하지 않는 상태에서도 불투명 배경을 유지할 수 있다.
5. 재접속 시 매치 시작·보드 스냅샷을 양쪽에 무조건 적용하면 새로고침하지 않은 플레이어의 진행 중 보드가 복구 스냅샷으로 되감긴다. 반대로 재접속한 쪽이 자기 스냅샷을 받기 전에 physics를 재시작하면 빈 보드나 새 카운트다운으로 보인다.

**조치.**

| 문제 | 조치 | 커밋 |
| --- | --- | --- |
| 흰 배경 | board WebGL canvas가 공유 scenery를 덮지 않도록 처리 | `a815e23` |
| 재접속 시 카운트다운 재시작 | `resume` match state와 board/player snapshot 복원 | `53ef953` |
| 반대쪽 보드 초기화 | 최초 RTC 성공 뒤 `mediaReady`를 latch하여 controller 유지 | `c8c9090` |
| 새로고침 세션 유실 | userId별 sessionStorage + localStorage 저장, auth hydrate 후 재읽기 | `c8c9090` |
| stale leave 403 | 세션 없는 play route는 remote leave 생략, 이미 종료된 leave 응답에도 local cleanup 지속 | `c8c9090` |
| 살아 있는 플레이어 보드가 덮어써짐 | `restoreForPlayerId`로 요청한 플레이어만 자기 snapshot 적용 | — |
| 복귀 중 빈 보드가 전송되지 않음 | 빈 보드도 `BOARD_SNAPSHOT`으로 전송하고 양쪽 board payload를 함께 보냄 | — |
| 낙하 중 블록 위치가 복귀 시 달라짐 | snapshot 뒤 240ms settle window에서 남은 peer의 `PEER_BOARD_VIEW` 최신 위치 적용 | — |
| 단순 RTC 재연결에 새 매치가 시작됨 | transport의 `hasConnected`로 최초 연결과 재연결을 구분 | — |
| 복귀 후 로컬 낙하가 전달되지 않음 | `BattleController`가 `LocalBoardPublisher`를 새 runtime에 재부착 | — |

**재현과 판정.**

1. 새 방에서 두 명이 ready/start 한다.
2. 최소 하나의 블록이 화면에 있는 동안 B만 새로고침한다.
3. A의 board가 dispose되지 않고 기존 블록과 target이 남아 있으면 1차 성공이다.
4. B가 `join(roomCode)`으로 PLAYING을 확인한 뒤 snapshot/resume으로 같은 보드를 보이면 성공이다.
5. B에서 나가기 후 DevTools Network에 새로운 leave 403이 없고 로비로 이동하면 성공이다.

### 3.3 방장 영구 이탈 정책

방장 브라우저가 영구 이탈하면 host authority를 다른 브라우저로 이전하지 않는다. 남은 참가자가 다음 shared target을 독자 생성하면 split-brain이 생긴다.

- 상대 단절 직후에는 현재 board를 유지하며 10초 재접속 유예를 시작한다.
- 상대 board snapshot 또는 resume 이벤트가 유예 안에 도착하면 timeout을 취소하고 계속 진행한다.
- 유예가 끝나면 남은 참가자는 `RECONNECT_TIMEOUT` 사유의 승자가 되고 board는 중지된다.
- 명시적 나가기는 기존 forfeit/leave로 즉시 방을 닫고 남은 참가자는 승리 결과를 받는다.

순수 DataChannel/PeerConnection 상태만으로 자동 몰수패를 결정하지 않는다. 네트워크 분할 시 양쪽이 모두 자신을 생존자로 판단할 수 있다. 서버가 인증된 `PEER_DISCONNECTED`/`PEER_RECONNECTED`를 권위 근거로 제공하기 전까지 10초 이후 자동 몰수패는 활성화하지 않는다.

### 3.4 공유 목표에서 글자가 중복 생성됨

**원인.** 각 peer가 인식을 즉시 로컬 spawn으로 처리하면 동시 인식 때 글자가 두 개 생기거나 두 보드가 어긋난다. 공유 목표는 단일 경쟁 자원이므로 각 브라우저가 독자적으로 승자를 판단할 수 없다.

**조치.**

- `SHARED_TARGET`, `CLAIM_SHARED_TARGET`, `SHARED_TARGET_CLAIMED` DataChannel 메시지를 사용한다.
- 방장이 권위를 가진다. 첫 유효 claim을 승인하고 결과를 발행하며 승리한 보드에만 중앙 spawn 명령을 보낸다.
- 공유 목표 모드에서는 로컬 낙관적 spawn을 비활성화한다.
- 다음 목표는 claim이 해소된 뒤에만 발행해 목표 세대 간 겹침을 막는다.
- 공유 paper black-hole 연출은 양쪽에서 같은 authoritative claim을 렌더링하고 실제 spawn만 승리 보드에 지연 적용한다. 이렇게 하면 정답자가 아닌 브라우저에서도 claim 연출이 보인다.

영상이나 두 번째 물리 시뮬레이션을 스트리밍하지 않고 작은 target/claim/spawn 이벤트만 교환하므로 비용이 낮다.

### 3.5 전송 경계

- 방 생성·참가·준비·시작은 REST/SSE 계약을 사용한다.
- `POST /auth/sse-ticket` 발급 요청에는 Bearer 인증 헤더가 필요하다.
- 브라우저 `EventSource`는 임의 인증 헤더를 붙일 수 없으므로 `/game-rooms/subscribe` 연결은 발급받은 1회용 `ticket` query를 사용한다. SSE 구독 URL에 Bearer 헤더를 억지로 붙이지 않는다.
- Room native WebSocket은 방 이벤트와 SDP/ICE signaling 전용이다.
- 게임 명령·권위 이벤트·복구 snapshot은 WebRTC DataChannel의 `GAME_P2P_V1` envelope로 교환한다.
- 프런트 런타임과 의존성에 STOMP를 사용하지 않는다.

**연결 과정에서 확인한 문제와 수정.**

1. Vite `/api` 프록시에 `ws: true`가 없어 로컬 Room WebSocket upgrade가 전달되지 않았다.
2. 상대 socket이 열리기 전에 전달된 offer가 유실될 수 있어 참가자 snapshot 수신 시 기존 offer를 재전송한다.
3. RTCPeerConnection 연결 직후 DataChannel이 아직 열리는 중일 수 있어 전송 계층이 최대 5초 동안 open을 기다린다.
4. React StrictMode의 setup-cleanup-setup 중 이전 connect가 늦게 완료되며 새 연결을 덮는 문제를 generation으로 무효화한다.
5. 브라우저 raw `setTimeout`을 인스턴스 메서드처럼 호출해 `Illegal invocation`이 발생하던 부분을 래퍼 함수로 고쳤다.
6. 같은 match의 `MATCH_STARTED`가 중복 도착하면 countdown/controller가 재시작되던 문제를 차단했다.

### 3.6 로비 표시 문제

#### 방 제목 대신 초대 코드, 닉네임 대신 `방장`이 표시됨

**원인.** 배포 Swagger의 create 요청은 `gameType`만 받고 로비 SSE도 제목·닉네임·난이도·출제 범위를 보내지 않는다. 프런트는 생성 폼 값을 API에 전달할 수 없어 초대 코드와 역할명을 fallback으로 사용했다. 생성 메타데이터를 gateway 메모리에만 두면 gateway 재생성이나 멱등 join 응답 뒤 `프링글수 대전방`, `프링글수 유저`로 덮어써졌다.

**조치.**

- 생성 직후 폼의 제목·현재 사용자 닉네임·난이도·출제 범위를 `SwaggerBattleRoomGateway`의 방 ID별 메모리와 사용자·게임 종류별 localStorage에 저장한다.
- gateway 재생성 시 저장된 표시 메타데이터를 복원하고, 명시적으로 방을 나갈 때 항목을 제거한다.
- 로비 카드가 현재 재입장 세션과 같은 방이면 SSE fallback보다 세션의 실제 제목·출제 범위를 우선한다. 현재 사용자가 서버상 방장이면 프로필의 실제 닉네임을 표시한다.
- SSE의 선택 메타데이터 필드가 존재하면 메모리보다 우선한다.
- `기본` 표시를 제거하고 실제 심볼 배열을 `자음`, `모음`, `기초 혼합`으로 분류한다.
- 생성 시간이 없으면 생성 행을 렌더링하지 않는다.
- 서버 정보가 없는 다른 사용자 화면에서는 중립 문구를 쓰고 초대 코드나 `방장`을 사용자 정보처럼 표시하지 않는다.

**남은 경계.** localStorage 보존은 방을 생성한 동일 사용자·동일 브라우저에서 표시값을 잃지 않기 위한 장치다. 다른 사용자에게 제목과 방장 닉네임을 공유하는 서버 저장소가 아니다. 다른 사용자의 로비까지 같은 값을 보장하려면 백엔드 create/response/SSE 계약 확장이 필요하며, 프런트 저장값을 공유된 권위 데이터처럼 취급하지 않는다.

#### 종료 직후 가득 찬 방이 목록에 노출됨

**원인.** 결과 API가 재대결을 위해 방 상태를 `WAITING`으로 되돌린다. 상태만 보고 표시하면 아직 두 참가자가 결과 화면에 있는 `2/2` 방도 입장 가능한 방처럼 보인다.

**조치.** `toSummary().canJoin`만 false로 만드는 것으로는 부족하다. `currentRooms()`에서 카드 자체를 필터링한다.

```ts
room.gameType === expected
  && room.status === "WAITING"
  && room.participantCount < room.capacity
```

#### 결과의 `게임방 목록`이 게임 선택 화면으로 이동함

**원인.** 결과 모달에 `onRoomList`와 `onModeSelect`가 함께 있었고 버튼 라벨과 callback 연결이 뒤섞였다.

**조치.** `다시 하기`와 `같은 방으로`는 `returnToWaiting()`을, `게임방 목록`만 `leaveBattle("/game/battle")`을 사용한다. `/game` 이동 callback은 결과 모달 계약에서 제거한다.

#### 뒤로가기 뒤 `재입장`, 다시 방 만들 때 `이미 참여 중인 방`이 뜸

**실제 경쟁 순서.** 대기실 mount의 멱등 join 진행 → 사용자가 뒤로가기로 leave 시작 → 늦게 완료된 join이 로컬 세션을 다시 기록하거나 leave 완료 전에 create가 전송된다.

**조치.**

- gateway의 create/join/leave를 단일 Promise queue로 직렬화한다.
- 대기실 leave는 `leavePromiseRef`로 한 번만 실행한다.
- leave 시작 플래그가 켜진 뒤 도착한 join 응답은 무시한다.
- 화면 이동 전에 로컬 재입장 세션을 먼저 비우고 원격 leave 완료 뒤 다시 비운다. 원격 오류가 나도 사용자가 나가기로 결정한 방의 세션은 복원하지 않는다.
- 퇴장 중에는 `rememberRoom`을 차단해 늦게 도착한 join·주기 확인·SSE 응답이 세션을 다시 기록하지 못하게 한다.
- popstate와 버튼 퇴장이 동일 cleanup 함수를 사용한다.
- 새 방을 만들 때 저장된 세션만 보고 생성을 막지 않는다. 저장된 `roomCode`로 멱등 join을 먼저 호출해 서버 상태를 확인하고 `401/403/404/410`이면 stale 세션을 폐기한 뒤 같은 제출에서 방 생성을 계속한다.
- 서버가 기존 방을 정상 반환할 때만 `이미 참여 중인 방` 안내를 표시한다. 네트워크 오류나 `5xx`는 방이 없다고 추측하지 않고 생성도 중단해 중복 방 생성을 피한다.

**서버 판정.** 방장 혼자 있던 방은 삭제, 2명인 방에서 방장 이탈은 남은 참가자에게 방장 위임이다. 프런트가 host를 임의 선정하지 않고 서버 응답과 SSE를 권위 상태로 사용한다.

---

## 4. 1:1 누적 성능

### 4.1 게임이 길어질수록 프레임이 떨어짐

**증상.** 1:1 게임을 오래 진행할수록 프레임이 점차 떨어지고 입력·물리·상대 보드 표시가 함께 느려졌다. 짧은 게임에서는 드러나지 않았다.

**원인.**

1. 솔로·1:1 화면은 DOM 마스크 글자를 표시하면서 같은 글자마다 보이지 않는 Pixi `LetterView`도 만들고 있었다. `LetterView` 하나가 여러 Pixi 객체를 소유하므로 장면 그래프와 GPU 메모리가 글자 수에 비례해 증가했다.
2. 모든 DOM 글자에 영구적인 `will-change`가 적용되어 정착한 글자도 GPU 합성 레이어를 계속 점유했다.
3. 움직임이 없는 정착 보드도 매 프레임 Matter 상태 조회, DOM 렌더 비교, 네트워크 발행 판단을 수행했다. 상대 보드도 매 프레임 전체 글자를 순회했다.
4. 상대 보드의 제거 이력과 P2P 명령 처리 이력이 게임 종료까지 상한 없이 증가했다.
5. 로컬 보드 발행기가 매 갱신마다 임시 배열과 `Set`을 새로 만들어 GC 부담을 키웠다.

**조치 — 렌더 객체와 GPU 레이어.**

- `showScenery: false`인 DOM 렌더 모드에서는 보이지 않는 Pixi `LetterView`를 생성하지 않는다.
- 제거 효과는 Pixi 뷰가 없는 DOM 글자에서도 완료 이벤트를 정상 발생시키되 보이지 않는 파티클은 만들지 않는다.
- 낙하 중인 글자만 `will-change: transform`을 사용하고 정착 즉시 `will-change: auto`로 되돌린다.
- DOM 글자에 `contain: layout style paint`를 적용해 글자 갱신이 게임판 밖 레이아웃·페인트로 전파되지 않게 한다.

**조치 — 적응형 프레임 주기.**

- 로컬 보드에 낙하 글자나 제거 효과가 있으면 기존 주기로 갱신한다.
- 완전히 정착한 로컬 보드는 100ms(10FPS)로 상태 조회·렌더·발행 판단을 제한한다.
- 상대 보드는 이동 중 30FPS, 정착 후 10FPS로 전체 순회를 제한한다.
- 카메라 랜드마크 표시는 20FPS로 제한하고 인식·AI 전송의 latest-only 정책은 유지한다.

**조치 — 누적 상태 상한.**

- 상대 보드의 제거 tombstone은 최근 128개만 보존한다(`RemoteTransformBuffer.MAX_REMOVED_HISTORY`).
- P2P 중복 명령 방지 ID는 최근 256개만 보존한다(`P2pBattleTransport.MAX_PROCESSED_COMMANDS`).
- 정착 ID 집합은 실제 구성 변화가 있을 때만 재구성하고 매 프레임 배열·집합 생성을 피한다.

**캐시 정책.** 모든 캐시를 주기적으로 비우지 않는다. 글자 마스크·윤곽 캐시는 제한된 지문자 집합을 재사용하므로 비우면 래스터 재생성과 순간 프레임 저하가 반복된다. 실제로 상한 없이 증가하던 이력만 제한하고 재사용 가치가 있는 정적 캐시는 유지한다.

### 4.2 상대 낙하 글자가 패킷 사이에서 끊겨 보임

**조치.**

실제 값은 `InterpolationConfig.DEFAULT_BATTLE_SYNC_CONFIG`에 모아 두었다.

- 이동 중인 글자 변환은 `transformPublishIntervalMs = 1000/30`(30Hz)로 전송하고, 상대 보드는 `interpolationDelayMs 140`만큼 지연된 시점을 렌더 타깃으로 삼아 보간한다.
- 주기 전체 스냅샷은 `snapshotPublishIntervalMs 5000`으로 낮추되 정착·제거·구조 변경에서는 즉시 권위 스냅샷을 전송한다.
- `RemoteTransformBuffer`가 마지막 FALLING 변환을 `maxExtrapolationMs 70`까지만 등속 예측해 짧은 패킷 공백을 메운다. 권위 상태와 멀어지는 장시간 예측은 허용하지 않는다.
- 이동 거리 `snapDistanceThreshold 2` 또는 각도 차 `snapAngleThreshold π`를 넘으면 보간하지 않고 스냅한다. 각도는 최단 경로로 보간한다.
- DataChannel `bufferedAmount`가 `maxWebSocketBufferedAmount 12000`을 넘으면 그 프레임 전송을 건너뛴다.

**관련 코드.** `block-stacking/battle/core/BattleLocalBoardRuntime.ts`, `battle/pages/BattleGamePage.tsx`, `battle/render/RemoteBoardRenderer.ts`, `battle/sync/LocalBoardPublisher.ts`, `battle/sync/RemoteTransformBuffer.ts`, `battle/transport/P2pBattleTransport.ts`, `block-stacking/render/PixiGameRenderer.ts`, `shared/GameModule.module.css`

### 4.3 장시간 수동 점검 절차

1. 서로 다른 두 브라우저로 1:1 게임에 입장한다.
2. 각 보드에 글자를 15개 이상 누적하고 10분 이상 플레이한다.
3. DevTools Performance Monitor에서 JS heap, DOM node, GPU memory가 입력 횟수와 함께 무제한 증가하지 않는지 확인한다.
4. 정착 상태에서 CPU 사용률이 내려가고 새 글자가 생성되면 즉시 부드러운 프레임으로 복귀하는지 확인한다.
5. 상대 보드의 낙하·제거·망치 전송이 누락되거나 10FPS로 고정되지 않는지 확인한다.
6. 재대결과 방 나가기를 반복한 뒤 이전 게임의 DOM 글자, rAF, P2P 명령 이력이 남지 않는지 확인한다.

---

## 5. 화면 배율과 UI

### 5.1 브라우저 확대가 게임 화면에 적용되지 않음

**원인.** 게임 모듈이 1280×720 또는 1920×1080 고정 캔버스를 `window.innerWidth/innerHeight`로 다시 scale하고, 솔로 화면은 2048×1092 고정 캔버스를 한 번 더 scale했다. 브라우저 zoom이 CSS viewport를 줄이면 내부 transform도 같은 비율로 줄어 zoom 효과를 상쇄했다.

**조치.** 게임 모듈과 솔로 화면의 JavaScript scale 계산과 고정 transform wrapper를 제거하고 일반 문서처럼 `width: 100%`, `100dvh`, CSS media query로 배치한다. 820px 이하 솔로 화면은 게임판과 카메라/가이드를 세로로 쌓는다.

**2026-08-02 정정.** 솔로 화면과 시각 비율을 맞추는 1:1 전용 화면에는 `1680 × 945` 캔버스를 viewport 안에 비율 유지해 맞추는 방식이 다시 도입됐다.

- 적용 범위는 실시간 `/game/battle/:roomId/play`와 개발 전용 `/game/battle/preview`다.
- 두 게임판과 카메라 rail의 상대 비율을 유지하되 viewport 중앙을 기준으로 scale한다.
- 게임 선택·로비·대기실·솔로의 일반 반응형 레이아웃까지 고정 캔버스로 되돌린 것은 아니다.

### 5.2 결과 화면 제목이 왼쪽으로 밀려 보임

**원인.** 결과 헤더를 `본문 + 점수 카드` 2열 grid로 만들면 본문은 헤더 전체가 아니라 첫 번째 열 안에서만 중앙 정렬된다.

**조치.** 헤더 본문은 전체 너비 중앙 정렬을 유지하고 최종 점수 카드는 데스크톱에서 우측 absolute 배치한다. 모바일 media query에서는 static으로 되돌려 제목과 겹치지 않게 한다.

### 5.3 로고 PNG의 투명 여백 때문에 크기와 클릭 범위가 어긋남

`solo-start-title.png`는 중앙 로고 주변에 큰 투명 캔버스를 포함한다. 전체 종횡비를 그대로 맞추면 불투명 콘텐츠가 작아지고, 높이만 줄이면 로고가 잘린다. 이미지 파일을 복제하거나 수정하지 않고 크롭 래퍼로 처리한다.

- 솔로 헤더: `.solo-header-logo`를 `225px × 90px` overflow-hidden 래퍼로 두고 내부 이미지를 `320px` 너비와 음수 top/left 오프셋으로 배치한다.
- 게임 카테고리 카드: `.categoryCardTitleLogo`를 `144px × 54px` 래퍼로 두고 내부 이미지를 `195px` 너비와 음수 오프셋으로 배치한다. 그러지 않으면 우측 상단 `SOLO · 1 VS 1` 배지와 겹친다.
- 뒤로가기 버튼: 타이틀 이미지의 투명 영역이 원형 버튼을 덮어 보이는 범위보다 클릭 범위가 작았다. 솔로·1:1 뒤로가기 버튼을 타이틀 이미지보다 위 레이어로 올리고 타이틀 이미지는 포인터 이벤트를 받지 않게 한다.

### 5.4 종이 힌트 이미지가 종이·수달 영역을 벗어남

**원인.** 종이 실제 표시 높이보다 큰 힌트 안전영역을 사용했다. 이미지 자체의 정사각형 크기만 제한해도 손 모양이 종이 밖으로 보일 수 있었다.

**조치.** 걷기·던지기 장면의 종이 힌트 영역을 `66 × 66px`로 통일하고 내부 그림을 `58px`로 제한한다. 안전영역은 종이 중앙으로 옮기고 `overflow: hidden`을 유지한다.

### 5.5 배경 장식이 중복되거나 게임판과 겹침

**원인.** Pixi 기본 풍경과 DOM 기반 하늘·잔디 장식이 동시에 렌더되어 서로 다른 깊이에서 보일 수 있었다.

**조치.** 솔로 보드의 Pixi 풍경 렌더링을 비활성화하고 DOM 배경 한 계층에서만 구름·해·초승달·밤 효과를 제어한다. 게임 글자와 수달은 배경보다 앞쪽 계층을 유지한다.

### 5.6 솔로 카메라 영상이 게임판보다 짧아 보임

**원인.** 게임판 상단 라벨·패딩은 약 31px인데 카메라 헤더가 44px을 차지해 내부 뷰포트 시작점이 달랐다.

**조치.** `.solo-camera-cell`의 grid 헤더 행을 `24px`로 줄인다. 카드 외곽 높이는 유지하면서 카메라 뷰포트의 상단·하단을 게임판 캔버스와 맞춘다.

### 5.7 스프라이트 프레임은 바뀌는데 걷는 동작으로 보이지 않음

**원인.**

- 5칸 스프라이트 스트립을 `background-position`으로 이동시키면 어느 원본 프레임이 표시됐는지 DOM에서 확인하기 어렵다.
- 캐릭터 위치를 `left`로 애니메이션하면 매 프레임 레이아웃 계산이 발생한다. Pixi·카메라·MediaPipe가 함께 동작하면 이 비용이 끊김으로 드러난다.
- 원본 옆걸음 프레임은 발 차이가 작아 92×82px에서 거의 같은 자세로 보였다. 프레임 속도만 높이면 몸이 떨리는 것처럼 보인다.
- 애니메이션 프레임 간격과 같은 주기로 상태를 샘플링하면 일부 프레임을 건너뛴 결과만 수집된다. 샘플 배열에 프레임 번호가 빠졌다는 이유만으로 렌더 누락이라 판단하면 안 된다.

**조치.**

- 정렬된 스트립을 260×260 개별 PNG 5장으로 분리하고 각 파일을 React에서 직접 import한다.
- 다섯 이미지를 같은 위치에 겹친 뒤 불연속 opacity keyframe으로 `0→1→2→3→4→3→2→1`을 재생한다. 경계 시점에도 표시 프레임은 정확히 한 장이어야 한다.
- 표시 크기를 124×110px로 올려 발 실루엣 차이가 보이게 한다.
- 이동용 래퍼와 보행 프레임을 분리한다. 래퍼의 `left`는 `-150px`로 고정하고 `translate3d`만 연속 변경해 레이아웃 재계산을 피한다.
- 반응형 게임판 너비는 래퍼의 inline-size container와 `cqw`로 계산한다. 정지 지점 28%·62%와 화면 밖 퇴장이 화면 폭에 맞춰 유지된다.
- `will-change`와 `backface-visibility`는 실제로 합성되는 이동·프레임 요소에만 지정하고 넓은 게임판 전체에는 적용하지 않는다.

### 5.8 제거한 상단 제어를 다시 찾는 경우

솔로 시작 화면의 일시정지·새로고침 버튼은 집중도를 위해 의도적으로 제거했다. 뒤로가기는 상단 좌측 원형 버튼, 재시작은 결과 화면의 `다시 하기` 버튼을 사용한다.

### 5.9 1:1 화면을 솔로 스타일로 바꿀 때의 경계

스타일 변경은 다음 런타임 요소를 제거하거나 합치지 않는다.

- 두 개의 독립 게임판과 한 개의 공유 배경
- 공유 목표·목표 소진·낙하·제거·공격 애니메이션
- 낮·밤 전환과 야간 중앙 경계 처리
- 로컬·상대 카메라와 연결 상태
- 화면 결승선과 동일 좌표의 승리 판정

격자 제거, 패널 크기, 로고·뒤로가기 위치, 글자 크기·색은 CSS/renderer 표현 책임이다. 보드 controller, P2P message, 물리 좌표 계약과 섞지 않는다.

---

## 6. 지문자 턴 배틀

### 6.1 공격이 다음 턴에 한 번 더 재생됨

**원인.** `LocalGlyphTurnPractice.nextTurn()`이 `resolvedMoves`만 비우고 `lastMove`를 남겼다. 렌더러는 `resolvedMoves`가 비면 `lastMove`를 대신 사용했고, 다음 턴의 `calloutAt`이 갱신되며 지난 `lastMove`의 애니메이션 나이가 0으로 돌아가 공격이 다시 시작됐다.

**조치.** 다음 `PLANNING` 진입 시 `lastMove`와 `resolvedMoves`를 모두 비운다. `GlyphDuelHudRenderer`는 `REVEAL` 또는 `FINISHED` 단계에서만 기술 이펙트를 그린다. 로컬 다음 턴과 서버 `PLANNING` snapshot이 모두 과거 move를 제거하는 회귀 테스트가 있다.

### 6.2 온라인 1:1이 레거시 판정과 섞임

**조치.**

- 온라인 1:1은 `GlyphTurnMatchTransport`를 필수로 사용하며 레거시 공격 Gateway로 폴백하지 않는다.
- HP·집중·방어·라운드·턴 연출은 `GLYPH_TURN_*`만 권위 입력으로 사용한다.
- 온라인 1:1에 봇 참가자가 있으면 입장을 거부하고 봇은 `/game/turn-battle/practice`에서만 사용한다.
- 턴 배틀은 상대 영상 타일만 표시하지 않는다. 내 카메라·랜드마크·AI 인식·큰 기술 카드·피해/집중/방어 설명·수달 전투 캔버스는 봇전과 동일하게 사용하고 확정된 손 인식만 P2P 명령으로 보낸다.
- 위치는 시점 기준(본인 왼쪽·상대 오른쪽), 외형과 체력바는 역할 기준으로 고정한다. 방장은 스카프 수달·파랑 HP, 도전자는 머리띠 수달·주황 HP이며 도전자 화면에서는 좌우가 뒤집힌다. 캐릭터 아래에 표시명과 축약 사용자 ID를 표시한다.

### 6.3 카드와 전투 이펙트의 자모 모양이 다르게 보임

**원인.** 카드 글자까지 임의 SVG 선분으로 재구성해 `ㅂ`이 `ㅣ＝ㅣ`, `ㅌ`이 라틴 `E`처럼 보였다. `ㅔ`, `ㅖ`는 전투 좌표가 없어 X 모양 fallback으로 표시될 수 있었고 `ㅢ`에는 실제 글자에 없는 중앙 세로획이 있었다.

**조치.**

- 31개 지원 자모를 `GlyphStrokeRegistry` 한 곳에 명시한다.
- 카드는 임의 선분을 쓰지 않고 실제 유니코드 한글 자모를 한글 전용 글꼴로 렌더링한다.
- 공격, 방어, 결계, 공명, 필살기만 검증된 공통 획 정의를 사용한다.
- `ㅔ`, `ㅖ`, `ㅢ`, `ㅂ`, `ㅐ`, `ㅒ`의 획 수·방향·비율을 수정했다. `ㅂ`은 카드와 같은 열린 윗부분을 유지하도록 잘못 추가된 위 가로획을 제거했다.
- 개발 모드의 `symbols` 쿼리로 문제 글자를 세 개씩 강제해 실제 카드와 전투 프레임을 확인할 수 있다.

**회귀 방지.** 게임 메타데이터의 모든 자모에 명시적 벡터가 있는지, 31개 카드가 SVG 유사 도형이 아닌 유니코드 자모 자체로 렌더되는지, `ㅔ`·`ㅖ`가 필살기로 오분류되지 않고 공명 카드인지 검사한다.

### 6.4 게임 피드백이 서버 판정보다 앞서던 문제

**원인.** 인식 성공 직후 효과를 먼저 보여주면 서버가 거절했을 때 화면과 공식 결과가 충돌한다. 재접속 snapshot이나 중복 이벤트가 같은 효과음을 여러 번 재생할 수도 있다.

**조치.**

- `RECOGNIZING`, `CONFIRMED`, `PENDING`, `SUCCESS`, `REJECTED`, `RELEASE_REQUIRED` 상태를 화면에서 구분한다.
- 권위 승인 이벤트가 온 뒤에만 카드 소비, 효과, 성공 효과음을 재생한다.
- eventId와 commandId를 bounded set으로 관리해 재수신 효과를 막는다.
- snapshot은 상태 복구에만 사용하고 과거 terminal effect를 재생하지 않는다.
- 음소거를 저장하고 첫 사용자 상호작용 전에 Web Audio가 자동 재생되지 않게 한다.
- `prefers-reduced-motion`에서는 흔들림과 강한 이동 효과를 줄인다.
- 개발 모드 계측 JSON에는 영상, 이미지, 손·몸 landmark, 얼굴 정보, 원본 WebSocket payload를 넣지 않는다.

---

## 7. 결과 저장 계약

### 7.1 결과 body가 `{winnerUserId}`로 변경됨

**증상.** 프런트는 결과를 `{hostScore, guestScore}`로 보내고 응답에서 `gameSessionId`, `hostScore`, `guestScore`를 읽고 있었다. 2026-07-23 배포 Swagger는 `{winnerUserId}` 계약으로 바뀌고 결과 처리 뒤 방을 `CLOSED`가 아니라 `WAITING`으로 복귀시키도록 변경됐다. 기존 프런트를 그대로 배포하면 결과 요청이 400으로 실패하거나 응답 파싱이 실패하고, 재대결 버튼은 로컬 방 캐시를 삭제해 대기실 상세 정보를 잃는다.

**조치.**

- `BattleResultClient`는 실제 숫자 승자 ID를 `{winnerUserId}`로 전송한다.
- 정상 종료 시 양쪽이 같은 host-authoritative snapshot의 승자 ID를 보고한다. 백엔드가 승자 1, 패자 0을 기록하므로 호스트 승 `1:0`, 도전자 승 `0:1` 의미는 유지된다.
- `409`는 이미 처리된 결과 또는 유효하지 않은 진행 상태이므로 중복 보고의 멱등 종료로 처리한다.
- `SwaggerBattleRoomGateway.returnToWaiting`은 캐시를 삭제하지 않고 `WAITING`과 양쪽 ready false를 반영한다.

**확인한 계약.** 방 생성 body의 `gameType`은 필수다. 방 응답에는 `gameType`과 `realtimeTicket`이 포함된다. SSE는 1회용 ticket query로 구독하고 Bearer 헤더는 티켓 발급 요청에 사용한다. 결과 body는 `{winnerUserId}`이며 `201` 이후 같은 방에서 재대결할 수 있다.

### 7.2 솔로 게임 시작이 401을 반환함

**증상.** 운영 `/game/solo`에서 게임 시작 시 `Solo game API returned 401.`이 표시되고 게임이 시작되지 않았다. 실패 요청은 `POST /api/game/solo/sessions`이며 Vercel 배포, CORS, WebSocket 문제가 아니었다.

**원인.** 현재 백엔드/Swagger 통합은 이 프런트가 사용하던 solo-session start/complete 계약을 제공하지 않는다. 인증된 방·결과 계약이 이를 포함한다고 추론하면 안 된다.

**조치.**

- 지원되지 않는 원격 세션 endpoint에 솔로 플레이를 묶지 않는다.
- `LocalSoloGameApi`가 세션을 만들고 완료된 합산 점수를 사용자 ID 범위의 브라우저 local storage에 저장한다. 카메라 프레임, 랜드마크, 이미지는 저장하지 않는다.
- 원격 솔로 저장은 `VITE_ENABLE_REMOTE_SOLO_GAME_API=true`로만 사용하고, 백엔드가 start/complete 계약과 인가 정책을 공식 제공한 뒤에만 활성화한다.

**후속.** 기기 간 솔로 점수 이력이나 서버 랭킹이 필요하면 백엔드가 솔로 점수 endpoint의 요청/응답 DTO와 인가 정책을 공개해야 한다. 그때까지 브라우저 로컬 저장이 유일한 지원 경로다.

---

## 8. 로컬 검증 환경

### PowerShell 실행 정책

`npx.ps1` 실행이 막히면 `npx.cmd`를 사용한다.

```powershell
npx.cmd tsc -p tsconfig.app.json --noEmit --incremental false --pretty false
```

### Vite 임시 폴더 `EPERM`

`node_modules/.vite-temp` 접근 오류가 나면 중복 dev/test 프로세스를 확인하고 같은 repository와 Node 설치를 사용하는 터미널에서 다시 실행한다. 임시 폴더를 강제로 삭제하기 전에 점유 프로세스를 확인한다.

### `127.0.0.1:5174` 연결 거부

```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5174
```

기존 5174 프로세스가 있으면 새 프로세스를 더 띄우지 말고 해당 Vite 프로세스의 로그와 포트 점유를 먼저 확인한다.

### 회귀 검증 명령

```powershell
cd frontend
npm test -- --run src/game
npm run build
```

집중 검증이 필요할 때:

```powershell
npx.cmd vitest run src/game/block-stacking/battle
npx.cmd vitest run src/game/block-stacking/battle/room/SwaggerBattleRoomGateway.test.ts src/game/block-stacking/pages/BattleRoomListPage.test.tsx
npx.cmd tsc -p tsconfig.app.json --noEmit --incremental false --pretty false
```

수동 2계정 검증 순서: 방 생성 → 참가 → 게임 종료 → 결과 화면 유지 → 로비 비노출 → 한 명 퇴장 → 로비 노출 또는 방 삭제 → 새 방 생성.

---

## 9. 재발 시 확인 순서

### 403/409 또는 방 상태 문제

1. 실패 endpoint와 HTTP status/body를 먼저 기록한다.
2. roomId, roomCode, sessionStorage status, backend join 응답 status를 비교한다.
3. ticket이 이전 연결에서 소비된 값인지 확인한다.
4. Room WebSocket에서 `WEBRTC_CONNECTED`가 전송됐는지 확인한다.
5. result 요청자가 방장인지, 같은 match에서 이미 201이 있었는지 확인한다.
6. 결과 ACK 전 재대결 요청이 발생했는지 확인한다.
7. 뒤로가기 뒤 leave 요청과 media/camera cleanup이 모두 실행됐는지 확인한다.

### 재접속 후 보드가 어긋날 때 코드 점검 순서

1. `GameServiceProvider.tsx`: 유저 ID가 확정될 때 `readBattleRoomSession`이 호출되는지, storage key가 존재하는지 확인한다.
2. `BattleGamePage.tsx`: media reconnect effect가 PLAYING session의 `roomCode`로 join하는지 확인한다.
3. 같은 파일에서 `mediaReady`가 reconnect 중 false가 되어 controller effect cleanup을 유발하지 않는지 확인한다.
4. `P2pBattleTransport.ts`: host/guest가 같은 `hostPlayerId`, `playerIds`, `matchId`로 연결되는지 확인한다.
5. `BattleController.ts`: `MATCH_STARTED.resume`이 새 countdown이 아니라 `PLAYING`과 local board start로 처리되는지 확인한다.
6. `BattleExitCoordinator.ts`: 현재 세션이 없으면 API leave가 호출되지 않는지 확인한다.

### 검증 과정에서 자주 틀린 부분

- 서버 코드를 고친 뒤 재시작하지 않고 검증해 이전 동작을 결과로 기록하지 않는다.
- 테스트를 과도하게 병렬 실행하면 타이밍 의존 테스트가 불안정해진다.
- 자동 테스트 수치를 실제 성능 수치로 기록하지 않는다.
- 브라우저 자동화만으로는 카메라 권한, 실제 네트워크 구간, TURN relay를 검증할 수 없다. 인터넷 구간 검증은 TLS/WSS, 실제 TURN, 서로 다른 네트워크의 두 계정, 실제 카메라 권한 상태에서 별도로 수행한다.
