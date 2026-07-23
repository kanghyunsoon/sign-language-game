# Korean Fingerspelling AI Handoff — 260721

## 2026-07-22 데이터 복구 상태

- AIHub 103 CROWD 원본은 `C:\AITraining\korean-fingerspelling\aihub-103`에 새로 보관한다. `D:` 드라이브는 이 PC에 없으므로 기존 인계의 `D:\AITraining\...` 경로를 현재 위치로 사용하면 안 된다.
- 원천 영상 없이 keypoint 3개와 morpheme 2개를 받았다. archive SHA-256·clip/frame·손 품질 감사 JSON은 `C:\AITraining\korean-fingerspelling\aihub-103\audit`에 있다. 원본과 audit JSON은 Git 비포함이다.
- 검증 데이터는 signer 18·19, 2,000 clip·671,745 frame으로 완전하다. 최종 재감사에서 학습 morpheme 라벨도 signer 01~17의 17,000 clip 전체임을 확인했고, keypoint 16,998 clip과 교집합을 고정했다.
- 현재 재현 가능한 compact split은 train 16,873, validation signer 18의 993, locked development signer 19의 993 clip이다. 지원하지 않는 토큰 119개와 frame이 없는 8개는 manifest에서 제외했고, GPU 물리 2에서 별도 회차로 기록한다.

## 현재 상태

- 브랜치: `260721`
- 학습 데이터: 프로젝트의 `dataset/`에 포함. Roboflow 원본 이미지 ZIP과 기존 자모 시퀀스를 함께 보관한다.
- GPU 실험: 물리 GPU 2, NVIDIA L40S를 사용했다. 실행 시 `CUDA_VISIBLE_DEVICES=2`를 지정하며, 프로세스에서는 논리 장치 `cuda:0`으로 보인다.
- 운영 안전성: 실험은 운영 TFLite·readiness를 바꾸지 않는다. 새 결과는 실험 폴더로만 출력한다.
- 최신 완료 회차: T-97. 연속 입력의 현재 최고는 T-91 checkpoint + blank bias `-0.9`인 T-92다. CROWD19 development에서 CER 5.24%, 문장 완전일치 75.53%, micro token recall 95.60%, macro-F1 91.71%이며 17 class가 recall/F1 93% gate 미달이고 `ㅒ`는 support 0으로 평가 불가다.
- 다음 회차: 같은 development set 재튜닝을 멈추고 `ㅒ`, 숫자 0·1·2·3·5·7·8, `ㅠ`, `ㅈ/ㅅ/ㅊ`, `ㅓ/ㅏ`를 새 signer와 조건 라벨로 보강한다. 새 signer-held-out final test를 만들기 전에는 93% 달성으로 표시하지 않는다.
- 추가 데이터: AI Hub 원본 보관소는 `D:\AITraining\korean-fingerspelling\aihub-103`이다. Crowd morpheme 라벨 19,000개와 keypoint 3묶음(Validation 1.31GB, Training 6.16GB+4.67GB)을 D 드라이브에 보관하고 원본/복사본 SHA-256을 검증했다. Validation은 2명·2,000clip·671,745 frame이며 30-frame stride hand-quality 표본도 기록했다. 2.63TB 전체는 받지 않는다.
- AI Hub 라벨 확인: train signer 17명/17,000clip, validation signer 2명/2,000clip, 총 1,024개 연속 문구다. 문자별 경계는 없으므로 isolated 학습에는 정렬 단계가 필요하고, signer 20~21의 위치는 추가 확인 대상이다.
- T-15~T-18: T-15 91.46%/94.31%, T-16 90.70%/93.79%, T-17 93.55%/95.04%, T-18 93.55%/95.04%다. T-17이 현재 평균 최고 후보지만 개별 gate 15개 미달로 운영 승격하지 않는다. 상세 class·domain·UX·한계는 `model-evaluation.md`를 따른다.

## 학습 성과 문서

학습 회차별 데이터 기준·방법·성과·회귀·판정은 `model-evaluation.md` 한 파일에만 기록한다. 이 handoff에는 성능표를 복제하지 않는다.

## 재학습 절차

