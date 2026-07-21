# 다른 PC·Codex 작업 인수인계

이 문서는 다른 PC에서 저장소를 받은 직후 현재 게임·AI 작업을 그대로 실행하고, 새 Codex 작업이 재조사 없이 이어서 진행할 수 있게 하는 canonical 인수인계 문서다. 같은 내용의 새 문서를 만들지 말고 이후 상태 변화는 이 파일과 관련 전문 문서를 갱신한다.

## 먼저 알아야 할 결론

- 작업 원본 위치는 `C:\Users\khsoo\Desktop\handpractice`다.
- Git branch는 `260721`, remote는 `https://github.com/kanghyunsoon/handpractice.git`이다.
- AI 서버 기본 프로필은 `hybrid`다. 모델 파일까지 커밋·push된 저장소를 clone하면 환경변수 없이 `jamo-number-hybrid-v1`이 로드된다.
- Python 가상환경, `frontend/node_modules`, 원본 공개 데이터, 추출 feature와 실패 실험은 Git에 포함하지 않는다. 새 PC에서 의존성은 다시 설치해야 한다.
- 최종 추론은 Git에 포함하는 모델만으로 실행된다. 재학습을 이어가려면 공개 숫자 데이터는 새 PC에서 다시 내려받아야 한다.

## Git에 반드시 포함할 범위

현재 변경을 올리기 전 `git status --short`에서 아래 범위가 모두 stage됐는지 확인한다.

```text
.gitignore
readme.md
frontend/package-lock.json
frontend/src/game/
game-ai-dev-server/
game-dev-backend/dev-app/src/main/java/com/signlanguage/prototype/devsupport/websocket/
game-dev-backend/dev-app/src/test/java/com/signlanguage/prototype/devsupport/websocket/
models/baseline/
models/jamo-number-41-tree-v1/
models/jamo-number-hybrid-v1/
```

특히 `models/jamo-number-41-tree-v1/jamo-number-41.joblib`을 빠뜨리면 기본 hybrid 서버가 시작되지 않는다. 파일 기준값은 다음과 같다.

```text
크기: 32,870,228 bytes
SHA-256: 42DB2A726412671EB75F7DA8627E1FD4FB94999651788F735B344E0BB21441A8
```

Windows PowerShell 검증:

```powershell
Get-FileHash models\jamo-number-41-tree-v1\jamo-number-41.joblib -Algorithm SHA256
git status --short
git diff --cached --stat
```

권장 커밋 분리는 다음 세 개다. 다른 팀원이 같은 파일을 수정했다면 먼저 최신 branch를 받아 충돌을 파일별로 해결한다.

1. AI feature/model adapter, 학습 스크립트, versioned 모델과 평가 문서
2. 블록 1:1 참가자 자동 입장과 프런트 회귀 테스트
3. 더미 백엔드 공통 Match topic 분기와 백엔드 테스트

한 번에 현재 인수 범위를 올릴 경우 명령은 다음과 같다. 실행 전 다른 사람이 만든 추가 변경이 없는지 `git status`로 다시 확인한다.

```powershell
git add .gitignore readme.md frontend/package-lock.json frontend/src/game `
  game-ai-dev-server `
  game-dev-backend/dev-app/src/main/java/com/signlanguage/prototype/devsupport/websocket `
  game-dev-backend/dev-app/src/test/java/com/signlanguage/prototype/devsupport/websocket `
  models/baseline models/jamo-number-41-tree-v1 models/jamo-number-hybrid-v1
git status --short
git diff --cached --stat
git commit -m "feat: add hybrid jamo number model and game handoff"
git push origin 260721
```

현재 작업은 아직 자동으로 commit/push된 상태가 아니다. 위 push가 성공한 뒤에만 다른 PC의 clone/pull에서 이 변경과 모델을 받을 수 있다.

## 새 PC 최초 설치

검증된 환경은 Windows, Node.js 22.14.0, Java 17, Python 3.12.13이다. 완전히 같은 patch version이 필수는 아니지만 Node 22, Java 17, Python 3.12를 우선 사용한다.

```powershell
git clone --branch 260721 https://github.com/kanghyunsoon/handpractice.git
cd handpractice

cd frontend
npm.cmd ci
cd ..

python -m venv game-ai-dev-server\.venv
game-ai-dev-server\.venv\Scripts\python.exe -m pip install -r game-ai-dev-server\requirements.txt
```

`npm ci`가 lock 불일치로 실패하면 받은 commit에 갱신된 `frontend/package-lock.json`이 포함됐는지 먼저 확인한다. 임의로 dependency version을 바꾸지 않는다.

## 실행 순서

서로 다른 PowerShell 창 세 개에서 실행한다.

```powershell
# 1. 더미 게임 서버
cd game-dev-backend
.\gradlew.bat :dev-app:bootRun
```

```powershell
# 2. AI 서버 — hybrid가 기본이므로 환경변수는 생략 가능
cd game-ai-dev-server
.venv\Scripts\python.exe -m app.main
```

```powershell
# 3. 프런트
cd frontend
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

정상 주소:

- 프런트: `http://127.0.0.1:5173`
- 더미 백엔드: `http://localhost:8091`
- AI WebSocket: `ws://localhost:8765`

