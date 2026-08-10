# 인식 파이프라인과 AI 계약

카메라 프레임에서 게임 입력이 확정되기까지의 경계를 다룬다.

```text
SharedGameCameraSession
  → RecognitionFrameScheduler (render / hand / pose 주기 분리)
  → RecognitionVisionAdapter (MediaPipe | Remote)
  → PersonTrackManager + HandOwnerResolver ("내 손" 판정)
  → LatestOnlyInferenceController → AI WebSocket
  → ContinuousSignDecoder (확정 권위)
  → 게임 입력
```

## 1. 확정 권위는 프런트에 있다

| 주체 | 책임 | 하지 않는 것 |
| --- | --- | --- |
| AI 서버 | prediction과 top candidates 제공 | 게임 입력 확정, cooldown, 잠금 |
| 프런트 Decoder | 확정, 잠금, 해제 판정 | 모델에 없는 글자 생성 |
| `readiness.json` | 경쟁 출제 가능 글자, 심볼별 임계값 | — |

`readiness.json`의 `confirmationAuthority`가 `FRONTEND_TEMPORAL_DECODER`인 것이 이 경계다. `PythonWebSocketSignRecognizer`의 `modelVersion` 기본값이 `"frontend-temporal"`인 것도 같은 이유다.

서버 cooldown으로 연타를 막지 않는 이유는 세 가지다. 인식이 안 되는 글자가 "가끔 되는 것처럼" 보여 문제가 은폐되고, cooldown 동안 진짜 다음 입력도 무시되며, 네트워크 왕복이 판정에 들어가 반응성이 나빠진다.

## 2. 출제 가능 글자 게이팅

`game-contracts/recognition/readiness.json`이 유일한 원천이다. 서버 threshold, 프런트 출제 범위, 계약 테스트가 모두 이 파일을 읽는다. 상수를 코드에 복제하지 않는다.

| 필드 | 값 |
| --- | --- |
| `modelVersion` | `jamo-31-v1` |
| `evaluation.sampleCount` | 2790 |
| `evaluation.trainingIndependent` | **false** |
| `criteria.minimumConfirmationRate` | 0.85 |
| `criteria.minimumCompetitivePrecision` | 0.90 |

31개 클래스 중 `competitiveEligible`은 **24개**다.

| 제외 | 사유 |
| --- | --- |
| `ㅅ` | `ㅠ`가 `ㅅ`으로 분류됨. precision을 지키는 threshold가 존재하지 않는다 |
| `ㅠ` | 표본 90개 전부가 `ㅅ`으로 분류된다 |
| `ㅕ`, `ㅖ` | 서로 혼동된다 |
| `ㅏ`, `ㅓ`, `ㅔ` | 확정률 85% 미만 |

배틀 심볼 풀(`BATTLE_TARGET_SYMBOLS`)과 방 옵션 `symbolRange`(`자음`/`모음`/`기초 혼합`)는 `isCompetitiveRecognitionReady()`를 통과한 글자만 쓴다. 시드 100회로 카드 드로우·spawn까지 게이팅이 관철되는지 검증한다(`LocalBotPracticeReadiness.integration.test.ts`).

평가 데이터가 세션 간 랜덤 분할이므로 `trainingIndependent: false`이고 JSON에 경고 문구를 남겨 뒀다. 이 수치는 잠정 안전장치이지 독립 모델 인증이 아니다. 제외 글자를 되살리려면 새 사용자·새 촬영 세션으로 재학습하고 사용자 분리 validation을 통과한 뒤 이 JSON을 갱신해야 한다.

## 3. 주기 분리와 백프레셔

한 화면에서 카메라 갱신, Hand/Pose 추론, 스켈레톤 렌더, React 갱신, Pixi/Matter 렌더, AI 전송, WebRTC 인코딩이 메인 스레드를 공유한다. 모든 프레임을 순서대로 처리하면 느린 추론 하나로 큐가 쌓인다.

### 3.1 프로필

`recognition/runtime/RecognitionPerformanceProfiles.ts`가 원천이다.

