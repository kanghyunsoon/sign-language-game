# HandPractice 개발 트러블슈팅 기록

마지막 정리: 2026-07-23

## 19. 턴 배틀에 레이스 봇·글자 경로·캔버스 재생성이 남아 있던 문제

### 증상

턴제 화면인데도 내가 선택하지 않아도 봇이 계속 공격했다. 지문자가 앞에 나타난 뒤 그 모양을 따라 캐릭터가 이동해서 기술인지 장애물인지 알 수 없었다. 화면은 갱신 때마다 깜빡였고, 데스크톱에서도 경기장·카메라·기술 선택이 한 화면에 들어오지 않았다.

### 내가 잘못 판단한 부분

- 턴 규칙과 UI만 만들면 기존 레이스 런타임을 그대로 써도 된다고 판단했다.
- 실제 서버 봇은 일정 시간마다 공격하는 레거시 라인 레이스 봇인데 새 턴 규칙을 사용할 것이라고 가정했다.
- `JamoObstacleRenderer`와 `TimeBasedObstaclePathFollower`를 남겨 서로 다른 두 게임 규칙이 동시에 실행됐다.
- `getConfig()`가 렌더마다 새 객체를 반환하는데 effect가 객체 전체를 의존해 Pixi를 계속 파괴하고 다시 만들었다.
- 공통 앱 셸의 1100px 이하 규칙이 게임에도 적용되어 노트북 폭에서 세로 잘림이 생겼다.

### 적용한 해결

- `LocalGlyphTurnPractice`를 만들었다. 봇의 독립 공격 타이머는 없고, 내 지문자 선택 뒤에만 한 턴이 시작된다.
- 턴은 `PLANNING → WAITING → REVEAL → PLANNING`으로만 진행한다. 양쪽 선택은 잠금 중 숨기고 둘 다 결정된 뒤 동시에 공개·판정한다.
- 로비의 `턴제 봇 연습`은 레거시 서버 봇을 생성하지 않고 `/game/turn-battle/practice`로 이동한다.
- 턴 렌더러에서 글자 장애물과 traversal 좌표를 전달하지 않는다. 지문자는 기술 판정 입력이지 이동 도로가 아니다.
- `LineRaceGameShell`의 effect는 config 객체가 아니라 실제 스칼라 설정값에만 의존하게 바꿨다.
- 851px 이상은 `100dvh` 안에 경기장·카메라·기술 카드가 들어가고 모바일만 스크롤하게 했다. 낮은 경기장에는 compact scale을 적용했다.
- 양쪽 기술을 `resolvedMoves`로 함께 전달해 공격·방어·집중 모션이 같은 공개 단계에서 보이게 했다.

### 검증 결과

- 무입력 대기 시 TURN 1, HP 100이 유지되어 자동 공격이 없었다.
- 공개 전 상대 선택은 `?`로 유지됐다.
- 실제 카메라 지문자 1회 인식으로 정확히 한 턴만 처리되어 TURN 1에서 TURN 2로 넘어갔다.
- 경기 캔버스는 1개였고 동일 config 값의 새 객체로 Pixi가 재생성되지 않는 회귀 테스트를 추가했다.
- 브라우저에서 문서·페이지·게임 셸·viewport 높이가 모두 864px로 같아 한 화면 표시를 확인했다.
- 글자 도로와 경로 추종은 사라졌고 양쪽 수달과 HP HUD가 가려지지 않았다.
- 6개 테스트 파일의 39개 테스트, TypeScript 검사, Vite production build가 통과했다.
- 콘솔에는 새 UI 오류 없이 MediaPipe의 기존 OpenGL/NORM_RECT 경고만 남았다.

### 남은 경계

`/game/turn-battle/practice`는 프런트 로컬 연습 모드다. 온라인 대전은 새 Match 백엔드가 `GlyphTurnMatchContract`의 비공개 동시 선택·동시 공개·권위 스냅샷을 구현한 뒤 연결한다. 그 전에는 레거시 봇으로 되돌리거나 로컬 계산을 운영 판정으로 사용하지 않는다.

## 이 문서의 기준

이 문서는 HandPractice를 실제로 구현하면서 부딪힌 문제와 해결 과정을 다음 작업자가 다시 따라갈 수 있도록 정리한 기록이다. 단순한 기능 목록보다는 문제가 왜 생겼고, 어떤 해결책을 선택했으며, 무엇으로 검증했는지를 남겼다.

코드와 테스트로 확인되는 내용만 완료된 사실로 적었다. 실제 카메라가 필요한 FPS, 여러 사람이 실제로 교차하는 상황, 서로 다른 네트워크에서의 TURN 연결처럼 자동 테스트로 증명할 수 없는 항목은 미측정 또는 추가 검증 필요로 표시했다.

---

## 1. 처음에는 입력 문제보다 도메인 이해가 먼저였다

### 문제

초기 화면만 보면 글자를 맞히는 게임처럼 보여 키보드 입력 중심의 연습 게임으로 오해하기 쉬웠다. 하지만 이 프로젝트의 핵심 입력은 키보드가 아니라 카메라에서 얻은 손 랜드마크와 Python TFLite 모델의 지문자 추론 결과다. 입력 경계를 잘못 이해하면 테스트 편의를 위해 만든 키보드 입력이 실제 게임 경로를 대신하게 되고, 정작 카메라·인식·손 해제 과정의 문제는 가려진다.

### 내가 정한 원칙

- 실제 게임 판정은 `MediaPipe → 손 랜드마크 21개 → Python AI WebSocket → 프런트 Decoder → 게임 Command` 경로를 기준으로 잡았다.
- 키보드는 개발용 보조 기능으로만 격리하고, 카메라 검증을 통과한 증거로 사용하지 않았다.
- Python 서버에는 영상이 아니라 선택된 손의 랜드마크만 보낸다.
- Spring 게임 서버는 지문자 추론을 하지 않고, 승인된 게임 Command와 공식 게임 상태만 관리한다.

이 경계를 먼저 고정한 덕분에 이후의 성능 개선, 다중 사용자 구분, RTC 개편을 서로 섞지 않고 진행할 수 있었다.

관련 구현:

- `frontend/src/shared/mediapipe`
- `frontend/src/game/recognition/websocket/PythonWebSocketSignRecognizer.ts`
- `game-ai-dev-server/app/main.py`
- `game-ai-dev-server/app/feature_adapter.py`

---

## 2. MediaPipe 렌더링과 추론이 버벅이던 문제

### 증상

한 개의 화면에서 다음 작업이 동시에 메인 스레드를 사용했다.

- 카메라 프레임 갱신
- Hand/Pose MediaPipe 추론
- 손 스켈레톤 Canvas 렌더링
- React UI 갱신
- PixiJS와 Matter.js 게임 렌더링
- Python AI로 랜드마크 전송
- WebRTC 영상 인코딩과 Peer 전송

모든 새 프레임을 순서대로 처리하려고 하면 느린 추론 하나 때문에 오래된 프레임이 쌓였다. 화면은 최신 손을 보여주는데 AI는 과거 손 모양을 처리하는 현상도 생길 수 있었다. 단순히 FPS를 높이는 방식은 지연과 queue만 키웠다.

### 원인

문제는 평균 연산량만이 아니라 작업 주기와 backpressure가 분리되지 않은 데 있었다. 렌더링은 60FPS가 유리하지만 Hand, Pose, Python AI를 같은 주기로 실행할 필요는 없다. 또한 실시간 인식에서는 모든 과거 프레임을 처리하는 것보다 최신 상태를 유지하는 것이 중요하다.

### 내가 적용한 해결

1. `RecognitionFrameScheduler`에서 Render, Hand, Pose 주기를 분리했다.
2. 기본 BALANCED 프로필을 Render 60, Hand 24, Pose 10, AI 12FPS로 잡았다.
3. Hand/Pose 처리에는 현재 처리 중인 프레임 하나와 대기 중인 최신 프레임 하나만 남기는 latest-only 방식을 적용했다.
4. Python AI 요청도 in-flight 하나와 최신 pending 하나만 유지했다. 새 프레임이 오면 오래된 pending을 교체하고 drop 수치를 올렸다.
5. AI 응답에는 frameId, session, sequence, active hand를 연결해 오래된 세션이나 늦게 도착한 응답을 버렸다.
6. MediaPipe 처리가 늦어진 시간 때문에 정상 AI 응답이 stale로 오판되지 않도록, AI age budget은 원본 비디오 캡처 시각이 아니라 랜드마크가 실제 준비된 시점부터 계산했다.
7. Worker에서 Hand/Pose를 실행하고, Worker 초기화나 실행이 실패하면 같은 설정의 메인 스레드 구현으로 폴백하도록 만들었다.
8. Landmark smoothing은 용도별로 분리했다. 움직임 분석에는 Raw, AI에는 약한 smoothing, Canvas 표시에는 강한 smoothing을 사용했다.
9. 성능 패널의 React 갱신은 프레임마다 하지 않고 초당 최대 네 번으로 제한했다.

핵심 구현:

- `RecognitionFrameScheduler.ts`
- `LatestFrameBuffer.ts`
- `LatestOnlyInferenceController.ts`
- `RecognitionPerformanceMonitor.ts`
- `AdaptiveHandLandmarker.ts`
- `HandLandmarkerWorkerClient.ts`
- `RecognitionPerformanceProfiles.ts`
- `recognition/vision/RecognitionVisionAdapter.ts`
- `recognition/vision/MediaPipeRecognitionVisionAdapter.ts`
- `recognition/vision/RemoteRecognitionVisionAdapter.ts`

`HandCamera`가 MediaPipe 구현을 직접 생성하던 결합은 `RecognitionVisionAdapterFactory`로 분리했다. 기본값은 브라우저 MediaPipe이며, 게임 전역 교체는 `GameModuleServices.recognitionVisionAdapterFactory` 한 곳에서 수행한다. 인식 세션도 `GameRecognitionBackend` 포트만 사용하므로 Python WebSocket 구현이 게임 진행 코드로 전파되지 않는다.

### 검증

- Scheduler별 호출 주기, pause/resume/dispose를 단위 테스트했다.
- pending frame 교체와 drop 집계를 테스트했다.
- timeout, stale response, session 전환, active hand 교체 시 과거 응답이 적용되지 않는지 테스트했다.
- 브라우저에서 실제 카메라가 640×360, 재생 상태 `readyState=4`로 동작하고 MediaPipe Canvas가 함께 갱신되는 것을 확인했다.

### 아직 남은 것

CPU 사용률과 실제 Hand/Pose/AI P95 지연은 기기와 브라우저에 따라 달라진다. 자동 테스트 수치를 실제 성능 수치로 기록하지 않았다. 카메라+AI, 1:1 Mesh, 4인 Mesh 시나리오는 개발 성능 패널로 별도 측정해야 한다.

---