서버 또는 GPU 장비에서 프로젝트 밖의 작업 디렉터리를 사용한다. 아래의 `data`는 Roboflow ZIP을 해제한 디렉터리다.

```bash
MPLBACKEND=Agg PYTHONPATH=code-v3 CUDA_VISIBLE_DEVICES=2 .venv/bin/python ./code-v3/scripts/extract_roboflow_jamo_features.py --dataset data --output artifacts/roboflow_v3_features.npz --landmarker ./code-v3/hand_landmarker.task --feature-version v3
CUDA_VISIBLE_DEVICES=2 .venv/bin/python ./code-v3/scripts/train_roboflow_jamo_gpu.py --features artifacts/roboflow_v3_features.npz --output-dir artifacts/roboflow-v3-gpu-experiment --epochs 80 --feature-version v3
```

노트북 셀에서는 각 명령 맨 앞에 `!`를 붙이고, Windows PowerShell에서는 Linux용 `CUDA_VISIBLE_DEVICES=...` 형식을 그대로 쓰지 않는다.

## MediaPipe 계약

- 브라우저는 21개 손 랜드마크를 제공한다.
- `feature_v3.py`는 같은 랜드마크에서 3-D bone direction 60개, 각도 15개, palm normal 3개를 계산한다.
- 왼손은 x축 미러링 후 정규화한다. 따라서 왼손·오른손 좌표계가 서로 다른 문제를 줄인다.
- 새 모델을 운영에 붙이려면 프런트와 서버의 입력 계약을 `[10, 78]`으로 함께 변경하고, 실제 카메라 검증을 통과해야 한다.

## 다음 우선순위

1. Training keypoint 두 ZIP의 중앙 디렉터리·clip/signer 수를 검증하고, 압축을 풀지 않는 archive 분석 결과를 남긴다.
2. keypoint와 morpheme JSON의 clip ID·signer·구간 매핑을 감사하고, signer 20~21 및 문자별 frame alignment 가능 여부를 확인한다.
3. 원본 사람/clip 단위로 train/validation/locked-test를 분리한다. 동일 clip에서 뽑은 프레임은 서로 다른 split에 넣지 않는다.
4. T-19 이후 회차도 물리 GPU 2만 사용한다. 매 회차 validation 선택과 development-test 결과를 분리 기록하고, 41개 전 class recall/F1 93%를 동시에 검사한다.
5. 손바닥/손등, 상/하, 거리, 조명, 카메라, 왼손/오른손, `NONE/OOD`를 분리 라벨로 평가한다.
6. 연속 지문자 영상에서 CER, 문자 정확도, 분당 오확정, 확정률, 중복/누락 전환, p50/p95 지연을 측정한다. 정적 이미지 점수로 대체하지 않는다.
7. 모든 결과를 `model-evaluation.md`의 회차별 단일 문서에 방법·데이터 기준·전후 수치·회귀·한계와 함께 기록한 뒤에만 다음 회차를 정한다.

회차별 성과와 필수 기록 형식은 `model-evaluation.md`만 기준으로 한다.
> 2026-07-22 05:50 종료 갱신: T-23 연속 지문자 CTC까지 완료했다. 정지 이미지 최고 T-17/T-22는 accuracy 93.55%, macro F1 95.04%이나 15 class gate 미달이다. T-23 development test는 CER 7.56%, 문장 완전일치 63.95%, micro token recall 93.40%, macro F1 85.24%, 25 class gate 미달이다. 최종 목표는 미달이며 상세 근거는 `model-evaluation.md`의 T-23 절에 있다.