| 프로필 | render | hand | pose | AI | 최대 추적 인원 | 최대 손 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `HIGH` | 60 | 30 | 12 | 15 | 4 | 4 |
| `BALANCED` (기본) | 30 | 24 | 8 | 12 | 4 | 4 |
| `LOW_POWER` | 30 | 18 | 6 | 8 | 2 | 2 |

`RecognitionRateConfig`의 `RESPONSIVE_GAMEPLAY`는 render 20 / hand 24 / pose 4 / AI 18이다. **24Hz latest-only가 과부하된 30~60Hz 큐보다 종단 지연이 낮기** 때문이다. 처리량을 올리는 것과 지연을 줄이는 것은 다르다.

`RecognitionFrameScheduler`가 단일 rAF 루프에서 프레임을 발행하고 소비자별 FPS 예산으로 팬아웃한다. `video.readyState >= 2 && video.currentTime !== lastMediaTime`일 때만 발행해 같은 프레임의 중복 추론을 차단한다. 리스너 예외는 try/catch로 격리한다.

### 3.2 latest-only

`LatestOnlyInferenceController`는 in-flight 1개 + 대기 최신 1개만 유지한다. 새 프레임이 오면 오래된 대기 프레임을 교체하고 `replacements`를 올린다.

응답 수락 조건 5개 중 하나라도 어기면 거부하고 `monitor.stale()`을 호출한다 — 미지 frameId / 다른 sessionId / 다른 activeHandId / `sequence <= lastAppliedSequence` / 나이 초과. `sent` 맵은 4개를 넘으면 오래된 것부터 제거한다.

**응답 나이는 랜드마크가 준비된 시점부터 계산한다.** 원본 비디오 캡처 시각부터 계산하면 MediaPipe가 느린 프레임에서 age budget(`maximumPredictionAgeMs`, 기본 750ms)이 이미 소진돼, AI가 정상 속도로 응답해도 전부 stale로 버려진다. 이 케이스는 테스트 `"starts response freshness when delayed landmarks are ready"`로 고정했다.

`rotateSession()`은 활성 손 세션이 바뀌면 시퀀스와 버퍼를 전부 초기화한다. 손 주인이 바뀌면 이전 추론은 전부 무효다.

### 3.3 계측

`RecognitionPerformanceMonitor`가 1초 슬라이딩 윈도로 camera/render/hand/pose/aiRequest/aiResponse FPS, 240샘플 링버퍼로 평균·p95, `PerformanceObserver`로 메인 스레드 롱태스크를 수집한다. publish는 250ms 스로틀.

스냅샷 필드에 `droppedHandFrames`, `droppedPoseFrames`, `droppedInferenceFrames`, `staleResponsesIgnored`, `mainThreadLongTaskCount`가 있다. **버린 프레임 수를 세는 것이 처리한 프레임 수보다 진단에 유용했다.**

> 이 계측기는 런타임 표시용이고 결과를 파일로 남기지 않는다. 프로필별 실제 p95 지연은 `미측정`이다.

### 3.4 스무딩 분리

| 용도 | 처리 |
| --- | --- |
| 움직임 분석 | raw |
| AI 전송 | 약한 스무딩 |
| 캔버스 표시 | 강한 스무딩 |

표시 좌표에만 이동 예측과 안정화를 적용하고 AI에는 원본 측정 좌표를 보낸다. 스무딩된 좌표를 AI에 보내면 정확도가 떨어지고, raw를 화면에 그리면 관절선이 떨린다.

## 4. "내 손"만 입력으로 받기

카메라 앞에 사람이 여러 명 있을 수 있다. `hands[0]`을 쓰면 뒤에 있는 사람이 손을 들 때 입력 주체가 바뀌고, Pose 배열 index는 영구 ID가 아니라서 두 사람이 교차하면 사용자가 뒤바뀐다.

**얼굴 인식은 쓰지 않는다.** 이 게임에 필요한 것은 "이 손이 등록된 사용자의 것인가"이고 "이 사람이 누구인가"가 아니다. 게임에 필요하지 않은 생체정보 문제를 만들지 않는다.

### 4.1 사람 추적

`PersonTrackManager` + `PersonDetectionMatcher`가 5개 신호 가중합으로 배정한다.

