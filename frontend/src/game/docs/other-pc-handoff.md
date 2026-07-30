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

### 2026-07-22 GPU 학습 인수 상태

- GPU 서버: `http://70.12.130.107/user/i15a405/lab`, 작업 루트 `~/sign_language_training`. 물리 GPU는 **2번만** 사용하며 명령 앞에 항상 `CUDA_VISIBLE_DEVICES=2`를 둔다. 프로세스 안에서는 logical `cuda:0`으로 보이는 것이 정상이다.
- 단일 성과 문서: `frontend/src/game/docs/recognition/model-evaluation.md`. 회차별 방법·데이터 수·전체/class/domain/유사문자/방향 proxy/UX/연속 입력 한계는 이 파일 하나에 누적한다. 실행 순서는 `frontend/src/game/docs/recognition/training-handoff.md`를 따른다.
- 현재 평균 최고 개발 후보는 T-17 class-expert ensemble(test accuracy 93.55%, macro-F1 95.04%)이지만 41개 중 15개 class가 recall 또는 F1 93% 미달이다. T-18 calibration은 test 예측을 바꾸지 못했고 T-19 mild TTA가 GPU 2에서 평가 중이다. T-13 이후 test는 반복 관찰한 development-test이므로 최종 인증에 사용할 수 없다.
- 원격 artifact는 `~/sign_language_training/artifacts/roboflow-t13-*`부터 `roboflow-t19-*`에 있고 대용량 모델·prediction은 Git에 넣지 않는다. Git에는 재현 스크립트와 통계 문서만 올린다.
- 로컬 AI Hub 원본은 `D:\AITraining\korean-fingerspelling\aihub-103`에 있다. 다른 PC에는 자동 복제되지 않는다. 필요한 경우 AI Hub dataset 103에서 Crowd morpheme 2개와 keypoint key `39474`, `39580`, `39582`만 다시 받거나 이 폴더를 별도 안전 매체로 옮긴다. 원본을 GitHub에 올리거나 재배포하지 않는다.
- 확보 통계: morpheme train/validation 17,000/2,000clip, 정규화 target 158,426개. Validation keypoint는 signer 18~19, 2,000clip, 671,745frame이다. keypoint ZIP 직접 감사 스크립트는 `game-ai-dev-server/scripts/analyze_aihub_keypoint_archive.py`다.
- 목표 종료 조건은 전체 accuracy·macro-F1 93% 이상과 41개 모든 class recall·F1 93% 이상을 동시에 만족하는 것이다. 평균만 93%인 경우 완료로 표시하지 않는다.

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
> 2026-07-22 05:50 handoff: T-23까지 완료·문서화했지만 41개 각 recall/F1 93% 및 전체 93% 목표는 미달이다. branch `260721`을 pull한 뒤 `frontend/src/game/docs/recognition/training-handoff.md`와 `model-evaluation.md`부터 읽는다. AIHub 원본/compact NPZ는 용량·라이선스 때문에 Git에 없고 이 PC의 `D:\AITraining\korean-fingerspelling\aihub-103`에 유지된다. 재현 스크립트와 통계만 Git에 포함한다.
> 2026-07-22 06:10 추가 상태: 연속 모델은 T-25 checkpoint가 validation 기준 최선이며 T-26 개발 테스트에서 CER 6.97%, macro-F1 87.88%다. 목표는 아직 미달이다. 재개 시 `training-handoff.md`의 06:10 항목과 `model-evaluation.md`의 T-24~T-27 표부터 확인한다.
> 2026-07-22 06:10 decoder 설정: 연속 후보는 T-25 checkpoint 단독이 아니라 CTC greedy decode의 blank logit에 `-0.3`을 더하는 T-29 설정이다. 모델과 설정을 반드시 함께 이관한다.

### 2026-07-22 07:15 최종 연속 학습 상태

- 07:15 당시 T-25/T-29 상태를 대체한 후보는 T-89였다. 아래 07:40 델타에서 다시 T-91/T-92로 대체됐으므로 이 경로와 해시는 과거 재현용 기록이다.
- T-89 CROWD19 development: CER 5.25%, 문장 완전일치 75.73%, micro token recall 95.59%, macro-F1 91.69%. 41개 중 23개 gate 통과, 17개 미달, `ㅒ`는 train/dev support 0으로 평가 불가다. 평균 93%와 전 문자 93% 목표 모두 미달이다.
- 저장소에 포함한 재개 필수 파일은 학습 스크립트, T-81 checkpoint, T-89 `evaluation.json`, 회차 문서다. AIHub 원본과 compact NPZ는 라이선스·용량 때문에 Git에 넣지 않았다.
- 이 PC의 데이터 위치: `D:\AITraining\korean-fingerspelling\aihub-103\prepared\t23`과 `prepared\t46`. GPU 서버 원본은 `~/sign_language_training/code-v3/data/t23`, `data/t46`, 결과는 `outputs/t32`~`outputs/t90`이다.
- 다른 PC에서 단순 검증은 checkpoint와 `evaluation.json`만으로 기록을 확인할 수 있다. 추가 학습에는 T23 NPZ 3개가 필요하므로 D 드라이브를 별도 안전 매체로 복사하거나 AIHub dataset 103의 허용된 keypoint·morpheme 묶음에서 재생성한다.
- 다음 데이터 수집 우선순위: `ㅒ`, 숫자 0·1·2·3·5·7·8, `ㅠ`, `ㅈ/ㅅ/ㅊ`, `ㅓ/ㅏ`. 손바닥/손등·상/하·좌/우·거리·조명·카메라 조건을 명시하고 signer 단위 train/validation/final-test를 분리한다.
- 현재 CROWD19는 여러 회차에서 반복 확인한 development set이다. 새 모델을 이 점수로 최종 인증하지 않는다. 실제 카메라의 확정률·분당 오확정·중복/누락·p50/p95 지연도 별도 측정해야 한다.
- 운영 `jamo-number-hybrid-v1`, TFLite, readiness, MediaPipe 입력 계약은 변경하지 않았다. T-81은 실험 checkpoint다.

