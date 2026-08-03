# AI 예측을 게임 입력으로 만드는 경계 — 확정 권위를 프런트로 옮긴 이유

작성: 2026-08-03
대상: `frontend/src/game/recognition`
짝 문서: `docs/ai-model-improvement-report.md` (모델 측 개선 과정)

## 이 문서의 위치

AI 문서가 **"모델이 무엇을 얼마나 맞히는가"**를 다룬다면, 이 문서는 **"그 예측을 언제 게임 입력으로 확정하는가"**를 다룬다. 두 문서는 `game-contracts/recognition/readiness.json`에서 만난다. 그 파일의 필드 하나가 이 문서의 결론이다.

```json
"confirmationAuthority": "FRONTEND_TEMPORAL_DECODER"
```

모델 정확도가 98%라도, 손을 들고 있는 동안 초당 24번 확정되면 게임은 플레이할 수 없다. 반대로 안정화 시간을 길게 잡으면 이미 자세를 만들었는데 게임이 반응하지 않는다. 이 문서는 그 사이를 어떻게 잡았는지에 대한 기록이다.

### 근거의 한계

프런트에는 회차별 계측 로그가 없다. `RecognitionPerformanceMonitor`가 17개 필드를 런타임 수집하지만 결과를 저장하지 않는다. 따라서 근거는 코드 상수, 테스트 케이스 이름, `readiness.json`의 실측값이다. 계측하지 않은 항목은 `미측정`, 추론은 `코드 기반 추정`, 기록이 없으면 `확인 필요`로 표시한다.

---

## 1. 문제 정의 — 세 가지가 동시에 성립해야 한다

| 요구 | 실패 모드 |
| --- | --- |
| 반응성 | 자세를 만들었는데 게임이 늦게 반응한다 |
| 연타 방지 | 손을 유지하는 동안 같은 입력이 반복된다 |
| 오입력 방지 | 지터나 전환 중 모양이 확정된다 |

세 개가 서로 반대 방향으로 당긴다. 그리고 조건이 하나 더 있다. **모델이 특정 글자를 신뢰할 수 없다.** AI 문서의 결론대로 `ㅅ`/`ㅠ`는 구조적으로 혼동되고, threshold 조정으로 해결되지 않는다.

여기서 중요한 판단을 했다. **인식률 문제를 반응성으로 덮지 않는다.** 처음 논의된 방식은 서버가 cooldown을 두는 것이었다. 확정 후 일정 시간 예측을 무시하면 연타가 막힌다. 하지만:

- 인식이 잘 안 되는 글자도 cooldown 때문에 "가끔 되는 것처럼" 보여서 문제가 은폐된다
- cooldown 동안 진짜 다음 입력도 무시되므로 빠른 연속 입력이 불가능하다
- 네트워크 왕복이 판정에 들어가 반응성이 나빠진다

그래서 **확정 권위를 프런트로 옮기고, 인식률 문제는 게이팅으로 따로 처리**했다.

---

## 2. 역할 분리

| 주체 | 책임 | 하지 않는 것 |
| --- | --- | --- |
| AI 서버 | prediction + top candidates 제공 | 게임 입력 확정, cooldown, 잠금 |
| 프런트 Decoder | 확정, 잠금, 해제 판정 | 모델에 없는 글자 생성 |
| `readiness.json` | 경쟁 출제 가능 글자와 심볼별 임계값 | — |

`PythonWebSocketSignRecognizer`의 `modelVersion` 기본값이 `"frontend-temporal"`인 것도 이 경계를 드러낸다. 게임이 보는 "모델"은 서버 모델이 아니라 서버 예측 + 프런트 확정기의 조합이다.

프런트가 지키는 제약도 명시했다. **모델에 없는 글자를 만들어내지 않는다.** 문맥으로 후보를 좁히는 것(`ContextualPredictionSelector`)은 하되, 후보에 없는 글자를 추가하지는 않는다.

### 개인정보 경계

같이 고정한 것이 있다. AI 서버에는 **최종 선택된 손의 랜드마크만** 보낸다.

- 얼굴 검출·embedding·crop을 사용하지 않는다
- 사람 추적용 외형 descriptor(옷 색 히스토그램 등)는 메모리에만 두고 전송하지 않는다
- segmentation 마스크, 원본 영상 프레임을 보내지 않는다
- 개발 모드 계측 JSON에도 영상·이미지·랜드마크·얼굴 정보·원본 payload를 넣지 않는다

원격 구현이 랜드마크가 아니라 영상 프레임을 보내야 한다면 인증·TLS·해상도·전송 빈도·서버 보존 금지·개인정보 고지를 먼저 확정한다는 조건을 어댑터 문서에 남겼다. 이 정책 차이는 transport 안에 머물러야 하고 게임 DTO로 새어 나오면 안 된다.

---

## 3. 연속 지문자 Decoder

`recognition/temporal/`의 6상태 머신 + 후보 창 + 해제 감지기 구조다.

### 3.1 상태

