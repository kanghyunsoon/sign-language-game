# 단어 AI WebSocket 계약 (프론트 요약)

`WordWebSocketSignRecognizer` / `WordHandCamera`가 구현하는 양손+pose 프로토콜의
프론트 쪽 계약이다. 서버 쪽 상세(가드·수형규칙·판정 흐름)는 AI 저장소의
`word-model/docs/frontend-integration-spec.md`, `word-accuracy-test/README.md`를 본다.

## LANDMARK_FRAME (클라이언트 → 서버)

```json
{
  "type": "LANDMARK_FRAME",
  "frameId": 1234,
  "capturedAt": 1785384000123,
  "frameWidth": 1280,
  "frameHeight": 720,
  "hands": {
    "left": { "handedness": "LEFT", "score": 0.97, "landmarks": [/* 21개 */] },
    "right": null
  },
  "pose": {
    "landmarks": {
      "nose": { "x": 0.5, "y": 0.2, "z": 0.0, "visibility": 0.99, "presence": 0.99 },
      "leftEar": {}, "rightEar": {},
      "leftShoulder": {}, "rightShoulder": {},
      "leftElbow": {}, "rightElbow": {},
      "leftWrist": {}, "rightWrist": {}
    }
  }
}
```

- `pose`는 매 프레임 전송한다. 포즈 미검출 시 `null` (양손 랜드마크는 그대로 보낸다).
- 어깨 2점(`leftShoulder`/`rightShoulder`)이 서버가 손 위치를 정규화하는 기준이라
  실질적으로 필수다. 나머지 7점은 향후 확장 대비로 같이 보낸다.
- 좌표는 `@mediapipe/tasks-vision` `PoseLandmarker` 정규화값 그대로, 변형하지 않는다.

## PREDICTION (서버 → 클라이언트)

```json
{
  "type": "PREDICTION",
  "frameId": 1234,
  "symbol": "moon",
  "confidence": 0.91,
  "isStable": true,
  "stage": "final",
  "verdict": "correct",
  "feedback": ["엄지와 검지를 붙였다 벌리는 동작이 필요해요"],
  "predictedAt": 1785384000123
}
```

- `stage`: `"live"`(수행 중 실시간 후보) | `"final"`(확정). 서버가 모션 정지 후
  자동 확정하므로 프론트가 시작/종료를 트리거하지 않는다.
- `verdict`: `"correct" | "wrong-form" | "out-of-range" | "detail"`. `stage: "live"`
  구간에서는 생략될 수 있다.
- `symbol`은 `"wrong"`(방향·형태 오류 전용 클래스)일 수 있다 — 등록부 심볼이
  아니므로 목표 심볼과 비교 시 항상 불일치로 처리된다.
- `feedback`은 `verdict`가 `"correct"`가 아닐 때만 채워질 수 있다.

## 기존 프로토콜과의 차이

숫자·지문자 경로(`PythonWebSocketSignRecognizer`, `game/docs/recognition.md` §7)는
한 손·21개 landmark만 쓰고 이 문서와 무관하다. 단어 경로만 양손 + pose + verdict를
쓴다.