| 신호 | 가중치 | 계산 |
| --- | ---: | --- |
| 위치 | 0.25 | 중심 거리 / √2 |
| bounding box | 0.20 | 1 − IoU |
| 포즈 | 0.25 | 1 − cosine |
| 움직임 | 0.15 | 속도 벡터 cosine |
| 외형 | 0.15 | 1 − 히스토그램 cosine |

검증 함수가 **가중치 합 = 1**을 오차 1e-6으로 강제한다. 나중에 가중치를 조정하며 정규화를 잊으면 임계값의 의미가 조용히 바뀌는데 디버깅이 매우 어렵다.

배정은 백트래킹 완전탐색으로 비용을 최소화한다(트랙별 미배정 분기 비용 = `maximumMatchCost 0.82`). 최대 4명이라 탐색 공간이 작고 구현이 단순해 검증하기 쉽다.

외형 descriptor는 어깨폭(랜드마크 11-12), 골반폭(23-24), 몸통 비율과 16bin 토르소 색 히스토그램이다. 옷 색 같은 휘발성 값만 메모리에 둔다.

주요 상수: `temporaryLostGraceMs 1500`, `reidentificationTimeoutMs 5000`, `minimumRegistrationDurationMs 700`, `minimumLockScore 0.72`, `ambiguityScoreDifference 0.05`, `maximumMissedFrames 24`, `minimumPoseVisibility 0.35`, `maximumRegistrationVelocity 0.004`, `minimumRegistrationPoseSimilarity 0.88`.

### 4.2 손 소유권

`HandOwnerResolver`가 6개 신호를 가중합한다.

| 신호 | 가중치 | 계산 |
| --- | ---: | --- |
| 포즈 손목 거리 | 0.30 | `exp(-normalizedDistance * 1.8)` |
| 팔 방향 | 0.15 | |
| 시간 연속성 | 0.20 | `exp(-dist * 1.6)`, 이전 트랙 없으면 0.7 |
| handedness | 0.10 | 하한 0.5 |
| segmentation | 0.15 | 선택적 |
| Active Player 경계 | 0.10 | `exp(-dist / max(0.03, w) * 3)` |

거리 스케일을 어깨폭으로 정규화해 카메라 거리에 무관하게 만들었다. z축은 ×0.3으로 가중을 낮췄다(MediaPipe 상대 깊이값의 노이즈가 크다). `weightedOwnershipScore`는 누락된 신호의 가중치를 제외하고 재정규화하므로 segmentation이 없어도 나머지 5개로 판정이 성립한다.

handedness를 보조 신호로만 쓰는 이유는 셀피 미러링으로 좌우가 뒤집히기 때문이다. 공간상 손목 거리가 주 신호다.

### 4.3 애매하면 차단한다

`minimumOwnershipScore 0.62`, `minimumScoreGap 0.05`. 최고 점수가 낮거나 1·2위 차이가 작으면 입력을 버린다. `maximumNormalizedHandJump 1.5`를 넘는 순간이동은 다른 사람의 손이다.

차단 사유를 열거형으로 구분한다 — `NO_ACTIVE_PLAYER / NO_HAND / POSE_ANCHOR_UNAVAILABLE / LOW_CONFIDENCE / AMBIGUOUS / SUDDEN_JUMP / TEMPORARILY_LOST`.

판단 기준은 **다른 사람의 손을 잘못 받는 것보다 내 입력 한 번을 놓치는 것이 낫다**는 것이다. 잘못 받으면 게임 결과가 오염되고 원인도 알 수 없지만 놓치면 다시 하면 된다.

### 4.4 1인 플레이 fast path

Pose를 8Hz로 낮춘 결과, Pose 앵커가 없는 프레임에서 `POSE_ANCHOR_UNAVAILABLE`로 차단되어 혼자 플레이할 때 인식이 끊겨 보였다. Hand는 24Hz인데 판정이 8Hz로만 통과한 것이다.

`detectedPoseCount <= 1 && candidates.length === 1`이면 다중 인물 스코어링을 우회하고, 단독일 때 최소 점수도 `min(0.62, 0.5)`로 완화한다. **최악 시나리오(군중) 안전장치가 일반 시나리오(1인)를 망가뜨릴 수 있다.** 안전장치를 약화시키는 대신 경로를 나눴다.