`SignDecoderStateMachine`: `NO_HAND / TRACKING / MOVING / CANDIDATE / CONFIRMED / RELEASE_WAIT`. 전이는 화이트리스트이고 위반하면 예외를 던진다.

### 3.2 설정값

`SignDecoderConfig.ts`의 `DEFAULT_SIGN_DECODER_CONFIG`:

| 항목 | 값 | 역할 |
| --- | --- | --- |
| `minimumConfidence` | 0.75 | 기본 임계 |
| `minimumConfidenceBySymbol` | `RECOGNITION_CONFIDENCE_BY_SYMBOL` | **심볼별 실측 임계값** |
| `candidateWindowSize` | 4 | 후보 창 크기 |
| `minimumCandidateVotes` | 2 | 확정 최소 득표 |
| `minimumStableDurationMs` | 100 | 움직임 안정 최소 시간 |
| `movementThreshold` | 0.06 | 정지 판정 |
| `maximumPredictionAgeMs` | 1000 | 예측 유효 기간 |
| `releasePoseDistanceThreshold` | 0.12 | 해제 판정 거리 |
| `releaseMinimumDurationMs` | 100 | 해제 유지 시간 |
| `noHandReleaseDurationMs` | 80 | 손 소실 해제 시간 |
| `differentSymbolReleaseVotes` | 2 | 다른 심볼 해제 득표 |

`RESPONSIVE_GAMEPLAY_SIGN_DECODER_CONFIG`는 창 2 / 득표 1 / 안정 35ms / 해제거리 0.09 / 해제 45ms로 더 민감하다.

검증 함수가 `minimumCandidateVotes <= candidateWindowSize`를 강제한다. 두 값이 어긋나면 영원히 확정되지 않는 설정이 만들어지는데, 그건 실행 중에는 "인식이 안 된다"로만 보여서 원인을 찾기 어렵다.

### 3.3 확정 조건 — 두 신호를 AND로 묶었다

```
후보 창 4프레임 중 2표 이상  AND  움직임 안정 100ms 이상
```

득표만 쓰면 손을 움직이는 중에 지나간 모양이 확정된다. 안정 시간만 쓰면 모델이 흔들리는 예측을 내는 동안에도 확정된다. 둘을 함께 요구해야 "자세를 만들고 잠깐 유지했다"가 된다.

테스트 `"does not confirm alternating jitter predictions without enough votes"`가 지터 케이스를 고정한다.

### 3.4 심볼별 임계값 — 여기가 AI 문서와 이어진다

전체 임계값을 올리면 인식 잘 되는 글자까지 어려워진다. 내리면 혼동 글자가 오확정된다. 그래서 **글자마다 다른 임계값**을 쓰고, 그 값을 `readiness.json`의 실측 threshold에서 가져온다.

예를 들어 `ㅅ`의 threshold는 0.9999다. precision이 0.4709이므로 사실상 확정을 허용하지 않는 값이다. AI 문서에서 "precision을 지키는 threshold가 존재하지 않는다"고 결론 낸 글자가, 프런트에서는 이 숫자로 반영된다.

테스트 `"uses calibrated per-symbol confidence without lowering every class"`.

### 3.5 해제 조건 세 개 — 연타 방지의 핵심

확정 후 다시 입력을 받으려면 해제되어야 한다. 경로가 세 개다.

| 경로 | 조건 | 필요한 이유 |
| --- | --- | --- |
| ① 자세 변경 | 확정 포즈와의 거리 > 0.12를 100ms 유지 | 손을 든 채로 다른 모양을 만드는 경우 |
| ② 손 소실 | 손이 사라진 상태 80ms | 손을 내렸다 다시 드는 경우 |
| ③ 다른 심볼 | 다른 심볼 2표 | 빠른 연속 입력. 이 경로는 창만 비우고 곧바로 CANDIDATE로 간다 |

③이 없으면 `ㄱ` → `ㄴ` → `ㄷ`를 빠르게 입력할 때 매번 손을 완전히 내려야 한다. 실제 지문자 입력은 손을 유지한 채 모양만 바꾸는 동작이라서, ③이 반응성의 핵심이다.

테스트 세 개가 각 경로를 고정한다.

- `"prevents repeats while the same pose is held"` (①·②의 목적)
- `"releases to a stable different symbol without removing the hand"` (③)
- `"emits a fast A-B-C sequence once per stable symbol"` (③의 실사용 시나리오)

### 3.6 잠금 해제 범위 문제

한 번 겪은 버그다. 확정 후 hand-release 잠금이 **다음 목표나 다른 문자까지** 남았다. 인식한 글자가 바뀌었는데도 다시 시도되지 않았다.

목표가 바뀌거나 다른 문자가 확정되면 이전 입력 잠금을 즉시 해제하고, **같은 문자의 중복 확정만** 차단하도록 범위를 좁혔다. 잠금은 "입력 금지"가 아니라 "같은 입력 반복 금지"여야 했다.

### 3.7 입력 검증 게이트

