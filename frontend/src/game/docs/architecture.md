# 게임 모듈 구조

`frontend/src/game`은 게임 선택 이후 전체를 소유하는 독립 모듈이다. 호스트 앱은 `/game/*` 한 지점에 `GameModule`을 마운트하고 사용자·토큰·설정만 주입한다.

## 1. 디렉터리와 책임

```text
game/
├─ app/              GameModule 라우터, GameServiceProvider(구현체 조립)
├─ contracts/        주입 포트 정의와 백엔드 DTO 참고 타입
├─ block-stacking/   프링글수 — 솔로·1:1, 물리·렌더·점수
├─ glyph-battle/     지문자 턴 배틀, 봇 연습, LineRace 잔여 계층
├─ recognition/      인식 세션, MediaPipe 어댑터, 손 소유권, Decoder
├─ media/            공유 카메라, WebRTC mesh, 시그널링 포트
├─ realtime/         ticket, 로비 SSE, Room WebSocket, DataChannel
├─ match/            Match transport 공통 계약
├─ ranking/          랭킹 조회
├─ results/          결과 제출
├─ config/           단독 실행 설정
├─ dev/              개발 전용 harness
└─ index.ts          외부 공개 API
```

`block-stacking`과 `glyph-battle`은 서로 직접 결합하지 않는다. 공통으로 쓰는 방 요청, DataChannel 계약, 글자 메타데이터는 `recognition`, `media`, `match`, `contracts` 중 책임에 맞는 위치를 통해서만 참조한다. 새 공통 기능을 어느 한 게임 디렉터리에 넣지 않는다.

## 2. 호스트 연결

```tsx
<Route
  path="/game/*"
  element={(
    <GameModule
      user={{ userId: currentUser.id, displayName: currentUser.name }}
      accessToken={accessToken}
      config={gameConfig}
      onExit={() => navigate("/")}
    />
  )}
/>
```

호스트와 공유하는 파일은 위 라우터 한 줄, 환경 설정, `package.json`뿐이다. 게임 화면은 전부 이 폴더 아래에 있고 전역 store나 호스트 CSS를 import하지 않는다.

브라우저 라우터는 `main.tsx`가 한 번만 생성한다. `GameModuleRoutes`는 상대 경로만 소유하므로 다른 파트가 라우트를 추가해도 충돌하지 않는다. 개발·테스트 환경에서도 중첩 라우터를 만들지 않고 호스트 라우터를 주입한다.

## 3. 소유 라우트

| 라우트 | 화면 |
| --- | --- |
| `/game` | 게임 선택 |
| `/game/block` | 프링글수 모드 선택 |
| `/game/solo` | 솔로 |
| `/game/battle` | 게임방 찾기 |
| `/game/battle/:roomId` | 대기실 |
| `/game/battle/:roomId/play` | 1:1 게임 |
| `/game/battle/:roomId/result` | 결과 |
| `/game/turn-battle` | 턴 배틀 방 목록 |
| `/game/turn-battle/:roomId` | 턴 배틀 대기실 |
| `/game/turn-battle/:roomId/play` | 턴 배틀 1:1 |
| `/game/turn-battle/practice` | 턴 배틀 봇 연습 |

개발 빌드에서만 열리는 라우트는 `/game/battle/preview`, `/game/battle/practice`, `/game/recognition/crowd-test`다. 사용자용 `line-race` 라우트는 존재하지 않는다.

## 4. 주입 포트

`contracts/GameModuleServices.ts`가 교체 지점을 인터페이스로 정의한다. 구현체 조립은 `app/GameServiceProvider.tsx` 한 곳에서만 한다.

| 포트 | 구현체 |
| --- | --- |
| `soloGameApi` | `HttpSoloGameApi` / `LocalSoloGameApi` |
| `battleRoomGateway`, `turnBattleRoomGateway` | `SwaggerBattleRoomGateway` / `BackendBattleRoomGateway` / `DevBattleRoomGateway` |
| `battleGameTransportFactory` | `P2pBattleTransport` / `NativeWebSocketBattleTransport` / `MockBattleTransport` / `LocalBattleBotTransport` |
| `glyphTurnMatchTransportFactory` | `P2pGlyphTurnMatchTransport` |
| `roomRealtimeSocketFactory` | ticket 기반 native WebSocket |
| `recognitionVisionAdapterFactory` | `MediaPipeRecognitionVisionAdapter` / `RemoteRecognitionVisionAdapter` |
| `lineRaceRoomGateway`, `lineRaceBotGateway`, `lineRaceTransportFactory` | 개발 harness 전용 선택 포트 |

