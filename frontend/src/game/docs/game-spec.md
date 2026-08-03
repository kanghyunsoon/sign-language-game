# 게임 제품 명세

이 문서는 최초 프로토타입 요구사항에서 시작했지만 현재는 정식 게임 구현의 기준 문서다. 실행 기준 프런트는 `frontend`, 게임 공개 경계는 `frontend/src/game`이다. 브라우저 MediaPipe와 교체 가능한 원격 AI, 테스트용 Python AI 서버, 테스트용 Spring 서버, 독립 Match 모듈을 유지한다.

플랫폼 MVP에서 홈, 회원가입·로그인, 프로필, 지문자 학습·연습은 다른 프런트 feature가 맡는다. 게임 팀은 `/game`의 게임 선택 화면부터 블록쌓기와 지문자 배틀의 솔로·봇·1:1·결과 화면까지 맡는다.

현재 제품 구조는 다음과 같다.

```text
frontend/src/game/
├─ block-stacking/
├─ glyph-battle/
├─ app/
├─ recognition/
├─ media/
├─ match/
├─ contracts/
└─ docs/

game-ai-dev-server/          # 교체 가능한 더미 지문자 AI
game-dev-backend/
├─ game-module/              # 운영 서버에 붙이는 Match API/도메인
└─ dev-app/                  # 테스트용 더미 서버 어댑터
```

아래의 초기 기술 요구와 모델 계약은 호환성 기준으로 계속 유지한다.

# 1. 핵심 기술 구조

다음 구조를 사용한다.

```text
브라우저 웹캠
→ React에서 카메라 화면 출력
→ 브라우저 MediaPipe로 손 랜드마크 21개 추출
→ 현재 손 스켈레톤을 Canvas에 렌더링
→ 원시 랜드마크를 로컬 Python WebSocket 서버로 전송
→ Python에서 기존 전처리와 TFLite 모델 추론
→ 예측 심볼과 신뢰도를 React로 반환
→ React GameController.submitSymbol(symbol)
→ Matter.js 물리 글자 제거
```

중요한 원칙:

* Python은 웹캠을 직접 열지 않는다.
* 웹캠은 React 브라우저에서만 사용한다.
* 영상 프레임 자체를 Python으로 보내지 않는다.
* Python에는 21개의 손 랜드마크 좌표만 전송한다.
* 기존 Python의 특징 추출과 TFLite 추론 로직은 최대한 그대로 재사용한다.
* Spring Boot는 이번 솔로 프로토타입에 추가하지 않는다.
* 기존 AI 학습 코드는 수정하거나 재학습하지 않는다.

# 2. 코드 소유권과 보존

기존 저장소 파일을 삭제하거나 원본 위에서 대규모 수정하지 않는다.

현재 canonical 구조는 다음과 같다.

```text
repository-root/
├─ frontend/src/game/
├─ game-ai-dev-server/
├─ game-dev-backend/
├─ game-contracts/
├─ 기존 Python 학습 코드와 models/dataset
└─ README.md
```

기존 AI 코드에서 재사용해야 하는 부분은 adapter로 감싼다.

기존 모델이 요구하는 다음 조건을 절대 임의로 변경하지 않는다.

* 라벨 순서
* sequence length
* landmark feature 생성 방식
* 입력 tensor shape
* confidence 계산 방식
* 모델 파일

# 3. 최종 지원 심볼 계약

게임 전체 심볼 목록은 다음 41개다.

## 자음 14개

```text
ㄱ ㄴ ㄷ ㄹ ㅁ ㅂ ㅅ ㅇ ㅈ ㅊ ㅋ ㅌ ㅍ ㅎ
```

## 모음 17개

```text
ㅏ ㅑ ㅓ ㅕ ㅗ ㅛ ㅜ ㅠ ㅡ ㅣ ㅐ ㅒ ㅔ ㅖ ㅢ ㅚ ㅟ
```

## 숫자 10개

```text
0 1 2 3 4 5 6 7 8 9
```

다음 두 목록을 분리한다.

```typescript
export const GAME_SYMBOLS = [
  "ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ",
  "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
  "ㅏ", "ㅑ", "ㅓ", "ㅕ", "ㅗ", "ㅛ", "ㅜ",
  "ㅠ", "ㅡ", "ㅣ", "ㅐ", "ㅒ", "ㅔ", "ㅖ",
  "ㅢ", "ㅚ", "ㅟ",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
] as const;
```

