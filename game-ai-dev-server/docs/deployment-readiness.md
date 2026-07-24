# AI 배포 준비 검증 및 트러블슈팅 (2026-07-24)

`feature/S15P11A405-370-ai-model-artifacts` 브랜치 기준으로 AI 영역(`game-ai-dev-server`, `ai/` fingerspelling 패키지, `models/`, `game-contracts/`)의 배포 가능 여부와 배포 후 리스크를 실제 실행으로 검증한 기록이다. backend는 범위에서 제외했으며(이미 배포됨: `https://i15a405.p.ssafy.io/api`), 이 브랜치에는 backend·frontend 소스가 추적되지 않는다.

## 검증 환경

- 검증 일자: 2026-07-24
- 실행 환경: Linux, Python 3.10.12 (샌드박스)
- 설치: `tensorflow-cpu 2.19.1`, `scikit-learn 1.7.2`(주의: 배포 핀은 1.9.0), `joblib 1.5.2`, `websockets 15.0.1`, `numpy<2.2`

## 실행한 검증과 결과

| 항목 | 방법 | 결과 |
| --- | --- | --- |
| `game-ai-dev-server` 단위 테스트 | `python -m unittest discover -s tests -t .` | **16개 전부 통과** (리스크 1 수정 반영 후 green) |
| 1:1 동시 접속(대전) 스모크 | 두 클라이언트 동시 연결 + 프레임 인터리브 스트리밍 | 두 세션 각각 **10/10 PREDICTION**, A가 매 스텝 `RESET_SEQUENCE` 해도 **B 6/6 정상**(세션 격리 확인), env 미설정 시 기본 baseline 로드 확인 |
| `ai/` fingerspelling 테스트 | `PYTHONPATH=src pytest -q` | **15개 전부 통과** |
| 모델 아티팩트 무결성 | manifest의 SHA-256과 실제 파일 대조 | baseline `.tflite`/`.h5`, tree `.joblib` **4건 전부 일치** |
| 인식 서버 기동 스모크 | `HANDPRACTICE_AI_MODEL=baseline python -m app.main` + WebSocket 클라이언트 | 기동·리스닝 정상, `GET_CAPABILITIES`→`CAPABILITIES`(jamo-31-v1, seq 10), 15 `LANDMARK_FRAME`→15 `PREDICTION` 정상 |
| 인식 계약 정합성 | `game-contracts/recognition/readiness.json` ↔ baseline 라벨/버전 | 일치 (관련 테스트 통과) |
| 배포 백엔드 라이브니스·계약 | 읽기 전용 GET 프로브 | `/api/v3/api-docs` OpenAPI 3.1 JSON 정상, `/api/actuator/health` Actuator 응답, 인증 필요 GET(`/users/me`·`/rankings`·`/signs`·`/webrtc/ice-servers`) 비인증 시 빈 응답(라우트 존재 + 인증 enforcement) |
| 배포 백엔드 1:1 SIGN_DUEL e2e | `scripts/e2e_sign_duel.py` 실측(배포 백엔드 직접 대상) | **13/13 PASS** — 가입·방생성(realtimeTicket)·참가·준비·티켓·게임방 WS 핸드셰이크·`GAME_STARTED`·`SIGNAL` 양방향 중계·결과(201)·랭킹(200)·테스트 계정 teardown(withdraw 204) 전 구간 정상 |
| 시크릿 노출 | 추적 파일 전체 정규식 스캔 | 토큰/키/자격증명 **없음** |

## 배포 후 리스크 및 필요 조치

### 리스크 1 (해결됨) — 인식 서버 기본 프로필이 `hybrid`였음

검증 시점에 `app/model_adapter.py`의 `create_model_runner()` 기본값이 `hybrid`였고, `app/main.py`가 인자 없이 이를 호출해 **환경변수 미지정 배포 시 `hybrid`가 로드**되는 문제가 있었다. 이는 README(기본 baseline)·단위 테스트·성능(hybrid 5.96fps ≪ 프런트 18fps)·"숫자 제외" 제품 결정과 모두 충돌했고, `test_baseline_is_default_and_exposes_jamo_labels`가 실패해 테스트 스위트가 red였다.

**조치(반영 완료):** 기본값을 `baseline`으로 되돌렸다.

```python
selected = (profile or os.getenv("HANDPRACTICE_AI_MODEL", "baseline")).strip().lower()
```

수정 후 단위 테스트 16/16 green, env 미설정 서버 기동 시 baseline(jamo-31-v1) 로드를 확인했다. (숫자 인식이 필요한 실험 시에만 `HANDPRACTICE_AI_MODEL=hybrid`/`expanded`를 명시적으로 지정)

### 리스크 2 (필수) — 배포 인터프리터 Python 버전 제약이 미문서화

`requirements.txt`가 `scikit-learn==1.9.0`으로 핀되어 있고, 이 버전은 **Python ≥ 3.11**을 요구한다. Python 3.10 이하에서는 `pip install -r requirements.txt`가 즉시 실패한다(3.10 샌드박스에서 재현됨). `ai/` 패키지는 `requires-python >=3.10,<3.13`이다. 두 영역을 함께 만족하는 배포 인터프리터는 **Python 3.11 또는 3.12**다. README/배포 스크립트에 필요한 Python 버전을 명시할 것.

### 리스크 3 (권장) — tree 모델 pickle의 sklearn 버전 일치