AI 서버를 실행했을 때 `GET_CAPABILITIES`의 `modelVersion`은 `jamo-number-hybrid-v1`, `supportedSymbols`는 자모 31개와 숫자 1~10의 총 41개여야 한다. 기존 모델로 즉시 되돌리려면 해당 PowerShell 창에서 다음처럼 실행한다.

```powershell
$env:HANDPRACTICE_AI_MODEL="baseline"
.venv\Scripts\python.exe -m app.main
```

다른 새 모델 폴더를 시험할 때는 artifact와 manifest를 함께 복사하고 다음 환경변수만 바꾼다.

```powershell
$env:HANDPRACTICE_AI_MODEL="hybrid"
$env:HANDPRACTICE_EXPANDED_MODEL_DIR="C:\absolute\path\to\model-bundle"
.venv\Scripts\python.exe -m app.main
```

manifest의 label, input shape, SHA-256이 맞지 않으면 의도적으로 로드를 거부한다.

## 새 PC 인수 검증

```powershell
cd frontend
npm.cmd test
npm.cmd run build

cd ..\game-ai-dev-server
.venv\Scripts\python.exe -m unittest discover -s tests -v

cd ..\game-contracts
..\game-ai-dev-server\.venv\Scripts\python.exe -m unittest discover -s tests -v

cd ..\game-dev-backend
.\gradlew.bat check
```

인수 당시 기준 결과:

- 프런트 122 test files, 459 tests 통과
- production TypeScript/Vite build 통과
- AI 서버 16 tests 통과
- 계약 29 tests 통과
- 백엔드 `gradlew check` 통과

실제 브라우저에서는 블록 솔로, 블록 1:1 두 사용자 경기 진입, 턴 배틀 봇전, 턴 배틀 1:1 두 사용자 대기실까지 확인했다. 턴 배틀 1:1의 실제 손동작 경기는 자동 브라우저 카메라 권한 거부로 남아 있으므로 카메라가 있는 Chrome/Edge에서 우선 확인한다.

## 모델 상태와 다음 AI 작업

현재 모델 수치는 다음과 같다.

| 항목 | 결과 | 해석 |
|---|---:|---|
| 숫자 제공 test 정확도 | 95.39% | signer 독립 split이라고 단정할 수 없음 |
| hybrid 전체 회귀 정확도 | 91.90% | 전체 95% 달성 아님 |
| hybrid 자모 회귀 정확도 | 91.82% | 기존 모델이 본 세션을 포함할 수 있어 독립 인증 아님 |
| 자모 세션 분리 재학습 | 85.50% | 현재 가장 중요한 일반화 한계 |
| 자모↔숫자 domain 오분기 | 보유 test 0건 | 새 사용자/OOD에서도 0건임을 의미하지 않음 |

`ㅠ` recall 0%, 손등, 상하 회전, 새로운 사람, 거리·조명·카메라 변화, 중립/OOD 데이터 부족이 남아 있다. 다음 작업은 최소 여러 사람을 signer 단위로 train/validation/test에 완전히 분리하고 `NONE/OOD`를 포함해 다시 수집하는 것이다. 정확한 실험 내역은 `recognition/model-evaluation.md`를 기준으로 한다.

재학습용 숫자 원본과 feature는 Git에 없다. 다시 받을 때는 CC0 `nahyunpark/korean-sign-languageksl-numbers`를 `work/datasets/ksl-numbers-cc0/raw`에 두고 다음 순서로 재현한다.

```powershell
cd game-ai-dev-server
.venv\Scripts\python.exe -m pip install -r requirements-training.txt
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

기존 versioned 모델 폴더를 실험 중간에 덮어쓰지 않는다. 새 후보는 새 version 폴더에 출력하고 평가가 더 좋아진 뒤 adapter 기본값을 변경한다.

## 새 Codex에 전달할 시작 메시지

아래 내용을 새 PC의 Codex에 그대로 전달한다.

```text
이 저장소의 frontend/src/game/docs/other-pc-handoff.md를 먼저 끝까지 읽고,
AGENTS.md와 git status, 현재 branch/remote를 확인한 뒤 이어서 작업해라.

현재 기본 AI는 jamo-number-hybrid-v1이며 자모 31개 기존 TFLite와 숫자/domain
Extra Trees를 ModelRunner 경계로 결합한다. 전체 95%를 달성한 상태가 아니며,
숫자 제공 test 95.39%, hybrid 전체 91.90%, 자모 세션 분리 재학습 85.50%다.
ㅠ/ㅅ, 손등, 상하 회전, 신규 사용자, NONE/OOD가 우선 과제다.

기존 모델과 사용자 변경을 덮어쓰지 말고 새 version 폴더에서 실험해라.
변경 전후 지표와 split 한계를 model-evaluation.md에 중복 없이 갱신하고,
프런트 4개 게임 회귀, AI tests, contracts, backend check와 production build를 실행해라.
유료 API, 유료 GPU, 결제 서비스는 사용하지 마라.
```

## 관련 canonical 문서

- 전체 구조: 저장소 `readme.md`
- AI 실행·어댑터: `game-ai-dev-server/README.md`
- 모델 수치: `recognition/model-evaluation.md`
- MediaPipe/원격 비전 교체: `../recognition/mediapipe/docs/README.md`
- 실제 게임 체크: `reference/manual-test-checklist.md`
- 백엔드 리드 연결: `match-module-integration.md`