재개 시 `prepare_aihub_sequence_manifest.py`, `pack_aihub_sequence_features.py`, `train_aihub_sequence_ctc_t23.py`를 사용한다. D 드라이브 compact feature는 `D:\AITraining\korean-fingerspelling\aihub-103\prepared\t23`, 서버 산출물은 `~/sign_language_training/code-v3/outputs/t23`에 있다. 다음 회차는 validation에서만 희소 문자·숫자 재가중과 beam/언어 제약을 선택하고 CROWD19를 반복 선택에 쓰지 않는다. GPU는 반드시 물리 2번만 사용한다.
> 2026-07-22 06:10 추가 튜닝: T-24(숫자 focus), T-25(취약 자모 focus), T-26(고정 development 평가), T-27(전체 취약 class focus)을 완료했다. 최종 선택은 validation CER 6.02%/macro-F1 88.60%의 T-25다. T-26 development test는 CER 6.97%, 문장 완전일치 66.47%, micro token recall 93.83%, macro-F1 87.88%이며 25 class gate 미달이다. T-27은 CER 5.97%지만 macro-F1 88.34%로 T-25보다 낮아 선택하지 않았다. 서버 checkpoint는 `~/sign_language_training/code-v3/outputs/t25/best.pt`, 전체 보고서는 `outputs/t24`~`outputs/t27`에 있다.
> 2026-07-22 06:10 최종 보정: T-28 validation grid에서 CTC blank logit bias `-0.3`을 선택했다. T-29 개발 테스트는 CER 6.97%, 문장 완전일치 66.87%, micro token recall 93.94%, macro-F1 87.83%, gate 미달 24개다. 현재 연속 인식 후보는 `outputs/t25/best.pt`에 decoder `blankLogitBias=-0.3`을 적용한 조합이다.
> 2026-07-22 06:08 T-30: checkpoint 선택이 CER 단일 기준이던 오류를 수정했다. 이후 CTC 회차는 `validation macroF1 - CER` 최대값을 저장하며, T-25/T-27 기록 재검증에서도 macro-F1이 더 높은 T-25를 선택한다.
> 2026-07-22 06:10 T-31: 실제 GPU 2에서 최저 class+혼동쌍 6배 focus, 2 epoch를 실행했으나 validation 균형 점수 0.82593으로 T-29의 0.82691보다 낮아 폐기했다. 현재 후보는 계속 T-25 checkpoint + blank bias -0.3이다.

## 2026-07-22 07:15 연속 CTC 최종 인계

- 총 데이터: AIHub 원본 19,000clip 중 compact split은 train 16,873, validation 993, development 993로 총 18,859clip이다. train은 141,340 token·323,125 frame이다. D 드라이브의 고시간해상도 T-46은 train 412,261 frame, validation 전체 1,986clip·48,815 frame·16,638 token이다.
- 유효 개선: frame delta, packed BiGRU로 padding 문맥 제거, x/y 좌표 잡음 std 0.01, 역빈도 sampler, GRU 3층×192 확대, blank bias `-0.9`.
- 실패/폐기: temporal Conv, 24~48 frame 단독 확대, 강한 개별 focus, sampler alpha 0.75, 여러 checkpoint logit 평균, blank `-0.3/-1.2`.
- 현재 checkpoint: 저장소 `models/continuous-ctc-t81/best.pt`, SHA-256 `0AC241AED9D8EAB86C09C946ED7DB703D1D506D9FEA75F77E952D0FF94B415E7`. decoder는 blank logit bias `-0.9`를 별도로 적용한다. 원격 원본은 `~/sign_language_training/code-v3/outputs/t81/best.pt`, 최종 보고서는 `outputs/t89/report.json`이다.
- T-23→T-89 development 개선: CER 7.56→5.25%, 문장 완전일치 63.95→75.73%, micro recall 93.40→95.59%, macro-F1 85.24→91.69%, gate 미달/평가 불가 25→18개.
- 목표 판정: **미달**. 41개 중 23개만 recall/F1 93% 수치 gate 통과, 17개 미달, `ㅒ` 평가 불가다. macro-F1도 93% 미만이다. T-89를 운영 모델로 승격하거나 MediaPipe 계약을 바꾸지 않았다.
- 조건별 한계: AIHub 라벨에 손바닥/손등, 위/아래, 회전, 거리·조명 조건이 없어 조건별 정확도는 측정 불가다. 왼손 mirror와 손목/크기 정규화만 적용했다. 실시간 확정률·오확정/분·중복/누락·p50/p95 latency도 별도 실제 카메라 세트가 필요하다.

재개 명령의 핵심 옵션은 다음과 같다. 데이터 NPZ는 Git에 없으므로 이 PC의 `D:\AITraining\korean-fingerspelling\aihub-103\prepared\t23`을 안전하게 옮기거나 AIHub 103 원본에서 재생성한다.

