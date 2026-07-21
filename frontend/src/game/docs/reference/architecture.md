# Phase 1 Architecture

## 구현 범위

```text
Browser getUserMedia
→ HTMLVideoElement
→ MediaPipe HandLandmarker (VIDEO mode, 최대 2손)
→ 손별 21 landmarks
→ Canvas overlay 직접 렌더링
```

Python WebSocket 추론, 게임, 기준 템플릿, 관절 피드백, 숫자 인식은 구현하지 않았다.

## 프론트 모듈 경계

```text
src/App.tsx
└─ recognition/index.ts                 # 공개 export
   ├─ core/SignRecognizer.ts            # 추론 구현 독립 인터페이스
   ├─ core/symbols.ts                   # 실제 31개 모델 계약
   ├─ types/landmark.ts                 # 21 landmark 타입/검증
   ├─ types/events.ts                   # 향후 인식 이벤트 계약
   └─ mediapipe/
      ├─ HandCamera.tsx                 # 카메라 lifecycle과 UI
      ├─ MediaPipeHandTracker.ts        # MediaPipe adapter
      ├─ drawHandOverlay.ts             # Canvas 직접 렌더링
      ├─ handConnections.ts             # 21-point 연결 상수
      ├─ canvasCoordinates.ts           # 좌표 변환 순수 함수
      └─ mediaStream.ts                 # track 종료 함수
```

`recognition`은 라우터, 로그인, Axios, Spring DTO, 전역 상태에 의존하지 않는다. `game` 폴더는 Phase 1에서 구현하지 않고 독립 모듈 경계만 예약했다.

## 카메라 lifecycle

1. 사용자가 `카메라 시작`을 누른다.
2. 로컬 MediaPipe WASM/hand model을 초기화한다.
3. `navigator.mediaDevices.getUserMedia`로 640×480 user-facing stream을 요청한다.
4. video intrinsic size에 canvas drawing buffer를 맞춘다.
5. `requestAnimationFrame` 루프에서 최대 30 FPS로 `detectForVideo`를 호출한다.
6. MediaPipe callback 결과를 canvas에 직접 그린다.
7. 정지 또는 component unmount 시 animation frame을 취소하고 tracker를 닫고 모든 `MediaStreamTrack.stop()`을 호출한다.

매 프레임 landmarks는 React State에 저장하지 않는다. React State는 카메라 상태, 오류, 검출 손 개수 변화에만 사용한다.

## 좌표와 좌우 반전

video와 canvas는 동일한 absolute box, 동일한 `width/height: 100%`, 동일한 4:3 container를 사용한다. canvas intrinsic width/height는 `video.videoWidth/video.videoHeight`와 일치시킨다.

MediaPipe normalized 좌표는 반전하지 않고 canvas intrinsic 좌표로 그린다. video와 canvas 양쪽에 같은 CSS `scaleX(-1)`을 적용하므로 화면에는 둘이 함께 거울 반전된다. 이 방식은 landmark x를 코드에서 다시 뒤집어 발생하는 이중 반전을 방지한다.

## 정적 자산

`npm install`의 postinstall script가 다음을 로컬 `public/mediapipe`로 준비한다.

* `@mediapipe/tasks-vision`의 WASM loader/wasm
* 공식 `hand_landmarker.task` float16 모델

런타임에는 CDN URL을 사용하지 않는다.

## 후속 확장 지점

`SignRecognizer` 인터페이스 뒤에 `PythonWebSocketSignRecognizer` 또는 `KeyboardSignRecognizer`를 추가할 수 있다. MediaPipe tracker는 landmarks 생성만 담당하며 게임 코어와 WebSocket 구현을 알지 않는다.
