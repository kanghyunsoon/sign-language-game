# 지문자 AI 학습·평가 회차 기록

## 2026-07-22 — AIHub 원본 복구·무결성 감사 (학습 전 단계)

### 목적과 통제 원칙

- 기존 기록의 원본 위치 `D:\AITraining\korean-fingerspelling\aihub-103`은 현재 PC에 존재하지 않았다. 새로 내려받은 원본을 `C:\AITraining\korean-fingerspelling\aihub-103`에 보관한다. 원본·추출 라벨·준비 feature는 라이선스와 용량 때문에 Git에 넣지 않는다.
- 이 단계는 **학습 회차가 아니다**. 모델 정확도·연속 인식률을 새로 주장하지 않으며, 다음 학습의 입력 범위와 재현 가능성을 검증한 데이터 복구 단위로만 기록한다.
- 2.63TB 전체나 원천 영상은 받지 않았다. AIHub 103 CROWD 라벨링 데이터 중 keypoint 3개와 morpheme 2개만 수집했다.

### 수집 파일과 SHA-256

| 분할 | 파일 | 크기 | SHA-256 |
| --- | --- | ---: | --- |
| Training | `[라벨]01_crowd_keypoint.zip` | 6,614,426,866 B | `23bf7e0f30e0f74594fa4754579981c90ffbe6c1f8f62f0dc926868d6504742b` |
| Training | `[라벨]02_crowd_keypoint.zip` | 5,014,650,818 B | `5bed2ac43b691c330bf9f16b6a0f1a5f2eca1752abf9195b59f1d6eb6133e817` |
| Training | `[라벨]01_crowd_morpheme.zip` | 8,094,518 B | `c8878a42f6bc4ae94dc0293045eb91a9c297257ece6dbc65d040d065873f55e2` |
| Validation | `[라벨]01_crowd_keypoint.zip` | 1,411,121,080 B | `91803b0969a00b45f418ec407c6594d14aef3daec816afd7998ecaff66fe36b1` |
| Validation | `[라벨]01_crowd_morpheme.zip` | 952,783 B | `1d0874d0f63acd7c42a9c1fe762c4f951b92ff526ca02e6596e50324ef84fbe3` |

`C:\AITraining\korean-fingerspelling\aihub-103\audit`에 원본 감사 JSON을 남겼다. 표의 SHA-256은 2026-07-22에 64자리 전체 값을 재검증했다.

### 실측 범위와 데이터 불일치

- Validation morpheme: 2,000 clip, signer 18·19 각 1,000 clip. Validation keypoint도 2,000 clip·671,745 frame으로 정확히 일치한다.
- Training keypoint: 16,998 clip, signer 01~17. archive 01은 10,000 clip·2,872,676 frame, archive 02는 6,998 clip·2,182,236 frame이다.
- Training morpheme 압축본은 최종 재감사에서 signer 01~17의 17,000 clip 전체로 확인됐다. keypoint 16,998 clip 중 frame JSON이 없는 2개를 제외하고 clip ID 교집합을 잠갔다.
- 따라서 이번 기준선의 실제 train 범위는 16,873 clip이다. 지원하지 않는 토큰을 포함한 119개와 frame이 없는 8개를 명시적으로 제외했으며, 과거 회차와의 성능 비교는 동일한 split·선택 프레임·평가 계약일 때만 한다.

### 키포인트 품질 프록시

- 감사 방법: 압축을 풀지 않고 각 archive의 30번째 frame마다 표본화했다. 한 손의 21점 중 confidence 0.20 이상 점이 15개 이상이면 usable로 셌다. 이는 손 검출 품질 프록시이며 문자 정답률·손바닥/손등 판정은 아니다.
- Train archive 01: left usable 94.13%, right 88.25%, both 83.90%, neither 1.52% (95,756 표본 frame).
- Train archive 02: left 93.79%, right 88.93%, both 84.85%, neither 2.13% (72,742 표본 frame).
- Validation: left 95.15%, right 90.81%, both 87.07%, neither 1.11% (22,392 표본 frame).
- AIHub 라벨에는 손바닥/손등, 위/아래, 회전, 거리, 조명 조건이 없어 조건별 정확도는 여전히 측정 불가다. 이 회차에서는 좌우 hand-quality와 mirror/정규화 계약만 감사했으며, 방향 성능 수치를 만들지 않았다.

### 다음 결정

1. label-keypoint clip ID 교집합을 생성하고 signer 01~17 train, signer 18 validation, signer 19 locked development-test로 분리한다.
2. 이전 CROWD19를 다시 선택·튜닝에 사용하지 않는다. 새 subset에서 validation 선택과 locked test를 분리한다.
3. subset manifest·feature SHA-256·제외 clip 수가 확정된 뒤에만 GPU 2에서 새 회차 번호로 CTC 학습을 시작한다.
4. 다음 회차는 전체 CER, 완전 일치율, micro/macro recall·F1, 문자별 gate, 유사 문자 confusion, frame 품질·연속 지문자 오류를 함께 기록한다.

> **AI 학습 성과의 단일 canonical 문서다.** 학습 회차별 데이터 기준, 방법, 수치, 변화량, 회귀와 판단은 이 파일에만 기록한다. 다른 handoff·README에는 수치를 복사하지 않고 이 파일 링크만 둔다. 원시 운영 평가는 같은 폴더의 `model-evaluation.json`, GPU 실험 원시는 서버의 회차별 `evaluation.json`을 기준으로 한다.

## 학습 회차 한눈에 보기

| 회차 | 데이터·split 기준 | 사용 방법 | 핵심 성과 | 직전 대비·문제 | 판단 |
| --- | --- | --- | --- | --- | --- |
| T-00 기존 운영 | 기존 자모 2,790표본, 학습 세션 포함 가능 | 55값 `[10,55]` LSTM/TFLite | accuracy 90.82% | `ㅠ` recall 0%, 독립 평가 아님 | 제한 배포 유지 |
| T-01 세션 분리 | 31자모×3세션, 1 train/1 calibration/1 holdout, 7,001표본 | 기존 재학습 파이프라인 복구, 운영 artifact 격리 | accuracy 76.86%, `ㅠ` recall 11.90% | 기존 기록 85.50%보다 낮음, 12글자만 gate 통과 | 실패·미배포 |
| T-02 41-class LSTM | 자모 세션 분리 + 제공 숫자 test | 단일 LSTM fine-tune | 자모 80.88%, 숫자 69.08%, 전체 80.63% | 정적 숫자와 동적 자모 domain 충돌 | 실패·미배포 |
| T-03 41-class Extra Trees | T-02와 같은 split, 220 summary feature | class balance noise, Extra Trees 500 | 자모 87.20%, 숫자 95.39%, 전체 87.38% | 숫자는 개선, 자모 운영 기준 미달 | 숫자/domain head 채택 |
| E-01 hybrid 조합 | 기존 자모 회귀 세션 + 제공 숫자 test | 기존 TFLite 자모 head + tree domain/숫자 head | 자모 91.82%*, 숫자 95.39%, 전체 91.90%* | `*` 사용자 독립 아님 | 기본 서버 프로필 |
| T-04 Roboflow 2-D | 5,384장 중 landmark 4,432개, 제공 split 3,856/386/190, signer 비독립 | 55값 2-D bone/angle, MLP, feature jitter | test accuracy 66.84% | 정적 이미지 기준선, macro-F1 당시 미기록 | 실패·미배포 |
| T-05 Roboflow 3-D | T-04와 동일 표본·split | 78값 3-D bone/angle/palm normal, left-hand mirror | test accuracy 67.89%, macro-F1 64.46% | T-04 대비 +1.05%p; 기존 68.74% 기록은 숫자 전도 오류 | 실패·미배포 |
| T-06 pair-aware | T-05와 동일 표본·split | class balance, pair margin, residual MLP, jitter, label smoothing, macro-F1 선택 | **accuracy 72.63%, macro-F1 69.42%** | T-05 대비 +4.74%p; `ㅅ/ㅠ` -9.09%p, UX coverage -7.37%p | 실패·미배포 |
| T-07 palm-local | 31자모 대상 4,702장 중 검출 4,432장, split 3,856/386/190 | 손바닥 기준 좌표계, 210 landmark-pair 거리, 351값 residual MLP | accuracy 73.68%, macro-F1 70.46% | T-06 대비 +1.05%p; 검증 선택 threshold가 test로 일반화되지 않음 | 실패·미배포 |
| T-08 classical | T-07과 동일 표본·split | ExtraTrees/RBF-SVM 6종을 validation에서 비교, RBF-SVM C=8 선택 | accuracy 82.11%, macro-F1 80.29% | T-07 대비 **+8.42%p** | 후보 유지·미배포 |
| T-09 combined | T-07과 동일 표본·split | v3+v4 429값, RBF-SVM C/gamma validation 탐색 | accuracy 83.16%, macro-F1 80.89% | T-08 대비 +1.05%p | 후보 유지·미배포 |
| T-10 image transfer | MediaPipe 성공 31자모 test 190장(원본 test 197장 중 실패 7장 제외) | ImageNet MobileNetV3-Small, crop/회전/색상/blur, class balance | 조건부 accuracy 90.00%, macro-F1 89.34%; **원본 기준 end-to-end 86.80%** | T-09 대비 조건부 +6.84%p; 검출 실패 포함 시 171/197 | 운영 승격 보류 |
| T-11 EfficientNet-B0 | T-10과 같은 MediaPipe 성공 test 190장 | EfficientNet-B0 전이학습, 좌우 반전 제외, class balance | 조건부 accuracy **95.79%**, macro-F1 **95.34%**; 원본 기준 end-to-end **92.39%** | T-10 대비 조건부 +5.79%p; 182/190, 검출 실패 포함 182/197 | 93% 전체 목표는 조건부만 통과, 운영 승격 보류 |
| T-12 all-raw jamo | MediaPipe gate 없는 31자모 원본 4,702장, split 4,092/413/197 | EfficientNet-B0가 원본 이미지를 직접 분류 | **accuracy 93.40%, macro-F1 93.07%** | T-11의 검출 누락 제거; 184/197 | 전체 평균 93% 통과, 문자별 93%는 미검증 |
| T-13 41-class | 31자모 4,702장 + 숫자 1,107장 = 5,809장, split 4,756/526/527 | EfficientNet-B0, 41-class, HEIC decoder 추가, GPU 2 | test accuracy **93.17%**, macro-F1 **93.63%** | 자모 94.92%, 숫자 92.12%; 17개 class가 recall/F1 93% 미달 | 전체 평균만 통과·미배포 |
| T-14 class-floor focus | T-13과 같은 5,809장·split, T-13 test에서 고른 17개 class 집중 | sqrt 역빈도 sampler+loss와 focus 1.75배 중복 적용, class-floor checkpoint | test accuracy **92.60%**, macro-F1 **94.07%** | accuracy **-0.57%p**, macro-F1 +0.45%p; 18개 class 미달 | 개발 비교용·미배포 |
| T-15 hard-negative single-balance | T-13과 같은 5,809장·split, 기존 development-test에서 고른 `ㅔ:ㅖ`, `ㄹ:ㅌ` | sampler 단일 균형화, pair logit-margin 0.25, min-q10 checkpoint | test accuracy **91.46%**, macro-F1 **94.31%** | T-14 대비 accuracy **-1.39%p**, macro-F1 +0.23%p; 15개 class 미달 | 실패·개발 비교용·미배포 |
| T-16 validation focus loss | T-13과 같은 5,809장, T-15 validation 미달 15개 class focus | loss 단일 균형화, focus 1.25배, pair loss 제거 | test accuracy **90.70%**, macro-F1 **93.79%** | T-15 대비 -0.76%p, 숫자 87.27%, 22개 class 미달 | 실패·개발 비교용·미배포 |
| T-17 validation ensemble | T-13~T-16 checkpoint, 공통 development validation 526장 | class별 validation F1/recall/precision 최고 expert 결합 | test accuracy **93.55%**, macro-F1 **95.04%** | 평균 목표 회복, 자모 95.43%·숫자 92.42%, 15개 class 미달 | 후보·최종 인증 불가·미배포 |
| T-18 class-bias calibration | T-17 validation/test probability | validation-only class별 곱셈 bias 좌표 탐색 | test accuracy **93.55%**, macro-F1 **95.04%** | validation은 개선됐지만 test argmax·15개 미달 class 변화 없음 | 실패·개발 비교용·미배포 |
| T-19 mild TTA | T-13~T-16, center/±6도/±6px 5-view | validation에서 single/mean/domain/class expert 선택, 좌우 반전 없음 | test accuracy **91.27%**, macro-F1 **93.47%** | T-15 single이 선택, 17개 class 미달 | 실패·미배포 |
| T-20 class mixture | T-17 모델별 center-crop probability | class별 one-hot/equal/pair 0.5/0.75 convex mixture 좌표 탐색 | test accuracy **93.55%**, macro-F1 **95.04%** | T-17과 test 예측 동일, 15개 class 미달 | 실패·미배포 |
| T-21 low-LR continuation | T-13 checkpoint, 동일 seed 67 split | focus/pair 없이 lr 3e-5, smoothing 0.02로 8 epoch continuation | test accuracy **92.98%**, macro-F1 **94.19%** | T-13 대비 accuracy -0.19%p, 17개 class 미달 | 실패·expert 후보·미배포 |
| T-22 five-model ensemble | T-13~T-16 + T-21 checkpoint | 공통 validation에서 5-model class/domain expert 재선택 | test accuracy **93.55%**, macro-F1 **95.04%** | T-21 expert 추가가 test 예측을 바꾸지 못함, 15개 미달 | 실패·미배포 |

## 모든 회차의 필수 기록 형식

1. 회차 ID, 실행 시각, seed, 요청/완료 epoch, batch size, GPU 물리/논리 번호
2. 데이터 출처·라이선스·원본/수용 표본 수·artifact SHA-256, train/valid/test 수와 split 기준, signer/session 누수 여부
3. 입력 shape와 특징 버전, 모델 구조, loss, sampling, augmentation, threshold/calibration 방식
4. 전체 accuracy와 macro-F1, class별 precision/recall/F1, confusion matrix
5. 유사 글자 그룹 정확도와 그룹 내부 혼동률
6. 수동 annotation 기반 palm/back·up/down·left/right·signer·session·camera 조건별 지표; proxy는 proxy로 표시
7. validation에서만 고른 운용 threshold와 test accepted accuracy, coverage, false-confirmation rate
8. 실제 연속 영상의 CER, 확정률, 분당 오확정, p50/p95 확정 지연; 미측정은 `not-measured`로 기록
9. 직전 회차 대비 개선·악화 수치, 실패 원인, artifact 경로, 운영 승격/보류 판단

## T-06 — 유사 글자 margin과 사용성 평가

- 실행: 2026-07-21, 물리 GPU 2(NVIDIA L40S), `CUDA_VISIBLE_DEVICES=2`, seed 29, 최대 120 epoch 중 early stopping 52 epoch.
- 데이터: Roboflow Sign Language v1, CC BY 4.0. landmark 수용 4,432개, train/valid/test 3,856/386/190. 제공 split을 유지했지만 signer-independent가 아니다.
- 입력: T-05와 같은 `[10,78]` MediaPipe v3 특징. 정적 이미지를 10회 반복했으므로 연속 입력이 아니다.
- 기술: sqrt-inverse class sampling/loss, 유사 글자 logit margin, residual MLP, landmark jitter, label smoothing, validation macro-F1+accuracy 체크포인트 선택.
- 결과: test accuracy 72.63%(T-05 대비 +4.74%p), macro-F1 69.42%(+4.96%p).

### 유사 글자 그룹

| 그룹 | Support | T-05 | T-06 | 변화 | 그룹 내부 혼동률 T-05 → T-06 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `ㅅ/ㅠ` | 11 | 72.73% | 63.64% | **-9.09%p** | 9.09% → 18.18% |
| `ㅕ/ㅖ` | 14 | 64.29% | 71.43% | +7.14%p | 14.29% → 14.29% |
| `ㅔ/ㅖ` | 21 | 61.90% | 61.90% | 0.00%p | 0.00% → 0.00% |
| `ㅏ/ㅗ` | 19 | 73.68% | 84.21% | +10.53%p | 0.00% → 0.00% |
| `ㅛ/ㅑ` | 10 | 50.00% | 50.00% | 0.00%p | 0.00% → 0.00% |
| `ㄹ/ㅌ` | 13 | 53.85% | 69.23% | +15.38%p | 30.77% → 15.38% |
| `ㅈ/ㅅ/ㅊ` | 11 | 63.64% | 72.73% | +9.09%p | 0.00% → 0.00% |

### 조건별 진단 proxy

원본에는 수동 palm/back·up/down annotation이 없다. 아래는 MediaPipe detected-handedness, wrist-to-middle-MCP y, palm-normal z로 만든 **진단 proxy**이며 실제 손바닥/손등·상하 정확도로 주장하지 않는다.

| 조건 | Support | T-05 | T-06 | 변화 |
| --- | ---: | ---: | ---: | ---: |
| Detected left | 34 | 38.24% | 50.00% | +11.76%p |
| Detected right | 156 | 74.36% | 77.56% | +3.20%p |
| Fingers-down proxy | 44 | 61.36% | 70.45% | +9.09%p |
| Fingers-up proxy | 137 | 70.07% | 72.99% | +2.92%p |
| Sideways proxy | 9 | 66.67% | 77.78% | +11.11%p |
| Palm-normal edge-on proxy | 14 | 35.71% | 42.86% | +7.15%p |
| Palm-normal z-negative proxy | 71 | 66.20% | 67.61% | +1.41%p |
| Palm-normal z-positive proxy | 105 | 73.33% | 80.00% | +6.67%p |

### 사용자 운용점과 연속 인식

| 지표 | T-05 | T-06 | 변화 |
| --- | ---: | ---: | ---: |
| Validation 선택 threshold | 0.675 | 0.900 | calibration 변화 |
| Test accepted accuracy | 91.94% | 90.00% | -1.94%p |
| Test coverage | 65.26% | 57.89% | -7.37%p |
| False confirmations / all samples | 4.21% | 5.79% | +1.58%p |

전체 정확도는 올랐지만 `ㅅ/ㅠ`와 confidence 사용성이 악화되어 운영 승격하지 않았다. 연속 CER, 확정률, 분당 오확정, p50/p95 지연은 정적 반복 데이터로 측정하지 않았으며 `not-measured`다. 서버 artifact는 T-05 `~/sign_language_training/artifacts/roboflow-v3-gpu-experiment/`, T-06 `~/sign_language_training/artifacts/roboflow-v4-pair-aware/`에 보존한다.

## T-07~T-14 — 93% 연구 목표와 41-class 확장 과정

### 데이터셋 수와 공통 평가 기준

| 항목 | 전체 | Train | Validation | Test |
| --- | ---: | ---: | ---: | ---: |
| Roboflow에서 발견한 이미지 | 5,384 | 4,698 | 462 | 224 |
| 제외한 제어/비지문자 5종 | 681 | - | - | - |
| 31자모 평가 대상 | 4,702 | 4,092 | 413 | 197 |
| MediaPipe 검출 실패 | 270 | 236 | 27 | 7 |
| 최종 수용·학습/평가 | 4,432 | 3,856 | 386 | 190 |

- 제외 class는 `clear` 135장, `emotion` 135장, `next` 119장, `none` 185장, `space` 107장이다. 게임의 31자모 출력 계약과 다르므로 분류 정확도에 섞지 않았다.
- 31자모 대상 대비 landmark 채택률은 94.26%(4,432/4,702)다. 원본 test 197장 중 MediaPipe 검출 실패가 7장이라서, T-07~T-11의 190장 평가는 **검출 성공 조건부 성능**이다. 실패를 오답으로 보는 end-to-end 성능도 별도로 적는다.
- Roboflow 제공 train/valid/test 폴더를 유지했다. signer ID가 없고 원본 export에 증강본이 포함돼 있으므로 signer-independent 또는 실제 사용자 독립 성능으로 주장하지 않는다.
- 모든 학습은 2026-07-21 물리 GPU 2(NVIDIA L40S)만 사용했다. 서버에서는 `CUDA_VISIBLE_DEVICES=2`로 고정되어 논리 장치 `cuda:0`으로 보인다.

### 회차별 방법과 전체 성과

| 회차 | Seed / 학습 | 핵심 변경 | Accuracy | Macro-F1 | 직전 대비 | 서버 artifact |
| --- | --- | --- | ---: | ---: | ---: | --- |
| T-07 | seed 37, 최대 140 중 121 epoch | 351값 palm-local 좌표·bone·angle·210 pair distance·camera palm normal, pair-aware residual MLP | 73.68% | 70.46% | +1.05%p | `artifacts/roboflow-t07-palm-local/` |
| T-08 | seed 43 | ExtraTrees 3종과 RBF-SVM 3종을 validation macro-F1+accuracy로만 선택; C=8 RBF-SVM | 82.11% | 80.29% | **+8.42%p** | `artifacts/roboflow-t08-classical-v4/` |
| T-09 | seed 47 | v3 카메라 좌표 특징과 v4 palm-local 특징을 429값으로 결합, C/gamma 확장 탐색; C=16, gamma 2× 선택 | 83.16% | 80.89% | +1.05%p | `artifacts/roboflow-t09-combined-svc/` |
| T-10 | seed 53, 24 epoch | ImageNet MobileNetV3-Small 전체 fine-tune, 좌우 반전 없이 crop·±14° 회전·이동·색상·blur, sqrt class balance | **90.00%** | **89.34%** | **+6.84%p** | `artifacts/roboflow-t10-mobilenetv3/` |
| T-11 | seed 59, 20 epoch | ImageNet EfficientNet-B0 전체 fine-tune; T-10과 같은 190장 조건부 cohort | **95.79%** | **95.34%** | **+5.79%p** | `artifacts/roboflow-t11-efficientnet/` |
| T-12 | seed 61, 20 epoch | MediaPipe gate를 제거하고 4,702장 원본 이미지를 EfficientNet-B0로 직접 학습·평가 | **93.40%** | **93.07%** | 조건부 비교 대신 end-to-end 기준 +6.60%p(T-10 대비) | `artifacts/roboflow-t12-efficientnet-all-raw/` |
| T-13 | seed 67, 22/30 epoch; best val epoch 16 | 31자모+숫자 10종을 합친 41-class EfficientNet-B0; HEIC decoder 보완 | **93.17%** | **93.63%** | 전체 평균 통과, 17개 class gate 미달 | `artifacts/roboflow-t13-efficientnet-41class/` |
| T-14 | seed 71, 30/30 epoch; best val epoch 25 | T-13 미달 17개 class 1.75배 focus, class-floor checkpoint | **92.60%** | **94.07%** | accuracy -0.57%p, macro-F1 +0.45%p; 18개 class 미달 | `artifacts/roboflow-t14-class-floor-focused/` |
| T-15 | seed 73, 26/30 epoch; best val epoch는 artifact history 기준 | sampler 단일 균형화, `ㅔ:ㅖ|ㄹ:ㅌ` hard-negative logit-margin 0.25, min-q10 선택 | **91.46%** | **94.31%** | T-14 대비 accuracy -1.39%p, macro-F1 +0.23%p; 15개 class 미달 | `artifacts/roboflow-t15-hard-negative-single-balance/` |
| T-16 | seed 79, 14/18 epoch | T-15 validation 미달 15개 class focus 1.25배, loss-only balance, pair loss 없음 | **90.70%** | **93.79%** | T-15 대비 -0.76%p; 22개 class 미달 | `artifacts/roboflow-t16-validation-focus-loss-balance/` |
| T-17 | validation seed 83, 학습 없음 | T-13~T-16의 class별 validation 최고 expert 확률 결합 | **93.55%** | **95.04%** | T-16 대비 +2.85%p; 평균 통과, 15개 class 미달 | `artifacts/roboflow-t17-validation-ensemble/` |
| T-18 | 학습 없음 | T-17 확률에 validation-only class bias 좌표 탐색 | **93.55%** | **95.04%** | validation 97.72%→98.48%, test class 예측 변화 없음 | `artifacts/roboflow-t18-validation-calibration/` |
| T-19 | 학습 없음, 5-view | center, ±6도 회전, ±6px x 이동 TTA; 좌우 반전 제외 | **91.27%** | **93.47%** | T-17 대비 -2.28%p, 17개 class 미달 | `artifacts/roboflow-t19-mild-tta-ensemble/` |
| T-20 | 학습 없음 | class별 네 모델 convex mixture를 validation min-q10으로 좌표 탐색 | **93.55%** | **95.04%** | T-17과 동일, 15개 class 미달 | `artifacts/roboflow-t20-class-mixture/` |
| T-21 | seed 67, 8/8 epoch | T-13 warm-start, lr 3e-5, smoothing 0.02, sampler balance | **92.98%** | **94.19%** | T-13 대비 -0.19%p, macro-F1 개선 | `artifacts/roboflow-t21-t13-low-lr-continuation/` |
| T-22 | 학습 없음 | T-17 expert pool에 T-21 추가 | **93.55%** | **95.04%** | T-17과 동일, 15개 class 미달 | `artifacts/roboflow-t22-five-model-ensemble/` |