## 3. 주변에 사람이 많을 때 다른 사람 손이 입력되는 문제

### 증상

Hand Landmarker 결과의 첫 번째 손을 그대로 사용하면 다른 사람이 카메라에 가까이 오거나 손을 크게 들었을 때 입력 주체가 바뀔 수 있다. Pose 결과 배열 index도 사람의 영구 ID가 아니기 때문에 두 사람이 교차하거나 confidence 순서가 바뀌면 사용자가 뒤바뀔 수 있다.

### 실패하기 쉬운 접근

- `hands[0]` 또는 `poses[0]`을 계속 사용자로 간주하는 방식
- 화면 중앙에 가까운 사람만 고르는 방식
- 얼굴 인식으로 게임 사용자를 식별하는 방식
- handedness만으로 왼손과 오른손 소유자를 고르는 방식
- 사용자를 잃었을 때 가장 가까운 다른 사람에게 자동 전환하는 방식

이 방식들은 교차와 가림에 약하거나, 게임에 필요하지 않은 생체정보 문제를 만든다.

### 내가 적용한 해결

1. 경기 전 사용자가 한쪽 손을 머리 위로 일정 시간 유지하도록 해 Active Player를 등록했다.
2. `PersonTrackManager`가 위치, bounding box, Pose 특징, 움직임, 몸통 appearance descriptor를 함께 사용해 내부 Track ID를 유지하도록 했다.
3. 상태를 `UNREGISTERED`, `REGISTERING`, `LOCKED`, `TEMPORARILY_LOST`, `REIDENTIFYING`, `AMBIGUOUS`, `USER_LOST`로 분리했다.
4. 일시 가림에는 grace time을 주되, 등록 사용자를 잃었다고 다른 사람으로 자동 전환하지 않았다.
5. `HandOwnerResolver`에서 Pose 손목 거리, 팔 방향, 이전 손과의 시간 연속성, handedness, 선택적 segmentation, Active Player bounds를 가중 합산했다.
6. 최고 후보 점수가 부족하거나 1·2위 점수 차이가 작으면 입력을 차단했다. 잘못된 사람의 손을 선택하는 것보다 입력 한 번을 놓치는 편을 안전하게 봤다.
7. 미러링된 화면과 MediaPipe 원본 좌표를 구분했다. 공간상 손목 거리를 주 신호로 사용하고 handedness는 보조 신호로만 사용했다.
8. 일반적인 1인·1손 상황에서는 느린 Pose 주기 때문에 정상 손이 깜빡이는 문제가 있어 fast path를 두었다. 주변에 경쟁 후보가 있을 때만 엄격한 다중 사용자 점수 판정을 적용했다.
9. Active Player나 Active Hand 세션이 바뀌면 이전 Python AI 응답을 무효화했다.

개인정보 경계도 함께 고정했다.

- 얼굴 검출, 얼굴 embedding, 얼굴 crop을 사용하지 않는다.
- appearance descriptor는 옷 색상·Pose 비율 같은 휘발성 값이며 메모리에만 둔다.
- descriptor, segmentation, 영상은 Python이나 Spring으로 보내지 않는다.
- Python에는 최종 선택된 손 랜드마크만 보낸다.

핵심 구현:

- `active-player/PersonTrackManager.ts`
- `active-player/ActivePlayerSession.ts`
- `active-player/ActivePlayerRegistrationController.ts`
- `active-player/HandOwnerResolver.ts`
- `active-player/ActiveHandTracker.ts`
- `active-player/PersonReIdentificationAdapter.ts`

### 검증

- Pose 결과 배열 순서가 바뀌어도 Track ID가 유지되는지 테스트했다.
- 두 사람이 교차할 때 appearance, Pose, motion으로 동일 사용자를 유지하는지 테스트했다.
- 등록 사용자의 손과 주변 사람의 손이 함께 있을 때 등록 사용자 손만 선택하는지 테스트했다.
- Pose anchor가 없는 다중 사용자 상태, 낮은 점수, 점수 동률, 갑작스러운 손 점프는 입력이 차단되는지 테스트했다.
- 1인·1손 상태에서는 Pose가 느리거나 손이 빠르게 움직여도 정상 입력을 과도하게 버리지 않는지 테스트했다.

### 아직 남은 것

실제 여러 사람이 교차하고 가리는 장면은 조명, 옷 색상, 카메라 화각의 영향을 크게 받는다. 자동화된 합성 좌표 테스트는 통과했지만, 실제 군중 테스트 결과와 ID switch 횟수는 별도 플레이테스트로 계속 기록해야 한다.

---

## 4. 카메라를 화면마다 다시 열던 문제

### 증상

대기방, 경기 화면, MediaPipe, 로컬 영상, WebRTC가 각각 `getUserMedia()`를 호출하거나 각자 track을 종료하면 다음 문제가 생긴다.

- 화면 전환 때 카메라 권한과 초기화가 반복됨
- 동일 카메라가 중복 점유됨
- 한 컴포넌트가 unmount되면서 다른 기능이 사용 중인 track까지 종료함
- RTC peer를 닫았더니 MediaPipe 카메라도 함께 꺼짐

### 내가 적용한 해결

`SharedGameCameraSession`을 카메라 track의 유일한 소유자로 만들었다.

- 기본 제약은 640×360, 15FPS ideal, 20FPS max, audio false다.
- 동시에 여러 곳에서 `start()`해도 진행 중인 Promise와 살아 있는 stream을 재사용한다.
- 로컬 preview, MediaPipe, Python용 landmark 생성, 최대 세 WebRTC peer가 같은 video track을 공유한다.
- 페이지 컴포넌트와 peer slot은 `srcObject`나 sender 연결만 정리하고 원본 track을 stop하지 않는다.
- Room 이탈 또는 GameModule 종료 시 peer와 signaling을 먼저 정리한 뒤 Shared Camera만 track을 종료한다.
- 시작 도중 화면을 이탈한 경우 generation을 비교해 늦게 열린 stream을 즉시 종료한다.

이 구조로 카메라 생명주기와 화면 생명주기를 분리했다.

---

## 5. 게임 RTC 구조를 블록 게임 전용에서 공통 Mesh로 개편

### 이전 구조의 문제

RTC가 특정 게임 화면과 1:1 상대를 전제로 묶이면 라인 레이스나 최대 4인 게임에서 재사용하기 어렵다. 게임 상태 WebSocket, SDP/ICE signaling, 실제 영상 전송의 책임도 섞이기 쉽다. 또한 A/B/C 같은 고정 peer 변수는 참가자 증감과 재접속 처리에 취약하다.

### 내가 적용한 구조

```text
방 상태와 RTC signaling: Browser ↔ Spring native WebSocket ↔ Browser
실제 영상:                Browser RTCPeerConnection ↔ Browser RTCPeerConnection
지문자 인식:              Shared MediaStream → MediaPipe → Python AI
```

- `BattleMediaSession`에 묶여 있던 개념을 게임 독립적인 `GameMediaSession`으로 일반화했다.
- peer는 `Map<remoteUserId, PeerConnectionSlot>`으로 관리했다.
- 4인 방에서 사용자 한 명당 최대 세 개의 PeerConnection을 갖는 Mesh 구조를 사용했다.
- 참가자 snapshot을 registry와 reconcile해 새 사용자는 만들고 나간 사용자는 해당 peer만 닫았다.
- bot과 `mediaEnabled=false` 참가자는 PeerConnection을 만들지 않는다.
- 같은 로컬 video track을 모든 peer에 `addTrack`하되 peer 종료 시 원본 track은 stop하지 않는다.
- offer 생성자는 userId의 안정적인 정렬로 하나만 정해 초기 glare를 줄였다.
- remote description 전에 도착한 ICE candidate는 peer별 buffer에 보관했다가 description 설정 후 적용했다.
- 한 peer 실패가 다른 peer, 게임 WebSocket, 카메라를 종료하지 않게 복구 범위를 peer 단위로 제한했다.
- 연결이 끊기면 offerer는 ICE restart를 수행하고 상대는 restart 요청을 보낸다.

### Signaling 경계

- Room 전용 native WebSocket은 방 이벤트와 WebRTC signaling만 전달한다.
- RTC client destination은 `/app/game/rtc/message`다.
- SDP, ICE, 참가자 상태만 중계하고 영상과 landmark는 Spring으로 보내지 않는다.
- client가 보낸 sender ID는 신뢰하지 않고 인증된 STOMP Principal로 결정한다.
- offer/answer/candidate는 target 사용자에게만 전달한다.
- 재접속 시 과거 signaling을 복구하지 않고 참가자 snapshot과 새 connectionId로 peer 협상을 다시 시작한다.

핵심 구현:

- `media/core/GameMediaSession.ts`
- `media/mesh/MeshWebRtcMediaSession.ts`
- `media/mesh/PeerConnectionRegistry.ts`
- `media/mesh/PeerConnectionSlot.ts`
- `media/mesh/IceCandidateBuffer.ts`
- `media/mesh/PeerOfferPolicy.ts`
- `media/signaling/WebSocketWebRtcSignalingTransport.ts`

### 검증과 발견한 후속 문제

- 참가자 수에 따라 `N-1` peer가 생기는지 테스트했다.
- offerer 결정, ICE buffering, peer 단위 제거·재연결, 전체 disconnect 정리를 테스트했다.
- 서버 봇 대기방에서 2/2 참가와 Game WebSocket 연결을 확인했다.
- 봇은 카메라가 필요 없는데 `Game media session is not connected` 경고가 표시되는 문제가 있었다. bot 또는 media 비활성 참가자는 정상 상태로 취급하고 RTC 경고와 peer 생성을 하지 않도록 분리해야 했다.

봇방에서 RTC 연결 자체를 생략한 뒤 잘못된 영상 경고와 Peer 생성은 사라졌다. 이 수정 뒤에는 로컬 카메라 상태 표시의 기준이 잘못됐다는 후속 문제가 드러났다. 실제 `SharedGameCameraSession` 영상은 640×360, `readyState=4`로 재생되고 MediaPipe도 `카메라 작동 중`이었지만, 상단 상태는 연결하지 않은 `GameMediaSession.isCameraEnabled()`를 읽어 `카메라 꺼짐`으로 표시했다.

봇방의 로컬 카메라 상태는 RTC 세션 상태가 아니라 `SharedGameCameraSession`의 live video track 또는 실제 local stream을 기준으로 표시해야 한다. 사람 대 사람 방에서는 RTC 송출 여부와 로컬 캡처 여부를 구분해 보여주는 편이 안전하다. 하나의 `카메라` 문구에 두 상태를 섞으면 영상은 정상인데 꺼짐으로 보이거나, 캡처는 켜졌지만 상대에게 송출되지 않는 상태를 놓칠 수 있다.

