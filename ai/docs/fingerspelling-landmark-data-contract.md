# 지문자 MediaPipe 랜드마크 데이터 규격

## 문서 상태

- 문서 버전: 0.2.0
- 스키마 버전: `1.0.0`
- 상태: 초안
- 적용 범위: 웹 프론트엔드와 AI 서버 사이의 실시간 지문자 데이터 전송 및 학습 데이터 수집
- 제외 범위: 지숫자, 단어 수어, 문장 수어, 얼굴 및 전신 포즈, 원본 사진 및 영상

이 문서는 프론트엔드가 MediaPipe Hand Landmarker로 추출한 데이터를 AI 서버에 전달할 때 사용하는 공통 규격을 정의한다. 학습 수집과 실시간 추론은 동일한 프레임 형식을 사용한다.

## 1. 설계 원칙

1. 프론트엔드는 원본 사진이나 영상을 AI 서버에 전송하지 않는다.
2. 한 프레임에는 최대 한 손의 랜드마크만 포함한다.
3. 프레임 수가 아니라 촬영 타임스탬프로 동작 유지시간을 계산한다.
4. 손이 검출되지 않은 프레임도 전송하여 손실 구간과 유지시간을 보존한다.
5. 실시간 프레임에는 정답 라벨을 포함하지 않는다.
6. 학습용 라벨은 별도의 수집 구간 메시지로 기록한다.
7. 학습과 서비스에서 같은 MediaPipe 모델 및 전처리 버전을 사용한다.
8. 필드 의미가 바뀌면 `schemaVersion`의 주 버전을 변경한다.

## 2. 인식 범위

### 2.1 직접 인식 클래스

지문자 자음 14개와 모음 17개를 직접 인식한다.

| 구분 | 클래스 ID |
| --- | --- |
| 자음 | `consonant_giyeok`, `consonant_nieun`, `consonant_digeut`, `consonant_rieul`, `consonant_mieum`, `consonant_bieup`, `consonant_siot`, `consonant_ieung`, `consonant_jieut`, `consonant_chieut`, `consonant_kieuk`, `consonant_tieut`, `consonant_pieup`, `consonant_hieut` |
| 모음 | `vowel_a`, `vowel_ae`, `vowel_ya`, `vowel_yae`, `vowel_eo`, `vowel_e`, `vowel_yeo`, `vowel_ye`, `vowel_o`, `vowel_oe`, `vowel_yo`, `vowel_u`, `vowel_wi`, `vowel_yu`, `vowel_eu`, `vowel_ui`, `vowel_i` |

`none`과 `transition`은 AI 서버가 판정하는 상태다. 추론 중 프론트엔드가 이 값을 결정해서 보내지 않는다.

겹자음과 복합모음은 기본 지문자의 연속 입력으로 조합한다. 숫자 클래스는 스키마 `1.0.0`에서 전송 및 학습 대상에 포함하지 않는다.

## 3. MediaPipe 실행 기준

| 항목 | 고정값 |
| --- | --- |
| Task | MediaPipe Hand Landmarker |
| 실행 모드 | `VIDEO` |
| 최대 손 개수 | `1` |
| 전송 FPS | `10` |
| 최소 손 검출 신뢰도 | `0.5` |
| 최소 손 존재 신뢰도 | `0.5` |
| 최소 추적 신뢰도 | `0.5` |
| 랜드마크 개수 | 손당 `21`개 |
| 프리뷰 좌우 반전 | 허용 |
| MediaPipe 입력 영상 좌우 반전 | 금지 |

프론트 화면의 셀프 카메라 미리보기는 CSS로 좌우 반전할 수 있다. 이 반전은 MediaPipe에 입력되는 실제 픽셀에 적용하지 않는다. 따라서 세션의 `inputMirrored`는 스키마 `1.0.0`에서 항상 `false`다.

