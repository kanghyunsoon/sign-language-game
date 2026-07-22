# 지문자 AI 파이프라인 아키텍처

## 문서 상태

- 문서 버전: 1.0.0
- 상태: 확정
- 적용 범위: 지문자 31개 프레임 분류, 데이터 전처리, GPU 학습, 단일 프레임 추론, 실시간 서비스 판정
- 제외 범위: 지숫자, 단어 및 문장 수어, 원본 영상 기반 시계열 모델

이 문서는 지문자 AI의 전체 처리 흐름과 각 파이프라인의 책임을 정의한다. 모델은 사진 또는 영상의 한 프레임을 독립적으로 판단하고, 실제 서비스의 유지시간은 AI 서버가 프레임별 결과를 촬영 타임스탬프 기준으로 집계한다.

## 1. 기준 파일

중복 정의로 인한 규격 불일치를 막기 위해 다음 파일을 단일 기준으로 사용한다.

| 기준 | 파일 | 책임 |
| --- | --- | --- |
| 클래스 ID | `ai/config/labels.json` | 표시 이름, 클래스 ID, 인식 모드 |
| 시간과 신뢰도 | `ai/config/recognition-policy.json` | FPS, 임계값, 유지시간, 실패 허용시간 |
| 전송 메시지 | `ai/docs/fingerspelling-landmark-data-contract.md` | 프론트엔드와 AI 서버 사이의 JSON 규격 |
| 프론트 구현 | `ai/docs/frontend-fingerspelling-integration-guide.md` | MediaPipe 실행 및 WebSocket 흐름 |
| 학습 설정 | `ai/config/training.json` | 모델 구조, 최적화, 조기 종료, 임계값 보정 |
| 학습 실행 | `ai/docs/fingerspelling-training-guide.md` | GPU/Jupyter 실행, 산출물, 평가 기준 |
| 전체 처리 흐름 | 이 문서 | 파이프라인 경계, 산출물, 배포 흐름 |

문서와 설정값이 다르면 JSON 설정 파일을 우선하고 문서 불일치로 처리한다. 모델 패키지는 사용한 설정 파일의 버전과 해시를 manifest에 기록한다.

## 2. 확정된 설계 결정

| 항목 | 확정안 |
| --- | --- |
| 모델 단위 | 단일 프레임 분류 |
| 모델 입력 | 정규화한 `worldLandmarks [21, 3]`을 펼친 63차원 |
| 모델 출력 | 지문자 31개 + `none`, 총 32개 클래스 확률 |
| `transition` | 모델 클래스가 아닌 AI 서버 상태 |
| 서비스 입력 | 프론트엔드 MediaPipe 랜드마크, 목표 10 FPS |
| 서비스 확정 | 실제 타임스탬프 기준 1,200ms 집계 |
| 일시적 실패 | 최대 200ms |
| 데이터 원본 | JSONL 랜드마크와 메타데이터 |
| 학습 입력 | 압축 NPZ 또는 동등한 배열 형식 |
| 학습 환경 | 별도 GPU 서버 |
| 운영 환경 | 모델 아티팩트를 배포한 독립 AI 추론 서버 |

프레임 간 좌표 차이와 고정 12프레임 배열은 모델 입력에 포함하지 않는다. 12프레임은 10 FPS에서 1.2초 동안 기대되는 수량일 뿐이며, 실제 판정은 프레임 개수가 아니라 `captureTimestampMs`로 수행한다.

## 3. 전체 구조

```text
사진 또는 영상
  -> MediaPipe 특징점 추출
  -> 원본 JSONL 저장
  -> 품질 검사 및 정규화
  -> 참가자/원본 그룹 기준 데이터 분할
  -> 학습용 NPZ 생성
  -> GPU 서버 학습 및 평가
  -> 버전이 있는 모델 패키지 생성
  -> 단일 프레임 추론기 배포
  -> 실시간 프레임 결과 집계
  -> 프론트엔드에 후보/확정 결과 반환
```

## 4. 공통 프레임 데이터

오프라인 이미지와 프론트엔드 실시간 데이터는 같은 랜드마크 의미와 클래스 ID를 사용한다.

```json
{
  "schemaVersion": "1.0.0",
  "sampleId": "roboflow-giyeok-0001",
  "source": "public-dataset",
  "participantId": null,
  "sessionId": null,
  "groupId": "giyeok-0001",
  "labelId": "consonant_giyeok",
  "captureTimestampMs": null,
  "frameStatus": "detected",
  "hand": {
    "handedness": "Right",
    "handednessScore": 0.98,
    "landmarks": [],
    "worldLandmarks": []
  },
  "quality": {
    "valid": true,
    "reasons": [],
    "evaluationEligible": true
  },
  "extractor": {
    "libraryVersion": "0.10.14",
    "modelAssetSha256": "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1",
    "runningMode": "IMAGE"
  }
}
```