`validSample()`이 4중으로 검증하고 각각 카운터를 올린다.

- 시퀀스 역행 → `droppedPredictions++`
- 나이 초과 → `stalePredictions++`
- 심볼별 임계 미달 → 폐기
- 활성 손 세션 불일치 → 폐기

카운터를 나눈 이유는 진단이다. "인식이 안 된다"는 증상에서 원인이 지연인지 임계값인지 세션인지 구분할 수 있어야 한다.

---

## 4. 실패 기록 — 응답 신선도의 기준점을 잘못 잡았다

### 증상

AI 서버는 정상 동작하는데 게임에서 인식이 거의 되지 않았다. 서버에 20회 연속 WebSocket 연결을 시도해 모두 성공했고 서버 단위 테스트도 통과했다. 서버 문제가 아니었다.

### 원인

`LatestOnlyInferenceController`가 응답 나이를 **원본 비디오 캡처 시각**부터 계산했다.

```
capturedAt(비디오 프레임) → MediaPipe 추론 → 랜드마크 → AI 전송 → AI 응답
                          └────── 이 구간이 느리면 ──────┘
```

MediaPipe 추론이 느린 프레임에서는 랜드마크가 준비된 시점에 이미 age budget(750ms) 상당이 소모돼 있었다. AI가 정상 속도로 응답해도 도착 시점에 stale로 판정돼 전부 버려졌다.

### 조치

`flush()`에서 `capturedAt`을 **랜드마크가 실제 준비된 시점으로 재설정**한다. age budget은 "AI 왕복이 얼마나 걸렸나"를 재는 값이어야 하고, MediaPipe 지연은 거기 포함되면 안 된다.

테스트 `"starts response freshness when delayed landmarks are ready"`.

### 이 실패에서 배운 것

이건 AI 문서 6장의 "데이터 문제가 아니라 입력 표현 문제"와 판단 구조가 같다. **증상(인식 안 됨)에서 가장 가까운 원인(모델, 임계값, 네트워크)을 의심했지만 실제 원인은 시간 기준점이었다.** 서버를 20회 테스트해 서버가 정상임을 먼저 확인한 것이 원인 범위를 좁히는 데 결정적이었다.

관련해서 화면 표시도 고쳤다. `CONNECTED/DISCONNECTED` 라벨이 카메라·MediaPipe 상태가 아니라 AI WebSocket 상태였는데, 문구가 두 상태를 하나처럼 보이게 했다. `AI 인식 서버`로 명시해 분리했다. **진단 가능성도 기능이다.**

---

## 5. 파이프라인 백프레셔

### 5.1 주기 분리

한 화면에서 카메라 갱신, Hand/Pose 추론, 스켈레톤 렌더, React 갱신, Pixi/Matter 렌더, AI 전송, WebRTC 인코딩이 메인 스레드를 공유한다. 모든 프레임을 순서대로 처리하면 느린 추론 하나로 큐가 쌓인다.

`RecognitionFrameScheduler`가 단일 rAF 루프에서 프레임을 발행하고 소비자별 FPS 예산으로 팬아웃한다. `video.readyState >= 2 && video.currentTime !== lastMediaTime`일 때만 발행해 **같은 프레임의 중복 추론을 차단**한다. 리스너 예외는 try/catch로 격리해 한 소비자의 오류가 루프를 멈추지 않게 했다.

`RecognitionPerformanceProfiles.ts`:

| 프로필 | render | hand | pose | AI | 최대 추적 인원 | 최대 손 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HIGH | 60 | 30 | 12 | 15 | 4 | 4 |
| BALANCED (기본) | 30 | 24 | 8 | 12 | 4 | 4 |
| LOW_POWER | 30 | 18 | 6 | 8 | 2 | 2 |

`RecognitionRateConfig.ts`의 `RESPONSIVE_GAMEPLAY`는 render 20 / hand 24 / pose 4 / AI 18이다. 코드 주석에 근거를 남겼다 — **"24Hz latest-only가 과부하된 30~60Hz 큐보다 종단 지연이 낮다."** 처리량을 올리는 것과 지연을 줄이는 것이 다르다.

Pose를 Hand보다 훨씬 낮게(8Hz) 둔 것은 Pose가 사람 위치 추적용이고 손 모양만큼 자주 필요하지 않기 때문이다. 이 결정이 6장의 부작용을 만든다.

### 5.2 latest-only

`LatestOnlyInferenceController`: in-flight 1개 + 대기 최신 1개. 새 프레임이 오면 오래된 대기 프레임을 교체하고 `replacements++`.

응답 수락 조건 5개 중 하나라도 어기면 거부하고 `monitor.stale()`을 호출한다 — 미지 frameId / 다른 sessionId / 다른 activeHandId / `sequence <= lastAppliedSequence` / 나이 초과.

`sent` 맵은 4개를 넘으면 오래된 것부터 제거한다. 응답이 오지 않는 요청이 쌓여 메모리가 증가하지 않게 하는 상한이다.