### 4.5 등록과 상실

등록은 한 손을 머리 위로 드는 제스처다. `isRegistrationGesture()`가 랜드마크 11·12·13·14·15·16의 가시성 ≥ 0.35이고 손목(15/16)이 어깨(11/12)보다 −0.02 위인지 확인한다. 후보가 정확히 1명이고 속도 ≤ 0.004, 포즈 유사도 ≥ 0.88을 700ms 유지해야 lock한다. 후보가 2명 이상이면 `AMBIGUOUS`로 두고 등록하지 않는다.

상실 경로는 LOCKED → 트랙 소실 → `TEMPORARILY_LOST` → 1500ms 초과 → `REIDENTIFYING` → 최고점 ≥ 0.72이고 모호하지 않으면 재lock(`idSwitchCount++`) → 5000ms 안에 못 찾으면 `USER_LOST`다. 등록 사용자를 잃었다고 근처 다른 사람으로 자동 전환하지 않는다.

`idSwitchCount`는 품질 지표다. 높으면 재식별이 다른 사람으로 넘어가고 있을 가능성이 있다. 실제 군중 환경의 값은 `미측정`이다.

### 4.6 세션 무효화 연쇄

`ActiveHandTracker`가 소유권 통과 시 `ActiveHandSession{sessionId, activePlayerTrackId, activeHandId, startedAt}`을 발급한다. 실패가 `maximumMissedFrames 12`를 넘거나 `temporaryLostGraceMs 900`을 넘으면 무효화한다.

이 sessionId가 `LatestOnlyInferenceController`의 세션 회전 키로 전달되므로, **손 주인이 바뀌면 AI 추론 큐가 자동으로 비워진다.** 계층 간 연결을 sessionId 하나로 만든 것이 이 파이프라인에서 가장 유용한 설계였다.

## 5. 연속 지문자 Decoder

### 5.1 설정값

`recognition/temporal/SignDecoderConfig.ts`의 `DEFAULT_SIGN_DECODER_CONFIG`:

| 항목 | 값 | 역할 |
| --- | --- | --- |
| `minimumConfidence` | 0.75 | 기본 임계 |
| `minimumConfidenceBySymbol` | `RECOGNITION_CONFIDENCE_BY_SYMBOL` | 심볼별 실측 임계 |
| `candidateWindowSize` | 4 | 후보 창 |
| `minimumCandidateVotes` | 2 | 확정 최소 득표 |
| `minimumStableDurationMs` | 100 | 움직임 안정 최소 시간 |
| `movementThreshold` | 0.06 | 정지 판정 |
| `maximumPredictionAgeMs` | 1000 | 예측 유효 기간 |
| `releasePoseDistanceThreshold` | 0.12 | 해제 거리 |
| `releaseMinimumDurationMs` | 100 | 해제 유지 시간 |
| `noHandReleaseDurationMs` | 80 | 손 소실 해제 시간 |
| `differentSymbolReleaseVotes` | 2 | 다른 심볼 해제 득표 |

`RESPONSIVE_GAMEPLAY_SIGN_DECODER_CONFIG`는 창 2 / 득표 1 / 안정 35ms / 해제거리 0.09 / 해제 45ms로 더 민감하다.

검증 함수가 `minimumCandidateVotes <= candidateWindowSize`를 강제한다. 어긋나면 영원히 확정되지 않는 설정이 만들어지는데, 실행 중에는 "인식이 안 된다"로만 보여 원인을 찾기 어렵다.

### 5.2 확정 조건

```text
후보 창 4프레임 중 2표 이상  AND  움직임 안정 100ms 이상
```

득표만 쓰면 손을 움직이는 중에 지나간 모양이 확정되고, 안정 시간만 쓰면 모델이 흔들리는 예측을 내는 동안에도 확정된다. 둘을 함께 요구해야 "자세를 만들고 잠깐 유지했다"가 된다.

심볼별 임계값은 readiness의 실측값을 그대로 쓴다. 예를 들어 `ㅅ`의 threshold는 0.9999로 사실상 확정을 허용하지 않는다. 전체 임계를 올리면 잘 되는 글자까지 어려워지고 내리면 혼동 글자가 오확정되므로, 글자마다 캘리브레이션하는 쪽을 택했다.