이 문제는 로컬 상태를 `STARTING`, `ON`, `NEEDS_CONNECTION`으로 분리하고 live video track을 기준으로 갱신하는 방식으로 해결했다. track의 `ended` 이벤트가 발생하면 즉시 `NEEDS_CONNECTION`으로 전환해 시작 버튼과 차단 사유도 같은 상태를 사용하게 했다. 사람 대 사람 방의 RTC 송출 조건은 별도 `rtcCameraReady`로 유지하고, 봇방에서는 RTC 조건을 정상적으로 생략했다.

수정 후 실제 서버 봇방에서 다음을 함께 확인했다.

- local video: 640×360, `readyState=4`, 재생 중
- 카메라: `켜짐`
- MediaPipe: `카메라 작동 중`
- Game WebSocket: `CONNECTED`
- RTC Signaling: `사용 안 함 (정상)`
- 상대 참가자: `BOT · 정상`
- 영상 연결 경고와 브라우저 console error 없음

관련 회귀 테스트는 live track, track 없음, track 종료, 봇방 RTC 미생성, 사람 방 RTC 오류 유지까지 포함해 추가했다.

### 아직 남은 것

localhost 밖에서 카메라와 WebRTC를 사용하려면 HTTPS/WSS가 필요하다. 서로 다른 NAT 환경에서 직접 연결이 실패할 경우를 위해 운영 TURN과 단기 credential 제공 경계도 별도로 검증해야 한다.

---

## 6. 같은 지문자를 들고 있을 때 입력이 반복되던 문제

### 문제

프레임마다 같은 글자를 높은 confidence로 예측했다고 매번 게임 입력으로 바꾸면 손을 계속 들고 있는 동안 공격이 반복된다. 반대로 안정화 시간을 과도하게 길게 잡으면 사용자가 이미 자세를 만들었는데도 게임이 늦게 반응한다.

### 내가 적용한 해결

- Python AI는 모델 prediction과 top candidates만 제공하고 게임 Command 확정과 lock은 프런트의 연속 지문자 Decoder가 담당하게 했다.
- 후보 window, confidence, 연속 안정성, 손 움직임을 함께 사용해 한 번만 확정한다.
- 확정 후에는 같은 자세를 계속 유지해도 다시 입력하지 않는다.
- 손이 사라지거나 자세 거리가 충분히 변한 상태가 일정 시간 유지돼야 `RELEASED`로 전환한다.
- 네트워크 응답이 늦게 도착해도 session/sequence/active hand가 다르면 무시한다.
- 라인 레이스에서는 현재 공격 패와 카운터 가능한 장애물 문맥으로 후보를 좁히되, 모델에 없는 글자를 만들어 내지는 않는다.
- 카운터가 실제로 가능한 순간에는 공격보다 카운터 목표를 우선 표시한다.

이 구조로 모델의 역할과 게임 입력 확정의 역할을 분리했다. 인식률 문제를 서버 cooldown으로 숨기지 않고, 손 해제와 temporal 상태로 해결했다.

---

## 7. 라인 레이스가 클라이언트마다 다르게 끝날 수 있던 문제

### 문제

클라이언트 애니메이션 위치를 공식 진행도로 사용하면 렌더링 FPS, 네트워크 지연, 보간 상태에 따라 승패가 달라질 수 있다. 공격 cooldown, 장애물 충돌, 카운터 성공도 클라이언트 판정을 신뢰하면 중복 Command와 조작에 취약하다. 동시에 결승선에 도착한 플레이어를 collection 순서로 처리하면 공정하지 않은 승자가 생긴다.

### 내가 적용한 해결

- 경기 시간, 진행도, 공격 패, cooldown, 장애물, counter window, penalty, 결과를 Spring 서버 권위로 옮겼다.
- 클라이언트는 서버 상태를 보간하고 효과를 재생하지만 승패 계산에는 사용하지 않는다.
- Command마다 commandId를 두고 서버에서 멱등 처리했다.
- event sequence와 snapshot으로 재접속 상태를 복구했다.
- 결승선 도달 시점은 tick 처리 시각이 아니라 해당 구간에서 실제로 결승 거리를 통과한 시간을 계산해 저장했다.
- 결승 도달 시각이 같으면 참가자 순서와 무관하게 `DRAW`로 처리했다.
- snapshot 재수신 시 과거 공격·카운터 효과가 다시 재생되지 않도록 eventId 기반 중복 방지를 적용했다.

### 검증

- 중복 Command, cooldown, 잘못된 카드, counter window 경계, 재접속 snapshot을 백엔드 테스트로 검증했다.
- 참가자 삽입 순서를 바꾼 동시 결승에서도 승자가 바뀌지 않는지 테스트했다.
- 프런트 결과 화면이 DRAW를 WIN/LOSE로 바꾸지 않는지 테스트했다.

---

## 8. 밸런스를 감으로 조정하던 문제

### 문제

게임 속도, 장애물 간격, counter window를 한두 판의 느낌만으로 바꾸면 특정 실력 구간이나 특정 진영에 편향될 수 있다. 프런트, 백엔드, 봇에 같은 값이 복제돼 있어 한 곳만 바뀌는 drift 문제도 있었다.

### 내가 적용한 해결

- `game-contracts/balance/line-race-obstacles.json`을 canonical source로 정했다.
- 프런트 typed mirror, 백엔드 기본값, 봇 profile을 계약 테스트로 비교했다.
- deterministic simulator와 paired side-swap을 만들어 같은 seed에서 구조적 편향을 확인했다.
- broad sweep, 상위 후보 재실행, finalist 대량 실행 순서로 총 200,300경기의 근거를 남겼다.
- 평균만 보지 않고 경기 시간 분포, timeout, 공격 승인·거절, counter, blocked time, comeback, simultaneous finish를 함께 봤다.
- 최종 v3 설정을 10,000경기로 다시 실행해 결과 hash `6572e113edf75a51b45c432f3c62ef5c486d27d679c67f690d3801d964125aeb`가 재현되는 것을 확인했다.

현재 기준 주요 값은 raceLength 1050, base speed 28/s, counter window 2200ms, obstacle lead 160, minimum spacing 60, pending 최대 4다. 이 값은 실제 사용자 인식률을 뜻하지 않는다. 시뮬레이터의 human profile은 UX 민감도 분석을 위한 명시적 가정이므로 실제 카메라 플레이 결과와 분리해서 해석해야 한다.

---

## 9. 게임 피드백이 서버 판정보다 앞서던 문제

### 문제

인식 성공 직후 공격 성공 효과를 먼저 보여주면 서버가 cooldown이나 상태 문제로 거절했을 때 화면과 공식 결과가 충돌한다. 재접속 snapshot이나 중복 이벤트가 같은 효과음을 여러 번 재생할 수도 있었다. 또한 사용자는 인식 중인지, 서버 판정 대기 중인지, 손을 풀어야 하는지 구분하기 어려웠다.

### 내가 적용한 해결

- `RECOGNIZING`, `CONFIRMED`, `PENDING`, `SUCCESS`, `REJECTED`, `RELEASE_REQUIRED` 상태를 화면에서 구분했다.
- 서버 승인 이벤트가 온 뒤에만 카드 소비, 장애물 발사, 성공 효과음을 재생했다.
- 카운터 가능 장애물이 있으면 현재 행동 목표를 카운터로 전환했다.
- eventId와 commandId를 bounded set으로 관리해 재수신 효과를 막았다.
- snapshot은 상태 복구에만 사용하고 과거 terminal effect를 재생하지 않았다.
- 음소거를 저장하고 첫 사용자 상호작용 전에 Web Audio가 자동 재생되지 않게 했다.
- `prefers-reduced-motion`에서는 흔들림과 강한 이동 효과를 줄였다.
- 개발 모드 계측에는 후보 인식, 확정, 전송, 서버 판정, 피드백 표시 시간을 기록했다.
- 계측 JSON에는 영상, 이미지, 손·몸 landmark, 얼굴 정보, 원본 WebSocket payload를 넣지 않았다.

핵심 구현:

- `line-race/feedback/LineRaceFeedbackPresenter.ts`
- `line-race/feedback/LineRaceFeedbackAudio.ts`
- `line-race/feedback/LineRacePlaytestTelemetry.ts`
- `line-race/components/LineRaceActionFeedbackBanner.tsx`
- `line-race/components/LineRaceSoundToggle.tsx`

---

## 10. 검증 과정 자체에서 겪은 문제

### 서버 재시작 없이 새 코드를 검증한 문제

Vite는 보통 HMR이 적용되지만 Spring Boot와 Python 서버는 변경 내용에 따라 재시작이 필요했다. 포트가 열려 있다는 사실만으로 새 코드가 실행 중이라고 판단하지 않고 다음을 확인했다.

- 5173 프런트 HTTP 응답
- 8091 `/api/dev/health`
- 8765 WebSocket의 HTTP 426 Upgrade Required 응답
- 포트 소유 프로세스의 실행 경로
- 브라우저의 Game WebSocket, MediaPipe, 카메라 상태

### 테스트를 과도하게 병렬 실행한 문제

계약, Gradle, Vitest, Vite build, TensorFlow 테스트를 한 번에 실행했더니 Windows에서 PowerShell 초기화 단계의 `OutOfMemoryException`이 발생했다. 이것은 코드 테스트 실패가 아니었다. 이후 무거운 테스트는 순차 실행했다.

전체 도구를 순차로 바꾼 뒤에도 시스템의 가용 메모리가 낮은 상태에서는 Vitest 내부 worker 여러 개가 동시에 시작하며 Node의 `Zone Allocation failed`와 `JavaScript heap out of memory`가 발생했다. 같은 테스트를 worker 하나와 파일 병렬화 비활성 조건으로 실행했을 때 67개 파일, 216개 테스트가 모두 통과했다.

```powershell
npm.cmd test -- --run src/game/glyph-battle src/game/recognition src/shared/mediapipe --maxWorkers=1 --fileParallelism=false
```

따라서 이 오류가 나오면 heap 크기만 무조건 늘리기 전에 다른 개발 서버와 테스트 프로세스가 메모리를 점유하는지 확인하고, 검증 환경에서는 worker 수를 제한한다. worker 제한 실행도 실패할 때만 실제 테스트 회귀로 분류한다.

### 잘못된 테스트 러너를 사용한 문제

AI 가상환경에는 `pytest`가 설치돼 있지 않았다. 테스트 파일은 `unittest` 기반이므로 다음 명령으로 검증했다.

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

검증 도구가 없다는 오류와 코드 회귀 실패를 구분해야 한다.

### 브라우저 자동화의 한계

자동화로 서버 봇방 생성, 연결 상태, 카메라 스트림, 자세 등록 게이트까지 확인할 수 있었다. 하지만 사용자의 실제 신체 동작을 자동화가 대신했다고 기록하지 않았다. 실제 지문자 수행과 여러 판 완주는 사용자 참여가 있을 때만 완료로 인정한다.

---

## 11. 현재 회귀 검증 기준