실제 랜드마크 배열은 각각 21개의 `[x, y, z]`를 포함한다. 사진은 타임스탬프와 세션 ID가 없을 수 있지만 `sampleId`, `groupId`, `source`, `labelId`는 반드시 기록한다.

## 5. 전처리 파이프라인

### 5.1 책임

1. 사진의 EXIF 회전만 보정한다.
2. 학습 편의를 위한 강제 정사각형 리사이즈를 하지 않는다.
3. 가능한 경우 원본 해상도에서 MediaPipe를 실행한다.
4. `landmarks`, `worldLandmarks`, handedness와 추출기 버전을 저장한다.
5. 검출 실패, 손 잘림, 비정상 좌표와 너무 작은 손을 품질 결과로 기록한다.
6. 원본 JSONL을 수정하지 않고 정규화 결과를 별도로 만든다.

프론트엔드는 `VIDEO`, 오프라인 사진 추출기는 `IMAGE` 실행 모드를 사용한다. 라이브러리와 모델 파일 버전은 고정하고, 실행 모드 차이가 좌표 분포에 미치는 영향은 동일 사진 표본으로 검증한다.

### 5.2 정규화

1. `worldLandmarks`의 손목 인덱스 `0`을 원점으로 이동한다.
2. 손목에서 MCP `5`, `9`, `13`, `17`까지 평균 거리로 나눈다.
3. 왼손은 오른손 기준으로 x축을 반전한다.
4. 손바닥 방향을 없애는 회전 정규화는 적용하지 않는다.
5. 21개 3차원 좌표를 63차원 `float32`로 펼친다.

손바닥 방향은 일부 모음을 구분하는 특징이므로 보존한다. `landmarks`는 화면 이탈과 손 크기 등 품질 검사에 사용하고 모델 주 입력에는 사용하지 않는다.

### 5.3 산출물

```text
{outputRoot}/raw/frames.jsonl
{outputRoot}/processed/frames.npz
{outputRoot}/rejected/frames.jsonl
{outputRoot}/manifest.json
```

`outputRoot`는 데이터셋 버전별로 새 경로를 사용한다. 검출 실패 데이터는 조용히 삭제하지 않고 실패 이유를 남긴다. 이미지와 영상 원본, JSONL, NPZ, MediaPipe 모델 파일은 Git에 커밋하지 않는다. 실행 명령과 상세 필드 설명은 `ai/README.md`를 따른다.

## 6. 데이터셋 구성 파이프라인

### 6.1 분할 원칙

- 동일 참가자의 데이터는 하나의 split에만 포함한다.
- 참가자 ID가 없으면 동일 촬영 세션과 증강 원본 `groupId`를 하나로 묶는다.
- 증강본은 원본과 다른 split에 들어갈 수 없다.
- 참가자 정보가 없는 공개 데이터는 원칙적으로 `train`에만 사용한다.
- `validation`과 `test`는 학습 참여자와 겹치지 않는 직접 촬영 인원으로 구성한다.
- `test`는 모델 및 임계값 선택에 사용하지 않는다.

### 6.2 클래스 처리

- 외부 데이터의 폴더 이름은 `labels.json`의 정식 ID로 매핑한다.
- 손이 검출된 비지문자 자세는 `none` 학습 후보로 사용한다.
- 손이 없는 프레임은 32개 클래스 모델에 넣지 않고 서비스 규칙으로 처리한다.
- 전환 프레임은 지문자와 `none` 학습에서 제외하고 시계열 상태 테스트에 사용한다.
- 클래스 수 불균형은 클래스 가중치 또는 weighted sampler로 보정한다.

## 7. GPU 학습 파이프라인

로컬에서는 특징점 추출과 데이터 검증을 수행하고, 얼굴이 포함된 이미지 대신 정제된 NPZ와 manifest를 GPU 서버로 전달한다.

1. 데이터 스키마와 클래스 ID를 검증한다.
2. manifest의 참가자 및 그룹 분할 누수를 검사한다.
3. 학습 데이터로 모델을 학습한다.
4. validation으로 구조, 하이퍼파라미터와 클래스별 임계값을 결정한다.
5. 마지막 후보 모델에 한해 test를 한 번 평가한다.
6. 모델과 설정을 하나의 버전 패키지로 생성한다.

평가 지표는 Accuracy만 사용하지 않고 Macro F1, 클래스별 Precision/Recall, Confusion Matrix, `none` 오탐률, 목표 클래스 False Accept Rate와 신뢰도 보정 결과를 기록한다.