T-07은 회전·크기 불변 구조를 추가했지만 +1.05%p에 그쳐 landmark MLP의 표현 한계가 드러났다. T-08은 같은 특징에 비선형 margin이 강한 RBF-SVM을 적용해 가장 큰 단일 개선(+8.42%p)을 만들었다. T-09는 camera-frame과 palm-local 정보를 결합했지만 추가 이득은 +1.05%p였다. T-10은 landmark만으로 버려졌던 손 윤곽·가림·배경의 시각 정보를 전이학습으로 사용해 90%에 도달했다.

### 유사 글자 그룹 정확도

괄호 안은 그룹 내부의 다른 글자로 잘못 확정한 비율이다. Support는 회차 모두 동일하다.

| 그룹 (Support) | T-06 | T-07 | T-08 | T-09 | T-10 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `ㅅ/ㅠ` (11) | 63.64% (18.18%) | 72.73% (9.09%) | 81.82% (0%) | 81.82% (0%) | **90.91% (0%)** |
| `ㅕ/ㅖ` (14) | 71.43% (14.29%) | 57.14% (7.14%) | 71.43% (0%) | 71.43% (0%) | **100.00% (0%)** |
| `ㅔ/ㅖ` (21) | 61.90% (0%) | 66.67% (0%) | 76.19% (0%) | 80.95% (0%) | **85.71% (9.52%)** |
| `ㅏ/ㅗ` (19) | 84.21% (0%) | 78.95% (0%) | 84.21% (0%) | 89.47% (0%) | **94.74% (0%)** |
| `ㅛ/ㅑ` (10) | 50.00% (0%) | 50.00% (10.00%) | 60.00% (0%) | 50.00% (0%) | **80.00% (0%)** |
| `ㄹ/ㅌ` (13) | 69.23% (15.38%) | 69.23% (15.38%) | 76.92% (0%) | 84.62% (15.38%) | **84.62% (15.38%)** |
| `ㅈ/ㅅ/ㅊ` (11) | 72.73% (0%) | 72.73% (0%) | 81.82% (9.09%) | **90.91% (0%)** | **90.91% (0%)** |

T-10에서 대부분의 유사 그룹이 개선됐지만 `ㅔ/ㅖ` 내부 혼동 9.52%와 `ㄹ/ㅌ` 내부 혼동 15.38%는 남았다. 따라서 전체 90%만으로 모든 글자의 사용성이 해결됐다고 보지 않는다.

### 손 방향·손바닥/손등 진단 proxy

원본에 수동 방향 annotation이 없으므로 아래 수치는 MediaPipe detected-handedness와 landmark 방향으로 만든 proxy다. 실제 palm/back·up/down 정답률로 표현하지 않는다.

| 조건 (Support) | T-07 | T-08 | T-09 | T-10 | T-09→T-10 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Detected left (34) | 55.88% | 58.82% | 55.88% | **97.06%** | +41.18%p |
| Detected right (156) | 77.56% | 87.18% | 89.10% | 88.46% | -0.64%p |
| Fingers-down (44) | 65.91% | 79.55% | 75.00% | **93.18%** | +18.18%p |
| Fingers-up (137) | 75.18% | 84.67% | 86.13% | **89.05%** | +2.92%p |
| Sideways (9) | 88.89% | 77.78% | 77.78% | **88.89%** | +11.11%p |
| Palm edge-on (14) | 64.29% | 71.43% | 71.43% | **92.86%** | +21.43%p |
| Palm z-negative (71) | 70.42% | 76.06% | 76.06% | **88.73%** | +12.67%p |
| Palm z-positive (105) | 77.14% | 87.62% | 89.52% | **90.48%** | +0.96%p |

### 사용자 운용점과 연속 지문자

Threshold는 validation에서 accepted accuracy 90% 이상을 목표로 고른 뒤 test에 한 번 적용했다.

| 회차 | Threshold | Test accepted accuracy | Coverage | False confirmation / all test |
| --- | ---: | ---: | ---: | ---: |
| T-07 | 0.800 | 84.21% | 70.00% | 11.58% |
| T-08 | 0.500 | 93.92% | 77.89% | 4.74% |
| T-09 | 0.500 | 94.16% | 72.11% | 4.74% |
| T-10 | 0.500 | **95.34%** | **92.63%** | 6.32% |

T-10은 T-09보다 accepted accuracy +1.18%p, coverage +20.52%p로 사용성이 개선됐다. False-confirmation/all-test는 coverage가 크게 늘며 +1.58%p 증가했으므로 실제 게임에서는 temporal confirmation과 release gate를 제거하지 않는다.

연속 지문자 CER, 연속 확정률, 분당 오확정, p50/p95 확정 지연은 모든 T-07~T-14에서 `not-measured`다. 데이터가 정적 이미지이고 10프레임 반복 특징은 실제 연속 손 전환을 재현하지 못하기 때문이다. 전체 평균 93% 통과만으로 운영 모델로 자동 승격하지 않는다.

### T-11~T-17 추가 학습 요약과 93% 판정

| 회차 | 총 데이터 / split | 사용 기술 | 결과와 개선 | 93% 판정 |
| --- | --- | --- | --- | --- |
| T-11 | 31자모 원본 4,702장 중 MediaPipe 성공 4,432장; 3,856/386/190 | MobileNetV3-Small에서 EfficientNet-B0로 backbone 강화 | 조건부 182/190 = 95.79%, macro-F1 95.34%; 원본 197장 기준 92.39% | 조건부 평균만 통과, end-to-end 실패 |
| T-12 | 31자모 원본 4,702장; 4,092/413/197 | MediaPipe 검출 gate 제거, 원본 이미지 직접 학습 | 184/197 = 93.40%, macro-F1 93.07% | 전체 평균 통과, **각 문자 93%는 아직 증명되지 않음** |
| T-13 | 31자모 4,702장 + 숫자 1,107장 = 5,809장; 4,756/526/527 | 41-class EfficientNet-B0, sqrt inverse class balance, crop·회전·이동·색상·blur | test accuracy 93.17%, macro-F1 93.63%; 자모 94.92%, 숫자 92.12%; 17개 class 미달 | 전체 평균만 통과, class gate 실패 |
| T-14 | T-13과 같은 5,809장·split | T-13 개발용 test에서 찾은 17개 class에 1.75배 focus, 하위 10% recall/F1 포함 checkpoint 선택 | best validation(epoch 25) accuracy 96.01%, macro-F1 95.44%; test 92.60% / 94.07% | 개발 비교용 test 재사용으로 최종 인증 불가, 18개 class gate 실패 |
| T-15 | T-13과 같은 5,809장·split | sampler에만 sqrt 역빈도 적용, `ㅔ:ㅖ|ㄹ:ㅌ` pair margin, 최저·하위 10% class 지표 포함 checkpoint 선택 | test 91.46% / 94.31%; 자모 96.45%, 숫자 88.48%; 15개 class 미달 | 전체 accuracy·숫자 domain·class gate 실패, 개발 비교용 |
| T-16 | T-13과 같은 5,809장·split | T-15 validation 미달 15개 class에 1.25배 focus, loss-only balancing, pair loss 제거 | test 90.70% / 93.79%; 자모 96.45%, 숫자 87.27%; 22개 class 미달 | validation focus가 test로 일반화되지 않아 실패 |
| T-17 | T-13~T-16 checkpoint, 공통 validation 526/test 527 | class별 validation F1→recall→precision 순으로 expert 선택 후 확률 결합 | test 93.55% / 95.04%; 자모 95.43%, 숫자 92.42%; 15개 class 미달 | 평균은 통과했지만 모든 문자 93% gate 실패 |

**문자별 93% gate 정의:** 전체 accuracy나 macro-F1이 93%를 넘는 것과 41개 문자 각각이 93%를 넘는 것은 다르다. 각 문자의 `recall = 해당 문자를 맞힌 수 / 실제 해당 문자 수`와 F1을 모두 산출하고, `min(class recall) ≥ 93%` 및 `min(class F1) ≥ 93%`를 동시에 만족할 때만 “모든 문자 93% 이상”으로 기록한다. T-13과 T-14 모두 이 gate를 통과하지 못했다. 자모 test support는 class당 2~13장(평균 6.35장)에 불과해 point estimate 자체도 불안정하다. 예를 들어 support 2에서는 한 장만 틀려도 recall이 50%가 된다. 따라서 최종 인증은 새 사용자·새 원본 영상으로 만든 잠금 test에서 class당 충분한 표본과 신뢰구간을 함께 제시해야 한다.

**반복 학습 규칙:** 회차별 validation에서 93% 미달 문자를 선정하고, 해당 문자의 원본 데이터 품질·support·주요 혼동 상대를 먼저 감사한다. 다음 회차에는 미달 문자와 혼동쌍에 대해서만 추가 데이터/증강 및 sampling·loss 가중치를 적용하되, 이미 93%를 넘은 문자의 하락 여부도 함께 검사한다. 체크포인트는 전체 평균뿐 아니라 validation의 하위 10% class recall/F1을 포함해 선택한다. 잠근 test의 문자별 결과로 focus class나 하이퍼파라미터를 고르면 test leakage가 되므로, test는 한 회차의 최종 전체 41종 판정에만 사용한다. 최종 성공 조건은 전체 accuracy·macro-F1 93% 이상, 41개 모든 class recall·F1 93% 이상, 주요 조건 slice의 하락 없음이다.

연속 지문자는 T-13·T-14·T-15 모두 정적 이미지 데이터만 사용했으므로 `not-measured`다. 별도 실사용 영상으로 CER·확정률·분당 오확정·중복/누락 전환·p50/p95 지연을 측정하기 전까지 연속 입력 성능을 달성했다고 주장하지 않는다.

### T-13 결과 — 전체 평균이 문자별 실패를 가린 사례

- 실행: 물리 GPU 2(NVIDIA L40S), `CUDA_VISIBLE_DEVICES=2`, seed 67, 22/30 epoch, EfficientNet-B0.
- 데이터: 총 5,809장(자모 4,702 + 숫자 1,107), train/validation/test 4,756/526/527. 제공 split을 유지했지만 signer-independent가 아니며 Roboflow 증강 원본 계열이 split 사이에 겹칠 수 있다.
- 목적과 방법: 자모와 숫자를 하나의 41-class 모델에서 평가하고, ImageNet 전이학습과 crop·회전·이동·색상·blur 증강 및 sqrt 역빈도 class balance를 적용했다.
- 결과: test accuracy 93.17%, macro-F1 93.63%. 자모 197장은 accuracy 94.92%/macro-F1 94.09%, 숫자 330장은 92.12%/84.52%였다.
- 판정: 평균 지표는 93%를 넘었지만 아래 17개 class 중 하나라도 recall 또는 F1이 93% 미만이어서 실패다.

| 미달 class | Support | Recall | F1 |
| --- | ---: | ---: | ---: |
| NUM_0 | 66 | 74.24% | 85.22% |
| NUM_1 | 30 | 100.00% | 83.33% |
| NUM_3 | 24 | 91.67% | 86.27% |
| NUM_4 | 30 | 86.67% | 92.86% |
| ㄱ / ㄹ | 5 / 5 | 80.00% / 80.00% | 88.89% / 80.00% |
| ㅈ / ㅊ / ㅋ / ㅌ / ㅎ | 4 / 3 / 5 / 8 / 3 | 100.00% / 66.67% / 100.00% / 87.50% / 100.00% | 88.89% / 80.00% / 90.91% / 87.50% / 85.71% |
| ㅐ / ㅓ / ㅔ / ㅕ / ㅖ / ㅣ | 6 / 2 / 13 / 4 / 10 / 9 | 100.00% / 50.00% / 69.23% / 100.00% / 100.00% / 88.89% | 92.31% / 66.67% / 81.82% / 88.89% / 86.96% / 94.12% |

### T-14 결과 — 낮은 class 집중 보정의 효과와 회귀

- 목적: T-13의 낮은 17개 class를 집중 보정해 최저 class 성능을 올리고, 전체 평균 상승이 아닌 class-floor 개선을 확인하려 했다.
- 방법: focus multiplier 1.75, seed 71, batch 96, 30 epoch. checkpoint는 validation accuracy 20% + macro-F1 30% + 하위 10% recall 25% + 하위 10% F1 25%로 선택했다. best는 epoch 25로 validation accuracy 96.01%, macro-F1 95.44%, min recall 73.33%, min F1 80.00%였다.
- 실행 실패도 보존한다. 첫 preflight는 존재하지 않는 `artifacts/roboflow-v4-features.npz` 경로로 실행해 학습 전에 종료됐으며 GPU 계산은 발생하지 않았다. 실제 artifact인 `artifacts/roboflow_v4_features.npz`로 수정해 재실행했다.
- 결과: test accuracy 92.60%(T-13 대비 **-0.57%p**), macro-F1 94.07%(**+0.45%p**). 자모 accuracy 94.16%/macro-F1 94.62%, 숫자 91.52%/92.38%로 두 domain의 accuracy가 모두 하락했다.
- 원인 감사: sqrt 역빈도와 focus weight가 `WeightedRandomSampler`와 `CrossEntropyLoss`에 동시에 들어가 1.75배 focus가 사실상 중복 작용했다. T-14는 이 결함을 포함한 비교 회차로 보존하며, 다음 코드는 `--balance-mode sampler`를 기본으로 한 번만 적용한다.
- 통계 누수: focus class를 T-13의 test 결과로 골랐으므로 이 split은 이제 `development-test`다. T-14 수치는 방법 비교에는 쓰지만 최종 인증에는 쓰지 않으며, 새 잠금 test가 필요하다.

| T-14 미달 class | Support | Recall | F1 | T-13 대비 핵심 변화 |
| --- | ---: | ---: | ---: | --- |
| NUM_0 | 66 | 72.73% | 84.21% | recall -1.51%p, F1 -1.01%p |
| NUM_1 | 30 | 100.00% | 90.91% | F1 +7.58%p, 여전히 미달 |
| NUM_3 | 24 | 95.83% | 90.20% | recall +4.16%p, F1 +3.93%p |
| NUM_4 / NUM_5 | 30 / 30 | 86.67% / 100.00% | 91.23% / 82.19% | NUM_4 F1 -1.63%p; NUM_5 신규 회귀 |
| ㄱ / ㄹ | 5 / 5 | 80.00% / 80.00% | 88.89% / 80.00% | 변화 없음 |
| ㅈ / ㅊ / ㅋ / ㅌ | 4 / 3 / 5 / 8 | 100.00% / 66.67% / 100.00% / 87.50% | 88.89% / 80.00% / 90.91% / 87.50% | 변화 없음 |
| ㅔ / ㅕ / ㅖ | 13 / 4 / 10 | 69.23% / 100.00% / 100.00% | 81.82% / 88.89% / 90.91% | ㅔ·ㅕ 변화 없음, ㅖ F1 +3.95%p |
| ㅜ / ㅠ / ㅡ / ㅢ | 4 / 7 / 11 / 6 | 100.00% / 85.71% / 81.82% / 100.00% | 88.89% / 92.31% / 90.00% / 92.31% | 모두 신규 회귀 |

T-13에서 미달이던 `ㅎ·ㅐ·ㅓ·ㅣ`는 T-14 point estimate에서 gate를 넘었지만 support가 각각 매우 작아 일반화 증거로 보지 않는다. 반대로 `NUM_5·ㅜ·ㅠ·ㅡ·ㅢ`가 새로 미달이 됐다. 최저 recall은 50.00%에서 66.67%로, 최저 F1은 66.67%에서 80.00%로 개선됐지만, 93% 목표에는 각각 26.33%p와 13.00%p 부족하다.

#### 유사 글자 분리 효과

| 유사군 (Support) | T-13 | T-14 | 내부 혼동률 T-14 | 해석 |
| --- | ---: | ---: | ---: | --- |
| ㅅ-ㅆ (12) | 100.00% | 91.67% | 0.00% | -8.33%p 회귀; 오답은 그룹 밖 class |
| ㅕ-ㅖ (14) | 100.00% | 100.00% | 0.00% | 유지 |
| ㅔ-ㅖ (23) | 82.61% | 82.61% | 8.70% | 개선 없음, hard-negative 분리 필요 |
| ㅏ-ㅗ (20) | 100.00% | 100.00% | 0.00% | 유지 |
| ㅛ-ㅑ (10) | 100.00% | 100.00% | 0.00% | 유지 |
| ㄹ-ㅌ (13) | 84.62% | 84.62% | 15.38% | 개선 없음, hard-negative 분리 필요 |
| ㅈ-ㅅ-ㅊ (12) | 91.67% | 91.67% | 0.00% | 개선 없음; 그룹 밖 오답 포함 |

단순 class focus는 핵심 유사군을 분리하지 못했다. 다음 회차는 validation confusion matrix에서 실제 혼동쌍을 고르고, 쌍별 hard-negative sampling과 target logit이 혼동 class보다 일정 margin 이상 높아지도록 하는 보조 loss를 적용한다. `ㅔ:ㅖ`, `ㄹ:ㅌ`을 우선 후보로 하며, test에서 쌍을 고르지 않는다.

#### 방향 proxy와 UX

T-14의 방향 결과는 MediaPipe가 검출한 자모 subset 190/527에만 해당하며 실제 손바닥/손등·상하 수동 정답 라벨이 아니다. detected left 34장은 100.00%, right 156장은 92.95%. fingers-down 44장은 93.18%, fingers-up 137장은 94.89%, sideways 9장은 88.89%. palm-normal proxy는 edge-on 14장 92.86%, z-negative 71장 95.77%, z-positive 105장 93.33%였다. 이 수치를 실제 손바닥/손등 성능이라고 부르지 않으며, AI Hub 영상 또는 별도 촬영에서 수동 조건 라벨을 붙여 다시 측정한다.

Validation이 선택한 threshold 0.50에서 T-13은 accepted accuracy 94.86%, coverage 96.02%, 전체 표본 대비 false confirmation 4.93%였다. T-14는 각각 94.23%, 95.45%, 5.50%로 accepted accuracy -0.63%p, coverage -0.57%p, false confirmation +0.57%p 회귀했다. 따라서 사용성도 개선되지 않았고 운영 승격하지 않는다.

### T-15 코드 감사 반영과 데이터 계획

- class/focus weight를 sampler와 loss에 중복 적용하지 않도록 `--balance-mode sampler|loss|both`를 추가하고 기본을 `sampler`로 정했다. `both`는 T-14 재현 전용이다.
- 혼동쌍의 출처를 `--confusion-source previous-validation|predefined-domain|development-test`로 명시하고 `--confusion-pairs`, `--confusion-margin`, `--confusion-loss-weight`를 적용하는 hard-negative logit-margin을 추가했다. `development-test`를 쓰는 회차는 비교용이며 새 잠금 test에서만 인증한다.
- checkpoint 기본은 전체 평균과 하위 10%뿐 아니라 최저 class recall/F1도 포함하는 `--selection-mode min-q10`으로 바꿨다. 단, validation support가 작은 class의 변동성이 크므로 새 데이터 확보가 우선이다.
- AI Hub 공식 수어 영상 데이터는 21명의 지숫자·지문자 21,000클립을 포함한다. 사용자 계정의 데이터 신청이 필요하며, 권한 확보 후 사람/원본 영상 단위로 train/validation/locked-test를 분리한다. 총 프레임 수를 데이터 수로 부풀리지 않고 원본 clip 수와 추출 frame 수를 각각 기록한다.
- 2026-07-22 진행 상태: AI Hub 로그인·이용 승인과 `INNORIX-EX-Agent` 설치를 확인했다. 원본 보관 위치는 `D:\AITraining\korean-fingerspelling\aihub-103`으로 고정했으며 프로젝트에는 원본을 넣지 않는다. Crowd morpheme 라벨 19,000개와 keypoint 3묶음(Validation 1.31GB key 39474, Training 6.16GB key 39580, Training 4.67GB key 39582)을 D 드라이브에 내려받아 원본/복사본 SHA-256을 대조했다. Validation keypoint archive SHA-256은 `74D3A1F378714024A31941C6342B256DFF087DBB7F60EFAE86D56C073FDE1B57`, Training 두 archive는 각각 `310AF85123AC03A211A5B1A966F3087712F47BC5C45540E14C72EC434AC38A5B`, `193D4F8B7B5F5752339A4792FB4B6C1D864C2C847CAA289A111A4E7B0ACFA736`이다.
- T-15 학습 상태: GPU 서버 `code-v3/scripts/train_roboflow_jamo_image_t10.py`에 반영해 물리 GPU 2에서 완료했다. test accuracy 91.46%, macro-F1 94.31%로 accuracy가 T-14보다 1.39%p 하락해 채택하지 않는다. 새 잠금 test 확보 전에는 최종 93% 인증을 하지 않는다.
- 다음 실행 원칙: 물리 GPU는 반드시 2번만 사용한다. 첫 후보 혼동쌍은 `ㅔ:ㅖ|ㄹ:ㅌ`이며, `--balance-mode sampler --selection-mode min-q10`으로 중복 가중을 제거한다. focus class와 혼동쌍은 잠금 test가 아니라 validation에서만 선정한다.

