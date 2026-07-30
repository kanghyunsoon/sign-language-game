# Phase 1 Manual Test Checklist

## 2026-07-21 실제 실행 회귀 기록

로컬 Vite(5173), 더미 백엔드(8091), hybrid AI WebSocket(8765)을 동시에 실행하고 인앱 브라우저 두 개 사용자 세션으로 확인했다.

- [x] 블록쌓기 솔로: 시작 버튼, Matter canvas 1개, timer `0:00 → 0:05`, pause 활성화 확인
- [x] 블록쌓기 1:1: 방 생성, 두 번째 사용자 목록 조회·입장, 양쪽 `2/2`, 방장 시작 버튼 활성화 확인
- [x] 블록쌓기 1:1 경기: 최초 실행에서 공통 topic 구독을 line-race로 오인하고 참가자 화면이 대기실에 남는 결함을 발견했다. 더미 백엔드가 match 소유권을 확인한 뒤 initializer를 선택하고, 참가자 polling이 `activeMatchId`를 받으면 자동 입장하도록 수정했다. 재실행에서 양쪽 Game WebSocket `CONNECTED`, 지정 글자 생성·갱신 확인
- [x] 지문자 턴 배틀 봇전: 도움말 4단계와 turn 1→4 진행, 기술 카드 3개 갱신 확인. 테스트 브라우저에는 실제 손 입력 장치가 없어 gesture 확정은 자동 테스트로 대체
- [x] 지문자 턴 배틀 1:1: 공개방 생성, 두 번째 사용자 참가, 양쪽 `2/2`, Game WebSocket `CONNECTED` 확인
- [ ] 지문자 턴 배틀 1:1 경기: 브라우저의 카메라 권한이 `Permission denied`여서 준비 gate가 시작 버튼을 잠금. 카메라가 있는 Chrome/Edge에서 최종 확인 필요
- [x] AI 서버: 실제 WebSocket `GET_CAPABILITIES`에서 `jamo-number-hybrid-v1`, 41 label, sequence length 10, 기존 24개 competitive jamo와 class threshold 응답 확인. 31자모 rollback profile 테스트 통과

완료 표시와 미완료 표시는 실제 관찰 범위만 반영한다. 카메라 없는 자동 브라우저에서 ‘실제 손동작 플레이 완료’로 기록하지 않는다.

자동 회귀는 프런트 122파일/459테스트, production TypeScript/Vite build, AI 서버 16테스트, 계약 29테스트, 백엔드 `gradlew check`가 모두 통과했다. jsdom의 `HTMLMediaElement.pause` 및 canvas 미구현 메시지는 테스트 환경 경고이며 실패는 0건이다.

## Solo Result Persistence API

- [ ] Start `game-dev-backend/dev-app` and submit a completed result to `POST /api/game-results` with an `X-User-Id` header. Confirm the body contains no `userId`.
- [ ] Query `/api/game-results/me`, `/api/game-results/me/best`, and `/api/sign-statistics/me`; confirm only the header's user receives their history and statistics.
- [ ] Restart the prototype API and confirm its in-memory results are cleared. Persistent database storage is intentionally outside this unit.
- [ ] Stop the API, save through `ResilientGameResultRepository`, and confirm the same result remains available from `LocalGameResultRepository` without interrupting the solo game.
- [ ] Inspect saved JSON: it contains aggregate scores and symbol statistics only, never video, images, or landmark frames.

## PixiJS Renderer

- [ ] Mount `GameCanvas` in a container with a non-zero width and height; exactly one Pixi canvas is attached.
- [ ] A runtime passes `PhysicsWorld.getLetterStates()` to `renderer.render()` and each symbol position and rotation follows its Matter body.
- [ ] Resize the canvas container; the canvas and danger line resize without creating an additional canvas.
- [ ] Call `highlightRemoval(id)` and advance `updateEffects(deltaMs)`; only that letter receives the yellow outline and 150ms fade/scale effect.
- [ ] Confirm `REMOVAL_EFFECT_FINISHED` is emitted once, then remove the matching body outside the renderer and omit it from the next state snapshot.
- [ ] Unmount `GameCanvas`; the Pixi canvas is removed and the renderer no longer accepts updates.

## Solo Keyboard Game

