# 지문자 AI 데이터 전처리

사진 폴더에서 MediaPipe Hand Landmarker 특징점을 추출하고, 프레임 분류 모델에 사용할 63차원 NPZ 데이터셋을 생성한다. 사진은 강제로 리사이징하지 않으며 EXIF 방향만 보정한다.

## 실행 환경

- Python `3.10` 이상 `3.13` 미만
- MediaPipe `0.10.21`
- NumPy `1.26.4`
- Pillow `10.4.0`

Windows PowerShell에서 다음 순서로 환경을 준비한다.

```powershell
cd ai
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e .
```

PowerShell 실행 정책으로 활성화가 막히면 활성화 없이 `.\.venv\Scripts\python.exe`를 사용해도 된다.

## 입력 폴더

```text
Signlanguage/
  train/
    consonant_giyeok/
      consonant_giyeok__train__p-local-001__capture-001.jpg
  valid/
    vowel_a/
      vowel_a__valid__p-local-002__capture-001.jpg
  test/
    none/
      none__test__p-local-004__capture-001.jpg
```

- split 폴더는 `train`, `valid` 또는 `validation`, `test`를 사용한다.
- 클래스 폴더는 `config/labels.json`의 자모 모델 클래스 32개와 일치해야 한다.
- 직접 촬영 파일에는 익명 참가자 토큰 `p-...`를 세 번째 `__` 구간에 기록한다.
- 참가자 ID가 없는 공개 데이터는 최종 `validation`과 `test`에서 자동 제외된다.
- 동일한 이미지 내용은 파일명이나 split이 달라도 중복으로 허용하지 않는다.
- `train`에는 32개 클래스마다 `config/preprocessing.json`에서 정한 최소 승인 수량이 필요하다.
- 지원 확장자는 JPG, JPEG, PNG, WEBP, BMP다.

## 모델 준비

```powershell
fingerspelling-data download-model
```

공식 Hand Landmarker 모델을 `models/hand_landmarker.task`에 내려받고 설정에 고정된 SHA-256을 검증한다. 모델 파일은 Git에 포함되지 않는다.

## 전처리 실행

저장소의 `ai` 폴더에서 실행한다.

```powershell
fingerspelling-data preprocess `
  --input "C:\data\Signlanguage" `
  --output "C:\data\Signlanguage-processed-v1" `
  --dataset-version "fingerspelling-photo-v1"
```

출력 폴더가 비어 있지 않으면 기존 데이터를 보호하기 위해 중단한다. 의도적으로 다시 생성할 때만 `--overwrite`를 추가한다. 재생성은 별도 임시 경로에서 완료한 뒤 기존 출력과 교체하므로 모델 검증, 특징점 추출 또는 클래스 검사에 실패하면 기존 결과를 유지한다.

## 산출물

```text
Signlanguage-processed-v1/
  raw/frames.jsonl
  processed/frames.npz
  rejected/frames.jsonl
  manifest.json
```

- `raw/frames.jsonl`: 이미지별 원본 랜드마크, 라벨, 참가자, 출처, 품질과 추출기 정보
- `processed/frames.npz`: 정규화된 `features [N, 63]`와 라벨 및 split 메타데이터
- `rejected/frames.jsonl`: 검출 실패, 작은 손, 평가 참가자 정보 부재 등 제외 사유
- `manifest.json`: 입력·승인·제외 수량, 전체 및 train 클래스별 수량, 클래스 순서, 설정 및 모델 해시

NPZ의 문자열 배열은 pickle이 필요 없는 고정 문자열 dtype으로 저장한다. GPU 서버로는 원본 사진 대신 `processed/frames.npz`와 `manifest.json`을 전달한다.

## 품질 및 정규화

1. 이미지 좌표와 월드 좌표가 각각 `[21, 3]`인지 확인한다.
2. 이미지 좌표로 손 크기와 화면 이탈을 검사한다.
3. 월드 좌표의 손목 인덱스 `0`을 원점으로 이동한다.
4. 손목에서 MCP `5`, `9`, `13`, `17`까지 평균 거리로 크기를 정규화한다.
5. 왼손 x축을 반전해 오른손 좌표계로 통일한다.
6. 회전 정규화 없이 `[63] float32`로 펼친다.

모든 기준값은 `config/preprocessing.json`에서 관리한다.

## 테스트

```powershell
python -m unittest discover -s tests -v
```

테스트는 클래스 순서, 폴더 메타데이터, 좌표 정규화, 평가 split 보호, JSONL과 NPZ 산출물을 검증한다.
