# 지숫자 전용 모델 학습·평가 기록 (number-10-v1)

## 문서의 위치

- 이 문서는 **지숫자 전용 모델 한 갈래**의 canonical 기록이다. `model-evaluation.md`가 지문자(자모)·연속 CTC·이미지 트랙의 canonical인 것과 같은 역할을, 숫자 전용 라인에 대해 수행한다.
- 별도 로그를 두는 것은 `roboflow-static-experiment-log.md`와 같은 선례를 따른다. 지숫자 라인이 운영에 승격되는 시점에 `model-evaluation.md`에 이 문서로의 링크 한 줄을 추가한다.
- **아직 학습된 모델이 없다.** 아래 성능란은 비어 있고, `readiness-number.json`은 전 class 부적격 상태의 안전 기본값이다.

## 1. 범위

| 항목 | 내용 |
| --- | --- |
| 대상 | 지숫자 10종(`1`~`10`) + `none` = **11 class** |
| 제외 | 지문자 자모, 연속 문장 수어, 숫자 `0` |
| 모델 단위 | **단일 프레임 분류** |
| 입력 | `app/feature_v3.py`의 78차원 (3-D bone 60 + 관절각 15 + palm normal 3) |
| 시간 집계 | 모델이 아니라 `ai/config/recognition-policy.json` + 세션 계층이 담당 |
| 산출물 | `models/number-10-v1/` (`number-10.joblib` + `manifest.json` + `evaluation.json`) |
| 안전 gate | `game-contracts/recognition/readiness-number.json` (자모 `readiness.json`과 분리) |

`10`은 촬영 변형 `10-1`/`10-2`를 단일 `10`으로 매핑한다. 숫자 `0`은 제외한다 — KSL 데이터에 존재하지 않으며, `model-evaluation.md` T-141이 "이미지 트랙의 `NUM_0`은 숫자 0이 아니라 10"이라고 정정한 바 있다.

## 2. 왜 별도 모델인가

기존 기록에 근거가 축적되어 있다.

| 근거 | 출처 |
| --- | --- |
| 자모+숫자 단일 LSTM은 자모 80.88% / 숫자 69.08%로 하락 — *"정적 숫자와 동적 자모 domain 충돌"* | `model-evaluation.md` T-02 |
| 숫자를 별도 head로 분리하니 95.39% | T-03 / E-01 |
| 이미지 모델은 자모 94% / 숫자 macro-F1 75%, 랜드마크는 숫자 94.7% — 두 도메인의 최적 표현이 다름 | T-137 / T-138 |
| 도메인 라우팅으로 자모 무회귀 + 숫자 93.0 → 97.17% | T-141 |

또한 지숫자는 10종·정적·손가락 개수 기반이라, 자모의 미해결 병목인 유사 모음(획 1개 차이)이 없다. 자모에서 넘지 못한 class-floor 93%를 숫자에서 넘길 여지가 더 크다.

## 3. 기존 숫자 head와의 차이 (설계 결정)

| 항목 | 기존 `jamo-number-41-tree-v1` | **number-10-v1** | 이유 |
| --- | --- | --- | --- |
| 입력 단위 | `[1, 10, 55]` 시퀀스 | **단일 프레임 `[78]`** | 지숫자는 정적. 시퀀스로 모델링할 대상이 없음 |
| 특징 | `feature_v2` 55차원 (2-D) | **`feature_v3` 78차원 (3-D + palm normal)** | 손가락 방향·손바닥 방향이 판별에 직접 기여. T-141 실측 95.39% → 97.17% |
| 정적 이미지 처리 | 같은 프레임 **10회 복제** | 복제 없음 | 아래 참조 |
| 도메인 판정 | tree가 자모/숫자 라우팅 | **모델 자체의 `none` class** | 라우터에 의존하지 않고 스스로 판별 |
| class 수 | 41 (자모 31 + 숫자 10) | **11** | 도메인 충돌 제거 |

### 3.1 10프레임 복제로 생기는 학습/서빙 분포 차이 (이 모델이 피하려는 것)

```python
# scripts/extract_number_features.py:88
features.append(np.repeat(feature[None, :], 10, axis=0))
# scripts/train_tree_model.py:39
np.concatenate((seq[:, -1], seq.mean(1), seq.std(1), seq[:, -1] - seq[:, 0]))  # 220차원
```

