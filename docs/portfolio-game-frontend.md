# 수어의 달인 — 게임 파트 프론트엔드

웹캠으로 한국 수어 지문자를 인식해 플레이하는 실시간 대전 게임. 게임 선택 화면 이후의 모든 화면과 게임 엔진, 인식 파이프라인, 실시간 통신을 담당했다.

- 기간: 2026-07 ~ 2026-08 (SSAFY 15기 공통 프로젝트, 6인 팀)
- 담당: `frontend/src/game` 전체 — 게임 UI, 물리·렌더 엔진, MediaPipe 인식, WebRTC 1:1, 방 생명주기
- 배포: https://sudal-play.vercel.app
- 규모: TypeScript/TSX 517개 파일 약 36,000줄, 테스트 141개 파일

## 읽는 법

1~3장은 전체 그림이다. 4~6장이 핵심 구현이고 각 장은 독립적으로 읽을 수 있다.

| 장 | 주제 | 한 줄 |
| --- | --- | --- |
| 4 | 한글 자모의 물리 강체화 | 캔버스 알파 채널에서 콜라이더를 자동 생성한다 |
| 5 | 인식 파이프라인 | AI 예측을 언제 게임 입력으로 확정하는가 |
| 6 | 서버 없는 실시간 1:1 | 백엔드가 게임을 중계하지 않는 조건에서의 호스트 권위 구조 |

5장은 AI 파트 문서 `ai-model-improvement-report.md`와 짝이다. 그 문서가 "모델이 무엇을 얼마나 맞히는가"이고 5장이 "그 예측을 언제 게임 입력으로 확정하는가"다. 두 문서는 `ai/contracts/recognition/readiness.json`에서 만난다.

## 근거 표기 규칙

이 문서는 AI 파트 문서와 달리 **정확도 같은 단일 축의 정량 지표가 없다.** 게임 파트에는 회차별 계측 로그가 없고, 성능 계측기(`RecognitionPerformanceMonitor`)는 런타임 수집만 하고 결과를 저장하지 않는다. 따라서 근거는 세 가지다.

1. **코드에 남은 상수와 구조** — 파일 경로와 상수명을 명시한다
2. **회귀 테스트 케이스 이름** — 대부분 실사용에서 발견한 증상을 그대로 옮긴 것이다
3. **커밋 SHA** — 조치가 실제로 반영된 지점

계측하지 않은 항목은 `미측정`, 코드에서 추론한 항목은 `코드 기반 추정`, 확인이 필요한 항목은 `확인 필요`로 표시한다. 조건이 다른 결과를 성능 향상처럼 비교하지 않는다. 9장에 무엇을 측정하지 않았는지 모아 두었다.

---

## 1. 무엇을 만들었나

| 모드 | 라우트 | 내용 |
| --- | --- | --- |
| 솔로 프링글수 | `/game/solo` | 제시된 지문자를 손으로 만들면 그 글자가 물리 블록으로 떨어져 쌓인다. 결승선에 닿으면 종료, 경과 시간으로 랭킹 |
| 1:1 프링글수 | `/game/battle/*` | 두 사람이 같은 목표 글자를 두고 경쟁. 먼저 인식한 사람의 보드에만 블록이 떨어지고, 3연속 성공 시 상대 블록을 빼앗는다 |
| 지문자 턴 배틀 | `/game/turn-battle/*` | 자모를 기술 카드로 쓰는 턴제 대전. 자모 종류별로 공격·방어·결계·공명·필살기 역할이 다르고 3원 상성이 있다 |
| 봇 연습 | `/game/turn-battle/practice` | 결정적 PRNG 기반 로컬 봇 |

핵심 제약이 세 개 있었다. **백엔드는 게임 진행을 중계하지 않는다**(방 생성·참가·결과 저장만 REST로 제공), **AI 모델의 인식률이 완전하지 않다**(31개 자모 중 7개는 신뢰할 수 없음), **카메라·MediaPipe·물리·렌더링·네트워크가 한 브라우저의 메인 스레드를 공유한다**. 이 세 제약이 아래 설계 대부분의 이유다.

---

## 2. 기술 스택

| 영역 | 기술 | 선택 이유 |
| --- | --- | --- |
| 프레임워크 | React 19, TypeScript 7, Vite 8 | 팀 공통 스택. 게임 모듈을 호스트 앱에 `<Route path="/game/*">` 한 줄로 마운트할 수 있게 설계 |
| 물리 | matter-js 0.20 | 2D 강체 시뮬레이션. 한글 획을 compound body로 조립할 수 있어 선택 |
| 렌더링 | PixiJS 8 (WebGL) + DOM 레이어 | 파티클·이펙트는 Pixi, 실제 글자는 CSS mask DOM. 이유는 4.1에 서술 |
| 손 인식 | @mediapipe/tasks-vision 0.10 (Hand/Pose Landmarker) | 브라우저에서 21개 손 랜드마크 + 33개 포즈 랜드마크 추출. Web Worker 실행 + 메인 스레드 폴백 |
| 실시간 통신 | WebRTC DataChannel, native WebSocket, SSE | 게임 진행은 P2P, 시그널링만 서버. 이유는 4.4에 서술 |
| 영상 | WebRTC mesh (최대 4인, 1인당 peer 3개) | 상대 얼굴 표시 |
| 상태 관리 | React Context + 명시적 상태 머신 클래스 | 전역 store 없이 게임 모듈을 독립 패키지로 유지 |
| 테스트 | Vitest 4, Testing Library | 141개 파일. 타이머·랜덤·소켓을 전부 주입 가능하게 설계해 결정적 검증 |

의존성을 의도적으로 적게 유지했다. 상태 관리 라이브러리, 애니메이션 라이브러리, WebRTC 래퍼, HTTP 클라이언트를 모두 쓰지 않고 표준 API와 얇은 어댑터로 구현했다. 게임 모듈이 호스트 앱의 `package.json`을 오염시키지 않는 것이 병합 조건이었기 때문이다.

---

## 3. 아키텍처 — 포트-어댑터로 모듈 경계 만들기

6인이 하나의 프론트 저장소를 공유했다. 게임은 화면 수가 많고 카메라·WebRTC 같은 전역 자원을 쓰므로, 경계를 명시하지 않으면 병합 충돌이 계속 생긴다. 그래서 게임을 **주입 가능한 포트만 노출하는 독립 모듈**로 만들었다.

```
호스트 앱 (다른 팀원 담당)
  └─ <Route path="/game/*" element={<GameModule user={...} accessToken={...} config={...} />} />
        │
        └─ GameServiceProvider — 여기서만 구현체를 조립한다
             ├─ soloGameApi            : HttpSoloGameApi | LocalSoloGameApi
             ├─ battleRoomGateway      : Swagger | Backend | Dev
             ├─ battleGameTransport    : P2P | NativeWebSocket | Mock | LocalBot
             ├─ recognitionVision      : MediaPipe | Remote
             ├─ roomRealtimeSocket     : ticket 기반 native WebSocket
             └─ glyphTurnMatchTransport: P2P 권위 해석기
```

`contracts/GameModuleServices.ts`가 주입 포트 9개를 인터페이스로 정의한다. 호스트가 공유하는 파일은 라우터 한 줄, 환경 설정, `package.json`뿐이고 게임 화면은 전부 `src/game` 아래에 있다. 전역 store나 호스트 CSS를 import하지 않는다.

이 구조 덕에 실제로 얻은 것:

- **백엔드 완성 전에 게임을 끝까지 개발**했다. dev 모드는 `DevBattleRoomGateway` + `LocalSoloGameApi`, 운영 모드는 `SwaggerBattleRoomGateway` + `HttpSoloGameApi`로 `accessToken` 유무에 따라 자동 분기한다.
- 배포 Swagger의 결과 저장 계약이 `{hostScore, guestScore}` → `{winnerUserId}`로 바뀌었을 때, 게임 규칙 코드를 건드리지 않고 gateway 한 곳만 고쳤다.
- MediaPipe를 서버 추론으로 교체하는 경로를 `RemoteRecognitionVisionAdapter` 골격으로 열어 두면서도, `HandCamera`와 게임 페이지에는 구현체 분기를 넣지 않았다.

상태는 문자열 유니온 + 전이 화이트리스트를 가진 클래스로 관리했다. `BattleStateMachine`은 `IDLE / CONNECTING / WAITING_START / COUNTDOWN / PLAYING / RECONNECTING / FINISHED / ERROR` 8상태, `ActivePlayerStateMachine`은 7상태, `SignDecoderStateMachine`은 6상태이고 정의되지 않은 전이는 예외를 던진다. 실시간 코드에서 "어떻게 여기 왔는지 모르는 상태"가 가장 비싼 버그라서, 잘못된 전이를 조용히 넘기지 않고 테스트에서 터지게 했다.

---

## 4. 한글 자모를 물리 강체로 다루기

한글 자모는 획 사이에 빈 공간이 있다. 이 장은 그 형태를 물리 시뮬레이션이 다룰 수 있는 강체로 바꾼 과정이다.

### 문제 정의 — 왜 사각형으로는 안 되는가

이 게임은 인식된 지문자를 물리 블록으로 떨어뜨려 쌓는다. 일반 테트리스라면 블록이 사각형·L·T 형태이고 콜라이더가 자명하다. 한글 자모는 그렇지 않다.

| 글자 | 사각형 근사의 문제 |
| --- | --- |
| `ㅡ` | 잉크는 아래쪽 가로획뿐인데 정사각 박스로 근사하면 위쪽 빈 공간에 다음 블록이 얹혀 **공중부양**한다 |
| `ㅣ` | 세로획 하나인데 가로로도 넓은 박스가 되어 옆 블록이 닿지 않는데도 충돌한다 |
| `ㄹ`, `ㅎ` | 획 사이 내부 공백이 모두 막힌 덩어리가 된다 |
| `ㅢ`, `ㅚ`, `ㅟ` | **두 획이 완전히 분리**돼 있는데 하나의 큰 사각형이 되면 그 사이 공간이 통째로 막힌다 |

즉 "글자 모양대로 쌓인다"는 것이 이 게임의 핵심 재미인데, 콜라이더가 글자 모양을 반영하지 않으면 재미 자체가 성립하지 않는다.

**대안으로 검토했다가 버린 것들:**

| 방식 | 버린 이유 |
| --- | --- |
| 글자마다 콜라이더 좌표를 손으로 정의 | 자모 31자 + 숫자 9자 = 40개. 폰트나 글자 크기가 바뀌면 전부 다시 해야 한다 |
| SVG 폰트 아웃라인 파싱 | 폰트 파일 형식 의존이 생기고, 곡선을 다각형으로 근사하는 로직을 직접 만들어야 한다 |
| 이미지 스프라이트 + 픽셀 완전 충돌 | Matter.js가 픽셀 단위 충돌을 지원하지 않고, 하려면 물리 엔진을 바꿔야 한다 |

### 채택한 방식 — 캔버스 알파 채널에서 콜라이더를 만든다

브라우저는 이미 폰트를 정확히 렌더링할 수 있다. 그 결과 픽셀을 읽어서 콜라이더를 만들면 폰트 파싱이 필요 없다.

#### 파이프라인

`block-stacking/glyphs/glyphRaster.ts` (352줄):

```
1. 오프스크린 캔버스에 글자를 그린다
   폰트: 700 200px "Noto Sans KR", "Malgun Gothic", sans-serif
   strokeText(외곽선) → fillText(채움) 순서

2. measureText의 actualBoundingBox*로 실제 잉크 박스를 구한다
   → 글리프의 advance width가 아니라 잉크가 차지하는 영역이 기준

3. getImageData로 픽셀을 읽어 8px 셀 단위로 알파 평균을 낸다
   COLLISION_CELL_SIZE = 8
   COLLISION_ALPHA_THRESHOLD = 0.025 이상이면 점유 셀

4. 점유 셀을 그리디 최대 사각형으로 병합한다
   mergeOccupiedGlyphCells(): 가로로 최대 확장 → 아래로 확장 반복

5. 텍스처 중심 기준 좌표로 변환해 사각형 목록으로 반환한다
```

#### 파라미터 선택 근거

| 상수 | 값 | 근거 |
| --- | --- | --- |
| `GLYPH_SOURCE_FONT_SIZE` | 200 | 8px 셀로 나눌 때 획 두께가 최소 2셀 이상 되도록. 너무 작으면 얇은 획이 셀 임계값을 못 넘는다 |
| `COLLISION_CELL_SIZE` | 8 | 셀이 작으면 파트 수가 폭발하고(Matter compound 비용), 크면 획 모양이 뭉갠다. 200px 폰트에서 실용 균형점 |
| `COLLISION_ALPHA_THRESHOLD` | 0.025 | 안티에일리어싱 경계 픽셀을 잉크로 오인하지 않는 하한. 코드 기반 추정: 값의 유도 과정 기록은 없음 |
| `MAX_RASTER_COLLIDER_PARTS` | 48 | 초과하면 래스터 결과를 쓰지 않고 폴백. Matter compound body의 파트 수가 많아지면 충돌 계산 비용이 커진다 |
| `RASTER_PADDING` | 4 | 외곽선이 캔버스 경계에서 잘리지 않게 |

#### 왜 그리디 병합인가

최적 사각형 분할(minimum rectangle partition)은 계산이 무겁고, 여기서는 **최적일 필요가 없다.** 필요한 건 "빈 공간을 막지 않고, 파트 수가 48개 이하"인 것뿐이다. 가로 우선 그리디는 한글 획의 특성(가로·세로 직선이 지배적)과 잘 맞는다.

실제 결과를 테스트로 고정했다. `MatterPhysicsWorld.test.ts`의 `"uses a small number of long stroke colliders for Korean glyphs"` — 획이 잘게 쪼개지지 않고 긴 사각형 몇 개로 병합되는지 검증한다.

### 3단 폴백 구조

캔버스를 항상 쓸 수 있는 것은 아니다. jsdom 테스트 환경에는 `getImageData`가 없고, 일부 저사양 환경에서는 오프스크린 캔버스가 실패할 수 있다. `block-stacking/physics/LetterBodyFactory.ts`가 우선순위대로 시도한다.

| 순위 | 방식 | 사용 시점 | 구현 |
| --- | --- | --- | --- |
| 1 | 래스터 기반 compound (파트 1~48개) | 브라우저 캔버스 사용 가능 | `createRasterCompoundBody` |
| 2 | 획 템플릿 compound | 캔버스 불가 | `createTemplateCompoundBody` + `GLYPH_STROKE_TEMPLATES` |
| 3 | 잉크 박스 단일 사각형 | 위 둘 다 실패 | `createFallbackRectangle` |

#### 2단 폴백을 손으로 만든 이유

3단(단일 사각형)만 있으면 되지 않나 싶지만, **합성모음 때문에 안 된다.** `ㅢ`, `ㅚ`, `ㅟ`는 두 획이 떨어져 있어서 단일 사각형이 되면 사이 공간이 통째로 막힌다. 이건 폴백 상황에서도 게임 규칙을 깨뜨린다.

그래서 자모 31자의 획을 헬퍼로 정의했다(`block-stacking/physics/glyphStrokeTemplates.ts`).

```
H(x, y, width = 0.82)  가로획, 두께 0.15
V(x, y, height)         세로획
D(x, y, angle, len)     대각획
RING()                  사각링 4획
```

정의 예:

| 글자 | 구성 |
| --- | --- |
| `ㄹ` | 5획 |
| `ㅂ` | 5획 |
| `ㅅ` | 대각획 2개 (±π/3) |
| `ㅎ` | `RING()` + 상하 짧은 가로획 2개 |

코드 주석에 이 설계 의도를 남겼다 — "합성모음(ㅢ/ㅚ/ㅟ)은 브라우저 래스터를 못 쓸 때도 획을 분리해 빈 공간이 한 덩어리 사각형이 되지 않게 한다."

회귀 테스트 `"keeps compound-vowel blank spaces out of fallback colliders"`가 이걸 고정한다. **폴백 경로도 게임 규칙을 지켜야 한다**는 조건을 테스트로 명시한 것이다.

#### compound body 조립

