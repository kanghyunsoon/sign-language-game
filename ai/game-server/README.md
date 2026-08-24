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
cd ai/game-server
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

landmark 변환은 `app/feature_adapter.py`가 소유한다. 자모 전용 빌드는 **duel-head 앙상블**이라 같은 MediaPipe 랜드마크에서 두 표현을 모두 만든다.

- **v2 (`app/feature_v2.py`, 55값)** — 20개 정규화 2D bone vector + 15 angle. 대량 세션 캡처로 학습돼 표본이 많은 자모에서 강하다.
- **v3 (`app/feature_v3.py`, 78값)** — 20개 정규화 **3D** bone direction(60) + 15 angle + palm-facing normal(3). 상대 깊이와 손바닥 평면을 유지해 2D 실루엣이 비슷한 자모(ㅅ/ㅠ, ㅔ/ㅕ, 손등 방향·상하 반전)를 구분한다.

두 표현 모두 왼손 x를 mirror한다. 프론트가 이미 x·y·z를 전송하므로 **프론트 변경은 없다.** 더 이상 `Sign_Language_Translation`을 import하지 않는다.

## 모델·학습 산출물 (자모 전용 빌드)

- 기준선 보존: `models/baseline/jamo-31-v1/manifest.json`
- **운영 자모 모델: `models/jamo-31-ensemble-v1/`** — `jamo31-v2big.tflite`(55) + `jamo31-v3.tflite`(78) 듀얼 헤드, 확률 평균(w=0.5). locked test 정확도 **98.7%**, 최저 클래스 recall **0.83**, 31자모 중 29개 ≥0.90(27개는 1.00). 하드네거티브 margin으로 `ㅜ→ㅏ`(0.71→1.00) 등 혼동쌍 해소. `.keras` 원본과 `manifest.json`(per-class recall 포함) 동봉.
- TFLite는 LSTM unroll로 변환해 **Flex(Select TF ops) 의존이 없다** — 어떤 TF 버전에서도 로드된다.

### 판정 여유(decision margin) 게이트

모델은 의도적으로 관대하다(회전 증강으로 손목 각도 허용폭을 넓혔다). 그래서 **엉성하게 만든 손모양도 top-1 확률이 높게 나온다.** 확정 임계값을 올려서 막으려 하면 엉성한 입력이 걸러지는 게 아니라 절대 확신도가 원래 낮은 자모가 통째로 막힌다(실측: 임계값 0.6에서 `ㅅ`이 프레임 16%를 잃는 동안 엉성한 입력 차단은 0건).

구분되는 신호는 **2위와의 격차(top1 − top2)** 다. locked test 실측:

| | 격차 중앙값 |
| --- | --- |
| 정답 프레임 | **0.984** (p5 0.293) |
| 오답 프레임 | **0.159** (p25 0.083) |

| 격차 기준 | 정답 유지 | 오답 차단 |
| --- | --- | --- |
| 0.00 | 1.000 | 0.000 |
| 0.20 | 0.965 | 0.600 |
| **0.25 (기본)** | **0.957** | **0.733** |
| 0.30 | 0.949 | 0.833 |
| 0.40 | 0.934 | 0.933 |

격차가 기준 미달이면 서버가 **확신도를 눌러서**(0.05) 내보내므로 브라우저 시간축 디코더가 확정하지 못한다. **argmax 라벨은 유지**하므로 top-candidate 피드백은 그대로 동작한다. 연습 난이도를 조이려면 `HANDPRACTICE_AI_MIN_MARGIN`을 0.3~0.4로 올린다(프론트 수정 불필요).
- 숫자 인식은 별도 모델로 분리되었으며, 이 빌드에서 숫자/하이브리드 헤드와 관련 스크립트는 제거되었다.

원본 데이터와 중간 feature는 `.gitignore`의 `work/datasets`, `work/training`, `work/experiments` 아래에만 둔다. Git에는 데이터셋 원본을 올리지 않는다. 정확한 평가 조건과 한계는 `ai/game-server/docs/recognition/model-evaluation.md`가 기준이다.

다른 PC에서 설치·실행·검증·재학습을 이어가는 절차와 새 Codex 시작 메시지는 `frontend/src/game/docs/other-pc-handoff.md`를 따른다.
