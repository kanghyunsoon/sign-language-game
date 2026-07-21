# 공용 MediaPipe 계층

이 디렉터리는 게임, 학습, 연습 화면이 함께 사용할 수 있는 브라우저 MediaPipe 추적 엔진이다. 화면 구성이나 지문자 판정 규칙 없이 다음 기능만 제공한다.

- Hand/Pose Landmarker 초기화와 공용 타입
- worker 실행 및 worker 장애 시 main thread 자동 전환
- main thread 추론 일시 실패 시 다음 프레임 재초기화
- MediaPipe 좌표, 손 연결선, MediaStream 보조 함수

공개 진입점은 `index.ts`다. 새 프런트 기능은 가능하면 이 파일에서 tracker와 타입을 import한다. `src/game/recognition`을 import하면 사용자 선택, Python AI, Temporal Decoder와 게임 판정까지 결합되므로 MediaPipe만 필요한 화면에서는 사용하지 않는다.

## 장애 복구 원칙

worker가 초기화 또는 추론 중 실패하면 같은 프레임부터 main-thread tracker로 전환한다. main-thread tracker가 일시적으로 실패하면 해당 프레임만 버리고 tracker를 닫은 뒤 다음 프레임에서 다시 만든다. 카메라 `MediaStreamTrack`의 소유권은 호출자에게 있으며 tracker의 `close()`는 공유 track을 종료하지 않는다.

## 검증

```powershell
cd frontend
npm.cmd exec -- vitest run src/shared/mediapipe src/game --maxWorkers=1 --fileParallelism=false
npm.cmd run build
```