```bash
CUDA_VISIBLE_DEVICES=2 .venv/bin/python code-v3/scripts/train_aihub_sequence_ctc_t23.py \
  --train-features code-v3/data/t23/train01.npz code-v3/data/t23/train02.npz \
  --validation-features code-v3/data/t23/validation.npz \
  --output-dir code-v3/outputs/next \
  --epochs 4 --batch-size 96 --learning-rate 1e-5 \
  --initial-checkpoint models/continuous-ctc-t91/best.pt \
  --use-delta-features --coordinate-noise-std 0.01 \
  --balanced-sampler-alpha 0.5 --gru-hidden-size 192 --gru-layers 3 \
  --blank-logit-bias -0.9 --skip-test
```

다음 담당자는 먼저 새 데이터 split을 만들고 validation으로만 선택한다. 현재 CROWD19는 반복 관찰한 development set이므로 더 이상 최종 인증에 사용하지 않는다. 회차별 전체 수치는 `model-evaluation.md`의 T-32~T-97 표가 canonical이다.

## 2026-07-22 07:40 마지막 짧은 튜닝 인계

- T-91은 T-81에서 validation 취약 자모 `ㅈ·ㅊ·ㅍ·ㅠ`와 숫자 `0·1·2·3·4·6·7·8·9`가 포함된 clip을 1.5배로 약하게 재가중하고, alpha 0.5 sampler·좌표 잡음 0.01·lr 1e-5로 2 epoch 실행했다. epoch 1이 validation CER 3.81%/macro-F1 92.46%로 선택됐다.
- T-92 고정 development 평가는 CER 5.2404%, 문장 완전일치 75.5287%, micro recall 95.6010%, macro recall 90.7765%, macro-F1 91.7051%, gate 미달/평가 불가 18개다. T-89 대비 CER -0.012%p, micro +0.012%p, macro-F1 +0.016%p이나 문장 완전일치는 -0.201%p라서 개선은 작다.
- T-93(재가중 1.25), T-94(자모만 1.5), T-95(숫자만 1.5)는 validation 선택 점수가 낮아 폐기했다. T-96/T-97에서 T-91 blank `-0.6/-1.2`를 재검사했으나 `-0.9`보다 낮아 decoder도 유지한다.
- 현재 저장소 checkpoint는 `models/continuous-ctc-t91/best.pt`, SHA-256 `04A65A0F77958722A4BD3401AC1F91FEF0A99AB19DFD7A0BA2FA63FB612E98E7`, 평가 파일은 같은 폴더의 `evaluation.json`이다. 원격 원본은 `~/sign_language_training/code-v3/outputs/t91/best.pt`, 보고서는 `outputs/t92/report.json`이다.
- 목표 판정은 여전히 **미달**이다. 더 반복해 같은 CROWD19를 보는 것은 통계 누수를 키우므로, 다음 작업은 `ㅒ`와 실패 문자/유사 문자 쌍의 새 signer·방향 조건 데이터를 보강한 뒤 새 locked final test를 만드는 것이다. 운영 모델과 MediaPipe 계약은 변경하지 않았다.
- 회차별 canonical 범위는 이제 `model-evaluation.md`의 T-32~T-97이다.

## 2026-07-22 재개 상태

- canonical 실험 기록은 `model-evaluation.md`의 **T-98~T-106** 절이다. 이 handoff에는 지표를 중복하지 않는다.
- 최신 실제 완료 회차는 GPU 2의 T-106이다. full-corpus baseline은 정상 종료했지만 문자별 recall 93% 목표를 입증하지 못했으며 배포 후보가 아니다.
- T-103~T-105는 학습 실패가 아니라 실행 전 vocabulary 검증 실패다. NPZ metadata에는 `NUM_0`~`NUM_9`가 보이지만 runtime `--focus-classes`가 일부 숫자를 unknown으로 거부한다. 다음 담당자는 재학습 전에 source의 class vocabulary 생성과 NPZ class order를 비교·수정해야 한다.
- 다음 정상 회차는 수정된 vocabulary 검증, checkpoint output dimension, feature class order를 모두 통과한 뒤에만 GPU 2에서 시작한다. 선택 기준은 macro 평균이 아니라 support가 있는 **각 문자 recall 93%**다.