각 파트는 `Bodies.rectangle(..., width * scale + padding * 2, ...)`로 만들고 `padding = GLYPH_COLLIDER_GAP_PX + letterColliderPadding`이다. 조립 후 두 가지를 보정한다.

- `Body.setCentre(body, {x, y})` — 파트 배치로 어긋난 무게중심을 글자 중심으로 맞춘다
- `Body.setInertia(body, inertia * rotationInertiaScale)` — `rotationInertiaScale = 0.68`

관성을 낮춘 이유는 체감이다. compound body의 계산된 관성 그대로 두면 글자가 너무 안 돌아서 딱딱하게 느껴졌다. `COLLISION_SLOP_PX = 0.05`는 접촉 허용 오차다.

### 지킨 불변식 — 아트워크와 물리를 분리한다

여기서 한 번 문제가 생겼다. 글자 가독성을 높이려고 외곽선을 두껍게(`GAME_GLYPH_STROKE_WIDTH = 10`, `ㅡ` 전용 `HORIZONTAL_VOWEL_STROKE_WIDTH = 20`) 바꿨더니 **잉크 박스가 커져서 콜라이더 치수가 함께 변했다.** 시각 변경이 게임 물리를 바꾼 것이다.

시각 튜닝은 앞으로도 계속 일어난다. 그때마다 물리가 흔들리면 안 된다.

#### 조치

`createGlyphRaster()`가 **별도 소스 캔버스에 그린 뒤 원래 잉크 박스 크기로 축소해 넣는다.** 외곽선이 두꺼워지면 소스 캔버스 안에서 두꺼워지고, 결과물은 같은 박스에 담긴다. 콜라이더 산출용 폰트(`COLLISION_REFERENCE_FONT`)와 표시용 폰트(`DISPLAY_FONT`)는 같은 face로 고정했다.

#### 검증

회귀 테스트 이름 자체를 불변식으로 썼다.

- `"renders a strong contrasting outline without changing collider metrics"` — 외곽선을 강화해도 콜라이더 치수가 안 바뀐다
- `"uses one font-size ratio for consonants, vowels, and digits"` — 카테고리별로 폰트 비율이 갈리지 않는다
- `"applies the same visible spacing around every Korean glyph collider"` — 글자마다 여백이 달라지지 않는다
- `"provides finite normalized metrics for every game symbol"` — 40개 심볼 전부가 유한한 정규화 치수를 갖는다
- `"widens the single vertical vowel collider to match its artwork"` — 이건 예외를 **의도적으로** 고정한 것이다. `ㅣ`는 외곽선 때문에 실제 보이는 폭이 획보다 넓어서, 콜라이더도 아트워크에 맞춰 넓혔다

마지막 항목이 이 절에서 말하고 싶은 지점이다. "아트워크와 물리는 분리한다"가 원칙이지만, `ㅣ`처럼 **보이는 것과 닿는 것이 어긋나면 플레이어가 버그로 느끼는** 예외가 있다. 원칙을 지키되 예외를 테스트로 명시했다.

### 개발 도구 — 콜라이더를 브라우저에서 튜닝한다

자동 생성으로 대부분 해결되지만 미세 조정이 필요한 글자가 있었다. 코드를 고치고 재빌드하는 사이클로는 심볼 40개(자모 31 + 숫자 9)를 튜닝할 수 없었다.

#### 콜라이더 감사 모드

`/game/solo?collisionAudit=1`로 들어가면 글자별 콜라이더를 화면에서 확인·편집·저장·내보낼 수 있다(`block-stacking/components/GlyphCollisionAudit.tsx`). 전역 훅 `window.__auditGlyphColliders(symbols)`도 있다.

#### 3단 우선순위

```
1. dev 브라우저 오버라이드  (localStorage: "sudal:glyph-collision-overrides:v1")
2. glyphCollisionDefaults.json  (제품 기본값, 커밋됨)
3. 런타임 래스터  (위 둘이 없을 때)
```

브라우저에서 편집한 결과를 JSON으로 내보내 `glyphCollisionDefaults.json`에 반영하는 흐름이다. 이 순서 때문에 한 번 겪은 문제가 있다 — **브라우저 편집 결과를 파일에 반영하지 않으면 다른 사람의 환경에서는 옛 콜라이더가 쓰인다.** 내 브라우저에서만 맞는 상태였다. 그래서 감사 모드에서 "최종 JSON을 확인한 뒤 파일에 반영한다"를 절차로 문서화했다.

#### 프리컴퓨트

심볼 전체의 래스터를 게임 시작 시 한 번에 계산하면 첫 프레임이 늦는다. `primeGlyphCollisionCache()`가 `requestIdleCallback(timeout: 100)` 사이에 4개씩 청크로 미리 계산한다. 유휴 시간에 나눠 처리해 첫 진입을 막지 않는다.

### 물리 튜닝

`block-stacking/physics/types.ts`의 `DEFAULT_PHYSICS_CONFIG`:

| 항목 | 값 |
| --- | --- |
| `gravityY` | 0.34 |
| `maxFallSpeed` | 4.4 |
| `restitution` (반발) | 0.02 |
| `friction` | 0.34 |
| `frictionAir` | 0.014 |
| `density` | 0.001 |
| `rotationInertiaScale` | 0.68 |
| `letterWidth` / `letterHeight` | 140 (1:1은 `BATTLE_LETTER_SIZE = 240`) |
| `settleDurationMs` | 900 |
| `linearVelocityThreshold` | 0.07 |
| `angularVelocityThreshold` | 0.01 |

Matter 엔진 설정: `enableSleeping: true`, `positionIterations: 5`, `velocityIterations: 3`, `constraintIterations: 1`.

#### 반발을 거의 0으로 둔 이유

블록이 커지면서(1:1은 240px) 낙하 충격이 커졌고, 반발이 있으면 착지 시 더미 전체가 무너져 흩어졌다. 마찰은 중간(0.34)으로 둬서 **불안정하게 얹힌 블록은 굴러 내려가지만 바닥 전체로 튀지는 않는** 상태를 만들었다.

> 이 값들의 선택 근거는 체감 플레이다. 수치 최적화 기록은 `미측정`.

#### 정착 판정

`block-stacking/physics/SettlementDetector.ts`: 선형속도 0.07 이하 **그리고** 각속도 0.01 이하를 **900ms 연속** 유지해야 정착이다. 흔들리면 `stableForMs`를 삭제하고 `movedIds`로 되돌린다. 반환 타입이 `{newlySettledIds, movedIds}`인 이유는 "정착했다"만이 아니라 "다시 움직였다"도 상위에서 알아야 하기 때문이다(제거 연쇄, 네트워크 발행 판단).

테스트 `"reports settlement after a body remains still long enough"`, `"keeps a settled lower letter motionless when another letter lands on it"`.

### 프레임 안정성 문제 세 개

#### 늦은 프레임에서 블록이 바닥을 통과하거나 튀어올랐다

브라우저가 17~20ms짜리 프레임을 내보내면 큰 delta로 한 번에 적분하게 되고, 빠르게 낙하하는 블록이 바닥을 뚫거나 접촉 후 위로 튀었다.

`MatterPhysicsWorld`가 delta를 서브스텝으로 쪼갠다.

```ts
MAX_PHYSICS_STEP_MS = 1000 / 60
stepCount = ceil(deltaMs / 16.67)
```

테스트 `"splits a dropped frame into short physics steps"`, `"does not visibly pop upward after floor contact during dropped frames"`. 두 번째 테스트 이름에 `visibly`가 들어간 게 의미가 있다 — 내부 계산이 아니라 **화면에 보이는** 위치를 검증한다.

`capFallSpeed()`로 `velocity.y`가 `maxFallSpeed`를 넘으면 클램프한다. 물리적 정확성보다 초보자가 반응할 수 있는 속도를 우선했다(테스트 `"caps downward velocity for beginner-paced falling"`).

#### 정착 보드가 매 프레임 순회됐다

아무것도 움직이지 않는 보드도 매 프레임 Matter 상태 조회, 렌더 비교, 네트워크 발행 판단을 했다. 글자가 쌓일수록 비용이 선형 증가해 장시간 플레이에서 프레임이 떨어졌다.

- 모든 활성 바디가 sleeping이면 `Engine.update` 자체를 건너뛴다 (테스트 `"skips Matter updates while every letter is frozen"`)
- 1:1은 완전 정착 시 `SETTLED_BOARD_FRAME_INTERVAL_MS = 100`(10Hz)로 다운시프트하고 새 낙하가 시작되면 즉시 복귀한다

#### 리사이즈가 더미를 망가뜨렸다

창 크기를 바꾸면 좌표를 다시 계산해야 하는데, 단순 비율 스케일을 하면 바닥에 붙어 있던 블록이 공중에 뜨거나 서로 파묻혔다.

- 수평은 비율 스케일, 수직은 **"바닥으로부터의 거리"를 보존**한다. 보드 높이가 바뀌어도 쌓인 더미가 바닥에 붙어 있어야 하기 때문
- 리사이즈 후 모든 정착 바디를 `setStatic(false)` + `Sleeping.set(false)`로 재활성화한다. 스케일 과정에서 서로 겹친 블록이 스스로 분리될 기회를 준다

테스트 `"keeps settled letters aligned with the floor when the viewport resizes"`, `"reactivates settled blocks after resize so compressed blocks can separate"`.

#### 제거 후 선택적 깨우기

블록을 제거하면 그 위에 있던 블록들이 떨어져야 한다. 전체를 깨우면 하단 더미까지 미세하게 흔들려 안정된 구조가 무너진다. `removeLetter(id)`는 **제거된 블록보다 위(`y < removedY`)에 있던 정착 바디만** 깨운다.

테스트 `"stacks letters and lets an upper letter fall after lower removal"`.

### 렌더링 — Pixi와 DOM을 나눈 이유

`block-stacking/render/PixiGameRenderer.ts` (461줄)는 PixiJS v8을 쓰지만 **실제 글자는 Pixi로 그리지 않는다.**

#### 왜 나눴는가

문제 두 개가 있었다.

1. **캔버스가 라운드 프레임에 클리핑됐다.** 솔로 화면의 게임판은 둥근 테두리와 종이 연출 안에 있는데, WebGL 캔버스가 그 프레임에 잘려서 글자가 종이 뒤로 사라져 보였다.
2. **일부 WebGL 드라이버가 투명 클리어 버퍼를 흰색으로 표시했다.** 1:1 화면에서 게임판이 공유 배경을 흰색으로 덮었다.

#### 구조

| 레이어 | 담당 |
| --- | --- |
| Pixi `boardScenery` / `boardGrid` / `overlayLayer` | 배경, 결승선 |
| Pixi `lettersLayer` | 씨너리 모드에서의 글자와 파티클 |
| **DOM `frontLetterLayer`** | 실제 글자 (`div.solo-physics-letter-layer`, `aria-hidden`) |

DOM 레이어는 `mount.closest(".solo-stage-column")`에 붙여 게임판 클리핑 밖에 둔다. 글자는 `createGlyphRaster` 캔버스를 **CSS mask URL로 변환해 캐시**하고(`frontLetterMasks`), `frontLetterSignatures`로 변경이 없으면 DOM 갱신을 건너뛴다.

`showScenery: false`(1:1)일 때는 `app.canvas.style.visibility = "hidden"`으로 캔버스를 아예 숨기고 DOM 배경 + DOM 글자만 쓴다.

#### 이 구조가 만든 성능 문제와 해결

DOM 글자를 표시하면서 **보이지 않는 Pixi `LetterView`도 계속 생성하고 있었다.** `LetterView` 하나가 7개 Sprite를 소유하므로(그림자, 목표 halo/glow/edge, outer edge, sticker edge, 본체) 글자 수에 비례해 장면 그래프와 GPU 메모리가 낭비됐다.

- DOM 렌더 모드에서는 Pixi `LetterView`를 생성하지 않는다
- 제거 효과는 Pixi 뷰 없이도 완료 이벤트를 정상 발생시킨다
- 낙하 중인 글자만 `will-change: transform`을 쓰고 정착 즉시 `auto`로 되돌려 GPU 합성 레이어를 반환한다
- DOM 글자에 `contain: layout style paint`를 적용해 글자 갱신이 게임판 밖 레이아웃·페인트로 전파되지 않게 한다

#### 렌더 갱신 억제

`POSITION_RENDER_EPSILON = 0.05`, `ROTATION_RENDER_EPSILON = 0.0005` 미만의 변화는 렌더를 건너뛴다. Pixi 앱은 `app.init()` 직후 `app.stop()`을 호출해 **rAF 루프 소유권을 게임 런타임이 갖는다.** Pixi가 자기 루프를 돌리면 물리 스텝과 렌더가 서로 다른 주기로 돌아 동기화가 어긋난다.

#### 스쿼시 & 스트레치

`LetterViewFactory.setMotionState`:

```
motion  = min(1, |vy| / 4.5)
scaleX  = 1 - motion * 0.018
scaleY  = 1 + motion * 0.032
```

빠르게 떨어질 때 살짝 늘어나고 착지하면 돌아온다. 물리 시뮬레이션과 무관한 순수 시각 효과이고, 그래서 **콜라이더에는 영향을 주지 않는다**(4장의 불변식).

### 블록 배치 정책

같은 위치에 계속 떨어뜨리면 한 곳만 높아져 게임이 빨리 끝난다. `block-stacking/runtime/DistributedSpawnPolicy.ts`:

```
laneCount      = clamp(floor(width / (letterWidth * 1.2)), MIN_LANES 3, MAX_LANES 7)
influenceRadius = max(letterWidth * 0.9, width / laneCount * 0.72)
레인 부하        = Σ (proximity × heightLoad)
heightLoad      = 1 + (boardHeight - y) / boardHeight   ← 높이 가중
```

부하가 가장 낮은 레인을 고르고, **서버나 랜덤이 제시한 X는 동점일 때 tie-breaker로만 쓴다.** 랜덤을 주 신호로 두면 실제로 한쪽에 몰리는 구간이 생긴다.

높이 가중을 넣은 이유는 "블록 수"가 아니라 "위험도"로 판단해야 하기 때문이다. 낮게 넓게 깔린 레인보다 좁게 높이 쌓인 레인이 위험하다.

관련해서 타워 높이 게이지에도 처리가 있다. `block-stacking/runtime/towerHeight.ts`의 `settledTowerHeightRatio`는 **움직이는 바디가 있으면 이전 값을 유지**한다. 낙하 중인 블록의 순간 높이로 게이지가 튀는 것을 막는다.

> 1:1은 다르다. `BattleLocalBoardRuntime`은 스폰 X를 항상 보드 정중앙(`width / 2`)으로 고정한다. 두 브라우저의 Matter 시뮬레이션 초기 조건을 일치시켜야 하므로 분산 정책을 쓰지 않는다.

### 검증 방법과 한계

#### 테스트

| 파일 | 케이스 | 검증 |
| --- | ---: | --- |
| `MatterPhysicsWorld.test.ts` | 14 | 콜라이더 등록, 획 병합, 여백 일관성, 합성모음 공백, 중력·회전·충돌, 낙하 속도 상한, 프레임 분할, sleeping 스킵, 튀어오름 방지, 리사이즈 정렬·재활성화, 제거 연쇄, 정착 안정성 |
| `glyphRaster.test.ts` | 5 | 정규화 치수 유한성, 폰트 비율 일관성, 외곽선-콜라이더 분리, `ㅣ` 예외, L자 마스크 분리 |
| `SettlementDetector.test.ts` | — | 정착·재이동 판정 |
| `RemovalEffect.test.ts` | — | duration 범위 검증 (100~350ms 밖이면 `RangeError`) |

`"separates an L-shaped glyph mask into its visible strokes"`가 그리디 병합의 핵심 동작을 고정한다. L자 형태가 하나의 사각형으로 뭉치지 않고 두 획으로 분리되는지 확인한다.

### 이 장의 판단 — 한글을 물리로 다루며 배운 것

1. **브라우저가 이미 잘하는 일을 다시 만들지 않았다.** 폰트 아웃라인 파싱을 직접 구현하는 대신 캔버스에 그려서 픽셀을 읽었다. 폰트 형식 의존이 사라지고, 폰트를 바꿔도 콜라이더가 따라온다.