- [ ] Open `Solo Game`, press Start, and confirm letters spawn periodically, fall, rotate, and stack.
- [ ] Submit a displayed symbol from each consonant, vowel, and number panel; all 41 symbols are available without AI connection.
- [ ] With two matching letters where one is settled, submit the symbol and confirm the settled letter receives the yellow removal highlight first.
- [ ] With only falling matching letters, submit the symbol and confirm the oldest falling letter is highlighted and removed after about 150ms.
- [ ] Hold a matching keyboard key: only one removal is selected. Release the key and press it again to allow the next matching removal.
- [ ] Remove a lower stacked letter and confirm upper letters fall again through Matter physics.
- [ ] Use Pause and Resume; no letters move while paused. Use Restart; score, combo, body list, and board reset.
- [ ] Allow settled letters to build above the red danger line and confirm the game-over overlay shows score, best combo, and removed count.

## Solo Python AI Input

- [ ] Switch to `Python AI`, connect the local Python server, and confirm the connection state, model version, and supported-symbol count appear.
- [ ] Confirm the AI playable-symbol list follows server capabilities. The hybrid profile advertises 31 jamo plus numbers 1–10; the baseline rollback profile advertises 31 jamo only.
- [ ] Start the webcam, make the current target, and confirm prediction symbol/confidence are visible over the camera stage.
- [ ] Confirmed target signs highlight a real removal target before the Matter body disappears.
- [ ] Confirm a different sign than the target: the page reports an incorrect result and no body is selected for removal.
- [ ] Confirm a target while no matching body exists: the page reports that no matching letter is on the board and applies no score-specific feedback.
- [ ] Hold the same sign after confirmation: the page asks for hand release and does not select another body. Remove the hand until `HAND_RELEASED`, then confirm the same sign again.
- [ ] Disconnect the Python server and switch to `Keyboard`; the 41-symbol development panel is available again.

## Solo Score And Learning Statistics

- [ ] Confirm two removable target signs in sequence: score increases by the configured base score multiplied by the growing combo.
- [ ] Confirm a wrong target sign above the confidence threshold: the configured incorrect policy resets or decrements combo without removing a body.
- [ ] Trigger `HAND_RELEASED` or hide the hand: it does not count as an incorrect attempt and does not change combo.
- [ ] Send or simulate a `SIGN_CONFIRMED` below the configured confidence threshold: no removal, score, combo, or learning-stat update occurs.
- [ ] Confirm a correct target without a matching board body: no default score penalty is applied.
- [ ] End the game and verify final score, maximum combo, removal count, elapsed play time, frequent mistakes, and per-symbol success rate.

## Symbol Metadata

- [ ] In the recognition target selector, confirm each symbol shows `G`, `AI`, `T`, and `P` status markers.
- [ ] Before Python capabilities load, no symbol is presented as currently AI-supported.
- [ ] After capabilities load, `AI` and `P` follow only the server's supported-symbol list; unsupported digits remain unavailable in AI mode.
- [ ] Confirm `T` remains unavailable until a real captured template or approved guide asset is registered.

## UI And Error States

- [ ] At desktop width, the game board and camera/AI controls are both visible without horizontal scrolling. At 800px and below, they stack in a readable order.
- [ ] Current target is visible both in the AI target control and above the mirrored webcam overlay.
- [ ] Connection state is shown with text in addition to color. With the Python server stopped, the page states that the local server is unavailable and gives the startup location.
- [ ] Deny camera permission and confirm the screen says `Camera permission denied`. Test a missing camera and confirm `Camera unavailable` appears. A MediaPipe asset initialization failure must state `MediaPipe initialization failed`.
- [ ] Confirm a server-provided model error is shown as a model-loading failure, and an invalid server response is shown as a response error.
- [ ] In AI mode, the hand-release panel includes text and an icon; do not rely on its amber color alone.
- [ ] In Recognition Lab, toggle `Show debug` and confirm only the recent-event debug log is added or removed; recognition and camera behavior continue unchanged.
- [ ] Load no template or a `CLASSIFICATION_ONLY` template and confirm the feedback panel displays a textual neutral reason rather than red joint lines.
- [ ] Trigger game over and verify the result dialog contains readable score details and an enabled Restart button.

## Matter Physics Adapter