`rotateSession()`은 활성 손 세션이 바뀌면 시퀀스와 버퍼를 전부 초기화한다. **손 주인이 바뀌면 이전 추론은 전부 무효다.** 테스트 `"invalidates a late response when the active hand session changes"`.

### 5.3 계측

`RecognitionPerformanceMonitor`: 1초 슬라이딩 윈도로 camera/render/hand/pose/aiRequest/aiResponse FPS, 240샘플 링버퍼로 평균·p95(`ceil(n*0.95)-1` 인덱스), `PerformanceObserver({entryTypes:["longtask"]})`로 메인 스레드 롱태스크 카운트. publish는 250ms 스로틀.

스냅샷 필드에 `droppedHandFrames`, `droppedPoseFrames`, `droppedInferenceFrames`, `staleResponsesIgnored`, `mainThreadLongTaskCount`가 있다. **버린 프레임 수를 세는 것이 처리한 프레임 수보다 진단에 유용했다.**

> 이 계측기는 런타임 표시용이고 결과를 파일로 남기지 않는다. 따라서 프로필별 실제 p95 지연은 `미측정`이다. AI 문서처럼 수치 비교를 하려면 이 부분을 먼저 기록해야 한다.

### 5.4 스무딩 분리

랜드마크 스무딩을 용도별로 나눴다.

| 용도 | 처리 |
| --- | --- |
| 움직임 분석 | raw (스무딩 없음) |
| AI 전송 | 약한 스무딩 |
| 캔버스 표시 | 강한 스무딩 |

표시용 좌표에만 이동 예측과 안정화를 적용하고 **AI에는 원본 측정 좌표를 보낸다.** 스무딩된 좌표를 AI에 보내면 인식 정확도가 떨어지고, raw 좌표를 화면에 그리면 관절선이 떨린다. 같은 데이터의 용도가 다르면 전처리도 달라야 한다.

---

## 6. 다중 인물 환경에서 "내 손"을 고르기

발표 환경에는 카메라 앞에 사람이 여러 명 있다. `hands[0]`을 쓰면 뒤에 있는 사람이 손을 들 때 입력 주체가 바뀐다. Pose 결과 배열 index도 사람의 영구 ID가 아니라서 두 사람이 교차하면 사용자가 뒤바뀐다.

### 6.1 먼저 배제한 접근

| 방식 | 배제 이유 |
| --- | --- |
| `hands[0]` / `poses[0]` 고정 | 교차·가림에 무력 |
| 화면 중앙 우선 | 사용자가 중앙에 있다는 보장이 없다 |
| **얼굴 인식으로 사용자 식별** | 게임에 필요하지 않은 생체정보 문제를 만든다 |
| handedness 단독 판정 | 셀피 미러링으로 좌우가 뒤집힌다 |
| 사용자 상실 시 가장 가까운 사람으로 자동 전환 | 다른 사람이 게임을 이어받는다 |

얼굴 인식 배제는 기술적 판단이 아니라 **범위 판단**이었다. 이 게임에 필요한 것은 "이 손이 등록된 사용자의 손인가"이고, "이 사람이 누구인가"는 필요하지 않다.

### 6.2 사람 추적

`PersonTrackManager` + `PersonDetectionMatcher`. 5개 신호 가중합으로 트랙-검출을 배정한다.

| 신호 | 가중치 | 계산 |
| --- | ---: | --- |
| 위치 | 0.25 | 중심 거리 / √2 |
| bounding box | 0.20 | 1 − IoU |
| 포즈 | 0.25 | 1 − cosine |
| 움직임 | 0.15 | 속도 벡터 cosine |
| 외형 | 0.15 | 1 − 히스토그램 cosine |

검증 함수가 **가중치 합 = 1**을 오차 1e-6으로 강제한다. 가중치를 나중에 조정할 때 정규화를 잊으면 임계값의 의미가 조용히 바뀌는데, 그건 디버깅이 매우 어렵다.

배정은 **백트래킹 완전탐색**으로 비용을 최소화한다(트랙별 "미배정" 분기 비용 = `maximumMatchCost 0.82`). 헝가리안 알고리즘을 쓰지 않은 이유는 최대 4명이라 탐색 공간이 작고, 구현이 단순해 검증하기 쉽기 때문이다.

외형 descriptor는 어깨폭(랜드마크 11-12), 골반폭(23-24), 몸통 높이 비율과 16bin 토르소 색 히스토그램이다. 옷 색 같은 휘발성 값만 쓰고 메모리에만 둔다.

주요 상수(`ActivePlayerConfig.ts`): `temporaryLostGraceMs 1500`, `reidentificationTimeoutMs 5000`, `minimumRegistrationDurationMs 700`, `minimumLockScore 0.72`, `ambiguityScoreDifference 0.05`, `maximumMissedFrames 24`, `minimumPoseVisibility 0.35`, `maximumRegistrationVelocity 0.004`, `minimumRegistrationPoseSimilarity 0.88`.

### 6.3 손 소유권

`HandOwnerResolver`. 6개 신호 가중합.

