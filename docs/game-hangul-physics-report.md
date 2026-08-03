# 한글 자모를 물리 강체로 다루기 — 래스터 기반 콜라이더 자동 생성

작성: 2026-08-03
대상: `frontend/src/game/block-stacking/glyphs`, `frontend/src/game/block-stacking/physics`, `frontend/src/game/block-stacking/render`

## 이 문서의 성격과 근거의 한계

정확도 같은 단일 지표가 없는 **정합성 문제**를 다룬다. "블록이 공중에 뜨지 않는다", "획 사이 빈 공간이 막히지 않는다" 같은 조건은 백분율로 표현되지 않는다. 따라서 근거는 코드 상수, 회귀 테스트 케이스 이름, 개발 도구로 확인한 결과다.

계측하지 않은 항목은 `미측정`, 코드에서 추론한 항목은 `코드 기반 추정`으로 표시한다.

---

## 1. 문제 정의 — 왜 사각형으로는 안 되는가

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

---

## 2. 채택한 방식 — 캔버스 알파 채널에서 콜라이더를 만든다

브라우저는 이미 폰트를 정확히 렌더링할 수 있다. 그 결과 픽셀을 읽어서 콜라이더를 만들면 폰트 파싱이 필요 없다.

### 2.1 파이프라인

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

### 2.2 파라미터 선택 근거

| 상수 | 값 | 근거 |
| --- | --- | --- |
| `GLYPH_SOURCE_FONT_SIZE` | 200 | 8px 셀로 나눌 때 획 두께가 최소 2셀 이상 되도록. 너무 작으면 얇은 획이 셀 임계값을 못 넘는다 |
| `COLLISION_CELL_SIZE` | 8 | 셀이 작으면 파트 수가 폭발하고(Matter compound 비용), 크면 획 모양이 뭉갠다. 200px 폰트에서 실용 균형점 |
| `COLLISION_ALPHA_THRESHOLD` | 0.025 | 안티에일리어싱 경계 픽셀을 잉크로 오인하지 않는 하한. 코드 기반 추정: 값의 유도 과정 기록은 없음 |
| `MAX_RASTER_COLLIDER_PARTS` | 48 | 초과하면 래스터 결과를 쓰지 않고 폴백. Matter compound body의 파트 수가 많아지면 충돌 계산 비용이 커진다 |
| `RASTER_PADDING` | 4 | 외곽선이 캔버스 경계에서 잘리지 않게 |

### 2.3 왜 그리디 병합인가

최적 사각형 분할(minimum rectangle partition)은 계산이 무겁고, 여기서는 **최적일 필요가 없다.** 필요한 건 "빈 공간을 막지 않고, 파트 수가 48개 이하"인 것뿐이다. 가로 우선 그리디는 한글 획의 특성(가로·세로 직선이 지배적)과 잘 맞는다.

실제 결과를 테스트로 고정했다. `MatterPhysicsWorld.test.ts`의 `"uses a small number of long stroke colliders for Korean glyphs"` — 획이 잘게 쪼개지지 않고 긴 사각형 몇 개로 병합되는지 검증한다.

---

## 3. 3단 폴백 구조

캔버스를 항상 쓸 수 있는 것은 아니다. jsdom 테스트 환경에는 `getImageData`가 없고, 일부 저사양 환경에서는 오프스크린 캔버스가 실패할 수 있다. `block-stacking/physics/LetterBodyFactory.ts`가 우선순위대로 시도한다.

| 순위 | 방식 | 사용 시점 | 구현 |
| --- | --- | --- | --- |
| 1 | 래스터 기반 compound (파트 1~48개) | 브라우저 캔버스 사용 가능 | `createRasterCompoundBody` |
| 2 | 획 템플릿 compound | 캔버스 불가 | `createTemplateCompoundBody` + `GLYPH_STROKE_TEMPLATES` |
| 3 | 잉크 박스 단일 사각형 | 위 둘 다 실패 | `createFallbackRectangle` |

### 3.1 2단 폴백을 손으로 만든 이유

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

### 3.2 compound body 조립

각 파트는 `Bodies.rectangle(..., width * scale + padding * 2, ...)`로 만들고 `padding = GLYPH_COLLIDER_GAP_PX + letterColliderPadding`이다. 조립 후 두 가지를 보정한다.

