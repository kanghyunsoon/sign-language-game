# Game AI development server

이 서버는 운영 AI 서버와 교체 가능한 로컬 어댑터다. `ws://localhost:8765`에서 프런트가 추출한 MediaPipe 21개 landmark만 받고 카메라·이미지·영상은 받지 않는다. 현재 게임은 숫자 인식을 제외하므로 기본값은 지문자 전용 `baseline` 프로필이다.

## 구현체 교체 경계

`app.model_adapter.ModelRunner`가 게임 서버가 의존하는 유일한 추론 인터페이스다. `contract`는 label 순서·입력 shape·버전을, `predict([1,10,55])`는 확률 배열을 제공한다. `create_model_runner()`가 아래 구현을 선택하므로 WebSocket/session 코드는 모델 형식을 모른다.

| `HANDPRACTICE_AI_MODEL` | 구현 | 용도 |
|---|---|---|
| `baseline` (기본) | 기존 31자모 TFLite | 현재 게임용 저지연 지문자 인식 |
| `hybrid` | 기존 자모 TFLite + 자모/숫자 domain router + 숫자 tree | 숫자 비교 실험 |
| `expanded` | 41-class Extra Trees | 비교 실험/진단 |

향후 원격 AI 서버는 이 프로세스 자체를 교체해 같은 WebSocket 계약을 구현하거나, `ModelRunner` 구현체를 추가해 `create_model_runner()`에 등록하면 된다. 프런트 게임 코드는 수정하지 않는다.

새 모델 번들은 artifact와 `manifest.json`을 같은 폴더에 복사하고 `HANDPRACTICE_EXPANDED_MODEL_DIR`에 그 폴더를 지정한다. label·shape·SHA-256 검증을 통과하면 서버가 로드한다. 즉 모델 교체 때문에 session, WebSocket, 게임 코드를 수정하지 않는다.

## Run

```powershell
cd game-ai-dev-server
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m app.main
```

For the shared development environment used by this repository:

```powershell
$env:HANDPRACTICE_AI_MODEL="baseline"
python -m app.main
```

로컬 21개 landmark를 warm-up 12회 후 120회 순차 전송한 2026-07-23 측정에서 `hybrid`는 평균 169.078ms/p95 220.968ms/5.96fps, `baseline`은 평균 2.288ms/p95 3.216ms/429.78fps였다. 현재 프런트의 18fps 전송과 숫자 제외 정책에는 `baseline`을 사용한다.

Run tests with:

```powershell
python -m unittest discover -s tests -t . -v
```

landmark 변환은 `app/feature_v2.py`가 단독 소유한다. 20개 정규화 2D bone vector(40값)와 15개 angle을 합친 55값이며, 학습 좌표계에 맞춰 왼손 x를 mirror한다. 더 이상 `Sign_Language_Translation`을 import하지 않는다.

## 모델·학습 산출물

- 기준선 보존: `models/baseline/jamo-31-v1/manifest.json`
- 숫자/영역 모델: `models/jamo-number-41-tree-v1/manifest.json`
- 배포 조합 계약: `models/jamo-number-hybrid-v1/manifest.json`
- 숫자 이미지 추출: `scripts/extract_number_features.py`
- 신경망 비교 실험: `scripts/train_expanded_model.py`
- 최종 tree 재현: `scripts/train_tree_model.py`
- 배포 조합 평가: `scripts/evaluate_hybrid_model.py`

원본 데이터와 중간 feature는 `.gitignore`의 `work/datasets`, `work/training`, `work/experiments` 아래에만 둔다. Git에는 데이터셋 원본을 올리지 않는다. 정확한 평가 조건과 한계는 `game-ai-dev-server/docs/recognition/model-evaluation.md`가 기준이다.

다른 PC에서 설치·실행·검증·재학습을 이어가는 절차와 새 Codex 시작 메시지는 `frontend/src/game/docs/other-pc-handoff.md`를 따른다.
