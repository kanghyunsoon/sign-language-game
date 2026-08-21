# AI-013(컨테이너 배포) ↔ #78(모델 아티팩트·baseline) 병합 해소 가이드

두 브랜치는 `ai`에서 분기한 형제이며, `ai`로 병합 시 **3개 파일이 충돌**한다(로컬 `git merge-tree`로 확인). 아래대로 해소하면 결정론적으로 원하는 최종 상태가 된다.

- 목표 최종 상태: **AI-013의 컨테이너화(env HOST/PORT·MODEL_ROOT·Dockerfile) + #78의 baseline 기본 프로필**.
- 전제 결정: 기본 프로필 = **baseline**(게임 18fps·숫자 제외 정책, deployment-readiness 리스크 1). 이 결정은 #78 리뷰어이자 AI-013 작성자(이인성)와 확정할 것.

## 충돌 파일과 해소

### 1) `app/main.py` — AI-013 버전 채택(theirs)
#78은 main.py 로직을 바꾸지 않았고, AI-013이 `HANDPRACTICE_AI_HOST/PORT` 검증·`INTERNAL_ERROR` 처리·요청 파이프라인을 추가했다. → **AI-013 버전을 그대로 취한다.**
```
git checkout --theirs game-ai-dev-server/app/main.py    # (AI-013을 병합해 들일 때)
```

### 2) `app/project_paths.py` — AI-013 버전 채택
`HANDPRACTICE_MODEL_ROOT` 지원 버전(AI-013)을 취한다. (#78은 이 파일을 의미 있게 바꾸지 않음 → 대개 자동 병합되나, 충돌 시 theirs.)

### 3) `app/model_adapter.py` — **합집합**(AI-013 경로 + baseline 기본값)
서로 다른 구간이 바뀌었으므로 양쪽을 모두 살린다.
- AI-013(theirs) 유지: `from .project_paths import MODEL_ROOT, REPOSITORY_ROOT`, `DEFAULT_MODEL_PATH = MODEL_ROOT / ...`, `EXPANDED_MODEL_DIRECTORY = MODEL_ROOT / ...`.
- #78(ours) 유지: `create_model_runner`의 기본값 **baseline**.

최종 해당 라인:
```python
from .project_paths import MODEL_ROOT, REPOSITORY_ROOT
DEFAULT_MODEL_PATH = MODEL_ROOT / "multi_hand_gesture_classifier.tflite"
EXPANDED_MODEL_DIRECTORY = MODEL_ROOT / "jamo-number-41-tree-v1"
...
def create_model_runner(profile: str | None = None) -> ModelRunner:
    selected = (profile or os.getenv("HANDPRACTICE_AI_MODEL", "baseline")).strip().lower()
```

### 4) `tests/test_model_smoke.py` — **합집합**, 단 기본값 테스트는 baseline
- AI-013(theirs)의 유용한 추가 **유지**: `@unittest.skipUnless(DEFAULT_MODEL_PATH.is_file(), ...)` 가드, `test_model_root_*`, `test_server_address_*`(컨테이너 설정) 등.
- 기본 프로필 테스트는 **#78의 `test_baseline_is_default_and_exposes_jamo_labels`(TFLiteModelAdapter 기대)를 채택**하고, AI-013의 `test_hybrid_is_default_and_exposes_all_labels`(HybridModelAdapter 기대)는 **제거**한다. (hybrid는 명시적 `HANDPRACTICE_AI_MODEL=hybrid` 선택 시에만 검증하도록 별도 테스트로 남겨도 됨.)
- import 충돌: `TFLiteModelAdapter, TreeModelAdapter, HybridModelAdapter, create_model_runner`를 모두 포함하도록 합친다.

### 5) 신규 파일(AI-013) — 그대로 추가
`Dockerfile`, `Dockerfile.dockerignore`, `docker-compose.ec2.example.yml`, `.env.ec2.example`, `tests/test_websocket_handler.py`. 충돌 없음.

### 6) `README.md`
자동 병합될 가능성이 높으나, 최종본에 **기본 baseline 설명 + 컨테이너 실행 절차(env HOST/PORT·MODEL_ROOT)**가 모두 남도록 확인한다.

## 병합 후 검증(필수)
```bash
cd game-ai-dev-server
python -m unittest discover -s tests -t . -v   # 16개+추가 전부 green, 기본값 baseline 확인
HANDPRACTICE_AI_MODEL=baseline python -m app.main   # 로컬 기동 스모크
# 컨테이너: docker build -f Dockerfile -t sudal-ai .  (모델은 /app/models 볼륨으로 주입)
```
- 특히 `create_model_runner()`(인자 없이) → `TFLiteModelAdapter`(baseline)인지, 컨테이너에서 `HANDPRACTICE_AI_HOST=0.0.0.0` 바인딩이 실제로 열리는지 확인.

## 권장 순서
1. **default 프로필 결정 확정**(baseline) — 이인성과.
2. AI-013을 `ai`에 먼저 병합(컨테이너 기반 확보).
3. #78을 갱신된 `ai`에 rebase하며 위 3)·4)를 baseline으로 해소 → `ai`가 "컨테이너화 + baseline" 최종 상태.
   - 또는 #78 먼저 병합 후 AI-013 rebase 시, model_adapter/test의 기본값을 baseline으로 맞춰 해소.