- `Body.setCentre(body, {x, y})` — 파트 배치로 어긋난 무게중심을 글자 중심으로 맞춘다
- `Body.setInertia(body, inertia * rotationInertiaScale)` — `rotationInertiaScale = 0.68`

관성을 낮춘 이유는 체감이다. compound body의 계산된 관성 그대로 두면 글자가 너무 안 돌아서 딱딱하게 느껴졌다. `COLLISION_SLOP_PX = 0.05`는 접촉 허용 오차다.

---

## 4. 지킨 불변식 — 아트워크와 물리를 분리한다

여기서 한 번 문제가 생겼다. 글자 가독성을 높이려고 외곽선을 두껍게(`GAME_GLYPH_STROKE_WIDTH = 10`, `ㅡ` 전용 `HORIZONTAL_VOWEL_STROKE_WIDTH = 20`) 바꿨더니 **잉크 박스가 커져서 콜라이더 치수가 함께 변했다.** 시각 변경이 게임 물리를 바꾼 것이다.

시각 튜닝은 앞으로도 계속 일어난다. 그때마다 물리가 흔들리면 안 된다.

### 조치

`createGlyphRaster()`가 **별도 소스 캔버스에 그린 뒤 원래 잉크 박스 크기로 축소해 넣는다.** 외곽선이 두꺼워지면 소스 캔버스 안에서 두꺼워지고, 결과물은 같은 박스에 담긴다. 콜라이더 산출용 폰트(`COLLISION_REFERENCE_FONT`)와 표시용 폰트(`DISPLAY_FONT`)는 같은 face로 고정했다.

### 검증

회귀 테스트 이름 자체를 불변식으로 썼다.

- `"renders a strong contrasting outline without changing collider metrics"` — 외곽선을 강화해도 콜라이더 치수가 안 바뀐다
- `"uses one font-size ratio for consonants, vowels, and digits"` — 카테고리별로 폰트 비율이 갈리지 않는다
- `"applies the same visible spacing around every Korean glyph collider"` — 글자마다 여백이 달라지지 않는다
- `"provides finite normalized metrics for every game symbol"` — 40개 심볼 전부가 유한한 정규화 치수를 갖는다
- `"widens the single vertical vowel collider to match its artwork"` — 이건 예외를 **의도적으로** 고정한 것이다. `ㅣ`는 외곽선 때문에 실제 보이는 폭이 획보다 넓어서, 콜라이더도 아트워크에 맞춰 넓혔다

마지막 항목이 이 문서에서 말하고 싶은 지점이다. "아트워크와 물리는 분리한다"가 원칙이지만, `ㅣ`처럼 **보이는 것과 닿는 것이 어긋나면 플레이어가 버그로 느끼는** 예외가 있다. 원칙을 지키되 예외를 테스트로 명시했다.

---

## 5. 개발 도구 — 콜라이더를 브라우저에서 튜닝한다

자동 생성으로 대부분 해결되지만 미세 조정이 필요한 글자가 있었다. 코드를 고치고 재빌드하는 사이클로는 심볼 40개(자모 31 + 숫자 9)를 튜닝할 수 없었다.

### 5.1 콜라이더 감사 모드

`/game/solo?collisionAudit=1`로 들어가면 글자별 콜라이더를 화면에서 확인·편집·저장·내보낼 수 있다(`block-stacking/components/GlyphCollisionAudit.tsx`). 전역 훅 `window.__auditGlyphColliders(symbols)`도 있다.

### 5.2 3단 우선순위

```
1. dev 브라우저 오버라이드  (localStorage: "sudal:glyph-collision-overrides:v1")
2. glyphCollisionDefaults.json  (제품 기본값, 커밋됨)
3. 런타임 래스터  (위 둘이 없을 때)
```

브라우저에서 편집한 결과를 JSON으로 내보내 `glyphCollisionDefaults.json`에 반영하는 흐름이다. 이 순서 때문에 한 번 겪은 문제가 있다 — **브라우저 편집 결과를 파일에 반영하지 않으면 다른 사람의 환경에서는 옛 콜라이더가 쓰인다.** 내 브라우저에서만 맞는 상태였다. 그래서 감사 모드에서 "최종 JSON을 확인한 뒤 파일에 반영한다"를 절차로 문서화했다.