환경 분기는 `accessToken` 유무로 자동 결정한다. `Boolean(accessToken) || VITE_P2P_E2E === "true" || import.meta.env.PROD`이면 운영 구현체, 아니면 dev 구현체를 쓴다. 운영 빌드에서는 dev 인증 폴백을 차단한다.

리드 서버나 원격 AI 구현이 바뀌어도 페이지와 게임 규칙은 고치지 않고 이 factory/gateway만 교체한다.

## 5. 상태 관리 원칙

전역 store를 쓰지 않는다. 상태는 문자열 유니온 + 전이 화이트리스트를 가진 클래스로 관리하고, 정의되지 않은 전이는 예외를 던진다.

| 상태 머신 | 상태 |
| --- | --- |
| `BattleStateMachine` | `IDLE / CONNECTING / WAITING_START / COUNTDOWN / PLAYING / RECONNECTING / FINISHED / ERROR` |
| `LineRaceClientStateMachine` | 위와 동일한 8상태 |
| `ActivePlayerStateMachine` | `UNREGISTERED / REGISTERING / LOCKED / TEMPORARILY_LOST / REIDENTIFYING / AMBIGUOUS / USER_LOST` |
| `SignDecoderStateMachine` | `NO_HAND / TRACKING / MOVING / CANDIDATE / CONFIRMED / RELEASE_WAIT` |
| `GlyphTurnPhase` | `PLANNING / WAITING / REVEAL / FINISHED` |

매 프레임 좌표나 랜드마크를 React state에 저장하지 않는다. React state는 상태 전이, 오류, 연결 상태 변화에만 쓴다.

## 6. 도메인 규칙

게임 도메인 코어(`block-stacking/core`)는 렌더러, UI, 물리 월드, 시계, 네트워크에 의존하지 않는 순수 TypeScript다.

### 제거 대상 선택

`RemovalTargetSelector`는 확정된 심볼에 대해 `settledAt`이 가장 이른 유효 `SETTLED` 글자를 고른다. 유효한 정착 글자가 하나도 없을 때만 `spawnedAt`이 가장 이른 `FALLING` 글자를 고른다. `REMOVING`, `REMOVED` 레코드는 심볼 큐에 stale ID로 남아 있고 선택 시점에 무시한다.

### 입력 잠금

`InputLock`이 확정된 심볼을 잠근다. 같은 심볼은 cooldown이 지나도 `handReleased()` 전까지 계속 차단된다. `allowDifferentSymbolSwitch`가 켜져 있으면 cooldown 이후 다른 심볼이 잠금을 교체할 수 있다. 기본값은 `{ enabled: true, cooldownMs: 300, allowDifferentSymbolSwitch: true }`이고 개발용으로 `GameConfig`에서 끌 수 있다.

## 7. React 생명주기 대응

실시간 자원(소켓, PeerConnection, 카메라)을 effect로 관리하면서 필요한 처리다.

- **세대 카운터**: 비동기 connect가 완료될 때 자기 세대가 현재 세대인지 확인하고, 아니면 결과를 버리고 자원을 즉시 닫는다. StrictMode의 setup→cleanup→setup에서 이전 연결이 새 연결을 덮는 것을 막는다. `SharedGameCameraSession`, `RoomRealtimeSocket`, `WebRtcDataChannelTransport`에 동일 적용.
- **dispose 지연**: Provider의 싱글턴 자원은 `cleanupGenerationRef` + `queueMicrotask`로 한 틱 미룬다. 같은 틱에 재설정이 오면 실제로 닫지 않는다.
- **Fast Refresh**: `ActivePlayerSession.reactivate()`로 모듈 교체 후에도 등록 세션을 잃지 않는다.

근본 대응은 게임 루프를 React 밖의 클래스로 두고 effect는 연결과 정리만 담당하게 나눈 것이다.

## 8. 정적 자산

`npm install`의 postinstall(`scripts/setup-mediapipe-assets.mjs`)이 다음을 로컬 `public/mediapipe`로 준비한다.

- `@mediapipe/tasks-vision`의 WASM loader/wasm
- 공식 hand/pose landmarker `.task` 모델

런타임에 CDN URL을 쓰지 않는다. 배포 전에 production build 산출물에 worker, WASM, 모델 파일이 포함되는지 확인한다.

## 9. 검증

```powershell
cd frontend
npm test -- --run src/game
npm run build
```

테스트 141개 파일. 타이머·랜덤·소켓·`getUserMedia`를 전부 주입 가능하게 설계해 실제 시간을 기다리지 않고 검증한다.