### T-107 완료 후 상태

- T-107은 class-name 공백 정규화 보정 후 GPU 2에서 실제 완료했다. 전체 수치와 17개 미달 문자는 canonical `model-evaluation.md`의 T-107 절을 기준으로 한다.
- 다음 회차는 T-107 `best.pt`를 기준으로 하되, `topSubstitutions`와 per-class support를 먼저 읽어 유사 손모양 쌍을 확정한 뒤에만 focus 집합을 바꾼다. 같은 CROWD18 selection split에 대한 평균 지표만 보고 승격하지 않는다.

- T-108은 CER은 소폭 낮췄지만 class-floor 기준에서 17→18개 미달로 회귀했다. 따라서 기준 checkpoint는 계속 T-107 `best.pt`다. 상세 수치·판정은 canonical T-108 절을 따른다.
- T-109의 약한 재가중도 18개 미달을 해소하지 못했다. T-107을 선택 checkpoint로 유지하고, 다음은 동일 split에서 weight만 바꾸지 말고 temporal-convolution/delta-feature scratch baseline으로 넘어간다. T-109 상세는 canonical 문서에서 확인한다.
- T-110 temporal-convolution + delta scratch baseline은 macro-F1 88.79%, 21개 미달로 크게 후퇴해 폐기했다. T-107 `best.pt`가 현재 선택 checkpoint이며 T-110의 구조를 warm start에 사용하지 않는다.
- T-111 temporal-convolution 단독도 macro-F1 90.55%, 21개 미달로 T-107에 못 미쳐 폐기했다. CTC 서비스 연구의 선택 checkpoint는 계속 T-107 `best.pt`다.
- T-112 wider 3-layer BiGRU는 validation CER 4.26%, macro-F1 91.70%, 문자 recall 93% 미달 13개로 T-107의 17개보다 개선됐다. 현재 선택 후보는 `code-v3/outputs/t112-wider-gru-scratch/best.pt`다. 단 hidden/layer/batch를 동시에 바꾼 교란 실험이므로, 다음 단계는 재가중부터 시작하지 말고 남은 13개 class의 support·top confusion 분석이다. 상세 수치는 canonical T-112 절을 따른다.
- T-113은 batch만 96으로 바꾼 분리 검증에서 17개 미달로 회귀했다. batch 72의 T-112가 현재 선택 checkpoint이며, batch size 재탐색은 중단한다.
- T-114는 coordinate noise만 0.005로 올린 분리 검증에서 15개 미달로 회귀했다. T-112의 noise 0.002를 유지하며, 다음 T-115는 noise를 0으로만 바꿔 augmentation 자체의 필요성을 검증한다. 상세 수치·판정은 canonical T-114/T-115 절을 따른다.
- T-115는 noise를 0으로만 바꾼 분리 검증에서도 14개 미달로 회귀했다. T-112의 noise 0.002를 유지한다. 다음 T-116은 temporal convolution 없이 delta feature만 켜는 scratch 분리 검증이며, 상세 근거와 결과는 canonical T-115/T-116 절을 따른다.
- T-116 delta-only는 17개 미달로 크게 회귀했다. T-112의 원래 landmark 입력을 유지하며, 다음 T-117은 BiGRU layer 수만 3→2로 줄이는 scratch 분리 검증이다. 상세 근거와 결과는 canonical T-116/T-117 절을 따른다.
- 해석 원칙: 운영 후보에서 제외한 회차도 삭제하지 않는다. T-115의 noise 제거, T-116의 delta-only, T-117의 2-layer 검증은 각각 augmentation 강도·입력 확장·순환층 깊이의 반증 근거로 보존한다.
- T-117은 15개 미달로 T-112보다 나빴지만, 3-layer가 다수 자모의 시간 문맥 유지에 필요하다는 유의미한 근거를 남겼다. 다음 T-118은 hidden width만 192→128로 줄이는 scratch 분리 검증이다. 상세 수치·판정은 canonical T-117/T-118 절을 따른다.
- T-118도 18개 미달로 회귀했지만, T-117과 함께 선택 구조가 192 hidden / 3 layer / batch 72여야 한다는 반증 근거를 남겼다. 다음 T-119는 학습률만 `1e-3→5e-4`로 바꾸는 scratch 분리 검증이다. 상세 수치·판정은 canonical T-118/T-119 절을 따른다.
- T-119의 작은 학습률은 19개 미달로 회귀했다. 현재 16 epoch 예산에서는 T-112의 `1e-3`을 유지한다. 다음 T-120은 CTC blank logit bias만 `0→-0.9`로 바꾸는 decoder 분리 검증이다. 상세 수치·판정은 canonical T-119/T-120 절을 따른다.
- T-120의 blank bias -0.9은 평균 recall을 약간 높였으나 14개 미달로 T-112의 13개를 넘지 못했다. decoder bias가 숫자 class trade-off를 바꾸는 유의미한 근거로 보존한다. 다음 T-121은 blank bias만 `0→-0.3`으로 낮춰 보정 강도를 분리한다. 상세 수치·판정은 canonical T-120/T-121 절을 따른다.
- T-121도 14개 미달로 blank-bias tuning을 끝낸다. `0/-0.3/-0.9`의 결과는 decoder가 숫자 경계를 바꾸지만 전체 floor를 낮추지 못한다는 근거다. 다음 T-122는 T-112의 실제 13개 미달 class에만 1.25배 loss reweighting을 적용하는 scratch 검증이다. 상세 수치·판정은 canonical T-121/T-122 절을 따른다.
- T-122 loss reweighting은 16개 미달로 회귀했다. 같은 focus multiplier 미세 탐색은 중단한다. 중요한 발견은 서버 스크립트가 checkpoint를 macroF1−CER로만 선택해 문자별 93% 목표와 불일치한다는 점이다. 다음 T-123은 미달 문자 수 최소화를 먼저 적용하는 checkpoint selection policy만 바꾸는 검증이다. 상세 수치·판정은 canonical T-122/T-123 절을 따른다.
- T-123은 결과상 T-112를 정확히 재현했다(CER 4.2558%, macro-F1 91.7019%, 93% 미달 13개). report가 여전히 `maximize validation macroF1 - CER`을 기록해 class-floor 우선 선택기 반영에 실패한 것을 확인했다. 이 회차는 성능 개선이 아닌 구현 검증 실패 기록으로 보존한다. 다음 T-124는 선택기 단위 검증 후 epoch만 16→24로 변경하며, report의 selection 문자열과 저장 checkpoint를 반드시 확인한다.
- T-124는 선택기 코드를 `classesBelow93` 최소화 → 동률 시 macroF1−CER 최대화로 실제 검증한 뒤, GPU 2에서 시작했다. 모델·데이터·분할·구조는 T-112와 같고 epoch만 16→24로 변경했다. 완료 후 13개 class-floor 감소 여부와 report의 선택기 문구를 함께 확인한다.
- T-124는 선택기가 실제 반영된 상태로 완료됐다. CER 3.79099%, exact match 79.55690%, macro-F1 92.00651%로 전체 지표는 좋아졌지만, 93% 미달은 16개로 T-112의 13개보다 악화됐다. 운영 후보는 계속 T-112다. 다음 작업은 epoch/구조 미세 조정이 아니라 `ㅈ/ㅊ/ㅉ`, `ㅔ/ㅐ`, `NUM_1/2/3`의 support·feature 분포를 진단해 표적 데이터 보강을 설계하는 것이다. T-124의 선택기 문구는 `minimize validation classesBelow93, then maximize macroF1 - CER`으로 검증됐다.

