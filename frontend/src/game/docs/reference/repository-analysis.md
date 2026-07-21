# Repository Analysis

## 저장소 구조

```text
Sign_Language_Translation/
├─ dataset/                         # 라벨별 원본 AVI와 93개 sequence NPY
├─ frontend/src/game/docs/game-spec.md # 전체 프런트 게임 명세
├─ models/
│  ├─ multi_hand_gesture_classifier.h5
│  └─ multi_hand_gesture_classifier.tflite
├─ Sign_Language_Translation/
│  ├─ making_video.py               # 웹캠 영상 수집
│  ├─ create_dataset_from_video.py  # 영상 → 10-frame sequence NPY
│  ├─ train_hand_gesture.ipynb      # LSTM 학습 및 TFLite 변환
│  ├─ video_test_model_tflite.py    # 저장 영상 추론
│  ├─ webcam_test_model_tflite.py   # 실시간 웹캠 추론 진입점
│  └─ modules/
│     ├─ holistic_module.py         # MediaPipe Holistic wrapper
│     └─ utils.py                   # Vector_Normalization
└─ version_requirements.txt
```

분석 시작 시 기존 작업 트리는 이미 수정 상태였다. `modules/utils.py`, `video_test_model_tflite.py`, `webcam_test_model_tflite.py`에 추적 중인 변경이 있었으며, Phase 1에서는 이 기존 파일을 추가로 수정하지 않았다.

## 기존 실행 진입점

| 파일 | 역할 | 관찰 사항 |
| --- | --- | --- |
| `making_video.py` | 웹캠으로 라벨별 30초 AVI 수집 | 실행 시 데이터 파일을 생성하므로 분석 단계에서는 실행하지 않음 |
| `create_dataset_from_video.py` | AVI에서 특징 벡터와 sequence 생성 | 현재 저장 코드는 주석 처리됨 |
| `train_hand_gesture.ipynb` | LSTM 학습, H5/TFLite 저장 | 재학습은 Phase 1 범위 밖 |
| `video_test_model_tflite.py` | 저장 영상 기반 TFLite 테스트 | 현재 `dataset/example1`을 대상으로 설정하지만 해당 경로 없음 |
| `webcam_test_model_tflite.py` | 실시간 TFLite 테스트 | 현재 저장소의 실질적인 실행 진입점 |

실행 기준 작업 디렉터리는 저장소 루트다. 모델 경로는 `models/multi_hand_gesture_classifier.tflite`다.

## 모델 계약

### 파일

| 모델 | 위치 | 크기 |
| --- | --- | ---: |
| TFLite | `models/multi_hand_gesture_classifier.tflite` | 147,056 bytes |
| Keras H5 | `models/multi_hand_gesture_classifier.h5` | 443,584 bytes |

### 실제 라벨 순서

`create_dataset_from_video.py`, 학습 notebook, TFLite 출력 크기를 교차 확인했다.

```text
0  ㄱ   1  ㄴ   2  ㄷ   3  ㄹ   4  ㅁ   5  ㅂ   6  ㅅ
7  ㅇ   8  ㅈ   9  ㅊ  10  ㅋ  11  ㅌ  12  ㅍ  13  ㅎ
14 ㅏ  15 ㅑ  16 ㅓ  17 ㅕ  18 ㅗ  19 ㅛ  20 ㅜ
21 ㅠ  22 ㅡ  23 ㅣ  24 ㅐ  25 ㅒ  26 ㅔ  27 ㅖ
28 ㅢ  29 ㅚ  30 ㅟ
```

숫자는 모델 출력에 포함되지 않는다. 현재 AI 모델의 실제 지원 심볼은 위 31개뿐이다.

### Tensor shape

| 구분 | 이름 | shape | dtype |
| --- | --- | --- | --- |
| TFLite input | `lstm_input` | `[1, 10, 55]` | `float32` |
| TFLite output | `Identity` | `[1, 31]` | `float32` |
| H5 input config | `lstm_input` | `[None, 10, 55]` | float |
| H5 output config | `dense_1` | `[None, 31]` | softmax |

sequence length는 `10`이다. NPY 파일 하나의 shape은 `[sample_count, 10, 56]`이며 마지막 값은 라벨이므로 학습 입력 특징은 55개다. 저장소에는 31개 라벨 × 3명 데이터인 NPY 93개가 있다.

H5 구조는 `Input(10,55) → LSTM(64, relu) → Dropout(0.3) → Dense(32, relu) → Dropout(0.3) → Dense(31, softmax)`다. 현재 TensorFlow 2.19/Keras에서는 구형 `time_major` 설정을 인식하지 못해 `load_model(..., compile=False)`가 실패했다. H5 내부 `model_config`와 notebook으로 shape와 계층을 확인했다. TFLite 로딩과 tensor allocation은 성공했다.

## 랜드마크와 특징 벡터

학습 데이터 생성의 기준 흐름은 다음과 같다.

```text
영상 프레임
→ MediaPipe Holistic
→ right_hand_landmarks 21개
→ landmark 0..20의 x, y를 joint[0..20]에 저장
→ 부모-자식 관절 20쌍의 2D 방향 벡터 계산
→ 각 방향 벡터를 단위 길이로 정규화: 20 × 2 = 40
→ 손가락별 인접 뼈 15쌍의 내적으로 각도 계산: 15
→ vector 40 + angle 15 = frame feature 55
→ 연속 10 frame을 `[10,55]` sequence로 구성
→ batch 축을 추가해 `[1,10,55]`로 TFLite 추론
→ 31개 softmax 중 argmax와 해당 confidence 사용
```

특징 생성에는 MediaPipe의 `z`가 사용되지 않는다. 위치 자체가 아니라 정규화된 2D 뼈 방향과 관절 각도를 사용한다. 라벨 순서, 10-frame sequence, 55개 특징, 모델 파일은 후속 adapter에서도 그대로 유지해야 한다.

## 기존 실행 결과

환경:

```text
Python 3.10.18 (C:\Users\SSAFY\miniforge3\envs\nlp\python.exe)
TensorFlow 2.19 계열
Node 24.13.0
npm 11.6.2
```

`webcam_test_model_tflite.py`를 저장소 루트에서 실행했다. TFLite XNNPACK delegate와 MediaPipe가 초기화됐고 프로세스는 10초 후에도 실행 중이었다. 검증을 위해 해당 프로세스는 종료했다. 치명적 예외는 없었고 TensorFlow Lite interpreter deprecation 및 MediaPipe feedback tensor 경고만 기록됐다.

이 결과는 Python 프로세스와 카메라 초기화 시도까지의 실행 검증이다. 자동화 환경에서 OpenCV 창의 픽셀과 실제 분류 정확도는 검증하지 않았다.
