# 프론트엔드 지문자 MediaPipe 연동 가이드

## 문서 상태

- 문서 버전: 0.1.0
- 데이터 스키마 버전: `1.0.0`
- 대상: 웹 프론트엔드 개발자, AI 서버 개발자
- 원본 규격: [지문자 MediaPipe 랜드마크 데이터 규격](./fingerspelling-landmark-data-contract.md)
- 상태: 프론트엔드 협의용 초안

이 문서는 프론트엔드가 카메라 영상에서 MediaPipe 손 랜드마크를 추출하고 AI 서버로 전송하기 위해 필요한 구현 기준만 정리한다. 원본 사진과 영상은 AI 서버로 보내지 않는다.

## 1. 확정된 연동 기준

| 항목 | 값 |
| --- | --- |
| 인식 대상 | 한국 지문자 자음 14개, 모음 17개 |
| MediaPipe Task | Hand Landmarker |
| 실행 모드 | `VIDEO` |
| 최대 손 개수 | `1` |
| 전송 목표 주기 | 100ms |
| 전송 목표 FPS | 10 FPS |
| 프레임 특징점 | `landmarks [21, 3]`, `worldLandmarks [21, 3]` |
| 모델 관찰 구간 | 1.2초, 12프레임 |
| 서비스 확정시간 | 600ms |
| 일시적 실패 허용 | 200ms |
| 원본 영상 전송 | 금지 |

프론트엔드는 지문자를 직접 판정하지 않는다. MediaPipe 결과와 촬영 시각만 전송하고, 지문자 후보 및 확정 여부는 AI 서버 응답을 사용한다.

## 2. 프론트엔드와 AI 서버의 책임

### 프론트엔드

- 사용자 카메라 권한과 영상 입력을 관리한다.
- MediaPipe Hand Landmarker를 고정된 설정으로 실행한다.
- 목표 10 FPS로 프레임 데이터를 생성한다.
- 랜드마크를 가공하지 않고 원본 순서로 전송한다.
- 손 미검출과 프레임 처리 누락을 구분한다.
- AI 서버의 확정 결과만 화면 입력으로 사용한다.

### AI 서버

- 메시지 스키마와 순서를 검증한다.
- 10 FPS 기준으로 프레임을 재샘플링한다.
- 좌우 손, 위치, 크기를 정규화한다.
- 최근 12프레임을 학습과 동일한 방식으로 전처리한다.
- 후보, 유지시간 및 확정 결과를 반환한다.

## 3. 세션 흐름

```text
카메라 시작
  -> MediaPipe 초기화
  -> WebSocket 연결
  -> session.start 전송
  -> landmark.frame 반복 전송
  <- prediction.result 반복 수신
  -> session.end 전송
  -> WebSocket 종료
```

WebSocket 주소와 인증 헤더는 배포 환경이 확정된 후 별도로 공유한다. 주소가 달라져도 이 문서의 메시지 본문은 변경하지 않는다.

## 4. MediaPipe 설정

```ts
const handLandmarkerOptions = {
  runningMode: "VIDEO",
  numHands: 1,
  minHandDetectionConfidence: 0.5,
  minHandPresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
};
```

- 팀이 배포한 동일한 `hand_landmarker.task` 파일을 사용한다.
- 라이브러리 버전과 모델 파일 버전을 `session.start`에 기록한다.
- 프리뷰는 CSS `transform: scaleX(-1)`로 반전할 수 있다.
- MediaPipe에 전달하는 영상 픽셀은 좌우 반전하지 않는다.
- MediaPipe 입력 전에 영상을 화면 기준 정방향으로 회전한다.
- 좌표 정규화, 손목 중심 이동, 크기 조절은 프론트에서 수행하지 않는다.

## 5. TypeScript 데이터 타입

아래 타입을 프론트 구현 기준으로 사용한다. 실제 공용 타입 파일은 JSON Schema 구축 단계에서 생성한다.