* `GAME_SYMBOLS`: 게임이 최종적으로 지원할 전체 목록
* `supportedSymbols`: 현재 로딩된 AI 모델이 실제 인식할 수 있는 목록

AI 모드에서는 다음 교집합만 출제한다.

```typescript
const playableSymbols = GAME_SYMBOLS.filter((symbol) =>
  supportedSymbols.includes(symbol),
);
```

기존 모델이 숫자를 지원한다고 가정하거나 숫자 예측을 임의로 구현하지 않는다.

키보드 모드에서는 41개를 모두 시험할 수 있게 한다.

# 4. 프로젝트 폴더 구조

다음 구조를 기준으로 구현한다.

```text
prototype/
├─ frontend/
│  ├─ src/
│  │  ├─ game/
│  │  │  ├─ core/
│  │  │  ├─ letter/
│  │  │  ├─ physics/
│  │  │  ├─ render/
│  │  │  ├─ input/
│  │  │  ├─ runtime/
│  │  │  └─ config/
│  │  │
│  │  ├─ recognition/
│  │  │  ├─ core/
│  │  │  ├─ mediapipe/
│  │  │  ├─ websocket/
│  │  │  ├─ feedback/
│  │  │  ├─ template/
│  │  │  └─ types/
│  │  │
│  │  ├─ pages/
│  │  │  ├─ SoloGamePage.tsx
│  │  │  ├─ RecognitionLabPage.tsx
│  │  │  └─ TemplateCapturePage.tsx
│  │  │
│  │  ├─ components/
│  │  ├─ App.tsx
│  │  └─ main.tsx
│  │
│  └─ package.json
│
├─ ai-server/
│  ├─ app/
│  │  ├─ main.py
│  │  ├─ recognizer.py
│  │  ├─ model_adapter.py
│  │  ├─ feature_adapter.py
│  │  └─ message.py
│  ├─ requirements.txt
│  └─ README.md
│
├─ shared/
│  ├─ contracts/
│  │  └─ recognition-contract.md
│  └─ reference-templates/
│     └─ templates.json
│
└─ docs/
   ├─ architecture.md
   ├─ run-guide.md
   └─ manual-test-checklist.md
```

# 5. 프론트 기술

다음을 사용한다.

* React
* TypeScript
* Vite
* Matter.js
* PixiJS
* 브라우저 MediaPipe 손 랜드마크
* Vitest

패키지 버전은 현재 저장소와 Node 환경을 확인한 뒤 서로 호환되는 버전을 선택한다.

React State로 매 프레임 물리 위치를 관리하지 않는다.

```text
Matter.js → 물리 계산
PixiJS → 글자 렌더링
React → 페이지, 버튼, HUD, 상태 표시
```

# 6. 솔로 게임 규칙

게임은 일반 격자 테트리스가 아니라 물리 기반 낙하 퍼즐이다.

## 기본 흐름

```text
글자 생성
→ 중력으로 낙하
→ 회전·충돌하며 쌓임
→ 사용자가 해당 지문자를 수행
→ 동일 글자 제거
→ 위에 있던 글자가 다시 낙하
→ 결승선까지 쌓이면 게임 종료
```

## 제거 우선순위

동일 심볼이 여러 개라면 다음 순서로 처리한다.

1. 이미 쌓인 `SETTLED` 글자를 우선한다.
2. `SETTLED` 글자가 여러 개면 가장 먼저 안착한 글자를 선택한다.
3. `SETTLED` 글자가 없으면 `FALLING` 글자를 선택한다.
4. `FALLING` 글자가 여러 개면 가장 먼저 생성된 글자를 선택한다.
5. `REMOVING`, `REMOVED` 상태는 선택하지 않는다.

```typescript
export type LetterState =
  | "FALLING"
  | "SETTLED"
  | "REMOVING"
  | "REMOVED";
```

## 입력 잠금

같은 손모양을 유지하는 동안 여러 글자가 연속 삭제되지 않게 한다.