| 신호 | 가중치 | 계산 |
| --- | ---: | --- |
| 포즈 손목 거리 | 0.30 | `exp(-normalizedDistance * 1.8)` |
| 팔 방향 | 0.15 | |
| 시간 연속성 | 0.20 | `exp(-dist * 1.6)`, 이전 트랙 없으면 0.7 |
| handedness | 0.10 | 하한 0.5 |
| segmentation | 0.15 | 선택적 |
| Active Player 경계 | 0.10 | `exp(-dist / max(0.03, w) * 3)` |

거리 스케일을 **어깨폭으로 정규화**해 카메라 거리에 무관하게 만들었다. z축은 ×0.3으로 가중을 낮췄다. MediaPipe의 상대 깊이값에 노이즈가 크기 때문이다(AI 문서 2장에서 초기에 z를 제외했던 것과 같은 이유이고, 여기서는 제외하지 않고 가중을 낮추는 쪽을 택했다).

`weightedOwnershipScore`는 **누락된 신호의 가중치를 제외하고 재정규화**한다. segmentation이 없는 환경에서도 나머지 5개로 판정이 성립한다. 테스트 `"reweights remaining evidence when segmentation is unavailable"`.

### 6.4 애매하면 차단한다

`minimumOwnershipScore 0.62`, `minimumScoreGap 0.05`. 최고 점수가 낮거나 1·2위 차이가 작으면 입력을 버린다. 차단 사유를 열거형으로 구분했다.

`NO_ACTIVE_PLAYER / NO_HAND / POSE_ANCHOR_UNAVAILABLE / LOW_CONFIDENCE / AMBIGUOUS / SUDDEN_JUMP / TEMPORARILY_LOST`

`maximumNormalizedHandJump 1.5` — 정규화 거리 1.5를 넘는 순간이동은 다른 사람의 손이다.

판단 기준: **다른 사람의 손을 잘못 받는 것보다 내 입력 한 번을 놓치는 것이 낫다.** 잘못 받으면 게임 결과가 오염되고 원인도 알 수 없지만, 놓치면 다시 하면 된다.

관련 테스트: `"selects the active player's wrist rather than a surrounding person's hand"`, `"blocks similar ownership candidates as ambiguous"`, `"blocks input without a locked active player"`, `"blocks missing pose wrists when multiple people are present"`.

### 6.5 실패 기록 — 1인 플레이에서 정상 손이 깜빡였다

5장에서 Pose를 8Hz로 낮춘 결과다. Pose 앵커가 없는 프레임에서는 `POSE_ANCHOR_UNAVAILABLE`로 차단되므로, Hand는 24Hz로 들어오는데 판정이 8Hz로만 통과했다. 혼자 플레이하는 대부분의 상황에서 인식이 끊겨 보였다.

**엄격한 다중 인물 판정이 실제 사용 조건과 맞지 않았다.**

조치: `detectedPoseCount <= 1 && candidates.length === 1`이면 다중 인물 스코어링을 우회한다. 단독일 때는 최소 점수도 `min(0.62, 0.5)`로 완화한다.

테스트 `"allows the sole hand of the sole registered player even when a pose anchor briefly disappears"`, `"does not drop the sole registered user's fast hand movement"`.

이 케이스가 남긴 교훈: **최악 시나리오(군중)를 기준으로 만든 안전장치가 일반 시나리오(1인)를 망가뜨릴 수 있다.** 두 경로를 나누는 것이 안전장치를 약화시키는 것보다 낫다.

### 6.6 등록과 상실

`ActivePlayerStateMachine`: `UNREGISTERED / REGISTERING / LOCKED / TEMPORARILY_LOST / REIDENTIFYING / AMBIGUOUS / USER_LOST`.

등록은 한 손을 머리 위로 드는 제스처다. `isRegistrationGesture()`가 랜드마크 11·12·13·14·15·16의 가시성 ≥ 0.35이고 손목(15/16)이 어깨(11/12)보다 −0.02 위인지 확인한다. 후보가 정확히 1명이고 속도 ≤ 0.004, 포즈 유사도 ≥ 0.88을 700ms 유지해야 lock한다. **후보가 2명 이상이면 `AMBIGUOUS`로 두고 등록하지 않는다.**

상실 경로: LOCKED에서 트랙 소실 → `TEMPORARILY_LOST` → 1500ms 초과 → `REIDENTIFYING` → 최고점 ≥ 0.72이고 모호하지 않으면 재lock(`idSwitchCount++`) → 5000ms 안에 못 찾으면 `USER_LOST`.

`idSwitchCount`를 세는 이유는 품질 지표다. 이 값이 높으면 재식별이 실제로는 다른 사람으로 넘어가고 있을 가능성이 있다. 다만 **실제 군중 환경에서의 idSwitchCount는 `미측정`이다.**

### 6.7 세션 무효화 연쇄