### 5.3 프리컴퓨트

심볼 전체의 래스터를 게임 시작 시 한 번에 계산하면 첫 프레임이 늦는다. `primeGlyphCollisionCache()`가 `requestIdleCallback(timeout: 100)` 사이에 4개씩 청크로 미리 계산한다. 유휴 시간에 나눠 처리해 첫 진입을 막지 않는다.

---

## 6. 물리 튜닝

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

### 6.1 반발을 거의 0으로 둔 이유

블록이 커지면서(1:1은 240px) 낙하 충격이 커졌고, 반발이 있으면 착지 시 더미 전체가 무너져 흩어졌다. 마찰은 중간(0.34)으로 둬서 **불안정하게 얹힌 블록은 굴러 내려가지만 바닥 전체로 튀지는 않는** 상태를 만들었다.

> 이 값들의 선택 근거는 체감 플레이다. 수치 최적화 기록은 `미측정`.

### 6.2 정착 판정

`block-stacking/physics/SettlementDetector.ts`: 선형속도 0.07 이하 **그리고** 각속도 0.01 이하를 **900ms 연속** 유지해야 정착이다. 흔들리면 `stableForMs`를 삭제하고 `movedIds`로 되돌린다. 반환 타입이 `{newlySettledIds, movedIds}`인 이유는 "정착했다"만이 아니라 "다시 움직였다"도 상위에서 알아야 하기 때문이다(제거 연쇄, 네트워크 발행 판단).

테스트 `"reports settlement after a body remains still long enough"`, `"keeps a settled lower letter motionless when another letter lands on it"`.

---

## 7. 프레임 안정성 문제 세 개

### 7.1 늦은 프레임에서 블록이 바닥을 통과하거나 튀어올랐다

브라우저가 17~20ms짜리 프레임을 내보내면 큰 delta로 한 번에 적분하게 되고, 빠르게 낙하하는 블록이 바닥을 뚫거나 접촉 후 위로 튀었다.

`MatterPhysicsWorld`가 delta를 서브스텝으로 쪼갠다.

```ts
MAX_PHYSICS_STEP_MS = 1000 / 60
stepCount = ceil(deltaMs / 16.67)
```

테스트 `"splits a dropped frame into short physics steps"`, `"does not visibly pop upward after floor contact during dropped frames"`. 두 번째 테스트 이름에 `visibly`가 들어간 게 의미가 있다 — 내부 계산이 아니라 **화면에 보이는** 위치를 검증한다.

`capFallSpeed()`로 `velocity.y`가 `maxFallSpeed`를 넘으면 클램프한다. 물리적 정확성보다 초보자가 반응할 수 있는 속도를 우선했다(테스트 `"caps downward velocity for beginner-paced falling"`).

### 7.2 정착 보드가 매 프레임 순회됐다

아무것도 움직이지 않는 보드도 매 프레임 Matter 상태 조회, 렌더 비교, 네트워크 발행 판단을 했다. 글자가 쌓일수록 비용이 선형 증가해 장시간 플레이에서 프레임이 떨어졌다.

- 모든 활성 바디가 sleeping이면 `Engine.update` 자체를 건너뛴다 (테스트 `"skips Matter updates while every letter is frozen"`)
- 1:1은 완전 정착 시 `SETTLED_BOARD_FRAME_INTERVAL_MS = 100`(10Hz)로 다운시프트하고 새 낙하가 시작되면 즉시 복귀한다

### 7.3 리사이즈가 더미를 망가뜨렸다

창 크기를 바꾸면 좌표를 다시 계산해야 하는데, 단순 비율 스케일을 하면 바닥에 붙어 있던 블록이 공중에 뜨거나 서로 파묻혔다.

- 수평은 비율 스케일, 수직은 **"바닥으로부터의 거리"를 보존**한다. 보드 높이가 바뀌어도 쌓인 더미가 바닥에 붙어 있어야 하기 때문
- 리사이즈 후 모든 정착 바디를 `setStatic(false)` + `Sleeping.set(false)`로 재활성화한다. 스케일 과정에서 서로 겹친 블록이 스스로 분리될 기회를 준다