10프레임이 완전히 동일하므로 숫자 학습 샘플은 `std = 0`(55개), `last - first = 0`(55개) — **220차원 중 110개가 항상 0**이다. 자모 학습 데이터는 실제 촬영 시퀀스라 이 값들이 0이 아니다.

여기서 두 가지 가설이 나오며, **둘 다 아직 실측으로 확인되지 않았다**:

1. 트리가 "std가 0인가"를 자모/숫자 도메인 분리의 shortcut으로 학습했을 수 있다. 그렇다면 보고된 *"도메인 오분기 0건"* 은 일반화가 아니라 shortcut이다.
2. 실제 카메라 프레임은 손떨림 때문에 `std > 0`이므로, 숫자 포즈가 자모 도메인으로 라우팅될 수 있다.

`balance_numbers`가 summary 벡터에 `N(0, 0.0015)` 노이즈를 넣지만 실제 손떨림 대비 작아 경계를 흐리는 정도로 보인다.

**검증 방법(미실행):** ① `jamo-number-41.joblib`의 `feature_importances_`에서 인덱스 110~219 블록의 비중 확인, ② 실제 카메라로 숫자 포즈 프레임을 `hybrid` 프로필에 넣어 라우팅 결과 관찰. 이 검증 전까지 기존 숫자 95.39%를 라이브 성능 근거로 인용하지 않는다.

number-10-v1은 프레임 단위로 분류하므로 `std`/`delta` 채널 자체가 없고, 이 문제가 구조적으로 발생하지 않는다.

## 4. 데이터 계획

`model-evaluation.md` T-140~T-148의 결론은 명확하다 — **손실·margin·표현·분류기 레시피는 소진됐고, 신규 signer 데이터만 실제로 효과가 있었다**(`ㅔ` 0.86→0.966, 이미지 숫자 93.3→96.5%). 따라서 이 라인도 데이터에 예산을 둔다.

| 출처 | 라이선스 | 규모 | 용도 |
| --- | --- | --- | --- |
| KSL Numbers (Kaggle `nahyunpark/korean-sign-languageksl-numbers`) | CC0-1.0 | 1,107장 (검출 1,065) | **train 전용** — signer ID 없음 |
| Roboflow `oss-4tnzy/number-c08aw` | CC BY 4.0 | 93장 (반영 85장), digit 2~10, 다른 signer | **train 전용** |
| 자체 촬영 | — | 아래 | **valid + locked test** |

### 4.1 자체 촬영 프로토콜

`ai/data/collection-template/participant_template`를 재사용하되 숫자 폴더(`1`~`10`)를 추가한다. 현재 템플릿에는 자모 31종과 `none`만 있다.

- 참가자 **5~8명** × 10숫자 × 조건: 손바닥/손등, 상/하 회전, 좌/우손, 거리 2단, 조명 2단
- `none` 촬영 포함 (자모 포즈, 전환 프레임, 빈손)
- **숫자 9와 8을 집중 촬영** — T-145에서 `NUM_9`는 landmark 0.833 / 이미지 0.833으로 두 경로 모두 상한이며, 결론이 *"9↔8 손모양 혼동, ≥90은 신규 각도·signer 데이터 필요"* 였다. 유일한 미해결 class다.
- 분할은 파이프라인 문서 6.1 원칙대로 **참가자 단위 완전 분리**. `train_number_model.py`가 이를 강제하며, 참가자 ID가 없는 공개 데이터는 자동으로 train 전용이 된다.

부수 효과: 문서가 T-06부터 계속 *"라벨에 손바닥/손등·상하·조명 조건이 없어 측정 불가"* 라고 기록해온 조건별 지표를 이 라인에서 처음으로 실측할 수 있다.

## 5. 평가 게이트

평균으로 승격하지 않는다.

1. **class-floor**: 숫자 10종 각각 recall/F1 ≥ 93%. 선택 규칙은 `validation numberMinRecall` 최대화 → 동률 시 macro-F1 (T-124에서 검증된 선택기 방식)
2. **9↔8 혼동 건수** 별도 기록
3. **`none` false-accept rate**: 자모/전환 포즈가 숫자로 판정되는 비율
4. **조건 slice별 recall**: 손바닥/손등, 상하, 좌우손, 거리, 조명. proxy는 proxy로 표시
5. **실시간 지표**: 확정률, 분당 오확정, 중복/누락 전환, p50/p95 확정 지연. 정적 accuracy로 대체 금지
6. locked test는 **1회만** 평가하며, 모델·threshold 선택에 사용하지 않는다

