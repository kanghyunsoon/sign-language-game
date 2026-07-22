# 지문자 모델 학습 가이드

## 1. 목적과 범위

이 파이프라인은 전처리된 `float32 [N, 63]` 손 특징점으로 지문자 31개와 `none`을 분류하는 단일 프레임 모델을 학습한다. 사진이나 영상 원본은 학습 서버에 필요하지 않다. 프레임 결과의 1,200ms 유지 판정은 모델 학습이 아니라 서비스 집계 단계의 책임이다.

## 2. 기준 입력

```text
Signlanguage-processed-v1/
  processed/frames.npz
  manifest.json
```

NPZ에는 `features`, `labelIndices`, `labelIds`, `sampleIds`, `participantIds`, `groupIds`, `splits`, `sources`, `classIds` 배열이 필요하다. 파이프라인은 manifest 해시와 수량, 32개 클래스 순서, sample ID 중복, 참가자 및 원본 그룹의 split 누수를 학습 전에 검증한다.

설정 파일의 줄바꿈 방식에 영향을 받지 않도록 새 manifest는 정렬된 JSON 내용의 canonical SHA-256도 기록한다. 기존 manifest는 원시 해시가 다를 때 모델 입력을 결정하는 정규화 설정이 정확히 같은 경우에만 호환한다.

## 3. 기준 모델

초기 기준 모델은 다음 MLP다.

```text
[63]
  -> train split 평균/표준편차 정규화
  -> Linear 256 + LayerNorm + ReLU + Dropout 0.2
  -> Linear 128 + LayerNorm + ReLU + Dropout 0.2
  -> Linear 32 logits
```

- 손의 기하학 정규화는 전처리 파이프라인에서 수행한다.
- train 통계 기반 표준화는 모델 내부 버퍼에 포함하므로 ONNX 추론에도 동일하게 적용된다.
- 클래스 불균형은 train 클래스 빈도의 역수 기반 가중 Cross Entropy로 보정한다.
- validation Macro F1을 기준으로 최고 checkpoint를 선택하고 조기 종료한다.
- 최고 모델 선택 후에만 test를 한 번 평가한다.
- validation logits에 temperature scaling을 적용하고, 보정값을 `thresholds.json`에 저장한다.

모든 하이퍼파라미터는 `ai/config/training.json`에서 관리한다.

## 4. GPU 서버 준비

Python은 `3.10` 이상 `3.13` 미만을 사용한다. 어떤 서버를 배정받더라도 먼저 Jupyter 커널에서 다음을 확인한다.

```python
import torch

print(torch.__version__)
print(torch.version.cuda)
print(torch.cuda.is_available())
print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU")
```

저장소의 `ai` 폴더에서 작업별 가상환경을 생성한다. 다른 팀원의 작업 폴더에 있는 가상환경은 조회 외에는 사용하거나 수정하지 않는다.

```bash
python -m venv .venv
python -m pip install --upgrade pip
python -m pip install -r requirements-training.txt
```

학습 의존성은 PyTorch `2.5` 이상 `3.0` 미만을 허용하므로 서버에 설치된 호환 버전을 낮추지 않는다. JupyterLab은 서버가 관리하므로 프로젝트 요구사항에서 설치하거나 버전을 변경하지 않는다.

`torch.cuda.is_available()`이 `False`면 학습을 시작하지 말고 Jupyter 커널과 GPU용 PyTorch 설치 상태를 먼저 수정한다. H200, L40S, V100 중 어떤 장비가 배정되더라도 코드와 설정은 바꾸지 않으며 `device: auto`가 현재 CUDA 장치를 선택한다.

서버가 다음과 같이 물리 GPU를 제한할 수 있다.

```bash
echo $CUDA_VISIBLE_DEVICES
# 2
```

이 경우 물리 GPU 2번만 프로세스에 노출되며 PyTorch에서는 논리 장치 `cuda:0`이 된다. 코드에서 `cuda:2`를 지정하면 존재하지 않는 장치 오류가 발생하므로 `auto` 또는 `cuda:0`을 사용한다.