#### AI Hub 103 CROWD 라벨 감사

- 내려받은 파일: Training `01_crowd_morpheme` 7.72MB, Validation `01_crowd_morpheme` 930.45KB. 라벨 JSON 17,000/2,000개와 압축 원본은 `D:\AITraining\korean-fingerspelling\aihub-103`에 보관한다. 프로젝트에는 원본 라벨·영상이 아니라 분석 코드·해시·통계·split manifest·학습 결과만 둔다.
- split: train signer `01~17` 17명 × 1,000clip = **17,000clip**, validation signer `18~19` 2명 × 1,000clip = **2,000clip**. 동일 사람은 두 split에 겹치지 않는다. AI Hub 설명의 21명 중 signer 20~21은 현재 받은 train/validation morpheme 묶음에 없으므로 locked test 후보인지 추가 파일 구조를 확인해야 한다.
- 문구: 전체 19,000clip, 1,024개 고유 문구. train 고유 1,022개, validation 고유 998개. 평균 문구 길이 3.383자, 중앙값 3자, p95 5자다.
- 시간: train 평균 clip 8.486초/수어 구간 3.932초, validation 8.525초/3.913초. clip-level 시작·종료 시간은 있으나 문자별 프레임 정렬은 없다. 따라서 연속 CER 평가에는 바로 쓸 수 있지만 isolated 문자 프레임 학습에는 CTC/forced alignment 또는 수동 경계가 필요하다.
- 31자모+숫자 10종으로 겹자음·겹받침·일부 복합모음을 기본 자모 연속열로 정규화하면 총 **158,426 target token**이다. 숫자도 0~9가 모두 존재한다.
- 희소/부재 예: `ㅔ` 342, `ㅖ` 514, `ㅌ` 570, `ㅋ` 95 token이고 `ㅒ`는 0이다. 반면 `ㄹ` 17,998, `ㅇ` 18,867, `ㅗ` 17,395로 편차가 크다. `ㅔ-ㅖ`, `ㄹ-ㅌ` 분리는 단순 전체 샘플 증가가 아니라 문자 경계와 hard-negative 균형이 필요하다.
- 미지원 문자가 포함된 label은 133개이며 영문 `k`, `m`, `N`이다. 예: `10km`. 숫자/한글 sequence 평가는 영문 구간을 OOD로 표시하거나 별도 영문 class를 추가하기 전까지 제외 사유와 개수를 기록한다.
- 재현 분석기: `game-ai-dev-server/scripts/analyze_aihub_morpheme_labels.py`. 원본 데이터는 AI Hub 이용조건에 따라 Git에 넣거나 재배포하지 않는다.

#### AI Hub 103 CROWD keypoint 감사

- Validation keypoint 분할 tar를 병합한 ZIP은 1,411,121,080바이트, SHA-256 `91803B0969A00B45F418EC407C6594D14AEF3DAEC816AFD7998ECAFF66FE36B1`이며 ZIP 엔트리 검사가 정상 종료됐다.
- signer 18~19 각각 1,000clip, 총 **2,000clip·671,745 frame**이다. clip당 frame 수는 최소 12, 중앙값 261, 평균 335.873, p95 658.05, 최대 974다. 프레임 수를 독립 데이터 수로 부풀리지 않고 2,000개 원본 clip과 별도로 기록한다.
- Training keypoint 01은 signer 01~10, **10,000clip·2,872,676 frame**이고 clip당 중앙값 235/평균 287.268/p95 658이다. Training keypoint 02는 signer 11~17, frame이 있는 **6,998clip·2,182,236 frame**, 중앙값 236/평균 311.837/p95 487이다. 합계는 train **16,998 usable clip·5,054,912 frame**, validation 포함 **18,998 usable clip·5,726,657 frame**이다.
- morpheme 라벨은 train 17,000clip이지만 signer 16의 `NIA_SL_FS0409_CROWD16_F`, `NIA_SL_FS0493_CROWD16_F` 두 디렉터리는 keypoint ZIP에 frame JSON이 하나도 없다. 따라서 이 2개 clip은 sequence 학습에서 명시적으로 제외하고 제외 사유·개수를 기록한다.
- 매 30번째 archive frame을 뽑은 22,392-frame 표본에서 confidence 0.20 이상인 손 관절이 21개 중 15개 이상일 때 usable로 정의했다. left usable 95.15%, right usable 90.81%, both usable 87.07%, neither usable 1.11%; 평균 confidence는 left 0.624/right 0.573이다.
- 위 hand quality는 OpenPose confidence 기반 proxy이지 손바닥/손등·상하 정답률이나 문자 인식률이 아니다. 문자별 시작·끝 frame 경계가 없으므로 morpheme start/end를 FPS로 변환한 약한 정렬, CTC, 또는 수동 경계가 필요하다.
- 재현 분석기: `game-ai-dev-server/scripts/analyze_aihub_keypoint_archive.py`. ZIP을 수십만 개 파일로 풀지 않고 직접 읽으며 `--sample-stride 1`일 때만 전 프레임 hand quality 감사가 된다.

#### T-15 결과 — hard-negative 분리는 일부 개선됐지만 전체 accuracy 회귀

- 실행: 2026-07-21, 물리 GPU 2(NVIDIA L40S), `CUDA_VISIBLE_DEVICES=2`, seed 73, 26/30 epoch, batch 96. 데이터는 기존 5,809장, split 4,756/526/527이며 AI Hub 데이터는 아직 포함하지 않았다.
- 문제와 방법: T-14의 sampler+loss 중복 가중을 제거해 `--balance-mode sampler`만 사용했다. 유사문자 `ㅔ:ㅖ|ㄹ:ㅌ`에 logit margin 0.25와 보조 loss 0.25를 적용하고, 최저 class와 하위 10%를 함께 보는 `--selection-mode min-q10`으로 checkpoint를 선택했다.
- 전체 결과: test accuracy **91.46%**, macro-F1 **94.31%**. T-14 대비 accuracy **-1.39%p**, macro-F1 **+0.23%p**다. 자모는 197장 accuracy 96.45%/macro-F1 96.55%, 숫자는 330장 88.48%/80.23%로 숫자 domain 회귀가 전체 하락의 주원인이다.
- class gate: 최저 recall **62.50%**, 최저 F1 **61.22%**, 하위 10% recall **77.27%**, 하위 10% F1 **84.62%**. 41개 중 15개가 recall 또는 F1 93% 미달이므로 실패다.

| T-15 미달 class | Support | Recall | F1 |
| --- | ---: | ---: | ---: |
| NUM_0 / NUM_1 / NUM_2 | 66 / 30 / 30 | 77.27% / 100.00% / 96.67% | 87.18% / 86.96% / 85.29% |
| NUM_3 / NUM_4 / NUM_5 / NUM_8 | 24 / 30 / 30 / 30 | 62.50% / 73.33% / 96.67% / 86.67% | 61.22% / 84.62% / 89.23% / 92.86% |
| ㄱ / ㄹ / ㅊ | 5 / 5 / 3 | 80.00% / 80.00% / 66.67% | 88.89% / 88.89% / 80.00% |
| ㅏ / ㅐ / ㅔ / ㅕ / ㅖ / ㅣ | 5 / 5 / 13 / 4 / 10 / 10 | 100.00% / 100.00% / 69.23% / 100.00% / 100.00% / 100.00% | 83.33% / 90.91% / 81.82% / 88.89% / 90.91% / 90.91% |

- 유사문자 효과: `ㅔ-ㅖ`는 정확도 82.61%, 내부 혼동률 8.70%로 T-14와 사실상 동일해 해결되지 않았다. `ㄹ-ㅌ`은 84.62%에서 **92.31%**로 +7.69%p, `ㅅ-ㅠ`는 91.67%에서 **100.00%**로 +8.33%p 개선됐다. pair margin이 한 쌍에는 효과가 있었지만 `ㅔ-ㅖ`와 숫자 domain 손실을 상쇄하지 못했다.
- 방향 proxy(MediaPipe 검출 190/527): left 34장 100.00%, right 156장 95.51%; fingers-down 44장 95.45%, up 137장 97.08%, sideways 9장 88.89%; palm edge-on 14장 92.86%, z-negative 71장 95.77%, z-positive 105장 97.14%. T-14 대비 대부분 좋아졌지만 수동 palm/back·up/down 라벨이 아니므로 실제 조건 성능으로 주장하지 않는다.
- UX: validation 선택 threshold 0.50을 test에 적용하면 accepted 510/527, coverage **96.77%**, accepted accuracy **92.94%**, 전체 표본 대비 false confirmation **6.83%**다. T-14 대비 coverage +1.33%p이나 accepted accuracy -1.29%p, false confirmation +1.33%p로 사용성이 악화됐다.
- 연속 지문자: 정적 이미지 데이터만 사용했으므로 CER·전환 누락/중복·분당 오확정·p50/p95 지연은 `not-measured`다.
- 데이터 누수: 혼동쌍을 이미 development-test 결과를 본 뒤 골랐으므로 T-15도 기법 비교용이다. artifact는 `artifacts/roboflow-t15-hard-negative-single-balance/`이며 운영 승격하지 않는다.

#### T-16 결과 — validation 미달 class loss focus의 일반화 실패

- 실행: 물리 GPU 2, seed 79, 14/18 epoch. T-15 validation에서 recall 또는 F1 93% 미달인 15개 class만 `previous-validation`으로 기록해 1.25배 focus했다. T-15의 pair loss는 제거하고 `--balance-mode loss`만 적용했다.
- 결과: test accuracy **90.70%**, macro-F1 **93.79%**, T-15 대비 accuracy **-0.76%p**. 자모는 197장 96.45%/macro-F1 95.56%였지만 숫자는 330장 **87.27%/79.97%**로 더 하락했다.
- class gate: min recall 66.67%, min F1 80.00%, q10 recall 81.82%, q10 F1 83.33%, 미달 22개다. validation focus class 수가 test에서 줄지 않고 늘었으므로 loss-only focus는 채택하지 않는다.
- UX: validation 선택 threshold 0.50에서 test accepted 513/527, coverage 97.34%, accepted accuracy 91.81%, false confirmation/all 7.97%로 T-15보다 악화됐다. 연속 지문자는 `not-measured`다.
- 원인: 고정된 작은 validation의 class별 변동을 직접 loss에 반영해 숫자 결정경계가 과적합됐고, T-13 이후 서로 다른 seed로 만든 숫자 validation split도 회차 비교를 불안정하게 했다. 다음 회차는 추가 gradient update 없이 기존 checkpoint의 공통 validation expert 선택을 먼저 평가한다.

#### T-17 결과 — 평균 목표 회복, 개별 class gate는 미달

- 방법: 학습 없이 T-13~T-16 네 checkpoint를 같은 validation seed 83으로 추론했다. 각 class에서 validation F1, recall, precision 순으로 가장 좋은 expert의 확률을 사용하고 행 단위로 다시 정규화했다. single/mean/domain/class expert 후보 중 min-q10 selection score가 가장 높은 `class-expert`만 test에 적용했다.
- 결과: test accuracy **93.55%**, macro-F1 **95.04%**. 자모 197장 accuracy 95.43%/macro-F1 95.64%, 숫자 330장 92.42%/93.19%다. T-16 대비 전체 accuracy +2.85%p지만 숫자 accuracy는 93%에 0.58%p 못 미친다.
- class gate: min recall **66.67%**, min F1 **80.00%**, q10 recall 81.82%, 미달 15개로 실패다.

| T-17 미달 class | Support | Recall | F1 |
| --- | ---: | ---: | ---: |
| NUM_0 / NUM_1 / NUM_3 / NUM_4 | 66 / 30 / 24 / 30 | 74.24% / 100.00% / 95.83% / 86.67% | 85.22% / 83.33% / 88.46% / 92.86% |
| ㄱ / ㄹ / ㅈ / ㅊ / ㅋ / ㅌ | 5 / 5 / 4 / 3 / 5 / 8 | 80.00% / 80.00% / 100.00% / 66.67% / 100.00% / 87.50% | 88.89% / 80.00% / 88.89% / 80.00% / 90.91% / 87.50% |
| ㅏ / ㅔ / ㅕ / ㅖ / ㅣ | 13 / 13 / 4 / 10 / 9 | 100.00% / 69.23% / 100.00% / 100.00% / 88.89% | 92.86% / 81.82% / 88.89% / 90.91% / 94.12% |

- UX: validation threshold 0.50에서 test accepted 508/527, coverage **96.39%**, accepted accuracy **94.69%**, false confirmation/all **5.12%**다. T-16보다 accepted accuracy +2.87%p, false confirmation -2.85%p로 회복했다.
- 한계: 숫자 공통 validation은 provider train에서 만들었고 네 모델이 서로 다른 seed split으로 그 일부를 학습했기 때문에 완전 잠금 validation이 아니다. test도 T-13 이후 반복 관찰한 development-test다. T-17은 다음 실험 후보일 뿐 운영·최종 93% 인증 모델이 아니다.
- 재현 스크립트: `game-ai-dev-server/scripts/evaluate_roboflow_jamo_ensemble_t17.py`. 연속 CER·전환·지연과 수동 손바닥/손등·상하 조건은 여전히 `not-measured`다.

#### T-18 결과 — validation class bias가 test 문자를 바꾸지 못함

- 방법: T-17 class-expert 확률에 class별 곱셈 bias를 적용하고, validation min/q10 class 지표와 전체 accuracy·macro-F1을 함께 최대화하도록 0.50→0.0625 step 좌표 탐색을 했다.
- validation accuracy는 약 97.72%에서 98.48%로 개선됐지만 test accuracy **93.55%**, macro-F1 **95.04%**, 미달 class **15개**로 T-17과 동일했다. 즉 보정된 confidence가 test argmax를 하나도 바꾸지 못했다.
- UX는 threshold 0.50에서 accepted 507/527, coverage 96.20%, accepted accuracy 94.87%, false confirmation/all 4.93%로 T-17보다 coverage -0.19%p, accepted accuracy +0.18%p다. class gate 개선이 없어 채택하지 않는다.
- 재현 스크립트: `game-ai-dev-server/scripts/calibrate_roboflow_jamo_ensemble_t18.py`. 다음 회차는 좌우 반전 없이 약한 회전·이동 TTA를 validation에서 비교한다.

#### T-19 결과 — 약한 TTA가 손가락 세부 형태를 흐림

- 방법: center crop과 ±6도 회전, ±6px 수평 이동의 5-view 확률을 평균했다. 좌우 반전은 의미 변형 위험 때문에 사용하지 않았다. T-13~T-16의 single/mean/domain/class expert 후보를 validation min-q10으로 선택했다.
- validation은 T-15 single model을 선택했다. test accuracy **91.27%**, macro-F1 **93.47%**, 미달 class **17개**로 T-17보다 accuracy -2.28%p다.
- 해석: 작은 회전·이동도 정적 지문자의 손가락 끝·관절 간격을 보간하며 결정경계를 흐렸다. 각도 robustness가 개선된다는 근거가 없으므로 TTA를 채택하지 않는다. 재현 스크립트는 `game-ai-dev-server/scripts/evaluate_roboflow_jamo_tta_t19.py`다.

#### T-20 결과 — class별 확률 혼합도 test 결정경계를 바꾸지 못함

- 방법: T-13~T-16의 center-crop probability를 저장하고, class마다 single one-hot, 전체 평균, 두 모델 0.5/0.5와 0.75/0.25 후보를 validation min/q10 objective로 좌표 탐색했다.
- 결과: test accuracy **93.55%**, macro-F1 **95.04%**, 미달 class **15개**로 T-17과 완전히 동일했다. 확률 calibration·convex mixture가 연속 두 회차에서 argmax를 바꾸지 못했으므로 후처리 탐색을 중단한다.
- 재현 스크립트: `game-ai-dev-server/scripts/optimize_roboflow_jamo_mixture_t20.py`. 다음은 T-13 checkpoint의 낮은 학습률 continuation으로 이미지 특징 자체를 미세 조정한다.

#### T-21 결과 — 낮은 학습률 continuation도 단독 accuracy 회귀

- 방법: T-13 checkpoint와 원래 seed 67 split을 유지하고 focus·pair loss 없이 sampler balance, learning rate 3e-5, label smoothing 0.02로 8 epoch 추가 fine-tune했다.
- 결과: test accuracy **92.98%**, macro-F1 **94.19%**. T-13 대비 accuracy -0.19%p이며 자모 accuracy 94.92%, 숫자 91.82%다. class gate는 min recall 66.67%, min F1 80.00%, q10 recall 80.00%, q10 F1 84.62%로 실패했다.
- UX: threshold 0.50에서 test accepted 512/527, coverage 97.15%, accepted accuracy 94.34%, false confirmation/all 5.50%다. 단독 모델로 승격하지 않지만 T-13과 다른 오류 패턴을 T-22 expert 후보로 사용한다.

#### T-22 결과 — 새 expert가 ensemble test 예측을 바꾸지 못함

- 방법: T-13~T-16 expert pool에 T-21을 추가하고 공통 validation seed 83에서 single/mean/domain/class expert를 다시 선택했다.
- 결과: `class-expert`가 다시 선택됐고 test accuracy **93.55%**, macro-F1 **95.04%**, 미달 class **15개**로 T-17과 동일했다. T-21은 일부 validation class expert로 선택돼도 test argmax 개선으로 이어지지 않았다.
- 결론: 기존 정적 5,809장 안에서 모델 재조합을 더 반복하지 않는다. AI Hub sequence keypoint의 clip/signer/frame 무결성을 확보하고 CTC/forced alignment 데이터 준비로 전환한다.


## 2026-07-21 학습 단위 1 — 세션 분리 기준선 재현

### 목표와 검증 조건

- 기존 자모 시퀀스 93파일(31자모 × 3개 촬영 세션)을 대상으로, 첫 세션만 학습·두 번째 세션 calibration·세 번째 세션을 holdout validation으로 사용했다.
- 실험 모델과 readiness는 `work/experiments/jamo-31-session-holdout/`에만 저장했다. 운영 TFLite와 게임의 readiness는 변경하지 않았다.
- 평가 표본은 7,001개이며, 이 데이터는 서로 다른 사람·카메라·조명을 보장하지 않는다. 따라서 **세션 분리 수치**이며 사용자 독립 인증 수치가 아니다.

### 결과

| 지표 | 기존 기록 | 이번 세션 분리 기준선 | 판정 |
| --- | ---: | ---: | --- |
| argmax 정확도 | 85.50% | **76.86%** | 실사용 승격 불가 |
| 경쟁 허용 조건 | 글자별 precision ≥90%, 확정률 ≥85% | 12개 글자만 통과 | 전체 자모 미달 |
| `ㅠ` recall | 6.0% (기존 재학습 기록) | **11.90%** | 여전히 미달 |
| `ㅕ` recall | 기존 혼동 존재 | **10.13%** | `ㅕ/ㅖ` 경계 붕괴 |
| `ㅔ` recall | 기존 혼동 존재 | **34.98%** | `ㅔ/ㅖ` 경계 붕괴 |

낮은 argmax precision의 주요 글자는 `ㅖ` 25.10%, `ㅔ` 30.00%, `ㅕ` 43.64%, `ㅅ` 51.71%, `ㅑ` 51.88%, `ㄴ` 54.50%, `ㅁ` 55.47%, `ㅌ` 57.50%였다. confidence threshold를 높여 일부 오확정은 막을 수 있었지만 확정률이 0%에 가까워져 해결책이 될 수 없었다. 즉 임계값 조정이 아니라 손 방향·손바닥/손등·깊이·새 사용자 다양성을 갖춘 데이터와 특징 보강이 필요하다.

### 이번 단위에서 해결한 문제

- 학습 스크립트가 삭제된 `prototype/ai-server`를 고정 참조해 재현이 불가능했던 문제를 `game-ai-dev-server/app/model_adapter.py` 기준으로 수정했다.
- 실험이 운영 `models/multi_hand_gesture_classifier.*`와 `game-contracts/recognition/readiness.json`을 덮어쓰던 문제를 수정했다. 이제 결과는 `work/experiments/`에 격리되며, 별도 검토 없이는 운영 모델을 바꾸지 않는다.
- AI 서버 단위 테스트 16개가 모두 통과했다. hybrid는 숫자 domain router와 자모 TFLite head를 결합하지만, readiness는 자모 head의 안전 gate를 공유한다. 실험 모델은 이 gate를 변경하지 않았다.

### 다음 학습 단위

1. CC BY 4.0 공개 한국 지문자 이미지 데이터를 수집하고, 원본/증강본을 분리해 MediaPipe 검출률·오류·handedness를 감사한다.
2. 손목 상대 좌표뿐 아니라 손바닥 법선, 손가락 관절각, z 깊이와 방향 특징을 추가해 `ㅠ/ㅅ`, `ㅕ/ㅖ`, `ㅔ/ㅖ` 혼동을 집중 평가한다.
3. 최소 5명의 신규 사용자를 signer 단위로 holdout하고, 손바닥/손등·상하 회전·좌우 손·거리·조명·카메라 및 `NONE/OOD`를 포함한다.
4. 연속 지문자는 정적 이미지 결과로 대체하지 않는다. 실제 카메라 시퀀스에서 문자 오류율, 확정률, 오확정률과 end-to-end latency를 별도 측정한다.

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
## T-23 — AIHub 연속 지문자 CTC 기준선 (2026-07-22)