## 2026-07-22 Roboflow 보강 데이터 인계 — 다른 컴퓨터에서 재현

### 현재 완료 상태

- 원본: Roboflow Universe `sign-language-2hatp` dataset v1, 라이선스 **CC BY 4.0**. 다운로드 ZIP은 Git에 넣지 않는다.
- 서버 보관 위치: `~/sign_language_training/data/roboflow/Sign Language.v1i.folder.zip` 및 해제본 `data/roboflow/sign-language-v1/`.
- 추출 산출물: `data/roboflow/artifacts/roboflow-v1-f16.npz`, 감사 파일 `data/roboflow/artifacts/roboflow-v1-f16.audit.json`.
- 실제 추출: 발견 5,369장 / 성공 4,417장 / 실패 270장 / split train 3,856·valid 371·test 190. 실제 feature shape는 `[4417, 10, 78]`이다.
- T-125 정적 기준선은 GPU 2(NVIDIA L40S)에서 70 epoch로 완료됐다. best validation accuracy **73.8544%**, 제공 test accuracy **68.9474%**이며, 결과는 `code-v3/outputs/t125-roboflow-v1-static-v3/evaluation.json`과 `model.pt`에 있다. 31자모의 93% floor를 입증하지 못했으므로 AIHub CTC 후보를 교체하지 않는다.