```ts
type SchemaVersion = "1.0.0";
type SessionMode = "inference" | "collection";
type FrameStatus = "detected" | "not_detected" | "dropped";
type Handedness = "Left" | "Right";
type CameraFacing = "user" | "environment" | "unknown";
type DatasetPurpose = "train" | "validation" | "test";
type CompletionReason = "completed" | "cancelled" | "tracking_lost" | "timeout";
type SessionEndReason = "completed" | "camera_closed" | "permission_revoked" | "client_error";

type LandmarkPoint = [x: number, y: number, z: number];
type HandLandmarks = [
  LandmarkPoint,
  LandmarkPoint,
  LandmarkPoint,
  LandmarkPoint,
  LandmarkPoint,
  LandmarkPoint,
  LandmarkPoint,
  LandmarkPoint,
  LandmarkPoint,
  LandmarkPoint,
  LandmarkPoint,
  LandmarkPoint,
  LandmarkPoint,
  LandmarkPoint,
  LandmarkPoint,
  LandmarkPoint,
  LandmarkPoint,
  LandmarkPoint,
  LandmarkPoint,
  LandmarkPoint,
  LandmarkPoint,
];

interface HandPayload {
  handedness: Handedness;
  handednessScore: number;
  landmarks: HandLandmarks;
  worldLandmarks: HandLandmarks;
}

interface CollectionMetadata {
  participantId: string;
  datasetPurpose: DatasetPurpose;
  dominantHand: Handedness | "Unknown";
  consentVersion: string;
}

interface SessionStartMessage {
  schemaVersion: SchemaVersion;
  messageType: "session.start";
  sessionId: string;
  mode: SessionMode;
  recognitionMode: "jamo";
  targetFps: 10;
  source: {
    frameWidth: number;
    frameHeight: number;
    rotationDegrees: 0;
    inputMirrored: false;
    cameraFacing: CameraFacing;
  };
  mediaPipe: {
    task: "HandLandmarker";
    runningMode: "VIDEO";
    libraryVersion: string;
    modelAssetVersion: string;
    numHands: 1;
    minHandDetectionConfidence: 0.5;
    minHandPresenceConfidence: 0.5;
    minTrackingConfidence: 0.5;
  };
  collection?: CollectionMetadata;
}

interface LandmarkFrameMessage {
  schemaVersion: SchemaVersion;
  messageType: "landmark.frame";
  sessionId: string;
  sequenceNumber: number;
  captureTimestampMs: number;
  frameStatus: FrameStatus;
  hand: HandPayload | null;
}

interface SessionEndMessage {
  schemaVersion: SchemaVersion;
  messageType: "session.end";
  sessionId: string;
  endTimestampMs: number;
  reason: SessionEndReason;
}

interface PredictionResultMessage {
  schemaVersion: SchemaVersion;
  messageType: "prediction.result";
  sessionId: string;
  sequenceNumber: number;
  captureTimestampMs: number;
  status: "none" | "transition" | "candidate" | "confirmed";
  prediction: {
    labelId: string;
    displayName: string;
    confidence: number;
  } | null;
  holdDurationMs: number;
  confirmed: boolean;
  modelVersion: string;
}
```

## 6. 세션 시작 메시지

카메라 크기와 MediaPipe 정보가 확정된 뒤 프레임보다 먼저 한 번 전송한다.

```json
{
  "schemaVersion": "1.0.0",
  "messageType": "session.start",
  "sessionId": "0190f744-8f64-7b17-a032-8a4c12d9b701",
  "mode": "inference",
  "recognitionMode": "jamo",
  "targetFps": 10,
  "source": {
    "frameWidth": 1280,
    "frameHeight": 720,
    "rotationDegrees": 0,
    "inputMirrored": false,
    "cameraFacing": "user"
  },
  "mediaPipe": {
    "task": "HandLandmarker",
    "runningMode": "VIDEO",
    "libraryVersion": "0.10.x",
    "modelAssetVersion": "hand-landmarker-v1",
    "numHands": 1,
    "minHandDetectionConfidence": 0.5,
    "minHandPresenceConfidence": 0.5,
    "minTrackingConfidence": 0.5
  }
}
```

`sessionId`는 카메라 세션마다 새 UUID를 생성한다. 재연결했을 때 이전 버퍼를 이어 쓰지 않고 새 세션을 시작한다.

### 6.1 세션 종료 메시지

카메라 사용이 끝나면 마지막 프레임 이후 한 번 전송한다.

```json
{
  "schemaVersion": "1.0.0",
  "messageType": "session.end",
  "sessionId": "0190f744-8f64-7b17-a032-8a4c12d9b701",
  "endTimestampMs": 12500,
  "reason": "completed"
}
```

페이지 강제 종료나 네트워크 단절로 전송하지 못한 경우가 있으므로, AI 서버도 WebSocket 연결 종료를 세션 종료로 처리한다.

## 7. 프레임 전송 메시지

### 7.1 손이 정상 검출된 경우

```json
{
  "schemaVersion": "1.0.0",
  "messageType": "landmark.frame",
  "sessionId": "0190f744-8f64-7b17-a032-8a4c12d9b701",
  "sequenceNumber": 42,
  "captureTimestampMs": 4200,
  "frameStatus": "detected",
  "hand": {
    "handedness": "Right",
    "handednessScore": 0.982341,
    "landmarks": [
      [0.512341, 0.734512, -0.001245],
      [0.481203, 0.691245, -0.012341]
    ],
    "worldLandmarks": [
      [0.021345, 0.043211, 0.004123],
      [0.012311, 0.031245, -0.001234]
    ]
  }
}
```