`ActiveHandTracker`가 소유권 통과 시 `ActiveHandSession{sessionId, activePlayerTrackId, activeHandId, startedAt}`을 발급한다. 실패가 `maximumMissedFrames 12`를 넘거나 `temporaryLostGraceMs 900`을 넘으면 세션을 무효화한다.

이 sessionId가 `LatestOnlyInferenceController`의 세션 회전 키로 전달된다. 즉 **손 주인이 바뀌면 AI 추론 큐가 자동으로 비워진다.** 계층 간 연결을 sessionId 하나로 만든 것이 이 파이프라인에서 가장 유용한 설계였다.

---

## 7. AI 서버 연결 복구

`PythonWebSocketSignRecognizer`:

| 항목 | 값 |
| --- | --- |
| 재접속 백오프 | `min(500 * 2^attempt, 8000)`ms |
| 손 미검출 전송 간격 | `HAND_MISSING_SEND_INTERVAL_MS 80` |
| 직접 추론 타임아웃 | `DIRECT_INFERENCE_TIMEOUT_MS 900` |

생성·오류·종료 **어느 경로에서든** 다음 재접속을 예약한다. 경로 하나를 빠뜨리면 특정 실패 유형에서만 영구 단절되는데, 그건 재현이 어렵다.

MediaPipe 쪽도 같은 원칙이다. worker가 실패하면 즉시 main-thread tracker로 전환하고, main-thread의 일시 실패는 **해당 프레임만 버리고** 다음 프레임에서 tracker를 다시 초기화한다. 초기에는 일시 오류가 추론 루프 전체를 중단시켰다.

---

## 8. readiness 게이팅 — AI 문서의 결론을 제품 정책으로 받기

### 8.1 계약 파일

`game-contracts/recognition/readiness.json`:

| 필드 | 값 |
| --- | --- |
| `schemaVersion` | 1 |
| `modelVersion` | `jamo-31-v1` |
| `confirmationAuthority` | `FRONTEND_TEMPORAL_DECODER` |
| `evaluation.sampleCount` | 2790 |
| `evaluation.sampling` | 심볼·촬영 세션당 균등 간격 30 시퀀스 |
| `evaluation.trainingIndependent` | **false** |
| `criteria.minimumConfirmationRate` | 0.85 |
| `criteria.minimumCompetitivePrecision` | 0.90 |

31개 클래스 중 `competitiveEligible`은 **24개**다.

| 제외 | 사유 (JSON `reason` 필드 그대로) |
| --- | --- |
| `ㅅ` | `ㅠ`가 `ㅅ`으로 분류됨; precision을 지키는 threshold가 존재하지 않음 |
| `ㅠ` | 표본 90개 전부가 `ㅅ`으로 분류됨 |
| `ㅕ` | `ㅖ`와 혼동 |
| `ㅖ` | `ㅕ`와 혼동 |
| `ㅏ` | 확정률 85% 미만 |
| `ㅓ` | 확정률 85% 미만 |
| `ㅔ` | 확정률 85% 미만 |

### 8.2 단일 원천

같은 파일을 세 곳이 읽는다.

- 서버: threshold와 경쟁 가능 글자
- 프런트: 출제 범위(`BATTLE_TARGET_SYMBOLS = GAME_SYMBOLS.filter(isCompetitiveRecognitionReady)`), 심볼별 confidence 임계
- 계약 테스트: drift 검증

상수를 코드에 복제하지 않은 것이 핵심이다. 복제하면 AI 팀이 모델을 갱신했을 때 프런트가 옛 목록을 계속 쓰는데, 그 상태가 겉으로는 정상 동작으로 보인다.

방 옵션 `symbolRange`(`자음` / `모음` / `기초 혼합`)도 이 필터를 통과한 글자로만 구성한다.

### 8.3 검증

`LocalBotPracticeReadiness.integration.test.ts`:

- `"keeps both initial hands competitive for at least 100 seeds"` — 시드 100회에서 초기 카드 두 장이 항상 경쟁 가능한지
- `"never draws or spawns an excluded symbol after repeated card use"` — 반복 사용 후에도 제외 심볼이 등장하지 않는지

게이팅이 **필터 함수 수준이 아니라 실제 카드 드로우와 spawn까지 관철되는지**를 시드 반복으로 확인한다.

### 8.4 숫자 처리

지숫자 1~9는 `GAME_SYMBOL_REGISTRY`에 `modelSupported: false`, `feedbackMode: "CLASSIFICATION_ONLY"`로 등록되어 있고 `assets/guides/number-1.png`~`number-9.png` 안내 이미지도 있다. 하지만 `readiness.json`에 클래스가 없으므로 **AI 경쟁 출제에는 포함되지 않는다.** 어댑터가 `withoutNumericPrediction()`으로 숫자 예측을 걸러낸다. 0과 10은 등록 자체를 하지 않는다.

`symbolRegistry.ts`의 주석이 경계를 명시한다 — "Baseline model availability only. Runtime CAPABILITIES is authoritative."

### 8.5 수치를 좋게 쓰지 않았다

`trainingIndependent: false`와 경고 문구를 JSON에 남겼다.