테스트 `"keeps settled letters aligned with the floor when the viewport resizes"`, `"reactivates settled blocks after resize so compressed blocks can separate"`.

### 7.4 제거 후 선택적 깨우기

블록을 제거하면 그 위에 있던 블록들이 떨어져야 한다. 전체를 깨우면 하단 더미까지 미세하게 흔들려 안정된 구조가 무너진다. `removeLetter(id)`는 **제거된 블록보다 위(`y < removedY`)에 있던 정착 바디만** 깨운다.

테스트 `"stacks letters and lets an upper letter fall after lower removal"`.

---

## 8. 렌더링 — Pixi와 DOM을 나눈 이유

`block-stacking/render/PixiGameRenderer.ts` (461줄)는 PixiJS v8을 쓰지만 **실제 글자는 Pixi로 그리지 않는다.**

### 8.1 왜 나눴는가

문제 두 개가 있었다.

1. **캔버스가 라운드 프레임에 클리핑됐다.** 솔로 화면의 게임판은 둥근 테두리와 종이 연출 안에 있는데, WebGL 캔버스가 그 프레임에 잘려서 글자가 종이 뒤로 사라져 보였다.
2. **일부 WebGL 드라이버가 투명 클리어 버퍼를 흰색으로 표시했다.** 1:1 화면에서 게임판이 공유 배경을 흰색으로 덮었다.

### 8.2 구조

| 레이어 | 담당 |
| --- | --- |
| Pixi `boardScenery` / `boardGrid` / `overlayLayer` | 배경, 결승선 |
| Pixi `lettersLayer` | 씨너리 모드에서의 글자와 파티클 |
| **DOM `frontLetterLayer`** | 실제 글자 (`div.solo-physics-letter-layer`, `aria-hidden`) |

DOM 레이어는 `mount.closest(".solo-stage-column")`에 붙여 게임판 클리핑 밖에 둔다. 글자는 `createGlyphRaster` 캔버스를 **CSS mask URL로 변환해 캐시**하고(`frontLetterMasks`), `frontLetterSignatures`로 변경이 없으면 DOM 갱신을 건너뛴다.

`showScenery: false`(1:1)일 때는 `app.canvas.style.visibility = "hidden"`으로 캔버스를 아예 숨기고 DOM 배경 + DOM 글자만 쓴다.

### 8.3 이 구조가 만든 성능 문제와 해결

DOM 글자를 표시하면서 **보이지 않는 Pixi `LetterView`도 계속 생성하고 있었다.** `LetterView` 하나가 7개 Sprite를 소유하므로(그림자, 목표 halo/glow/edge, outer edge, sticker edge, 본체) 글자 수에 비례해 장면 그래프와 GPU 메모리가 낭비됐다.

- DOM 렌더 모드에서는 Pixi `LetterView`를 생성하지 않는다
- 제거 효과는 Pixi 뷰 없이도 완료 이벤트를 정상 발생시킨다
- 낙하 중인 글자만 `will-change: transform`을 쓰고 정착 즉시 `auto`로 되돌려 GPU 합성 레이어를 반환한다
- DOM 글자에 `contain: layout style paint`를 적용해 글자 갱신이 게임판 밖 레이아웃·페인트로 전파되지 않게 한다

### 8.4 렌더 갱신 억제

`POSITION_RENDER_EPSILON = 0.05`, `ROTATION_RENDER_EPSILON = 0.0005` 미만의 변화는 렌더를 건너뛴다. Pixi 앱은 `app.init()` 직후 `app.stop()`을 호출해 **rAF 루프 소유권을 게임 런타임이 갖는다.** Pixi가 자기 루프를 돌리면 물리 스텝과 렌더가 서로 다른 주기로 돌아 동기화가 어긋난다.

### 8.5 스쿼시 & 스트레치

`LetterViewFactory.setMotionState`:

```
motion  = min(1, |vy| / 4.5)
scaleX  = 1 - motion * 0.018
scaleY  = 1 + motion * 0.032
```

빠르게 떨어질 때 살짝 늘어나고 착지하면 돌아온다. 물리 시뮬레이션과 무관한 순수 시각 효과이고, 그래서 **콜라이더에는 영향을 주지 않는다**(4장의 불변식).

---