- 목적: 정지 이미지 평균값과 별개로 연속 지문자의 문자 누락·중복·전환 문제를 수치화했다. 문장 라벨에는 문자별 시각 경계가 없으므로 임의 등분 라벨을 만들지 않고, 수어 구간당 16~32프레임을 선택해 BiGRU-CTC가 경계를 학습하게 했다.
- 데이터: 서명자 01~17의 16,873문장, 141,340 target token, 323,125 frame. 서명자 18의 993문장을 validation, 19의 993문장을 development test로 분리했다. 선택 프레임 누락은 0개다.
- 방법: 손목/크기 정규화와 왼손 mirror를 적용한 좌·우 손 128차원 특징, 물리 GPU 2(`CUDA_VISIBLE_DEVICES=2`), 2-layer bidirectional GRU, CTC loss, seed 89, 12 epoch. 서명자 18 CER로 checkpoint를 선택하고 서명자 19는 마지막에 평가했다.
- validation: CER 6.91%, 문장 완전일치 63.44%, micro token recall 93.95%, macro recall 84.18%, macro F1 85.33%.
- development test: CER 7.56%, 문장 완전일치 63.95%, micro token recall 93.40%, macro recall 83.05%, macro F1 85.24%, 최소 recall/F1 0%. 41개 중 25개가 recall 또는 F1 93% gate 미달이다. 숫자 10개가 모두 미달이며 `NUM_8` recall/F1 52.94%/64.29%, `NUM_0` 58.62%/66.67%, `NUM_4` 63.33%/66.67%였다. `ㅒ`는 test support 0이라 인증 불가다.
- 주요 혼동: `ㅈ→ㅅ` 21회, `ㅊ→ㅈ` 14회, `NUM_8→NUM_7` 6회. 평균 micro recall만 93%를 넘는 통계 착시가 있으며 macro와 문자별 gate는 실패다.
- UX: CER 7.56%는 약 13문자마다 한 편집 오류이고 문장 완전일치 63.95%라 자동 확정에 부족하다. 운영 모델로 승격하지 않는다.
- 한계: CROWD19는 개발 테스트이지 독립 최종 인증 세트가 아니다. 손바닥/손등·위/아래 조건 라벨도 없어 조건별 정확도를 주장하지 않는다.
- 판정: **실패**. 정지 이미지 최고 T-17/T-22(accuracy 93.55%, macro F1 95.04%, 15 class 미달)와 연속 T-23을 섞어 평균내지 않는다.
### 현재 문자별 비교 — T-22 정지 이미지 vs T-23 연속 입력

`정지 recall`은 해당 글자의 held-out 이미지를 맞힌 비율이며 일반적으로 말하는 문자별 정확도에 가장 가깝다. `연속 recall/F1`은 문장 안 token 기준이다. 두 데이터셋·과제가 달라 서로 평균내지 않는다. support가 매우 작은 글자는 100%여도 인증으로 보지 않는다.

| 문자 | T-22 정지 recall | T-23 연속 recall | T-23 연속 F1 |
|---|---:|---:|---:|
| ㄱ | 80.00% | 94.92% | 95.57% |
| ㄴ | 100.00% | 94.53% | 95.40% |
| ㄷ | 100.00% | 97.13% | 94.05% |
| ㄹ | 80.00% | 96.62% | 96.77% |
| ㅁ | 100.00% | 91.15% | 94.05% |
| ㅂ | 100.00% | 92.52% | 91.24% |
| ㅅ | 100.00% | 92.16% | 91.82% |
| ㅇ | 100.00% | 95.46% | 95.85% |
| ㅈ | 100.00% | 80.95% | 85.00% |
| ㅊ | 66.67% | 86.24% | 87.85% |
| ㅋ | 100.00% | 60.00% | 75.00% |
| ㅌ | 87.50% | 82.76% | 88.89% |
| ㅍ | 100.00% | 97.83% | 94.74% |
| ㅎ | 100.00% | 95.83% | 96.70% |
| ㅏ | 100.00% | 93.69% | 93.22% |
| ㅑ | 100.00% | 89.66% | 91.23% |
| ㅓ | 100.00% | 90.16% | 91.32% |
| ㅕ | 100.00% | 93.70% | 94.07% |
| ㅗ | 100.00% | 98.36% | 98.52% |
| ㅛ | 100.00% | 96.30% | 98.11% |
| ㅜ | 100.00% | 94.30% | 93.94% |
| ㅠ | 100.00% | 61.54% | 66.67% |
| ㅡ | 100.00% | 96.59% | 96.59% |
| ㅣ | 88.89% | 93.75% | 95.29% |
| ㅐ | 100.00% | 92.44% | 92.44% |
| ㅒ | 100.00% | 평가 불가(support 0) | 평가 불가 |
| ㅔ | 69.23% | 88.89% | 91.43% |
| ㅖ | 100.00% | 92.59% | 96.15% |
| ㅢ | 100.00% | 95.24% | 95.24% |
| ㅚ | 100.00% | 100.00% | 100.00% |
| ㅟ | 100.00% | 84.62% | 91.67% |
| 0 | 74.24% | 58.62% | 66.67% |
| 1 | 100.00% | 79.31% | 82.88% |
| 2 | 100.00% | 69.44% | 80.65% |
| 3 | 95.83% | 68.75% | 70.97% |
| 4 | 86.67% | 63.33% | 66.67% |
| 5 | 100.00% | 68.75% | 81.48% |
| 6 | 96.67% | 72.73% | 78.05% |
| 7 | 93.33% | 82.35% | 60.87% |
| 8 | 100.00% | 52.94% | 64.29% |
| 9 | 100.00% | 68.75% | 73.33% |

요약하면 T-22 정지 이미지 전체 accuracy는 93.55%, macro F1은 95.04%지만 recall/F1 동시 93% gate 미달이 15개다. T-23 연속 입력은 micro token recall 93.40%여도 macro F1 85.24%, 25개 gate 미달, `ㅒ` 평가 불가이므로 목표를 달성하지 못했다.
## T-24~T-27 — 짧은 집중 튜닝 (2026-07-22 05:54~06:10)

공통 조건은 AIHub 103의 동일 signer split, 물리 GPU 2, T-23 BiGRU-CTC 구조다. 개발 테스트(CROWD19)를 튜닝 선택에 반복 사용하지 않기 위해 T-24/T-25/T-27은 `--skip-test`로 validation(CROWD18)만 계산했다. 학습 스크립트에는 동일 class/input 계약을 검사하는 warm start와 문장별 focus-token 비율에 따른 `WeightedRandomSampler`를 추가했다.

| 회차 | 해결하려던 문제와 방법 | epoch/lr | validation CER | validation macro-F1 | 판정 |
|---|---|---:|---:|---:|---|
| T-23 | 무가중 연속 CTC 기준선 | 12 / 1e-3 | 6.91% | 85.33% | 기준선 |
| T-24 | 숫자 10종이 모두 gate 미달: 숫자 포함 문장 5배 focus sampling, T-23 warm start | 4 / 2e-4 | 6.07% | 88.12% | 개선 |
| T-25 | `ㅈ·ㅊ·ㅋ·ㅌ·ㅠ·ㅟ·ㅑ·ㅓ·ㅐ·ㅔ·ㅖ·ㅂ·ㅅ·ㅁ` 포함 문장 3배 sampling, T-24 warm start | 4 / 1e-4 | **6.02%** | **88.60%** | 최종 선택 |
| T-26 | T-25를 lr 0으로 고정한 development-test 1회 평가 | 1 / 0 | 6.02% | 88.60% | 평가 전용 |
| T-27 | 숫자+취약 자모 전체 4배 sampling, T-25 warm start | 3 / 5e-5 | **5.97%** | 88.34% | CER는 소폭 개선, macro-F1 하락으로 미선택 |

T-26 development test는 T-23 대비 CER `7.56→6.97%`(-0.59%p), 문장 완전일치 `63.95→66.47%`(+2.52%p), micro token recall `93.40→93.83%`(+0.43%p), macro recall `83.05→86.08%`(+3.03%p), macro-F1 `85.24→87.88%`(+2.64%p)로 개선됐다. 자모 평균 recall/F1은 87.93%/89.31%, 숫자는 80.37%/83.42%다.

여전히 25개 class가 recall 또는 F1 93% gate 미달이다. 최저는 support 0인 `ㅒ` 외에 `ㅋ` recall/F1 60.00%/66.67%, `ㅠ` 61.54%/72.73%, `NUM_0` 65.52%/76.00%, `NUM_3` 68.75%/72.13%다. 주요 치환은 `ㅓ→ㅏ` 21회, `ㅈ→ㅅ` 16회, `ㅅ→ㅈ` 9회, `ㅅ→ㅊ` 8회다. 숫자 focus가 전체 지표를 높였지만 희소 support와 유사 손모양 분리는 sampler만으로 해결되지 않았다.

UX 관점에서는 문장 완전일치가 2.52%p 올랐지만 3문장 중 약 1문장은 여전히 편집 오류가 있으므로 자동 확정 모델로 승격하지 않는다. 다음 단계는 `ㅒ` 실측 표본 추가, 숫자/희소 문자 균형 데이터, CTC beam search와 제한적 자모 언어 제약, 유사 자음 pairwise auxiliary loss를 validation-only로 비교해야 한다.
### T-28/T-29 — CTC blank 확정 보정

T-25 가중치를 고정하고 validation에서 blank logit bias `-0.6, -0.3, +0.3, +0.6`을 비교했다. bias 0 기준(CER 6.02%, macro-F1 88.60%) 대비 `-0.3`이 CER 5.94%, macro-F1 88.63%로 두 지표를 함께 개선해 선택됐다. `-0.6`은 CER 5.91%였지만 macro-F1 88.60%로 trade-off가 있어 제외했다.

선택 설정을 T-29로 development test에 적용한 결과 CER 6.97%, 문장 완전일치 66.87%, micro token recall 93.94%, macro recall 86.16%, macro-F1 87.83%, gate 미달 24개였다. T-26(bias 0) 대비 CER는 동일하고 문장 완전일치 +0.40%p, micro recall +0.11%p, gate 미달 25→24개로 UX 쪽은 개선됐지만 macro-F1은 -0.04%p다. 따라서 운영 후보는 `T-25 checkpoint + blank bias -0.3`으로 기록하되 목표 달성으로 판정하지 않는다.
## T-30 — 체크포인트 선택 오류 수정 (2026-07-22 06:08)

- 심각한 문제: 기존 CTC 학습기는 validation CER만 최소화해, T-27처럼 CER가 소폭 좋아져도 macro-F1이 하락한 epoch를 자동 선택했다. 이는 평균 편집오류와 문자별 균형을 동시에 요구하는 목표와 불일치한다.
- 수정: checkpoint 선택 점수를 `validation macro-F1 - CER`로 바꿔 두 지표가 함께 좋아지는 epoch를 우선한다. 각 epoch 로그와 checkpoint/report에 선택 점수·정책을 저장한다.
- 재검증: 기록된 T-25와 T-27 후보에 적용하면 T-25 점수 `0.82572`, T-27 점수 `0.82369`로 T-25를 올바르게 선택한다. 모델 수치는 새로 주장하지 않으며 선택 로직만 교정한 회차다.
## T-31 — 최저 성능 문자·혼동쌍 집중 학습 (2026-07-22 06:10)

- 문제/방법: T-29에서 가장 낮은 `ㅋ·ㅠ·NUM_0·NUM_3·NUM_8`과 주요 혼동 `ㅓ/ㅏ·ㅈ/ㅅ/ㅊ` 포함 문장을 6배 focus sampling하고, T-25에서 lr 2e-5로 2 epoch 미세조정했다. 물리 GPU 2, blank bias -0.3, development test 미사용이다.
- 결과: 최고 epoch의 validation CER 6.05%, macro-F1 88.64%, 균형 선택 점수 0.82593. 현재 T-29 설정의 CER 5.94%, macro-F1 88.63%, 점수 0.82691보다 낮다.
- 판정: **미선택**. 서로 다른 희소 class와 혼동쌍을 한 번에 6배 재표집하면 macro-F1은 유지돼도 누락/중복 오류가 늘어 과보정된다. 다음에는 숫자와 자모를 분리하고 class별 최대 배수를 제한한다.

## T-32~T-90 — 연속 CTC 공정성 개선 (2026-07-22 06:10~07:15)

### 데이터와 평가 계약

- AIHub 103 원본 범위는 train 17,000clip과 validation 2,000clip, 총 19,000clip이다. 품질 필터·manifest 결합 후 실제 사용한 것은 train signer 01~17의 16,873clip·141,340 token·323,125 frame, validation signer 18의 993clip, development signer 19의 993clip이다. 총 평가 포함 clip은 18,859개다.
- T-46 고시간해상도 비교는 같은 16,873개 학습 clip에서 24~48 frame을 골라 412,261 frame을 사용했고, validation 원본 1,986clip은 48,815 frame·16,638 token이다. 누락 frame과 탈락 clip은 0개였다.
- 모든 GPU 학습은 `CUDA_VISIBLE_DEVICES=2`로 물리 GPU 2만 사용했다. 프로세스 안의 `cuda:0`은 이 물리 장치가 다시 매핑된 논리 번호다.
- checkpoint는 `validation macro-F1 - CER`가 최대인 epoch로 선택했다. CROWD18만 선택에 사용하고 CROWD19는 후보 판정용 development test로 기록했다. 다만 이번 세션에서 여러 후보를 CROWD19에 반복 비교했으므로 CROWD19도 더 이상 untouched final test가 아니다.
- 목표는 전체 micro recall·macro-F1 93% 이상과 41개 모든 문자 recall·F1 93% 이상을 동시에 만족하는 것이다. support 0은 0% 성공이 아니라 **평가 불가**로 판정한다.

### 회차별 결과

표의 `dev`는 CROWD19를 실제 평가한 회차만 적었다. 나머지는 CROWD18 validation만 사용했다. 수치는 각각 `CER / macro-F1`이다.

| 회차 | 문제와 적용 기술 | validation | dev | 판정 |
|---|---|---:|---:|---|
| T-32 | 숫자만 3배 재표집 | 6.07% / 88.35% | - | 미선택 |
| T-33 | `ㅋ·ㅠ·ㅟ·ㅈ·ㅊ·ㅌ` 3배 재표집 | 6.01% / 88.44% | - | 미선택 |
| T-34 | frame delta 특징, 최초 12 epoch | 6.78% / 85.46% | - | 덜 수렴 |
| T-35 | T-34에서 12 epoch 이어학습 | 5.28% / 89.75% | - | delta 후보 |
| T-36 | blank bias `-0.6/-0.3/+0.3/+0.6` 비교 | `-0.6`: 5.19% / 89.78% | - | `-0.6` 선택 |
| T-37 | T-35 + blank `-0.6` 고정 평가 | 5.19% / 89.78% | 6.32% / 88.81% | 당시 최고, 20 class 미달 |
| T-38 | 개발 취약 자모를 focus한 4 epoch | 4.74% / 90.04% | - | validation 과적합 의심 |
| T-39 | 취약 숫자 focus 4 epoch | 4.97% / 89.67% | - | 미선택 |
| T-40 | T-38 고정 평가 | 4.74% / 90.04% | 6.23% / 88.40% | T-37보다 macro 하락, 폐기 |
| T-41 | validation 취약 자모 2배 focus | 5.05% / 89.90% | - | 미선택 |
| T-42 | validation 취약 숫자 2배 focus | 4.87% / 90.17% | - | validation 후보 |
| T-43 | T-42 고정 평가 | 4.87% / 90.17% | 6.19% / 88.52% | 22 class 미달, 폐기 |
| T-44 | delta + temporal Conv, 최초 12 epoch | 6.73% / 84.95% | - | 덜 수렴 |
| T-45 | T-44에서 12 epoch 이어학습 | 5.33% / 87.76% | - | Conv 이득 없음 |
| T-46 | 24~48 frame 고시간해상도 warm start | 5.22% / 90.36% | - | 비교 후보 |
| T-47 | T-46 저학습률 6 epoch | 5.18% / 90.46% | - | 비교 후보 |
| T-48 | T-47 고정 평가 | 5.18% / 90.46% | 6.29% / 88.78% | 고시간해상도 단독 이득 없음 |
| T-49 | padding을 제거한 packed BiGRU, 기존 가중치 보정 | 5.00% / 90.49% | - | 구조 수정 후보 |
| T-50 | T-49 고정 평가 | 5.00% / 90.49% | 6.24% / 88.25% | 기존 padding 문맥 과적합 확인 |
| T-51 | packed BiGRU를 처음부터 12 epoch | 6.68% / 84.98% | - | 덜 수렴 |
| T-52 | T-51 저학습률 12 epoch | 4.88% / 90.49% | - | packed 기준점 |
| T-53 | T-52 고정 평가 | 4.88% / 90.49% | 6.27% / 88.84% | T-37 소폭 상회 |
| T-54 | 숫자 1.25배 약한 focus | 5.10% / 90.26% | - | 폐기 |
| T-55 | 취약 자모 1.25배 약한 focus | 5.00% / 90.21% | - | 폐기; 최초 명령의 유사 글자 오입력은 class 검증에서 즉시 차단 |
| T-56 | blank bias `-0.9` | 4.97% / 90.33% | - | 폐기 |
| T-57 | blank bias `-0.3` | 4.87% / 90.51% | - | validation 선택 |
| T-58 | T-57 고정 평가 | 4.87% / 90.51% | 6.32% / 88.61% | dev 하락, 폐기 |
| T-59 | 검출된 x/y에만 좌표 잡음 std 0.01 | 4.83% / 90.41% | - | 일반화 후보 |
| T-60 | T-59 고정 평가 | 4.83% / 90.41% | 6.15% / 89.11% | 새 최고 |
| T-61 | 좌표 잡음 + lr 2e-5 이어학습 | 4.81% / 90.65% | - | 후보 |
| T-62 | T-61 고정 평가 | 4.81% / 90.65% | 6.09% / 89.03% | CER 개선, macro는 T-60 미달 |
| T-63 | T-52/T-59/T-61 3-model logit 평균 | 4.78% / 90.42% | 6.07% / 89.08% | macro 이득 없음 |
| T-64 | T-59/T-61 2-model logit 평균 | 4.87% / 90.43% | 6.19% / 89.06% | 폐기 |
| T-65 | 좌표 잡음 std 0.02 | 4.83% / 90.41% | - | 0.01보다 이득 없음 |
| T-66 | T-65 고정 평가 | 4.83% / 90.41% | 6.18% / 89.08% | 폐기 |
| T-67 | 좌표 잡음 0.01, seed 113 | 4.91% / 90.32% | - | seed 분산 확인 |
| T-68 | T-67 고정 평가 | 4.91% / 90.32% | 6.30% / 88.88% | 폐기 |
| T-69 | T-59/T-67 서로 다른 seed 앙상블 | 4.88% / 90.44% | 6.25% / 89.03% | 폐기 |
| T-70 | 빈도 역수 완화형 균형 sampler, alpha 0.25 | 4.83% / 90.46% | - | 희소 문자 후보 |
| T-71 | T-70 고정 평가 | 4.83% / 90.46% | 6.14% / 89.30% | 새 최고 |
| T-72 | alpha 0.25 + lr 1e-5 이어학습 | 4.88% / 90.57% | - | 후보 |
| T-73 | T-72 고정 평가 | 4.88% / 90.57% | 6.13% / 89.35% | 새 최고 |
| T-74 | 균형 alpha 0.40 | 4.93% / 90.65% | - | 과가중 의심 |
| T-75 | T-74 고정 평가 | 4.93% / 90.65% | 6.25% / 88.93% | 폐기 |
| T-76 | packed delta BiGRU를 3층×192로 확대, 18 epoch | 4.66% / 90.10% | - | 대형 모델 수렴 전반 |
| T-77 | T-76 + lr 2e-4, 8 epoch | 4.05% / 92.08% | - | 큰 폭 개선 |
| T-78 | T-77 고정 평가 | 4.05% / 92.08% | 5.37% / 91.13% | 새 최고 |
| T-79 | 대형 모델 균형 alpha 0.50 | 3.91% / 92.08% | - | 희소 문자 개선 |
| T-80 | T-79 고정 평가 | 3.91% / 92.08% | 5.29% / 91.36% | 새 최고 |
| T-81 | T-79 + lr 2e-5, 4 epoch | 3.81% / 92.31% | - | 최종 가중치 |
| T-82 | T-81, blank `-0.6` 평가 | 3.81% / 92.31% | 5.23% / 91.67% | 가중치 기준 최고 |
| T-83 | 균형 alpha 0.75 | 3.87% / 92.22% | - | 과가중 |
| T-84 | T-83 고정 평가 | 3.87% / 92.22% | 5.22% / 91.65% | T-82보다 macro 하락 |
| T-85 | 숫자 포함 clip 추가 5배 focus | 3.84% / 92.28% | - | 숫자 집중 후보 |
| T-86 | T-85 고정 평가 | 3.84% / 92.28% | 5.22% / 91.61% | 전체 macro 하락, 폐기 |
| T-87 | T-81 blank `-0.3` | 3.81% / 92.26% | - | 폐기 |
| T-88 | T-81 blank `-0.9` | 3.79% / 92.35% | - | 최종 decoder 설정 |
| T-89 | T-81 + blank `-0.9` 고정 평가 | 3.79% / 92.35% | **5.25% / 91.69%** | 현재 macro 최고, 18 class 미달 |
| T-90 | T-81 blank `-1.2` 경계 확인 | 3.80% / 92.35% | - | CER가 T-88보다 나빠 폐기 |

### T-89 현재 문자별 결과

`recall`을 문자별 정확도로 사용한다. train token 불균형은 매우 크다. `ㅇ` 16,829개에 비해 `ㅋ` 85개, `ㅠ` 221개이며 `ㅒ`는 0개다. 그러므로 macro 평균이 올라가도 모든 문자 93%를 자동으로 만족하지 않는다.