`train_number_model.py`의 `targetMet`은 `classesBelowFloorCount == 0` **이면서** split이 signer-independent일 때만 true가 된다.

## 6. 실행 방법

### 6.0 데이터 현황 확인 (선행)

이 문서와 `training-handoff.md`가 언급하는 경로는 서로 다른 PC와 GPU 서버에 걸쳐 기록된 것이라, **문서에 있다고 해서 지금 그 장비에 있다는 뜻이 아니다.** 추출 회차를 계획하기 전에 실제 보유 현황을 먼저 확인한다.

```bash
# 원격 서버 (파일을 미리 옮길 필요 없음, 표준 라이브러리만 사용)
ssh <host> 'python3 -' < game-ai-dev-server/scripts/survey_number_data.py

# 로컬
python3 game-ai-dev-server/scripts/survey_number_data.py --root <추가 경로>
```

JSON으로 후보 경로별 존재 여부·이미지 수·라벨 폴더·레이아웃 추정, `hand_landmarker.task`의 SHA-256, 사용 가능한 인터프리터와 `mediapipe`/`scikit-learn` 설치 여부, git 체크아웃 상태를 함께 보고한다. 읽기 전용이며 아무것도 쓰지 않는다.

**2026-07-27 기준 개발 PC 실측:** 문서상 데이터 경로 13곳이 모두 부재하고 이미지 0장이다. `hand_landmarker.task`만 `origin/frontend`에서 확보했으며 SHA-256 `fbc2a300…cde1`로 파이프라인 문서의 고정값과 일치한다. 지숫자 데이터는 GPU 서버 또는 원 출처에서 조달해야 한다.

### 6.1 추출과 학습

특징 추출은 소스마다 한 번씩 실행해 각자의 audit·라이선스 기록을 남긴다.

```bash
# 공개 데이터 (provider 레이아웃: <split>/<label>/<image>)
python game-ai-dev-server/scripts/extract_number_frames.py \
  --dataset  <ksl-numbers 루트> \
  --output   work/training/number_ksl_v3.npz \
  --layout   provider \
  --source-name ksl-numbers --license CC0-1.0 \
  --source-url https://www.kaggle.com/datasets/nahyunpark/korean-sign-languageksl-numbers \
  --landmarker <hand_landmarker.task 경로>

# 자체 촬영 (participant 레이아웃: <participantId>/<label>/<image>)
python game-ai-dev-server/scripts/extract_number_frames.py \
  --dataset  <촬영 루트> \
  --output   work/training/number_captured_v3.npz \
  --layout   participant \
  --source-name captured-2026 --license internal \
  --landmarker <hand_landmarker.task 경로>

# 학습·평가 (여러 npz를 함께 전달)
python game-ai-dev-server/scripts/train_number_model.py \
  --features work/training/number_ksl_v3.npz work/training/number_captured_v3.npz \
  --output-dir models/number-10-v1 \
  --attempt-id T-150 --write-bundle
```

`--write-bundle` 없이 실행하면 `evaluation.json`만 쓰고 모델 번들은 만들지 않는다. 탐색 회차는 이 모드로 돌린다.

GPU는 필요 없다. 78차원 classical 모델이므로 CPU로 충분하며, GPU 서버를 쓸 경우에도 팀 규칙대로 물리 2번(`CUDA_VISIBLE_DEVICES=2`)만 사용한다.

## 7. 배포 통합 시 필요한 변경 (아직 하지 않음)

`NumberModelAdapter`는 현재 **자립형**이다. 랜드마크를 직접 받아 스스로 `feature_v3`를 만들고 11개 확률을 돌려준다. 오프라인 학습·평가에는 이것으로 충분하다.

실시간 서버에 붙이려면 기존 파일 한 곳을 고쳐야 한다.

```python
# app/recognition_session.py:22 — feature 크기가 v2(55)로 고정되어 있다
if runner.contract.feature_size != FEATURE_SIZE:
    raise ValueError(...)
```