예시는 길이를 줄이기 위해 좌표를 2개만 표시했다. 실제 배열은 각각 정확히 21개의 점을 포함해야 한다.

### 7.2 MediaPipe를 실행했지만 손이 없는 경우

```json
{
  "schemaVersion": "1.0.0",
  "messageType": "landmark.frame",
  "sessionId": "0190f744-8f64-7b17-a032-8a4c12d9b701",
  "sequenceNumber": 43,
  "captureTimestampMs": 4300,
  "frameStatus": "not_detected",
  "hand": null
}
```

### 7.3 MediaPipe 처리를 실행하지 못한 경우

```json
{
  "schemaVersion": "1.0.0",
  "messageType": "landmark.frame",
  "sessionId": "0190f744-8f64-7b17-a032-8a4c12d9b701",
  "sequenceNumber": 44,
  "captureTimestampMs": 4400,
  "frameStatus": "dropped",
  "hand": null
}
```

`not_detected`와 `dropped`를 하나로 합치면 카메라에 손이 없었던 것인지 브라우저가 느렸던 것인지 구분할 수 없다.

## 8. 프레임 상태 결정표

| 상황 | `frameStatus` | `hand` |
| --- | --- | --- |
| MediaPipe 결과에 손 한 개 존재 | `detected` | 손 객체 |
| MediaPipe 실행 결과가 빈 배열 | `not_detected` | `null` |
| 해당 100ms 구간에 MediaPipe 미실행 | `dropped` | `null` |
| WebSocket 전송 실패 | 전송하지 못한 원래 상태 | 서버가 번호 누락으로 판정 |

`detected`인데 `hand`가 `null`이거나, 다른 상태인데 손 객체가 들어오면 AI 서버가 해당 프레임을 거부한다.

## 9. 타임스탬프와 시퀀스 번호

### `captureTimestampMs`

- 세션 시작 시점부터 흐른 단조 증가 밀리초다.
- `Date.now()`처럼 시스템 시각이 변경될 수 있는 값은 사용하지 않는다.
- `performance.now()` 또는 영상 프레임 타임스탬프를 기준으로 계산한다.
- 네트워크 요청 시각과 서버 수신 시각을 사용하지 않는다.

### `sequenceNumber`

- 첫 샘플링 시점은 `0`이다.
- 100ms 샘플링 시점마다 1 증가한다.
- 손이 없거나 처리가 누락돼도 증가한다.
- WebSocket 재연결 시 새 세션 ID와 함께 `0`부터 다시 시작한다.

```ts
const targetIntervalMs = 100;
const sessionStartedAtMs = performance.now();
let sequenceNumber = 0;
let nextSampleAtMs = sessionStartedAtMs;

function createFrameTime(nowMs: number) {
  const captureTimestampMs = Math.round(nextSampleAtMs - sessionStartedAtMs);
  const currentSequenceNumber = sequenceNumber;

  sequenceNumber += 1;
  nextSampleAtMs += targetIntervalMs;

  return {
    sequenceNumber: currentSequenceNumber,
    captureTimestampMs,
  };
}
```

실제 카메라 루프가 늦어져 여러 샘플링 시점을 지나쳤다면 지나간 시점마다 `dropped` 프레임을 생성한 후 현재 프레임을 처리한다.

## 10. 좌표 변환 금지 사항

프론트엔드는 MediaPipe 결과에 다음 작업을 수행하지 않는다.

- 손목을 원점으로 이동
- 손 크기로 나누기
- 왼손 x축 반전
- 화면 중심으로 이동
- 손바닥 방향 회전
- 랜드마크 순서 변경
- 이미지 좌표와 월드 좌표 혼합

이 전처리는 AI 서버의 공통 전처리 모듈이 담당한다. 프론트에서 먼저 변환하면 학습 데이터와 서비스 데이터의 분포가 달라진다.

JSON 전송 시 모든 좌표는 유한한 숫자여야 한다. `NaN`, `Infinity`, 문자열과 `null` 좌표는 허용하지 않는다.

## 11. AI 서버 응답 처리

```json
{
  "schemaVersion": "1.0.0",
  "messageType": "prediction.result",
  "sessionId": "0190f744-8f64-7b17-a032-8a4c12d9b701",
  "sequenceNumber": 48,
  "captureTimestampMs": 4800,
  "status": "confirmed",
  "prediction": {
    "labelId": "consonant_giyeok",
    "displayName": "ㄱ",
    "confidence": 0.9172
  },
  "holdDurationMs": 600,
  "confirmed": true,
  "modelVersion": "fingerspelling-v1.0.0"
}
```