> "The legacy model used a random sequence split across all three sessions. These results are a provisional safety gate, not independent model certification."

`readinessForSymbol()`로 조회되는 이 값들은 잠정 안전장치이지 모델 인증이 아니다. AI 문서 15장의 signer-independent 평가 필요성과 같은 결론이고, 프런트에서도 같은 문구를 유지했다. **경계가 문서 두 곳에 흩어질 때 한쪽만 낙관적으로 쓰면 그쪽이 나중에 근거로 인용된다.**

---

## 9. 검증과 한계

### 9.1 테스트

| 파일 | 케이스 | 검증 |
| --- | ---: | --- |
| `ContinuousSignDecoder.test.ts` | 12 | 연타 방지, 손 유지 전환, A-B-C 연속, 심볼별 임계, 지터 미확정 |
| `HandOwnerResolver.test.ts` | 8 | 미러링, 1인 fast path, 신호 결손 재정규화, 모호 차단 |
| `LatestOnlyInferenceController.test.ts` | 4 | in-flight 1개, 5중 응답 검증, 세션 회전, 신선도 기준점 |
| `LocalBotPracticeReadiness.integration.test.ts` | 2 | 시드 100회 게이팅 관철 |
| `recognitionReadiness.test.ts` | — | 계약 파일 파싱과 파생 export |

시간·랜덤·소켓을 전부 주입 가능하게 만들어 100ms 안정 시간, 80ms 손 소실, 1500ms 유예를 실제로 기다리지 않고 검증한다.

### 9.2 계측하지 않은 것

| 항목 | 상태 |
| --- | --- |
| 프로필별 Hand/Pose/AI 실제 p95 지연 | 미측정 (계측기는 있으나 기록 미저장) |
| 확정 지연(자세 완성 → SIGN_CONFIRMED) 분포 | 미측정 (`confirmationLatencyMs`를 수집하나 저장하지 않음) |
| 실제 군중 환경 idSwitchCount | 미측정 |
| 소유권 가중치 6개의 최적성 | 미측정 |
| 해제 임계값(0.12 / 100ms / 80ms)의 최적성 | 미측정 (체감 기준) |
| `COLLISION_ALPHA_THRESHOLD` 등 경험적 상수의 유도 과정 | 확인 필요 |
| 기기·브라우저별 CPU 사용률 | 미측정 |

**따라서 이 문서의 설정값들은 방향에 대한 근거는 있으나 최적성에 대한 근거는 없다.** AI 문서가 회차별 수치로 판단을 뒷받침한 것과 대비되는 지점이고, 이 파이프라인의 가장 큰 취약점이다.

`Decoder`가 이미 확정 지연 평균·p95를 240샘플로 수집하고 `RecognitionPerformanceMonitor`가 17개 필드를 갖고 있으므로, **수집이 아니라 저장과 비교 절차만 없다.** 여기를 붙이면 AI 문서와 같은 형식의 before/after 비교가 가능해진다.

---

## 10. 판단과 배운 점

1. **인식률 문제를 반응성으로 덮지 않았다.** 서버 cooldown 대신 확정 권위를 프런트로 옮기고, 신뢰할 수 없는 글자는 readiness 게이팅으로 따로 배제했다. 두 문제를 한 장치로 처리하면 어느 쪽도 제대로 해결되지 않는다.

2. **AI 문서의 결론이 제품 정책으로 이어지는 경로를 만들었다.** "`ㅅ`에는 precision을 지키는 threshold가 없다"는 결론이 `threshold: 0.9999`와 `competitiveEligible: false`로 반영되고, 시드 100회 테스트로 카드 드로우까지 관철된다. 계약 파일 하나가 두 파트를 연결한다.

3. **원인은 가장 가까운 곳에 없었다.** 인식이 안 되는 증상에서 모델·임계값·네트워크를 의심했지만 실제 원인은 age budget의 기준점이었다. 서버가 정상임을 먼저 확인해 범위를 좁힌 것이 결정적이었다.

4. **최악 시나리오 안전장치가 일반 시나리오를 망가뜨릴 수 있다.** 군중 대응 소유권 판정이 1인 플레이의 정상 손을 차단했다. 안전장치를 약화시키는 대신 경로를 나눴다.

5. **버린 것을 세는 것이 처리한 것을 세는 것보다 유용했다.** `droppedHandFrames`, `staleResponsesIgnored`, 차단 사유 열거형이 진단의 핵심이었다. 성공 카운터만으로는 "왜 안 되는지"를 알 수 없다.

6. **범위 판단을 기술 판단보다 먼저 했다.** 얼굴 인식은 구현 가능했지만 이 게임에 필요하지 않은 문제를 만든다. 필요한 것은 "이 손이 등록된 사용자의 것인가"였고 "이 사람이 누구인가"가 아니었다.

7. **계측기를 만들었으나 기록을 남기지 않은 것이 이 파트의 한계다.** 17개 필드를 수집하는 모니터가 있는데도 이 문서에 수치가 없다. 측정할 수 있는 구조를 만드는 것과 실제로 측정해 남기는 것은 별개의 작업이었다.