```text
SIGN_CONFIRMED
→ 해당 심볼 하나 제거
→ 동일 심볼 잠금
→ HAND_RELEASED 또는 다른 심볼 확정
→ 다시 동일 심볼 입력 가능
```

키보드 개발 모드에서는 설정으로 입력 잠금을 끌 수 있게 한다.

# 7. 글자 물리

초기 구현에서는 모든 41개 심볼을 렌더링할 수 있어야 한다.

콜라이더는 다음 단계로 구현한다.

## 1단계

* 모든 글자를 단순 사각형 또는 원형 콜라이더 안에 렌더링
* 전체 게임 규칙 검증

## 2단계

다음 심볼은 복합 바디로 구현한다.

```text
ㄱ ㄴ ㄷ ㄹ ㅁ ㅂ ㅅ ㅇ ㅈ ㅊ ㅋ ㅌ ㅍ ㅎ
ㅏ ㅑ ㅓ ㅕ ㅗ ㅛ ㅜ ㅠ ㅡ ㅣ
0 1 2 3 4 5 6 7 8 9
```

복잡한 폰트 외곽선을 런타임에 자동 추출하지 않는다.

여러 개의 단순 볼록 바디를 조합해 시각적 글자와 유사한 충돌체를 만든다.

복합 모음은 초기에는 단순화된 콜라이더를 사용해도 된다.

물리 설정은 다음 객체로 분리한다.

```typescript
export interface PhysicsConfig {
  gravityY: number;
  friction: number;
  frictionAir: number;
  restitution: number;
  density: number;
  spawnIntervalMs: number;
  settleDurationMs: number;
  linearVelocityThreshold: number;
  angularVelocityThreshold: number;
}
```

# 8. 프론트 웹캠 화면

솔로 게임 페이지 오른쪽 또는 하단에 자신의 웹캠 화면이 보여야 한다.

구조:

```text
video element
+
동일 크기의 overlay canvas
```

요구사항:

* 브라우저 `getUserMedia`로 카메라를 연다.
* 화면은 거울처럼 좌우 반전한다.
* video와 overlay canvas의 좌표계를 정확히 일치시킨다.
* 손 랜드마크 21개와 연결선을 overlay canvas에 그린다.
* 카메라 시작·정지 버튼을 제공한다.
* 카메라 권한 거절 시 명확한 오류 화면을 표시한다.
* 컴포넌트 언마운트 시 모든 MediaStreamTrack을 정리한다.
* React State를 매 프레임 변경하지 않는다.
* Canvas drawing은 animation loop 또는 MediaPipe callback에서 직접 처리한다.

# 9. 따라 해야 할 동작 표시

웹캠 위에 현재 수행해야 하는 심볼을 명확하게 표시한다.

필수 UI:

```text
현재 목표: ㄱ
신뢰도: 92%
인식 상태: 확인 중 / 성공 / 손을 풀어주세요
현재 모델: jamo-31-v1
```

다음 두 종류의 가이드를 제공한다.

## A. 텍스트 가이드

웹캠 상단에 현재 목표 심볼을 크게 표시한다.

## B. 기준 스켈레톤 가이드

해당 심볼의 기준 랜드마크 템플릿이 존재하면:

* 반투명 기준 손 스켈레톤을 웹캠 위에 표시한다.
* 현재 사용자의 손 위치와 크기에 맞게 기준 템플릿을 정렬한다.
* 기준 스켈레톤과 현재 스켈레톤을 동시에 볼 수 있게 한다.

기준 템플릿이 없다면 임의 좌표를 만들지 않는다.

대신 다음 메시지를 표시한다.

```text
이 동작의 세부 관절 가이드는 아직 준비되지 않았습니다.
전체 인식 결과만 제공합니다.
```

# 10. 틀린 손가락 부분 표시

기존 분류 모델은 전체 심볼만 예측하므로, 잘못된 관절 위치를 직접 알려주지 않는다.

세부 피드백은 별도의 기준 랜드마크 비교로 구현한다.

## 손 랜드마크 정규화

현재 손과 기준 손을 비교하기 전에 다음 순서로 정규화한다.

1. 손목 landmark를 원점으로 이동
2. 손바닥 크기를 기준으로 스케일 정규화
3. 손목에서 중지 MCP 방향을 기준축으로 회전 정규화
4. 오른손·왼손 방향을 동일 기준으로 미러링
5. z값은 별도 가중치를 적용하거나 초기 프로토타입에서는 낮은 가중치로 사용