- `candidate`: 화면에 후보로 표시할 수 있지만 입력값으로 확정하지 않는다.
- `confirmed`: 문자 입력값으로 한 번 반영한다.
- `none`, `transition`: `prediction`은 `null`이다.
- 같은 확정 결과가 반복 수신돼도 한 동작에서 한 번만 입력한다.
- 동일 문자를 다시 입력하려면 서버가 전환 또는 해제 상태를 확인한 뒤 새 확정 결과를 보낸다.

## 12. 수집 모드 차이

학습 데이터 수집 화면도 프레임 형식은 동일하다. 차이는 세션 시작 메시지의 `mode`와 `collection` 객체, 구간 라벨 메시지뿐이다.

```json
{
  "mode": "collection",
  "collection": {
    "participantId": "P-8f31a2",
    "datasetPurpose": "train",
    "dominantHand": "Right",
    "consentVersion": "2026-07-01"
  }
}
```

- 참가자 이름과 이메일을 전송하지 않는다.
- 목표 지문자는 `segment.start`로 전송한다.
- 1.2초 이상 안정된 구간만 학습 후보가 된다.
- 권장 촬영 유지시간은 1.5초 이상 2초 이하다.
- 학습, 검증, 테스트 참가자는 중복되면 안 된다.

## 13. 오류 처리

AI 서버가 `error` 메시지를 보내면 `code`에 따라 처리한다.

| 오류 | 프론트 처리 |
| --- | --- |
| 단일 좌표 또는 프레임 오류 | 해당 프레임을 건너뛰고 계속 전송 |
| 스키마 버전 불일치 | 세션 종료 후 사용자에게 재시도 안내 |
| 세션 ID 불일치 | 연결 종료 후 새 세션 시작 |
| 연속 프레임 오류 | MediaPipe 및 카메라 상태 재초기화 |
| WebSocket 연결 종료 | 이전 세션 폐기 후 새 세션으로 재연결 |

운영 로그에는 전체 랜드마크를 출력하지 않는다. 세션 ID, 시퀀스 번호, 오류 코드만 기록한다.

## 14. 프론트엔드 완료 조건

- [ ] MediaPipe Hand Landmarker가 `VIDEO`, 한 손 모드로 실행된다.
- [ ] 프리뷰만 좌우 반전되고 MediaPipe 입력 영상은 반전되지 않는다.
- [ ] `session.start`가 첫 프레임보다 먼저 전송된다.
- [ ] 10 FPS에 맞춰 시퀀스 번호와 촬영 타임스탬프가 증가한다.
- [ ] `detected`, `not_detected`, `dropped`가 구분된다.
- [ ] 검출 프레임에 각 21개의 이미지 및 월드 좌표가 들어간다.
- [ ] 프론트엔드에서 좌표를 정규화하거나 반전하지 않는다.
- [ ] 손이 없는 프레임도 빠짐없이 전송된다.
- [ ] `candidate`는 확정 입력으로 사용하지 않는다.
- [ ] `confirmed: true` 결과만 한 번 입력한다.
- [ ] 카메라 종료와 재연결 시 새 세션 ID를 사용한다.
- [ ] 사진, 영상, 사용자 개인정보를 전송하지 않는다.

## 15. 프론트엔드 수동 검증 시나리오

1. 손을 보이지 않고 2초간 유지했을 때 `not_detected` 프레임이 약 20개 전송되는지 확인한다.
2. 손을 보인 상태에서 1.2초 유지했을 때 12개 이상의 검출 프레임이 전송되는지 확인한다.
3. 브라우저 처리를 의도적으로 지연했을 때 누락 구간이 `dropped`로 표시되는지 확인한다.
4. 프리뷰를 좌우 반전해도 전송 좌표가 변경되지 않는지 확인한다.
5. 왼손과 오른손에서 handedness와 점 21개가 모두 전송되는지 확인한다.
6. WebSocket 재연결 후 세션 ID가 바뀌고 시퀀스 번호가 0부터 시작하는지 확인한다.
7. 서버가 `candidate`를 보낼 때 문자가 입력되지 않고 `confirmed`에서 한 번만 입력되는지 확인한다.

## 16. 프론트엔드 전달 전 미확정 항목

다음 항목은 데이터 본문과 무관하며 AI 서버 배포 전에 별도 합의한다.

- 개발, 스테이징, 운영 WebSocket 주소
- WebSocket 인증 토큰 전달 방식
- 재연결 최대 횟수와 대기시간
- 사용자 화면에 후보 상태를 표시할지 여부
- 오류 메시지의 사용자 표시 문구