2. **"최적"이 필요 없는 곳에 최적 알고리즘을 쓰지 않았다.** 최소 사각형 분할 대신 가로 우선 그리디로 충분했다. 필요한 조건은 "빈 공간을 막지 않고 파트 48개 이하"였고, 한글 획이 직선 위주라 그리디가 잘 맞았다.

3. **폴백 경로도 게임 규칙을 지켜야 한다.** 자모 31자의 획을 손으로 정의한 것은 중복 작업처럼 보이지만, 합성모음의 빈 공간은 폴백에서도 유지돼야 하는 규칙이었다. 이걸 테스트 이름(`"keeps compound-vowel blank spaces out of fallback colliders"`)으로 명시했다.

4. **시각과 물리를 분리하되 예외를 숨기지 않았다.** 원칙은 "아트워크가 콜라이더를 바꾸지 않는다"이지만 `ㅣ`처럼 보이는 것과 닿는 것이 어긋나면 플레이어가 버그로 느낀다. 예외를 만들되 테스트로 명시해서 다음 사람이 "왜 여기만 다른가"를 알 수 있게 했다.

5. **렌더링 레이어를 나누면 비용이 따라온다.** DOM 앞 레이어로 클리핑 문제를 풀었지만, 보이지 않는 Pixi 객체를 계속 만드는 낭비가 뒤따랐다. 우회 구조를 넣을 때는 원래 경로를 끊는 것까지 같이 해야 한다.

6. **프레임은 균등하게 오지 않는다.** 늦은 프레임을 서브스텝으로 쪼개고, 아무것도 움직이지 않을 때는 엔진 자체를 멈추고, 리사이즈 후에는 겹친 블록이 스스로 풀릴 기회를 주는 것 — 물리 시뮬레이션을 브라우저에서 돌릴 때 필요한 처리가 알고리즘보다 많았다.

---

## 5. 인식 파이프라인 — AI 예측을 게임 입력으로 만드는 경계

카메라 프레임에서 게임 입력이 확정되기까지의 경계다.

### 문제 정의 — 세 가지가 동시에 성립해야 한다

| 요구 | 실패 모드 |
| --- | --- |
| 반응성 | 자세를 만들었는데 게임이 늦게 반응한다 |
| 연타 방지 | 손을 유지하는 동안 같은 입력이 반복된다 |
| 오입력 방지 | 지터나 전환 중 모양이 확정된다 |

세 개가 서로 반대 방향으로 당긴다. 그리고 조건이 하나 더 있다. **모델이 특정 글자를 신뢰할 수 없다.** 설계 당시에는 `ㅅ`/`ㅠ`가 구조적으로 혼동돼 threshold 조정으로 해결되지 않았고, 지금은 재측정으로 그 쌍이 풀린 대신 `ㅓ`/`ㅡ`가 같은 자리를 차지했다. 어느 글자가 막히든 게이팅 구조는 그대로 필요하다는 것이 요점이다.

여기서 중요한 판단을 했다. **인식률 문제를 반응성으로 덮지 않는다.** 처음 논의된 방식은 서버가 cooldown을 두는 것이었다. 확정 후 일정 시간 예측을 무시하면 연타가 막힌다. 하지만:

- 인식이 잘 안 되는 글자도 cooldown 때문에 "가끔 되는 것처럼" 보여서 문제가 은폐된다
- cooldown 동안 진짜 다음 입력도 무시되므로 빠른 연속 입력이 불가능하다
- 네트워크 왕복이 판정에 들어가 반응성이 나빠진다

그래서 **확정 권위를 프런트로 옮기고, 인식률 문제는 게이팅으로 따로 처리**했다.

### 역할 분리

| 주체 | 책임 | 하지 않는 것 |
| --- | --- | --- |
| AI 서버 | prediction + top candidates 제공 | 게임 입력 확정, cooldown, 잠금 |
| 프런트 Decoder | 확정, 잠금, 해제 판정 | 모델에 없는 글자 생성 |
| `readiness.json` | 경쟁 출제 가능 글자와 심볼별 임계값 | — |

`PythonWebSocketSignRecognizer`의 `modelVersion` 기본값이 `"frontend-temporal"`인 것도 이 경계를 드러낸다. 게임이 보는 "모델"은 서버 모델이 아니라 서버 예측 + 프런트 확정기의 조합이다.

프런트가 지키는 제약도 명시했다. **모델에 없는 글자를 만들어내지 않는다.** 문맥으로 후보를 좁히는 것(`ContextualPredictionSelector`)은 하되, 후보에 없는 글자를 추가하지는 않는다.

#### 개인정보 경계

같이 고정한 것이 있다. AI 서버에는 **최종 선택된 손의 랜드마크만** 보낸다.

- 얼굴 검출·embedding·crop을 사용하지 않는다
- 사람 추적용 외형 descriptor(옷 색 히스토그램 등)는 메모리에만 두고 전송하지 않는다
- segmentation 마스크, 원본 영상 프레임을 보내지 않는다
- 개발 모드 계측 JSON에도 영상·이미지·랜드마크·얼굴 정보·원본 payload를 넣지 않는다

원격 구현이 랜드마크가 아니라 영상 프레임을 보내야 한다면 인증·TLS·해상도·전송 빈도·서버 보존 금지·개인정보 고지를 먼저 확정한다는 조건을 어댑터 문서에 남겼다. 이 정책 차이는 transport 안에 머물러야 하고 게임 DTO로 새어 나오면 안 된다.

### 연속 지문자 Decoder

`recognition/temporal/`의 6상태 머신 + 후보 창 + 해제 감지기 구조다.

#### 상태

`SignDecoderStateMachine`: `NO_HAND / TRACKING / MOVING / CANDIDATE / CONFIRMED / RELEASE_WAIT`. 전이는 화이트리스트이고 위반하면 예외를 던진다.

#### 설정값

`SignDecoderConfig.ts`의 `DEFAULT_SIGN_DECODER_CONFIG`:

| 항목 | 값 | 역할 |
| --- | --- | --- |
| `minimumConfidence` | 0.75 | 기본 임계 |
| `minimumConfidenceBySymbol` | `RECOGNITION_CONFIDENCE_BY_SYMBOL` | **심볼별 실측 임계값** |
| `candidateWindowSize` | 4 | 후보 창 크기 |
| `minimumCandidateVotes` | 2 | 확정 최소 득표 |
| `minimumStableDurationMs` | 100 | 움직임 안정 최소 시간 |
| `movementThreshold` | 0.06 | 정지 판정 |
| `maximumPredictionAgeMs` | 1000 | 예측 유효 기간 |
| `releasePoseDistanceThreshold` | 0.12 | 해제 판정 거리 |
| `releaseMinimumDurationMs` | 100 | 해제 유지 시간 |
| `noHandReleaseDurationMs` | 80 | 손 소실 해제 시간 |
| `differentSymbolReleaseVotes` | 2 | 다른 심볼 해제 득표 |

`RESPONSIVE_GAMEPLAY_SIGN_DECODER_CONFIG`는 창 2 / 득표 1 / 안정 35ms / 해제거리 0.09 / 해제 45ms로 더 민감하다.

검증 함수가 `minimumCandidateVotes <= candidateWindowSize`를 강제한다. 두 값이 어긋나면 영원히 확정되지 않는 설정이 만들어지는데, 그건 실행 중에는 "인식이 안 된다"로만 보여서 원인을 찾기 어렵다.

#### 확정 조건 — 두 신호를 AND로 묶었다

```
후보 창 4프레임 중 2표 이상  AND  움직임 안정 100ms 이상
```

득표만 쓰면 손을 움직이는 중에 지나간 모양이 확정된다. 안정 시간만 쓰면 모델이 흔들리는 예측을 내는 동안에도 확정된다. 둘을 함께 요구해야 "자세를 만들고 잠깐 유지했다"가 된다.

테스트 `"does not confirm alternating jitter predictions without enough votes"`가 지터 케이스를 고정한다.

#### 심볼별 임계값 — 여기가 AI 문서와 이어진다

전체 임계값을 올리면 인식 잘 되는 글자까지 어려워진다. 내리면 혼동 글자가 오확정된다. 그래서 **글자마다 다른 임계값**을 쓰고, 그 값을 `readiness.json`의 실측 threshold에서 가져온다.

예를 들어 `ㅅ`의 threshold는 0.9999다. precision이 0.4709이므로 사실상 확정을 허용하지 않는 값이다. AI 문서에서 "precision을 지키는 threshold가 존재하지 않는다"고 결론 낸 글자가, 프런트에서는 이 숫자로 반영된다.

테스트 `"uses calibrated per-symbol confidence without lowering every class"`.

#### 해제 조건 세 개 — 연타 방지의 핵심

확정 후 다시 입력을 받으려면 해제되어야 한다. 경로가 세 개다.

| 경로 | 조건 | 필요한 이유 |
| --- | --- | --- |
| ① 자세 변경 | 확정 포즈와의 거리 > 0.12를 100ms 유지 | 손을 든 채로 다른 모양을 만드는 경우 |
| ② 손 소실 | 손이 사라진 상태 80ms | 손을 내렸다 다시 드는 경우 |
| ③ 다른 심볼 | 다른 심볼 2표 | 빠른 연속 입력. 이 경로는 창만 비우고 곧바로 CANDIDATE로 간다 |

③이 없으면 `ㄱ` → `ㄴ` → `ㄷ`를 빠르게 입력할 때 매번 손을 완전히 내려야 한다. 실제 지문자 입력은 손을 유지한 채 모양만 바꾸는 동작이라서, ③이 반응성의 핵심이다.

테스트 세 개가 각 경로를 고정한다.

- `"prevents repeats while the same pose is held"` (①·②의 목적)
- `"releases to a stable different symbol without removing the hand"` (③)
- `"emits a fast A-B-C sequence once per stable symbol"` (③의 실사용 시나리오)

#### 잠금 해제 범위 문제

한 번 겪은 버그다. 확정 후 hand-release 잠금이 **다음 목표나 다른 문자까지** 남았다. 인식한 글자가 바뀌었는데도 다시 시도되지 않았다.

목표가 바뀌거나 다른 문자가 확정되면 이전 입력 잠금을 즉시 해제하고, **같은 문자의 중복 확정만** 차단하도록 범위를 좁혔다. 잠금은 "입력 금지"가 아니라 "같은 입력 반복 금지"여야 했다.

#### 입력 검증 게이트

`validSample()`이 4중으로 검증하고 각각 카운터를 올린다.

- 시퀀스 역행 → `droppedPredictions++`
- 나이 초과 → `stalePredictions++`
- 심볼별 임계 미달 → 폐기
- 활성 손 세션 불일치 → 폐기

카운터를 나눈 이유는 진단이다. "인식이 안 된다"는 증상에서 원인이 지연인지 임계값인지 세션인지 구분할 수 있어야 한다.

### 실패 기록 — 응답 신선도의 기준점을 잘못 잡았다

#### 증상

AI 서버는 정상 동작하는데 게임에서 인식이 거의 되지 않았다. 서버에 20회 연속 WebSocket 연결을 시도해 모두 성공했고 서버 단위 테스트도 통과했다. 서버 문제가 아니었다.

#### 원인

`LatestOnlyInferenceController`가 응답 나이를 **원본 비디오 캡처 시각**부터 계산했다.

```
capturedAt(비디오 프레임) → MediaPipe 추론 → 랜드마크 → AI 전송 → AI 응답
                          └────── 이 구간이 느리면 ──────┘
```

MediaPipe 추론이 느린 프레임에서는 랜드마크가 준비된 시점에 이미 age budget(750ms) 상당이 소모돼 있었다. AI가 정상 속도로 응답해도 도착 시점에 stale로 판정돼 전부 버려졌다.

#### 조치

`flush()`에서 `capturedAt`을 **랜드마크가 실제 준비된 시점으로 재설정**한다. age budget은 "AI 왕복이 얼마나 걸렸나"를 재는 값이어야 하고, MediaPipe 지연은 거기 포함되면 안 된다.

테스트 `"starts response freshness when delayed landmarks are ready"`.

#### 이 실패에서 배운 것

이건 AI 문서 6장의 "데이터 문제가 아니라 입력 표현 문제"와 판단 구조가 같다. **증상(인식 안 됨)에서 가장 가까운 원인(모델, 임계값, 네트워크)을 의심했지만 실제 원인은 시간 기준점이었다.** 서버를 20회 테스트해 서버가 정상임을 먼저 확인한 것이 원인 범위를 좁히는 데 결정적이었다.

관련해서 화면 표시도 고쳤다. `CONNECTED/DISCONNECTED` 라벨이 카메라·MediaPipe 상태가 아니라 AI WebSocket 상태였는데, 문구가 두 상태를 하나처럼 보이게 했다. `AI 인식 서버`로 명시해 분리했다. **진단 가능성도 기능이다.**

### 파이프라인 백프레셔

#### 주기 분리

한 화면에서 카메라 갱신, Hand/Pose 추론, 스켈레톤 렌더, React 갱신, Pixi/Matter 렌더, AI 전송, WebRTC 인코딩이 메인 스레드를 공유한다. 모든 프레임을 순서대로 처리하면 느린 추론 하나로 큐가 쌓인다.

`RecognitionFrameScheduler`가 단일 rAF 루프에서 프레임을 발행하고 소비자별 FPS 예산으로 팬아웃한다. `video.readyState >= 2 && video.currentTime !== lastMediaTime`일 때만 발행해 **같은 프레임의 중복 추론을 차단**한다. 리스너 예외는 try/catch로 격리해 한 소비자의 오류가 루프를 멈추지 않게 했다.

`RecognitionPerformanceProfiles.ts`:

| 프로필 | render | hand | pose | AI | 최대 추적 인원 | 최대 손 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HIGH | 60 | 30 | 12 | 15 | 4 | 4 |
| BALANCED (기본) | 30 | 24 | 8 | 12 | 4 | 4 |
| LOW_POWER | 30 | 18 | 6 | 8 | 2 | 2 |

`RecognitionRateConfig.ts`의 `RESPONSIVE_GAMEPLAY`는 render 20 / hand 24 / pose 4 / AI 18이다. 코드 주석에 근거를 남겼다 — **"24Hz latest-only가 과부하된 30~60Hz 큐보다 종단 지연이 낮다."** 처리량을 올리는 것과 지연을 줄이는 것이 다르다.

Pose를 Hand보다 훨씬 낮게(8Hz) 둔 것은 Pose가 사람 위치 추적용이고 손 모양만큼 자주 필요하지 않기 때문이다. 이 결정이 6장의 부작용을 만든다.

#### latest-only

`LatestOnlyInferenceController`: in-flight 1개 + 대기 최신 1개. 새 프레임이 오면 오래된 대기 프레임을 교체하고 `replacements++`.

응답 수락 조건 5개 중 하나라도 어기면 거부하고 `monitor.stale()`을 호출한다 — 미지 frameId / 다른 sessionId / 다른 activeHandId / `sequence <= lastAppliedSequence` / 나이 초과.

`sent` 맵은 4개를 넘으면 오래된 것부터 제거한다. 응답이 오지 않는 요청이 쌓여 메모리가 증가하지 않게 하는 상한이다.

`rotateSession()`은 활성 손 세션이 바뀌면 시퀀스와 버퍼를 전부 초기화한다. **손 주인이 바뀌면 이전 추론은 전부 무효다.** 테스트 `"invalidates a late response when the active hand session changes"`.

#### 계측

`RecognitionPerformanceMonitor`: 1초 슬라이딩 윈도로 camera/render/hand/pose/aiRequest/aiResponse FPS, 240샘플 링버퍼로 평균·p95(`ceil(n*0.95)-1` 인덱스), `PerformanceObserver({entryTypes:["longtask"]})`로 메인 스레드 롱태스크 카운트. publish는 250ms 스로틀.

스냅샷 필드에 `droppedHandFrames`, `droppedPoseFrames`, `droppedInferenceFrames`, `staleResponsesIgnored`, `mainThreadLongTaskCount`가 있다. **버린 프레임 수를 세는 것이 처리한 프레임 수보다 진단에 유용했다.**

