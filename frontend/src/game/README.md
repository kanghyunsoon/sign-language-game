# Game feature

`frontend/src/game`은 게임 선택 화면 이후를 소유하는 독립 프런트 기능이다. 플랫폼 홈, 학습, 회원가입·로그인, 프로필은 이 디렉터리에서 구현하지 않는다. 호스트 프런트는 `/game/*`에 `GameModule`을 마운트하고 사용자·토큰·서버 설정만 주입한다.

## 디렉터리

```text
game/
├─ block-stacking/       # 블록쌓기 솔로·봇·1:1과 물리/렌더/점수 엔진
├─ glyph-battle/         # 지문자 턴 배틀·라인레이스, 봇·1:1
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

`block-stacking`과 `glyph-battle` 내부 구현은 서로 직접 결합하지 않는 것을 원칙으로 한다. 현재 지문자 게임에서 재사용하는 방 요청·STOMP client 타입과 글자 메타데이터는 명시적인 공통 경계로만 참조한다. 새 공통 기능은 어느 한 게임 디렉터리에 넣지 말고 `recognition`, `media`, `match`, `contracts` 중 책임에 맞는 위치에 둔다.

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
- `/game/line-race/*`: 지문자 배틀 방·봇전·1:1·결과
- 개발 전용 `/game/media/dev`, `/game/recognition/crowd-test`, `/game/line-race/dev`

기존 URL 호환을 위해 지문자 배틀의 외부 route 이름은 당분간 `line-race`를 유지한다. 코드 소유 디렉터리는 `glyph-battle`이 기준이다.

## 교체 경계

- 블록 Match 통신: `GameModuleServices.battleGameTransportFactory`
- 지문자 Match 통신: `GameModuleServices.glyphTurnMatchTransportFactory`
- 라인레이스 통신: `GameModuleServices.lineRaceTransportFactory`
- 카메라 비전: `GameModuleServices.recognitionVisionAdapterFactory`
- 방과 솔로 API: `battleRoomGateway`, `lineRaceRoomGateway`, `soloGameApi`

리드 서버나 원격 AI 구현이 바뀌어도 페이지와 게임 규칙은 수정하지 않고 이 factory/gateway만 교체한다.

## 검증

```powershell
cd frontend
npm test -- --run src/game
npm run build
```

개발용 단독 실행은 `npm run dev`를 사용한다. 실제 플랫폼에서는 루트 `App.tsx`가 아니라 호스트 router가 `GameModule`을 마운트한다.