- [ ] An external runtime calls `PhysicsWorld.update(deltaMs)`; the physics adapter starts no internal animation loop.
- [ ] A spawned letter falls under gravity, rotates when given angular velocity, and stays within floor and wall boundaries.
- [ ] Two rectangular temporary letter bodies stack through Matter collisions.
- [ ] Removing a lower body allows a supported upper body to fall again.
- [ ] A letter emits `LETTER_SETTLED` only after both speed thresholds remain below their limits for the configured duration.
- [ ] Game core imports `PhysicsWorld` only through a future runtime contract and does not import `matter-js`.

## Game Domain

- [ ] A runtime integration sends `spawnLetter`, `settleLetter`, `confirmSymbol`, `completeRemoval`, and `handReleased` events to the pure `RemovalSystem`.
- [ ] For matching symbols, the earliest settled letter is selected before any falling letter.
- [ ] Stale `REMOVING`/`REMOVED` queue IDs are skipped without recreating queues.
- [ ] Repeating a confirmed symbol remains locked after cooldown until a hand-release event arrives.
- [ ] No React, Matter.js, PixiJS, MediaPipe, or WebSocket import is required by `src/game`.

## Bone Feedback

- [ ] In `Template Capture`, capture at least 20 valid frames and export a `STATIC_TEMPLATE` JSON.
- [ ] In `Recognition Lab`, select the same target symbol, import the template JSON, and start the camera.
- [ ] Confirm a blue dashed reference skeleton and current skeleton are visible together on the webcam overlay.
- [ ] Keep the pose close to the reference: current connection lines remain their normal colors.
- [ ] Change only one finger: only affected lines become yellow or red, not the entire hand.
- [ ] Confirm the feedback panel lists the affected bone and gives a deterministic finger message.
- [ ] Load a `CLASSIFICATION_ONLY` template or choose a different target: detailed bone feedback remains disabled and neutral.
- [ ] Confirm classifier output alone does not produce red joint feedback without a matching static template.

## Reference Template Capture

- [ ] Open `Template Capture`, select a target symbol and start the camera.
- [ ] Start capture with one known hand; the counter advances without updating every video frame.
- [ ] Change hands or hide the hand during capture and confirm inconsistent/unknown frames are not accepted.
- [ ] Stop after at least 20 frames and confirm a representative template preview appears.
- [ ] Export JSON, reset capture, import the same JSON, and verify symbol, handedness, mode, and sample count are restored.
- [ ] Review captured skeletons manually before export. The app cannot verify that the real sign posture is correct.

## 실행 준비

```powershell
cd C:\Users\SSAFY\Desktop\Sign_Language_Translation\frontend
npm install
npm run dev
```

Chrome 또는 Edge에서 표시된 localhost 주소를 연다.

## 카메라와 MediaPipe

- [ ] 초기 화면에서 카메라가 자동으로 시작되지 않는다.
- [ ] `카메라 시작`을 누르면 브라우저 권한 요청이 표시된다.
- [ ] 권한 허용 후 웹캠 영상이 표시된다.
- [ ] 손 한 개를 보이면 21개 landmark와 연결선이 표시된다.
- [ ] 두 손을 보이면 두 손의 landmark가 표시된다.
- [ ] 손을 천천히 움직일 때 손과 skeleton 좌표가 일치한다.
- [ ] 화면이 거울처럼 좌우 반전돼 있다.
- [ ] 좌우 반전 상태에서도 video와 skeleton이 같은 위치에 있다.
- [ ] `카메라 정지`를 누르면 카메라 사용 표시가 꺼지고 영상이 멈춘다.
- [ ] 다시 시작한 뒤에도 정상 검출된다.
- [ ] 페이지를 닫거나 새로고침하면 카메라 사용 표시가 꺼진다.

## 오류와 레이아웃

- [ ] 카메라 권한을 거부하면 명확한 오류 메시지가 표시된다.
- [ ] 다른 앱이 카메라를 점유한 경우 오류 메시지가 표시된다.
- [ ] 1280px desktop 화면에서 video와 canvas가 같은 크기다.
- [ ] 390px mobile 화면에서 버튼과 텍스트가 겹치지 않는다.

## 모델 계약 표시