---

## 근거 자료

### Decoder

| 파일 | 확인한 내용 |
| --- | --- |
| `recognition/temporal/SignDecoderConfig.ts` | `DEFAULT_SIGN_DECODER_CONFIG`, `RESPONSIVE_GAMEPLAY_*`, 검증 규칙 |
| `recognition/temporal/SignDecoderStateMachine.ts` | 6상태 전이 화이트리스트 |
| `recognition/temporal/ContinuousSignDecoder.ts` | `validSample()` 4중 게이트, 확정 조건, 이벤트 4종, latency 240샘플 |
| `recognition/temporal/SignCandidateWindow.ts` | 투표·평균 confidence |
| `recognition/temporal/SignReleaseDetector.ts` | 해제 3경로 |
| `recognition/temporal/LandmarkMotionAnalyzer.ts`, `LandmarkPoseDistance.ts` | 움직임·거리 계산 |

### 파이프라인

| 파일 | 확인한 내용 |
| --- | --- |
| `recognition/runtime/RecognitionRateConfig.ts` | 3개 프로필, 검증 범위, `RESPONSIVE_GAMEPLAY` 주석 |
| `recognition/runtime/RecognitionPerformanceProfiles.ts` | `HIGH`/`BALANCED`/`LOW_POWER`, 기본값 |
| `recognition/runtime/RecognitionFrameScheduler.ts` | 단일 rAF 팬아웃, 중복 프레임 차단, 예외 격리 |
| `recognition/runtime/LatestFrameBuffer.ts` | 용량 1, `replacements` 카운터 |
| `recognition/runtime/LatestOnlyInferenceController.ts` | in-flight 1개, 응답 검증 5개, `sent` 상한 4, `flush()` 기준점 재설정, `rotateSession()` |
| `recognition/runtime/RecognitionPerformanceMonitor.ts` | 1초 윈도, 240샘플 p95, longtask, 250ms 스로틀, 17필드 |

### 사람·손 추적

| 파일 | 확인한 내용 |
| --- | --- |
| `recognition/active-player/ActivePlayerConfig.ts` | 상수 전체, 가중치 합=1 강제 |
| `recognition/active-player/PersonTrackManager.ts` | 트랙 상태, descriptor 구성 |
| `recognition/active-player/PersonDetectionMatcher.ts` | 백트래킹 배정, 비용 함수, 등속 예측 |
| `recognition/active-player/ActivePlayerRegistrationController.ts` | 등록 제스처 조건 |
| `recognition/active-player/ActivePlayerStateMachine.ts` | 7상태 |
| `recognition/active-player/ActivePlayerSession.ts` | 유예·재식별·`idSwitchCount`, `reactivate()` |
| `recognition/active-player/handOwnershipTypes.ts` | `DEFAULT_HAND_OWNERSHIP_CONFIG` 가중치·임계 |
| `recognition/active-player/HandOwnerResolver.ts` | 6신호 감쇠 함수, 재정규화, 차단 사유, 1인 fast path |
| `recognition/active-player/ActiveHandTracker.ts` | 세션 발급·무효화 |

### 어댑터·서버

| 파일 | 확인한 내용 |
| --- | --- |
| `recognition/vision/RecognitionVisionAdapter.ts` | 포트, 실행 모드 3종 |
| `recognition/vision/MediaPipeRecognitionVisionAdapter.ts` | worker/main-thread 폴백 |
| `recognition/vision/RemoteRecognitionVisionAdapter.ts` | 원격 골격 |
| `recognition/websocket/PythonWebSocketSignRecognizer.ts` | 지수 백오프 500~8000ms, `HAND_MISSING_SEND_INTERVAL_MS 80`, `modelVersion "frontend-temporal"`, `withoutNumericPrediction()` |
| `recognition/mediapipe/docs/README.md` | 어댑터 경계와 교체 절차 |

### 계약

| 파일 | 확인한 내용 |
| --- | --- |
| `game-contracts/recognition/readiness.json` | 31클래스, 24 eligible, 제외 사유, criteria, `trainingIndependent: false` 경고 |
| `recognition/readiness/recognitionReadiness.ts` | 타입 래핑, 파생 export |
| `block-stacking/metadata/symbolRegistry.ts` | 자모 31 + 숫자 9, `modelSupported`, 주석 |
| `block-stacking/battle/room/symbolRange.ts` | `symbolRange` 필터 |

### 테스트

`ContinuousSignDecoder.test.ts`(12), `HandOwnerResolver.test.ts`(8), `LatestOnlyInferenceController.test.ts`(4), `recognitionReadiness.test.ts`, `LocalBotPracticeReadiness.integration.test.ts`(2), `HandCamera.sharedStream.test.tsx`

### 문서

`frontend/src/game/docs/game-troubleshooting.md`(1장), `docs/ai-model-improvement-report.md`(짝 문서)