정규화 로직을 순수 TypeScript 함수로 작성하고 Vitest 테스트를 작성한다.

## 뼈 연결 목록

MediaPipe의 21개 랜드마크 연결 관계를 상수로 관리한다.

```typescript
export interface HandBone {
  id: string;
  startIndex: number;
  endIndex: number;
  finger:
    | "THUMB"
    | "INDEX"
    | "MIDDLE"
    | "RING"
    | "PINKY"
    | "PALM";
}
```

## 오차 계산

각 뼈마다 다음을 비교한다.

* 정규화된 방향 벡터 각도
* 정규화된 길이
* 필요한 경우 인접 관절의 굽힘 각도

```typescript
export interface BoneFeedback {
  boneId: string;
  finger: string;
  angleError: number;
  lengthError: number;
  errorScore: number;
  status: "CORRECT" | "CLOSE" | "WRONG";
}
```

임계값은 설정으로 분리한다.

```typescript
export interface PoseFeedbackConfig {
  correctThreshold: number;
  wrongThreshold: number;
  angleWeight: number;
  lengthWeight: number;
  depthWeight: number;
}
```

렌더링:

* `CORRECT`: 정상 색
* `CLOSE`: 노란색
* `WRONG`: 빨간색
* 기준 템플릿이 없는 경우: 중립 색

전체 손을 빨간색으로 바꾸지 말고, 오차가 큰 뼈 연결선만 빨간색으로 표시한다.

잘못된 손가락 이름도 간단히 표시한다.

```text
검지 끝을 조금 더 펴세요.
엄지를 안쪽으로 이동하세요.
```

단, 자연어 안내는 오차값에 기반한 규칙형 메시지만 사용한다. LLM을 사용하지 않는다.

# 11. 기준 랜드마크 템플릿

다음 형식을 사용한다.

```json
{
  "version": "reference-template-v1",
  "templates": {
    "ㄱ": {
      "feedbackMode": "STATIC_TEMPLATE",
      "handedness": "RIGHT",
      "landmarks": [
        { "x": 0.0, "y": 0.0, "z": 0.0 }
      ]
    }
  }
}
```

21개 랜드마크가 모두 있어야 한다.

다음 규칙을 따른다.

* 기준 템플릿을 임의로 생성하지 않는다.
* 저장소에 기존 landmark dataset이 있으면 라벨별 대표값을 계산하는 스크립트를 작성한다.
* 대표값은 단순 첫 프레임이 아니라 여러 정상 샘플의 중앙값 또는 medoid를 사용한다.
* 기존 landmark dataset이 없다면 `TemplateCapturePage`를 구현한다.
* TemplateCapturePage에서 사용자가 올바른 손동작을 취하고 여러 프레임을 저장할 수 있게 한다.
* 여러 프레임의 정규화 landmark 중앙값을 템플릿 JSON으로 내보낸다.
* 템플릿이 준비되지 않은 심볼은 세부 빨간색 피드백을 비활성화한다.

동작 변화가 중요한 심볼은 다음 설정을 사용한다.

```json
{
  "feedbackMode": "CLASSIFICATION_ONLY"
}
```

`CLASSIFICATION_ONLY` 심볼에는 정적인 관절 위치 비교를 적용하지 않는다.

# 12. RecognitionLabPage

게임과 별도로 AI 및 관절 피드백을 검증하는 페이지를 만든다.

기능:

* 카메라 시작·정지
* 목표 심볼 직접 선택
* 현재 모델 지원 심볼 표시
* 현재 예측 심볼 표시
* confidence 표시
* 최근 예측 기록 표시
* 현재 21개 landmark 표시
* 기준 스켈레톤 표시
* 뼈별 오류 색상 표시
* 정규화된 landmark 디버그 값 표시 여부 토글
* WebSocket 연결 상태 표시
* 키보드 mock prediction 버튼
* HAND_RELEASED 테스트 버튼

이 페이지는 게임 로직 없이 인식과 피드백만 검증할 수 있어야 한다.

# 13. SoloGamePage

화면 구성:

```text
┌────────────────────────────┬──────────────────────┐
│                            │ 현재 목표: ㄱ        │
│       물리 게임 보드       │                      │
│                            │    웹캠 화면         │
│                            │ + MediaPipe Overlay  │
│                            │                      │
├────────────────────────────┼──────────────────────┤
│ 점수 / 콤보 / 위험도       │ 인식 결과 / 신뢰도   │
└────────────────────────────┴──────────────────────┘
```

필수 기능:

* 게임 시작·일시정지·재시작
* 입력 모드 선택

  * KEYBOARD
  * PYTHON_AI
* 현재 AI 모델 지원 심볼 표시
* 목표 심볼을 웹캠 위에 표시
* 성공한 심볼과 제거 대상 글자를 잠시 강조
* 제거 대상 강조 후 물리 바디 제거
* 동일 심볼 잠금 중에는 `손을 잠시 풀어주세요` 표시
* 결승선에 닿으면 게임 종료
* 게임 종료 후 점수, 최대 콤보, 제거 수 표시

# 14. Python AI WebSocket 서버

기존 저장소의 웹캠 코드를 직접 사용하지 않는다.

Python 서버는 React에서 받은 landmark frame을 기존 전처리와 모델 입력으로 변환해 추론만 수행한다.

WebSocket 기본 주소:

```text
ws://localhost:8765
```

## 클라이언트 → 서버

### GET_CAPABILITIES

```json
{
  "type": "GET_CAPABILITIES"
}
```

### LANDMARK_FRAME

```json
{
  "type": "LANDMARK_FRAME",
  "frameId": 153,
  "capturedAt": 1784000000000,
  "handedness": "RIGHT",
  "landmarks": [
    { "x": 0.5, "y": 0.7, "z": -0.01 }
  ]
}
```

landmarks는 반드시 21개다.

### HAND_NOT_DETECTED

```json
{
  "type": "HAND_NOT_DETECTED",
  "capturedAt": 1784000000500
}
```

### RESET_SEQUENCE

```json
{
  "type": "RESET_SEQUENCE"
}
```

## 서버 → 클라이언트

### CAPABILITIES

```json
{
  "type": "CAPABILITIES",
  "modelVersion": "jamo-31-v1",
  "supportedSymbols": ["ㄱ", "ㄴ", "ㄷ"],
  "sequenceLength": 10
}
```

실제 supportedSymbols는 기존 모델 라벨 전체를 반환한다.

### PREDICTION

```json
{
  "type": "PREDICTION",
  "frameId": 153,
  "symbol": "ㄱ",
  "confidence": 0.94,
  "isStable": true,
  "predictedAt": 1784000000030
}
```

### SIGN_CONFIRMED

```json
{
  "type": "SIGN_CONFIRMED",
  "symbol": "ㄱ",
  "confidence": 0.94,
  "confirmedAt": 1784000000030,
  "modelVersion": "jamo-31-v1"
}
```

### HAND_RELEASED

```json
{
  "type": "HAND_RELEASED",
  "releasedAt": 1784000000500
}
```

### ERROR

```json
{
  "type": "ERROR",
  "code": "INVALID_LANDMARK_COUNT",
  "message": "Expected 21 landmarks"
}
```

# 15. Python 서버 구현 규칙

* 기존 feature normalization 함수를 우선 재사용한다.
* 프론트에서 받은 landmark 배열을 기존 함수 입력 형태로 변환한다.
* sequence buffer를 클라이언트 연결별로 관리한다.
* 낮은 confidence는 확정하지 않는다.
* 기존 코드와 동일한 연속 예측 조건을 우선 적용한다.
* 같은 손동작 유지 중 SIGN_CONFIRMED를 반복 전송하지 않는다.
* HAND_NOT_DETECTED가 일정 시간 지속되면 HAND_RELEASED를 한 번 전송한다.
* HAND_RELEASED 후 같은 심볼을 다시 확정할 수 있다.
* 경로는 pathlib.Path로 처리한다.
* 실행 위치에 따라 모델 경로가 깨지지 않게 한다.
* 폰트 파일과 OpenCV 화면 출력에 의존하지 않는다.
* 클라이언트 연결 해제 시 sequence buffer를 정리한다.
* JSON 직렬화가 불가능한 NumPy 타입을 Python 기본 타입으로 변환한다.