> 이 계측기는 런타임 표시용이고 결과를 파일로 남기지 않는다. 따라서 프로필별 실제 p95 지연은 `미측정`이다. AI 문서처럼 수치 비교를 하려면 이 부분을 먼저 기록해야 한다.

#### 스무딩 분리

랜드마크 스무딩을 용도별로 나눴다.

| 용도 | 처리 |
| --- | --- |
| 움직임 분석 | raw (스무딩 없음) |
| AI 전송 | 약한 스무딩 |
| 캔버스 표시 | 강한 스무딩 |

표시용 좌표에만 이동 예측과 안정화를 적용하고 **AI에는 원본 측정 좌표를 보낸다.** 스무딩된 좌표를 AI에 보내면 인식 정확도가 떨어지고, raw 좌표를 화면에 그리면 관절선이 떨린다. 같은 데이터의 용도가 다르면 전처리도 달라야 한다.

### 다중 인물 환경에서 "내 손"을 고르기

발표 환경에는 카메라 앞에 사람이 여러 명 있다. `hands[0]`을 쓰면 뒤에 있는 사람이 손을 들 때 입력 주체가 바뀐다. Pose 결과 배열 index도 사람의 영구 ID가 아니라서 두 사람이 교차하면 사용자가 뒤바뀐다.

#### 먼저 배제한 접근

| 방식 | 배제 이유 |
| --- | --- |
| `hands[0]` / `poses[0]` 고정 | 교차·가림에 무력 |
| 화면 중앙 우선 | 사용자가 중앙에 있다는 보장이 없다 |
| **얼굴 인식으로 사용자 식별** | 게임에 필요하지 않은 생체정보 문제를 만든다 |
| handedness 단독 판정 | 셀피 미러링으로 좌우가 뒤집힌다 |
| 사용자 상실 시 가장 가까운 사람으로 자동 전환 | 다른 사람이 게임을 이어받는다 |

얼굴 인식 배제는 기술적 판단이 아니라 **범위 판단**이었다. 이 게임에 필요한 것은 "이 손이 등록된 사용자의 손인가"이고, "이 사람이 누구인가"는 필요하지 않다.

#### 사람 추적

`PersonTrackManager` + `PersonDetectionMatcher`. 5개 신호 가중합으로 트랙-검출을 배정한다.

| 신호 | 가중치 | 계산 |
| --- | ---: | --- |
| 위치 | 0.25 | 중심 거리 / √2 |
| bounding box | 0.20 | 1 − IoU |
| 포즈 | 0.25 | 1 − cosine |
| 움직임 | 0.15 | 속도 벡터 cosine |
| 외형 | 0.15 | 1 − 히스토그램 cosine |

검증 함수가 **가중치 합 = 1**을 오차 1e-6으로 강제한다. 가중치를 나중에 조정할 때 정규화를 잊으면 임계값의 의미가 조용히 바뀌는데, 그건 디버깅이 매우 어렵다.

배정은 **백트래킹 완전탐색**으로 비용을 최소화한다(트랙별 "미배정" 분기 비용 = `maximumMatchCost 0.82`). 헝가리안 알고리즘을 쓰지 않은 이유는 최대 4명이라 탐색 공간이 작고, 구현이 단순해 검증하기 쉽기 때문이다.

외형 descriptor는 어깨폭(랜드마크 11-12), 골반폭(23-24), 몸통 높이 비율과 16bin 토르소 색 히스토그램이다. 옷 색 같은 휘발성 값만 쓰고 메모리에만 둔다.

주요 상수(`ActivePlayerConfig.ts`): `temporaryLostGraceMs 1500`, `reidentificationTimeoutMs 5000`, `minimumRegistrationDurationMs 700`, `minimumLockScore 0.72`, `ambiguityScoreDifference 0.05`, `maximumMissedFrames 24`, `minimumPoseVisibility 0.35`, `maximumRegistrationVelocity 0.004`, `minimumRegistrationPoseSimilarity 0.88`.

#### 손 소유권

`HandOwnerResolver`. 6개 신호 가중합.

| 신호 | 가중치 | 계산 |
| --- | ---: | --- |
| 포즈 손목 거리 | 0.30 | `exp(-normalizedDistance * 1.8)` |
| 팔 방향 | 0.15 | |
| 시간 연속성 | 0.20 | `exp(-dist * 1.6)`, 이전 트랙 없으면 0.7 |
| handedness | 0.10 | 하한 0.5 |
| segmentation | 0.15 | 선택적 |
| Active Player 경계 | 0.10 | `exp(-dist / max(0.03, w) * 3)` |

거리 스케일을 **어깨폭으로 정규화**해 카메라 거리에 무관하게 만들었다. z축은 ×0.3으로 가중을 낮췄다. MediaPipe의 상대 깊이값에 노이즈가 크기 때문이다(AI 문서 2장에서 초기에 z를 제외했던 것과 같은 이유이고, 여기서는 제외하지 않고 가중을 낮추는 쪽을 택했다).

`weightedOwnershipScore`는 **누락된 신호의 가중치를 제외하고 재정규화**한다. segmentation이 없는 환경에서도 나머지 5개로 판정이 성립한다. 테스트 `"reweights remaining evidence when segmentation is unavailable"`.

#### 애매하면 차단한다

`minimumOwnershipScore 0.62`, `minimumScoreGap 0.05`. 최고 점수가 낮거나 1·2위 차이가 작으면 입력을 버린다. 차단 사유를 열거형으로 구분했다.

`NO_ACTIVE_PLAYER / NO_HAND / POSE_ANCHOR_UNAVAILABLE / LOW_CONFIDENCE / AMBIGUOUS / SUDDEN_JUMP / TEMPORARILY_LOST`

`maximumNormalizedHandJump 1.5` — 정규화 거리 1.5를 넘는 순간이동은 다른 사람의 손이다.

판단 기준: **다른 사람의 손을 잘못 받는 것보다 내 입력 한 번을 놓치는 것이 낫다.** 잘못 받으면 게임 결과가 오염되고 원인도 알 수 없지만, 놓치면 다시 하면 된다.

관련 테스트: `"selects the active player's wrist rather than a surrounding person's hand"`, `"blocks similar ownership candidates as ambiguous"`, `"blocks input without a locked active player"`, `"blocks missing pose wrists when multiple people are present"`.

#### 실패 기록 — 1인 플레이에서 정상 손이 깜빡였다

5장에서 Pose를 8Hz로 낮춘 결과다. Pose 앵커가 없는 프레임에서는 `POSE_ANCHOR_UNAVAILABLE`로 차단되므로, Hand는 24Hz로 들어오는데 판정이 8Hz로만 통과했다. 혼자 플레이하는 대부분의 상황에서 인식이 끊겨 보였다.

**엄격한 다중 인물 판정이 실제 사용 조건과 맞지 않았다.**

조치: `detectedPoseCount <= 1 && candidates.length === 1`이면 다중 인물 스코어링을 우회한다. 단독일 때는 최소 점수도 `min(0.62, 0.5)`로 완화한다.

테스트 `"allows the sole hand of the sole registered player even when a pose anchor briefly disappears"`, `"does not drop the sole registered user's fast hand movement"`.

이 케이스가 남긴 교훈: **최악 시나리오(군중)를 기준으로 만든 안전장치가 일반 시나리오(1인)를 망가뜨릴 수 있다.** 두 경로를 나누는 것이 안전장치를 약화시키는 것보다 낫다.

#### 등록과 상실

`ActivePlayerStateMachine`: `UNREGISTERED / REGISTERING / LOCKED / TEMPORARILY_LOST / REIDENTIFYING / AMBIGUOUS / USER_LOST`.

등록은 한 손을 머리 위로 드는 제스처다. `isRegistrationGesture()`가 랜드마크 11·12·13·14·15·16의 가시성 ≥ 0.35이고 손목(15/16)이 어깨(11/12)보다 −0.02 위인지 확인한다. 후보가 정확히 1명이고 속도 ≤ 0.004, 포즈 유사도 ≥ 0.88을 700ms 유지해야 lock한다. **후보가 2명 이상이면 `AMBIGUOUS`로 두고 등록하지 않는다.**

상실 경로: LOCKED에서 트랙 소실 → `TEMPORARILY_LOST` → 1500ms 초과 → `REIDENTIFYING` → 최고점 ≥ 0.72이고 모호하지 않으면 재lock(`idSwitchCount++`) → 5000ms 안에 못 찾으면 `USER_LOST`.

`idSwitchCount`를 세는 이유는 품질 지표다. 이 값이 높으면 재식별이 실제로는 다른 사람으로 넘어가고 있을 가능성이 있다. 다만 **실제 군중 환경에서의 idSwitchCount는 `미측정`이다.**

#### 세션 무효화 연쇄

`ActiveHandTracker`가 소유권 통과 시 `ActiveHandSession{sessionId, activePlayerTrackId, activeHandId, startedAt}`을 발급한다. 실패가 `maximumMissedFrames 12`를 넘거나 `temporaryLostGraceMs 900`을 넘으면 세션을 무효화한다.

이 sessionId가 `LatestOnlyInferenceController`의 세션 회전 키로 전달된다. 즉 **손 주인이 바뀌면 AI 추론 큐가 자동으로 비워진다.** 계층 간 연결을 sessionId 하나로 만든 것이 이 파이프라인에서 가장 유용한 설계였다.

### AI 서버 연결 복구

`PythonWebSocketSignRecognizer`:

| 항목 | 값 |
| --- | --- |
| 재접속 백오프 | `min(500 * 2^attempt, 8000)`ms |
| 손 미검출 전송 간격 | `HAND_MISSING_SEND_INTERVAL_MS 80` |
| 직접 추론 타임아웃 | `DIRECT_INFERENCE_TIMEOUT_MS 900` |

생성·오류·종료 **어느 경로에서든** 다음 재접속을 예약한다. 경로 하나를 빠뜨리면 특정 실패 유형에서만 영구 단절되는데, 그건 재현이 어렵다.

MediaPipe 쪽도 같은 원칙이다. worker가 실패하면 즉시 main-thread tracker로 전환하고, main-thread의 일시 실패는 **해당 프레임만 버리고** 다음 프레임에서 tracker를 다시 초기화한다. 초기에는 일시 오류가 추론 루프 전체를 중단시켰다.

### readiness 게이팅 — AI 문서의 결론을 제품 정책으로 받기

#### 계약 파일

`ai/contracts/recognition/readiness.json`:

| 필드 | 값 |
| --- | --- |
| `schemaVersion` | 1 |
| `modelVersion` | `jamo-31-v1` |
| `confirmationAuthority` | `FRONTEND_TEMPORAL_DECODER` |
| `evaluation.measuredModel` | `jamo-31-ensemble-v2` (dual head, rotation-augmented) |
| `evaluation.sampleCount` | 1900 |
| `evaluation.sampling` | 촬영 영상의 고정 test split(각 클립 뒤 30%), 시퀀스 창 10 stride 1 |
| `evaluation.trainingIndependent` | **false** |
| `criteria.minimumConfirmationRate` | 0.85 |
| `criteria.minimumCompetitivePrecision` | 0.90 |

31개 클래스 중 `competitiveEligible`은 **27개**다.

| 제외 | 사유 (JSON `reason` 필드 그대로) |
| --- | --- |
| `ㅓ` | 확정률 85% 미만; `ㅡ`로 오독됨 — T-152에서 margin 조정이 `ㅡ`를 무너뜨려 threshold 하향으로 대체하지 않음 |
| `ㅗ` | 확정률 85% 미만 |
| `ㅜ` | 확정률 85% 미만; 예측은 맞지만 일부 표본에서 confidence가 0.5 아래에 머문다 |
| `ㅡ` | precision 90% 미만; `ㅓ`를 일부 흡수 |

이 표는 고정값이 아니다. 판정 여유(top1-top2) 게이트를 넣고 전 클래스를 재측정한
`bfa7f13`에서 `ㅅ ㅏ ㅕ ㅠ ㅔ ㅖ`가 풀리고 `ㅗ ㅜ ㅡ`가 대신 막혔다. 그래서 코드와
테스트 어느 쪽도 이 목록을 복제하지 않고 계약에서 파생시킨다.

#### 단일 원천

같은 파일을 세 곳이 읽는다.

- 서버: threshold와 경쟁 가능 글자
- 프런트: 출제 범위(`BATTLE_TARGET_SYMBOLS = GAME_SYMBOLS.filter(isCompetitiveRecognitionReady)`), 심볼별 confidence 임계
- 계약 테스트: drift 검증

상수를 코드에 복제하지 않은 것이 핵심이다. 복제하면 AI 팀이 모델을 갱신했을 때 프런트가 옛 목록을 계속 쓰는데, 그 상태가 겉으로는 정상 동작으로 보인다.

방 옵션 `symbolRange`(`자음` / `모음` / `기초 혼합`)도 이 필터를 통과한 글자로만 구성한다.

#### 검증

`LocalBotPracticeReadiness.integration.test.ts`:

- `"keeps both initial hands competitive for at least 100 seeds"` — 시드 100회에서 초기 카드 두 장이 항상 경쟁 가능한지
- `"never draws or spawns an excluded symbol after repeated card use"` — 반복 사용 후에도 제외 심볼이 등장하지 않는지

게이팅이 **필터 함수 수준이 아니라 실제 카드 드로우와 spawn까지 관철되는지**를 시드 반복으로 확인한다.

#### 숫자 처리

지숫자 1~9는 `GAME_SYMBOL_REGISTRY`에 `modelSupported: false`, `feedbackMode: "CLASSIFICATION_ONLY"`로 등록되어 있고 `assets/guides/number-1.png`~`number-9.png` 안내 이미지도 있다. 하지만 `readiness.json`에 클래스가 없으므로 **AI 경쟁 출제에는 포함되지 않는다.** 어댑터가 `withoutNumericPrediction()`으로 숫자 예측을 걸러낸다. 0과 10은 등록 자체를 하지 않는다.

`symbolRegistry.ts`의 주석이 경계를 명시한다 — "Baseline model availability only. Runtime CAPABILITIES is authoritative."

#### 수치를 좋게 쓰지 않았다

`trainingIndependent: false`와 경고 문구를 JSON에 남겼다.

> "The legacy model used a random sequence split across all three sessions. These results are a provisional safety gate, not independent model certification."

`readinessForSymbol()`로 조회되는 이 값들은 잠정 안전장치이지 모델 인증이 아니다. AI 문서 15장의 signer-independent 평가 필요성과 같은 결론이고, 프런트에서도 같은 문구를 유지했다. **경계가 문서 두 곳에 흩어질 때 한쪽만 낙관적으로 쓰면 그쪽이 나중에 근거로 인용된다.**

### 검증과 한계

#### 테스트

| 파일 | 케이스 | 검증 |
| --- | ---: | --- |
| `ContinuousSignDecoder.test.ts` | 12 | 연타 방지, 손 유지 전환, A-B-C 연속, 심볼별 임계, 지터 미확정 |
| `HandOwnerResolver.test.ts` | 8 | 미러링, 1인 fast path, 신호 결손 재정규화, 모호 차단 |
| `LatestOnlyInferenceController.test.ts` | 4 | in-flight 1개, 5중 응답 검증, 세션 회전, 신선도 기준점 |
| `LocalBotPracticeReadiness.integration.test.ts` | 2 | 시드 100회 게이팅 관철 |
| `recognitionReadiness.test.ts` | — | 계약 파일 파싱과 파생 export |

시간·랜덤·소켓을 전부 주입 가능하게 만들어 100ms 안정 시간, 80ms 손 소실, 1500ms 유예를 실제로 기다리지 않고 검증한다.

### 이 장의 판단 — 인식 경계를 그으며 배운 것

1. **인식률 문제를 반응성으로 덮지 않았다.** 서버 cooldown 대신 확정 권위를 프런트로 옮기고, 신뢰할 수 없는 글자는 readiness 게이팅으로 따로 배제했다. 두 문제를 한 장치로 처리하면 어느 쪽도 제대로 해결되지 않는다.