기능 변경 후 최소한 다음을 확인한다.

```powershell
# 계약과 시뮬레이터
cd game-contracts
..\game-ai-dev-server\.venv\Scripts\python.exe -m unittest discover -s tests -v

# 백엔드
cd ..\game-dev-backend
.\gradlew.bat check --rerun-tasks

# 프런트
cd ..\frontend
npx.cmd vitest run src/game
npm.cmd run build

# AI 서버
cd ..\ai-server
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

전체 스택 검증에서는 계약 29개, AI 서버 16개 테스트와 백엔드 Gradle check가 통과했다. 2026-07-21 hybrid AI와 블록 1:1 참가자 자동 입장 회귀까지 포함해 `src/game` 전체 122개 파일, 459개 테스트와 TypeScript/Vite production build가 통과했다. 이 범위에는 솔로, 블록 대전, 라인 레이스, 턴 배틀, Room/Match transport, Recognition session, 카메라 shared stream 회귀가 포함된다. 로컬 브라우저에서는 솔로 타이머/physics, 블록 1:1 두 사용자 Game WebSocket 연결, 턴 배틀 봇전 여러 턴, 턴 배틀 1:1 두 사용자 대기실까지 직접 확인했다. 테스트 브라우저의 카메라 권한 거부 때문에 턴 배틀 1:1 실제 경기 시작과 실제 손동작 인식은 카메라가 있는 Chrome/Edge 검증으로 남긴다. 이후 테스트가 추가되면 숫자가 늘어날 수 있으므로 고정된 테스트 개수보다 전체 통과 여부와 새 회귀 테스트의 존재를 우선 확인한다.

---

## 12. 다음 작업자가 먼저 볼 체크리스트

- 카메라가 느리면 FPS부터 무작정 올리지 말고 drop, stale, AI P95, main-thread long task를 함께 본다.
- 인식이 늦으면 모델만 의심하지 말고 Hand 처리 완료 시각과 AI age budget을 확인한다.
- 다른 사람 손이 들어오면 threshold만 낮추지 말고 Active Player 상태, Pose anchor, 후보 점수 차이, mirror 좌표를 본다.
- 카메라가 갑자기 꺼지면 누가 track을 소유하고 `stop()`했는지 확인한다.
- RTC 한 명이 끊겼을 때 전체 media session이나 game socket을 같이 닫지 않는다.
- bot 참가자는 RTC peer와 상대 영상이 없어도 정상이다.
- 서버 승인 전 성공 효과를 재생하지 않는다.
- snapshot과 live event를 같은 효과 입력으로 취급하지 않는다.
- 밸런스 값을 바꾸면 canonical, 프런트, 백엔드, 봇, simulator가 모두 일치하는지 drift test로 확인한다.
- 자동 테스트가 통과해도 실제 카메라와 실제 네트워크에서 확인하지 않은 항목은 완료라고 쓰지 않는다.

---

## 13. 봇전 시작 동기화와 장애물 상태 경쟁을 실제 플레이로 해결한 기록

### 증상

봇방 생성과 자세 등록까지는 성공했지만 경기 화면은 `경기 시작 동기화 중`에 머물렀다. 서버에서는 봇만 계속 달렸고 사용자는 공격 패를 받지 못했다. 경기 종료 뒤에는 결과 화면이 나왔지만 공격 기록은 `0/0`이었다. 같은 실행에서 스케줄러는 간헐적으로 `obstacle is not active` 예외를 남겼다.

### 내가 확인한 원인

- 대기방에서 만든 STOMP 연결은 개발 사용자 헤더를 보냈지만, 경기 화면이 연결을 새로 만들 때는 인증 헤더를 전달하지 않았다.
- 서버는 CONNECT에서 만든 Principal을 등록하고도 이후 SEND와 SUBSCRIBE 프레임에 Principal이 없을 때 복원하지 않았다.
- 카운터 명령과 진행 스케줄러가 같은 장애물을 동시에 처리할 수 있었다. 진행 정책이 ACTIVE 장애물을 선택한 직후 카운터가 먼저 상태를 가져가면 `beginTraversal()`이 예외를 던졌다.
- 세션 종료 이벤트가 먼저 registry를 비운 뒤 STOMP DISCONNECT가 들어오면 Principal 복원 과정에서 불필요한 경고가 발생했다.

### 적용한 해결

- `LineRaceGamePage`가 직접 연결하거나 재연결할 때도 access token 또는 개발 사용자 헤더를 항상 전달했다.
- `DevGameInboundChannelInterceptor`가 CONNECT에서 등록한 Principal을 session id로 복원해 이후 프레임에 다시 넣도록 했다.
- DISCONNECT는 Principal 복원보다 먼저 처리하고 이미 제거된 세션도 정상 종료로 취급했다.
- 장애물에 원자적인 `tryBeginTraversal()`을 추가했다. 카운터가 먼저 성공했다면 진행 정책은 예외를 내지 않고 해당 위치부터 달리기를 계속한다.
- 장애물 상태 변경 메서드를 동기화해 카운터와 통과가 동시에 같은 상태를 가져가지 못하게 했다.

### 검증 결과

- 백엔드 `gradlew check`: 통과
- 라인 레이스 프런트 테스트: 44개 파일, 161개 테스트 통과
- 프런트 production build: 통과
- 전체 프런트 테스트: 475개 중 474개 통과. 남은 1개는 이 변경과 무관하게 jsdom에 없는 `CloseEvent`를 직접 생성하는 인식기 테스트다.
- 실제 NORMAL 봇전: 카운트다운, 60초 타이머, 공격 패, 진행도, 결과 화면 확인
- 실제 EASY 봇전: `ㅈ` 카운터 성공 1회, `ㄱ` 공격 승인 1회, 패 보충, 콤보 증가, 결과 화면 확인
- 수정 뒤 플레이 로그에서는 `WebSocket authentication is required`와 `obstacle is not active`가 재발하지 않았다.

이번 문제에서 자동 테스트만으로는 CONNECT 이후 프레임의 Principal 누락과 카운터/스케줄러 경쟁을 잡지 못했다. 앞으로 네트워크 흐름을 바꿀 때는 같은 브라우저 세션에서 대기방 → 경기 → 결과 → 두 번째 경기까지 연속으로 실행한다.

---

## 14. 자모 경로가 트랙을 가리고 수달이 비정상적으로 움직인 문제

### 증상

장애물이 등장하면 자모 획을 확대한 흰색·분홍색 경로가 경기장 중앙을 덮었다. 수달은 직선 레이스를 하는 대신 그 경로를 따라 위아래로 이동하고 회전했다. 장애물이 여러 개면 두 선수의 진행 상황과 결승선까지 가려져서, 규칙을 구현했더라도 실제로는 무엇을 보고 대응해야 하는지 알기 어려웠다. 출발점에서는 수달과 선수 이름도 겹쳤다.

### 내가 확인한 원인

- 장애물 템플릿의 자모 획을 `createRoadTemplate()`으로 확대해 실제 트랙의 우회도로로 삽입하고 있었다.
- `TRAVERSING` 상태에서는 `TimeBasedObstaclePathFollower`가 수달 좌표와 회전값을 자모 경로에 직접 연결했다.
- ACTIVE 상태의 자모 글자는 숨기고 우회 경로만 보여서, 사용자는 대응해야 할 글자보다 큰 선을 먼저 보게 됐다.
- React HUD와 Pixi HUD가 동시에 있어 경기 정보가 중복됐고, 상대 봇 영상 영역이 경기장 너비를 불필요하게 줄였다.
- 개발 하네스는 React StrictMode의 setup-cleanup-setup 과정에서 입력 컨트롤러를 즉시 폐기해 새로고침 뒤 빈 화면이 될 수 있었다.

### 내가 적용한 해결

- 처음에는 가독성을 해결하려고 자모 경로를 작은 토큰과 충돌 흔들림으로 대체했다. 하지만 이렇게 하면 `지문자가 세계를 바꾼다`는 게임의 핵심까지 사라진다는 피드백을 받았다. 문제는 경로의 존재가 아니라 크기, 레이어, 진입 규칙이 없던 구현이었다.
- 최종적으로 모든 자모 코스에 왼쪽 진입점과 오른쪽 복귀점을 추가했다. 수달은 순간이동하지 않고 직선 도로에서 진입해 자모 획 전체를 달린 뒤 다시 레이스 도로로 합류한다.
- 자모 세계는 대상 레인 안의 118~146px 구간과 48~58px 높이 안에서만 생성한다. 다른 레인과 결승선을 침범하지 않는다.
- 진입·복귀 구간은 기존 도로 재질로 그리고, 사용자가 만든 실제 자모 획만 공격색과 흰색 노드로 발광시켰다. 이 분리가 없으면 ㄱ의 진입선까지 분홍색으로 보여 ㄷ처럼 읽혔다.
- WARNING에서는 완성될 자모 지형을 낮은 투명도로 미리 투영한다. FALLING에서는 획이 순서대로 생성되고, ACTIVE/TRAVERSING에서는 완전히 물질화되며, COUNTERED/REMOVING에서는 초록색으로 바뀌어 붕괴한다.
- `TimeBasedObstaclePathFollower`를 다시 사용하되 새 전방 진행 경로에만 연결했다. 수달은 글자의 실제 획 좌표를 따라가고 회전은 최대 0.24rad로 제한해 뒤집히지 않게 했다.
- 달릴 때 빠른 상하 움직임, 스쿼시, 먼지 효과를 추가해 정지 이미지를 미끄러뜨리는 느낌을 줄였다.
- 선수별 트랙 색, 진행 막대, 결승선을 단순화하고 출발점 여백을 늘려 이름과 수달이 겹치지 않게 했다.
- 중복 Pixi HUD를 제거하고 React HUD만 남겼다. 실제 경기 페이지에서는 경기장을 전체 너비로 쓰고 봇/상대 영상은 작은 오버레이로 줄였다.
- 연결 상태는 작은 상태 칩으로 축소하고 카메라·공격 패·접근 장애물 영역보다 경기장이 먼저 보이게 레이아웃 비율을 바꿨다.
- 개발 하네스의 runtime, input controller, gateway는 `useStrictModeSafeDispose()`로 정리해 실제 unmount 또는 교체 때만 폐기한다.

### 검증 결과

- 렌더러, 경기 페이지, 개발 하네스 관련 5개 테스트 파일의 15개 테스트 통과
- 프런트 production build 통과
- 개발 하네스에서 ㄱ과 ㅇ을 직접 생성해 글자별 획이 전방 코스로 물질화되는 것을 확인
- 진입선은 기존 도로색, 자모 획만 공격색으로 분리되어 ㄱ과 ㅇ이 즉시 구분되는 것을 확인
- 자모 세계가 한 레인 안에 머물고 다른 레인이나 결승선을 가리지 않는 것을 확인
- Traversing 동안 서버 진행도는 멈추고 자모별 penalty가 누적된 뒤 정상 직선 주행으로 복귀하는 것을 확인

이번 변경에서는 난이도나 경기 속도를 조정하지 않았다. 먼저 `손동작 → 글자 생성 → 세계 변화 → 상대의 실제 주행 → 카운터 시 붕괴`가 화면에서 하나의 인과로 보이게 만드는 데 집중했다.

---

## 15. 기능은 추가됐지만 여전히 기존 레이스처럼 보였던 문제

### 증상

글자 투사체와 충돌 효과를 추가했는데도 플레이 화면은 여전히 위아래 레인, 결승선, 큰 직사각형 트랙으로 구성돼 있었다. 글자가 날아가는 몇 초를 제외하면 이전 화면과 거의 같았고, 글자가 상대 세계를 바꾼다기보다 기존 레이스 위에 이펙트를 붙인 것처럼 보였다. 특히 큰 레인 배경이 화면 대부분을 차지해 글자 획과 캐릭터의 관계를 약하게 만들었다.

### 내가 잘못 판단한 부분

- 서버의 `LINE_RACE` 진행도와 장애물 상태를 유지해야 한다는 이유로 화면의 레이스 문법까지 보존했다.
- 공격의 인과관계를 강화하겠다고 하면서도 기존 UI와 결승선을 제거하지 않아 핵심 장면의 시각적 우선순위가 바뀌지 않았다.
- WARNING 단계부터 완성된 글자 경로를 보여 줘서, 투사체가 부딪힌 뒤 글자가 생성된다는 느낌도 약해졌다.
- 자동 테스트와 빌드 통과를 게임성 검증으로 착각하지 않도록 주의해야 했는데, 실제 화면에서 ‘이전과 완전히 다른 게임으로 읽히는가’를 더 먼저 봤어야 했다.

### 적용한 해결

- 상하 레인, 트랙 바닥, 결승선 렌더러를 플레이 화면에서 제거했다.
- 두 캐릭터가 한 전장에서 서로 마주 보는 `glyph-arena-v2` 구도로 교체했다. 서버의 진행도는 이동 거리가 아니라 `세계 장악력`으로 표현한다.
- 공격자의 현재 레이스 좌표가 아니라 공격자 영역에서 글자가 태어나 상대 영역으로 날아가도록 투사체 시작점과 도착점을 고정했다.
- WARNING에는 작은 목표 예고와 비행 중인 글자만 표시하고, 실제 글자 획은 충돌한 FALLING 이후에만 상대 영역에서 그려지도록 했다.
- 충돌 후 획을 4중 글로우로 크게 그리고, TRAVERSING 동안 상대 캐릭터가 그 획의 실제 좌표를 따라 움직이게 했다.
- 상대 영상 오버레이를 숨기고 캔버스 테두리도 제거해 전장을 가리는 카드형 요소를 줄였다.
- 게임 선택·로비·플레이 화면의 이름을 `지문자 월드 배틀`로 바꾸고, 규칙 설명도 `손으로 글자 생성 → 비행 → 충돌 → 획 지형 → 세계 장악` 순서로 다시 작성했다.

### 검증 결과

- 렌더러 관련 테스트 3개 파일, 8개 테스트 통과
- 프론트엔드 production build 통과
- 개발 하네스에서 `ㄱ`이 PLAYER_A 영역에서 생성돼 PLAYER_B에게 비행하는 장면 확인
- `ㅁ` 충돌 후 PLAYER_B 영역에 거대한 네모 획이 생성되고, 상대 수달이 그 획 안을 직접 통과하는 TRAVERSING 상태 확인
- 기존 큰 레인 박스와 결승선이 더 이상 캔버스에 나타나지 않는 것 확인

이번 수정에서 서버 계약은 호환성을 위해 유지했지만, 화면의 기준은 레이스가 아니라 `내가 만든 글자가 상대 세계의 물리 법칙이 된다`로 바꿨다.

---

## 16. 충돌 알림이 화면 전체를 가리고 글자가 쌓이기만 했던 문제

### 증상

충돌 순간 `장애물 충돌 · 감속`이라는 작은 알림을 띄우려 했는데 흰색 세로 캡슐이 캔버스 높이 전체로 늘어나 전장을 가렸다. 이 요소를 빼더라도 게임은 글자를 상대 앞에 던져 쌓아 두고 나중에 통과하는 구조라서, 공격 선택·체력·콤보·자원 관리가 없는 애니메이션 구경에 가까웠다.

### 원인

- `.canvas > * { height: 100% }`가 캔버스 직계 자식인 알림 오버레이에도 적용됐다.
- 공격 상태를 설명하려고 만든 `gameplayCue`가 실제 공격 애니메이션과 중복됐고, 작은 배지가 화면 전체 높이를 차지했다.
- `ACTIVE` 상태 글자를 계속 그려 상대 앞에 여러 글자가 주차됐다.
- 서버의 진행도와 감속을 그대로 게임 규칙으로 사용해 모든 글자가 실질적으로 같은 효과를 냈다.

### 적용한 해결

- `gameplayCue`의 React 상태, JSX, CSS, 충돌 문구를 전부 삭제했다. 크기만 줄이는 방식으로 남겨 두지 않았다.
- `ACTIVE` 글자는 렌더링하지 않고, 공격·카운터·피격이 끝나면 글자 렌더 객체가 사라지도록 했다.
- 백엔드는 다른 팀원이 새로 만들 예정이므로 Java 도메인과 공용 밸런스 계약은 수정하지 않았다.
- 프론트에 독립적인 `GlyphDuelModel`을 만들었다. 기존 서버 이벤트는 누가 어떤 글자를 성공했고 카운터했는지를 알려 주는 입력으로만 사용한다.
- 프론트 대전 모델에서 HP 100, 2선승 라운드, 먹물 게이지, 콤보 제한 시간, 반복 기술 보정, 각성 공격, 퍼펙트 카운터를 실제 수치로 계산한다.
- `ㄱ→ㅣ` 획 잇기, `봉인→폭발` 봉인 파쇄, `파동→절단` 되받아치기처럼 입력 순서에 따른 콤보 레시피와 추가 피해를 넣었다.
- 같은 글자를 900ms 안에 카운터하면 피해를 완전히 취소하고 공격자에게 6 피해를 반사하며 먹물 42를 얻는다.
- 절단·봉인·파동·폭발은 기본 피해, 먹물 획득량, 경직 시간, 자원 제거량이 서로 다르다.
- 캔버스 상단을 대전게임 HUD로 바꿔 양쪽 체력, 먹물, 라운드 승수, 현재 콤보와 기술 판정을 표시한다.
- 옛 `세계 장악력` 막대와 자동 레이스 진행 표현은 전투 화면에서 제거했다.

### 검증 결과

- 프론트 대전 모델·렌더러·게임 페이지 관련 5개 파일, 15개 테스트 통과
- 최종 통합 4개 파일, 13개 테스트 통과
- production build 통과
- 브라우저 DOM에서 `gameplayCue`와 `.gameplayCue` 요소가 모두 0개인 것 확인
- 개발 하네스에서 HP 86/58, 먹물 64/38, 라운드 1/0, 2 HIT, `ㄱ→ㅣ 획 잇기 27 DAMAGE` HUD 확인
- ㅊ 폭발형 투사체가 상대에게 날아가고 공격 종료 후 글자가 전장에 쌓이지 않는 것 확인

이 버전의 프론트 판정 모델은 프로토타입용이다. 새 백엔드는 `ATTACK_ACCEPTED → COUNTER_SUCCEEDED 또는 HIT_RESOLVED` 이벤트 순서와 `GlyphCombatRules`의 수치 계약을 서버 권위로 옮기면 된다.

---

## 17. 대전 규칙은 있었지만 선택과 결과가 읽히지 않았던 문제

### 증상

체력과 기술 종류를 추가했지만 화면은 여전히 글자를 던지고 상대가 맞는 실시간 연출에 가까웠다. 사용자는 지금 무엇을 선택하는지, 상대 기술을 언제 알게 되는지, 왜 피해량이 달라지는지 알기 어려웠다. 결과 화면에도 완주 시간과 진행도가 남아 있어 대전게임과 레이스게임이 섞여 보였다.

### 내가 잘못 판단한 부분

- 공격, 방어, 자원 수치를 넣으면 자동으로 게임성이 생길 거라고 생각했다.
- 순차 턴을 사용하면 상대 선택을 보고 대응할 수 있어 심리전이 사라진다는 점을 처음 설계에 충분히 반영하지 못했다.
- 지문자 역할을 모양과 연결해 설명하지 않아 임의로 분류한 기술처럼 보였다.
- 화려한 배경과 캐릭터 자산을 채우는 것보다 화면 문법을 명확히 만드는 일이 먼저였다.
- 기존 라인레이스 결과 DTO를 그대로 표시해 완주 시간, 최종 진행도, 장애물 통과가 남았다.

### 적용한 해결

- 양쪽이 동시에 비공개로 기술을 선택하고 모두 잠긴 뒤 공개하는 턴 구조로 바꿨다.
- 상대 선택 잠금 화면에서는 물음표 카드만 보이고 지문자, 역할, 속성을 노출하지 않는다.
- `GLYPH_TURN_CHOICE_LOCKED`, `GLYPH_TURN_RESOLVED`, `GLYPH_DUEL_SNAPSHOT` 계약 초안을 만들었다.
- 닫힌 `ㅇ·ㅁ`은 방어, 모음 획은 집중, 각진 기본 자음은 공격, 강한 자음은 필살로 분류 근거를 고정했다.
- `획 > 결 > 울림 > 획` 세 가지 상성만 유지했다.
- 인식 confidence와 분리된 고정 동작 난이도 1~3을 만들고 피해, 방어 감소율, 집중 획득을 약 1.0/1.14/1.28배로 조정했다.
- 첫 입장 시 동시 선택, 역할, 상성, 승리 조건을 네 단계로 설명하는 온보딩을 추가했다.
- 수달 이미지와 외부 캐릭터 자산을 제거하고 흑백 선 캐릭터로 교체했다.
- 내 캐릭터를 왼쪽 아래 전경, 상대를 오른쪽 위 후경에 두고 종이 질감, 중앙선, 원형 경기장, 낮은 대비 관중선을 그렸다.
- 공격은 베기 선, 방어는 원형 결계, 집중은 동심원, 필살은 방사형 폭발 애니메이션으로 구분했다.
- 결과 화면에서 완주 시간, 최종 진행도, 장애물 통과, 누적 지연을 제거했다.
- 공통 `MatchModuleTransport`와 설정 가능한 STOMP 채널을 만들어 새 백엔드 셸과 게임 규칙을 분리했다.
- `GameServiceProvider`가 지문자 transport override를 무시하고 직접 생성하던 문제를 수정했다.

### 검증 결과

- Match 채널, 블록 transport, 지문자 transport, 턴 규칙, 렌더 스타일, 게임 페이지, 결과 페이지 7개 테스트 파일의 20개 테스트 통과
- 프런트 production build 통과
- 개발 하네스 실제 캡처에서 흑백 종이 경기장, 원근 배치된 선 캐릭터, HP·집중·방어 HUD, 기술별 중앙 판정 효과 확인
- 로비에서 레이스·세계 창조 문구가 제거되고 `지문자 턴 배틀` 규칙으로 표시되는 것 확인

현재 기존 서버는 `LINE_RACE_*` 이벤트만 보내므로 화면 프로토타입의 HP 판정은 아직 프런트 호환 모델이다. 운영 환경에서는 새 Match 모듈이 동시 선택과 전체 상태를 권위 있게 계산하고, 프런트는 Snapshot을 표시만 해야 한다.

---

## 18. 흑백 화면을 단순 도형으로만 처리해 캐릭터와 장소성이 사라진 문제

### 증상

흑백 콘셉트를 적용하면서 캐릭터를 선 몇 개로 만든 사람 형태로 바꾸고, 배경도 큰 원과 타원으로 경기장 모양만 표시했다. 기능은 동작했지만 캐릭터에 애착을 느낄 요소가 없었고, 화면을 멈춰 놓으면 어디에서 싸우는지도 알 수 없었다. 캐릭터 이름까지 몸 뒤에 겹쳐 보여 프로토타입의 완성도가 더 낮아 보였다.

### 내가 잘못 판단한 부분

- 흑백이라는 조건을 저비용 도형으로 단순화해도 된다는 뜻으로 받아들였다.
- 지문자 기술 이펙트만 잘 보이면 캐릭터는 표식 정도여도 된다고 판단했다.
- 한 장의 정지 스프라이트를 위아래로 흔드는 것만으로 살아 있는 캐릭터처럼 보일 거라 생각했다.
- 배경을 비워 두는 것과 장소성을 없애는 것을 구분하지 못했다.

### 적용한 해결

- 사람 선 캐릭터를 제거하고, 손이 크고 표정이 잘 읽히는 오리지널 수달 결투 캐릭터 두 종으로 교체했다.
- 캐릭터는 굵은 검은 외곽선, 흰 면, 최소한의 회색만 사용해 110~180px 크기에서도 실루엣과 앞발 동작이 읽히게 했다.
- 생성 원본의 녹색 배경을 투명 매트로 제거했다. 실제 런타임 파일은 `turn-otter-player.png`, `turn-otter-rival.png`이고, 재가공을 위한 원본은 같은 폴더의 `*-chroma.png`로 남겼다.
- `RaceRunnerRenderer`에서 두 이미지를 미리 불러오고 플레이어는 전경, 상대는 후경 크기로 배치했다.
- 모션을 `IDLE`, `LOCKED`, `ATTACK`, `GUARD`, `FOCUS`, `FINISHER`, `HIT`로 나눴다. 대기 중에는 몸통의 아주 작은 확대·축소와 상하 이동을 섞어 호흡을 만들고, 선택 잠금은 앞발 주변 파동, 공격은 전진과 잔상, 방어는 몸을 낮추는 압축과 방어선, 집중은 몸 주변 수렴선, 필살은 더 큰 전진과 방사선, 피격은 반대 방향 밀림과 짧은 떨림으로 표현했다.
- `GlyphDuelMoveView`에 `attackerId`, `targetId`를 추가해 같은 판정에서도 공격자와 피격자가 서로 다른 모션을 실행하게 했다.
- 배경의 큰 원형 경기장을 제거하고 강변 대련장으로 다시 그렸다. 먼 강둑의 낮은 지붕, 보행교 아치, 관중, 양쪽 깃발, 수면선, 원근이 잡힌 목재 대련장을 모두 Pixi 선으로 구성했다.
- 캐릭터 아래의 동심원도 없애고 바닥에 닿는 짧은 붓선만 남겼다.
- 캐릭터 이름은 몸 뒤가 아니라 발밑 영역으로 이동했다.

### 검증 결과

- 렌더러, 레인 렌더러, 결투 모델 관련 3개 테스트 파일의 10개 테스트가 통과했다.
- 프런트 production build가 통과했다.
- `VITE_LINE_RACE_DEV_TOOLS=true` 개발 화면을 브라우저에서 직접 열어 투명 배경, 플레이어·상대 크기 차이, 강변 다리와 목재 대련장, 이름표 위치를 확인했다.
- 경기 시작 직후 실제 프레임에서 정지 자세와 다른 몸통 높이·기울기·위치가 적용되는 것을 확인했다.

현재 모션은 프런트가 받은 턴 판정의 `role`, `attackerId`, `targetId`, `calloutAt`을 시각화한다. 새 Match 모듈을 붙일 때도 이 필드를 같은 의미로 제공해야 공격·방어·집중·피격 모션이 서버 판정과 일치한다.

---

## 20. 공격이 다음 턴에 한 번 더 재생되고 1:1이 레거시 판정과 섞이던 문제

### 증상

봇전에서 기술을 한 번 선택했는데 첫 공격이 끝난 뒤 다음 턴이 시작되는 순간 같은 지문자가 다시 날아가고 같은 베기 효과가 반복됐다. 온라인 1:1 화면도 새 턴 Match가 없으면 기존 라인레이스 공격 Gateway로 폴백하고, 기존 `LINE_RACE_*` 이벤트와 새 `GLYPH_TURN_*` 이벤트를 같은 결투 모델에 함께 넣고 있었다.

### 실제 원인

- `LocalGlyphTurnPractice.nextTurn()`이 `resolvedMoves`만 비우고 `lastMove`를 남겼다.
- 렌더러는 `resolvedMoves`가 비어 있으면 `lastMove`를 대신 사용했다.
- 다음 턴의 `calloutAt`이 새 시각으로 갱신되면서 지난 `lastMove`의 애니메이션 나이가 0으로 돌아가 공격 전체가 다시 시작됐다.
- 온라인 화면에는 기존 라인레이스 입력 폴백이 남아 있어 봇전과 동일한 서버 권위 턴 경계가 아니었다.

### 적용한 해결

- 다음 `PLANNING` 진입 시 `lastMove`와 `resolvedMoves`를 모두 비운다.
- `GlyphDuelHudRenderer`는 `REVEAL` 또는 `FINISHED` 단계에서만 기술 이펙트를 그린다.
- 온라인 1:1은 `GlyphTurnMatchTransport`를 필수로 사용하며 기존 `LINE_RACE_*` 공격으로 폴백하지 않는다.
- 기존 라인레이스 이벤트는 결투 모델에 넣지 않는다. HP·집중·방어·라운드·턴 연출은 `GLYPH_TURN_*`만 권위 입력으로 사용한다.
- 온라인 1:1에 봇 참가자가 있으면 입장을 거부하고 봇은 `/game/turn-battle/practice`에서만 사용한다.
- 집중 기술의 중앙 지문자 크기를 키워 수렴 이펙트 안에서도 글자 형태가 읽히게 했다.

### 검증

- 수정 전 실제 브라우저 프레임에서 TURN 2 시작 후 동일한 `ㅂ` 투사체와 베기가 다시 재생되는 것을 확인했다.
- 수정 후 `ㅂ` 공격 대 `ㅌ` 방어 전체와 TURN 2 시작 이후 프레임을 연속 확인했고, TURN 2에서는 지난 공격이 다시 나타나지 않았다.
- 로컬 다음 턴과 서버 `PLANNING` Snapshot이 모두 과거 move를 제거하는 회귀 테스트를 추가했다.
- 백엔드·AI 교체 및 Match 상태 API 경계는 같은 폴더의 `match-module-integration.md` 최신 체크리스트를 따른다.

---

## 21. 카드와 전투 이펙트의 자모 모양이 서로 다르거나 다른 글자로 보이던 문제

### 실제 원인

- 카드 글자까지 임의 SVG 선분으로 재구성하면서 `ㅂ`이 `ㅣ＝ㅣ`, `ㅌ`이 라틴 `E`처럼 보이는 문제가 생겼다.
- `ㅔ`, `ㅖ`는 전투 좌표가 없어 X 모양 fallback으로 표시될 수 있었다.
- `ㅢ`에는 실제 글자에 없는 중앙 세로획이 들어 있었다.
- `ㅂ`은 번짐을 피하려고 획 간격을 과도하게 벌리면서 반대로 `ㅣ＝ㅣ`처럼 보였다.

### 적용한 해결

- 31개 지원 한글 자모를 `GlyphStrokeRegistry` 한 곳에 명시했다.
- 카드는 임의 선분을 사용하지 않고 실제 유니코드 한글 자모를 한글 전용 글꼴로 렌더링한다.
- 공격, 방어, 결계, 공명, 필살기만 검증된 공통 획 정의를 사용한다.
- `ㅔ`, `ㅖ`, `ㅢ`, `ㅂ`, `ㅐ`, `ㅒ`의 획 수·방향·비율을 수정했다.
- 개발 모드의 `symbols` 쿼리로 문제 글자를 세 개씩 강제해 실제 카드와 전투 프레임을 확인할 수 있게 했다.

### 회귀 방지

- 게임 메타데이터의 모든 한글 자모에 명시적 벡터가 있는지 검사한다.
- 31개 카드 모두가 SVG 유사 도형이 아닌 해당 유니코드 한글 자모 자체로 렌더되는지 검사한다.
- `ㅂ` 공격은 카드와 같은 열린 윗부분을 유지하도록 잘못 추가된 위 가로획을 제거했다. 나머지 네 획은 다른 글자처럼 순서대로 그려진 뒤 정상 시간 동안 함께 남는다.
- `ㅔ`, `ㅖ`가 필살기로 잘못 분류되지 않고 공명 카드인지 검사한다.

---

## 22. 더미 서버가 지문자 Match 상태를 직접 소유해 운영 서버로 옮기기 어려운 문제

### 실제 원인

- `DevGlyphTurnService`가 STOMP 매핑뿐 아니라 `Map<UUID, GlyphTurnMatch>`와 시간 진행까지 직접 소유했다.
- 방/인증/전송 어댑터와 게임 규칙의 수명이 묶여 운영 백엔드가 같은 코드를 재사용하려면 더미 서버 구현까지 복사해야 했다.
- 블록쌓기와 라인레이스는 `game-module` input/output port를 사용하지만 지문자 턴 배틀만 그 경계를 따르지 않았다.

### 적용한 해결

- Spring 없는 `GlyphTurnMatch`, `GlyphTurnMatchApplicationService`, `GlyphTurnMatchUseCase`, `GlyphTurnMatchRepositoryPort`를 `game-dev-backend/game-module`로 옮겼다.
- 사람 1:1과 사람 대 봇이 같은 권위 상태 엔진을 사용한다.
- `DevGlyphTurnService`는 더미 Room 멤버십 확인과 STOMP event DTO 변환만 하고, Match 저장과 규칙 계산은 use case에 위임한다.
- 메모리 저장은 `InMemoryGlyphTurnMatchRepository`라는 교체 가능한 개발 어댑터로 분리했다.
- 백엔드 리드는 방·인증·라우팅을 소유하고 게임 파트는 방별 Match 상태를 소유한다는 인수인계 계약을 `match-module-integration.md`와 `game-dev-backend/README.md`에 명시했다.

### 회귀 검증

- 블록쌓기 솔로, 블록쌓기 1:1, 지문자 턴 배틀 봇전, 지문자 턴 배틀 1:1 대표 8개 테스트 파일의 47개 테스트 통과
- `src/game` 전체 122개 테스트 파일, 458개 테스트 통과
- TypeScript typecheck를 포함한 production build 통과
- Java 11 기준 `game-module` main 121개 소스 컴파일 통과
- Glyph 더미 transport/repository/configuration 어댑터 컴파일 통과
- 사람 1:1의 양쪽 선택·REVEAL·다음 턴과 봇의 자동 선택을 실행하는 Java 하네스 통과

Gradle 전체 `check`는 로컬 캐시에 Spring Boot Gradle plugin marker가 없고 네트워크가 허용되지 않아 실행하지 못했다. 대신 변경 범위는 캐시된 의존성과 `javac`로 컴파일했다. 또한 앱 내 브라우저의 로컬 주소 접근 정책 때문에 이번 회차에는 실제 카메라/두 브라우저 수동 플레이를 실행하지 못했다. 실제 장치 검증 시에는 카메라 권한, MediaPipe 초기화, 두 사용자 STOMP/RTC 연결, 재접속 Snapshot을 추가 확인한다.

---

## 23. 프로토타입 경로와 본 게임 경로가 섞여 협업하기 어려운 문제

### 실제 원인

- 실행 가능한 게임 프런트가 `prototype/frontend`에 있어 플랫폼 프런트의 라우터·패키지 경계와 분리돼 있었다.
- 블록쌓기와 지문자 게임의 코드가 기능별 최상위 디렉터리로 흩어져 게임 하나의 변경 범위를 파악하기 어려웠다.
- 계약 테스트와 문서가 옛 `prototype/*` 경로를 직접 참조해 디렉터리 이동만으로 회귀가 발생했다.

### 적용한 해결

- 실행 기준을 루트 `frontend`로 올리고 플랫폼 공용 `app`, `features`와 게임 소유 `game`을 분리했다.
- 블록쌓기는 `game/block-stacking`, 지문자 턴 배틀·라인레이스 셸은 `game/glyph-battle`로 모았다.
- 플랫폼 라우터는 `/game/*`만 `GameModule`에 위임하고 기존 `/game/solo`, `/game/battle/*`, `/game/turn-battle/*` URL은 유지했다.
- 더미 AI는 `game-ai-dev-server`, 더미 리드 서버 예시는 `game-dev-backend/dev-app`, 운영 이식 가능한 Match 모듈은 `game-dev-backend/game-module`로 명시했다.
- 계약 테스트·AI 모델 경로·문서 링크를 모두 새 기준 경로로 갱신했다.

### 회귀 검증

- 네 게임 모드 대표 흐름 8개 파일, 47개 테스트 통과
- 게임 전체 122개 파일, 458개 테스트 통과
- 프런트 TypeScript 빌드 및 production 번들 통과
- API·WebSocket 계약 18개 테스트, 라인레이스 시뮬레이터 11개 테스트, 계약 TypeScript 타입체크 통과
- AI 더미 서버 13개 테스트 통과
- 사람 1:1과 봇전의 지문자 Match Java 실행 하네스 통과

실제 카메라와 두 명의 브라우저를 사용하는 수동 플레이는 이 실행 환경의 로컬 주소 접근 제한 때문에 남아 있다. 자동 검증은 게임 시작·선택·명령·상태 전이·종료·전송 경계를 실제 진행 순서로 확인했다.

---

## 24. MediaPipe 사용자 연결이 자주 끊겨 보이고 일부 지문자가 인식되지 않던 문제

### 확인 결과

- 실행 중인 Python AI 서버에 실제 WebSocket으로 20회 연속 연결해 모두 성공했고, 서버 단위 테스트 16개도 통과했다. 서버가 지속적으로 끊기는 현상은 재현되지 않았다.
- 화면의 `CONNECTED/DISCONNECTED` 표시는 카메라와 MediaPipe 상태가 아니라 Python AI WebSocket 상태였다. 기존 문구가 두 상태를 하나처럼 보이게 했다.
- worker 또는 main-thread landmarker의 일시 오류가 카메라 추론 loop 전체를 중단할 수 있었다.
- 사용자·손 추적 유예값이 짧아 landmark가 몇 프레임 누락되거나 handedness가 흔들릴 때 다른 사용자로 재등록되는 체감이 컸다.
- 모델 평가는 별도 문제를 확인했다. 특히 `ㅠ` recall은 0%이고 대부분 `ㅅ`으로 분류되며, `ㅅ` precision도 약 47%여서 threshold를 낮추는 방식으로 해결할 수 없다.

### 적용한 수정

- Python WebSocket은 0.5초부터 최대 8초까지 지수 backoff로 자동 재접속하고, 생성·오류·종료 어느 경로에서도 다음 재접속을 예약한다.
- MediaPipe worker가 실패하면 즉시 main-thread tracker로 전환한다. main-thread의 일시 실패는 해당 프레임만 버리고 다음 프레임에서 tracker를 다시 초기화한다.
- 사용자 추적 grace/re-identification과 손 소유권 grace를 늘리고, pose/ownership 임계값을 실사용 흔들림에 맞게 완화했다. 손이 잠시 사라진 동안은 세션만 유지하고 게임 입력은 차단한다.
- 상태 문구를 `AI 인식 서버`로 명시하고 카메라/MediaPipe 상태와 별개임을 표시했다.
- AI 모드의 방 생성, bot 출제와 게임 spawn은 `game-contracts/recognition/readiness.json`에서 경쟁 사용 가능인 글자만 허용한다. 키보드 모드의 글자 범위는 바꾸지 않았다.

모델 자체를 좋아졌다고 기록하지 않는다. 제외 글자를 다시 활성화하려면 새 사용자·새 촬영 세션 데이터를 수집해 재학습하고, 사용자 분리 validation에서 readiness 조건을 다시 통과해야 한다.

---

## 25. 수달 스프라이트 프레임은 바뀌는데 걷는 동작으로 보이지 않던 문제

### 실제 원인

- 5칸 스프라이트 스트립을 `background-position`으로 이동시키면 개발자 도구에서는 위치 값이 바뀌어도, 어느 원본 프레임이 화면에 표시됐는지 DOM에서 직접 확인하기 어렵다.
- 캐릭터 위치를 `left`로 애니메이션하면 매 프레임 레이아웃 계산이 발생한다. 같은 화면에서 Pixi, 카메라, MediaPipe가 함께 동작할 때 이 비용이 프레임 전환의 끊김으로 더 잘 드러난다.
- 원본 옆걸음 프레임은 발 차이가 작아 92×82px에서 거의 같은 자세로 보였다. 프레임 속도만 높이면 보행이 선명해지는 대신 몸이 떨리는 것처럼 보였다.
- 애니메이션 프레임 간격과 같은 주기로 상태를 샘플링하면 일부 프레임을 건너뛴 결과만 수집될 수 있다. 샘플 배열에 프레임 번호가 빠졌다는 이유만으로 실제 렌더 누락으로 판단하면 안 된다.

### 적용한 수정

- 정렬된 스트립을 260×260 개별 PNG 5장으로 분리하고 각 파일을 React에서 직접 import한다.
- 다섯 이미지를 같은 위치에 겹친 뒤 불연속 opacity keyframe으로 `0→1→2→3→4→3→2→1`을 재생한다. 경계 시점에도 표시 프레임은 정확히 한 장이어야 한다.
- 게임 화면 표시 크기를 124×110px로 올려 발 실루엣 차이가 보이게 했다.
- 이동용 래퍼와 보행 프레임을 분리했다. 래퍼의 `left`는 `-150px`로 고정하고 `translate3d`만 연속 변경해 레이아웃 재계산을 피한다.
- 반응형 게임판 너비는 래퍼의 inline-size container와 `cqw`로 계산한다. 따라서 정지 지점 28%·62%와 화면 밖 퇴장이 화면 폭에 맞춰 유지된다.
- `will-change`와 `backface-visibility`는 실제로 합성되는 이동·프레임 요소에만 지정하고, 넓은 게임판 전체에는 적용하지 않는다.

### 실제 실행 검증

- 브라우저에서 솔로 화면에 진입해 첫 3초 시연을 실행했다.
- 연속 측정 중 이동 요소의 `left`는 `-150px`로 고정됐고 transform X만 단조 증가했다.
- 각 측정 시점에 `.otter-walk-frame` 중 opacity가 1인 이미지는 한 장뿐이었다.
- 130ms 간격 측정에서는 프레임 주기와 측정 주기의 간섭으로 중간 번호가 일부 빠져 보일 수 있어, DOM의 단일 표시 invariant와 더 짧은 간격 측정을 함께 기준으로 삼는다.
- 정면 정지 구간은 보행 이미지 전체를 숨기고 정면 포즈만 표시하며, 통과 중 그림 힌트 숨김과 쌓인 글자보다 높은 z-index는 유지한다.
---

## 지숫자 1~9 출제 연결 (2026-07-23)

기본 AI 프로필은 `jamo-number-hybrid-v1`이다. 이 모델은 기존 31자모 TFLite head를 유지하고 별도 숫자 head로 숫자 1~10을 판별한다. 게임 심볼 등록부는 그중 지숫자 1~9만 등록한다. 따라서 모델의 `CAPABILITIES.supportedSymbols`에 1~9가 포함된 경우에만 솔로 블록 쌓기에서 숫자 블록이 생성되고, 안내 패널은 `assets/guides/number-1.png`부터 `number-9.png`까지의 승인된 수형 이미지를 표시한다.

숫자 0과 10은 현재 게임 규칙·가이드·출제 목록에서 제외한다. 모델 라벨에 10이 있더라도 등록부와 교집합을 계산하므로 게임에 섞이지 않는다. 숫자 모델의 보유 평가에서 1~9의 macro F1은 0.9588이며, 1은 F1 0.8615, 8은 0.9057, 9는 0.9200으로 상대적으로 낮다. 실제 배포 전에는 별도 사용자/촬영 환경에서 인식 확정률과 오확정률을 재검증한다.

## 26. STOMP 제거 후 native WebSocket + WebRTC DataChannel 1:1 실사용 검증

### 전송 경계

- 방 생성·참가·준비·시작은 REST/SSE 계약을 사용한다.
- `POST /auth/sse-ticket` 발급 요청에는 Bearer 인증 헤더가 필요하다.
- 브라우저 `EventSource`는 임의 인증 헤더를 붙일 수 없으므로, 실제 `/game-rooms/subscribe` 연결은 발급받은 일회용 `ticket` query를 사용한다. SSE 구독 URL에 Bearer 헤더를 억지로 붙이지 않는다.
- Room native WebSocket은 방 이벤트와 SDP/ICE signaling 전용이다.
- 실제 게임 명령·권위 이벤트·복구 snapshot은 WebRTC DataChannel의 `GAME_P2P_V1` envelope로 교환한다.
- 프런트 런타임과 의존성에는 STOMP를 사용하지 않는다.

### 발견한 문제와 수정

1. Vite `/api` 프록시에 `ws: true`가 없어 로컬 Room WebSocket upgrade가 전달되지 않았다.
2. 상대 socket이 열리기 전에 전달된 offer가 유실될 수 있어 참가자 snapshot 수신 시 기존 offer를 재전송하도록 했다.
3. RTCPeerConnection 연결 직후 DataChannel은 아직 열리는 중일 수 있어 전송 계층이 최대 5초 동안 open을 기다리도록 했다.
4. React StrictMode의 setup-cleanup-setup 중 이전 connect가 늦게 완료되며 새 연결을 덮는 문제를 generation으로 무효화했다.
5. 브라우저의 raw `setTimeout` 함수를 인스턴스 메서드처럼 호출해 `Illegal invocation`이 발생하던 부분을 래퍼 함수로 고쳤다.
6. 같은 match의 `MATCH_STARTED`가 중복 도착하면 countdown/controller가 재시작되던 문제를 차단했다.
7. 턴 배틀 페이지가 DataChannel이 즉시 open이 아니면 connect 자체를 건너뛰고, media participant 변화 때 transport를 재생성하던 문제를 제거했다.
8. 턴 배틀은 상대 영상 타일만 표시하지 않는다. 내 카메라·HandCamera 랜드마크·AI 인식·큰 기술 카드·피해/집중/방어 설명·수달 캐릭터 전투 캔버스는 봇전과 동일하게 사용하며, 확정된 손 인식만 P2P 명령으로 보낸다.

### 로컬 브라우저 2인 실사용 검증

검증은 `VITE_P2P_E2E=true` Vite와 프런트 전용 `npm run dev:p2p-relay`를 사용했다. 릴레이는 운영 백엔드 대체물이 아니라 REST/SSE/ticket/native WebSocket signaling 계약을 로컬에서 재현하는 검증 도구다. 카메라 권한 제약을 피하기 위해 E2E 모드에서만 합성 video track을 사용했고, RTCPeerConnection과 DataChannel 자체는 실제 브라우저 구현을 사용했다.

- 블럭쌓기: 방 생성 → 상대 참가 → 양쪽 준비 → 시작 → 게임/영상/카메라 `CONNECTED` → 동일 target/board 이벤트 수신 → `DANGER_LINE` 종료까지 완료했다. 방장은 승리, 참가자는 패배로 같은 match 결과가 일치했다.
- 턴 배틀: `SIGN_DUEL` 방 생성 → 참가 → 양쪽 준비 → 시작 → DataChannel `CONNECTED` → 내 카메라·큰 기술 카드 확인 → E2E 전용 카드 trigger로 손 인식 확정과 동일한 P2P 명령 경로를 11턴 교환 → 최종 HP가 방장 화면 `89:0`, 참가자 화면 `0:89`로 대칭 → 방장 승리/참가자 패배 결과까지 완료했다. 운영 빌드에는 카드 클릭 경로가 없고 AI 확정 입력만 허용한다.
- 로컬 AI WebSocket이 실행되지 않은 상태에서는 `AI 인식 서버 미연결`을 표시하지만 화면 선택으로 P2P 경기와 종료 판정을 계속할 수 있음을 확인했다.

### 배포 전 남은 검증

로컬 실사용 경로는 통과했지만 인터넷 구간 검증을 의미하지는 않는다. 인프라 완성 뒤에는 TLS/WSS, 실제 TURN 서버, 서로 다른 네트워크의 인증된 두 계정, 실제 카메라 권한, AI WebSocket 연결 상태에서 같은 두 시나리오를 한 번 더 수행한다. 백엔드 소스는 이번 작업에서 변경하지 않았다.
- 온라인 턴 배틀의 위치는 시점 기준(본인 왼쪽·상대 오른쪽), 외형과 체력바는 역할 기준으로 고정한다. 방장은 스카프 수달·파랑 HP, 도전자는 머리띠 수달·주황 HP이며 도전자 화면에서는 왼쪽 머리띠/주황, 오른쪽 스카프/파랑으로 뒤집힌다. 캐릭터 아래에는 표시명과 축약 사용자 ID를 표시한다.

## 27. 배포 Swagger 변경으로 결과 저장과 재대결이 깨질 수 있던 문제

### 증상

프런트는 대전 결과를 `{hostScore, guestScore}`로 보내고 응답에서 `gameSessionId`, `hostScore`, `guestScore`를 읽고 있었다. 2026-07-23 배포 Swagger는 이미 `{winnerUserId}` 계약으로 변경됐고, 결과 처리 뒤 방을 `CLOSED`가 아니라 `WAITING`으로 복귀시키도록 바뀌었다. 기존 프런트를 그대로 배포하면 결과 요청이 400으로 실패하거나 성공 응답 파싱이 실패하고, 재대결 버튼은 로컬 방 캐시를 삭제해 대기실 상세 정보를 잃는다.

### 원인

- 문서 확인 시점 이후 백엔드 Swagger가 갱신됐다.
- 결과 점수 역할을 프런트가 직접 전송한다는 이전 가정을 유지했다.
- `returnToWaiting`이 과거의 “결과 뒤 방 종료” 동작을 전제로 캐시를 삭제했다.

### 수정

- `BattleResultClient`는 실제 숫자 승자 ID를 `{winnerUserId}`로 전송한다.
- 정상 종료 시 양쪽이 같은 host-authoritative snapshot의 승자 ID를 보고한다.
- 백엔드가 승자 1, 패자 0을 기록하므로 호스트 승 `1:0`, 도전자 승 `0:1` 의미는 유지된다.
- `409`는 이미 처리된 결과 또는 유효하지 않은 진행 상태이므로 중복 보고의 멱등 종료로 처리한다.
- 양쪽 클라이언트가 같은 host-authoritative 최종 snapshot의 `winnerUserId`를 제출하도록 해, 참가자의 빠른 화면 이탈과 방장의 결과 직후 연결 종료에도 저장을 보강했다. 먼저 처리된 요청 이후의 `409`는 정상적인 멱등 종료다.
- `SwaggerBattleRoomGateway.returnToWaiting`은 캐시를 삭제하지 않고 `WAITING`, 양쪽 ready false를 반영한다.

### 계약 확인 결과

- 방 생성 body의 `gameType`은 필수다.
- 방 응답에는 `gameType`과 `realtimeTicket`이 포함된다.
- SSE는 Bearer 헤더가 아니라 1회용 ticket query로 구독한다. Bearer 헤더는 티켓 발급 요청에 사용한다.
- 결과 body는 `{winnerUserId}`이며 `201` 이후 같은 방에서 재대결할 수 있다.
- 최종 프런트 전체 130개 테스트 파일, 477개 테스트와 TypeScript/Vite production build가 통과했다.
- 독립 사용자 브라우저 방 `100004`에서 11턴 종료 후 방장 `89:0` 승리, 참가자 `0:89` 패배가 일치했고, 양쪽 결과 제출과 동일 방 `WAITING` 복귀, ready false 초기화를 확인했다.

### P2P 몰수패 경계

순수 DataChannel/PeerConnection 상태만으로 자동 몰수패를 결정하면 네트워크 분할 시 양쪽이 모두 자신을 생존자로 판단할 수 있다. 따라서 백엔드를 변경하지 않는 현재 범위에서는 정상 종료 결과 저장과 짧은 ICE 재연결을 지원하고, 10초 이후 자동 몰수패는 서버가 인증된 `PEER_DISCONNECTED`/`PEER_RECONNECTED`를 권위 근거로 제공하는 정책이 확정되기 전까지 활성화하지 않는다.

---

## 2026-07-27 ??Production solo game start returned HTTP 401

### Symptom

On `https://sudal-play.vercel.app/game/solo`, pressing **게임 ?�작** displayed `Solo game API returned 401.` and did not start the game.

### Investigation

- The production bundle uses `https://i15a405.p.ssafy.io/api` for both auth and game REST calls.
- The failing request is `POST /api/game/solo/sessions`.
- The route reaches the backend and returns `401`; it is not a Vercel deployment, CORS, or WebSocket failure.
- The current backend/Swagger integration does not publish the legacy solo-session start/complete contract used by this frontend. The authenticated room and result contracts must not be inferred to include it.

### Resolution

- Do not block solo gameplay on the unsupported remote session endpoint.
- `LocalSoloGameApi` now creates the session and stores the completed aggregate score in browser local storage, scoped by user ID.
- No camera frames, landmarks, or images are saved.
- Remote solo persistence remains opt-in through `VITE_ENABLE_REMOTE_SOLO_GAME_API=true`, and must only be enabled after the backend formally provides and authorizes the start/complete session contract.

### Verification

- Local unit test for session creation and persisted score: passed.
- TypeScript/Vite production build: passed.
- GitLab pipeline `#157088` and its Vercel production deploy: passed.
- Production browser retest: **게임 ?�작** changes the game to running state and no alert is rendered.

### Backend follow-up

If cross-device solo score history or a server-side solo ranking is required, backend needs to publish the request/response DTO and authorization policy for a solo score endpoint. Until then, local browser storage is the only supported persistence path.


---

## 2026-07-30: preventing duplicate letters in a shared-target P2P duel

### Symptom

When each peer treated recognition as an immediate local spawn, simultaneous recognition could create two letters or leave the two boards out of sync.

### Cause

The shared target is a single competitive resource. Local recognition results can arrive at different times, so each browser cannot independently decide whether it won the target.

### Resolution

- Added `SHARED_TARGET`, `CLAIM_SHARED_TARGET`, and `SHARED_TARGET_CLAIMED` DataChannel messages.
- Kept the host authoritative: it accepts the first valid claim, publishes the result, and emits one centered spawn command for the winning board only.
- Disabled local optimistic spawns while shared-target mode is active.
- Published the next target only after the resolved claim, avoiding overlap between target generations.

### Why this is lighter than streaming the board

The peers exchange a small target/claim/spawn event stream instead of video or a second physics simulation. Each board still renders locally, but only the authoritative spawn commands decide gameplay state.

### Verification

- `BattleController`, P2P transport, and message-parser targeted tests: 21 passed.
- Vite production build: passed.