# 16. 프론트 Recognition 인터페이스

게임은 Python WebSocket 구현을 직접 알지 않아야 한다.

```typescript
export interface SignRecognizer {
  connect(): Promise<void>;
  disconnect(): void;

  subscribe(
    listener: (event: SignRecognitionEvent) => void,
  ): () => void;

  getSupportedSymbols(): readonly string[];
  getConnectionState(): RecognitionConnectionState;
}
```

구현체:

```text
KeyboardSignRecognizer
PythonWebSocketSignRecognizer
```

추후 다음 구현체를 추가할 수 있는 구조로 만든다.

```text
BrowserOnnxSignRecognizer
```

게임 코어에서는 `SignRecognizer` 인터페이스만 사용한다.

카메라 프레임에서 Hand/Pose 데이터를 추출하는 구현도 게임 화면에서 직접 생성하지 않는다. 프런트 공통 비전 경계는 다음 인터페이스를 사용한다.

```typescript
export interface RecognitionVisionAdapter {
  initialize(): Promise<void>;
  detectHands(frame: RecognitionVisionFrame): Promise<readonly TrackedHand[]>;
  detectPoses(frame: RecognitionVisionFrame): Promise<readonly PoseDetection[]>;
  getExecutionMode(): "WORKER" | "MAIN_THREAD" | "REMOTE";
  close(): void;
}
```

현재 브라우저 구현은 `MediaPipeRecognitionVisionAdapter`, 원격 구현 경계는 `RemoteRecognitionVisionAdapter`다. `HandCamera`는 두 구현을 직접 알지 않고 `RecognitionVisionAdapterFactory`만 사용한다. `GameModuleServices.recognitionVisionAdapterFactory`를 교체하면 `GameServiceProvider` 아래 모든 게임 카메라에 같은 구현이 적용된다.

게임 인식 세션은 `PythonWebSocketSignRecognizer` 구체 타입 대신 `GameRecognitionBackend`에 의존한다. 따라서 비전 데이터 추출 구현과 지문자 판정 구현은 각각 독립적으로 교체할 수 있다.

# 17. 성능

목표:

* 게임 렌더링: requestAnimationFrame 기반
* MediaPipe 처리: 가능하면 초당 15~30회
* Python 전송: 초당 10~20회로 제한 가능
* 영상 프레임은 전송하지 않음
* landmark JSON만 전송
* React setState는 HUD와 상태 표시용으로만 제한
* 불필요한 렌더링 방지를 위해 ref와 외부 runtime 객체 사용
* WebSocket 전송이 밀리면 오래된 landmark frame을 버릴 수 있게 한다

# 18. 테스트

## TypeScript 단위 테스트

다음을 Vitest로 검증한다.

1. landmark 21개 검증
2. 손목 원점 정규화
3. 손바닥 크기 스케일 정규화
4. 손 방향 회전 정규화
5. 좌우 손 미러링
6. 뼈별 각도 오차 계산
7. 오차 임계값에 따른 CORRECT, CLOSE, WRONG 판정
8. SETTLED 글자가 FALLING보다 우선 제거
9. 가장 오래된 SETTLED 선택
10. SETTLED가 없으면 가장 오래된 FALLING 선택
11. 동일 입력 잠금
12. HAND_RELEASED 이후 재입력
13. WebSocket 메시지 파싱
14. 지원하지 않는 메시지 거절

## Python 테스트

1. 기존 labels 순서 유지
2. 모델 output 크기와 labels 개수 일치
3. landmark 개수가 21개가 아니면 거절
4. sequence length 충족 전 확정하지 않음
5. 낮은 confidence 거절
6. 연속 예측 충족 시 SIGN_CONFIRMED
7. 같은 손모양 유지 중 중복 확정 방지
8. HAND_RELEASED 후 재확정
9. GET_CAPABILITIES 응답
10. mock model runner 테스트

# 19. 수동 검증 항목

`frontend/src/game/docs/reference/manual-test-checklist.md`에 다음 항목을 작성한다.