2. **AI 문서의 결론이 제품 정책으로 이어지는 경로를 만들었다.** "`ㅅ`에는 precision을 지키는 threshold가 없다"는 결론이 `threshold: 0.9999`와 `competitiveEligible: false`로 반영되고, 시드 100회 테스트로 카드 드로우까지 관철된다. 계약 파일 하나가 두 파트를 연결한다.

3. **원인은 가장 가까운 곳에 없었다.** 인식이 안 되는 증상에서 모델·임계값·네트워크를 의심했지만 실제 원인은 age budget의 기준점이었다. 서버가 정상임을 먼저 확인해 범위를 좁힌 것이 결정적이었다.

4. **최악 시나리오 안전장치가 일반 시나리오를 망가뜨릴 수 있다.** 군중 대응 소유권 판정이 1인 플레이의 정상 손을 차단했다. 안전장치를 약화시키는 대신 경로를 나눴다.

5. **버린 것을 세는 것이 처리한 것을 세는 것보다 유용했다.** `droppedHandFrames`, `staleResponsesIgnored`, 차단 사유 열거형이 진단의 핵심이었다. 성공 카운터만으로는 "왜 안 되는지"를 알 수 없다.

6. **범위 판단을 기술 판단보다 먼저 했다.** 얼굴 인식은 구현 가능했지만 이 게임에 필요하지 않은 문제를 만든다. 필요한 것은 "이 손이 등록된 사용자의 것인가"였고 "이 사람이 누구인가"가 아니었다.

7. **계측기를 만들었으나 기록을 남기지 않은 것이 이 파트의 한계다.** 17개 필드를 수집하는 모니터가 있는데도 이 문서에 실측 수치가 없다. 측정할 수 있는 구조를 만드는 것과 실제로 측정해 남기는 것은 별개의 작업이었다.

---

## 6. 서버 중계 없는 실시간 1:1 대전

백엔드가 게임 진행을 중계하지 않는 제약에서 나온 구조와, 그 과정에서 되돌린 설계 네 건의 기록이다.

### 제약과 문제 정의

#### 백엔드가 게임 진행을 중계하지 않는다

배포된 백엔드가 제공하는 것은 다음뿐이다.

| 계층 | 제공 범위 |
| --- | --- |
| REST | 방 생성·참가·준비·시작, 결과 저장 |
| SSE | 로비 방 목록 스냅샷/갱신 |
| Room WebSocket | 참가 확인, presence(`PEER_DISCONNECTED`/`PEER_RECONNECTED`/`PEER_LEFT`/`PEER_READY_CHANGED`), `GAME_STARTED`, WebRTC `SIGNAL` 릴레이 |

Room WebSocket이 허용하는 클라이언트 송신 타입은 `SIGNAL` **하나뿐이다**(근거: `realtime/RoomRealtimeSocket.ts`의 `MESSAGE_TYPES` 화이트리스트, 테스트 `"connects with a fresh query ticket and sends only SIGNAL envelopes"`). 즉 블록 낙하, 목표 제시, 점수 판정 같은 게임 상태를 서버로 보낼 경로가 없다.

여기에 **백엔드 소스는 수정하지 않는다**는 팀 합의가 있었다. 백엔드 담당이 1명이고 인증·랭킹·펫 성장 등 다른 도메인 작업이 병행 중이었다. 게임이 백엔드 변경을 기다리면 양쪽이 모두 막힌다.

#### 그래서 풀어야 했던 문제

두 브라우저가 서버 중재 없이 다음을 합의해야 한다.

- **공유 목표의 소유권** — 같은 글자를 두 사람에게 제시하고, 먼저 인식한 한 명의 보드에만 블록을 떨어뜨린다
- **두 물리 보드의 일관성** — 한쪽 화면의 상대 보드가 실제 상대 화면과 같아야 한다
- **승패 판정** — 서버는 결과를 저장할 뿐 판정하지 않는다
- **단절과 복구** — 새로고침, 뒤로가기, 네트워크 순단, 영구 이탈을 구분해야 한다

이 네 개가 각각 실패했고, 각 실패가 설계를 한 번씩 되돌렸다. 아래가 그 기록이다.

### 전송 경계 설계

#### 채널 분리

```
방 생성/참가/준비/시작        → REST                    (서버)
1회용 ticket 발급             → POST /auth/sse-ticket    (Bearer 헤더)
로비 목록                     → SSE (ticket query)       (서버)
SDP/ICE 교환                  → Room WebSocket (ticket query)
────────────── 여기까지만 서버 ──────────────
게임 명령/권위 이벤트/복구 스냅샷 → WebRTC DataChannel `GAME_P2P_V1`
```

#### SSE에 Bearer를 붙일 수 없다는 제약

`/game-rooms/subscribe` 구독을 설계할 때 처음에는 Bearer 헤더를 쓰려 했으나, 브라우저 `EventSource`는 임의 인증 헤더를 붙일 수 없다. 우회 방법을 만들지 않고 **티켓 발급(Bearer)과 구독(ticket query)을 분리**했다.

- `POST /auth/sse-ticket?userId=...`에 Bearer를 보내 `{ticket, expiresInSeconds}`를 받는다
- 실제 구독은 `?ticket=...` query로 한다
- 티켓은 1회용이므로 재연결마다 새로 발급한다

근거: `realtime/RealtimeTicketClient.ts`, `realtime/LobbySseClient.ts`. 응답 파싱은 safe integer와 양수 검증을 통과해야 하고 실패 시 `RealtimeTicketRequestError(status)`를 던진다.

#### 봉투와 발신자 인증

DataChannel 메시지는 모두 봉투로 감싼다.

```ts
{ protocol: "GAME_P2P_V1", roomId, kind: "COMMAND" | "EVENT" | "SNAPSHOT", payload }
```

`roomId` 불일치나 프로토콜 불일치는 폐기한다(`realtime/WebRtcDataChannelTransport.ts`). 중요한 점은 **커맨드 발신자를 애플리케이션 필드가 아니라 WebRTC peer로 식별한다**는 것이다. `subscribeCommands(listener(command, remoteUserId))`가 호스트에게 peer 단위로 전달하므로 게스트가 `userId`를 위조해도 소용이 없다.

DataChannel 오픈 대기는 15초 데드라인 / 25ms 폴링이다. PeerConnection이 `connected`가 된 직후에도 채널은 아직 열리는 중일 수 있어서, "연결됨"과 "전송 가능"을 구분해야 했다.

#### 폴백을 만들지 않은 결정

WebSocket 폴백을 두지 않았다(코드 주석에 명시). 두 경로를 유지하면 어느 경로로 도착한 이벤트인지에 따라 권위 판단이 갈리고, 그 조합을 테스트할 수 없다. 대신 **재연결 예산을 명확히** 두는 쪽을 선택했다.

`RoomRealtimeSocket`의 재연결 정책:

| 항목 | 값 | 이유 |
| --- | --- | --- |
| 절대 예산 | `DEFAULT_RECONNECT_BUDGET_MS = 8000` | 백엔드의 10초 disconnect grace보다 먼저 끝나야 `PEER_RECONNECTED`로 등록된다 |
| 재시도 간격 | `[0, 300, 600, 1000, 1500, 2000, 2500]ms` | |
| 시도마다 | 새 ticket 발급 | 1회용이므로 재사용 불가 |
| 401/403 | 즉시 중단 | 신원이 거부된 것이므로 재시도는 ticket만 낭비한다 |

관련 테스트: `"requires a new ticket for a signaling reconnect"`, `"does not retry a rejected identity or one-time ticket"`, `"stops transient retries at the absolute reconnect deadline"`.

### 실패 1 — 낙관적 로컬 spawn이 글자를 두 개 만들었다

#### 문제

공유 목표는 **단일 경쟁 자원**이다. 처음에는 각 브라우저가 자기 인식 결과로 즉시 블록을 생성했다. 로컬 반응성이 가장 좋은 방식이기 때문이다.

증상: 두 사람이 거의 동시에 인식하면 글자가 두 개 생기거나, 두 보드의 상태가 어긋났다.

#### 원인 재정의

각 브라우저는 자기 인식 시각만 알고 상대의 인식 시각은 모른다. 로컬 인식 결과는 서로 다른 시점에 도착하므로 **어느 브라우저도 독자적으로 "내가 이겼다"를 판단할 수 없다.** 이것은 지연을 줄여서 해결할 문제가 아니고, 판정 주체가 없다는 구조 문제였다.

#### 조치 — 브라우저 호스트 권위

방장 브라우저가 권위 서버 역할을 한다. 게스트는 커맨드를 보내고 호스트가 검증해 이벤트를 발행한다.

```
게스트 → CLAIM_SHARED_TARGET (COMMAND)
호스트   첫 유효 claim만 승인
호스트 → SHARED_TARGET_CLAIMED (EVENT, 양쪽)
호스트 → SPAWN_LETTER (EVENT, 승자 보드만)
```

- 공유 목표 모드에서는 **로컬 낙관적 spawn을 비활성화**한다
- 다음 목표는 claim이 해소된 뒤에만 발행한다(`NEXT_TARGET_DELAY_MS = 1150`, `CLAIM_EFFECT_DURATION_MS`와 동일). 목표 세대가 겹치면 어느 목표에 대한 claim인지 모호해진다
- 중복 커맨드는 `MAX_PROCESSED_COMMANDS = 256` LRU로 멱등 처리한다

근거: `block-stacking/battle/transport/P2pBattleTransport.ts`. 커맨드 11종 / 이벤트 20종의 목록은 `battleTransportTypes.ts`에 있다.

테스트: `"shares one target and drops it only for the first player who claims it"`, `"claims the shared target without spawning optimistically"`, `"waits for the shared claim effect before spawning the winner letter"`, `"removes only after server acceptance and uses official score"`.

#### 부작용과 그 처리

권위 판정으로 옮기자 **정답자가 아닌 브라우저에서는 아무 피드백이 없었다.** 상대가 가져갔다는 사실을 알 수 없었다.

연출과 상태를 분리해 해결했다. 양쪽이 같은 권위 claim 이벤트를 렌더링하고(공유 종이의 black-hole 연출), 실제 spawn만 승자 보드에 지연 적용한다. 화면에는 "누가 먼저 가져갔다"가 양쪽에 보이고 게임 상태는 권위만 바꾼다.

#### 왜 이 방식이 가벼운가

영상이나 두 번째 물리 시뮬레이션을 스트리밍하지 않는다. target/claim/spawn 이벤트 스트림만 교환하고 각 보드는 로컬에서 렌더한다. 권위 spawn 명령만 게임 상태를 결정한다.

### 두 보드 동기화 — 무엇을 보내고 무엇을 보내지 않는가

#### 설정값

`block-stacking/battle/sync/InterpolationConfig.ts`의 `DEFAULT_BATTLE_SYNC_CONFIG`:

| 항목 | 값 | 판단 근거 |
| --- | --- | --- |
| `transformPublishIntervalMs` | `1000/30` (30Hz) | 이동 중인 바디만 전송 |
| `interpolationDelayMs` | 140 | 이 시점을 렌더 타깃으로 두 샘플 사이를 보간 |
| `maxExtrapolationMs` | 70 | 패킷 지연 시 마지막 FALLING 변환을 등속 예측. 그 이상은 권위와 멀어져 금지 |
| `snapshotPublishIntervalMs` | 5000 | 정착·제거·구조 변경 시에는 즉시 전송 |
| `snapDistanceThreshold` | 2 | 넘으면 보간 대신 순간이동 |
| `snapAngleThreshold` | `Math.PI` | |
| `maxBufferedSnapshots` | 6 | 초과 시 앞에서 잘라낸다 |
| `maxWebSocketBufferedAmount` | 12000 | `bufferedAmount` 초과 시 그 프레임 전송을 건너뛴다(백프레셔) |

#### 정착 바디만 권위로 고정한 이유

`MatterPhysicsWorld.synchronizeSettledLetter()`는 **정착한 바디에만** 원격 권위 좌표를 적용한다. 이동 중인 바디는 로컬 시뮬레이션을 유지한다.

이동 중 바디까지 권위 좌표로 덮으면 네트워크 지터가 낙하 애니메이션 지터로 그대로 보인다. 30Hz 전송과 60Hz 렌더 사이의 불일치가 눈에 보이는 떨림이 된다. 반대로 정착 바디를 로컬 시뮬레이션에 맡기면 두 브라우저의 최종 더미 모양이 서로 달라진다. 그래서 **낙하 중에는 로컬 부드러움, 정착 후에는 권위 일치**로 나눴다.

#### 해상도 독립

좌표를 `x/width`, `y/height`로 정규화해 전송하고 `[-0.25, 1.25]`로 클램프한다(`BoardSnapshotSerializer.ts`). 두 사람의 창 크기가 달라도 같은 위치가 된다. 클램프 범위를 1을 넘겨 잡은 것은 보드 위쪽에서 생성되는 블록(`spawnY = -70`)을 표현해야 하기 때문이다.

#### 각도 보간의 경계 문제

각도를 단순 선형 보간하면 `+π`에서 `-π`로 넘어갈 때 블록이 한 바퀴 돈다. `atan2(sin, cos)`로 최단 경로를 구한다. 테스트 `"interpolates the shortest angle"`.

#### 무결성 검사 — 체크섬

보드 상태를 id 정렬 후 `id|symbol|round(x*100000)|...|state`로 직렬화해 **FNV-1a 32bit** 해시를 만든다(`BoardStateChecksum.ts`, `0x811c9dc5` 초기값, `Math.imul(hash, 0x01000193)`). 스냅샷과 함께 보내고 수신 측에서 재계산해 비교한다. 불일치하면 스냅샷을 폐기하고 무결성 실패를 기록한다.

좌표를 양자화한 이유는 JSON 직렬화 포맷 차이(부동소수 표기)로 인한 오탐을 막기 위한 것이다. 정렬을 넣은 이유는 배열 순서가 달라도 같은 상태여야 하기 때문이고, 이건 테스트 `"is independent of body array order"`로 고정했다.

#### 늦게 온 패킷이 죽은 블록을 부활시키는 문제

제거된 블록에 대한 변환 패킷이 뒤늦게 도착하면 사라진 블록이 다시 나타났다. 제거 이력(툼스톤)을 유지해 무시하도록 했는데, 이력이 게임 종료까지 무한 증가해 장시간 플레이에서 메모리와 순회 비용을 키웠다.

`MAX_REMOVED_HISTORY = 128`로 상한을 뒀다. 테스트 두 개가 양쪽을 고정한다 — `"ignores transforms after removal"`(기능)과 `"bounds removed-letter tombstones"`(상한).

#### 시계 오프셋

두 브라우저의 `Date.now()`는 일치하지 않는다. 첫 패킷의 `receivedAt - sentAt`을 송신자 시계 오프셋으로 **고정**하고, 이후 모든 `sentAt`을 `sentAt + offset`으로 로컬 타임라인에 매핑한다(`RemoteBoardReplica.toLocalTimeline()`). 매 패킷마다 오프셋을 재계산하면 오프셋 자체가 지터가 되어 보간이 흔들린다.

### 실패 2 — 복구 스냅샷이 살아 있던 플레이어의 보드를 되감았다

#### 문제

한쪽이 새로고침하면 다음이 동시에 일어났다.

- 새로고침한 쪽: 모든 연결 상태가 DISCONNECTED, 보드가 빈 상태
- **반대쪽**: 이미 떨어진 블록·공유 목표·낙하가 사라지거나 처음 카운트다운으로 되돌아감
- 나가기 시 `POST /api/game-rooms/{roomId}/leave`가 403
- 게임판이 흰색 WebGL 캔버스로 공유 배경을 덮음

증상이 네 개였지만 원인은 서로 달랐다.

#### 원인 5개