브라우저 성능 저하로 프레임을 건너뛸 수 있지만, 이미 생성한 프레임의 타임스탬프를 변경하거나 중복 전송하면 안 된다. AI 서버는 수신 데이터를 촬영 타임스탬프 기준 10 FPS로 다시 정렬한다.

## 4. 연결과 메시지 흐름

실시간 전송은 WebSocket의 JSON 텍스트 메시지를 기본으로 한다. 실제 엔드포인트 주소와 인증 방식은 서버 배포 규칙에서 별도로 정한다.

```text
프론트엔드                         AI 서버
    |                                |
    |------ session.start ---------->|
    |------ landmark.frame --------->| 반복, 목표 10 FPS
    |<----- prediction.result -------| 추론 모드
    |------ segment.start ---------->| 수집 모드에서만 사용
    |------ landmark.frame --------->| 반복
    |------ segment.end ------------>| 수집 모드에서만 사용
    |------ session.end ------------>|
    |                                |
```

## 5. 세션 시작 메시지

연결 후 첫 메시지는 반드시 `session.start`다.

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
    "modelAssetVersion": "team-managed-version",
    "numHands": 1,
    "minHandDetectionConfidence": 0.5,
    "minHandPresenceConfidence": 0.5,
    "minTrackingConfidence": 0.5
  }
}
```

### 5.1 필드 정의

| 필드 | 형식 | 필수 | 규칙 |
| --- | --- | --- | --- |
| `schemaVersion` | 문자열 | O | 현재 값은 `1.0.0` |
| `messageType` | 문자열 | O | `session.start` |
| `sessionId` | UUID 문자열 | O | 세션 내 모든 메시지에서 동일 |
| `mode` | 문자열 | O | `inference` 또는 `collection` |
| `recognitionMode` | 문자열 | O | 현재는 `jamo`만 허용 |
| `targetFps` | 정수 | O | 현재 버전은 `10`만 허용 |
| `source.frameWidth` | 정수 | O | MediaPipe 입력 영상의 실제 너비 |
| `source.frameHeight` | 정수 | O | MediaPipe 입력 영상의 실제 높이 |
| `source.rotationDegrees` | 정수 | O | 정방향 보정 후 `0`만 허용 |
| `source.inputMirrored` | 불리언 | O | 현재 버전은 `false`만 허용 |
| `source.cameraFacing` | 문자열 | O | `user`, `environment`, `unknown` |
| `mediaPipe.libraryVersion` | 문자열 | O | 프론트에서 사용한 라이브러리 버전 |
| `mediaPipe.modelAssetVersion` | 문자열 | O | 팀이 배포한 모델 파일 버전 |

`modelAssetVersion`은 파일명이나 해시처럼 팀이 동일 모델 파일을 식별할 수 있는 값이어야 한다. `latest`처럼 결과가 달라질 수 있는 값은 사용하지 않는다.

### 5.2 세션 종료 메시지

카메라 사용을 끝낼 때 마지막 프레임 이후 `session.end`를 한 번 전송한다.

```json
{
  "schemaVersion": "1.0.0",
  "messageType": "session.end",
  "sessionId": "0190f744-8f64-7b17-a032-8a4c12d9b701",
  "endTimestampMs": 12500,
  "reason": "completed"
}
```

`reason`은 `completed`, `camera_closed`, `permission_revoked`, `client_error` 중 하나다. WebSocket이 먼저 끊어져 메시지를 보내지 못한 경우 AI 서버가 연결 종료 시각으로 세션을 닫는다.

## 6. 랜드마크 프레임 메시지

### 6.1 손이 검출된 프레임

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

예시에서는 길이를 줄이기 위해 좌표를 2개만 표시했다. 실제 `landmarks`와 `worldLandmarks`는 각각 반드시 21개의 `[x, y, z]` 배열을 포함해야 한다.

### 6.2 손이 검출되지 않은 프레임

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

손이 검출되지 않았다고 프레임 전송 자체를 생략하면 유지시간과 일시적 인식 실패를 정확히 계산할 수 없다. MediaPipe를 실행했지만 손이 없으면 `frameStatus: "not_detected"`, 프론트엔드 처리 지연으로 MediaPipe를 실행하지 못했으면 `frameStatus: "dropped"`와 `hand: null`을 전송한다.

### 6.3 필드 정의

| 필드 | 형식 | 필수 | 규칙 |
| --- | --- | --- | --- |
| `schemaVersion` | 문자열 | O | 현재 값은 `1.0.0` |
| `messageType` | 문자열 | O | `landmark.frame` |
| `sessionId` | UUID 문자열 | O | 시작 메시지의 값과 동일 |
| `sequenceNumber` | 0 이상 정수 | O | 첫 프레임은 `0`, 샘플링 시점마다 1 증가 |
| `captureTimestampMs` | 0 이상 정수 | O | 세션 시작 기준 경과 시간, 이전 값보다 커야 함 |
| `frameStatus` | 문자열 | O | `detected`, `not_detected`, `dropped` 중 하나 |
| `hand` | 객체 또는 `null` | O | `detected`일 때 객체, 그 외에는 `null` |
| `hand.handedness` | 문자열 | 조건부 O | `Left` 또는 `Right` |
| `hand.handednessScore` | 실수 | 조건부 O | `0.0~1.0` |
| `hand.landmarks` | `21 x 3` 실수 배열 | 조건부 O | 정규화된 이미지 좌표 |
| `hand.worldLandmarks` | `21 x 3` 실수 배열 | 조건부 O | 미터 단위 월드 좌표 |

### 6.4 좌표 의미

`landmarks`는 MediaPipe가 반환한 정규화 이미지 좌표다.

- `x`: 영상 너비에 대해 정규화된 가로 위치
- `y`: 영상 높이에 대해 정규화된 세로 위치
- `z`: 손목을 기준으로 한 상대 깊이, 값이 작을수록 카메라에 가까움

`worldLandmarks`는 MediaPipe가 반환한 3차원 월드 좌표다.

- 단위는 미터다.
- 손의 기하학적 중심을 원점으로 한다.
- 프론트엔드는 좌표 이동, 크기 조절, 좌우 반전 또는 회전을 적용하지 않는다.

모든 좌표는 유한한 숫자여야 하며 `NaN`, `Infinity`, 문자열, `null`을 허용하지 않는다. 전송 시 소수점 여섯 자리까지 유지한다.

### 6.5 랜드마크 인덱스

배열 순서는 MediaPipe Hand Landmarker의 인덱스를 그대로 사용한다.

| 인덱스 | 지점 | 인덱스 | 지점 |
| ---: | --- | ---: | --- |
| 0 | 손목 | 11 | 중지 DIP |
| 1 | 엄지 CMC | 12 | 중지 끝 |
| 2 | 엄지 MCP | 13 | 약지 MCP |
| 3 | 엄지 IP | 14 | 약지 PIP |
| 4 | 엄지 끝 | 15 | 약지 DIP |
| 5 | 검지 MCP | 16 | 약지 끝 |
| 6 | 검지 PIP | 17 | 소지 MCP |
| 7 | 검지 DIP | 18 | 소지 PIP |
| 8 | 검지 끝 | 19 | 소지 DIP |
| 9 | 중지 MCP | 20 | 소지 끝 |
| 10 | 중지 PIP |  |  |

## 7. 시간과 순서 규칙

### 7.1 촬영 타임스탬프

`captureTimestampMs`는 세션 시작 이후 프레임이 촬영된 시점의 경과 밀리초다. 브라우저의 단조 증가 시계 또는 영상 타임스탬프를 사용한다.

- 네트워크 전송 시각과 AI 서버 수신 시각을 사용하지 않는다.
- 시각은 이전 프레임보다 반드시 커야 한다.
- 10 FPS 기준 정상 프레임 간격은 약 100ms다.
- 연속된 미검출 또는 누락이 200ms 이하면 일시적 실패로 처리한다.
- 연속된 미검출 또는 누락이 200ms를 초과하면 후보 유지시간을 중단한다.
- 서버는 타임스탬프를 기준으로 10 FPS 고정 간격으로 재샘플링한다.

### 7.2 시퀀스 번호

`sequenceNumber`는 전송 성공 여부와 관계없이 샘플링 시점마다 증가시킨다. 서버는 번호 누락으로 프레임 드롭을 확인할 수 있다.

- 중복된 번호는 폐기한다.
- 이전 번호보다 작은 메시지는 폐기한다.
- 번호가 누락되어도 세션은 종료하지 않는다.

### 7.3 지문자 시간 판정

| 항목 | 기준값 | 의미 |
| --- | ---: | --- |
| 최소 유효 유지시간 | 1,200ms | 학습 가능한 안정 자세의 최소 길이 |
| 후보 시작시간 | 300ms | 동일 클래스가 후보가 되기 위한 시간 |
| 인식 확정시간 | 600ms | 후보를 서비스 결과로 확정하는 시간 |
| 일시적 실패 허용시간 | 200ms | 순간 미검출 또는 처리 누락 허용시간 |
| 동작 종료시간 | 300ms | 다른 자세 또는 미검출이 지속되는 종료 기준 |

최소 유효 유지시간과 인식 확정시간은 목적이 다르다. 학습 데이터는 안정된 자세 1,200ms 이상을 요구하고, 서비스는 동일 후보가 600ms 유지되면 사용자 입력으로 확정한다.

## 8. 학습 데이터 수집 메시지

수집 모드에서도 `landmark.frame` 형식은 바뀌지 않는다. 정답은 프레임마다 넣지 않고 구간의 시작과 종료로 기록한다.

### 8.1 수집 구간 시작

```json
{
  "schemaVersion": "1.0.0",
  "messageType": "segment.start",
  "sessionId": "0190f744-8f64-7b17-a032-8a4c12d9b701",
  "segmentId": "96e89ac1-8ef4-4a11-a953-1f76447ea2a9",
  "targetLabelId": "consonant_giyeok",
  "startSequenceNumber": 50,
  "startTimestampMs": 5000
}
```

### 8.2 수집 구간 종료

```json
{
  "schemaVersion": "1.0.0",
  "messageType": "segment.end",
  "sessionId": "0190f744-8f64-7b17-a032-8a4c12d9b701",
  "segmentId": "96e89ac1-8ef4-4a11-a953-1f76447ea2a9",
  "endSequenceNumber": 79,
  "endTimestampMs": 7900,
  "completionReason": "completed"
}
```

`completionReason`은 다음 값 중 하나다.

| 값 | 의미 |
| --- | --- |
| `completed` | 정상 완료 |
| `cancelled` | 사용자가 취소 |
| `tracking_lost` | 손 추적 실패로 취소 |
| `timeout` | 제한시간 초과 |

### 8.3 수집 세션 추가 정보

`mode`가 `collection`인 `session.start`에는 다음 `collection` 객체를 추가한다.

```json
{
  "collection": {
    "participantId": "P-8f31a2",
    "datasetPurpose": "train",
    "dominantHand": "Right",
    "consentVersion": "2026-07-01"
  }
}
```

| 필드 | 필수 | 규칙 |
| --- | --- | --- |
| `participantId` | O | 이름, 이메일이 아닌 익명 식별자 |
| `datasetPurpose` | O | `train`, `validation`, `test` |
| `dominantHand` | O | `Left`, `Right`, `Unknown` |
| `consentVersion` | O | 적용한 데이터 수집 동의서 버전 |

학습, 검증, 테스트 참가자는 서로 겹치지 않아야 한다. 데이터 분할은 프레임이나 세션이 아니라 `participantId` 단위로 수행한다.

## 9. AI 서버 저장 형식

AI 서버는 수집 세션을 다음 구조로 저장한다.

```text
data/raw/{sessionId}/
  session.json
  frames.jsonl
  segments.jsonl