`feature_adapter`가 `feature_v2`를 고정 재수출하므로 78차원 모델은 세션에 붙지 않는다. runner가 자기 feature 버전을 노출하도록 바꾸고 기존 프로필은 계속 v2를 반환하게 하면 동작은 불변이다. **이 변경은 별도 작업 단위로 분리한다** — 이번 브랜치는 기존 파일을 수정하지 않는다.

## 8. 회차 기록

각 회차는 다음을 함께 남긴다: 회차 ID, 실행 시각, seed, 데이터 출처·라이선스·표본 수·artifact SHA-256, split 기준과 signer 누수 여부, 후보 비교표, 선택 근거, class별 precision/recall/F1, 혼동 행렬, 9↔8 혼동, `none` false-accept, 직전 대비 변화, 판정.

실패 회차도 삭제하지 않는다. `model-evaluation.md`의 원칙 *"운영 후보에서 제외한 회차도 삭제하지 않는다"* 를 따라 반증 근거로 보존한다.

### T-150 — 공개 데이터(KSL) 기준선 (진단 회차, 목표 판정 대상 아님)

- **실행:** 2026-07-27, 개발 PC CPU, seed 42. 추출은 GPU 서버(`data-numbers/raw`, mediapipe 0.10.35, `MPLBACKEND=Agg`), 학습·평가는 로컬. 산출물 `number-t150-evaluation.json`.
- **데이터:** KSL Numbers(CC0-1.0) 1,107장 → MediaPipe 검출 **1,065 수용 / 42 실패(96.2%)**. 이 중 HEIC 343장. 문서 T-137의 기록(1,066 수용 / 41 실패)과 1장 차이로 사실상 재현됐다.
- **split:** provider 제공 폴더 기준 train 761 / test 304. valid가 없어 train의 15%를 seed 42로 떼어 **train 647 / valid 114 / test 304**. **signer-independent 아님** — 참가자 ID가 없어 같은 사람이 train과 test에 걸쳐 있을 수 있다.
- **`none` 학습 표본 0:** KSL에는 negative가 없다. 따라서 이 회차는 **10-class로만 학습**했고 `none` 거부 성능은 측정 불가다(`noneFalseAcceptRate: null`). 번들도 만들지 않았다 — 배포 번들은 11 class 전부를 요구한다.
- **후보 비교(validation, 숫자 최저 recall 기준):**

  | 분류기 | minRecall | macroF1 | 미달 | 학습시간 |
  | --- | ---: | ---: | ---: | ---: |
  | ExtraTrees(500) | 0.833 | 0.865 | 6 | 0.64s |
  | **KNN(k=7)** | **0.833** | **0.871** | **4** | 0.003s |
  | MLP(128,64) | 0.667 | 0.805 | 8 | 0.33s |

  → **KNN(k=7) 선택.** T-145가 숫자 head에서 KNN을 최선으로 꼽았던 것과 일치한다.
- **실측(test 304):** accuracy **92.76%**, 숫자 macro-F1 **93.37%**, 숫자 macro-recall 93.79%, **최저 recall 0.792(숫자 9)**. 93% floor 미달 **4개: `1`·`8`·`9`·`10`**.
- **class별 recall / f1:** `5` 1.000/1.000, `6` 1.000/1.000, `2` 1.000/0.968, `3` 1.000/0.980, `4` 0.967/0.983, `7` 0.967/0.983, `8` 0.963/**0.881**, `1` 0.867/**0.800**, `10` 0.825/**0.879**, `9` **0.792**/0.864.
- **오분류 집중(핵심):** 전체 오류가 두 쌍에 몰려 있다.

  | 혼동 | 건수 |
  | --- | ---: |
  | `10` → `1` | **9** |
  | `9` → `8` | **5** |
  | `1` → `10` | 3 |

#### 발견