| 문자 | 학습 token | dev support | recall | F1 | 93% gate |
|---|---:|---:|---:|---:|:---:|
| ㄱ | 10,045 | 591 | 95.43% | 95.92% | 통과 |
| ㄴ | 10,253 | 603 | 97.01% | 97.42% | 통과 |
| ㄷ | 4,147 | 244 | 97.54% | 95.20% | 통과 |
| ㄹ | 16,071 | 947 | 97.78% | 97.17% | 통과 |
| ㅁ | 4,418 | 260 | 92.31% | 94.67% | 미달 |
| ㅂ | 3,637 | 214 | 92.52% | 91.45% | 미달 |
| ㅅ | 6,931 | 408 | 95.59% | 94.89% | 통과 |
| ㅇ | 16,829 | 991 | 96.87% | 96.63% | 통과 |
| ㅈ | 3,565 | 210 | 86.67% | 90.55% | 미달 |
| ㅊ | 1,852 | 109 | 88.99% | 91.94% | 미달 |
| ㅋ | 85 | 5 | 100.00% | 100.00% | 통과* |
| ㅌ | 493 | 29 | 89.66% | 92.86% | 미달 |
| ㅍ | 781 | 46 | 93.48% | 95.56% | 통과 |
| ㅎ | 2,854 | 168 | 97.02% | 97.02% | 통과 |
| ㅏ | 10,215 | 602 | 95.02% | 95.17% | 통과 |
| ㅑ | 491 | 29 | 96.55% | 90.32% | 미달 |
| ㅓ | 5,355 | 315 | 91.43% | 93.66% | 미달 |
| ㅕ | 2,158 | 127 | 93.70% | 92.25% | 미달 |
| ㅗ | 15,553 | 915 | 98.91% | 98.91% | 통과 |
| ㅛ | 459 | 27 | 96.30% | 98.11% | 통과 |
| ㅜ | 6,558 | 386 | 97.67% | 96.17% | 통과 |
| ㅠ | 221 | 13 | 76.92% | 86.96% | 미달 |
| ㅡ | 1,498 | 88 | 95.45% | 96.00% | 통과 |
| ㅣ | 7,343 | 432 | 95.60% | 95.93% | 통과 |
| ㅐ | 2,921 | 172 | 93.60% | 93.33% | 통과 |
| ㅒ | 0 | 0 | 평가 불가 | 평가 불가 | 평가 불가 |
| ㅔ | 305 | 18 | 94.44% | 94.44% | 통과* |
| ㅖ | 459 | 27 | 92.59% | 94.34% | 미달 |
| ㅢ | 357 | 21 | 95.24% | 97.56% | 통과* |
| ㅚ | 357 | 21 | 100.00% | 100.00% | 통과* |
| ㅟ | 220 | 13 | 100.00% | 100.00% | 통과* |
| 0 | 491 | 29 | 72.41% | 80.77% | 미달 |
| 1 | 986 | 58 | 91.38% | 90.60% | 미달 |
| 2 | 612 | 36 | 86.11% | 89.86% | 미달 |
| 3 | 544 | 32 | 87.50% | 90.32% | 미달 |
| 4 | 509 | 30 | 96.67% | 93.55% | 통과 |
| 5 | 544 | 32 | 90.62% | 93.55% | 미달 |
| 6 | 373 | 22 | 100.00% | 93.62% | 통과* |
| 7 | 289 | 17 | 82.35% | 84.85% | 미달 |
| 8 | 290 | 17 | 88.24% | 90.91% | 미달 |
| 9 | 271 | 16 | 93.75% | 96.77% | 통과* |

`*` support가 30 미만인 통과는 방향·사용자 다양성을 인증하기에 표본이 작다. 41개 중 23개만 수치 gate를 통과했고, 17개는 미달, `ㅒ` 1개는 평가 불가다.

### 개선 폭, 유사 문자와 사용자 경험

- T-23→T-89 development 비교: CER `7.56%→5.25%`(-2.31%p), 문장 완전일치 `63.95%→75.73%`(+11.78%p), micro token recall `93.40%→95.59%`(+2.19%p), macro-F1 `85.24%→91.69%`(+6.45%p), gate 미달/평가 불가 `25→18개`다.
- 적용 기술별 유효 개선은 delta 특징, padding을 제외한 packed BiGRU, 검출 좌표에만 std 0.01 잡음, 역빈도 완화형 sampling, 2층×128→3층×192 확대, blank `-0.9` 보정이다. temporal Conv, 24~48 frame 확대, 강한 개별 focus, alpha 0.75, logit ensemble은 개발 일반화가 나빠 폐기했다.
- T-89의 주요 혼동은 `ㅓ→ㅏ` 16회, `ㅈ→ㅅ` 8회, `ㅂ→ㅇ` 7회, `ㄴ→ㄹ` 6회, `ㅁ→ㅇ` 5회, `ㅏ→ㅜ` 5회다. 유사 글자는 단순 confidence 완화가 아니라 추가 시점·손가락 방향·깊이 정보와 해당 쌍의 독립 사용자 데이터가 필요하다.
- CER 5.25%는 평균 약 19문자마다 편집 오류 1개이며 문장 전체가 정확한 비율은 75.73%다. 이전 약 13문자당 1오류보다 좋아졌지만 자동 확정만으로 사용자가 수정 없이 쓰기에는 부족하다. 실제 UI에서는 temporal decoder의 안정 프레임, release, 중복 방지와 수동 수정 경로가 계속 필요하다.

### 방향·손바닥/손등·연속 입력 한계

- AIHub 라벨에는 손바닥/손등, 위/아래 반전, 카메라 회전, 거리·조명 조건이 없다. 왼손 x mirror와 손목/손 크기 정규화는 적용했지만 조건별 정답률은 **측정 불가**다. 이 회차에서 근거 없는 방향 정확도를 만들지 않았다.
- 연속 문장에는 문자별 frame boundary가 없어 CTC가 잠재 경계를 학습한다. 보고한 recall/F1은 정렬된 token 결과이며 실시간 확정률, 분당 오확정, 중복/누락 전환, p50/p95 latency를 대신하지 않는다.
- 다음 데이터는 `ㅒ`의 train/validation/test support를 반드시 만들고, 숫자 0·1·2·3·5·7·8, `ㅠ`, `ㅈ/ㅅ/ㅊ`, `ㅓ/ㅏ`를 signer 단위로 보강해야 한다. 각 문자를 손바닥/손등·상/하·좌/우·거리·조명·카메라 조건별 최소 충분 표본으로 분리 평가해야 한다.
- T-89는 운영 승격 모델이 아니다. 평균 macro-F1도 93% 미달이고 모든 문자 gate도 실패했으므로 기존 운영 TFLite/readiness와 MediaPipe 런타임을 변경하지 않았다.

## T-91~T-97 — 취약군 약한 분리 튜닝 (2026-07-22 07:29~07:40)

T-89 이후에도 물리 GPU 2만 사용했다. 같은 development set을 학습 선택에 직접 쓰지 않고 CROWD18 validation의 취약 문자만 기준으로 짧게 나눠 실행했으며, validation 최고 후보 T-91만 T-92에서 CROWD19에 고정 평가했다.

| 회차 | 문제와 적용 기술 | validation CER / macro-F1 | dev CER / macro-F1 | 판정 |
|---|---|---:|---:|---|
| T-91 | T-81에서 취약 자모 4종+숫자 9종 포함 clip 1.5배, alpha 0.5, 좌표 잡음 0.01, lr 1e-5, 2 epoch | **3.81% / 92.46%** | - | epoch 1 선택; epoch 2는 3.79%/92.29%로 균형 점수 하락 |
| T-92 | T-91 + blank `-0.9` 고정 평가 | **3.81% / 92.46%** | **5.24% / 91.71%** | 새 macro 최고지만 18 class 미달/평가 불가 |
| T-93 | 같은 취약군을 1.25배로 완화, seed 113 | 3.75% / 92.29% | - | CER만 낮고 `macroF1-CER` 하락, 폐기 |
| T-94 | 취약 자모 `ㅈ·ㅊ·ㅍ·ㅠ`만 1.5배 | 3.86% / 92.34% | - | 폐기 |
| T-95 | 취약 숫자 `0·1·2·3·4·6·7·8·9`만 1.5배 | 3.80% / 92.34% | - | 폐기 |
| T-96 | T-91 blank `-0.6` | 3.82% / 92.37% | - | T-92보다 낮아 폐기 |
| T-97 | T-91 blank `-1.2` | 3.82% / 92.42% | - | T-92보다 균형 점수 낮아 폐기 |

### T-92 현재 문자별 결과

`recall`이 현재 문자별 정확도다. 수치 gate는 recall과 F1이 모두 93% 이상일 때만 통과다.

| 문자 | dev support | recall | F1 | 판정 |
|---|---:|---:|---:|---|
| ㄱ | 591 | 95.43% | 95.92% | 통과 |
| ㄴ | 603 | 97.18% | 97.50% | 통과 |
| ㄷ | 244 | 97.54% | 95.39% | 통과 |
| ㄹ | 947 | 97.78% | 97.22% | 통과 |
| ㅁ | 260 | 91.92% | 94.47% | 미달 |
| ㅂ | 214 | 92.52% | 91.88% | 미달 |
| ㅅ | 408 | 95.59% | 94.89% | 통과 |
| ㅇ | 991 | 96.87% | 96.63% | 통과 |
| ㅈ | 210 | 87.14% | 90.82% | 미달 |
| ㅊ | 109 | 88.99% | 91.51% | 미달 |
| ㅋ | 5 | 100.00% | 100.00% | 통과* |
| ㅌ | 29 | 89.66% | 92.86% | 미달 |
| ㅍ | 46 | 93.48% | 95.56% | 통과 |
| ㅎ | 168 | 97.02% | 97.02% | 통과 |
| ㅏ | 602 | 95.02% | 95.17% | 통과 |
| ㅑ | 29 | 96.55% | 93.33% | 통과* |
| ㅓ | 315 | 91.43% | 93.66% | 미달 |
| ㅕ | 127 | 93.70% | 92.25% | 미달 |
| ㅗ | 915 | 99.02% | 98.96% | 통과 |
| ㅛ | 27 | 96.30% | 98.11% | 통과* |
| ㅜ | 386 | 97.41% | 95.92% | 통과 |
| ㅠ | 13 | 76.92% | 86.96% | 미달 |
| ㅡ | 88 | 95.45% | 96.00% | 통과 |
| ㅣ | 432 | 95.60% | 95.93% | 통과 |
| ㅐ | 172 | 93.60% | 93.06% | 통과 |
| ㅒ | 0 | 0.00% | 0.00% | 평가 불가 |
| ㅔ | 18 | 94.44% | 94.44% | 통과* |
| ㅖ | 27 | 92.59% | 94.34% | 미달 |
| ㅢ | 21 | 95.24% | 97.56% | 통과* |
| ㅚ | 21 | 100.00% | 100.00% | 통과* |
| ㅟ | 13 | 100.00% | 100.00% | 통과* |
| 0 | 29 | 72.41% | 80.77% | 미달 |
| 1 | 58 | 93.10% | 91.53% | 미달 |
| 2 | 36 | 86.11% | 89.86% | 미달 |
| 3 | 32 | 87.50% | 88.89% | 미달 |
| 4 | 30 | 93.33% | 91.80% | 미달 |
| 5 | 32 | 90.62% | 93.55% | 미달 |
| 6 | 22 | 100.00% | 93.62% | 통과* |
| 7 | 17 | 82.35% | 84.85% | 미달 |
| 8 | 17 | 88.24% | 90.91% | 미달 |
| 9 | 16 | 93.75% | 96.77% | 통과* |

`*`는 support 30 미만이라 수치 gate는 통과했어도 일반화 인증 표본으로 부족하다. 41개 중 23개가 수치 gate 통과, 17개 미달, `ㅒ` 1개 평가 불가다.

### T-91 효과와 최종 판단

- T-89→T-92: CER `5.2524%→5.2404%`(-0.0120%p), micro recall `95.5889%→95.6010%`(+0.0121%p), macro-F1 `91.6887%→91.7051%`(+0.0164%p)지만 문장 완전일치는 `75.7301%→75.5287%`(-0.2014%p)다. 약한 혼합 재가중은 문자 균형을 아주 조금 개선했으나 문장 단위 UX를 개선했다고 볼 정도는 아니다.
- 주요 혼동은 `ㅓ→ㅏ` 16회, `ㅈ→ㅅ` 8회, `ㅂ→ㅇ` 6회, `ㄴ→ㄹ` 5회, `ㅁ→ㅇ` 5회다. 재가중만으로 유사 손모양을 분리하는 한계가 다시 확인됐다.
- 최종 checkpoint는 `models/continuous-ctc-t91/best.pt`, SHA-256 `04A65A0F77958722A4BD3401AC1F91FEF0A99AB19DFD7A0BA2FA63FB612E98E7`, decoder blank bias `-0.9`다. 이 결과도 운영 승격 조건을 충족하지 않는다.
- 다음 개선은 같은 split 반복 튜닝이 아니라 `ㅒ`, 실패 숫자, `ㅈ/ㅅ/ㅊ`, `ㅓ/ㅏ`, `ㅁ/ㅂ/ㅇ`의 새 signer 데이터와 손바닥/손등·상/하·회전·거리·조명 라벨을 확보한 뒤 locked final test에서 다시 측정해야 한다.

## T-98~T-106 — AIHub 재개 실험 기록 (2026-07-22)

이 구간도 기존과 같은 AIHub 103 compact signer split을 썼다. train은 signer 01~17의 16,873 clip, selection validation은 signer 18의 993 clip이다. CROWD19는 development 진단용이며 최종 잠금 시험이 아니다. 모든 실제 학습은 `CUDA_VISIBLE_DEVICES=2`(물리 GPU 2, 프로세스 내부 표기는 `cuda:0`)에서 실행했다. 목표는 전체 평균이 아니라 **support가 있는 각 문자 recall 93% 이상**이다.

### 실험 해석 원칙

- `운영 후보 제외`는 해당 checkpoint를 현재 선택 모델로 쓰지 않는다는 뜻일 뿐, 회차 자체를 삭제하거나 무의미하다고 취급하지 않는다.
- class-floor가 악화한 회차도 입력 표현·잡음 보강·배치·깊이처럼 **어떤 원인이 성능을 떨어뜨렸는지 분리하는 반증 근거**로 계속 보존한다. 다음 가설은 이 반증을 피하도록 설계한다.
- macro-F1/CER이 개선됐더라도 문자별 93% 미달 수가 늘면 운영 선택에서는 회귀다. 다만 어떤 문자가 새로 악화·개선됐는지는 데이터 보강 및 후속 모델 설계의 근거로 기록한다.

| 회차 | 실제 실행/목적 | selection validation 실측 | 판단 |
|---|---|---:|---|
| T-98 | full corpus, delta feature, scratch 12 epoch | CER 6.77%, macro-F1 84.76% | T-91보다 크게 후퇴. 후보 제외. |
| T-100 | 숫자 중심 scratch 12 epoch | 최고 E11: CER 7.02%, macro-F1 88.15% | 숫자 단독 재시작은 기준선보다 낮음. |
| T-101 | T-100 warm start, 숫자 가중 4 epoch | 최고 E3: CER 6.28%, macro-F1 89.78% | T-100 대비 개선됐지만 93% 문자 gate 근거 없음. |
| T-102 | T-101의 CROWD19 development 진단 | 별도 development 평가 | 같은 development set을 선택에 반복 사용하지 않도록 진단 전용으로 제한. |
| T-103~T-105 | 문자 가중 재개 사전검증 | 학습 epoch 없음 | runtime focus vocabulary가 feature metadata의 `NUM_0`~`NUM_9`와 불일치하여 `NUM_7/8/9`를 unknown으로 거부. 성능 회차로 집계하지 않음. |
| T-106 | vocabulary 가중을 잠시 제거한 full-corpus baseline, balanced sampler alpha 0.5, coordinate noise 0.002, scratch 20 epoch | 최종 E20: **CER 5.61%, macro-F1 90.09%**, selection score 84.39% | 실제 학습은 정상 완료했으나 T-91 selection 최고와 문자별 93% 목표에 미달. 배포 후보 아님. |
| T-107 | T-106 warm start, 숫자·취약 자모 14종 1.5배 focus, alpha 0.5, coordinate noise 0.002, 8 epoch | **CER 5.11%, macro-F1 91.47%, macro recall 90.96%, exact 72.51%** | T-106보다 개선됐지만 17개 문자가 recall 93% 미달. 배포 후보 아님. |
| T-108 | T-107 warm start, T-107 미달 17종 1.35배 focus, alpha 0.5, coordinate noise 0.002, 6 epoch | CER 4.99%, macro-F1 91.46%, macro recall 91.06%, exact 73.01% | CER/exact은 미세 개선됐지만 macro-F1은 -0.01%p, 미달 문자는 17→18로 증가. T-107 유지. |
| T-109 | T-107 warm start, 18종 1.2배 약한 focus, alpha 0.5, coordinate noise 0.002, 4 epoch | CER 5.05%, macro-F1 91.46%, macro recall 91.04%, exact 72.71% | T-108보다도 낮고 class floor 18개 미달 유지. T-107 유지, 동일 split 가중치 미세조정 중단. |
| T-110 | temporal conv + delta feature scratch 16 epoch, alpha 0.5, coordinate noise 0.002 | CER 6.29%, macro-F1 88.79%, macro recall 87.58%, exact 67.27% | 구조 변경이 현재 데이터/설정에서 크게 후퇴. 21개 문자 미달. 폐기. |
| T-111 | temporal conv only scratch 16 epoch, alpha 0.5, coordinate noise 0.002 | CER 5.65%, macro-F1 90.55%, macro recall 90.07%, exact 68.88% | T-110보다 낫지만 T-107보다 낮고 21개 문자 미달. temporal conv 단독도 폐기. |
| T-112 | wider 3-layer BiGRU scratch, batch 72, alpha 0.5, coordinate noise 0.002 | **CER 4.26%, macro-F1 91.70%, macro recall 91.30%, exact 76.74%** | T-107 대비 문자 미달 17→13으로 감소. 후보 승격, 다만 hidden/layer/batch 동시 변경 교란 주의. |
| T-113 | T-112 구조에서 batch만 96으로 변경 | CER 4.59%, macro-F1 91.28%, macro recall 91.16%, exact 74.92% | class-floor 미달 13→17로 회귀. T-112 batch 72 유지. |
| T-114 | T-112 구조에서 coordinate noise만 0.005로 변경 | CER 4.63%, macro-F1 91.13%, macro recall 90.49%, exact 75.33% | class-floor 미달 13→15로 회귀. T-112 noise 0.002 유지. |
| T-115 | T-112 구조에서 coordinate noise만 0으로 변경 | CER 4.62%, macro-F1 91.55%, macro recall 91.08%, exact 75.23% | class-floor 미달 13→14로 회귀. T-112 noise 0.002 유지. |
| T-116 | T-112 구조에서 delta landmark feature만 추가 | CER 4.52%, macro-F1 90.12%, macro recall 89.60%, exact 75.33% | class-floor 미달 13→17로 회귀. delta-only 폐기. |
| T-117 | T-112 구조에서 BiGRU layer만 3→2로 변경 | CER 5.07%, macro-F1 90.99%, macro recall 90.87%, exact 72.81% | class-floor 미달 13→15로 회귀. 3-layer가 필요한 반증을 확보. |
| T-118 | T-112 구조에서 BiGRU hidden width만 192→128로 변경 | CER 5.27%, macro-F1 90.20%, macro recall 90.12%, exact 69.89% | class-floor 미달 13→18로 회귀. width 192가 필요한 반증을 확보. |
| T-119 | T-112 구조에서 learning rate만 1e-3→5e-4로 변경 | CER 5.15%, macro-F1 90.50%, macro recall 90.45%, exact 71.50% | class-floor 미달 13→19로 회귀. 현재 epoch 예산에서는 1e-3가 필요하다는 근거. |
| T-120 | T-112 구조에서 CTC blank bias만 0→-0.9로 변경 | CER 4.27%, macro-F1 91.69%, macro recall 91.41%, exact 76.44% | 평균은 근접했으나 class-floor 미달 13→14. decoder calibration의 trade-off를 확인. |
| T-121 | T-112 구조에서 CTC blank bias만 0→-0.3로 변경 | CER 4.28%, macro-F1 91.61%, macro recall 91.24%, exact 76.54% | T-120보다 약간 안정적이나 class-floor 미달 14 유지. blank-bias tuning 종료. |
| T-122 | T-112 취약 13 class에 focus multiplier 1.25 적용 | CER 4.69%, macro-F1 91.68%, macro recall 91.25%, exact 73.41% | class-floor 미달 13→16. 동일 split의 단순 loss reweighting은 역효과. |

### T-106 상세

- 실행 계약: `train_aihub_sequence_ctc_t23.py`, batch 96, lr `1e-3`, GRU hidden 128 / 2 layer, temporal conv 미사용, delta feature 미사용, `--skip-test`.
- E20의 원본 report 값은 validation CER `0.0561433`, macro-F1 `0.9009302`, selection score `0.8439497`이다. `testClips=0`, `goalPassed=false`이며, 따라서 CROWD19/최종 시험 성능이나 문자별 93% 달성을 주장할 수 없다.
- 개선 시도는 sampler와 작은 좌표 잡음으로 signer·프레임 변화에 덜 의존하게 만드는 것이었다. T-98 대비 macro-F1은 약 +5.34%p 올랐지만, T-91의 선택 최고 macro-F1 92.46%보다 낮다. 이 결과는 재개 환경에서의 정상 실행 기준선일 뿐 성능 개선 증명은 아니다.
- 유사 손모양 문자 분리는 아직 class-level confusion으로 재측정해야 한다. 이번 report는 selection 요약만 생성했고, 손바닥/손등·상/하·회전·거리·조명 라벨이 데이터에 없으므로 해당 조건의 인식률을 만들지 않았다. MediaPipe 좌표 정규화·좌우 mirror 계약은 유지되지만 방향별 정확도는 여전히 측정 불가다.

### 다음 결정

1. 다음 학습 전 `--focus-classes`가 사용하는 runtime vocabulary와 NPZ `class_names`를 한 글자 단위로 대조해 `NUM_7/8/9` 거부 원인을 수정한다. feature metadata에 세 클래스가 보인다는 사실과 runtime 검증 실패는 별개이므로, 없는 데이터라고 단정하지 않는다.
2. 수정 후에는 T-106 checkpoint를 시작점으로 사용하되, CROWD18에서 **실제 93% 미달 문자만** 재가중한다. 실행 전 class 사전·checkpoint output dimension·feature class order를 검사하고, 통과할 때만 GPU 2에서 시작한다.
3. 회차가 끝날 때마다 per-class recall/F1, support, top confusion을 이 문서에 추가한다. CROWD19는 후보가 고정된 뒤 한 번의 development 진단으로만 사용하고, 운영 승격은 별도 untouched final set이 필요하다.

### T-107 — class-name 정규화 후 문자 가중 재개

- 사전 수정: runtime feature class name에 섞인 앞뒤 공백 때문에 `NUM_7/8/9`가 unknown으로 거부될 수 있던 경로를, class name과 `--focus-classes` 모두 `strip()` 정규화하도록 T-107 실행본에서 보정했다. 이 보정 후 `NUM_0`~`NUM_9`를 포함한 14개 focus class 검증과 학습이 실제로 완료됐다. target index 및 class order는 바꾸지 않았다.
- 실행 계약: T-106 `best.pt` warm start, 8 epoch, batch 96, lr `1e-5`, focus multiplier 1.5, balanced sampler alpha 0.5, coordinate noise 0.002, GPU 2. validation은 signer 18의 993 clip이며 test는 실행하지 않았다 (`testClips=0`).
- 실측: character error rate `5.1094%`, sequence exact match `72.5076%`, micro token recall `95.3955%`, macro recall `90.9616%`, macro-F1 `91.4726%`; `goalPassed=false`. T-106 최종 대비 CER은 **5.61%→5.11% (-0.50%p)**, macro-F1은 **90.09%→91.47% (+1.38%p)** 이다.
- 93% recall 미달/평가 불가 목록: `ㅁ, ㅅ, ㅈ, ㅊ, ㅌ, ㅍ, ㅠ, ㅒ, NUM_0, NUM_1, NUM_2, NUM_3, NUM_4, NUM_6, NUM_7, NUM_8, NUM_9` (17 class). 따라서 평균 개선만으로 목표 달성으로 판정하지 않는다.
- 혼동 분석은 이번 report의 `topSubstitutions` 원본과 per-class support/recall을 다음 회차 시작 전 분해해, 단순 가중의 효과가 낮은 유사 손모양 쌍을 확정한다. 현재 이 문서에 수치가 없는 개별 substitution을 추정해 쓰지 않는다.