```text
[ ] 브라우저에 내 웹캠 영상이 표시된다.
[ ] 웹캠과 스켈레톤 좌표가 일치한다.
[ ] 화면 좌우 반전 후에도 랜드마크가 정확히 겹친다.
[ ] 목표 심볼이 웹캠 상단에 표시된다.
[ ] 기준 템플릿이 있는 심볼은 가이드 스켈레톤이 표시된다.
[ ] 틀린 손가락 연결선만 빨간색으로 표시된다.
[ ] 기준 템플릿이 없는 심볼은 잘못된 피드백을 만들지 않는다.
[ ] Python 서버 연결 상태가 표시된다.
[ ] 기존 31개 모델의 지원 심볼이 표시된다.
[ ] 숫자는 AI 모드에서 출제되지 않는다.
[ ] 키보드 모드에서는 숫자를 포함한 41개를 시험할 수 있다.
[ ] 쌓인 동일 글자가 낙하 중인 글자보다 먼저 제거된다.
[ ] 쌓인 글자가 없으면 낙하 중인 글자가 제거된다.
[ ] 같은 손모양을 유지해도 연속 제거되지 않는다.
[ ] 손을 풀면 같은 심볼을 다시 입력할 수 있다.
[ ] 글자 제거 후 위 글자가 다시 낙하한다.
[ ] 결승선에 닿으면 게임이 종료된다.
```

# 20. 실행 방법

다음 형태로 실행할 수 있게 문서를 작성한다.

## Python 서버

```bash
cd game-ai-dev-server
python -m venv .venv
```

Windows:

```bash
.venv\Scripts\activate
```

설치:

```bash
pip install -r requirements.txt
```

실행:

```bash
python -m app.main
```

## React

```bash
cd frontend
npm install
npm run dev
```

README에는 Python 버전, Node 버전, 브라우저 권한 설정, 카메라 문제 해결 방법을 작성한다.

# 21. 작업 순서

다음 순서로 구현하고 각 단계마다 테스트한다.

## Phase 1

* 기존 저장소 분석
* 모델과 전처리 구조 문서화
* Python model adapter
* WebSocket 계약 작성
* GET_CAPABILITIES 구현
* mock landmark 추론 테스트

## Phase 2

* React 프로젝트
* 웹캠 화면
* MediaPipe landmark 추출
* overlay canvas
* Python WebSocket 연동
* RecognitionLabPage

## Phase 3

* landmark normalization
* reference template repository
* TemplateCapturePage
* bone feedback 계산
* 틀린 부분 색상 표시

## Phase 4

* Matter.js 게임 코어
* PixiJS 렌더러
* 키보드 모드
* 제거 우선순위
* 입력 잠금
* 결승선과 게임 종료

## Phase 5

* AI 입력과 게임 연결
* 목표 심볼 웹캠 표시
* 제거 대상 강조
* 전체 통합 테스트
* 실행 문서 작성

각 Phase가 끝날 때마다 다음을 출력한다.

* 변경 파일 목록
* 구현 내용
* 실행한 테스트
* 테스트 결과
* 남은 제한 사항

# 22. 금지 사항

다음을 하지 않는다.

* 기존 TFLite 모델을 41개 모델이라고 가정
* 숫자 예측을 임의 규칙으로 위조
* 기준 landmark 템플릿을 임의 좌표로 작성
* Python에서 웹캠을 직접 열기
* 브라우저 영상 전체를 서버로 전송
* React State로 매 프레임 물리 좌표 관리
* GameCore에서 WebSocket 직접 생성
* GameCore에서 MediaPipe 직접 참조
* 기존 AI 학습 코드를 대규모로 변경
* 기존 저장소 파일 삭제
* 전체 손을 무조건 빨간색으로 표시
* 정적 템플릿으로 동적인 동작의 관절 오류를 단정
* any 타입 남용
* 테스트 없이 리팩터링 완료 처리

# 23. 최종 완료 조건

다음이 모두 가능해야 한다.