- [ ] 기본 프로필에서 모델 버전 `jamo-number-hybrid-v1`, rollback 프로필에서 `jamo-31-v1`이 표시된다.
- [ ] sequence length `10 frames`가 표시된다.
- [ ] hybrid의 실제 지원 심볼 41개가 자모 31개, 숫자 1~10 순서로 표시된다.
- [ ] baseline rollback에서는 숫자가 AI 지원 심볼에 표시되지 않는다.

## 자동 검증 완료 항목

- [x] React TypeScript production build
- [x] Vitest landmark 21개 검증
- [x] Vitest canvas 좌표 및 mirror 계산
- [x] Vitest MediaStreamTrack 전체 정리

게임, WebSocket 추론, 기준 skeleton, 관절 피드백 관련 항목은 Phase 1 범위가 아니므로 이 체크리스트에 완료 항목으로 포함하지 않는다.
# Recognition Lab WebSocket Manual Test

## Practice Target Selection

- [ ] After `CAPABILITIES`, AI mode enables only model-supported consonants and vowels.
- [ ] In AI mode, every number button is disabled and the unsupported-number reason is visible on the number tab.
- [ ] In UI Mock mode, all 41 symbols including numbers can be selected.
- [ ] Previous, next, and random controls change the target within symbols selectable for the active mode.
- [ ] The selected target is displayed at the top of the webcam stage.
- [ ] A matching `SIGN_CONFIRMED` result shows `정답`; a different result briefly shows the incorrect state. Neither changes game score or renders joint feedback.

Run the Python server in a separate terminal before starting the frontend.

```powershell
cd C:\Users\SSAFY\Desktop\Sign_Language_Translation\game-ai-dev-server
& C:\Users\SSAFY\miniforge3\envs\nlp\python.exe -m app.main
```

- [ ] Select `AI 서버 연결`: state changes from `CONNECTING` to `CONNECTED`.
- [ ] `CAPABILITIES` displays model version `jamo-31-v1`, sequence length 10, and 31 supported symbols.
- [ ] Start the camera and show a hand. Only 21-landmark JSON requests are sent; video and image payloads are not sent.
- [ ] After 10 frames, prediction symbol, confidence, and stable state can be displayed.
- [ ] A stable prediction updates the last confirmed symbol and event list.
- [ ] Keep the hand out of view for at least 0.5 seconds: `HAND_RELEASED` and release state appear.
- [ ] The same symbol can be confirmed again after hand release.
- [ ] Select `연결 해제` and navigate away: the socket closes and camera tracks are stopped.
- [ ] With the Python server stopped, a connection attempt surfaces an error or disconnected state without freezing the UI.

## 1:1 Room Lifecycle Regression — 2026-07-30

- [ ] 두 실제 계정으로 방 생성 → 참가 → 양쪽 ready → 방장 start가 한 번씩 성공한다.
- [ ] 대기방을 새로고침해 상대 ready와 방장 위임 상태가 서버 상태와 일치한다.
- [ ] 진행 중 게임을 새로고침해 10초 안에 fresh ticket, WebRTC, DataChannel이 복구된다.
- [ ] 대기방에서 브라우저 뒤로가기를 누르면 REST leave 후 카메라와 media가 종료된다.
- [ ] 진행 중 브라우저 뒤로가기를 누르면 forfeit/result/leave 순서로 정리되고 상대에게 stale peer가 남지 않는다.
- [ ] 정상 종료에서 결과 POST는 방장 요청 한 번만 201이고 참가자는 `RESULT_RECORDED` ACK를 받는다.
- [ ] 결과 ACK 전 참가자의 재대결 버튼이 비활성화되고 ACK 뒤 활성화된다.
- [ ] 종료 뒤 같은 방에서 ready false로 초기화되고 두 번째 매치를 시작할 수 있다.
- [ ] 만료·소비된 ticket 403에서 무한 retry하지 않고 안전하게 방 목록으로 복귀한다.
- [ ] 80%, 100%, 125%, 150% browser zoom에서 게임 선택, 모드 선택, 로비, 대기방, 플레이, 솔로 화면이 메인·학습과 같은 방향으로 확대·재배치된다.
- [ ] 확대 상태에서 가로 scrollbar, 잘린 나가기 버튼, 겹친 카메라/게임판이 없다.
- [ ] 서로 다른 NAT에서 `/webrtc/ice-servers`의 relay candidate가 실제로 선택된다.