## 9. 블록 배치 정책

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

---

## 10. 검증 방법과 한계

### 10.1 테스트

| 파일 | 케이스 | 검증 |
| --- | ---: | --- |
| `MatterPhysicsWorld.test.ts` | 14 | 콜라이더 등록, 획 병합, 여백 일관성, 합성모음 공백, 중력·회전·충돌, 낙하 속도 상한, 프레임 분할, sleeping 스킵, 튀어오름 방지, 리사이즈 정렬·재활성화, 제거 연쇄, 정착 안정성 |
| `glyphRaster.test.ts` | 5 | 정규화 치수 유한성, 폰트 비율 일관성, 외곽선-콜라이더 분리, `ㅣ` 예외, L자 마스크 분리 |
| `SettlementDetector.test.ts` | — | 정착·재이동 판정 |
| `RemovalEffect.test.ts` | — | duration 범위 검증 (100~350ms 밖이면 `RangeError`) |

`"separates an L-shaped glyph mask into its visible strokes"`가 그리디 병합의 핵심 동작을 고정한다. L자 형태가 하나의 사각형으로 뭉치지 않고 두 획으로 분리되는지 확인한다.

### 10.2 계측하지 않은 것

| 항목 | 상태 |
| --- | --- |
| 래스터 생성 시간 (글자당) | 미측정 |
| compound body 파트 수와 충돌 계산 비용의 관계 | 미측정 (`MAX_RASTER_COLLIDER_PARTS = 48`은 경험적 상한) |
| 물리 상수(중력·반발·마찰)의 최적성 | 미측정 (체감 기준) |
| `COLLISION_ALPHA_THRESHOLD = 0.025`의 유도 근거 | 확인 필요 (기록 없음) |
| DOM 글자 vs Pixi 글자의 실제 프레임 차이 | 미측정 (문제 해결 여부만 확인) |
| 40개 글자별 콜라이더 파트 수 분포 | 미측정 (감사 도구로 개별 확인만) |

**따라서 이 문서의 상수들은 "왜 그 방향인가"는 설명되지만 "그 값이 최적인가"는 근거가 없다.** 특히 물리 상수는 플레이 체감으로 정했고, 다른 사람이 재조정하려면 처음부터 다시 감을 잡아야 한다. 감사 도구가 있는 콜라이더와 달리 물리 상수용 튜닝 도구는 만들지 않은 것이 아쉬운 지점이다.

---

## 11. 판단과 배운 점

1. **브라우저가 이미 잘하는 일을 다시 만들지 않았다.** 폰트 아웃라인 파싱을 직접 구현하는 대신 캔버스에 그려서 픽셀을 읽었다. 폰트 형식 의존이 사라지고, 폰트를 바꿔도 콜라이더가 따라온다.

2. **"최적"이 필요 없는 곳에 최적 알고리즘을 쓰지 않았다.** 최소 사각형 분할 대신 가로 우선 그리디로 충분했다. 필요한 조건은 "빈 공간을 막지 않고 파트 48개 이하"였고, 한글 획이 직선 위주라 그리디가 잘 맞았다.

3. **폴백 경로도 게임 규칙을 지켜야 한다.** 자모 31자의 획을 손으로 정의한 것은 중복 작업처럼 보이지만, 합성모음의 빈 공간은 폴백에서도 유지돼야 하는 규칙이었다. 이걸 테스트 이름(`"keeps compound-vowel blank spaces out of fallback colliders"`)으로 명시했다.

4. **시각과 물리를 분리하되 예외를 숨기지 않았다.** 원칙은 "아트워크가 콜라이더를 바꾸지 않는다"이지만 `ㅣ`처럼 보이는 것과 닿는 것이 어긋나면 플레이어가 버그로 느낀다. 예외를 만들되 테스트로 명시해서 다음 사람이 "왜 여기만 다른가"를 알 수 있게 했다.

5. **렌더링 레이어를 나누면 비용이 따라온다.** DOM 앞 레이어로 클리핑 문제를 풀었지만, 보이지 않는 Pixi 객체를 계속 만드는 낭비가 뒤따랐다. 우회 구조를 넣을 때는 원래 경로를 끊는 것까지 같이 해야 한다.

