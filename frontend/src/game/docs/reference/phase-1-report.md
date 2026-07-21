# Phase 1 Report

## 완료한 내용

* 전체 명세와 기존 Python 데이터 수집·전처리·학습·실행 흐름 분석
* TFLite/H5 위치, 실제 라벨 31개 순서, sequence length, tensor shape 확인
* 기존 웹캠 TFLite 실행 시도 및 결과 기록
* `frontend` Vite + React + TypeScript 최소 프로젝트 생성
* 브라우저 `getUserMedia` 시작·정지 UI 구현
* 로컬 MediaPipe HandLandmarker와 최대 2손/손당 21 landmarks 추출 구현
* video와 overlay canvas의 동일 좌표계 및 좌우 반전 구현
* component unmount 시 tracker, animation frame, MediaStreamTrack 정리 구현
* `frontend/src/recognition` 공개 타입과 `SignRecognizer` 인터페이스 작성
* Phase 1 문서와 수동 검증 체크리스트 작성

## 의도적으로 구현하지 않은 내용

Python WebSocket 서버, GET_CAPABILITIES 네트워크 구현, TFLite 브라우저 추론, Matter.js, PixiJS, 게임 규칙, 기준 템플릿, 관절 피드백, 재학습, 숫자 인식은 구현하지 않았다.

## 실행한 주요 명령

```powershell
Get-Content frontend\src\game\docs\game-spec.md -Raw -Encoding UTF8
rg --files
node --version
npm --version
C:\Users\SSAFY\miniforge3\envs\nlp\python.exe --version
C:\Users\SSAFY\miniforge3\envs\nlp\python.exe Sign_Language_Translation\webcam_test_model_tflite.py
cd frontend
npm install
npm run build
npm test
npm run dev -- --host 127.0.0.1 --port 5173
```

Python inline inspection으로 TFLite tensor details, H5 model config, NPY 개수/shape도 확인했다.

## 테스트 결과

| 검증 | 결과 |
| --- | --- |
| 기존 TFLite allocation | 통과, input `[1,10,55]`, output `[1,31]` |
| 기존 webcam entry point | 10초 이상 실행 유지, 치명적 예외 없음 |
| H5 direct load on TF 2.19 | 실패, 구형 LSTM `time_major` 호환 오류 |
| TypeScript production build | 통과 |
| Vitest | 3 files, 7 tests 통과 |
| localhost 앱/MediaPipe 정적 자산 | HTTP 200, hand model 7,819,105 bytes, WASM 11,153,617 bytes |
| landmark 21개 검증 | 통과 |
| normalized→canvas 좌표와 mirror 계산 | 통과 |
| 모든 MediaStreamTrack stop | mock stream으로 통과 |
| 실제 브라우저 카메라 권한/영상 | 미검증: 자동화 브라우저 인스턴스 없음 |
| 실제 손과 overlay 픽셀 일치 | 미검증: 실카메라 브라우저 검증 필요 |

## 실행 방법

```powershell
cd C:\Users\SSAFY\Desktop\Sign_Language_Translation\frontend
npm install
npm run dev
```

표시된 localhost URL을 Chrome 또는 Edge에서 열고 카메라 권한을 허용한다.

## 제한 사항

* Phase 1 화면은 손 landmarks만 표시하며 지문자 예측은 하지 않는다.
* 실제 카메라 start/stop과 overlay 일치는 로컬 브라우저에서 수동 확인이 필요하다.
* H5는 원래 TensorFlow 2.4 계열 형식이며 현재 2.19 환경에서 직접 로드되지 않는다. TFLite는 정상 로드된다.
* MediaPipe 손 모델 파일은 약 7.8 MB, WASM 자산은 선택 variant를 포함해 약 33 MB다.

## Phase 2 시작 조건

1. 수동 체크리스트의 카메라 시작·정지, 권한 거절, overlay 좌표, mirror 항목을 실제 장치에서 확인한다.
2. Python adapter가 canonical 라벨 순서와 `[1,10,55]` 입력을 그대로 유지하도록 설계한다.
3. 브라우저가 보낼 landmark handedness와 기존 `right_hand_landmarks` 학습 기준의 매핑을 명시한다.
4. WebSocket 메시지 계약과 연결별 sequence lifecycle을 확정한다.
5. H5가 아니라 검증된 TFLite를 서버 추론 기준으로 사용한다.