### 5.3 해제 조건 세 개

| 경로 | 조건 | 필요한 이유 |
| --- | --- | --- |
| ① 자세 변경 | 확정 포즈와의 거리 > 0.12를 100ms 유지 | 손을 든 채 다른 모양을 만드는 경우 |
| ② 손 소실 | 손이 사라진 상태 80ms | 손을 내렸다 다시 드는 경우 |
| ③ 다른 심볼 | 다른 심볼 2표 | 빠른 연속 입력. 창만 비우고 곧바로 CANDIDATE로 간다 |

③이 없으면 `ㄱ` → `ㄴ` → `ㄷ`를 빠르게 입력할 때 매번 손을 완전히 내려야 한다. 실제 지문자 입력은 손을 유지한 채 모양만 바꾸는 동작이라 ③이 반응성의 핵심이다.

### 5.4 잠금 범위

한 번 겪은 버그다. 확정 후 hand-release 잠금이 다음 목표나 다른 문자까지 남아서, 인식한 글자가 바뀌었는데도 다시 시도되지 않았다.

목표가 바뀌거나 다른 문자가 확정되면 이전 잠금을 즉시 해제하고 **같은 문자의 중복 확정만** 차단하도록 범위를 좁혔다. 잠금은 "입력 금지"가 아니라 "같은 입력 반복 금지"여야 한다.

### 5.5 입력 검증 게이트

`validSample()`이 4중으로 검증하고 각각 카운터를 올린다 — 시퀀스 역행(`droppedPredictions`), 나이 초과(`stalePredictions`), 심볼별 임계 미달, 활성 손 세션 불일치. 카운터를 나눈 이유는 "인식이 안 된다"는 증상에서 원인이 지연인지 임계값인지 세션인지 구분하기 위해서다.

## 6. 게임 입력 어댑터

`RecognitionGameController`가 공개 `SignRecognizer` 인터페이스와 게임 입력 계약 사이의 어댑터다. Python WebSocket 구현을 게임 코드로 들여오지 않고 점수 규칙도 바꾸지 않는다.

- `CAPABILITIES`가 모델 버전과 지원 심볼을 보관한다.
- `PYTHON_AI` 모드에서 목표와 생성 글자는 `GAME_SYMBOLS ∩ supportedSymbols`를 쓴다.
- `SIGN_CONFIRMED`는 현재 목표와 일치할 때만 심볼을 제출한다.
- 런타임은 여전히 정착 우선 제거 대상을 고르고 하이라이트한 뒤 Matter에서 제거한다.
- `HAND_RELEASED`가 `releaseInput`을 호출해 입력 잠금을 푼다.
- 보드에 일치 심볼이 없으면 `NO_TARGET_ON_BOARD`로 보고하고 점수 관련 동작은 추가하지 않는다.
- `KEYBOARD` 모드는 등록부 40개 심볼 전체를 복원하며 AI 연결이 끊겨도 사용할 수 있다.

## 7. AI WebSocket 계약

주소는 `VITE_AI_WEBSOCKET_URL`로 주입한다(개발 기본값 `ws://localhost:8765`). 서버는 **랜드마크 JSON만** 받는다. 이미지와 비디오 페이로드는 이 계약에 없다.

### 클라이언트 요청

| Type | 필수 필드 | 효과 |
| --- | --- | --- |
| `GET_CAPABILITIES` | 없음 | 로드된 모델 계약 반환 |
| `LANDMARK_FRAME` | `frameId`, `capturedAt`, `handedness`, 21 `landmarks` | 이 연결의 시퀀스에 프레임 추가 |
| `HAND_NOT_DETECTED` | `capturedAt` | 손 해제 타이밍 시작·유지 |
| `RESET_SEQUENCE` | 없음 | 시퀀스·안정성·입력 잠금 초기화 |

모든 랜드마크는 유한한 숫자 `x`, `y`, `z`를 갖는다.

### 서버 응답

