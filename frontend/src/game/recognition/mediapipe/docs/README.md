# MediaPipe 비전 어댑터 안내

이 폴더는 공용 `src/shared/mediapipe` 추적 엔진을 게임 인식 흐름에 연결하는 어댑터 문서다. `HandCamera`, 사용자·손 선택, Python AI와 게임 판정은 게임 전용이므로 `src/game/recognition`에 유지한다. 학습·연습 화면은 이 게임 어댑터가 아니라 공용 추적 엔진만 사용한다.

## 경계와 호출 흐름

```text
HandCamera
  -> RecognitionVisionAdapterFactory.create(options)
  -> RecognitionVisionAdapter.initialize/detectHands/detectPoses/close
  -> MediaPipeRecognitionVisionAdapter (현재 기본값)
     또는 RemoteRecognitionVisionAdapter (향후 서버 transport)
```

- 공통 인터페이스: `recognition/vision/RecognitionVisionAdapter.ts`
- 브라우저 구현: `recognition/vision/MediaPipeRecognitionVisionAdapter.ts`
- 원격 구현 골격: `recognition/vision/RemoteRecognitionVisionAdapter.ts`
- 전역 기본값과 React 주입: `recognition/vision/RecognitionVisionProvider.tsx`
- 게임 전체 주입점: `GameModuleServices.recognitionVisionAdapterFactory`

`@mediapipe/tasks-vision` import, Fileset/WASM 초기화, Hand/Pose landmarker 생성은 MediaPipe 구현 안에만 둔다. 페이지, 게임 코어, recognition session에서 MediaPipe 타입이나 모델 경로를 새로 참조하지 않는다.

## 원격 AI 서버로 교체하기

1. `RemoteRecognitionVisionTransport`를 구현한다.
2. `createRemoteRecognitionVisionAdapterFactory(transportFactory)`로 factory를 만든다.
3. 앱 조립 지점의 `GameModuleServices.recognitionVisionAdapterFactory`에 한 번 주입한다.
4. 기존 `HandCamera`와 이를 사용하는 기능 페이지는 수정하지 않는다.

transport는 session과 `frameId`, capture timestamp, handedness, 정규화된 21개 손 랜드마크 및 선택적 pose 결과의 순서를 보존해야 한다. 응답이 뒤늦게 도착하면 이전 session/frame 결과를 버리고, 처리 중 요청은 1개, 대기 프레임은 최신 1개만 유지해 지연이 누적되지 않게 한다.

원격 구현이 랜드마크가 아니라 영상 프레임을 보내야 한다면 인증, TLS, 해상도, 전송 빈도, 서버 보존 금지와 개인정보 고지를 먼저 확정한다. 이 정책 차이는 transport 안에 머물러야 하며 게임 DTO로 새어 나오면 안 된다.

## 카메라와 수명주기 규칙

- adapter는 전달받은 video/stream을 소유하지 않는다. `close()`에서 landmarker와 자체 worker/connection만 닫고 공유 `MediaStreamTrack`을 중지하지 않는다.
- `initialize()` 실패는 호출자에게 전달해 기존 카메라 오류 UI가 표시되게 한다.
- `detectHands`와 `detectPoses`는 같은 frame timestamp를 사용한다.
- worker 불가 시 main-thread fallback 여부는 adapter의 execution mode로 보고한다.
- unmount, 구현체 교체, 새 camera session 시작 시 이전 adapter를 반드시 닫는다.

## 모델과 정적 자산

MediaPipe WASM과 task 모델 경로는 기존 `createVisionFileset.ts`, `MediaPipeHandTracker.ts`, `MediaPipePoseTracker.ts`의 규칙을 따른다. 배포 전에 production build 산출물에 worker, WASM, 모델 파일이 포함되는지 확인한다. label index와 한글 지문자 매핑은 모델과 같은 버전으로 배포한다.

## 실시간 렌더링과 AI 지연 기준

주기 값은 이 문서가 아니라 `recognition/runtime/RecognitionPerformanceProfiles.ts`와 `RecognitionRateConfig.ts`가 원천이다. 현재 값은 다음과 같다.

| 프로필 | render | hand | pose | AI |
| --- | ---: | ---: | ---: | ---: |
| `HIGH` | 60 | 30 | 12 | 15 |
| `BALANCED` (기본) | 30 | 24 | 8 | 12 |
| `LOW_POWER` | 30 | 18 | 6 | 8 |

`RecognitionRateConfig`의 `RESPONSIVE_GAMEPLAY`는 render 20, hand 24, pose 4, AI 18을 사용한다. 24Hz latest-only가 과부하된 30~60Hz 큐보다 종단 지연이 낮기 때문이다.

- 화면 오버레이는 새 추적 결과나 캔버스 크기 변경이 있을 때만 다시 그린다.
- worker 전송 영상은 최대 256px로 축소하고, main-thread fallback은 재사용 canvas에서 최대 480px로 축소한다.
- 처리 중 요청은 1개, 대기 프레임은 최신 1개만 유지한다(`LatestOnlyInferenceController`).
- 응답 신선도는 랜드마크가 준비된 시점부터 계산한다(`maximumPredictionAgeMs` 기본 750ms). 캡처 시각부터 계산하면 MediaPipe 지연 때문에 정상 응답이 전부 stale로 판정된다.
- 표시 좌표에만 이동 예측과 안정화를 적용한다. AI에는 원본 측정 좌표를 전달해 인식 정확도를 보존한다.
- 손 검출 평균/p95 지연과 AI 평균/p95 지연을 별도로 기록한다(`RecognitionPerformanceMonitor`, 240샘플 링버퍼).

## 모델 버전과 출제 범위

`game-contracts/recognition/readiness.json`이 모델 버전과 경쟁 사용 가능 글자의 유일한 원천이다. 현재 `modelVersion`은 `jamo-31-v1`이고 31개 자모 중 24개만 `competitiveEligible`이다. 확정 권위는 서버가 아니라 프런트의 연속 지문자 Decoder(`confirmationAuthority: FRONTEND_TEMPORAL_DECODER`)다.

지숫자 1~9는 `GAME_SYMBOL_REGISTRY`에 `modelSupported: false`로 등록되어 있고 안내 이미지도 있으나 readiness 클래스가 없어 AI 경쟁 출제에는 포함되지 않는다. 어댑터는 숫자 예측을 `withoutNumericPrediction()`으로 걸러낸다.

2026-07-23 동일 랜드마크 120회 측정 결과는 다음과 같다. 하이브리드 숫자 모델은 지연이 커서 기본값으로 쓰지 않는다.

| 모델 | 평균 | p95 | 처리량 |
| --- | ---: | ---: | ---: |
| `jamo-number-hybrid-v1` | 169.078ms | 220.968ms | 5.96fps |
| `jamo-31-v1` | 2.288ms | 3.216ms | 429.78fps |

## 변경 체크리스트

- 새 구현이 `RecognitionVisionAdapter`만 구현하는가
- `HandCamera` 또는 게임 페이지에 구현체 분기가 추가되지 않았는가
- 공유 camera stream을 adapter가 종료하지 않는가
- 한 손, 두 손/두 사람, 손이 사라짐, 손을 내렸다 다시 올림을 구분하는가
- frame 순서 역전과 느린 응답에 대한 backpressure가 있는가
- `npm.cmd exec -- vitest run src/shared/mediapipe src/game --maxWorkers=1 --fileParallelism=false`와 `npm.cmd run build`가 통과하는가
- 실제 브라우저에서 카메라 권한, worker/main-thread fallback, 장시간 실행 후 자원 해제를 확인했는가
