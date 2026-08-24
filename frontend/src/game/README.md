# Game feature

`frontend/src/game`은 게임 선택 화면 이후를 소유하는 독립 프런트 기능이다. 플랫폼 홈, 학습, 회원가입·로그인, 프로필은 이 디렉터리에서 구현하지 않는다. 호스트 프런트는 `/game/*`에 `GameModule`을 마운트하고 사용자·토큰·서버 설정만 주입한다.

## 디렉터리

```text
game/
├─ block-stacking/       # 블록쌓기 솔로·봇·1:1과 물리/렌더/점수 엔진
├─ glyph-battle/         # 지문자 턴 배틀, 봇·1:1
├─ app/                  # GameModule 라우터와 서비스 조립
├─ recognition/          # 게임 공용 인식 세션, MediaPipe/원격 AI 경계
├─ media/                # 공유 카메라와 WebRTC
├─ match/                # Match transport 공통 계약
├─ contracts/            # 호스트 주입 계약과 백엔드 DTO 참고 계약
├─ config/               # 독립 실행 설정
├─ dev/                  # 게임 전용 개발 harness
├─ docs/                 # 게임 설계·운영·테스트 문서
└─ index.ts              # 다른 프런트 파트가 사용하는 공개 API
```

`block-stacking`과 `glyph-battle` 내부 구현은 서로 직접 결합하지 않는 것을 원칙으로 한다. 현재 지문자 게임에서 재사용하는 방 요청·WebRTC DataChannel 계약과 글자 메타데이터는 명시적인 공통 경계로만 참조한다. 새 공통 기능은 어느 한 게임 디렉터리에 넣지 말고 `recognition`, `media`, `match`, `contracts` 중 책임에 맞는 위치에 둔다.

## 플랫폼 연결