1. **RTC 일시 단절이 물리 보드를 파괴했다.** 단절이 `mediaReady=false`로 전파되면 `BattleGamePage`의 controller effect cleanup이 실행되어 로컬 물리 보드가 dispose됐다. React effect 의존성이 게임 수명과 미디어 수명을 묶고 있었다.
2. **provider가 인증보다 먼저 mount됐다.** 저장된 방 세션을 초기화 시점에 읽지 못해 play route가 재입장 정보를 잃었다.
3. **stale leave 403은 정상 동작이었다.** 서버가 새로고침으로 참가자를 이미 제거한 뒤 브라우저가 다시 leave를 호출하면 403이 나는 게 맞다.
4. **Pixi 캔버스가 불투명 배경을 유지했다.** 일부 WebGL 드라이버에서 투명 클리어 버퍼가 흰색으로 표시됐다.
5. **복구 스냅샷을 양쪽에 무조건 적용했다.** 이게 가장 컸다. 재접속 스냅샷은 P2P 채널로 브로드캐스트되므로 살아 있던 플레이어도 받는다. 그걸 적용하면 진행 중인 Matter 보드가 과거 상태로 되감긴다. 반대로 재접속한 쪽이 자기 스냅샷을 받기 전에 물리를 재시작하면 빈 보드나 새 카운트다운으로 보인다.

#### 조치

| 문제 | 조치 | 커밋 |
| --- | --- | --- |
| 흰 배경 | board WebGL canvas가 공유 scenery를 덮지 않도록 처리 | `a815e23` |
| 카운트다운 재시작 | `MATCH_STARTED.resume` 플래그로 재접속과 신규 매치 구분, board/player 스냅샷 복원 | `53ef953` |
| 보드 dispose | 최초 RTC 성공 뒤 `mediaReady`를 latch해 controller 유지 | `c8c9090` |
| 세션 유실 | userId별 sessionStorage + localStorage 저장, auth hydrate 후 재읽기 | `c8c9090` |
| stale leave 403 | 세션 없는 play route는 remote leave 생략, 이미 종료된 응답에도 로컬 정리 계속 | `c8c9090` |
| 살아 있는 보드 덮어쓰기 | `BoardSnapshotEvent.restoreForPlayerId`로 요청한 플레이어만 적용 | 확인 필요 |
| 복귀 중 빈 보드 미전송 | 빈 보드도 `BOARD_SNAPSHOT`으로 전송, 양쪽 payload 동봉 | 확인 필요 |
| 복귀 시 낙하 위치 불일치 | 스냅샷 뒤 `RECONNECT_SNAPSHOT_SETTLE_MS = 240` 창에서 남은 peer의 `PEER_BOARD_VIEW` 최신 위치 적용 | 확인 필요 |
| 단순 RTC 재연결에 새 매치 시작 | transport의 `hasConnected`로 최초 연결과 재연결 구분 | 확인 필요 |
| 복귀 후 로컬 낙하 미전달 | `BattleController`가 `LocalBoardPublisher`를 새 runtime에 재부착 | 확인 필요 |

> 커밋 SHA가 `확인 필요`인 항목은 조치 내용은 코드로 확인했으나 대응 커밋을 특정하지 못했다.

#### 핵심 불변식

여기서 얻은 규칙이 하나 있다. **자기 보드의 권위 스냅샷이 도착하기 전까지 `PLAYING`으로 가지 않는다.** `BattleController`의 `awaitingResumeOwnBoard` 플래그가 이걸 강제한다. 그러지 않으면 재접속한 쪽이 빈 보드로 게임을 시작한다.

이 불변식을 테스트 4개로 고정했다.

- `"restores a running match only after its own authoritative board arrives"`
- `"does not rewind the player who stayed connected with another player's recovery snapshots"`
- `"waits for the reconnecting player's own field when the opponent field arrives first"`
- `"restores the current shared target atomically with a running match"`

마지막 것도 별도의 실패에서 나왔다. 재접속 스냅샷에 공유 목표를 함께 담지 않으면, 복귀한 플레이어가 현재 종이 위 글자를 모르는 상태로 게임에 들어간다. 매치 상태와 공유 목표를 **원자적으로** 함께 보내야 했다.

#### 호스트 새로고침

호스트가 새로고침하면 권위 자체가 사라진다. `P2pBattleTransport`가 권위 상태를 localStorage에 직렬화한다(`AUTHORITY_STORAGE_PREFIX = "sudal:block-battle:authority:"`). 저장 필드는 sequence, spawnIndex, targetIndex, symbolBag, sharedTarget, players, playerProfiles, letters, boards, boardUpdatedAt이고 `restoreAuthority()`로 복원한다.

`symbolBag`까지 저장하는 이유는 출제 순서의 연속성이다. 복원 후 백을 새로 만들면 이미 나온 글자가 즉시 반복될 수 있다.

### 실패 3 — 자동 몰수패가 양쪽을 승자로 만들 수 있었다

#### 시도한 방식

상대 DataChannel이나 PeerConnection이 끊기면 남은 사람을 승자로 처리하는 방식. 구현이 단순하고 즉각적이다.

#### 왜 폐기했는가

**네트워크 분할 시 양쪽이 모두 자신을 생존자로 판단한다.** A와 B 사이 경로만 끊기고 두 브라우저가 모두 살아 있으면, 각자 "상대가 끊겼다"를 관측하고 각자 승리를 서버에 보고한다. 서버는 먼저 온 요청을 저장하고 두 번째를 409로 거절하므로, 결과가 **네트워크 순서에 따라 결정된다.** 게임 규칙이 아니라 경합으로 승자가 정해지는 구조다.

이건 지연이나 재시도로 보완할 수 있는 문제가 아니다. 분할 상황에서 두 노드가 각자 관측만으로 배타적 결론에 도달하는 것이 원리적으로 불가능하기 때문이다.

#### 채택한 방식 — 보수적 유예

| 상황 | 처리 |
| --- | --- |
| 상대 단절 직후 | 현재 보드를 유지하고 10초 재접속 유예 시작(`PeerDisconnectForfeit`의 `graceMs = 10000`) |
| 유예 안에 스냅샷/resume 도착 | timeout 취소하고 계속 진행 |
| 유예 만료 | 남은 참가자가 `RECONNECT_TIMEOUT` 사유의 승자, 보드 정지 |
| 명시적 나가기 | 기존 forfeit/leave로 즉시 방 종료, 남은 참가자 승리 |
| 그 외 | **판정하지 않는다** |

그리고 **10초 이후 자동 몰수패를 아예 활성화하지 않았다.** 서버가 인증된 `PEER_DISCONNECTED`/`PEER_RECONNECTED`를 권위 근거로 제공하는 정책이 확정되기 전까지 보류한다고 코드 주석과 문서에 남겼다.

`PeerDisconnectForfeit`의 주석에 "룸 WebSocket은 이 판단에 쓰지 않는다"고 명시했다. presence 이벤트를 근거로 쓰면 서버 관측과 P2P 관측이 섞여 어느 쪽이 권위인지 모호해진다.

관련 테스트:

- `"does not invent a winner from an ambiguous local transport drop"` — 모호한 끊김에서 승자를 만들지 않는다
- `"awards the remaining player after an identified opponent disconnect exceeds grace"` — 식별된 단절 + 유예 초과에서만 판정한다
- `"keeps the match running when the opponent reconnects within grace"`
- `"cancels the leave timeout when the same match resumes"`

#### 방장 영구 이탈에도 권위를 이전하지 않는다

남은 참가자에게 host authority를 넘기면 그 브라우저가 독자적으로 다음 공유 목표를 생성한다. 원래 방장이 돌아오면 두 권위가 서로 다른 목표를 발행하는 split-brain이 된다. 서버 판정은 "방장 혼자면 방 삭제, 2명이면 남은 참가자에게 방장 위임"인데, **프런트가 이걸 선행 추측하지 않고** 서버 응답과 SSE를 권위 상태로 사용하도록 했다.

### 실패 4 — 방 생명주기의 경합

#### 뒤로가기 후 "재입장", 새 방 생성 시 "이미 참여 중인 방"

실제 경쟁 순서를 추적해보니 이랬다.

1. 대기실 mount의 멱등 `join`이 진행 중
2. 사용자가 뒤로가기를 눌러 `leave` 시작
3. 늦게 완료된 `join` 응답이 로컬 세션을 **다시 기록**하거나, `leave` 완료 전에 `create`가 전송됨

증상은 "재입장 화면이 뜬다"였지만 원인은 요청 순서가 보장되지 않은 것이었다.

#### 조치

- **gateway의 create/join/leave를 단일 Promise 큐로 직렬화**했다(`SwaggerBattleRoomGateway`의 `membershipMutation` 체인, `enqueueMembershipMutation`)
- 대기실 leave는 `leavePromiseRef`로 한 번만 실행한다
- leave 시작 플래그가 켜진 뒤 도착한 join 응답은 무시한다
- 퇴장 중에는 `rememberRoom`을 차단해 늦게 온 join·주기 확인·SSE 응답이 세션을 다시 기록하지 못하게 한다
- 화면 이동 전에 로컬 세션을 먼저 비우고, 원격 leave 완료 뒤 다시 비운다. 원격 오류가 나도 사용자가 나가기로 결정한 세션은 복원하지 않는다
- `popstate`와 버튼 퇴장이 **동일한 cleanup 함수**를 쓴다

#### 저장된 세션을 신뢰하지 않는다

새 방을 만들 때 저장된 세션만 보고 생성을 막지 않는다. 저장된 `roomCode`로 멱등 `join`을 먼저 호출해 서버 상태를 확인하고,

- `401/403/404/410` → stale 세션 폐기 후 **같은 제출에서** 방 생성 계속
- 정상 응답 → "이미 참여 중인 방" 안내
- 네트워크 오류나 `5xx` → 방이 없다고 추측하지 않고 생성도 중단 (중복 방 생성 방지)

재입장 재시도 백오프는 `REJOIN_DELAYS_MS = [0, 350, 700, 1200, 1700, 2200, 2700]`이고, 409/5xx/네트워크 오류만 재시도한다. `isMissingOrForbiddenRoom()`(401/403/404/410)은 즉시 종료한다(`BattleRoomRecovery.ts`).

#### 새로고침 감지를 추측하지 않는다

"세션이 있는데 페이지가 새로 로드됨 = 새로고침"으로 추론하면 첫 진입과 구분되지 않는다. Navigation Timing API로 직접 판정한다.

```ts
performance.getEntriesByType("navigation")[0].type === "reload"
```

마커는 sessionStorage 키 `"sudal:battle-refresh-exit"`에 두고 `BATTLE_REFRESH_MARKER_MAX_AGE_MS = 30000`으로 만료시킨다(`BattleRefreshExit.ts`). 오래된 마커가 다음 세션에 영향을 주지 않게 하기 위한 것이다.

#### 퇴장 순서 보장

`BattleExitCoordinator`가 순서를 고정한다.

```
roomGateway.leaveRoom() → mediaSession.disconnect() → cameraSession.stop() → clearRoomSession() → navigate()
```

순서가 중요하다. 카메라를 먼저 끄면 WebRTC sender가 죽은 track을 참조하고, 세션을 먼저 지우면 leave 요청이 방 정보를 잃는다. 원격 leave 실패는 warn만 남기고 로컬 정리는 끝까지 수행한다. `shouldLeaveRemotely()`로 하드 리프레시 후의 stale leave를 건너뛴다.

#### 한 사용자가 두 탭에서 호스트가 되는 문제

방 세션을 sessionStorage와 localStorage에 **동시 기록**하고 `window`의 `storage` 이벤트를 구독한다(`app/GameServiceProvider.tsx`, 키 `"sudal:block-battle:room:" + userId`). 한 탭에서 방에 들어가면 다른 탭이 알 수 있다. sessionStorage만 쓰면 탭 간 공유가 안 되고, localStorage만 쓰면 탭을 닫아도 남는다.

### React 생명주기와의 충돌

실시간 자원(소켓, PeerConnection, 카메라)을 React effect로 관리하면서 겪은 문제 세 개.

#### StrictMode의 setup → cleanup → setup

개발 모드에서 React가 effect를 두 번 실행한다. 첫 setup의 비동기 connect가 늦게 완료되며 두 번째 setup이 만든 새 연결을 덮어썼다.

`connectionGeneration` / `connectionAttempt` 세대 카운터로 해결했다. 비동기 작업이 완료될 때 자기 세대가 현재 세대인지 확인하고, 아니면 결과를 버리고 자원을 즉시 닫는다. 같은 패턴을 `SharedGameCameraSession`, `RoomRealtimeSocket`, `WebRtcDataChannelTransport`에 모두 적용했다.

#### 프로브에서 실제 dispose를 하면 안 된다

Provider의 싱글턴 자원(카메라 세션, mesh 세션, transport)을 StrictMode 프로브에서 진짜로 닫으면 두 번째 setup이 이미 닫힌 자원을 받는다. `cleanupGenerationRef` + `queueMicrotask`로 dispose를 한 틱 미뤄, 같은 틱에 재설정이 오면 실제로 닫지 않게 했다.

#### Fast Refresh

`ActivePlayerSession`에 `reactivate()`를 둬서 Fast Refresh로 모듈이 교체돼도 등록된 사용자 세션을 잃지 않게 했다.

> 이 세 항목은 실시간 코드를 React에 붙일 때의 비용이다. 게임 루프를 React 밖의 클래스로 두고 effect는 **연결과 정리만** 담당하게 분리한 것이 근본 대응이었다.

### 검증 방법

#### 시간을 기다리지 않는 테스트

10초 유예, 240ms 정착 창, 8초 재연결 예산을 실제로 기다리면 테스트가 느리고 불안정해진다. 설계 단계에서 다음을 전부 주입 가능하게 만들었다.

`now`, `setTimer` / `clearTimer`, `requestFrame` / `cancelFrame`, `createId` / `createEventId`, `createWebSocket`, `createEventSource`, `getUserMedia`, `wait`, `fetcher`

덕분에 유예 만료, 패킷 지연, 시퀀스 역행, 세션 회전을 **결정적으로** 검증한다.

#### 테스트 규모

| 파일 | 케이스 수 | 검증 대상 |
| --- | ---: | --- |
| `BattleController.test.ts` | 37 | 권위 판정, 재접속 복구, 승패, 콤보, 망치 공격 |
| `MeshWebRtcMediaSession.test.ts` | 16 | peer 상한, offer 결정성, ICE 버퍼, 공유 track 소유권 |
| `P2pBattleTransport.test.ts` | 11 | 목표 claim 경합, 재접속 복구, 3연속 공격, 결과 ACK |
| `RemoteTransformBuffer.test.ts` | 8 | 보간·외삽·상한 |
| `RoomRealtimeSocket.test.ts` | 7 | ticket 정책, 재연결 예산 |

게임 모듈 전체 테스트 파일은 141개다(비테스트 소스 373개, 약 1:2.6).

#### 로컬 2인 실사용 검증 도구

브라우저 두 개로 실제 P2P를 검증할 수단이 필요했다. `scripts/p2p-e2e-relay.mjs`로 REST/SSE/ticket/native WebSocket 시그널링 계약을 로컬에서 재현하는 릴레이를 만들었다. 운영 백엔드 대체물이 아니라 검증 도구다.

- 카메라 권한 제약을 피하려고 `VITE_P2P_E2E=true`일 때만 합성 video track(canvas 640×360 `captureStream(5)`)을 주입한다
- RTCPeerConnection과 DataChannel은 실제 브라우저 구현을 그대로 쓴다

### 최종 구조

```
BattleGamePage (React)
  │
  ├─ BattleController ── BattleStateMachine (8상태, 전이 화이트리스트)
  │    │                  IDLE → CONNECTING → WAITING_START → COUNTDOWN
  │    │                  → PLAYING ⇄ RECONNECTING → FINISHED / ERROR
  │    │
  │    ├─ BattleLocalBoardRuntime  ── MatterPhysicsWorld (60Hz 고정 스텝, 최대 4스텝 캐치업)
  │    │                              정착 시 100ms(10Hz)로 다운시프트
  │    │                              DANGER_CONFIRMATION_MS 1200
  │    │
  │    ├─ LocalBoardPublisher  ─30Hz→ ┐
  │    ├─ RemoteBoardReplica   ←──────┤ P2pBattleTransport (호스트 권위)
  │    └─ RemoteTransformBuffer       │   커맨드 11종 / 이벤트 20종
  │         140ms 지연 보간            │   localStorage 권위 직렬화
  │         70ms 외삽                  │
  │                                   └─ WebRtcDataChannelTransport (GAME_P2P_V1)
  │
  ├─ BattleExitCoordinator (퇴장 순서 보장)
  ├─ BattleRoomRecovery (재입장 백오프)
  └─ BattleRefreshExit (Navigation Timing 기반 새로고침 판정)

MeshBattleMediaSession ── RoomRealtimeSocket (ticket, SIGNAL 전용)
                       └─ SharedGameCameraSession (track 단일 소유)
```