6. **프레임은 균등하게 오지 않는다.** 늦은 프레임을 서브스텝으로 쪼개고, 아무것도 움직이지 않을 때는 엔진 자체를 멈추고, 리사이즈 후에는 겹친 블록이 스스로 풀릴 기회를 주는 것 — 물리 시뮬레이션을 브라우저에서 돌릴 때 필요한 처리가 알고리즘보다 많았다.

---

## 근거 자료

### 래스터·콜라이더

| 파일 | 확인한 내용 |
| --- | --- |
| `block-stacking/glyphs/glyphRaster.ts` | `GLYPH_SOURCE_FONT_SIZE 200`, `COLLISION_CELL_SIZE 8`, `COLLISION_ALPHA_THRESHOLD 0.025`, `RASTER_PADDING 4`, `GAME_GLYPH_STROKE_WIDTH 10`, `HORIZONTAL_VOWEL_STROKE_WIDTH 20`, `mergeOccupiedGlyphCells`, `primeGlyphCollisionCache`, dev 오버라이드 우선순위 |
| `block-stacking/glyphs/glyphCollisionDefaults.json` | 제품 기본 콜라이더 |
| `block-stacking/physics/LetterBodyFactory.ts` | 3단 폴백, `MAX_RASTER_COLLIDER_PARTS 48`, `COLLISION_SLOP_PX 0.05`, `setCentre`·`setInertia` 보정 |
| `block-stacking/physics/glyphStrokeTemplates.ts` | 자모 31자 획 정의, `H`/`V`/`D`/`RING` 헬퍼, 합성모음 주석 |
| `block-stacking/physics/letterColliders.ts` | `LETTER_COLLIDERS` ENVELOPE 치수 |
| `block-stacking/components/GlyphCollisionAudit.tsx` | 감사 UI |

### 물리

| 파일 | 확인한 내용 |
| --- | --- |
| `block-stacking/physics/types.ts` | `DEFAULT_PHYSICS_CONFIG` 전체 |
| `block-stacking/physics/MatterPhysicsWorld.ts` | `MAX_PHYSICS_STEP_MS`, 서브스텝 분할, `capFallSpeed`, sleeping 스킵, `resize` 수직 거리 보존, `synchronizeSettledLetter`, `removeLetter` 선택적 깨우기 |
| `block-stacking/physics/SettlementDetector.ts` | 정착 임계와 900ms, `{newlySettledIds, movedIds}` |
| `block-stacking/battle/core/BattleRuntimeConfig.ts` | `BATTLE_LETTER_SIZE 240`, `BATTLE_DANGER_LINE_RATIO 1/6` |

### 렌더

| 파일 | 확인한 내용 |
| --- | --- |
| `block-stacking/render/PixiGameRenderer.ts` | 레이어 구성, DOM `frontLetterLayer`, CSS mask 캐시, `visibility: hidden`, 렌더 epsilon, `app.stop()` |
| `block-stacking/render/LetterViewFactory.ts` | 7 Sprite 합성, 팔레트, `setMotionState` 스쿼시&스트레치 |
| `block-stacking/render/RemovalEffect.ts` | duration 100~350ms 검증 |
| `block-stacking/render/RemovalBurst.ts` | `PARTICLE_COUNT 20`, ease/alpha 곡선 |
| `block-stacking/render/types.ts` | `DEFAULT_RENDERER_CONFIG` |

### 배치

| 파일 | 확인한 내용 |
| --- | --- |
| `block-stacking/runtime/DistributedSpawnPolicy.ts` | 레인 계산, 높이 가중 부하, 랜덤은 tie-breaker |
| `block-stacking/runtime/towerHeight.ts` | 이동 중 이전 값 유지 |
| `block-stacking/metadata/symbolRegistry.ts` | 자모 31 + 숫자 9 등록부 |

### 테스트

`MatterPhysicsWorld.test.ts`(14), `glyphRaster.test.ts`(5), `SettlementDetector.test.ts`, `RemovalEffect.test.ts`, `glyphStrokeTemplates.test.ts`, `BattleBotPracticeRuntime.integration.test.ts`

### 문서

`frontend/src/game/docs/game-troubleshooting.md`(2장·4장·5장), `reference/matter-physics.md`, `reference/pixi-renderer.md`