1. 기존 지문자 모델을 그대로 로딩한다.
2. React 화면에 사용자의 웹캠 영상이 나온다.
3. 웹캠 위에 현재 손 MediaPipe 스켈레톤이 표시된다.
4. 현재 따라 해야 할 심볼이 웹캠 위에 표시된다.
5. 기준 템플릿이 있으면 목표 스켈레톤이 함께 표시된다.
6. 오차가 큰 손가락 연결선만 빨간색으로 표시된다.
7. 기존 모델 추론 결과가 React에 표시된다.
8. 수어 확정 결과가 솔로 게임 입력으로 사용된다.
9. 글자가 중력과 충돌에 따라 쌓인다.
10. 쌓인 동일 글자를 우선 제거한다.
11. 쌓인 글자가 없으면 낙하 중 동일 글자를 제거한다.
12. 같은 손모양을 유지해도 한 번만 제거된다.
13. 키보드 모드로 전체 41개 심볼을 검증할 수 있다.
14. AI 모드는 현재 모델 지원 심볼만 출제한다.
15. `frontend/src/game`, `frontend/src/recognition`을 다른 React 프로젝트로 옮길 수 있다.
16. 기존 Python 모델은 독립 실행 가능한 로컬 추론 서버로 분리된다.
17. 실행 방법과 제한 사항이 README에 명확히 기록된다.

# 24. 프링글수 1:1 현재 명세 — 2026-08-02

## 방 목록

- 게임 종류가 `TETRIS_DUEL`이고 `WAITING`이며 참가 인원이 정원보다 적은 방만 표시한다.
- 방 카드는 제목, 방장 닉네임, 참가 인원, 출제 범위를 표시한다.
- 출제 범위는 실제 심볼 배열을 기준으로 `자음`, `모음`, `기초 혼합`으로 표현한다.
- 배포 SSE가 생성 시간을 주지 않으면 생성 정보 행을 생략한다.
- 생성 브라우저에서는 방 제목·방장 닉네임·출제 범위를 사용자·게임 종류·방 ID별로 보존하고, 재입장 세션과 같은 카드에는 저장된 실제 표시값을 우선한다.
- 방 제목·닉네임·출제 범위의 cross-browser 보존은 서버 계약이 해당 필드를 제공할 때만 보장한다.

## 방 생명주기

- create, join, leave의 완료 순서를 보장한다.
- 한 명인 방의 방장 퇴장은 방 제거, 두 명인 방의 방장 퇴장은 서버의 방장 위임 결과를 따른다.
- 뒤로가기와 화면 버튼은 같은 leave 경로를 사용하고 로컬 재입장 세션을 즉시 정리한다.
- 새 방 생성 전 저장 세션을 서버 join으로 검증하며, `401/403/404/410`인 stale 세션은 폐기하고 생성을 계속한다.
- 종료 뒤 두 참가자가 남은 가득 찬 방은 결과 API가 `WAITING`으로 돌려도 공개 목록에 노출하지 않는다.

## 1:1 플레이

- 두 플레이어는 분리된 게임판을 사용하고 하늘·언덕·낮밤 전환 배경은 공유한다.
- 공유 목표를 먼저 확정한 플레이어의 보드에만 권위 spawn 명령을 적용한다.
- 1:1 글자 크기는 `180`, 결승선 비율은 게임판 높이의 `1 / 6`이다.
- 시각 결승선과 물리 승리 판정은 같은 값을 사용한다.
- 결과의 `다시 하기`와 `같은 방으로`는 대기실로, `게임방 목록`은 leave 후 `/game/battle`로 이동한다.

상세 구현·제한은 `battle-ui-room-status-2026-08-02.md`, 재발 점검은 `game-troubleshooting.md`를 기준으로 한다.

## 25. 장시간 렌더링·동기화 성능 기준 — 2026-08-02

- DOM 마스크가 실제 글자를 표시하는 게임판에서는 동일 글자의 숨은 Pixi 뷰를 만들지 않는다.
- 낙하 중인 글자만 GPU 합성 레이어를 사용하고, 정착 글자는 레이어를 반환한다.
- 움직임과 효과가 없는 로컬·상대 보드는 10FPS로 전체 상태 순회를 제한하되 새 낙하·제거에는 즉시 반응한다.
- 상대 제거 tombstone과 P2P 처리 명령 기록은 유한한 최근 이력만 유지한다.
- 정적 글자 래스터처럼 심볼 수로 자연스럽게 제한되는 재사용 캐시는 임의 주기로 초기화하지 않는다.

세부 원인, 수치, 검증 절차는 `game-troubleshooting.md`의 「1:1 누적 성능」 절을 따른다.