| Type | 주요 필드 |
| --- | --- |
| `CAPABILITIES` | `modelVersion`, `supportedSymbols`, `sequenceLength` |
| `PREDICTION` | `frameId`, `symbol`, `confidence`, `isStable`, `predictedAt` |
| `SIGN_CONFIRMED` | `symbol`, `confidence`, `confirmedAt`, `modelVersion` |
| `HAND_RELEASED` | `releasedAt` |
| `ERROR` | `code`, `message` |

`supportedSymbols`는 로드된 모델의 라벨 순서다. 게임 등록부는 이것과 교집합을 계산하므로 모델에 있는 라벨이라도 등록부에 없으면 게임에 섞이지 않는다. 어댑터는 `withoutNumericPrediction()`으로 숫자 예측을 걸러낸다.

> 서버의 `SIGN_CONFIRMED`는 레거시 경로다. 현재 게임 입력 확정은 프런트 `ContinuousSignDecoder`가 담당한다(1절 참조). 두 경로가 공존하므로 어느 쪽이 권위인지 코드에서 `continuousSignDecoderEnabled` 플래그로 명시한다.

### 검증 오류

`INVALID_JSON` / `INVALID_MESSAGE` / `INVALID_LANDMARK` / `INVALID_LANDMARK_COUNT`(21개가 아님) / `UNSUPPORTED_MESSAGE`

### 연결 복구

`PythonWebSocketSignRecognizer`는 `min(500 * 2^attempt, 8000)`ms 지수 backoff로 재접속하고, **생성·오류·종료 어느 경로에서든** 다음 재접속을 예약한다. 경로 하나를 빠뜨리면 특정 실패 유형에서만 영구 단절되는데 재현이 어렵다.

`HAND_MISSING_SEND_INTERVAL_MS 80`, `DIRECT_INFERENCE_TIMEOUT_MS 900`.

MediaPipe도 같은 원칙이다. worker가 실패하면 즉시 main-thread tracker로 전환하고, main-thread의 일시 실패는 해당 프레임만 버리고 다음 프레임에서 tracker를 다시 초기화한다.

## 8. 비전 어댑터 교체

`recognition/vision/RecognitionVisionAdapter.ts`가 포트다. `initialize` / `detectHands` / `detectPoses` / `getExecutionMode` / `close`를 제공하고 실행 모드는 `WORKER | MAIN_THREAD | REMOTE`다.

```text
HandCamera
  → RecognitionVisionAdapterFactory.create(options)
  → MediaPipeRecognitionVisionAdapter (기본) 또는 RemoteRecognitionVisionAdapter
```

`@mediapipe/tasks-vision` import, Fileset/WASM 초기화, landmarker 생성은 MediaPipe 구현 안에만 둔다. 페이지, 게임 코어, 인식 세션에서 MediaPipe 타입이나 모델 경로를 새로 참조하지 않는다.

### 원격 구현으로 교체하는 절차

1. `RemoteRecognitionVisionTransport`를 구현한다.
2. `createRemoteRecognitionVisionAdapterFactory(transportFactory)`로 factory를 만든다.
3. 앱 조립 지점의 `GameModuleServices.recognitionVisionAdapterFactory`에 한 번 주입한다.
4. `HandCamera`와 기능 페이지는 수정하지 않는다.

transport는 session, `frameId`, capture timestamp, handedness, 정규화된 21개 랜드마크, 선택적 pose 결과의 순서를 보존해야 한다. 응답이 늦게 오면 이전 session/frame 결과를 버리고, 처리 중 요청 1개·대기 프레임 최신 1개만 유지한다.

원격 구현이 랜드마크가 아니라 영상 프레임을 보내야 한다면 인증, TLS, 해상도, 전송 빈도, 서버 보존 금지, 개인정보 고지를 먼저 확정한다. 이 정책 차이는 transport 안에 머물러야 하고 게임 DTO로 새어 나오면 안 된다.

### 수명주기 규칙

- adapter는 전달받은 video/stream을 소유하지 않는다. `close()`에서 landmarker와 자체 worker/connection만 닫고 공유 `MediaStreamTrack`을 중지하지 않는다.
- `initialize()` 실패는 호출자에게 전달해 기존 카메라 오류 UI가 표시되게 한다.
- `detectHands`와 `detectPoses`는 같은 frame timestamp를 쓴다.
- worker 불가 시 main-thread fallback 여부를 execution mode로 보고한다.
- unmount, 구현체 교체, 새 camera session 시작 시 이전 adapter를 반드시 닫는다.