GPU 실행환경은 CUDA, 프레임워크, Python 버전을 고정한 컨테이너 또는 잠금 파일로 재현 가능해야 한다. 작은 63차원 모델은 CPU에서도 실행 가능하므로 운영 추론 서버가 학습 GPU 서버에 종속되지 않게 한다.

## 8. 모델 패키지

```text
artifacts/fingerspelling/{modelVersion}/
  model.onnx
  checkpoint.pt
  labels.json
  preprocessing.json
  recognition-policy.json
  training.json
  thresholds.json
  metrics.json
  history.jsonl
  validation-confusion-matrix.csv
  training-report.html
  training-report.md
  report-data.json
  model-manifest.json
```

`test-confusion-matrix.csv`는 모델 선택이 끝난 최종 후보를 `--evaluate-test`로 평가한 경우에만 생성한다.

`model-manifest.json`에는 데이터셋 버전, Git 커밋, 모델 입력 형태 `[batchSize, 63]`, 클래스 순서, MediaPipe 버전과 각 설정 파일 해시를 기록한다. 서비스는 manifest와 다른 스키마의 입력을 거부한다.

## 9. 단일 프레임 추론 파이프라인

단일 프레임 추론기는 실시간 서비스와 배치 평가가 공유하는 최소 실행 단위다.

```text
worldLandmarks + handedness
  -> 공통 정규화
  -> [1, 63]
  -> 모델
  -> 32개 클래스 확률
```

출력에는 모델 버전, 최상위 클래스, 최상위 신뢰도, 목표 클래스 신뢰도와 상위 후보를 포함한다. 학습과 추론에서 같은 정규화 모듈과 클래스 순서를 사용해야 한다.

## 10. 실시간 서비스 파이프라인

1. 프론트엔드가 WebSocket 연결 후 `session.start`를 보낸다.
2. 현재 문제의 지문자를 `target.set`으로 보낸다.
3. 프론트엔드가 목표 10 FPS로 `landmark.frame`을 보낸다.
4. 서버가 유효 프레임마다 단일 프레임 추론을 수행한다.
5. 서버가 목표 클래스 확률을 실제 촬영 타임스탬프로 집계한다.
6. 1,200ms, 유효 프레임 비율 80%, 평균 신뢰도 기본 0.80을 충족하면 확정한다.
7. 서버가 후보 진행 상태 또는 최종 결과를 프론트엔드에 반환한다.

200ms 이하의 미검출은 허용하고 이를 초과하면 집계를 중단한다. 목표 변경, 세션 종료 또는 300ms 이상 해제 상태에서도 집계를 초기화한다. 동일 동작에서 `confirmed`는 한 번만 반환한다.

다중 서버 환경에서는 세션 상태를 Redis와 같은 공유 저장소에 두거나 WebSocket 연결에 sticky session을 적용한다. 단일 서버 MVP에서는 TTL이 있는 메모리 상태를 사용할 수 있다.

## 11. 개인정보와 운영

- 서비스에서는 사진과 영상을 AI 서버로 전송하지 않는다.
- GPU 서버에는 가능한 한 랜드마크와 익명 메타데이터만 전달한다.
- 운영 로그에는 전체 좌표를 기록하지 않는다.
- 원본 데이터와 가공 데이터는 `participantId` 또는 `source`로 추적 가능해야 한다.
- 데이터셋, 전처리, 모델, 임계값과 서비스 배포 버전을 함께 기록한다.
- 모델 교체는 manifest 검증과 이전 버전 롤백이 가능해야 한다.

## 12. 구현 순서

1. JSON Schema와 공통 정규화 모듈을 확정한다.
2. 이미지 폴더를 JSONL로 변환하는 특징점 추출기를 구현한다.
3. 품질 검사와 참가자/그룹 기반 split manifest 생성기를 구현한다.
4. NPZ 생성과 GPU 학습 파이프라인을 구현한다.
5. 모델 패키지 및 단일 프레임 추론기를 구현한다.
6. 프레임 집계 상태 머신과 WebSocket API를 구현한다.
7. 프론트엔드와 서버의 계약 테스트를 작성한다.
8. 새로운 참가자로 전체 서비스 검증을 수행한다.

## 13. 완료 기준

- 사진과 실시간 프레임이 동일한 63차원 전처리 결과를 만든다.
- 같은 참가자 또는 증강 원본이 여러 split에 포함되지 않는다.
- 모델 패키지만으로 클래스, 전처리와 임계값을 재현할 수 있다.
- 프론트엔드 목표 변경 시 서버 집계 상태가 초기화된다.
- 1.2초 미만 자세는 확정되지 않는다.
- 200ms 이하 일시적 실패는 유지되고 이를 초과하면 중단된다.
- 검증 및 테스트 지표가 참가자 단위로 산출된다.