### T-108 — class-floor 집합 재가중의 회귀

- 실행 계약: T-107 `best.pt` warm start, GPU 2, 6 epoch, lr `5e-6`, 17개 미달 class focus multiplier 1.35, balanced sampler alpha 0.5, coordinate noise 0.002, signer 18 validation 993 clip, test 생략.
- 실측: CER `4.9892%`, exact match `73.0111%`, micro recall `95.5278%`, macro recall `91.0582%`, macro-F1 `91.4639%`, `goalPassed=false`.
- T-107 대비 CER은 -0.12%p, exact match는 +0.50%p였지만 macro-F1은 `91.4726%→91.4639%`로 하락했고, recall 93% 미달은 17개에서 18개로 늘었다. 새 미달은 `ㅔ`이며 나머지는 `ㅁ·ㅅ·ㅈ·ㅊ·ㅌ·ㅍ·ㅠ·ㅒ`와 `NUM_0/1/2/3/4/6/7/8/9`다.
- 결론: 목표인 class floor 기준에서는 회귀다. T-108 checkpoint는 다음 warm start로 선택하지 않고 T-107 checkpoint를 유지한다. 다음 실험은 18개 집합을 더 약하게 가중해 `ㅔ` 회귀를 막는지 검증하되, 지표가 다시 악화하면 동일 split의 가중치 미세조정을 중단하고 새 signer/조건 데이터 보강으로 전환한다.

### T-109 — 약한 class-focus 재검증

- 실행 계약: T-107 `best.pt` warm start, GPU 2, 4 epoch, lr `3e-6`, T-108의 18개 미달 class focus multiplier 1.2, balanced sampler alpha 0.5, coordinate noise 0.002, signer 18 validation 993 clip, test 생략.
- 실측: CER `5.0493%`, exact match `72.7090%`, micro recall `95.4677%`, macro recall `91.0357%`, macro-F1 `91.4601%`, 18 class가 recall 93% 미달, `goalPassed=false`.
- 판정: T-107의 macro-F1 `91.4726%`보다 낮고 T-108의 class-floor 회귀도 해소하지 못했다. 두 단계의 가중치(1.35, 1.2)가 모두 class floor를 개선하지 못했으므로, 이 signer-18 split에서 focus multiplier만 계속 미세조정하는 것은 중단한다. 선택 checkpoint는 T-107로 유지한다.
- 다음 기술 결정: 새 회차는 class reweighting이 아니라 시간 문맥 구조(temporal convolution)와 입력 표현(delta feature)의 **별도 scratch baseline**을, 동일 데이터·split·GPU 2에서 검증한다. 기존 warm checkpoint와 구조가 달라 checkpoint를 섞지 않으며, 결과도 문자별 93% floor로만 채택한다.

### T-110 — temporal convolution + delta scratch baseline

- 실행 계약: GPU 2, scratch 16 epoch, batch 96, lr `1e-3`, delta feature와 temporal convolution 동시 사용, balanced sampler alpha 0.5, coordinate noise 0.002, focus class 없음, signer 18 validation 993 clip, test 생략.
- 실측: CER `6.2876%`, exact match `67.2709%`, micro recall `94.1572%`, macro recall `87.5825%`, macro-F1 `88.7926%`, 21 class가 recall 93% 미달, `goalPassed=false`.
- 판정: T-107 대비 CER +1.18%p, macro-F1 -2.68%p, 문자 미달 +4개로 크게 후퇴했다. temporal convolution과 delta feature를 동시에 넣은 scratch 구조는 현재 compact MediaPipe feature와 hyperparameter에서 채택하지 않는다. T-107이 계속 선택 checkpoint다.

### T-111 — temporal convolution only scratch baseline

- 실행 계약: GPU 2, scratch 16 epoch, batch 96, lr `1e-3`, temporal convolution만 사용하고 delta feature는 미사용, balanced sampler alpha 0.5, coordinate noise 0.002, signer 18 validation 993 clip, test 생략.
- 실측: CER `5.6504%`, exact match `68.8822%`, micro recall `94.9146%`, macro recall `90.0658%`, macro-F1 `90.5514%`, 21 class가 recall 93% 미달, `goalPassed=false`.
- 판정: T-110보다 개선됐으나 T-107 macro-F1 `91.4726%`보다 -0.92%p 낮고 문자 floor도 21개 미달이다. temporal convolution 단독도 현재 설정에서는 채택하지 않으며 T-107을 선택 checkpoint로 유지한다.

### T-112 — wider 3-layer BiGRU scratch

- 실행 계약: GPU 2, scratch 16 epoch, feature delta/temporal convolution 미사용, BiGRU hidden size 192·3 layer, batch 72, lr `1e-3`, balanced sampler alpha 0.5, coordinate noise 0.002, signer 18 validation 993 clip, test 생략.
- 실측: CER `4.2558%`, sequence exact match `76.7372%`, micro recall `96.1770%`, macro recall `91.3010%`, macro-F1 `91.7019%`, `goalPassed=false`.
- 문자 floor: 93% recall 미달은 T-107의 17개에서 **13개**로 줄었다. 남은 미달은 `ㅈ·ㅊ·ㅍ·ㅠ·ㅒ·ㅔ·NUM_0·NUM_1·NUM_2·NUM_3·NUM_4·NUM_6·NUM_8`다. `ㅁ·ㅅ·ㅌ·NUM_7·NUM_9`는 T-107 미달 목록에서 빠졌다.
- 판정: T-107 대비 CER `5.1094%→4.2558%`(-0.85%p), macro-F1 `91.4726%→91.7019%`(+0.23%p), class-floor 미달 `17→13`으로 개선됐다. T-112를 새 선택 후보로 승격한다. 단, hidden size·layer 수·batch size가 동시에 변경돼 정확한 개선 원인은 분리할 수 없다. 다음 실험은 이 checkpoint에서 추가 하이퍼파라미터를 바꾸지 않고, 남은 13개 문자에 대한 support·top confusion을 먼저 분석한다.

### T-113 사전 가설 — T-112 batch-size 분리 검증

- 근거: T-112는 13개 class floor 미달로 T-107보다 개선됐지만, GRU hidden size·layer 수와 batch size가 동시에 변경됐다. 현재 미달군은 `ㅈ·ㅊ·ㅍ·ㅠ·ㅒ·ㅔ·NUM_0/1/2/3/4/6/8`이다.
- 변경은 **batch size만 `72→96`**으로 한다. feature, train/validation signer split, 192 hidden/3 layer BiGRU, lr, sampler, coordinate noise, GPU 2, epoch 수는 T-112와 동일하게 고정한다.
- 가설: larger batch가 일반화에 유리하면 class-floor 미달이 13개 미만으로 줄고, 불리하면 T-112 batch 72를 유지한다. CER·macro-F1만 좋아져도 13개 이상이면 회귀로 판정한다.

### T-113 — batch 96 분리 검증 결과

- 실행 계약: T-112와 같은 192 hidden/3 layer BiGRU, train/validation signer split, lr, sampler, coordinate noise, GPU 2, 16 epoch을 유지하고 **batch size만 72→96**으로 변경했다.
- 실측: CER `4.5925%`, sequence exact match `74.9245%`, micro recall `95.8163%`, macro recall `91.1571%`, macro-F1 `91.2831%`, 93% recall 미달 17 class, `goalPassed=false`.
- 판정: T-112 대비 CER +0.34%p, macro-F1 -0.42%p, class-floor 미달 13→17로 모두 회귀했다. 따라서 T-112의 개선에는 batch 72 조건이 기여했을 가능성이 높으며, 선택 checkpoint는 계속 T-112 `best.pt`다. 같은 구조에서 batch를 다시 탐색하지 않는다.

### T-114 사전 가설 — landmark coordinate-noise 단일 검증

- 근거: T-112 선택 조합은 남은 13개 미달(`ㅈ·ㅊ·ㅍ·ㅠ·ㅒ·ㅔ·NUM_0/1/2/3/4/6/8`)이 MediaPipe landmark의 작은 프레임별 위치 차이에 민감할 수 있다. T-112는 coordinate noise `0.002`를 사용했다.
- 변경은 **coordinate noise std만 `0.002→0.005`**로 한다. 192 hidden/3 layer BiGRU, batch 72, lr, signer split, sampler, epoch 수, GPU 2를 모두 T-112와 동일하게 고정한다.
- 가설: 현실적인 landmark jitter를 더 반영하면 signer 일반화가 좋아져 class-floor 미달이 13개 미만으로 감소한다. 13개 이상이면 회귀로 폐기하고 T-112를 유지한다.

### T-114 — coordinate-noise 0.005 검증 결과

- 실행 계약: T-112와 같은 192 hidden/3 layer BiGRU, batch 72, lr, signer split, sampler, GPU 2, 16 epoch을 유지하고 **coordinate noise std만 `0.002→0.005`**로 변경했다.
- 실측: CER `4.6285%`, sequence exact match `75.3273%`, micro recall `95.8644%`, macro recall `90.4936%`, macro-F1 `91.1263%`, 93% recall 미달 15 class, `goalPassed=false`.
- 미달 문자: `ㅈ·ㅍ·ㅠ·ㅒ·ㅔ·NUM_0·NUM_1·NUM_2·NUM_3·NUM_4·NUM_5·NUM_6·NUM_7·NUM_8·NUM_9`. T-112에서 통과했던 `ㅊ`은 유지됐지만 `NUM_5·NUM_7·NUM_9`가 새로 미달해 총 목표는 후퇴했다.
- 판정: T-112 대비 CER +0.37%p, macro-F1 -0.58%p, class-floor 미달 `13→15`로 회귀했다. 현재 feature에서 noise 0.005는 과도한 augmentation으로 판단해 폐기하며, 선택 checkpoint는 T-112 `best.pt`를 유지한다. report의 top substitution/support 상세가 전개되지 않아 특정 손모양 혼동쌍은 추정하지 않는다.

### T-115 사전 가설 — coordinate-noise 제거 단일 검증

- 근거: 같은 T-112 기준에서 noise를 0.005로 높인 T-114는 후퇴했다. 이는 landmark jitter 보강이 필요한지 자체를 분리해 확인할 필요가 있음을 뜻한다.
- 변경은 **coordinate noise std만 `0.002→0.000`**으로 한다. 192 hidden/3 layer BiGRU, batch 72, lr, signer split, sampler, epoch 수, GPU 2를 모두 T-112와 동일하게 고정한다.
- 가설: compact signer split의 정확한 static landmark 형태를 보존하면 특히 숫자 클래스의 분산을 줄여 class-floor 미달이 13개 미만으로 감소한다. 13개 이상이면 augmentation 제거도 폐기하고 T-112 noise 0.002를 유지한다.

### T-115 — coordinate-noise 제거 검증 결과

- 실행 계약: T-112와 같은 192 hidden/3 layer BiGRU, batch 72, lr, signer split, sampler, GPU 2, 16 epoch을 유지하고 **coordinate noise std만 `0.002→0.000`**으로 변경했다.
- 실측: CER `4.6165%`, sequence exact match `75.2266%`, micro recall `96.0327%`, macro recall `91.0759%`, macro-F1 `91.5468%`, 93% recall 미달 14 class, `goalPassed=false`.
- 문자별 근거: support 210의 `ㅈ` recall은 86.67%, `ㅔ`는 support 18/77.78%, `NUM_2`는 support 36/77.78%, `NUM_8`은 support 17/76.47%로 특히 낮다. `ㅒ`는 validation support가 0이므로 이 split에서 93% 충족 여부를 평가할 수 없다. `ㅊ·ㅠ·ㅟ·NUM_7`은 표본이 각각 109·13·13·17개라 93% 경계 근처의 단일 표본 차이에 민감하다.
- 판정: T-112 대비 CER +0.36%p, macro-F1 -0.16%p, class-floor 미달 `13→14`로 회귀했다. 무잡음도 폐기하고 선택 checkpoint/잡음값은 T-112 `best.pt`, `0.002`를 유지한다. `topSubstitutions`는 원본 report에 존재하지만 세부 원소가 이 회차 UI에서 전개되지 않아 특정 오인식 쌍을 추정하지 않는다.

### T-116 사전 가설 — delta landmark feature 단일 검증

- 근거: T-110은 temporal convolution과 delta feature를 동시에 넣어 후퇴했고, T-111은 temporal convolution만 넣어 후퇴했다. 두 결과만으로 **delta feature 단독**의 효과는 분리되지 않았다. 남은 주요 미달 `ㅈ·ㅔ·NUM_2·NUM_8`은 프레임 간 손가락 이동량이 보조 단서가 될 가능성이 있다.
- 변경은 **`--use-delta-features`만 활성화**한다. T-112의 192 hidden/3 layer BiGRU, batch 72, lr, coordinate noise 0.002, sampler, signer split, epoch 수, GPU 2는 고정한다. 입력 차원이 달라 checkpoint는 사용하지 않고 scratch로 학습한다.
- 가설: 위치 좌표와 프레임 간 변화량을 함께 쓰면 CTC 정렬과 유사 손모양 전환 구분이 개선되어 class-floor 미달이 13개 미만으로 감소한다. 13개 이상이면 delta-only도 폐기하고 T-112를 유지한다.

### T-116 — delta landmark feature 단독 검증 결과

- 실행 계약: temporal convolution 없이 `--use-delta-features`만 활성화하고, T-112의 192 hidden/3 layer BiGRU, batch 72, lr, coordinate noise 0.002, sampler, signer split, GPU 2, 16 epoch을 유지했다. 입력 차원이 달라 scratch 학습했으며 checkpoint는 섞지 않았다.
- 실측: CER `4.5203%`, sequence exact match `75.3273%`, micro recall `95.8884%`, macro recall `89.6045%`, macro-F1 `90.1226%`, 93% recall 미달 17 class, `goalPassed=false`.
- 미달 변화: `ㅅ·ㅓ·NUM_6`가 새로 미달했고, 기존 취약군 `ㅈ·ㅊ·ㅍ·ㅠ·ㅔ` 및 숫자군 다수가 남았다. `ㅒ`는 이 validation split에서 support 0이라 여전히 평가 불가다.
- 판정: T-112 대비 CER은 -0.26%p로 작게 낮았지만, macro-F1은 -1.58%p, class-floor 미달은 `13→17`로 크게 늘었다. 문자별 93% 기준에서는 명백한 회귀이므로 delta-only는 폐기하고 T-112 입력 표현을 유지한다.

### T-117 사전 가설 — BiGRU layer 수 단일 검증

- 근거: T-112의 개선은 hidden size·layer 수·batch가 함께 달라 시작했으며, T-113으로 batch 72의 필요성만 분리했다. T-116은 입력 확장도 후퇴했으므로, 다음에는 원래 landmark 표현을 유지한 채 순환층 깊이만 분리한다.
- 변경은 **BiGRU layer 수만 `3→2`**로 한다. hidden size 192, batch 72, lr, coordinate noise 0.002, sampler, signer split, epoch 수, GPU 2는 T-112와 동일하게 고정하며 scratch로 학습한다.
- 가설: 한 층을 줄여 과도한 시간 문맥 적합을 완화하면 validation signer의 정적 지문자 class floor가 13개 미만으로 감소한다. 13개 이상이면 3-layer T-112를 유지한다.

### T-117 — BiGRU 2-layer 분리 검증 결과

- 실행 계약: T-112와 같은 hidden size 192, batch 72, lr, coordinate noise 0.002, sampler, landmark 입력, signer split, GPU 2, 16 epoch을 유지하고 **BiGRU layer만 `3→2`**로 변경해 scratch 학습했다.
- 실측: CER `5.0733%`, sequence exact match `72.8097%`, micro recall `95.5518%`, macro recall `90.8697%`, macro-F1 `90.9880%`, 93% recall 미달 15 class, `goalPassed=false`.
- 진단 가치: `ㅌ·ㅕ·ㅟ`가 T-112 대비 새로 미달했고, `NUM_6·NUM_7`은 미달 목록에서 빠졌다. 전체적으로는 문자 floor가 `13→15`로 나빠졌지만, 이 차이는 3-layer가 여러 자모의 연속 문맥 유지에 기여한다는 반증 근거다. 숫자 6/7의 개선만을 근거로 2-layer를 선택하지 않는다.
- 운영 선택: 현재 checkpoint 후보로는 제외하고 T-112의 3-layer를 유지한다. 그러나 **2-layer 결과는 보존**하며, 이후 숫자 데이터 보강 또는 decoder 보정 시 숫자 6/7 진단 기준으로 다시 사용한다.

### T-118 사전 가설 — BiGRU hidden width 단일 검증

- 근거: T-117으로 batch 72 조건에서 3-layer가 2-layer보다 낫다는 점을 분리했다. T-112의 hidden width 192가 필요한지는 아직 분리되지 않았다.
- 변경은 **hidden size만 `192→128`**으로 한다. 3-layer, batch 72, lr, coordinate noise 0.002, sampler, landmark 입력, signer split, epoch 수, GPU 2는 T-112와 동일하게 고정하며 scratch로 학습한다.
- 가설: 폭을 줄이면 과적합을 완화해 class-floor 미달이 13개 미만으로 감소할 수 있다. 그렇지 않으면 현재 데이터에서 192 width의 필요성을 반증과 함께 확정한다.

### T-118 — BiGRU hidden width 128 분리 검증 결과

- 실행 계약: T-112와 같은 3-layer BiGRU, batch 72, lr, coordinate noise 0.002, sampler, landmark 입력, signer split, GPU 2, 16 epoch을 유지하고 **hidden size만 `192→128`**으로 변경해 scratch 학습했다.
- 실측: CER `5.2657%`, sequence exact match `69.8892%`, micro recall `95.2994%`, macro recall `90.1170%`, macro-F1 `90.1970%`, 93% recall 미달 18 class, `goalPassed=false`.
- 진단 가치: `ㅂ·ㅓ·ㅕ`가 새로 미달하고 자모·숫자 미달군이 넓어졌다. 192 width가 단순히 계산량을 늘린 것이 아니라 현재 AIHub sequence에서 손가락 조합과 시간 문맥을 보존하는 데 필요하다는 반증을 얻었다.
- 운영 선택: class-floor `13→18`, exact match -6.85%p로 현재 후보에서 제외한다. 다만 T-117의 layer 실험과 함께, 선택 기준 구조를 **192 hidden / 3 layer / batch 72**로 고정할 근거가 되므로 기록을 유지한다.

### T-119 사전 가설 — 학습률 단일 검증

- 근거: T-117과 T-118로 선택 구조의 depth·width·batch 조건을 분리했다. 이제 입력/구조를 바꾸지 않고 optimizer의 보폭만 검증한다.
- 변경은 **learning rate만 `1e-3→5e-4`**로 한다. 192 hidden/3 layer, batch 72, coordinate noise 0.002, sampler, landmark 입력, signer split, epoch 수, GPU 2는 T-112와 동일하게 고정하며 scratch로 학습한다.
- 가설: 더 작은 보폭이 signer-18 일반화를 안정화해 13개 미달 floor를 줄일 수 있다. 13개 이상이면 T-112의 `1e-3`을 유지한다.

### T-119 — learning rate 5e-4 분리 검증 결과

- 실행 계약: T-112와 같은 192 hidden/3 layer BiGRU, batch 72, coordinate noise 0.002, sampler, landmark 입력, signer split, GPU 2, 16 epoch을 유지하고 **learning rate만 `1e-3→5e-4`**로 변경해 scratch 학습했다.
- 실측: CER `5.1455%`, sequence exact match `71.5005%`, micro recall `95.3955%`, macro recall `90.4522%`, macro-F1 `90.5026%`, 93% recall 미달 19 class, `goalPassed=false`.
- 진단 가치: 고정된 16 epoch 예산에서 작은 learning rate는 충분히 수렴하지 못하거나 class decision margin을 약화시켜 자모와 숫자 모두의 floor를 넓혔다. 이것은 단순히 “낮은 학습률이 나쁘다”가 아니라 현재 데이터량·epoch 예산에서는 `1e-3`이 필요한 조건이라는 재현 가능한 근거다.
- 운영 선택: 현 후보로는 제외하고 T-112의 `1e-3`을 유지한다. epoch 수를 늘린 별도 실험을 하려면 learning rate와 epoch을 동시에 바꾸지 않고, 별도의 예산 실험으로 분리해야 한다.

### T-120 사전 가설 — CTC blank bias 단일 검증

- 근거: 구조·입력·잡음·학습률의 최근 단일 검증은 모두 T-112 설정을 지지했다. 남은 개선 여지는 모델 표현보다 CTC decoder가 blank를 얼마나 선택하는지에 있을 수 있다. 과거 다른 feature split에서 negative blank bias가 유효했던 기록이 있으나, 현재 compact split에는 그대로 적용된 적이 없다.
- 변경은 **CTC blank logit bias만 `0→-0.9`**로 한다. 192 hidden/3 layer, batch 72, lr `1e-3`, coordinate noise 0.002, sampler, landmark 입력, signer split, epoch 수, GPU 2는 T-112와 동일하게 고정한다.
- 가설: blank 과다 선택으로 생기는 token deletion을 줄이면 CER과 문자 recall floor가 함께 개선될 수 있다. 13개 미만이 아니면 decoder bias도 현재 split에서 채택하지 않는다.

### T-120 — CTC blank bias -0.9 검증 결과

- 실행 계약: T-112와 같은 192 hidden/3 layer BiGRU, batch 72, lr `1e-3`, coordinate noise 0.002, sampler, landmark 입력, signer split, GPU 2, 16 epoch을 유지하고 **blank logit bias만 `0→-0.9`**로 변경했다.
- 실측: CER `4.2679%`, sequence exact match `76.4350%`, micro recall `96.3092%`, macro recall `91.4080%`, macro-F1 `91.6923%`, 93% recall 미달 14 class, `goalPassed=false`.
- 진단 가치: T-112 대비 micro recall은 +0.13%p, macro recall은 +0.11%p로 올라 blank 억제가 일부 누락을 줄인 신호가 있다. 그러나 CER +0.01%p, macro-F1 -0.01%p, floor `13→14`로 운영 선택 기준은 통과하지 못했다. `NUM_7·NUM_9`는 미달에서 벗어난 반면 `NUM_5`가 새로 미달해 decoder가 숫자 분포를 바꾸는 trade-off도 확인됐다.
- 운영 선택: T-112의 bias 0을 유지한다. 다만 negative blank bias가 평균 recall을 올린 것은 유의미하므로, 같은 구조에서 약한 보정값을 단일 회차로 확인할 가치가 있다.