```

- `session.json`: `session.start` 한 건과 서버 생성 메타데이터
- `frames.jsonl`: `landmark.frame`을 한 줄에 한 건씩 기록
- `segments.jsonl`: 완료된 수집 구간을 한 줄에 한 건씩 기록
- 원본 사진과 영상은 저장하지 않음

취소된 구간은 삭제하지 않고 `completionReason`을 보존하되 학습 대상에서는 제외한다. 원본 데이터는 수정하지 않고, 정규화 결과는 별도의 `processed` 경로에 생성한다.

## 10. 모델 입력 전처리

전송 규격과 실제 모델 입력은 구분한다. 서버는 원본 랜드마크를 보존하고 다음 순서로 모델 입력을 만든다.

1. 타임스탬프 기준 10 FPS로 재샘플링한다.
2. `worldLandmarks`의 손목 인덱스 `0`을 원점으로 이동한다.
3. 손목에서 MCP 인덱스 `5`, `9`, `13`, `17`까지 거리의 평균으로 크기를 정규화한다.
4. 왼손은 오른손 기준으로 맞추기 위해 x축을 반전한다.
5. 21개 3차원 좌표를 63차원으로 펼친다.
6. 직전 프레임과의 좌표 차이 63차원을 계산한다.
7. 손 검출 여부 1차원을 추가한다.
8. 1.2초 길이인 12프레임 윈도우를 생성한다.

모델 `v1`의 입력 형태는 다음과 같다.

```text
[batchSize, 12, 127]