새 PC에서 Codex에 전달할 최신 시작 메시지는 다음과 같다.

```text
frontend/src/game/docs/other-pc-handoff.md와
frontend/src/game/docs/recognition/training-handoff.md를 먼저 끝까지 읽어라.
branch 260721과 git status를 확인하고 기존 변경을 덮어쓰지 마라.

연속 입력 현재 후보는 models/continuous-ctc-t91/best.pt + blank bias -0.9다.
T-92 development macro-F1 91.71%, CER 5.24%, 완전일치 75.53%이고
17 class 미달, ㅒ support 0이므로 목표 달성이 아니다.

물리 GPU 2만 사용하고 CUDA_VISIBLE_DEVICES=2를 강제해라.
현재 CROWD19는 반복 관찰한 development set이므로 새 signer final-test를 만들어라.
매 회차 데이터 수·방법·전후 수치·유사문자·방향/UX/연속 한계를
model-evaluation.md 한 파일에 추가한 뒤에만 다음 회차를 진행해라.
AIHub NPZ는 Git에 없으므로 D 드라이브 안전 복사 또는 원본 재생성이 필요하다.
```

### 2026-07-22 07:40 최종 델타

- T-91에서 validation 취약 자모와 숫자가 포함된 clip을 1.5배로 약하게 재가중한 결과가 새 후보가 됐다. T-92 고정 development는 CER 5.2404%, 문장 완전일치 75.5287%, micro recall 95.6010%, macro-F1 91.7051%, gate 미달/평가 불가 18개다.
- T-93~T-95의 더 약한/자모 전용/숫자 전용 재가중과 T-96~T-97의 blank bias 재보정은 validation 선택 점수가 낮아 폐기했다. decoder는 계속 blank bias `-0.9`다.
- 새 PC의 현재 파일은 `models/continuous-ctc-t91/best.pt`와 `evaluation.json`이다. checkpoint SHA-256은 `04A65A0F77958722A4BD3401AC1F91FEF0A99AB19DFD7A0BA2FA63FB612E98E7`이다.
- 이전 T-89 수치보다 macro-F1은 +0.016%p 개선됐지만 문장 완전일치는 -0.201%p다. 목표 달성이 아니며 운영 모델/MediaPipe를 교체하지 않았다.

새 PC에서 시작할 때 위 시작 메시지의 후보 경로와 수치는 다음으로 대체한다.

```text
연속 입력 현재 후보는 models/continuous-ctc-t91/best.pt + blank bias -0.9다.
T-92 development macro-F1 91.71%, CER 5.24%, 완전일치 75.53%이고
17 class 미달, ㅒ support 0이므로 목표 달성이 아니다.
같은 CROWD19 반복 튜닝을 중단하고 새 signer·방향 조건 locked final-test부터 만들어라.
```

## 2026-07-23 P2P 실시간 게임 전환 우선 안내

이 문서의 과거 AI·더미 백엔드 기록은 보존한다. 현재 운영 백엔드 정렬과 실시간 게임 전환을 이어갈 때는 먼저 `codex-handoff-p2p-realtime-2026-07-23.md`를 읽는다.

- 작업 저장소는 `C:\Users\SSAFY\Desktop\S15P11A405`이며 `backend/`는 수정 금지다.
- Room WebSocket은 native WebSocket + ticket + SIGNAL 전용이다. STOMP를 신규 코드에 사용하지 않는다.
- WebRTC `game-v1` DataChannel과 `WebRtcDataChannelTransport` 기반은 구현됐지만 P2P host authority 전환은 아직 진행 중이다.
- 다음 구현과 검증 순서는 새 핸드오프 문서를 canonical 기준으로 한다.

## 2026-07-29 솔로 게임 최신 핸드오프

과거 `Sign_Language_Translation` 폴더가 아니라 현재 GitLab 프런트 저장소를 사용한다.

- 저장소: `C:\Users\SSAFY\Documents\Codex\S15P11A405-frontend`
- 브랜치: `frontend`
- 백엔드 폴더는 수정하지 않는다.
- 최신 상세 상태: `frontend/src/game/docs/solo-game-status-2026-07-29.md`
- 오늘 트러블슈팅: `frontend/src/game/docs/solo-game-troubleshooting-2026-07-29.md`
- 결과·랭킹·가중치 계약: `frontend/src/game/docs/reference/game-results-api.md`

이어갈 때 확인할 사항:

1. `TETRIS_SOLO` 랭킹이 경과 초 오름차순인지 백엔드 응답으로 확인한다.
2. 충돌 편집기는 `/game/solo?collisionAudit=1`에서 열고 최종 JSON이 `glyphCollisionDefaults.json`에 들어갔는지 확인한다.
3. 자동 생성 타이머를 다시 켜지 않는다. 목표 인식 → 종이 확대 → 같은 위치 물리 낙하가 현재 흐름이다.
4. 숫자는 대상이 아니다. 현재 모델과 게임 풀은 지문자 자음·모음만 사용한다.