## 9. 공유 카메라

`SharedGameCameraSession`이 카메라 track의 **유일한 소유자**다.

- 기본 제약: 640×360, 15FPS ideal / 20FPS max, `audio: false`, `facingMode: "user"`
- 동시에 여러 곳에서 `start()`해도 in-flight promise와 살아 있는 stream을 공유해 `getUserMedia`는 한 번만 호출된다.
- 로컬 preview, MediaPipe, 랜드마크 생성, WebRTC peer 최대 3개가 같은 video track을 공유한다.
- 소비자는 `srcObject`와 sender 연결만 정리하고 원본 track을 stop하지 않는다.
- `generation` 카운터로, 시작 도중 화면을 이탈했으면 늦게 열린 stream을 즉시 종료한다.
- `GameCameraRouteLifecycle`이 게임 라우트를 벗어나면 자동 정지한다.
- 방 이탈이나 모듈 종료 시 peer와 signaling을 먼저 정리한 뒤 Shared Camera만 track을 종료한다.

해상도를 낮게 고정한 것은 MediaPipe 추론과 WebRTC 인코딩이 같은 CPU를 쓰기 때문이다.

### 좌표와 좌우 반전

video와 canvas는 같은 absolute box, 같은 `width/height: 100%`를 쓰고 canvas intrinsic 크기를 `video.videoWidth/videoHeight`에 맞춘다. MediaPipe 정규화 좌표는 반전하지 않고 그대로 그린 뒤, video와 canvas 양쪽에 같은 CSS `scaleX(-1)`을 적용해 화면에서만 거울 반전시킨다. 코드에서 landmark x를 다시 뒤집으면 이중 반전이 생긴다.

`canvasCoordinates.ts`는 카드에 실제로 노출되는 원본 crop을 계산한다. 손의 21개 랜드마크가 모두 crop 안에 있을 때만 보이는 손으로 취급하고, 보이지 않는 영역의 손은 관절선 렌더링과 AI 입력에서 모두 제외한다. 카메라 UI를 바꿀 때는 CSS `object-fit` 방식과 좌표 계산의 fit 모드를 함께 유지해야 한다.

## 10. 포즈 피드백

`recognition/feedback/poseFeedback.ts`는 사용자가 직접 가져온 정규화 `STATIC_TEMPLATE`과 실시간 랜드마크만 비교한다. 분류기 예측만으로는 관절 피드백을 만들지 않는다.

`HAND_BONES` 연결마다 정규화 3D 방향 각도와 상대 길이 오차를 독립 평가한다.

| 상태 | 각도 오차 | 길이 오차 | 표시 |
| --- | --- | --- | --- |
| `CORRECT` | ≤ 10° | ≤ 8% | 기본 색 유지 |
| `CLOSE` | ≤ 25° | ≤ 20% | 해당 연결만 노랑 |
| `WRONG` | 임계 초과 | 임계 초과 | 빨강 |

정렬된 기준 스켈레톤은 파란 점선으로 표시한다.

템플릿이 없거나, 심볼이 활성 목표와 다르거나, handedness를 모르거나, `feedbackMode`가 `CLASSIFICATION_ONLY`이면 상세 피드백을 만들지 않는다.

엄지·검지·중지·약지·소지 중 누적 오차가 가장 큰 손가락이 미리 정의된 한국어 메시지 하나를 선택한다. 계산된 뼈 오차 기반 결정론적 규칙이며 언어 모델을 쓰지 않는다.

> 이것은 기하학적 보조이지 한국 수어의 정확성 판단이 아니다. 카메라 각도, 손 가림, MediaPipe 추적 품질, 잘못 촬영된 기준 템플릿 모두 오해를 부르는 피드백을 만들 수 있다.

### 기준 템플릿의 현재 상태

`recognition/template/templateRepository.ts`가 남아 있으나 **이를 사용하는 페이지는 현재 없다.** `recognition/index.ts`에서만 export되는 미사용 경로다. 기준 랜드마크 템플릿은 제공하지 않으며 임의 좌표를 생성하지 않는다.