### T-121 사전 가설 — 약한 CTC blank bias 단일 검증

- 근거: T-120의 -0.9은 문자 floor를 한 개 늘렸지만 micro/macro recall은 소폭 개선했다. 즉 blank 보정 방향 자체보다 강도가 과했을 가능성이 있다.
- 변경은 **blank logit bias만 `0→-0.3`**으로 한다. 192 hidden/3 layer, batch 72, lr `1e-3`, coordinate noise 0.002, sampler, landmark 입력, signer split, epoch 수, GPU 2는 T-112와 동일하게 고정한다.
- 가설: 약한 bias가 token 누락 감소는 일부 유지하면서 T-120의 숫자 class trade-off를 줄여 13개 미만의 floor를 만들 수 있다. 13개 이상이면 현재 compact split의 blank-bias tuning은 중단한다.

### T-121 — CTC blank bias -0.3 검증 결과

- 실행 계약: T-112와 같은 192 hidden/3 layer BiGRU, batch 72, lr `1e-3`, coordinate noise 0.002, sampler, landmark 입력, signer split, GPU 2, 16 epoch을 유지하고 **blank logit bias만 `0→-0.3`**으로 변경했다.
- 실측: CER `4.2799%`, sequence exact match `76.5358%`, micro recall `96.2010%`, macro recall `91.2429%`, macro-F1 `91.6139%`, 93% recall 미달 14 class, `goalPassed=false`.
- 진단 가치: -0.9 대비 CER은 +0.01%p, exact match는 +0.10%p로 더 안정적이었지만 floor는 동일한 14개였다. 두 bias 모두 `NUM_5`를 새 미달로 만들고 `NUM_7·NUM_9`는 통과시켰다. 즉 현재 split에서는 blank bias가 숫자 문자 간 결정 경계를 이동시키지만 93% floor 전체를 개선하지 못한다.
- 운영 선택: 현재 후보는 T-112 bias 0으로 유지한다. `0, -0.3, -0.9`을 확인했으므로, 추가 blank-bias 미세 탐색은 중단하고 취약 문자 자체를 겨냥한 loss reweighting으로 전환한다.

### T-122 사전 가설 — T-112 취약 문자 loss reweighting

- 근거: 선택 모델 T-112의 13개 미달은 `ㅈ·ㅊ·ㅍ·ㅠ·ㅒ·ㅔ·NUM_0·NUM_1·NUM_2·NUM_3·NUM_4·NUM_6·NUM_8`이다. T-115의 per-class 측정에서도 `ㅈ·ㅔ·NUM_2·NUM_8`은 특히 낮았고, 구조/입력/decoder 단일 검증은 이 floor를 줄이지 못했다.
- 변경은 **이 13개 class에만 focus multiplier `1.25`를 적용하는 class-weighted loss intervention**이다. T-112의 192 hidden/3 layer, batch 72, lr `1e-3`, coordinate noise 0.002, sampler, landmark 입력, signer split, epoch 수, GPU 2는 고정하고 scratch로 학습한다. class-name은 공백 정규화된 runtime vocabulary와 사전 대조 후 실행한다.
- 가설: 큰 전체 구조 변경 없이 반복 오인식 문자의 gradient를 보강하면 class-floor가 13개 미만으로 줄 수 있다. 평균 지표가 좋아도 floor가 13개 이상이면 운영 후보로 선택하지 않는다.

### T-122 — 취약 문자 loss reweighting 결과

- 실행 계약: T-112와 같은 192 hidden/3 layer BiGRU, batch 72, lr `1e-3`, coordinate noise 0.002, sampler, landmark 입력, signer split, GPU 2, 16 epoch을 유지하고 13개 취약 class에만 focus multiplier `1.25`를 적용했다. 서버 runtime class-name 정규화 후 실제 실행했다.
- 실측: CER `4.6886%`, sequence exact match `73.4139%`, micro recall `95.9005%`, macro recall `91.2469%`, macro-F1 `91.6794%`, 93% recall 미달 16 class, `goalPassed=false`.
- 진단 가치: 강한 구조 변경 없이도 1.25배 reweighting이 `ㅅ·ㅟ·NUM_7·NUM_9`를 새 미달로 만들었다. 평균 macro-F1은 T-112와 가까워도 class floor가 `13→16`으로 악화될 수 있음을 확인했다. 따라서 이 split에서는 같은 취약 집합의 multiplier 미세 탐색을 반복하지 않는다.
- 운영 선택: T-112를 유지한다. 다음 개선은 가중치가 아니라 **checkpoint 선택 기준**을 문자 floor 목표와 일치시키는 것이다.

### T-123 사전 가설 — class-floor 우선 checkpoint selection

- 근거: 현재 학습 스크립트는 best checkpoint를 `validation macroF1 − CER` 최대화로 저장한다. 그러나 프로젝트의 채택 조건은 support가 있는 각 문자 recall 93%이므로, 학습 중 더 적은 미달 문자를 가진 epoch가 있어도 선택되지 않을 수 있다.
- 변경은 **checkpoint selection policy만** 바꾼다. 우선순위는 `(1) classesBelow93 개수 최소화, (2) 같은 개수면 macroF1−CER 최대화`이다. T-112의 192 hidden/3 layer, batch 72, lr `1e-3`, noise 0.002, sampler, landmark 입력, signer split, epoch 수, GPU 2는 동일하게 유지한다.
- 가설: 학습 자체를 바꾸지 않고도 서비스 목표와 맞는 epoch를 선택하면 class-floor를 13개 미만으로 줄일 수 있다. 감소하지 않더라도 기존 checkpoint policy가 목표와 불일치했다는 재현 가능한 운영 근거를 남긴다.

### T-123 — checkpoint-selection 재현 실험 결과

- 실행 계약: T-112와 같은 192 hidden/3 layer BiGRU, batch 72, lr `1e-3`, coordinate noise 0.002, sampler, landmark 입력, signer split, GPU 2, 16 epoch으로 실행했다.
- 실측: CER `4.2558%`, sequence exact match `76.7372%`, micro recall `96.1770%`, macro recall `91.3010%`, macro-F1 `91.7019%`, 93% recall 미달 13 class, `goalPassed=false`.
- 확인된 오류: report의 `checkpointSelection`은 여전히 `maximize validation macroF1 - CER`로 기록됐다. 즉, T-123은 의도한 class-floor 우선 선택기가 반영되지 않은 동일 seed·동일 조건 재현이며 T-112와 동일한 결과다. 이를 성능 향상으로 해석하지 않는다.
- 미달 문자: `ㅈ·ㅊ·ㅍ·ㅠ·ㅒ·ㅔ·NUM_0·NUM_1·NUM_2·NUM_3·NUM_4·NUM_6·NUM_8`. 대표 혼동에는 `ㅈ→ㅊ` 17회, `ㅈ→ㅉ` 8회, `ㅊ→ㅈ` 7회, `NUM_2→NUM_1` 5회가 포함된다.
- 다음 결정: 기존 T-112는 유지한다. 선택기 코드를 먼저 단위 검증하고, 그 뒤 학습 예산만 16에서 24 epoch으로 변경하는 T-124를 실행한다. T-124에서는 새 선택기 report 문자열과 저장 checkpoint를 검증한 뒤에만 결과를 채택한다.

### T-124 사전 가설 — class-floor 선택기 검증 후 학습 예산 확장

- 근거: T-123은 동일 조건 재현으로 끝났지만, 동시에 기존 선택기가 실제로 남아 있음을 발견했다. T-124는 `classesBelow93` 최소화, 동률 시 `macroF1−CER` 최대화 선택기를 코드·문법 검사로 확인했다.
- 변경은 **학습 epoch만 `16→24`**로 확장한다. T-112의 192 hidden/3 layer, batch 72, lr `1e-3`, coordinate noise 0.002, sampler, landmark 입력, signer split, GPU 2는 고정한다.
- 가설: 동일한 데이터와 구조에서 후반 epoch가 취약 문자 margin을 보완할 수 있다. 단, 24 epoch 중 class-floor가 13개 미만으로 줄지 않으면 단순 학습 연장도 중단하고 데이터 보강 또는 표적 오류 분석으로 전환한다.

### T-124 — class-floor 선택기 검증 및 24 epoch 결과

- 실행 검증: report의 `checkpointSelection`이 `minimize validation classesBelow93, then maximize macroF1 - CER`로 기록되어, T-123에서 누락된 선택기 반영을 확인했다.
- 실측: CER `3.79099%`, sequence exact match `79.55690%`, micro recall `96.50976%`, macro recall `91.60515%`, macro-F1 `92.00651%`, 93% recall 미달 16 class, `goalPassed=false`.
- class-floor: `ㅈ·ㅊ·ㅍ·ㅠ·ㅒ·ㅔ·ㅟ·NUM_0·NUM_1·NUM_2·NUM_3·NUM_4·NUM_6·NUM_7·NUM_8·NUM_9`. 대표 혼동은 `ㅈ→ㅊ` 17회, `ㅈ→ㅉ` 7회, `ㅊ→ㅈ` 6회, `ㅊ→ㅉ` 6회, `NUM_2→NUM_3` 5회, `NUM_2→NUM_1` 5회, `ㅔ→ㅐ` 4회다.
- 진단 가치: 24 epoch는 CER을 T-112보다 `-0.46%p`, exact match를 `+2.82%p`, macro-F1을 `+0.30%p` 개선했지만 class-floor는 `13→16`으로 악화됐다. 전체 지표가 개선되어도 문자별 채택 기준을 만족하지 못할 수 있다는 직접 근거다.
- 운영 선택: class-floor 기준으로 T-112를 유지한다. 단순 epoch 연장은 중단하며, 다음 단계는 `ㅈ/ㅊ/ㅉ`, `ㅔ/ㅐ`, `NUM_1/NUM_2/NUM_3`의 실제 feature 분포와 support를 진단해 표적 데이터 보강 설계를 확정하는 것이다.

### 데이터 보강 전 중복 검증

- 서버의 후보 feature `code-v3/data/t23/train01·train02.npz`, `t46/train01·train02.npz`는 class order와 128차원 feature 형식은 호환된다.
- 그러나 각 clip ID를 현재 AIHub 103 학습 집합(16,873개)과 대조한 결과, 후보 네 파일은 각각 `9,928/6,945/9,928/6,945`개 전부가 기존 학습 clip과 중복됐다.
- 결론: 이 파일들은 새 데이터가 아니라 같은 원본의 다른 전처리 산출물이다. 재투입하면 class-floor 개선 근거가 왜곡될 수 있으므로 학습에 사용하지 않는다. 다음 보강은 검증 signer 18과 겹치지 않는 새 signer 또는 별도 수집 데이터여야 한다.

### Roboflow v1 신규 데이터 보강 계획

- 출처: Roboflow Universe `sign-language-2hatp` v1, CC BY 4.0. 5,369장 분류 이미지이며, 라벨은 31개 한글 자모와 `none/space/clear/next/emotion` 제어 클래스다.
- 호환 범위: `ㅈ·ㅊ·ㅍ·ㅔ·ㅐ·ㅟ` 등 현재 취약 자모를 포함한다. 숫자(`NUM_0`~`NUM_9`) 라벨은 없으므로 숫자 미달을 개선하는 근거로 사용하지 않는다. 제어 클래스는 31자모 서비스 사전에 넣지 않는다.
- 처리: `train/valid/test` 이미지를 MediaPipe로 다시 추출하고 v3 feature를 10-frame 정적 시퀀스로 변환한다. 우선 landmark 추출 성공률·클래스별 수량·원본 split을 감사한 뒤, AIHub validation signer 18과는 분리된 보조 학습 source로만 사용한다.
- 한계: 정적 이미지·내장 증강 데이터라 연속 동작, signer 일반화, 손바닥/손등·상하 조건 성능을 직접 측정하지 않는다. 특히 플랫폼 표시와 노트의 horizontal flip 정책이 상충하므로, 실제 파일의 좌우 반전 여부는 audit 이후 별도로 판단한다.

### Roboflow v1 — MediaPipe v3 추출 완료 및 정적 기준선(T-125) 시작

- **목적·가설:** AIHub CTC에서 계속 미달인 자모의 표적 보강 후보가 실제 MediaPipe 추출 후에도 학습 가능한지 검증한다. 이 회차는 AIHub 연속 인식 성능을 대체하거나 개선했다고 주장하지 않는, 별도 정적 이미지 기준선이다.
- **데이터·분할:** Roboflow Universe `sign-language-2hatp` v1(CC BY 4.0) 5,369장 중 MediaPipe Hand Landmarker 추출 성공은 **4,417장**, 실패는 **270장**이다. 제공 split 기준 train **3,856**, valid **371**, test **190**이며, `none/space/clear/next/emotion`은 31자모 계약 밖이라 제외했다.
- **특징 계약:** 각 이미지는 MediaPipe v3 특징 **78차원**을 같은 값으로 10프레임 반복한 `[10, 78]`로 저장했다. audit의 `featureSize=10`은 초기 추출기의 기록 버그(프레임 수를 적음)였고, 실제 NPZ shape로 78차원을 확인했다. 추출기는 이후 feature dimension을 기록하도록 수정했다.
- **호환성 판단:** AIHub 연속 CTC 입력은 packed sequence **128차원**이므로 `[10, 78]` 정적 특징을 직접 결합하지 않는다. 억지 zero-padding이나 차원 변환은 의미가 달라 검증을 왜곡한다. Roboflow는 전용 정적 자모 분류기로만 평가하고, AIHub CTC의 signer-held-out validation/locked development split은 유지한다.
- **실행·실측:** T-125는 물리 GPU 2(NVIDIA L40S, mask 후 논리 `cuda:0`)에서 70 epoch로 정상 완료했다. 78차원 평균 특징을 입력으로 하는 LayerNorm-MLP이며 best validation accuracy는 **73.8544%**, 제공 test accuracy는 **68.9474%**다.
- **판정:** 93% 문자별 recall 목표를 지지하지 못한다. AIHub CTC의 문자별 93% 기준과 평가 데이터·특징 계약이 달라 수치를 직접 비교하지 않으며, T-112를 대체하거나 AIHub CTC 재학습 입력으로 사용하지 않는다. `evaluation.json`의 class별 recall/F1·confusion은 T-125 정적 데이터 진단 산출물로 보존한다.
- **한계와 다음 결정:** 이 데이터는 정적·증강 이미지여서 실제 손 전환, 새 signer, 손바닥/손등·상하 방향 강건성을 측정하지 않는다. 다음 CTC 개선은 이 이미지를 억지로 128차원으로 맞추는 것이 아니라, `ㅈ/ㅊ/ㅉ`, `ㅔ/ㅐ`, `NUM_1/2/3`을 포함한 새 signer 연속 landmark/영상 데이터를 확보한 뒤 별도 split으로 검증한다.

### T-134 — Roboflow 정적 자모 loss-only weighting 분리 검증

- **문제·기준:** T-130은 EfficientNet-B0 정적 분류에서 test accuracy `95.4315%`, macro-F1 `95.2429%`로 가장 높았지만, 93% recall/F1 class floor 미달이 13개 남았다. T-133의 predefined confusion margin `0.10`은 accuracy `94.4162%`, macro-F1 `93.2578%`, 미달 14개로 회귀했으므로 margin 미세 탐색은 중단한다.
- **변경 계약:** T-130 대비 **`balance-mode`만 `sampler→loss`**로 변경했다. EfficientNet-B0, seed 53, 24 epoch, all-jamo-images, focus multiplier 1.50, min-q10 선택, learning rate `3e-4`, label smoothing `0.04`, confusion margin 0, Roboflow v1 원본 split과 GPU 2는 고정했다.
- **실행 환경:** physical GPU 2 (`CUDA_VISIBLE_DEVICES=2`, PyTorch logical `cuda:0`), 산출물은 `code-v3/outputs/t134-roboflow-v1-loss-balance/`다.
- **실측:** test accuracy `94.9239%`, macro-F1 `93.5386%`로 T-130 대비 각각 `-0.5076%p`, `-1.7043%p`다. 93% recall/F1 미달은 15개(`ㄱ·ㄹ·ㅈ·ㅊ·ㅋ·ㅌ·ㅓ·ㅔ·ㅕ·ㅗ·ㅛ·ㅜ·ㅠ·ㅡ·ㅢ`)이며 minimum recall은 `50.00%`, `goalPassed=false`다.
- **대표 혼동:** `ㄱ→ㅈ`, `ㄹ→ㅌ`, `ㅊ→ㅋ`, `ㅌ→ㄹ`, `ㅓ→ㅕ`, `ㅔ→ㅕ/ㅖ`, `ㅗ→ㅛ`, `ㅠ→ㅜ`, `ㅡ→ㅢ`가 관찰됐다.
- **판정:** loss-only weighting은 T-130의 aggregate와 class floor를 모두 개선하지 못해 제외한다. 정적 연구에서 sampler/loss weighting·hard-negative margin의 추가 미세 탐색은 중단한다. 다음 유효 단위는 pose·camera angle·lighting·새 signer 중 하나의 조건만 추가한 데이터 다양화이며, signer 또는 source-family가 잠긴 평가 split으로 검증해야 한다. 이 정적 결과는 AIHub 연속 CTC 후보(T-112)를 교체하거나 연속 인식 성능으로 주장하지 않는다.

### T-135 — T-112 warm-start 연속 CTC 강화 재개 (khstemp track)

- **문제·기준:** class-floor 최고 후보는 T-112(validation 미달 13개, `--skip-test`로 test 미평가)이고, held-out CROWD19 test로 실제 평가된 최고는 delta 계열 T-84/T-89/T-92의 미달 18개였다. 즉 신계열(wider-GRU) 후보의 진짜 일반화 floor가 미확인 상태였다. 이 회차는 리포지토리 커밋 checkpoint(`continuous-ctc-t91`)가 아니라 실측 최고인 T-112를 base로 강화 재개하고, CROWD19 test에서의 class-floor를 처음으로 측정한다.
- **변경 계약:** base `code-v3/outputs/t112-wider-gru-scratch/best.pt`(input 128, delta OFF, temporal-conv OFF, 192 hidden, 3 layer)에서 warm-start. epoch 6, batch 72, lr `3e-4`, coordinate noise `0.002`, balanced sampler alpha `0.5`, blank bias `0`, `--skip-test`로 학습. 데이터는 AIHub 16,873 train / signer18 993 validation / signer19 993 development test, 물리 GPU 2 단독.
- **실행 환경:** physical GPU 2(`CUDA_VISIBLE_DEVICES=2`, logical `cuda:0`). 학습 산출물 `code-v3/outputs/t135-khs-resume-t112/best.pt`, CROWD19 평가 산출물 `code-v3/outputs/t135-eval-crowd19/report.json`.
- **실측(validation, CROWD18):** CER `3.94%`, macro-F1 `92.71%`, 93% recall/F1 미달 13개.
- **실측(development test, CROWD19):** CER `5.16%`, sequence exact match `76.64%`, micro token recall `95.38%`, macro-F1 `91.02%`, 93% recall/F1 미달 **15개**, `goalPassed=false`.
- **class-floor(15개):** `ㅂ`(sup214,r0.92,f0.91), `ㅅ`(sup408,r0.94,f0.93), `ㅈ`(sup210,r0.89,f0.90), `ㅊ`(sup109,r0.91,f0.93), `ㅋ`(sup5,r0.80,f0.73), `ㅕ`(sup127,r0.92,f0.94), `ㅠ`(sup13,r0.62,f0.76), `ㅒ`(sup0, 평가불가), `NUM_0`(r0.76), `NUM_1`(f0.89), `NUM_2`(r0.83), `NUM_3`(r0.91,f0.91), `NUM_6`(f0.89), `NUM_7`(r0.82,f0.85), `NUM_8`(r0.82,f0.90). 숫자 7종이 전부 미달이고 `ㅒ`는 여전히 support 0으로 평가 불가다. 저support 문자(`ㅋ` 5, `ㅠ` 13)의 point estimate는 표본이 작아 불안정하다.
- **대표 혼동:** `ㅓ→ㅏ` 12, `ㅈ→ㅅ` 9, `ㅂ→ㅇ` 8, `ㅏ→ㅐ` 7, `ㅅ→ㅈ` 7, `ㅏ→ㅓ` 5, `ㄱ→ㅜ` 5.
- **판정:** 목표(전 class recall/F1 93%)는 **여전히 미달**이다. 다만 CROWD19 test class-floor를 기존 test-평가 최고(T-84/T-89/T-92의 18개)에서 **15개로 3개 축소**했고, CER(`≈5.22%→5.16%`)과 문장 완전일치(`≈75.7%→76.6%`)도 소폭 개선했다. macro-F1은 `≈91.7%→91.0%`로 약간 낮아, 평균 지표와 class-floor가 상충하는 기존 패턴과 일치한다. CROWD19는 반복 관찰된 development set이므로 최종 인증이 아니며, 운영 모델·MediaPipe 입력 계약은 변경하지 않는다. 남은 미달의 절반이 숫자(`NUM_0/1/2/3/6/7/8`)와 저support 문자(`ㅋ`·`ㅠ`·`ㅒ`)에 몰려 있으므로, 다음 단계는 추가 튜닝이 아니라 숫자·저support 문자를 겨냥한 새 signer/조건 연속 데이터 보강과 signer-잠금 final test 구성이다. checkpoint는 khstemp track의 새 후보로 보존하되 T-112를 대체하지 않는다.

### T-135 이후 — 표적 데이터 보강 설계 (숫자·저support 문자 우선)

이 절은 실행 회차가 아니라, T-135 CROWD19 진단에 근거한 다음 데이터 단위 설계다. GPU 재튜닝은 이미 여러 회차(focus/reweighting/blank bias/구조/focal)에서 class-floor를 못 깼으므로, 다음 유효 단위는 데이터 보강 + 잠금 test다.

**진단 요약(T-135 기준):**

- 미달 15개 중 **숫자 7종(NUM_0/1/2/3/6/7/8)**이 절반이다. AIHub CROWD morpheme에서 숫자 token 자체가 희소(test support 17~58)하고 Roboflow v1에는 숫자 라벨이 없어, 숫자는 구조·손실 튜닝으로 개선되지 않는 데이터 부족 문제다.
- **저support 자모**: `ㅋ`(sup5), `ㅠ`(sup13)는 표본이 작아 point estimate가 불안정하고, `ㅒ`는 support 0으로 평가 자체가 불가능하다.
- **혼동쌍**: `ㅓ↔ㅏ`(12), `ㅏ↔ㅐ`(7) 인접 모음, `ㅈ↔ㅅ`(9/7), `ㅂ→ㅇ`(8), `ㄱ→ㅜ`(5). 유사 손모양·방향 구분 데이터가 필요하다.