#### 상태 머신을 클래스로 분리한 이유

`BattleStateMachine`은 정의되지 않은 전이에서 예외를 던진다. 실시간 코드에서 가장 비싼 버그가 "어떻게 이 상태에 왔는지 모르는 상태"이기 때문이다. `FINISHED → IDLE | COUNTDOWN | PLAYING`만 허용해 재대결 경로를 명시하고, 그 외의 우회 진입은 테스트에서 터진다.

### 이 장의 판단 — 서버 없이 실시간을 만들며 배운 것

인과관계로 정리하면 이렇다.

1. **백엔드가 게임을 중계하지 않는 제약**을 우회 대상이 아니라 설계 입력으로 받았다 → 브라우저 호스트 권위 구조가 나왔다. 남을 기다리지 않고 게임을 완성할 수 있었다.

2. **낙관적 로컬 판정은 경쟁 자원에서 성립하지 않는다.** 지연을 줄여 해결할 문제가 아니라 판정 주체가 없는 구조 문제였다. → claim 중재로 재설계하고, 잃어버린 반응성은 *연출과 상태를 분리*해 회복했다.

3. **브로드캐스트 채널에서 복구 스냅샷은 수신자를 한정해야 한다.** P2P는 대상 지정이 없으므로 페이로드에 `restoreForPlayerId`를 넣어 적용 대상을 명시해야 했다. → "자기 권위 보드가 오기 전까지 PLAYING으로 가지 않는다"는 불변식으로 정리했다.

4. **분할 상황에서 두 노드가 관측만으로 배타적 결론에 도달할 수 없다.** 자동 몰수패를 구현하는 대신 **기능을 보류했다.** 이 프로젝트에서 가장 의식적으로 내린 판단이다. 구현할 수 있는 것과 구현해야 하는 것이 다르다.

5. **비동기 요청은 순서를 보장하지 않으면 상태를 되살린다.** create/join/leave 직렬화, 세대 카운터, 퇴장 중 기록 차단이 모두 같은 문제의 다른 얼굴이었다.

6. **애매할 때 조용히 추측하지 않게 만들었다.** 체크섬이 어긋나면 스냅샷을 폐기하고, 모호한 끊김에서는 승자를 만들지 않고, 5xx에서는 방이 없다고 추측하지 않는다. 실시간 시스템에서 잘못된 값을 통과시키는 비용이 한 프레임을 놓치는 비용보다 훨씬 크다.

---

## 7. 품질과 테스트

**테스트 141개 파일** (비테스트 소스 373개 대비 약 1:2.6). 실시간·비동기 코드를 테스트 가능하게 만들기 위해 설계 단계에서 의존성을 전부 주입 가능하게 했다 — `now`, `setTimer`/`clearTimer`, `requestFrame`/`cancelFrame`, `createId`, `createWebSocket`, `createEventSource`, `getUserMedia`, `fetcher`. 그래서 **실제 시간을 기다리지 않고** 10초 재접속 유예나 900ms 정착 판정을 검증할 수 있다.

계층별로 나눴다.

| 계층 | 예시 | 검증 내용 |
| --- | --- | --- |
| 도메인 단위 | `MatterPhysicsWorld.test.ts` (14 케이스) | 늦은 프레임 분할, 바닥 접촉 후 튀어오르지 않음, 리사이즈 시 정착 블록 정렬 유지, 하단 제거 시 상단 낙하, 합성모음 빈 공간 배제 |
| | `ContinuousSignDecoder.test.ts` (12) | 같은 포즈 유지 시 연타 방지, 손을 떼지 않고 다른 글자로 전환, A-B-C 빠른 연속 입력, 지터 예측은 확정하지 않음 |
| | `RemoteTransformBuffer.test.ts` (8) | 최단 각도 보간, 패킷 지연 시 짧은 외삽, 제거 후 변환 무시, 버퍼·툼스톤 상한 |
| 어댑터·파서 | `RoomRealtimeSocket.test.ts` (7) | 새 ticket으로만 연결, `SIGNAL`만 송신, 거부된 ticket은 재시도하지 않음, 핸드셰이크 성공 후 stale 에러 미보고 |
| | `MeshWebRtcMediaSession.test.ts` (16) | peer 3개 상한, offer 결정성, 버퍼된 ICE 적용, mesh 종료 시 공유 track 미정지 |
| 권위 로직 | `BattleController.test.ts` (35, 최대) | 서버 `startAt` 기준 시작, 자기 권위 보드 도착 후에만 복구, 모호한 전송 끊김에서 승자를 만들지 않음, 유예 초과 시 남은 사람 승리 |
| | `P2pBattleTransport.test.ts` (11) | 목표를 먼저 claim한 한 명에게만 낙하, 재접속 플레이어 복구, 3연속 성공 시 상대 블록 이전 |
| 통합 | `BattleBotPracticeRuntime.integration.test.ts` | 물리 + 렌더 + 전송 + 컨트롤러 전 계층을 브라우저 런타임에서 |
| | `LocalBotPracticeReadiness.integration.test.ts` | 시드 100회로 제외 심볼이 절대 등장하지 않음 |
| React | `HandCamera.sharedStream.test.tsx` 등 19개 | 카메라 단일 소유와 정리 |

테스트를 "커버리지 채우기"가 아니라 **한 번 겪은 버그를 다시 겪지 않기 위한 장치**로 썼다. 위 케이스 이름 대부분이 실제로 실사용에서 발견한 증상이다.

---

## 8. 협업

### 팀 구성과 경계

6인 팀에서 역할별로 통합 브랜치를 나눴다.

| 브랜치 | 담당 | 내용 |
| --- | --- | --- |
| `frontend` | 3인 (본인 포함) | 게임 / 학습·사전·오답노트 / 홈·프로필·UI |
| `backend` | 1인 | Spring, REST·SSE·WebSocket, 랭킹 |
| `ai` | 2인 | 지문자·단어 인식 모델, 추론 서버 |
| `infra` | 1인 | EC2, Nginx HTTPS, coturn(TURN), GitLab CI/CD, Docker |

작업 브랜치는 `feature/<Jira 이슈키>-<설명>` 규칙을 썼다(`feature/FE-873-detail-card-shared-layout`, `feature/Infra-587-coturn-server`, `feature/AI-006-image-preprocessing`). Jira는 에픽 → 스토리 → 작업 계층으로 도메인 접두어(`GAME-`, `FE-`, `AI-`, `Infra-`, `TEST-`, `USER-`)를 붙여 관리했다. 게임 파트는 `GAME-01`부터 `GAME-10`까지 10개 에픽으로 나눴다 — 진입·공통 실행 환경, 블록 싱글, 블록 1:1, 참가자 영상, 턴 배틀, 인식 안정성, UX·밸런스, 실제 환경 통합 검증, 협동, 배포·최종 검수.

### 같은 저장소를 쓰면서 충돌을 줄인 방법

프론트 3인이 한 저장소를 쓰는 게 가장 큰 리스크였다. 병합 단위를 먼저 문서로 합의했다.

- 게임 전용 영역: `frontend/src/game/`, `public/guides/`, `public/mediapipe/`, `scripts/setup-mediapipe-assets.mjs`
- 공유 파일(PR에서 별도 확인): `package.json`, lockfile, `App.tsx`, `main.tsx`, `styles.css`, `vite.config.ts`, `tsconfig*.json`

브라우저 라우터는 `main.tsx`가 한 번만 생성하고, `App.tsx`는 `/game/*` 한 지점에서 `GameModule`을 마운트한다. 게임 내부 라우팅은 `GameModuleRoutes`가 상대 경로만 소유해서, 다른 사람이 홈·학습·프로필 라우트를 추가해도 게임 화면 파일과 충돌하지 않는다. 개발·테스트 환경에서도 중첩 라우터를 만들지 않고 호스트 라우터를 주입하는 규칙을 지켰다.

### 백엔드와의 계약 협의

**"백엔드 소스는 수정하지 않는다"를 전제로 두고 프런트에서 흡수했다.** 백엔드 담당이 1명이고 다른 도메인 작업이 많았기 때문에, 게임이 백엔드 변경을 기다리면 양쪽이 다 막힌다.

- 배포 Swagger를 직접 읽고 계약 경계를 문서로 고정했다. 결과 body가 `{winnerUserId}`로 바뀐 것도 이 확인 과정에서 발견해, 배포 전에 프런트를 맞췄다.
- SSE에 Bearer 헤더를 붙일 수 없다는 브라우저 제약(`EventSource`)을 확인하고 1회용 ticket query 방식으로 정리했다.
- 인가되지 않은 `POST /game/solo/sessions`가 401을 반환하는 문제는 백엔드 계약을 요구하는 대신, 로컬 저장으로 플레이를 계속 가능하게 만들고 `VITE_ENABLE_REMOTE_SOLO_GAME_API` 플래그로 나중에 전환할 수 있게 남겼다.
- 반대로 **프런트가 임의로 결정하면 안 되는 것은 명시적으로 요청했다.** 방 제목·방장 닉네임·출제 범위는 브라우저 저장으로 보완하되 "다른 사용자에게 공유되는 권위 데이터가 아니다"라고 문서에 못 박고, create/response/SSE 계약 확장을 백엔드 과제로 남겼다. 10초 이후 자동 몰수패도 서버가 인증된 `PEER_DISCONNECTED`를 제공하기 전까지 활성화하지 않았다.

### AI 팀과의 계약

`ai/contracts/`를 프런트와 AI가 공유하는 계약 폴더로 썼다. 현재 이 폴더에 실제로 있는 파일은 `recognition/readiness.json` 하나다. AI가 평가 결과를 채우고 프런트가 출제 범위와 심볼별 임계값으로 읽는다.

밸런스 값도 같은 방식으로 계약화하려 했으나 끝까지 가지 못했다. `glyph-battle/core/LineRaceBalance.ts`의 주석은 `ai/contracts/balance/line-race-obstacles.json`의 타입 미러라고 명시하지만 **그 JSON은 저장소에 없다.** drift 테스트(`LineRaceBalance.test.ts`)도 JSON을 import하지 않고 프런트 상수끼리만 비교한다. 계약 파일 없이 주석만 남은 상태이므로, 밸런스는 readiness처럼 단일 원천이 확보되지 않았다.

역할 분담을 이렇게 정리했다: **AI는 prediction과 후보만, 게임 입력 확정은 프런트.** 초기에는 서버가 cooldown으로 연타를 막는 방식을 논의했지만, 인식률 문제를 서버 지연으로 숨기는 구조가 되고 게임 반응성도 나빠져서 경계를 옮겼다. 대신 프런트는 모델에 없는 글자를 만들어내지 않고, 개인정보 경계(랜드마크만 전송, 영상·외형 descriptor·얼굴 정보 미전송)를 문서로 고정했다.

### 인프라 팀과의 협업

WebRTC는 프런트만으로 완성되지 않는다. 필요한 조건을 목록으로 만들어 전달했다 — Nginx의 `/api/` 프록시와 WebSocket `Upgrade` 헤더, SSE 버퍼링 비활성화(`X-Accel-Buffering: no`), coturn의 TCP/UDP 3478·5349와 UDP 49160-49200 포트, TLS/WSS mixed content 없음, CORS 허용 목록에 Vercel Origin 등록(끝의 `/` 없이, `*` 금지). 서로 다른 네트워크의 두 브라우저에서 TURN relay candidate로 연결되는지를 공동 검증 항목으로 뒀다.

### 문서화

작업 기록을 코드와 같은 저장소에 뒀다. 마지막에는 날짜별로 늘어난 트러블슈팅 문서 7개와 인수인계 스냅샷 여러 개를 정리해서, 기준 문서 3개(제품 명세 / 1:1 현재 동작 / 백엔드 계약)와 통합 트러블슈팅 1개, 기술 참조 14개, 문서 색인 1개로 재구성했다. 배포 문서 2개가 서로 다른 빌드 설정을 말하고 있던 것도 하나로 합쳤다.

문서에서 지킨 원칙은 **"내가 잘못 판단한 부분"을 같이 적는 것**이었다. 예를 들어 AI 응답 나이를 캡처 시각부터 계산한 실수, 캐시를 주기적으로 비우려다 되돌린 판단, 라인레이스 전제로 만든 기능이 턴 배틀과 맞지 않았던 기록을 남겼다. 원인만 적힌 문서보다 "이 접근은 실패했다"가 적힌 문서가 다음 사람의 시간을 더 아낀다고 봤다.

---

## 9. 검증하지 않은 것과 남은 과제

각 장에서 측정하지 않은 항목을 모았다. 이 문서의 설정값들은 **왜 그 방향인가에 대한 근거는 있으나 그 값이 최적인가에 대한 근거는 없다.**

### 물리·렌더

| 항목 | 상태 |
| --- | --- |
| 래스터 생성 시간 (글자당) | 미측정 |
| compound body 파트 수와 충돌 계산 비용의 관계 | 미측정 (`MAX_RASTER_COLLIDER_PARTS = 48`은 경험적 상한) |
| 물리 상수(중력·반발·마찰)의 최적성 | 미측정 (체감 기준) |
| `COLLISION_ALPHA_THRESHOLD = 0.025`의 유도 근거 | 확인 필요 (기록 없음) |
| DOM 글자 vs Pixi 글자의 실제 프레임 차이 | 미측정 (문제 해결 여부만 확인) |
| 40개 글자별 콜라이더 파트 수 분포 | 미측정 (감사 도구로 개별 확인만) |

물리 상수는 플레이 체감으로 정했다. 콜라이더에는 감사 도구가 있지만 물리 상수용 튜닝 도구는 만들지 않아서, 다른 사람이 재조정하려면 처음부터 감을 잡아야 한다.

### 인식

| 항목 | 상태 |
| --- | --- |
| 프로필별 Hand/Pose/AI 실제 p95 지연 | 미측정 (계측기는 있으나 기록 미저장) |
| 확정 지연(자세 완성 → SIGN_CONFIRMED) 분포 | 미측정 (`confirmationLatencyMs`를 수집하나 저장하지 않음) |
| 실제 군중 환경 idSwitchCount | 미측정 |
| 소유권 가중치 6개의 최적성 | 미측정 |
| 해제 임계값(0.12 / 100ms / 80ms)의 최적성 | 미측정 (체감 기준) |
| `COLLISION_ALPHA_THRESHOLD` 등 경험적 상수의 유도 과정 | 확인 필요 |
| 기기·브라우저별 CPU 사용률 | 미측정 |

계측기는 이미 확정 지연 평균·p95를 240샘플로 수집하고 모니터가 17개 필드를 갖고 있다. **수집이 아니라 저장과 비교 절차만 없다.** 여기를 붙이면 AI 문서와 같은 형식의 before/after 비교가 가능해진다.

`Decoder`가 이미 확정 지연 평균·p95를 240샘플로 수집하고 `RecognitionPerformanceMonitor`가 17개 필드를 갖고 있으므로, **수집이 아니라 저장과 비교 절차만 없다.** 여기를 붙이면 AI 문서와 같은 형식의 before/after 비교가 가능해진다.

### 실시간 통신

| 항목 | 상태 |
| --- | --- |
| 실제 DataChannel RTT / 패킷 손실률 | 미측정 |
| 보간 지연 140ms의 최적성 | 미측정 (체감 기준으로 선택) |
| TURN relay 경유 시 성능 | 미측정 (연결 성공만 확인) |
| 서로 다른 네트워크·기기 조합에서의 동기화 오차 | 미측정 |
| 장시간 플레이의 heap / DOM node / GPU memory 추이 | 수동 관찰만, 수치 기록 없음 |

보간 지연 140ms, 전송 30Hz, 외삽 70ms, 유예 10초는 모두 체감 기준으로 정했다.

### 제품 차원의 남은 과제