```tsx
import { GameModule } from "./game";

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

호스트가 공유하는 파일은 앱 router의 위 마운트 한 줄, 환경 설정, `package.json`뿐이다. 게임 화면은 전부 이 폴더 아래에 있고 전역 store나 호스트 CSS를 import하지 않는다.

## 소유 라우트

- `/game`: 게임 선택
- `/game/block`: 블록쌓기 모드 선택
- `/game/solo`: 블록쌓기 솔로
- `/game/battle/*`: 블록쌓기 방·대기실·1:1·결과
- `/game/turn-battle/*`: 지문자 배틀 방·봇전·1:1

개발 환경에서만 열리는 라우트는 `/game/battle/preview`(1:1 시각 프리뷰), `/game/battle/practice`(봇 연습), `/game/recognition/crowd-test`다. 사용자용 `line-race` 라우트는 더 이상 존재하지 않는다. `glyph-battle` 디렉터리 안의 `LineRace*` 코드는 턴 배틀이 재사용하는 방·장애물·피드백 계층과 개발 harness로 남아 있고, 외부 route 이름으로는 노출되지 않는다.

### 솔로 화면 표현 기준

- 게임 선택 화면과 같은 하늘색·연두색 팔레트를 사용한다.
- 게임판은 투명 Pixi 캔버스 아래의 하늘·구름·언덕·잔디 무대를 공유하며 지문자가 잔디 바닥에 쌓이는 구조다.
- 구름 애니메이션은 장식 전용이고 `prefers-reduced-motion` 환경에서는 멈춘다.
- 솔로 화면 진입 3초 뒤 첫 시연을 보여주고 이후 60초마다 12초 동안 수달이 전경 레이어를 지나간다. 옆걸음 5포즈는 몸 중심과 발 높이를 맞춘 개별 PNG로 렌더링하며 `0→1→2→3→4→3→2→1` 순서로 왕복 재생한다. 한 시점에는 한 프레임만 표시하고 캐릭터 이동은 `left`가 아니라 합성 가능한 `translate3d`로 처리한다. 수달은 이동 중 두 차례 약 1.5초씩 멈춰 정면을 바라본 뒤 다시 걷는다. AI 연결·게임 시작 여부와 무관하게 동작하고 쌓인 글자보다 앞에 표시되며, 통과 중에는 오른쪽 손 모양 그림 힌트만 잠시 숨긴다.
- 점수 HUD는 어두운 단일 바 대신 밝은 카드로 표시하고, 실제 낙하 글자·목표·제거 강조색도 같은 팔레트 안에서 유지한다.
- 카메라, 목표 지문자, 현재 인식, 가이드 이미지는 서로 독립된 패널로 유지해 AI 또는 카메라 오류가 게임판 레이아웃을 접지 않게 한다.

### MediaPipe 렌더링 기준

- 브라우저 화면 주사율이 카메라 FPS보다 높더라도 동일한 `video.currentTime` 프레임을 Hand/Pose 추론에 다시 제출하지 않는다.
- 주기 값은 `recognition/runtime/RecognitionPerformanceProfiles.ts`가 원천이다. 기본 `BALANCED`는 render 30, hand 24, pose 8, AI 12FPS다.
- 일반 플레이는 worker를 우선 사용하고 실패 시 기존 main-thread fallback으로 전환한다.
- 손 스켈레톤 캔버스는 새로운 손 추적 결과 또는 캔버스 크기 변경이 있을 때만 다시 그린다.
- 성능·손 소유권 디버그 상태는 디버그 화면에서만 React 상태로 구독한다.

### 2026-07-23 게임·MediaPipe 통합 반영 상태

- 블록 쌓기 선택·모드·솔로 화면을 같은 시각 언어로 정리하고, Pixi 게임판과 카메라·목표·현재 인식·가이드 패널을 독립적으로 유지한다.
- 경쟁 출제 가능 글자는 `ai/contracts/recognition/readiness.json`이 결정한다. 현재 `modelVersion`은 `jamo-31-v1`이고 31개 자모 중 27개가 `competitiveEligible`이다. 지숫자 `1`~`9`는 심볼 등록부에 `modelSupported: false`로 있고 `assets/guides/number-1.png`~`number-9.png` 안내 이미지도 있으나 readiness 클래스가 없어 AI 경쟁 출제에는 넣지 않는다. `0`과 `10`은 등록하지 않는다.
- `ai/contracts/recognition/readiness.json`은 MediaPipe 공용 모듈이 아닌 AI 모델 계약의 원천이다. 서버의 threshold·경쟁 가능 글자, 프런트의 출제 범위, 계약 테스트가 같은 파일을 읽는다. 확정 권위는 서버가 아니라 프런트 연속 지문자 Decoder다.
- MediaPipe는 landmark 추출에만 책임을 두고, 프레임 중복 추론 방지·worker 우선 실행·main-thread fallback·스켈레톤 조건부 렌더링으로 게임 화면의 응답성을 유지한다.
- 학습 이력과 모델 평가는 AI 서버 문서를 정본으로 관리한다. 게임 문서는 계약·카메라 통합·사용자 경험의 영향과 운영 제한만 기록한다.

코드 소유 디렉터리는 `glyph-battle`이 기준이다.

## 교체 경계

- 블록 Match 통신: `GameModuleServices.battleGameTransportFactory`
- 지문자 Match 통신: `GameModuleServices.glyphTurnMatchTransportFactory`
- 카메라 비전: `GameModuleServices.recognitionVisionAdapterFactory`
- 방과 솔로 API: `battleRoomGateway`, `turnBattleRoomGateway`, `soloGameApi`
- 방 실시간 소켓: `GameModuleServices.roomRealtimeSocketFactory`
- 개발용 라인레이스 포트(`lineRaceRoomGateway`, `lineRaceBotGateway`, `lineRaceTransportFactory`)는 harness 전용 선택 항목이다.

리드 서버나 원격 AI 구현이 바뀌어도 페이지와 게임 규칙은 수정하지 않고 이 factory/gateway만 교체한다.

## 검증

```powershell
cd frontend
npm test -- --run src/game
npm run build
```

개발용 단독 실행은 `npm run dev`를 사용한다. 실제 플랫폼에서는 루트 `App.tsx`가 아니라 호스트 router가 `GameModule`을 마운트한다.

## 최신 1:1 문서

- [1:1 UI와 방 생명주기](./docs/battle-ui-and-rooms.md)
- [게임 트러블슈팅 통합 기록](./docs/game-troubleshooting.md)
- [백엔드 계약](./docs/backend-contracts.md)
- [모듈 구조](./docs/architecture.md) · [게임 엔진](./docs/game-engine.md) · [인식 파이프라인](./docs/recognition.md)