**보강 대상·소스(우선순위):**

1. **숫자 NUM_0~9 (최우선)**: 새 signer로 지숫자 연속 clip을 수집한다. AIHub 103 signer 20~21의 존재/위치를 먼저 확인(문서 미해결 항목)하고, 있으면 잠금 final test 후보로, 없으면 자체 촬영으로 확보한다.
2. **`ㅒ`**: 현재 support 0이므로 별도 확보가 필수다.
3. **저support 자모 `ㅋ`·`ㅠ`**: 새 signer 연속 clip을 추가해 support를 최소 안정 수준(예: class당 100+ clip)으로 올린다.
4. **혼동쌍 `ㅓ/ㅏ`·`ㅏ/ㅐ`·`ㅈ/ㅅ`**: 같은 signer로 손바닥/손등·상하·회전 등 조건을 다양화한 hard-negative를 수집해 경계를 학습한다.

**split·평가 규율(문서 방침 준수):**

- 새 데이터는 **signer/원본-family 단위**로 train/validation/**locked final test**를 분리한다. 같은 clip에서 뽑은 프레임을 서로 다른 split에 넣지 않는다.
- CROWD19는 이미 반복 관찰한 development set이므로 더 이상 최종 인증에 쓰지 않는다. 새 locked test로만 41 class 93%를 판정한다.
- 손바닥/손등·상/하·회전·거리·조명·좌/우손 **조건 라벨**을 부착해 조건별 recall을 측정한다(현재 AIHub 라벨엔 없어 측정 불가였던 축).

**실행 단계:**

1. 데이터 명세표 작성 — 대상 class·목표 clip 수(class당 최소 support)·조건 커버리지.
2. 수집·전처리 — MediaPipe 21 landmark → v3(78)/packed sequence(128) 계약 유지. archive SHA-256·manifest 기록, 원본은 Git 미포함.
3. 학습 — T-112 계약(delta OFF, 192 hidden, 3 layer, GPU 2) 유지하고 새 데이터를 병합해 재학습. 재가중·decoder 옵션은 validation에서만 선택한다.
4. 평가 — 새 locked test에서 41 class recall/F1 + 조건별 slice + 연속 CER·확정률·분당 오확정·p50/p95 지연을 측정하고 이 문서에 회차로 기록한다.

**성공 기준:** locked final test에서 41개 전 class recall·F1 ≥ 93%, 주요 조건 slice 하락 없음, 연속 인식 지표(CER·확정률·오확정) 목표 충족. 이 조건을 만족하기 전에는 어떤 checkpoint도 목표 달성으로 표시하지 않는다.

### T-137 — 신규 KSL 숫자 데이터 정적 분류 진단 (khstemp track)

- **문제·기준:** T-135 held-out에서 미달의 절반이 숫자(`NUM_0/1/2/3/6/7/8`)였다. 숫자 미달이 "학습 불가"인지 "데이터 부족"인지 가리기 위해, 기존 AIHub·Roboflow와 **겹치지 않는 독립 출처**의 한국 지숫자 데이터로 정적 분류 상한을 진단한다. 이 회차는 연속 CTC를 대체하거나 개선했다고 주장하지 않는, 숫자 domain head용 별도 정적 기준선이다.
- **데이터:** Kaggle `nahyunpark/korean-sign-languageksl-numbers`(라이선스 **CC0-1.0**). 숫자 1~10(10은 10-1/10-2 두 변형, 단일 `10`으로 매핑), **`0`(NUM_0) 없음**. train/test 폴더 제공. 이미지 상당수가 iPhone `.heic`. MediaPipe 추출 결과 train **762** / test **304** / 검출실패 **41**.
- **변경 계약:** MediaPipe Hand Landmarker → `app.feature_v2.landmarks_to_feature`(좌우 handedness 반영) → ExtraTreesClassifier(n_estimators=500, seed 42). 데이터셋 자체 train split으로 학습, 자체 test split으로 평가. 산출물 `code-v3/scripts/ksl_number_probe.py`, 특징 캐시 `data/ksl-numbers/feat_v2.npz`.
- **실측(자체 test split):** accuracy **94.74%**, macro-F1 **95.3%**(precision 0.951 / recall 0.958). class별 recall/F1: `2·3·4·5` 1.000, `6` 1.000/0.978, `7` 0.967/0.983, `9` 1.000/0.923, `8` 0.852/0.902, `1` 0.900/0.844, `10` 0.860/0.899.
- **해석:** 운영 CTC에서 취약하던 숫자(`2·3·6·7` 등)가 깨끗한 정적 데이터에선 거의 완벽히 분류된다. **숫자 병목은 학습 불가가 아니라 데이터(표본·조건) 부족**임을 실증한다. 정적 숫자 domain head(E-01 hybrid 계열) 보강의 유효성을 지지한다.
- **판정·한계:** 목표 판정과 무관한 **진단 회차**다. (1) 이 test는 KSL **자체 split**이라 signer-independent가 아니고 낙관적일 수 있다. (2) **정적 이미지**라 128차원 연속 CTC와 직접 병합하지 않는다. (3) **`NUM_0` 미포함**으로 최약 숫자는 미해결. 따라서 운영 모델·MediaPipe 계약을 바꾸지 않으며, signer-잠금 test로 재검증하기 전까지 숫자 개선을 확정하지 않는다.

### T-138 계획 — 데이터 기반 다음 학습 (숫자 head 보강 + 잠금 test)

T-137이 "숫자는 데이터만 있으면 학습된다"를 보였으므로, 다음 학습은 튜닝이 아니라 데이터 통합·검증에 둔다.

1. **signer-independent 재검증(선행):** KSL 이미지를 파일/촬영 단위로 그룹화해 signer 누수 여부를 감사한다. 자체 split이 signer 분리가 아니면, KSL은 **학습 전용 보강**으로만 쓰고 평가는 별도 출처(예: Roboflow `korean hand sign-numbers`)나 새 촬영으로 만든 **잠금 test**로 한다.
2. **숫자 domain head 통합 학습:** 운영 hybrid(`models/jamo-number-hybrid-v1`) 계열에 KSL 숫자 feature를 더해 tree/hybrid 숫자 head를 재학습하고, 독립 숫자 test에서 `NUM_0`을 제외한 1~9 recall/F1 개선치를 기록한다. 자모 head와 전체 41-class 지표의 회귀 여부도 함께 검사한다.
3. **미해결 class 데이터 확보:** `NUM_0`과 `ㅒ`(연속 support 0)는 이 데이터로 못 채우므로, AIHub 신규 signer(20~21) 또는 자체 촬영으로 별도 확보한다.
4. **연속 CTC 라인 분리 유지:** 정적 숫자는 CTC에 병합하지 않는다. CTC 숫자 개선은 새 signer **연속** 숫자 clip이 확보된 뒤에만 재학습한다. 현 CTC 후보는 T-135(held-out floor 15)를 유지한다.
5. **성공 기준·기록:** 모든 개선은 signer/source-family가 잠긴 test에서 41 class recall·F1과 조건 slice로 검증하고, 회차별로 이 문서에 방법·데이터 기준·전후 수치·회귀와 함께 기록한 뒤에만 다음 회차를 정한다. GPU는 물리 2번만 사용한다.

### T-138 실행 — 41-class 지문자+지숫자 이미지 통합 (khstemp track)

- **문제·기준:** 목표는 31자모+10숫자를 한 모델로 확실히 인식. 자모는 이미지 EfficientNet(T-11~13)이 최고였고 T-137이 숫자 학습 가능성을 보였으므로, 자모 이미지(Roboflow) + 숫자 이미지(KSL)를 합쳐 41-class 이미지 모델을 학습·측정한다.
- **데이터:** Roboflow Sign Language v1(CC BY 4.0, 31자모, `--all-jamo-images`=MediaPipe 게이트 없음) + KSL Numbers(CC0, `--number-root`). test 527(자모 197 + 숫자 330). signer-independent 아님(각 소스 자체 split, 숫자는 provider train 85/15 valid).
- **변경 계약:** `train_roboflow_jamo_image_t10.py --features roboflow-v1-f16.npz --dataset-root sign-language-v1 --number-root ksl-numbers --architecture efficientnet_b0 --all-jamo-images --epochs 24 --seed 67 --selection-mode min-q10`, 물리 GPU 2. 산출물 `code-v3/outputs/t138-khs-jamo-number-41/`(model.pt·evaluation.json).
- **실측(test):** accuracy **90.89%**, macro-F1 **92.78%** (baseline 83.16% 대비 **+7.73%p**). val은 epoch 13에서 accuracy 95.30%.
- **도메인별(핵심):** **자모31 accuracy 94.42% / macro-F1 94.12%(support 197) — 강함.** **숫자10 accuracy 88.79% / macro-F1 75.41%(support 330) — 약함.**
- **class gate(각 class recall/F1 ≥93%): 미통과.** minRecall 63.6%, minF1 77.1%. 미달: 숫자 `NUM_0·NUM_1·NUM_3·NUM_4·NUM_5·NUM_8` + 일부 자모(`ㄱ·ㅈ·ㅊ` 등). `NUM_0`은 KSL에 0 이미지가 없어 support 부족(미해결 gap 재확인).
- **판정·핵심 발견:** **이미지 모델은 자모엔 강하고(94%) 숫자엔 약하다(macro-F1 75%)** — landmark 계열(T-137 정적 숫자 94.7%)과 정반대. 따라서 **자모=이미지 모델, 숫자=landmark/tree 모델로 도메인 라우팅한 하이브리드**가 자모·숫자 둘 다 확실히 잡는 최적 경로다(기존 `models/jamo-number-hybrid` 개념을 실측으로 뒷받침). 운영 모델·MediaPipe 계약은 아직 바꾸지 않는다. 다음 단계는 이 하이브리드 구성·재평가(자모 이미지 + 숫자 landmark)와 signer-잠금 test.

### T-139 실행 — class 균형 샘플러 (전체·약한 class 동반 상승, 효과 O)

- **가설·기법:** T-138에서 숫자(소수 class)가 약했던 원인이 class 불균형이라 보고, **`--balance-mode sampler`(소수 class 업샘플) + `--label-smoothing 0.05`** 를 추가(그 외 T-138과 동일, epochs 30, seed 67, min-q10 선택). 산출물 `code-v3/outputs/t139-khs-balanced/`.
- **실측(test) — T-138 → T-139:**

  | 지표 | T-138 | **T-139** | Δ |
  | --- | --- | --- | --- |
  | 전체 accuracy | 90.89% | **94.50%** | **+3.61%p** |
  | 전체 macro-F1 | 92.78% | **95.94%** | +3.16%p |
  | 자모31 accuracy | 94.42% | **96.95%** | +2.53%p |
  | 숫자10 accuracy | 88.79% | **93.03%** | +4.24%p |
  | 숫자10 macro-F1 | 75.41% | **85.35%** | **+9.94%p** |

- **약한 class 개선(핵심):** min-recall 63.6% → **66.7%**. 미달 class 수는 13개 수준 유지지만 숫자 도메인이 전반 상승. 강한 class(대부분 자모)는 유지·소폭 상승(96.9%) — "잘 되던 건 유지, 약한 건 상승" 방향에 부합.
- **잔존 미달(각 class ≥93% gate 미통과):** 숫자 `NUM_0·NUM_1·NUM_5·NUM_8·NUM_9` + 자모 `ㄱ·ㄹ·ㅊ·ㅋ·ㅔ·ㅐ·ㅖ` 등 13개.
- **유사 그룹 정확도:** `ㄹ-ㅌ` **84.6%**(그룹내 혼동 2), `ㅔ-ㅖ` **91.3%**(혼동 2), `ㅈ-ㅅ-ㅊ` 91.7%, 나머지(`ㅅ-ㅠ·ㅕ-ㅖ·ㅏ-ㅗ·ㅛ-ㅑ`) 100%.
- **최다 혼동쌍:** `NUM_0→NUM_1` 9, `NUM_0→NUM_5` 5, `NUM_9→NUM_8` 5 (숫자끼리, `NUM_0`은 학습표본 0).
- **판정:** 균형 샘플러가 전체 +3.6%p, 숫자 macro-F1 +9.9%p로 **명확히 유효**. 현재 최고 단일 41-class 후보(94.5%). 채택.

### T-140 실행 — 유사쌍 하드-네거티브 confusion-margin (효과 X, 폐기)

- **가설·기법:** T-139의 잔존 취약 유사쌍(`ㄹ-ㅌ`·`ㅔ-ㅖ`)을 분리하려고 **`--confusion-source predefined-domain --confusion-margin 0.2 --confusion-loss-weight 0.3`**(사전정의 유사 그룹에 하드-네거티브 margin) 추가. T-139와 그 외 동일(seed 67). 산출물 `code-v3/outputs/t140-khs-confusion/`.
- **실측 — T-139 → T-140 (전 지표 동일):** 전체 94.50%→**94.50%**, macro-F1 95.94%→95.94%, 자모 96.95%, 숫자 93.03%, gate 미달 13개 모두 변화 없음.
- **유사쌍 before→after (핵심 정량):** `ㄹ-ㅌ` 84.6%→**84.6%**, `ㅔ-ㅖ` 91.3%→**91.3%**, `ㅈ-ㅅ-ㅊ` 91.7%→91.7% — **개선 0**. (같은 seed에서 이미 분리된 그룹은 margin gradient≈0 → 학습 결과 동일.)
- **판정:** confusion-margin은 이 데이터에서 취약 유사쌍을 **전혀 개선하지 못함 → 폐기.** 문서의 반복 결론과 일치: **취약 유사쌍(`ㄹ-ㅌ`·`ㅔ-ㅖ`)과 저support 숫자(`NUM_0` 등)는 손실/margin 튜닝이 아니라 데이터 병목**이다. 다음 유효 레버는 해당 쌍·숫자의 **표적 데이터(새 signer·각도·`NUM_0` 확보)** 이며, 손실 기반 유사쌍 분리 재탐색은 중단한다.

### T-141 실행 — 도메인 라우팅 하이브리드 (자모=이미지 / 숫자=landmark, 효과 O)

- **가설·기법:** T-138에서 실증한 방향(이미지=자모 강함 94%, landmark=숫자 강함 T-137 94.7%)을 실제로 결합. **입력 도메인에 따라 다른 모델로 라우팅**한다 — 자모 31class는 T-139 이미지 EfficientNet 결과를 그대로 사용(경로·가중치 불변), 숫자는 landmark feature(`feat_v3.npz`, 78차원) + ExtraTrees(500, seed 42)로 교체. 손실 튜닝이 아니라 **아키텍처 선택**이므로 강한 자모 class에 대한 회귀 위험이 원천적으로 없다. 산출물 `code-v3/scripts/hybrid_eval_t141.py`, `code-v3/outputs/t141-khs-hybrid/evaluation.json`.
- **실측 — T-139(단일 이미지) → T-141(하이브리드):**

  | 지표 | T-139 단일 | **T-141 하이브리드** | Δ |
  | --- | --- | --- | --- |
  | 전체 accuracy | 94.50% | **97.07%** | **+2.57%p** |
  | 전체 macro-F1 | 95.94% | **96.68%** | +0.74%p |
  | 자모 accuracy | 96.95% | **96.95%** | 0 (경로 불변, 무회귀 ✅) |
  | 숫자 도메인 accuracy | 93.03% | **97.17%** | **+4.14%p** |

- **숫자 class별 before→after (핵심 정량, 이미지 recall → landmark recall):** 숫자 도메인이 이미지 모델의 최대 약점이었는데(macro-F1 75→85), landmark로 교체 후 `NUM_1~NUM_6` 모두 **recall 1.000**, `NUM_7` 0.967(F1 0.983), `NUM_8` recall 1.000(F1 0.885). 즉 숫자 9개 중 **8개가 ≥96.7%로 목표(90%) 상회.** 유일 예외 `NUM_9` recall **0.75**(n=24) — 이 한 class만 landmark(0.75)가 이미지(0.833)보다 낮다(단일 손 landmark가 해당 손모양을 놓침).
- **90% 미만 잔존(6개):** `NUM_9` 0.75(n24, **진짜 취약**) + 자모 `ㅊ` 0.667(n3)·`ㄹ` 0.80(n5)·`ㄱ` 0.80(n5)·`ㅌ` 0.846(n13)·`ㅋ` 0.875(n8). **자모 5개는 test support가 3~13장뿐**이라 오분류 1건이 recall을 크게 흔드는 **측정 노이즈** 성격(자모 도메인 평균은 96.95%). min-recall 66.7%도 이 `ㅊ`(n3)에서 나온다.
- **중요한 정정·한계:** (1) 이전 회차 요약의 "`NUM_0` = 숫자 0, 학습표본 0"은 **오독**이었다 — 이미지 모델 `NUM_0`은 support 66의 실존 class(0-index 라벨)다. (2) 두 트랙의 **숫자 라벨 규약이 불일치**한다: 이미지 = `NUM_0~NUM_9`(10개, 0-index), landmark `feat_v3` = `NUM_1~NUM_9`(9개, digit-name). 운영 41-class 통합 전에 숫자 라벨 정합이 선행돼야 한다. (3) 두 test split은 signer-independent가 아니며(각 소스 자체 split), 숫자 test는 MediaPipe 손 검출 성공분(247장)만 포함된다.
- **판정:** 도메인 라우팅 하이브리드는 **자모 무회귀(96.95%)로 숫자를 93.0%→97.17%로 끌어올려**, "잘 되던 건 유지, 약한 건 상승" 목표를 숫자 도메인에서 달성. **채택(운영 통합 후보).** 잔존 <90%는 `NUM_9`(진짜)와 저support 자모(측정 한계)로 좁혀졌고, 둘 다 T-140 결론대로 **표적 데이터**(더 많은 `NUM_9`/digit 표본, `ㅊ·ㄹ·ㄱ·ㅋ` 신규 signer·각도)로만 해소 가능 — AIHub 지문자 또는 신규 촬영으로 확보한다.

### T-142 실행 — 지문자 leakage-safe 대형 test 재평가 (자음 "취약"은 측정 착시로 판명)

- **문제·동기:** T-139/T-141에서 자모 취약으로 지목된 `ㅊ·ㄹ·ㄱ·ㅋ·ㅌ`은 **test support가 3~13장뿐**이었다(원본 Roboflow split). 오분류 1건에 recall이 0.667~0.88로 튀므로, "진짜 취약"인지 "측정 노이즈"인지 가리려면 **더 큰 test**가 필요하다. 데이터는 이미 class당 train 100~225장으로 충분(부족 아님)함을 먼저 확인했다.
- **기법(핵심):** Roboflow 자모 landmark 아티팩트(`roboflow-v1-f16.npz`, 4417개)를 **소스(원본 촬영) 그룹 단위 stratified로 재분할**(test 28%/valid 12%/train 60%)해 `roboflow-v1-f16-bigtest.npz` 생성. **증강 누수 가드**: 같은 원본에서 파생된 증강본이 train/test에 섞이지 않도록 소스 base로 그룹핑(assert로 검증). 자모별 test가 최소 27~최대 86장으로 커졌다(`ㅊ` 3→43, `ㄱ` 5→39, `ㄹ` 5→36, `ㅋ` 4→31, `ㅌ` 8→74). 트레이너는 T-139와 동일 레시피(efficientnet_b0, balance sampler, label-smoothing 0.05, min-q10, seed 67). 산출물 `code-v3/outputs/t142b-khs-jamo-bigtest/`, 스크립트 `resplit_jamo_bigtest.py`.
- **함정·수정:** 첫 시도(t142)는 `--all-jamo-images`를 켠 채 돌려 **재분할이 무시**됐다 — 이 플래그가 split을 npz가 아니라 **폴더명(train/valid/test)** 에서 읽기 때문(트레이너 line 163-170). 플래그를 빼고 재실행(t142b)하니 npz splits(대형 test)가 정상 적용됐다.
- **실측(대형·누수차단 test, 자모 support 1205):** 전체 41-class testAccuracy **93.62%**, macro-F1 **93.52%**. 자모 mean recall **93.1%**, min-recall 0.75.
- **"취약 자음" before→after (핵심 정량, 작은 test → 큰 test):**

  | 자음 | 이전 recall (support) | **큰 test recall (support)** |
  | --- | --- | --- |
  | ㅊ | 0.667 (3) | **1.000 (43)** |
  | ㄹ | 0.800 (5) | **0.972 (36)** |
  | ㅋ | 0.875 (8) | **0.968 (31)** |
  | ㄱ | 0.800 (5) | **0.949 (39)** |
  | ㅌ | 0.846 (13) | **0.919 (74)** |

  → 다섯 자음 모두 실제로는 **92~100%**. "취약"은 **작은 test 표본에서 온 측정 착시**였음이 실증됨. 자음(지문자 자음 계열)은 **solid 확정**.
- **진짜 취약(대형 test에서 <90%, 9개) — 대부분 획 1개 차이의 유사 모음:** `ㅜ` 0.750(n28), `ㅣ` 0.778(n27), `ㅟ` 0.829(n35), `ㅖ` 0.841(n44), `ㅅ` 0.848(n33), `ㅝ` 0.857(n28), `ㅔ` 0.860(n86), `ㅘ` 0.889(n27), `ㅕ` 0.893(n28). 이들은 support 27~86으로 **충분** → 부족이 아니라 **시각적 유사성**이 원인.
- **최다 혼동쌍(자모):** `ㅔ↔ㅖ`, `ㅕ→ㅖ`, `ㅐ→ㅔ`, `ㅜ→ㅠ` — 모두 짧은 획 하나로 갈리는 모음 최소대립쌍.
- **판정:** 지문자 **자음 계열은 확실히 잡혔다(≥92%, 다수 ≥95%)**. 남은 과제는 **유사 모음 쌍**(ㅔ/ㅖ/ㅕ, ㅜ/ㅟ/ㅝ, ㅣ, ㅘ)이며, 데이터 부족이 아니라 획 차이 판별 문제다. 다음 유효 레버는 (1) 해당 모음의 판별 영역을 키우는 표적 증강(고해상도·손 crop·회전 축소), (2) 유사쌍 focus-multiplier, (3) 필요 시 해당 모음의 신규 각도 표본이며, T-140의 "이미 분리된 쌍엔 margin 무효" 교훈을 반영해 **미분리(실제 혼동) 쌍에만** 적용한다. 평가는 반드시 이 leakage-safe 대형 test로 한다.