템플릿 캡처를 다시 도입한다면 지켜야 할 조건을 남겨 둔다.

- 알려진 `LEFT` 또는 `RIGHT` handedness만 사용하고 세션의 첫 수락 손을 고정한다.
- 각 수락 프레임은 유한한 21개 랜드마크를 갖고 저장 전 정규화한다.
- 100ms에 최대 한 번 샘플링해 거의 동일한 연속 프레임이 템플릿을 지배하지 않게 한다.
- 최소 20개 수락 프레임이 필요하다.
- 대표 랜드마크는 수락 샘플의 좌표별 중앙값을 쓴다. 순간적 jitter와 이상치의 영향을 줄이면서 결정적이고 JSON import 시 검증하기 쉽다. 결과 포즈가 해부학적으로 옳다는 주장은 아니다.
- 사람이 검토해야 한다. 시스템은 그 사람이 의도한 지문자를 정확히 수행했는지 판단할 수 없다.
- 내보낸 파일 하나는 `version`, `symbol`, `handedness`, `feedbackMode`, `sampleCount`, `createdAt`, 21개 정규화 `landmarks`, `normalizationVersion`을 담는다.

## 11. 개인정보 경계

AI 서버에는 **최종 선택된 손의 랜드마크만** 보낸다.

- 얼굴 검출·embedding·crop을 사용하지 않는다.
- 사람 추적용 외형 descriptor는 메모리에만 두고 전송하지 않는다.
- segmentation 마스크, 원본 영상 프레임을 보내지 않는다.
- 개발 모드 계측 JSON에도 영상, 이미지, 랜드마크, 얼굴 정보, 원본 WebSocket payload를 넣지 않는다.
- `LearningStatistics`는 집계 카운터만 저장하고 원시 예측 이력을 보관하지 않는다.

## 12. 오류 표현과 접근성

- 카메라 오류는 하드웨어 없음, 권한 거부, MediaPipe 초기화 실패, 알 수 없는 시작 오류를 구분한다.
- AI 인식 오류는 서버 미가용, 모델 로드 실패, 잘못된 프로토콜 메시지, 알 수 없는 오류를 구분한다.
- 연결 상태 라벨은 `AI 인식 서버`로 명시해 카메라·MediaPipe 상태와 구분한다. 두 상태를 하나처럼 보이게 하면 진단이 불가능해진다. **진단 가능성도 기능이다.**
- 연결 상태는 텍스트 라벨을 유지한다. 인식 결과와 손 해제 안내에도 텍스트를 포함하고 오류에는 알림 아이콘을 넣는다.
- 템플릿 없음은 중립적 텍스트 상태로 유지하고 기준 포즈를 만들어내지 않는다.

## 13. 검증

```powershell
cd frontend
npm.cmd exec -- vitest run src/shared/mediapipe src/game/recognition --maxWorkers=1 --fileParallelism=false
```

| 파일 | 케이스 | 검증 |
| --- | ---: | --- |
| `ContinuousSignDecoder.test.ts` | 12 | 연타 방지, 손 유지 전환, A-B-C 연속, 심볼별 임계, 지터 미확정 |
| `HandOwnerResolver.test.ts` | 8 | 미러링, 1인 fast path, 신호 결손 재정규화, 모호 차단 |
| `LatestOnlyInferenceController.test.ts` | 4 | in-flight 1개, 응답 5중 검증, 세션 회전, 신선도 기준점 |
| `LocalBotPracticeReadiness.integration.test.ts` | 2 | 시드 100회 게이팅 관철 |

### 변경 체크리스트

- 새 구현이 `RecognitionVisionAdapter`만 구현하는가
- `HandCamera`나 게임 페이지에 구현체 분기가 추가되지 않았는가
- 공유 camera stream을 adapter가 종료하지 않는가
- 한 손, 두 손/두 사람, 손이 사라짐, 손을 내렸다 다시 올림을 구분하는가
- frame 순서 역전과 느린 응답에 대한 backpressure가 있는가
- 실제 브라우저에서 카메라 권한, worker/main-thread fallback, 장시간 실행 후 자원 해제를 확인했는가