### 다른 컴퓨터 준비 순서

1. 저장소를 받고 `game-ai-dev-server/scripts/extract_roboflow_jamo_features.py`를 사용한다. 원본 데이터는 저장소 밖의 예: `C:\AITraining\korean-fingerspelling\roboflow-v1`에 둔다.
2. Roboflow에서 같은 v1 ZIP을 내려받고, 출처 URL·라이선스·ZIP SHA-256을 작업 메모에 기록한다. 원본 이미지와 NPZ는 용량·라이선스 관리 때문에 Git commit/push 대상이 아니다.
3. Linux GPU 서버에서는 압축 해제 도구가 없을 수 있으므로 Python 표준 라이브러리로 해제한다. 아래 명령은 서버 프로젝트 루트에서 실행한다.

```bash
mkdir -p data/roboflow/sign-language-v1 data/roboflow/artifacts
.venv/bin/python -m zipfile -e 'data/roboflow/Sign Language.v1i.folder.zip' data/roboflow/sign-language-v1
.venv/bin/python code-v3/scripts/extract_roboflow_jamo_features.py \
  --dataset data/roboflow/sign-language-v1 \
  --output data/roboflow/artifacts/roboflow-v1-f16.npz \
  --landmarker code-v3/hand_landmarker.task \
  --feature-version v3
```

4. 추출 후 audit의 discovered/accepted/failed/split과 NPZ shape를 확인한다. 기준 산출물은 `5369 / 4417 / 270`, `[4417, 10, 78]`이다. Hand Landmarker 버전이 달라져 수치가 바뀌면 기존 수치를 덮어쓰지 말고 차이와 원인을 별도 회차로 기록한다.
5. 이 NPZ는 AIHub CTC의 128차원 packed sequence와 **직접 병합 금지**다. 정적 이미지를 연속 인식 성능으로 주장하지 않는다. 정적 기준선만 다음처럼 GPU 2에서 실행한다.

```bash
CUDA_VISIBLE_DEVICES=2 .venv/bin/python code-v3/scripts/train_roboflow_jamo_gpu.py \
  --features data/roboflow/artifacts/roboflow-v1-f16.npz \
  --output-dir code-v3/outputs/t125-roboflow-v1-static-v3 \
  --epochs 80 --batch-size 256 --feature-version v3
```

6. 완료 후 `evaluation.json`의 실제 test accuracy, 각 자모 recall/F1, top confusion만 `model-evaluation.md`의 T-125 절에 추가한다. 현재 T-125는 validation **73.8544%** / test **68.9474%**로 종료했다. AIHub CTC 후보(T-112)와 비교할 때는 문자별 93% floor와 평가 데이터가 다르므로 숫자를 직접 우열 비교하지 않는다.

### AIHub CTC 재개 원칙

- AIHub feature와 current checkpoint를 다른 컴퓨터로 옮길 때는 raw ZIP 대신 compact NPZ의 SHA-256, class_names 순서, feature dimension(128), train 16,873 / validation signer18 993 / locked development signer19 993을 먼저 검증한다.
- GPU 학습은 반드시 `CUDA_VISIBLE_DEVICES=2`를 지정한다. mask 안에서는 PyTorch가 논리 장치 `cuda:0`으로 보이는 것이 정상이다.
- 다음 CTC 회차는 직전 report/train.log를 읽고, 문자별 93% 미달 목록·support·top confusion을 근거로 변경 가설 하나만 정한 뒤 시작한다. macro-F1/CER만 좋아져도 미달 문자가 늘면 회귀로 기록한다.