- **몰수패 정책**: 서버가 인증된 peer 연결 상태를 권위 근거로 제공하면 10초 이후 자동 몰수패를 켤 수 있다.
- **방 메타데이터**: 백엔드 create/response/SSE에 `title`, `hostNickname`, `symbolRange`, `createdAt`이 영속화되면 브라우저 보완 로직을 제거할 수 있다.
- **모델 재평가**: 현재 readiness는 세션 간 랜덤 분할 결과다. 사용자 분리 validation으로 다시 평가해야 제외된 4개 글자를 되살릴 수 있다.
- **성능 실측**: Hand/Pose/AI p95 지연은 기기·브라우저에 따라 달라진다. 자동 테스트 수치를 실제 성능으로 기록하지 않았고, 다양한 기기의 측정치가 더 필요하다.

---

## 10. 정리

기술적으로 가장 의미 있었던 판단 세 가지.

1. **제약을 우회 대상이 아니라 설계 입력으로 다뤘다.** 백엔드가 게임을 중계하지 않는다는 제약에서 브라우저 호스트 권위 구조가 나왔고, 모델 인식률이 불완전하다는 제약에서 readiness 계약 게이팅이 나왔다. 둘 다 남을 기다리지 않고 진행할 수 있게 만든 구조다.

2. **경계를 인터페이스로 만들어 두면 계약이 바뀌어도 규칙 코드를 안 고친다.** 실제로 Swagger 계약 변경, 솔로 API 미지원, dev/운영 환경 차이를 모두 어댑터 교체로 흡수했다.

3. **애매할 때 조용히 추측하지 않게 만들었다.** 손 소유권이 애매하면 입력을 차단하고, 상태 머신은 정의되지 않은 전이에서 예외를 던지고, 체크섬이 어긋나면 스냅샷을 폐기하고, 네트워크가 분할되면 승자를 만들지 않는다. 실시간 시스템에서 잘못된 값을 넘기는 비용이 한 프레임을 놓치는 비용보다 훨씬 크다는 게 이 프로젝트에서 가장 크게 배운 것이다.

---

## 근거 자료

### 근거 — 물리·렌더

#### 래스터·콜라이더

| 파일 | 확인한 내용 |
| --- | --- |
| `block-stacking/glyphs/glyphRaster.ts` | `GLYPH_SOURCE_FONT_SIZE 200`, `COLLISION_CELL_SIZE 8`, `COLLISION_ALPHA_THRESHOLD 0.025`, `RASTER_PADDING 4`, `GAME_GLYPH_STROKE_WIDTH 10`, `HORIZONTAL_VOWEL_STROKE_WIDTH 20`, `mergeOccupiedGlyphCells`, `primeGlyphCollisionCache`, dev 오버라이드 우선순위 |
| `block-stacking/glyphs/glyphCollisionDefaults.json` | 제품 기본 콜라이더 |
| `block-stacking/physics/LetterBodyFactory.ts` | 3단 폴백, `MAX_RASTER_COLLIDER_PARTS 48`, `COLLISION_SLOP_PX 0.05`, `setCentre`·`setInertia` 보정 |
| `block-stacking/physics/glyphStrokeTemplates.ts` | 자모 31자 획 정의, `H`/`V`/`D`/`RING` 헬퍼, 합성모음 주석 |
| `block-stacking/physics/letterColliders.ts` | `LETTER_COLLIDERS` ENVELOPE 치수 |
| `block-stacking/components/GlyphCollisionAudit.tsx` | 감사 UI |

#### 물리

| 파일 | 확인한 내용 |
| --- | --- |
| `block-stacking/physics/types.ts` | `DEFAULT_PHYSICS_CONFIG` 전체 |
| `block-stacking/physics/MatterPhysicsWorld.ts` | `MAX_PHYSICS_STEP_MS`, 서브스텝 분할, `capFallSpeed`, sleeping 스킵, `resize` 수직 거리 보존, `synchronizeSettledLetter`, `removeLetter` 선택적 깨우기 |
| `block-stacking/physics/SettlementDetector.ts` | 정착 임계와 900ms, `{newlySettledIds, movedIds}` |
| `block-stacking/battle/core/BattleRuntimeConfig.ts` | `BATTLE_LETTER_SIZE 240`, `BATTLE_DANGER_LINE_RATIO 1/6` |

#### 렌더

| 파일 | 확인한 내용 |
| --- | --- |
| `block-stacking/render/PixiGameRenderer.ts` | 레이어 구성, DOM `frontLetterLayer`, CSS mask 캐시, `visibility: hidden`, 렌더 epsilon, `app.stop()` |
| `block-stacking/render/LetterViewFactory.ts` | 7 Sprite 합성, 팔레트, `setMotionState` 스쿼시&스트레치 |
| `block-stacking/render/RemovalEffect.ts` | duration 100~350ms 검증 |
| `block-stacking/render/RemovalBurst.ts` | `PARTICLE_COUNT 20`, ease/alpha 곡선 |
| `block-stacking/render/types.ts` | `DEFAULT_RENDERER_CONFIG` |

#### 배치

| 파일 | 확인한 내용 |
| --- | --- |
| `block-stacking/runtime/DistributedSpawnPolicy.ts` | 레인 계산, 높이 가중 부하, 랜덤은 tie-breaker |
| `block-stacking/runtime/towerHeight.ts` | 이동 중 이전 값 유지 |
| `block-stacking/metadata/symbolRegistry.ts` | 자모 31 + 숫자 9 등록부 |

#### 테스트

`MatterPhysicsWorld.test.ts`(14), `glyphRaster.test.ts`(5), `SettlementDetector.test.ts`, `RemovalEffect.test.ts`, `glyphStrokeTemplates.test.ts`, `BattleBotPracticeRuntime.integration.test.ts`

#### 문서

`frontend/src/game/docs/game-troubleshooting.md`(2장·4장·5장), `reference/matter-physics.md`, `reference/pixi-renderer.md`

### 근거 — 인식

#### Decoder

| 파일 | 확인한 내용 |
| --- | --- |
| `recognition/temporal/SignDecoderConfig.ts` | `DEFAULT_SIGN_DECODER_CONFIG`, `RESPONSIVE_GAMEPLAY_*`, 검증 규칙 |
| `recognition/temporal/SignDecoderStateMachine.ts` | 6상태 전이 화이트리스트 |
| `recognition/temporal/ContinuousSignDecoder.ts` | `validSample()` 4중 게이트, 확정 조건, 이벤트 4종, latency 240샘플 |
| `recognition/temporal/SignCandidateWindow.ts` | 투표·평균 confidence |
| `recognition/temporal/SignReleaseDetector.ts` | 해제 3경로 |
| `recognition/temporal/LandmarkMotionAnalyzer.ts`, `LandmarkPoseDistance.ts` | 움직임·거리 계산 |

#### 파이프라인

| 파일 | 확인한 내용 |
| --- | --- |
| `recognition/runtime/RecognitionRateConfig.ts` | 3개 프로필, 검증 범위, `RESPONSIVE_GAMEPLAY` 주석 |
| `recognition/runtime/RecognitionPerformanceProfiles.ts` | `HIGH`/`BALANCED`/`LOW_POWER`, 기본값 |
| `recognition/runtime/RecognitionFrameScheduler.ts` | 단일 rAF 팬아웃, 중복 프레임 차단, 예외 격리 |
| `recognition/runtime/LatestFrameBuffer.ts` | 용량 1, `replacements` 카운터 |
| `recognition/runtime/LatestOnlyInferenceController.ts` | in-flight 1개, 응답 검증 5개, `sent` 상한 4, `flush()` 기준점 재설정, `rotateSession()` |
| `recognition/runtime/RecognitionPerformanceMonitor.ts` | 1초 윈도, 240샘플 p95, longtask, 250ms 스로틀, 17필드 |

#### 사람·손 추적

| 파일 | 확인한 내용 |
| --- | --- |
| `recognition/active-player/ActivePlayerConfig.ts` | 상수 전체, 가중치 합=1 강제 |
| `recognition/active-player/PersonTrackManager.ts` | 트랙 상태, descriptor 구성 |
| `recognition/active-player/PersonDetectionMatcher.ts` | 백트래킹 배정, 비용 함수, 등속 예측 |
| `recognition/active-player/ActivePlayerRegistrationController.ts` | 등록 제스처 조건 |
| `recognition/active-player/ActivePlayerStateMachine.ts` | 7상태 |
| `recognition/active-player/ActivePlayerSession.ts` | 유예·재식별·`idSwitchCount`, `reactivate()` |
| `recognition/active-player/handOwnershipTypes.ts` | `DEFAULT_HAND_OWNERSHIP_CONFIG` 가중치·임계 |
| `recognition/active-player/HandOwnerResolver.ts` | 6신호 감쇠 함수, 재정규화, 차단 사유, 1인 fast path |
| `recognition/active-player/ActiveHandTracker.ts` | 세션 발급·무효화 |

#### 어댑터·서버

| 파일 | 확인한 내용 |
| --- | --- |
| `recognition/vision/RecognitionVisionAdapter.ts` | 포트, 실행 모드 3종 |
| `recognition/vision/MediaPipeRecognitionVisionAdapter.ts` | worker/main-thread 폴백 |
| `recognition/vision/RemoteRecognitionVisionAdapter.ts` | 원격 골격 |
| `recognition/websocket/PythonWebSocketSignRecognizer.ts` | 지수 백오프 500~8000ms, `HAND_MISSING_SEND_INTERVAL_MS 80`, `modelVersion "frontend-temporal"`, `withoutNumericPrediction()` |
| `recognition/mediapipe/docs/README.md` | 어댑터 경계와 교체 절차 |

#### 계약

| 파일 | 확인한 내용 |
| --- | --- |
| `ai/contracts/recognition/readiness.json` | 31클래스, 24 eligible, 제외 사유, criteria, `trainingIndependent: false` 경고 |
| `recognition/readiness/recognitionReadiness.ts` | 타입 래핑, 파생 export |
| `block-stacking/metadata/symbolRegistry.ts` | 자모 31 + 숫자 9, `modelSupported`, 주석 |
| `block-stacking/battle/room/symbolRange.ts` | `symbolRange` 필터 |

#### 테스트

`ContinuousSignDecoder.test.ts`(12), `HandOwnerResolver.test.ts`(8), `LatestOnlyInferenceController.test.ts`(4), `recognitionReadiness.test.ts`, `LocalBotPracticeReadiness.integration.test.ts`(2), `HandCamera.sharedStream.test.tsx`

#### 문서

`frontend/src/game/docs/game-troubleshooting.md`(1장), `docs/ai-model-improvement-report.md`(짝 문서)

### 근거 — 실시간 통신

#### 전송·권위

| 파일 | 확인한 내용 |
| --- | --- |
| `block-stacking/battle/transport/P2pBattleTransport.ts` | 호스트 권위, claim 중재, `CLAIM_EFFECT_DURATION_MS 1150`, `MAX_PROCESSED_COMMANDS 256`, `MATCH_COUNTDOWN_MS 3000`, `HAMMER_COMBO_TARGET 3`, `RECONNECT_SNAPSHOT_SETTLE_MS 240`, localStorage 권위 직렬화 |
| `block-stacking/battle/transport/battleTransportTypes.ts` | 커맨드 11종 / 이벤트 20종 정의 |
| `block-stacking/battle/transport/battleMessageParser.ts` | 필드 단위 타입 가드, `BattleMessageParseError` |
| `realtime/WebRtcDataChannelTransport.ts` | `GAME_P2P_V1` 봉투, 15초 오픈 대기, peer 기반 발신자 식별, 폴백 없음 |

#### 실시간 채널

| 파일 | 확인한 내용 |
| --- | --- |
| `realtime/RealtimeTicketClient.ts` | 1회용 ticket 발급, 엄격 파싱 |
| `realtime/LobbySseClient.ts` | ticket query 구독, `snapshot`/`update` 이벤트, 필드 검증 |
| `realtime/RoomRealtimeSocket.ts` | 서버 메시지 7종 화이트리스트, `SIGNAL`만 송신, `DEFAULT_RECONNECT_BUDGET_MS 8000`, `RETRY_DELAYS_MS`, 401/403 즉시 중단 |
| `realtime/NativeRoomWebRtcSignalingTransport.ts` | 백엔드 `SIGNAL` ↔ 시그널링 포트 어댑팅 |
| `realtime/PeerDisconnectForfeit.ts` | `graceMs 10000`, 룸 WebSocket 미사용 주석 |

#### 동기화

| 파일 | 확인한 내용 |
| --- | --- |
| `block-stacking/battle/sync/InterpolationConfig.ts` | 동기화 상수 전체 |
| `block-stacking/battle/sync/LocalBoardPublisher.ts` | 30Hz 전송, 정착 시 즉시 스냅샷, `bufferedAmount` 백프레셔 |
| `block-stacking/battle/sync/RemoteTransformBuffer.ts` | 140ms 지연 보간, 70ms 외삽, 최단 각도, `MAX_REMOVED_HISTORY 128` |
| `block-stacking/battle/sync/RemoteBoardReplica.ts` | 체크섬 검증, 시계 오프셋 고정, 미지 id 무시 |
| `block-stacking/battle/sync/BoardStateChecksum.ts` | FNV-1a 32bit, 좌표 양자화, 정렬 |
| `block-stacking/battle/sync/BoardSnapshotSerializer.ts` | 좌표 정규화와 `[-0.25, 1.25]` 클램프 |

#### 생명주기

| 파일 | 확인한 내용 |
| --- | --- |
| `block-stacking/battle/core/BattleStateMachine.ts` | 8상태 전이 화이트리스트 |
| `block-stacking/battle/core/BattleController.ts` | `awaitingResumeOwnBoard`, `startAt` 기준 카운트다운, `gameOverReported`, 타이머 분리 관리 |
| `block-stacking/battle/core/BattleLocalBoardRuntime.ts` | `FIXED_PHYSICS_STEP_MS`, `MAX_CATCH_UP_STEPS 4`, `DANGER_CONFIRMATION_MS 1200`, `SETTLED_BOARD_FRAME_INTERVAL_MS 100` |
| `block-stacking/battle/core/BattleExitCoordinator.ts` | 퇴장 순서, `shouldLeaveRemotely()` |
| `block-stacking/battle/core/BattleRoomRecovery.ts` | `REJOIN_DELAYS_MS`, 재시도/중단 분류 |
| `block-stacking/battle/core/BattleRefreshExit.ts` | Navigation Timing 기반 판정, 마커 만료 30초 |
| `block-stacking/battle/room/SwaggerBattleRoomGateway.ts` | `membershipMutation` 직렬화, SSE 재연결 |
| `app/GameServiceProvider.tsx` | 세션 이중 저장, `storage` 이벤트, 세대 기반 cleanup 유예 |

#### 미디어

| 파일 | 확인한 내용 |
| --- | --- |
| `media/camera/SharedGameCameraSession.ts` | track 단일 소유, in-flight 공유, generation 취소 |
| `media/mesh/MeshWebRtcMediaSession.ts` | `MAX_ROOM_PARTICIPANTS 4`, peer 3개 상한 |
| `media/mesh/PeerOfferPolicy.ts` | `localeCompare` 기반 결정적 offer 배분 |
| `media/mesh/IceCandidateBuffer.ts` | remote description 이전 candidate 버퍼링 |

#### 테스트

`BattleController.test.ts`(37), `P2pBattleTransport.test.ts`(11), `RemoteTransformBuffer.test.ts`(8), `RoomRealtimeSocket.test.ts`(7), `MeshWebRtcMediaSession.test.ts`(16), `BoardStateChecksum.test.ts`, `BattleBotPracticeRuntime.integration.test.ts`

#### 문서

`frontend/src/game/docs/game-troubleshooting.md`(3장·4장), `battle-ui-room-status-2026-08-02.md`, `backend-contract-alignment-2026-07-23.md`

### 근거 — 개발 문서

`frontend/src/game/docs/` 아래 8개 문서가 코드와 함께 유지되는 개발 문서다. 특히 `game-troubleshooting.md`(사고 이력), `backend-contracts.md`(계약 원문), `manual-test-checklist.md`(수동 검증 절차)를 함께 본다.