127 = 정규화 월드 좌표 63 + 프레임 간 좌표 차이 63 + 손 검출 여부 1
```

손이 없는 프레임은 좌표와 좌표 차이를 모두 `0`으로 채우고 손 검출 여부를 `0`으로 둔다. 첫 유효 프레임의 좌표 차이는 `0`이다.

`landmarks`는 화면 밖 이탈, 손 크기, 검출 품질 확인에 사용하고, 모델 `v1`의 주 좌표 입력은 `worldLandmarks`를 사용한다. 이후 모델 비교 실험에서 입력 구성이 달라지더라도 전송 원본은 그대로 유지한다.

## 11. 학습 구간 생성 기준

| 구간 | 생성 기준 |
| --- | --- |
| 지문자 클래스 | 목표 자세가 안정된 1.2초 이상의 구간 |
| `transition` | 서로 다른 지문자 사이의 이동 구간 |
| `none` | 손은 검출되지만 정의된 지문자 자세가 아닌 구간 |
| 손 미검출 | 별도 클래스 학습보다 손 검출 여부 규칙에 우선 사용 |

유효 지문자 구간은 전체 샘플의 90% 이상에서 손이 검출되어야 한다. 시작과 종료 시점의 자세 생성 및 해제 프레임은 지문자 정답 윈도우에서 제외한다.

검증 및 테스트 데이터는 학습 데이터와 같은 전송 규격과 전처리를 사용해야 한다. 직접 촬영 데이터와 외부 영상 데이터도 모두 같은 MediaPipe 버전으로 다시 추출한 뒤 결합한다.

## 12. AI 서버 응답 형식

```json
{
  "schemaVersion": "1.0.0",
  "messageType": "prediction.result",
  "sessionId": "0190f744-8f64-7b17-a032-8a4c12d9b701",
  "sequenceNumber": 79,
  "captureTimestampMs": 7900,
  "status": "candidate",
  "prediction": {
    "labelId": "consonant_giyeok",
    "displayName": "ㄱ",
    "confidence": 0.9172
  },
  "holdDurationMs": 500,
  "confirmed": false,
  "modelVersion": "fingerspelling-v1.0.0"
}
```

| `status` | 의미 |
| --- | --- |
| `none` | 유효한 지문자 없음 |
| `transition` | 자세 전환 중 |
| `candidate` | 후보 자세가 유지되는 중 |
| `confirmed` | 유지시간 기준을 충족해 확정 |

`prediction`은 `status`가 `none` 또는 `transition`일 때 `null`이다. 프론트엔드는 `confirmed: true`인 결과만 최종 입력 문자로 사용한다.

## 13. 유효성 검사와 오류 처리

AI 서버는 다음 조건을 검사한다.

- 알 수 없는 `schemaVersion` 또는 `messageType`
- 세션 시작 전 프레임 수신
- 세션 ID 불일치
- 중복 또는 역순 타임스탬프
- 21개가 아닌 랜드마크 배열
- 3개가 아닌 좌표 성분
- 유한하지 않은 좌표
- 허용되지 않은 라벨 ID
- `collection` 정보가 없는 수집 세션

잘못된 단일 프레임은 폐기하고 오류 응답을 보낸다. 연속 10개 프레임이 잘못되거나 스키마 버전이 호환되지 않으면 세션을 종료한다.

```json
{
  "schemaVersion": "1.0.0",
  "messageType": "error",
  "sessionId": "0190f744-8f64-7b17-a032-8a4c12d9b701",
  "code": "INVALID_LANDMARK_COUNT",
  "message": "landmarks must contain exactly 21 points",
  "sequenceNumber": 42
}
```

## 14. 개인정보와 보안

- 전송 구간은 TLS가 적용된 `wss` 연결을 사용한다.
- 프레임 메시지에 이름, 이메일, 사용자 계정 ID를 넣지 않는다.
- 수집 참가자는 익명 `participantId`만 사용한다.
- 사진 및 영상 원본을 전송하거나 로그에 기록하지 않는다.
- 운영 로그에는 전체 랜드마크 대신 세션 ID, 오류 코드, 처리시간만 남긴다.
- 데이터 수집 동의 철회 시 `participantId`로 해당 원본과 가공 데이터를 추적하여 삭제할 수 있어야 한다.

## 15. 프론트엔드 구현 체크리스트

- [ ] MediaPipe 입력은 좌우 반전하지 않고 프리뷰만 CSS로 반전한다.
- [ ] 손 개수를 1개로 제한한다.
- [ ] 목표 10 FPS로 샘플링한다.
- [ ] 모든 프레임에 단조 증가하는 타임스탬프와 시퀀스 번호를 붙인다.
- [ ] 모든 프레임에 `frameStatus`를 기록한다.
- [ ] 손 미검출 또는 처리 누락에도 `hand: null` 프레임을 보낸다.
- [ ] 21개의 `landmarks`와 `worldLandmarks`를 원본 순서로 보낸다.
- [ ] 추론 프레임에 라벨을 넣지 않는다.
- [ ] 수집 라벨은 `segment.start`와 `segment.end`로만 보낸다.
- [ ] MediaPipe 라이브러리와 모델 파일 버전을 세션에 기록한다.

## 16. AI 서버 구현 체크리스트

- [ ] 세션과 프레임 스키마를 검증한다.
- [ ] 타임스탬프 기준으로 10 FPS 재샘플링한다.
- [ ] 왼손과 오른손을 동일 기준으로 정규화한다.
- [ ] 1.2초, 12프레임 모델 입력 윈도우를 생성한다.
- [ ] 참가자 단위로 학습, 검증, 테스트 데이터를 분리한다.
- [ ] 원본 프레임과 가공 데이터를 별도 경로에 저장한다.
- [ ] 확정되지 않은 후보와 최종 확정 결과를 구분해 응답한다.

## 17. 참고 자료

- [MediaPipe Hand Landmarker Python Guide](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/python)
- [MediaPipe HandLandmarkerResult](https://ai.google.dev/edge/api/mediapipe/python/mp/tasks/vision/HandLandmarkerResult)
- [MediaPipe Hand Landmark Index](https://ai.google.dev/edge/api/mediapipe/python/mp/tasks/vision/drawing_styles/hand_landmarker/HandLandmark)