1. **`9`↔`8`은 독립 데이터에서도 재현됐다.** T-145가 landmark·이미지 두 경로 모두 `NUM_9` 상한을 0.833으로 보고하며 *"9↔8 손모양 혼동, ≥90은 신규 각도·signer 데이터 필요"* 라고 결론냈는데, 다른 특징(v3)·다른 분류기(KNN)·다른 split에서 같은 방향으로 나왔다. **데이터 병목이라는 진단이 뒷받침된다.**
2. **`1`↔`10` 혼동은 이 회차에서 새로 드러났다(최다 오류).** `10`은 촬영 변형 `10-1`/`10-2`를 한 라벨로 합쳐 train 표본이 189개로 다른 class의 약 2배인데도 recall이 0.825로 낮고, 오류의 대부분이 `1`로 간다. **두 변형이 서로 다른 손모양인데 하나로 묶여 class 경계가 넓어졌고, 그 결과 `1`과 겹치는 것**이 가설이다. 다음 회차에서 `10-1`/`10-2`를 분리 학습해 검증할 수 있다.

   > **정정(T-151):** 이 가설은 **기각됐다.** 분리 검증 결과 `1`↔`10` 혼동은 라벨 병합이 아니라 **KNN 분류기의 약점**이었다. ExtraTrees는 병합 상태 그대로도 혼동이 9건→5건으로 줄고 `1` recall이 0.933으로 오른다. 근거는 T-151 절을 따른다.
3. **`8`은 precision이 낮다(0.812).** recall 0.963은 높은데 `9`에서 5건이 흘러들어온 결과다. `8` 자체 문제가 아니라 `9`의 누출이다.

#### T-137과의 차이

같은 provider test 304장인데 T-137은 accuracy **94.74%** / 숫자 macro-F1 95.3%, 이번은 **92.76%** / 93.37%로 약 **-1.9%p**다. class별로는 더 크게 갈린다 — T-137은 `9` recall 1.000·`8` 0.852였는데 이번은 `9` 0.792·`8` 0.963으로 **최약 class가 서로 뒤바뀌었다.**

원인 후보를 순위 없이 적는다. 이 회차만으로는 가릴 수 없다.

- class당 test support가 22~57장이라 오분류 1~2건이 recall을 0.04~0.08 흔든다. T-146이 이미 *"recall이 레시피가 아니라 런에 따라 요동하며 이 변동이 레시피 효과를 압도한다"* 고 기록했고, 이번 차이도 그 폭 안에 있다.
- 학습 표본이 15% 적다(T-137은 762 전량, 이번은 valid를 떼어 647).
- 특징이 다르다(T-137 `feature_v2` 55차원, 이번 `feature_v3` 78차원).
- 분류기가 다르다(ExtraTrees vs KNN).
- MediaPipe 버전이 다르다(이번 0.10.35). 랜드마크 자체가 달라진다.
- T-137을 만든 `ksl_number_probe.py`가 저장소에 없어 조건을 정확히 대조할 수 없다.

**따라서 "v3가 v2보다 낫다/못하다"를 이 회차로 주장하지 않는다.** 앞서 인용한 T-141의 숫자 97.17%도 test 집합이 달라(MediaPipe 검출 성공 247장) 직접 비교 대상이 아니다.

#### 판정

**진단 회차. 목표 판정 대상이 아니다**(`targetMet: false`). signer-independent가 아니고, `none`이 없어 거부 성능을 측정하지 못했으며, 번들도 만들지 않았다. 운영 모델과 기존 자모 head는 건드리지 않았다.

#### 다음 회차 후보

1. **`10-1`/`10-2` 분리 학습** — 발견 2의 가설 검증. 데이터 추가 없이 라벨 규약만 바꿔 확인할 수 있어 비용이 가장 낮다.
2. **v2 대 v3 동일 split 대조** — 같은 이미지에서 두 특징을 뽑아 같은 분류기로 비교. T-137과의 차이 중 특징 요인만 분리한다.
3. **`none` 확보** — 자체 촬영 또는 기존 자모 랜드마크를 negative로 전환. 이것 없이는 배포 번들을 만들 수 없다.
4. **자체 촬영(참가자 분리 + `9`·`8` 집중)** — 위 셋과 달리 목표 판정을 가능하게 하는 유일한 경로다.

1·2는 서로 독립이므로 한 회차에 섞지 않는다.

### T-151 — `10-1`/`10-2` 분리 학습 (가설 기각, 개선분은 대부분 분류기 효과)