`jamo-number-41.joblib`는 `scikit-learn 1.9.0`으로 직렬화되었다. 다른 버전(예: 1.7.2)에서 로드하면 `InconsistentVersionWarning`이 발생하며 "invalid results" 가능성이 경고된다(검증 시 확인됨; 스모크 결과 자체는 정상이었으나 경고 존재). 배포 환경에는 핀과 동일한 `scikit-learn==1.9.0`을 설치할 것(리스크 2와 함께 Python 3.11+ 필요).

### 리스크 4 (경미) — `game-ai-dev-server/work/` 미(未)ignore

`README.md`는 원본 데이터/중간 feature를 `work/datasets`, `work/training`, `work/experiments`에 두라고 안내하지만, 루트 `.gitignore`에는 `ai/` 경로만 있고 `game-ai-dev-server/work/`가 없다. 대용량 데이터가 실수로 커밋될 여지가 있으니 `.gitignore`에 `game-ai-dev-server/work/`를 추가 권장.

### 리스크 5 (경미) — 빈 추적 파일 `AI_TRAINING_HANDOFF.md`

루트의 `AI_TRAINING_HANDOFF.md`가 0바이트로 추적되고 있다. 내용을 채우거나 정리 권장.

## 1:1 대전 검증 범위와 배포 전 e2e 체크리스트

배포 판단의 핵심은 "1:1 대전이 실제로 동작하는가"이다. 이 브랜치에서 실제 실행으로 검증 가능한 것과, 전체 스택 환경에서 반드시 추가 확인해야 하는 것을 구분한다.

**이 브랜치에서 검증 완료(AI 인식 서버 관점의 1:1):**
- 두 클라이언트 동시 접속 시 각자 독립 세션으로 인식 수행(각 10/10 PREDICTION).
- 한 클라이언트의 `RESET_SEQUENCE`가 다른 클라이언트 세션에 영향 없음(격리 6/6).
- 동일 인식 계약·모델 버전(jamo-31-v1)을 두 세션이 공유, env 미설정 시 baseline 자동 로드.

**배포 전 반드시 전체 스택에서 추가 확인(이 브랜치에 소스 없음 — frontend/backend 필요):**
- 방 생성→참가→준비→시작 흐름: `POST /game-rooms`(gameType=`SIGN_DUEL`, 응답 `realtimeTicket`)→`/join`→`/ready`→`/start`(전원 준비 시 `IN_PROGRESS`).
- 방 실시간 연결: `POST /auth/sse-ticket`으로 티켓 발급 후 `/ws/game-rooms/{roomId}` 핸드셰이크, `GAME_STARTED`·`PEER_*`·`SIGNAL` 메시지 수신.
- WebRTC P2P: `/webrtc/ice-servers`의 STUN/TURN으로 상대 영상 연결, `SIGNAL`(offer/answer/ICE) 중계.
- 각 클라이언트가 자신의 AI 인식 서버에 landmark 스트리밍 → 인식 결과로 대전 진행, 상대 이탈(`PEER_DISCONNECTED`/`PEER_LEFT`)·재접속(`PEER_RECONNECTED`) 처리.
- 결과 보고: `POST /game-rooms/{roomId}/results`(winnerUserId, 무승부 허용) 후 방이 `WAITING`으로 복귀해 재대결 가능.
- 랭킹 반영: `GET /rankings?gameType=SIGN_DUEL` Top5·본인 순위 갱신.

> 위 e2e는 브라우저 2대(카메라·MediaPipe·WebRTC)와 배포 backend가 필요해 이 샌드박스/브랜치에서 자동 실행이 불가하다. 배포 전 스테이징에서 위 체크리스트를 수동 검증할 것. 배포 backend(`/api/v3/api-docs`)는 라이브이며 위 계약을 제공함을 확인했다.

## 트러블슈팅 (검증 중 실제로 겪은 항목)

- **`scikit-learn==1.9.0` 설치 실패**: `ERROR: Could not find a version that satisfies the requirement scikit-learn==1.9.0`. 원인은 해당 버전이 Python ≥ 3.11을 요구하는데 인터프리터가 3.10이기 때문. 해결: Python 3.11/3.12 사용(리스크 2).
- **`tf.lite.Interpreter` 사용 시 Deprecation 경고**: TF 2.20에서 삭제 예정이라는 경고 발생. `requirements.txt`가 `tensorflow<2.20`으로 상한을 두어 현재는 동작하지만, 향후 `ai_edge_litert`(LiteRT)로의 이관을 검토할 것.
- **인식 서버 스모크 시 표준출력 버퍼링**: 파이프로 실행하면 "listening" 로그가 지연 출력되어 클라이언트 접속 판단이 늦어질 수 있다. 운영에는 무관하나 자동화/헬스체크 스크립트는 `python -u`(언버퍼드)로 기동하면 안정적이다.
- **`ai/` 테스트 discover 실패**: `tests/`에 `__init__.py`가 없어 `unittest discover`가 "Start directory is not importable"로 실패한다. `pytest`로 실행하면 정상(15 통과).

## 재현 절차

```bash
# game-ai-dev-server
cd game-ai-dev-server
pip install -r requirements.txt          # Python 3.11+ 필요 (리스크 2)
python -m unittest discover -s tests -t . -v
HANDPRACTICE_AI_MODEL=baseline python -m app.main   # 스모크 기동

# ai/ fingerspelling 패키지
cd ../ai
pip install pytest
PYTHONPATH=src pytest -q
```