## 5. CLI 학습

```bash
fingerspelling-data train \
  --dataset "/data/Signlanguage-processed-v1" \
  --output "/data/artifacts/fingerspelling-v1.0.0" \
  --model-version "fingerspelling-v1.0.0"
```

기존 출력이 있으면 기본적으로 중단한다. 의도적으로 교체할 때만 `--overwrite`를 사용한다. CI나 Git 저장소 밖에서 실행해 commit을 자동 감지할 수 없으면 `--git-commit <SHA>`를 명시한다.

## 6. Jupyter 학습

`ai/notebooks/train-fingerspelling.ipynb`는 CLI와 같은 `runTraining` 함수를 호출한다. 노트북에는 학습 구현을 복사하지 않고 경로와 모델 버전만 지정하므로 로컬 코드와 서버 코드가 달라지지 않는다.

1. 저장소와 전처리 데이터셋을 GPU 서버에 올린다.
2. Jupyter에서 저장소의 `ai` 디렉터리를 작업 경로로 연다.
3. 노트북의 `datasetRoot`, `outputRoot`, `modelVersion`만 수정한다.
4. GPU 확인 셀 이후 전체 셀을 순서대로 실행한다.
5. `metrics.json`과 confusion matrix를 검토한 뒤 모델 채택 여부를 결정한다.

## 7. 산출물

```text
fingerspelling-v1.0.0/
  checkpoint.pt
  model.onnx
  labels.json
  preprocessing.json
  recognition-policy.json
  training.json
  thresholds.json
  metrics.json
  history.jsonl
  validation-confusion-matrix.csv
  test-confusion-matrix.csv
  model-manifest.json
```

`model-manifest.json`은 데이터셋 버전과 identity, Git commit, 클래스 순서, 입력·출력 형태, PyTorch/CUDA/장치 정보, 각 산출물 SHA-256을 기록한다. 실제 서비스에는 최소 `model.onnx`, `model-manifest.json`, `thresholds.json`, `labels.json`, `preprocessing.json`을 함께 배포한다.

## 8. 평가 기준

`metrics.json`은 validation과 test 각각에 대해 다음 값을 기록한다.

- Accuracy, Macro Precision, Macro Recall, Macro F1
- 클래스별 Precision, Recall, F1, False Accept Rate, support
- `none` 입력을 지문자로 잘못 수락한 비율
- Expected Calibration Error
- 손실과 전체 표본 수

현재 전처리 데이터는 `train 2,669`, `validation 72`, `test 76`이다. 평가 split이 클래스당 약 2개 수준이므로 전체 파이프라인 검증에는 사용할 수 있지만 최종 성능과 클래스별 임계값을 확정하기에는 부족하다. 클래스별 validation 표본이 `training.json`의 최소 수량보다 적으면 해당 임계값은 과적합 보정 대신 기본값 `0.80`을 유지한다.

최종 모델 채택 전에는 새로운 참가자로 validation과 test를 보강하고, 최소한 다음을 확인한다.

- 이전 모델보다 validation Macro F1이 개선되거나 유지되는가
- `none`의 지문자 오수락률이 서비스 허용 범위인가
- 혼동이 잦은 모음과 자음의 클래스별 Recall이 충분한가
- test가 모델 선택과 임계값 조정에 사용되지 않았는가

## 9. 단일 프레임 확인

```bash
fingerspelling-data predict \
  --package "/data/artifacts/fingerspelling-v1.0.0" \
  --features "/data/one-frame.json" \
  --top-k 3
```

입력은 전처리와 동일한 63차원 특징점이어야 한다. 명령은 패키지 해시를 검증하고 예측 클래스, confidence, 클래스 임계값, 수락 여부와 상위 후보를 반환한다. 서비스는 이 프레임 결과를 그대로 확정하지 않고 `recognition-policy.json`의 시간 기준으로 집계해야 한다.