- **가설:** T-150 발견 2. `10-1`과 `10-2`가 서로 다른 손모양인데 한 라벨로 묶여 class 경계가 넓어졌고, 그래서 `1`과 겹친다. 분리해 학습하면 `1`↔`10` 혼동이 줄 것이다.
- **기법:** 추출을 다시 하지 않았다. 추출기가 원본 상대경로를 `sources`에 남기므로 그 두 번째 성분에서 변형을 복원할 수 있다. `--ten-variants`를 주면 내부 12 class(`1`~`9`, `10-1`, `10-2`, `none`)로 학습하고, **채점 직전에 두 변형의 확률을 더해 11-label 계약으로 되돌린다.** 회차 간 비교가 항상 같은 공간에서 이뤄지도록 하기 위해서다. 데이터·split·seed는 T-150과 동일.
- **교란 발견과 대응:** 첫 실행에서 선택 분류기가 KNN→ExtraTrees로 함께 바뀌어(validation minRecall 동률 0.833, macroF1 tie-break) 라벨 효과와 분류기 효과가 섞였다. `--candidate`로 분류기를 고정하고 2×2로 다시 돌렸다.
- **실측(test 304, 전부 동일 split):**

  | 런 | 분류기 | 라벨 | accuracy | 숫자 macroF1 | minRecall | 미달 | `1` | `9` | `10` | `10`→`1` | `9`→`8` |
  | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
  | T-150 | KNN | 병합 | 0.9276 | 0.9337 | **0.7917** | 4 | 0.867 | 0.792 | 0.825 | 9 | 5 |
  | T-151B | KNN | 분리 | 0.9276 | 0.9337 | 0.7917 | 4 | 0.867 | 0.792 | 0.825 | 9 | 5 |
  | T-151C | ExtraTrees | 병합 | 0.9408 | 0.9403 | 0.6667 | 4 | 0.933 | 0.667 | 0.895 | 5 | 8 |
  | T-151 | ExtraTrees | 분리 | **0.9474** | **0.9472** | 0.7083 | 4 | 0.933 | 0.708 | 0.912 | 5 | 7 |

#### 판정

**가설 기각.** `1`↔`10` 혼동의 원인은 라벨 병합이 아니라 **분류기**였다.

1. **KNN에서는 라벨 분리 효과가 소수점 4자리까지 정확히 0이다**(T-150 = T-151B, 혼동 행렬까지 동일). 이는 우연이 아니라 구조적이다 — k-이웃 집합은 라벨을 쪼개도 바뀌지 않고, 나뉜 표를 다시 합치면 원래 확률이 복원된다. **KNN에 대해 "라벨 세분화 후 확률 합산"은 항등 연산이다.** 이 계열의 재시도는 하지 않는다.
2. **`1`↔`10` 혼동은 ExtraTrees로 바꾸는 것만으로 9건→5건, `1` recall 0.867→0.933이 된다**(T-151C, 라벨은 병합 그대로). 라벨 분리는 이 쌍을 더 줄이지 못했다(5건 유지).
3. T-150→T-151의 accuracy +1.98%p를 분해하면 **분류기 +1.32%p / 라벨 +0.66%p**다. 라벨 분리의 순효과는 ExtraTrees에서만, 그것도 작게 나타난다(minRecall 0.667→0.708, `10` 0.895→0.912, `9`→`8` 8건→7건).

#### 남는 긴장: 평균 대 바닥

ExtraTrees-분리가 accuracy·macroF1 모두 최고지만 **minRecall은 KNN이 0.792로 가장 높다**(ExtraTrees는 0.667~0.708). 이 라인의 선택 규칙은 *숫자 최저 recall 우선*이므로, test 기준으로는 **KNN이 여전히 규칙에 맞는 선택**이다. 다만 validation에서는 둘이 0.833으로 동률이라 규칙만으로는 갈리지 않았고, 그 동률을 macroF1이 깨면서 ExtraTrees가 뽑혔다. **validation 114장으로는 분류기를 가릴 수 없다**는 것이 이 회차의 부수적 발견이다.

`9`는 네 구성 모두에서 최악이다(0.667~0.792). 어떤 분류기·라벨 조합으로도 0.8을 넘지 못했다. T-145·T-150에 이어 **데이터 병목이라는 진단이 세 번째로 재확인**됐다.

#### 다음

라벨 규약과 분류기 탐색은 여기서 멈춘다. 남은 유효 레버는 T-150 후보 목록의 ③ `none` 확보와 ④ 자체 촬영이며, 특히 `9`·`8`의 신규 각도·signer 표본이 필요하다. 분류기 최종 선택은 validation이 충분히 커진 뒤에 다시 판단한다.
