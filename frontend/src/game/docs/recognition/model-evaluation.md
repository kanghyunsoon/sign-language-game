# 지문자 인식 모델 평가

> 이 평가는 프런트 게임 인식 경계와 함께 관리하며 원본 수치는 같은 폴더의 `model-evaluation.json`을 기준으로 한다.

## 2026-07-21 자모+숫자 확장 결과

추가 비용 없이 로컬 CPU에서만 학습했다. 숫자 데이터는 Kaggle [Korean Sign Language(KSL) - Numbers](https://www.kaggle.com/datasets/nahyunpark/korean-sign-languageksl-numbers)의 CC0 공개본 1,107장을 사용했다. [DACON 데이터 설명](https://dacon.io/en/competitions/official/235896/data)의 train/test 구조도 교차 확인했다. MediaPipe hand landmark 추출은 1,065장 성공, 42장 실패로 수용률 96.21%였다. 원본 이미지와 추출 feature는 Git에 포함하지 않는다.

검토했지만 사용하지 않은 데이터도 기록한다. HaGRID는 `no_gesture`와 사람 분리 metadata가 있어 OOD에 적합하지만 이번 실행에서는 원격 내려받기가 완료되지 않아 학습에 넣지 않았다. 50×50 CC0 hand-gesture 데이터 24,000장은 대표 20장 중 MediaPipe 검출이 1장뿐이라 제외했다. 제외 데이터를 성능 근거에 합산하지 않는다.

| 모델 | 평가 조건 | 자모 정확도 | 숫자 정확도 | 전체 정확도 | 채택 |
|---|---|---:|---:|---:|:---:|
| 기존 `jamo-31-v1` | 기존 혼합 2,790표본 | 90.82% | 미지원 | - | 자모 기준선 |
| 세션 분리 재학습 | 자모 2세션 학습/1세션 평가 | 85.50% | 미지원 | - | 실패 |
| 41-class LSTM fine-tune | 자모 세션 분리 + 제공 숫자 test | 80.88% | 69.08% | 80.63% | 실패, 미배포 |
| 41-class Extra Trees | 같은 분리, 220 summary feature | 87.20% | **95.39%** | 87.38% | domain/숫자 head |
| `jamo-number-hybrid-v1` | 기존 자모 head + tree domain/숫자 head | 91.82%* | **95.39%** | 91.90%* | 기본 서버 프로필 |

`*` 자모 수치는 기존 배포 TFLite가 학습에 보았을 수 있는 세션에서 측정한 회귀 수치다. 독립 사용자 성능 인증으로 사용할 수 없다. 숫자도 데이터 제공자의 train/test 폴더를 지켰지만 signer ID가 없어 사람 독립 split이라고 단정하지 않는다. 따라서 “전체 95% 달성”은 실패이며, 발표에서는 반드시 `숫자 제공 test 95.39%`, `전체 91.90%`, `자모 독립 재학습 85.50%`를 구분해 말한다.

hybrid는 tree가 자모/숫자 영역만 선택하고, 자모로 판단하면 기존 TFLite의 31개 확률을 그대로 사용한다. 보유 평가 14,282개에서 자모→숫자 및 숫자→자모 영역 오분기는 각각 0건이었다. 평균 end-to-end 추론은 CPU 기준 표본당 0.578ms였다. 원시 결과는 [hybrid evaluation](../../../../../models/jamo-number-hybrid-v1/evaluation.json)과 [tree evaluation](../../../../../models/jamo-number-41-tree-v1/evaluation.json)에 보존한다.

### 개선에 사용한 기술과 결론

- 기존 H5/TFLite를 hash와 함께 별도 보존해 실험 실패 시 즉시 롤백할 수 있게 했다.
- MediaPipe 변환을 자체 `feature_v2.py`로 옮겨 외부 예제 코드 런타임 의존을 제거했다.
- 정적 숫자 이미지에는 10프레임 반복 입력을 만들고, tree에는 last/mean/std/delta 220값을 사용했다.
- 숫자 소수 class는 landmark feature 공간에서 작은 noise를 넣어 500개까지 균형화했다.
- 단일 LSTM fine-tune은 정적 숫자와 동적 자모 domain 충돌로 성능이 하락해 채택하지 않았다.
- 최종 hybrid는 숫자 영역이 확실할 때만 숫자 head를 사용해 기존 게임 자모 예측을 바꾸지 않는다.

손바닥을 편 자세는 숫자 `5`로 분류할 수 있어 기존처럼 무조건 `ㅂ` 공격으로 수락되지 않는다. 하지만 실제 손등, 상하 반전, 새 사용자, 카메라·거리별 OOD 데이터는 아직 충분하지 않다. `ㅠ` recall 0% 문제 역시 기존 자모 head에 남아 있으며 readiness에서 계속 제외한다. 이 둘을 해결하지 않고 95% 공정성을 주장하지 않는다.

### 재현 명령

```powershell
cd game-ai-dev-server
.venv\Scripts\python.exe scripts\extract_number_features.py `
  --dataset ..\work\datasets\ksl-numbers-cc0\raw `
  --output ..\work\training\ksl_numbers_features.npz
.venv\Scripts\python.exe scripts\train_tree_model.py `
  --number-features ..\work\training\ksl_numbers_features.npz `
  --output-dir ..\models\jamo-number-41-tree-v1 --trees 500
.venv\Scripts\python.exe scripts\evaluate_hybrid_model.py `
  --number-features ..\work\training\ksl_numbers_features.npz `
  --output-dir ..\models\jamo-number-hybrid-v1
```

다음 정식 학습은 최소 5명보다 많은 신규 참여자를 signer 단위로 완전히 분리하고, 각 자모·숫자에 손바닥/손등, 위/아래 회전, 좌/우 손, 거리·조명·카메라 변형과 `NONE/OOD` class를 촬영해야 한다. 그 holdout에서 macro F1과 class 최저 recall까지 95%에 접근해야 게임 공정성 목표를 달성한 것으로 본다.

평가일: 2026-07-18  
운영 모델: `models/multi_hand_gesture_classifier.tflite` (`jamo-31-v1`)

## 결론

현재 모델은 31글자 경쟁 모델로 통과하지 못했다. 저장 시퀀스 2,790개(글자·촬영 세션별 균등 30개)의 argmax 정확도는 90.82%지만, `ㅠ`는 90/90개가 `ㅅ`으로 분류되고 `ㅅ`은 평균 confidence 0.601로 기존 0.75 gate를 통과하지 못한다. 따라서 모델 파일은 교체하지 않았고, 경쟁 모드에서는 readiness를 통과한 24글자만 사용하도록 차단했다.

재학습은 시도했지만 배포하지 않았다. 촬영 세션을 완전히 분리한 실험에서 다음 결과가 나왔다.

- 2개 세션 학습, 1개 세션 validation: 전체 85.50%, `ㅠ recall 6.0%`, `ㅅ precision 50.0%`
- 1개 세션 학습, 1개 calibration, 1개 독립 validation: 전체 약 77.60%; `ㅠ/ㅅ` 구분 실패
- 재학습 후보는 calibration 성능이 낮고 첫 기본 TFLite export도 실패했으므로 운영 모델에 반영하지 않았다. 기존 H5를 복원했으며 H5/TFLite 최대 출력 차이는 `1.40e-9`, argmax도 일치한다.

즉, 전역 threshold 조정이나 동일 데이터 재학습으로 해결할 문제가 아니다. `ㅅ/ㅠ`, `ㅕ/ㅖ`를 중심으로 새 사용자·새 세션·새 조명/카메라에서 재촬영한 뒤 다시 학습해야 한다.

## 계약·라벨·export 감사

- `dataset/seq_*.npy`: 31글자 × 3촬영 세션 = 93파일
- 모든 파일 shape: `[samples, 10, 56]`; 마지막 1열은 label
- 93파일 모두 `파일명 글자 → LABELS index → 마지막 label 열` 일치
- AI `LABELS`, 학습 노트북 `actions`, TFLite output은 모두 같은 31개 순서
- TFLite 입력/출력: `[1, 10, 55] → [1, 31]`
- H5와 TFLite의 동일 입력 출력 차이: `1.40e-9`

따라서 `ㅠ→ㅅ`은 class index나 export 순서 오류가 아니다. 파일의 숫자 라벨도 올바르다. 다만 세션 분리 재학습에서도 두 글자가 분리되지 않으므로, 라벨 문자열이 아니라 실제 촬영 자세의 품질·일관성·사용자 다양성이 부족한 데이터 내용 문제다. 원본 영상을 사람에게 재검수하고 `ㅅ/ㅠ`를 새로 촬영해야 한다.

`ㅅ` confidence가 약 0.60에 고정되는 이유도 같은 경계 붕괴다. 모델이 `ㅅ` 자세와 `ㅠ` 자세에서 확률 질량을 주로 두 출력에 나눠 갖고, 두 클래스 모두 `ㅅ`을 argmax로 선택한다. `ㅅ` threshold만 낮추면 `ㅠ`가 `ㅅ`으로 확정되므로 허용하지 않았다.

## 2,790개 균등 표본 결과

`확정률@0.75`는 기존 프론트 단일 threshold 기준이다. 경쟁 여부는 class별 threshold를 calibration한 뒤 precision 90%, 확정률 85%를 모두 만족한 경우다. 이 평가는 legacy 모델 학습에 사용된 세션을 포함하므로 임시 안전 gate이며 독립 인증 결과가 아니다.

| 글자 | Argmax precision | Recall | 평균 confidence | 확정률@0.75 | 경쟁 |
|---|---:|---:|---:|---:|:---:|
| ㄱ | 91.86% | 87.78% | 0.852 | 84.44% | 허용 |
| ㄴ | 100.00% | 96.67% | 0.953 | 94.44% | 허용 |
| ㄷ | 90.72% | 97.78% | 0.928 | 93.33% | 허용 |
| ㄹ | 95.24% | 88.89% | 0.873 | 82.22% | 허용 |
| ㅁ | 96.74% | 98.89% | 0.935 | 93.33% | 허용 |
| ㅂ | 100.00% | 100.00% | 1.000 | 100.00% | 허용 |
| ㅅ | 47.09% | 98.89% | 0.601 | 0.00% | 제외 |
| ㅇ | 100.00% | 100.00% | 1.000 | 100.00% | 허용 |
| ㅈ | 98.75% | 87.78% | 0.861 | 83.33% | 허용 |
| ㅊ | 94.68% | 98.89% | 0.989 | 98.89% | 허용 |
| ㅋ | 98.85% | 95.56% | 0.952 | 94.44% | 허용 |
| ㅌ | 83.18% | 98.89% | 0.902 | 87.78% | 허용(0.658) |
| ㅍ | 100.00% | 100.00% | 1.000 | 100.00% | 허용 |
| ㅎ | 98.89% | 98.89% | 0.987 | 98.89% | 허용 |
| ㅏ | 95.00% | 84.44% | 0.813 | 73.33% | 제외 |
| ㅑ | 90.22% | 92.22% | 0.814 | 76.67% | 허용 |
| ㅓ | 90.59% | 85.56% | 0.782 | 72.22% | 제외 |
| ㅕ | 76.84% | 81.11% | 0.686 | 51.11% | 제외 |
| ㅗ | 82.86% | 96.67% | 0.907 | 85.56% | 허용(0.612) |
| ㅛ | 93.98% | 86.67% | 0.861 | 82.22% | 허용 |
| ㅜ | 93.68% | 98.89% | 0.950 | 96.67% | 허용 |
| ㅠ | 0.00% | 0.00% | 0.362 | 0.00% | 제외 |
| ㅡ | 96.74% | 98.89% | 0.903 | 94.44% | 허용 |
| ㅣ | 98.89% | 98.89% | 0.992 | 98.89% | 허용 |
| ㅐ | 90.00% | 100.00% | 0.988 | 98.89% | 허용 |
| ㅒ | 100.00% | 100.00% | 1.000 | 100.00% | 허용 |
| ㅔ | 96.20% | 84.44% | 0.798 | 77.78% | 제외 |
| ㅖ | 83.12% | 71.11% | 0.589 | 37.78% | 제외 |
| ㅢ | 95.70% | 98.89% | 0.973 | 98.89% | 허용 |
| ㅚ | 98.77% | 88.89% | 0.862 | 85.56% | 허용 |
| ㅟ | 100.00% | 100.00% | 0.993 | 100.00% | 허용 |

전체 session validation 출력과 31×31 confusion matrix는 [model-evaluation.json](./model-evaluation.json)에 있다. 평가 스크립트는 class별 precision, recall, confusion matrix, 확정률, 평균 확정 시간을 출력한다. 연속으로 겹치는 저장 window에서 계산된 평균 33ms는 오프라인 최솟값일 뿐 실제 사용자 latency로 해석하면 안 된다.

## 런타임 변경

- 확정 권한은 `FRONTEND_TEMPORAL_DECODER` 하나다. Python은 `PREDICTION`만 내보내며 `SIGN_CONFIRMED`와 `HAND_RELEASED`를 만들지 않는다.
- class별 threshold는 `game-contracts/recognition/readiness.json`이 원천이다. 프론트 decoder는 예측 글자별 threshold를 적용한다.
- `CAPABILITIES`에서 `competitiveSymbols`, `confidenceThresholds`, `confirmationAuthority`를 조회할 수 있다.
- 프론트 방 생성과 백엔드 서버 Bot은 readiness 경쟁 목록만 사용한다. 요청을 조작해 제외 글자를 보내도 백엔드가 거절한다.
- 프론트 decoder는 동일 자세 유지 중 중복 확정을 막고, no-hand/중립 자세 release 후 같은 글자를 다시 확정한다. 관련 회귀 테스트가 통과한다.

## 실행 방법

```powershell
cd game-ai-dev-server
.venv/Scripts/python.exe scripts/evaluate_model.py `
  --calibration-session 1669723415 `
  --validation-session 1669724266 `
  --output ../frontend/src/game/docs/recognition/model-evaluation.json
```

독립 재학습은 `scripts/train_session_split.py`로 재현할 수 있다. 새 데이터를 추가하기 전에는 운영 모델 교체용으로 사용하지 않는다.

## 최소 통과 조건

| 조건 | 결과 |
|---|---|
| 31글자 독립 validation 확정률 85% 이상 | 실패 |
| 경쟁 모드 글자 precision 90% 이상 | 임시 gate 통과; 독립 인증은 새 데이터 필요 |
| `ㅠ/ㅅ` 상호 구분 | 실패, 둘 다 경쟁 제외 |
| 같은 자세 중복 입력 방지 | 통과(프론트 decoder test) |
| 중립 후 같은 글자 재입력 | 통과(프론트 decoder test) |

다음 데이터 수집은 최소 5명의 새 사용자, 사용자당 2개 세션, 서로 다른 카메라/거리/조명으로 구성하고, 학습 사용자와 validation 사용자가 절대 겹치지 않게 해야 한다. 특히 `ㅅ/ㅠ`, `ㅕ/ㅖ`, `ㅏ/ㅗ`, `ㅛ/ㅑ`, `ㄹ/ㅌ`, `ㅈ/ㅅ/ㅊ`은 원본 영상 자세 검수를 포함해 다시 촬영한다.

## 2026-07-21 런타임 재점검

- 로컬 Python AI 서버의 WebSocket 연결을 20회 새로 열어 `GET_CAPABILITIES` 응답까지 확인했으며 20회 모두 성공했다.
- AI 서버 단위 테스트 16개와 hybrid 모델 load를 확인했다. 따라서 관찰된 반복 끊김을 서버 또는 모델 load 장애로 판단할 근거는 없었다.
- 반면 저장된 평가 결과는 모델 품질 문제를 명확히 보여 준다. `ㅠ` recall 0%, `ㅅ` precision 약 47%이며, readiness에서 제외된 `ㅅ`, `ㅠ`, `ㅏ`, `ㅓ`, `ㅕ`, `ㅔ`, `ㅖ`는 AI 경쟁 출제 대상에서 차단했다.
- 이 차단은 모델 개선이 아니라 실패를 사용자에게 노출하지 않는 안전장치다. threshold를 낮추면 `ㅠ → ㅅ` 오확정이 늘어나므로 새 사용자/session 데이터 없는 임계값 완화는 하지 않는다.
