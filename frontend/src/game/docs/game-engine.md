# 게임 엔진 — 심볼·물리·렌더·런타임

`block-stacking`의 실행 계층을 다룬다. 심볼 등록부 → 충돌체 생성 → Matter 물리 → 렌더 → 솔로 런타임 순서다.

## 1. 심볼 등록부

`block-stacking/metadata/symbolRegistry.ts`가 게임 계약의 단일 등록부다. 항목마다 카테고리, 표시명, 난이도, 콜라이더 키, 피드백 모드, 기본 모델 지원 여부, 템플릿 유무, 안내 자산 경로, 설명을 정의한다.

| 구분 | 개수 | 비고 |
| --- | ---: | --- |
| 자음 | 14 | |
| 모음 | 17 | |
| 지숫자 | 9 | `1`~`9`, `modelSupported: false`, `feedbackMode: CLASSIFICATION_ONLY` |
| 합계 | **40** | `0`, `10`은 등록하지 않는다 |

### AI 지원 여부의 권위

등록부는 실시간 모델 라벨 순서를 정의하지 않는다. 런타임 `CAPABILITIES.supportedSymbols`와 `ai/contracts/recognition/readiness.json`이 권위다. 등록부의 `modelSupported`는 기본값 힌트일 뿐이다. 경쟁 출제 가능 글자는 readiness의 `competitiveEligible`로 결정하며, 현재 31개 자모 중 27개다. 지숫자는 readiness 클래스가 없어 AI 경쟁 출제에서 제외된다.

### 안내 자산

정적 pose template은 제공하지 않는다. 모든 항목의 `guideAsset`은 `null`, `templateAvailable`은 `false`다. 기준 포즈를 임의로 만들지 않는다는 뜻이다.

실제 화면 안내는 두 경로로 제공한다.

- 자음·모음: `media/korean-fingerspelling-sheet.png`의 검증된 기호별 crop
- 지숫자 1~9: `assets/guides/number-1.png`~`number-9.png`를 `recognition/components/SignGuideImage.tsx`가 직접 import

자동 테스트가 게임에 출제 가능한 지문자 31개 전부에 정확히 하나의 안내 이미지를 요구한다.

## 2. 글자를 물리 강체로 만들기

한글 자모는 획 사이에 빈 공간이 있다. 외곽 전체를 사각형으로 근사하면 `ㅡ` 위에 블록이 공중부양하고 `ㅢ`의 두 획 사이가 막힌다.

### 2.1 래스터 기반 콜라이더 생성

`block-stacking/glyphs/glyphRaster.ts`:

```text
1. 오프스크린 캔버스에 700 200px "Noto Sans KR"로 그린다 (strokeText → fillText)
2. measureText의 actualBoundingBox*로 실제 잉크 박스를 구한다
3. getImageData → 8px 셀 단위 알파 평균, 0.025 이상이면 점유 셀
4. mergeOccupiedGlyphCells()가 그리디 최대 사각형으로 병합 (가로 확장 → 아래 확장)
5. 텍스처 중심 기준 좌표로 변환해 사각형 목록 반환
```

| 상수 | 값 |
| --- | --- |
| `GLYPH_SOURCE_FONT_SIZE` | 200 |
| `COLLISION_CELL_SIZE` | 8 |
| `COLLISION_ALPHA_THRESHOLD` | 0.025 |
| `MAX_RASTER_COLLIDER_PARTS` | 48 |
| `RASTER_PADDING` | 4 |

### 2.2 3단 폴백

`block-stacking/physics/LetterBodyFactory.ts`가 순서대로 시도한다.

| 순위 | 방식 | 사용 시점 |
| --- | --- | --- |
| 1 | 래스터 compound (파트 1~48개) | 브라우저 캔버스 사용 가능 |
| 2 | 획 템플릿 compound (`GLYPH_STROKE_TEMPLATES`) | 캔버스 불가 (jsdom, 저사양) |
| 3 | 잉크 박스 단일 사각형 | 위 둘 다 실패 |

2단을 손으로 정의한 이유는 합성모음이다. `ㅢ`, `ㅚ`, `ㅟ`는 래스터를 못 쓸 때도 획이 분리돼야 빈 공간이 한 덩어리로 뭉치지 않는다. 헬퍼는 `H()`(가로획, 두께 0.15), `V()`, `D()`(대각획), `RING()`(사각링 4획)이다.

조립 후 `Body.setCentre()`로 무게중심을 글자 중심에 맞추고 `Body.setInertia(inertia * 0.68)`로 관성을 낮춘다. `COLLISION_SLOP_PX = 0.05`는 접촉 허용 오차다.

### 2.3 아트워크와 물리의 분리

외곽선 두께나 색을 바꿔도 물리 치수는 바뀌지 않아야 한다. `createGlyphRaster()`는 별도 소스 캔버스에 그린 뒤 원래 잉크 박스 크기로 축소해 넣는다. 콜라이더 산출용 폰트(`COLLISION_REFERENCE_FONT`)와 표시용 폰트(`DISPLAY_FONT`)는 같은 face로 고정한다.

한때 예외가 하나 있었다. 표시 폰트를 Jua로 바꾼 `dc1acd3`에서 `ㅣ`의 세로획이 얇아 보여 콜라이더를 1.45배(34 → 49.3)로 넓혔다. 폰트를 Noto Sans KR로 되돌린 `f1a6525`에서 그 보정도 함께 제거했고, 지금은 모든 글자가 `glyphCollisionDefaults.json` 값을 그대로 쓴다. 테스트 `"uses the committed default collider for the single vertical vowel"`가 보정이 되살아나지 않는지 지킨다.

### 2.4 콜라이더 감사 도구

`/game/solo?collisionAudit=1`에서 글자별 콜라이더를 확인·편집·저장·내보낼 수 있다(`block-stacking/components/GlyphCollisionAudit.tsx`, 전역 훅 `window.__auditGlyphColliders(symbols)`).

우선순위는 dev localStorage 오버라이드(`sudal:glyph-collision-overrides:v1`) → `glyphCollisionDefaults.json`(자모 31자 커밋됨) → 런타임 래스터다.

**브라우저 저장값은 임시 데이터다.** 제품 기본값으로 확정하려면 내보낸 JSON을 반드시 `glyphCollisionDefaults.json`에 반영해야 한다. 그러지 않으면 내 브라우저에서만 맞는 상태가 된다.

`primeGlyphCollisionCache()`가 `requestIdleCallback(timeout: 100)` 사이에 4개씩 미리 계산해 첫 진입을 막지 않는다.

## 3. Matter 물리

`MatterPhysicsWorld`는 `PhysicsWorld` 인터페이스 구현이다. **호출자의 `update(deltaMs)`로만 진행하며 자체 `requestAnimationFrame` 루프를 만들지 않는다.**

### 3.1 설정값

`block-stacking/physics/types.ts`의 `DEFAULT_PHYSICS_CONFIG`:

| 항목 | 값 |
| --- | --- |
| `gravityY` | 0.34 |
| `maxFallSpeed` | 4.4 |
| `restitution` | 0.02 |
| `friction` | 0.34 |
| `frictionAir` | 0.014 |
| `density` | 0.001 |
| `rotationInertiaScale` | 0.68 |
| `letterWidth` / `letterHeight` | 140 (1:1은 `BATTLE_LETTER_SIZE = 240`) |
| `wallThickness` | 48 |
| `settleDurationMs` | 900 |
| `linearVelocityThreshold` | 0.07 |
| `angularVelocityThreshold` | 0.01 |

엔진 설정은 `enableSleeping: true`, `positionIterations: 5`, `velocityIterations: 3`, `constraintIterations: 1`.

반발을 거의 0으로 둔 이유는 블록이 커지면서 착지 충격에 더미 전체가 무너져 흩어졌기 때문이다. 마찰을 중간으로 둬서 불안정하게 얹힌 블록은 굴러 내려가되 바닥 전체로 튀지는 않게 했다. 이 값들은 체감 플레이로 정했고 수치 최적화 기록은 `미측정`이다.

### 3.2 경계와 리사이즈

`createBoundaries()`는 floor/left/right 3개 static 바디만 만든다. 천장은 없다.

`resize(w, h)`는 수평을 비율 스케일하되 수직은 **바닥으로부터의 거리를 보존**한다. 보드 높이가 바뀌어도 쌓인 더미가 바닥에 붙어 있어야 하기 때문이다. 리사이즈 후 모든 정착 바디를 `setStatic(false)` + `Sleeping.set(false)`로 재활성화해, 스케일 과정에서 겹친 블록이 스스로 분리될 기회를 준다.

### 3.3 프레임 안정성

- 늦은 프레임은 `stepCount = ceil(deltaMs / 16.67)`개의 서브스텝으로 쪼갠다(`MAX_PHYSICS_STEP_MS = 1000/60`). 큰 delta로 한 번에 적분하면 블록이 바닥을 통과하거나 접촉 후 튀어오른다.
- `capFallSpeed()`가 `velocity.y > maxFallSpeed`를 클램프한다. 물리적 정확성보다 초보자가 반응할 수 있는 속도를 우선했다.
- 모든 활성 바디가 sleeping이면 `Engine.update` 자체를 건너뛴다.

### 3.4 정착 판정

`SettlementDetector`는 선형 속도 `0.07` 이하 **그리고** 각속도 `0.01` 이하를 `settleDurationMs 900` 연속 유지해야 정착으로 본다. 흔들리면 `stableForMs`를 삭제하고 `movedIds`로 되돌린다.

반환 타입이 `{newlySettledIds, movedIds}`인 이유는 "정착했다"만이 아니라 "다시 움직였다"도 상위에서 알아야 하기 때문이다(제거 연쇄, 네트워크 발행 판단).

### 3.5 원격 동기화와 선택적 깨우기

- `synchronizeSettledLetter(id, {x, y, angle})`는 **정착 바디에만** 원격 권위 좌표를 적용한다. 이동 중 바디는 로컬 시뮬레이션을 유지해 전송 지터가 낙하 애니메이션 지터로 번지지 않게 한다.
- `removeLetter(id)`는 제거된 블록보다 위(`y < removedY`)에 있던 정착 바디만 깨운다. 전체를 깨우면 안정된 하단 더미가 흔들린다.

### 3.6 유휴 보드 스케줄링

적응형 스케줄링은 `MatterPhysicsWorld`가 아니라 **런타임이 소유한다.** 낙하 글자나 렌더 효과가 있으면 정상 주기로 진행하고, 모두 정착하고 효과가 없으면 1:1 런타임이 전체 순회를 `SETTLED_BOARD_FRAME_INTERVAL_MS = 100`(10FPS)으로 제한한다. 생성·제거·낙하 스냅샷 복원·효과 시작은 즉시 정상 주기로 복귀시킨다.

`MatterPhysicsWorld` 안에 두 번째 내부 타이머를 넣지 않는다. 루프가 중복되면 일시정지·재접속·정리가 불안정해진다.

## 4. 렌더링

### 4.1 책임 경계

- `GameRenderer`는 `PhysicsLetterState` 스냅샷을 받아 resize, draw, highlight, effect update, clear, dispose만 제공한다. 제거 대상 계산, 점수, 입력 판정, 게임 루프를 하지 않는다.
- `PixiGameRenderer`는 Matter 위치·회전을 그대로 반영하고 결승선을 그린다.
- `LetterViewFactory`는 심볼별 Pixi 표시 객체를 생성·파괴한다. 하나의 텍스처를 7개 Sprite로 합성한다(그림자 / 목표 halo·glow·edge / outer edge / sticker edge / 본체).
- `RemovalEffect`는 100~350ms 범위를 강제하고 벗어나면 `RangeError`를 던진다. 완료 시 `REMOVAL_EFFECT_FINISHED`를 반환하고 Matter 바디 제거 시점은 런타임이 결정한다.
- `GameCanvas`는 Pixi 캔버스를 마운트하고 크기를 관찰하며 dispose한다. 루프를 시작하지 않고 프레임별 React state를 갖지 않는다.

`app.init()` 직후 `app.stop()`을 호출해 **rAF 루프 소유권을 게임 런타임이 갖는다.** Pixi가 자기 루프를 돌리면 물리 스텝과 렌더가 다른 주기로 어긋난다.

`DEFAULT_RENDERER_CONFIG`: `width 720`, `height 960`, `dangerLineY 160`, `dangerLineRatio 1/6`, `removalHighlightDurationMs 180`, `showScenery true`.

### 4.2 DOM 글자 레이어

솔로와 1:1은 실제 글자를 **DOM 마스크**로 표시한다. 이유는 두 가지다.

1. WebGL 캔버스가 라운드 프레임에 클리핑되어 글자가 종이 뒤로 사라져 보였다.
2. 일부 드라이버가 투명 클리어 버퍼를 흰색으로 표시해 게임판이 공유 배경을 덮었다.

`frontLetterLayer`(`div.solo-physics-letter-layer`, `aria-hidden`)를 `mount.closest(".solo-stage-column")`에 붙이고, `createGlyphRaster` 캔버스를 CSS mask URL로 캐시한다(`frontLetterMasks`). `frontLetterSignatures`로 변경이 없으면 DOM 갱신을 건너뛴다.

**`showScenery: false`일 때 같은 바디에 대해 숨겨진 `LetterView`를 만들지 않는다.** 그러지 않으면 글자마다 다중 Sprite 서브트리가 누적된다. Pixi 글자가 없어도 제거 효과는 정상 완료되고 `REMOVAL_EFFECT_FINISHED`를 발생시켜야 한다. `hasActiveEffects()`로 런타임이 진행 중 효과를 멈추지 않고 유휴 주기만 낮출 수 있다.

낙하 중인 DOM 글자만 `will-change: transform`을 쓰고 정착 즉시 `auto`로 되돌린다. `contain: layout style paint`로 글자 갱신이 게임판 밖으로 전파되지 않게 한다.

### 4.3 갱신 억제와 연출

`POSITION_RENDER_EPSILON = 0.05`, `ROTATION_RENDER_EPSILON = 0.0005` 미만 변화는 렌더를 건너뛴다.

`setMotionState`가 스쿼시&스트레치를 적용한다. `motion = min(1, |vy| / 4.5)`, `scaleX = 1 - motion * 0.018`, `scaleY = 1 + motion * 0.032`. 순수 시각 효과이므로 콜라이더에 영향을 주지 않는다.

`RemovalBurst`: 파티클 20개, 색 `[0xffd24d, 0xff5a67, 0xffffff]`, ease `1 - (1-t)^3`, alpha `(1-t)^1.4`, blend add.

## 5. 솔로 런타임

`GameRuntime`이 `RemovalSystem`, `PhysicsWorld`, `GameRenderer`를 조합한다. 인식기는 입력 포트를 통해서만 문자를 제출하고 Matter/Pixi 구현을 알지 않는다. 솔로는 Room WebSocket이나 WebRTC를 쓰지 않는다.

### 5.1 루프 책임

- `RUNNING`일 때만 rAF 루프를 실행한다.
- 자동 타이머 생성은 끄고, 수달 종이에 표시된 목표를 인식했을 때만 블록을 생성한다.
- 종이 글자를 760ms 확대하고, 확대가 끝난 위치와 크기에 Matter 블록을 만든다.
- 물리 정착·이동 이벤트를 코어에 전달한다.
- 제거 효과가 끝난 뒤 Matter 바디를 제거하고 점수·콤보를 기록한다.
- 새로 정착한 블록의 보이는 상단이 결승선을 넘을 때만 종료한다.
- React에는 상태 전이만 발행하고 좌표는 Matter/Pixi에 유지한다.

### 5.2 목표 선택

1. 게임 시작 시 자음·모음 목록과 오답 가중치를 한 번 불러온다.
2. 서버 가중치 `w`를 `min(1.2, 1 + (w - 1) × 0.2)`로 완화한다.
3. 직전 글자는 후보에서 완전히 제외한다.
4. 완화 가중치 합으로 weighted random을 수행한다.
5. API 실패나 잘못된 응답은 빈 가중치 맵으로 처리하고 모든 글자를 `1.0`으로 둔다.

가중치를 완화하는 이유는 서버 값을 그대로 쓰면 특정 글자만 반복 출제되어 게임 다양성이 무너지기 때문이다.

### 5.3 종이에서 물리 블록으로

- 새 목표마다 80ms arming guard를 적용한다. 시작 전에 발생한 확정 이벤트가 새 목표 프레임에 전달되는 것을 막는다.
- 확대 중에는 Matter 바디를 만들지 않는다. 동시에 만들면 두 사본이 서로 다른 레이어에 보인다.
- 확대가 끝나면 종이 글자 중심과 같은 위치에 한 번만 만들고 전면 글자 레이어에서 렌더한다.
- 생성된 블록이 종이 영역을 벗어날 때까지 다음 목표를 표시하지 않는다.
- 단, 방출 글자가 **이미 정착했다면** 위치 임계값과 무관하게 다음 목표를 즉시 큐에 넣는다. 높은 더미에서 대기가 영구히 풀리지 않는 문제를 막는다.

### 5.4 블록 배치 정책

`runtime/DistributedSpawnPolicy.ts`가 한쪽만 높아지는 것을 막는다.

```text
laneCount       = clamp(floor(width / (letterWidth * 1.2)), 3, 7)
influenceRadius = max(letterWidth * 0.9, width / laneCount * 0.72)
레인 부하        = Σ (proximity × heightLoad)
heightLoad      = 1 + (boardHeight - y) / boardHeight
```

부하가 가장 낮은 레인을 고르고 서버·랜덤 X는 동점일 때 tie-breaker로만 쓴다. 높이 가중을 넣은 이유는 블록 수가 아니라 위험도로 판단해야 하기 때문이다.

`runtime/towerHeight.ts`의 `settledTowerHeightRatio`는 움직이는 바디가 있으면 이전 값을 유지해 게이지가 튀지 않게 한다.

> 1:1은 다르다. `BattleLocalBoardRuntime`은 스폰 X를 항상 보드 정중앙(`width / 2`)으로 고정한다. 두 브라우저의 Matter 시뮬레이션 초기 조건을 일치시켜야 하므로 분산 정책을 쓰지 않는다.

### 5.5 종료와 기록

- 결승선 판정은 해당 프레임에 `LETTER_SETTLED`가 발생한 블록만 대상으로 한다.
- 1:1 게임오버는 `BattleLocalBoardRuntime`의 `DANGER_CONFIRMATION_MS = 1200`으로 별도 판정한다. `DANGER_VISIBLE_HALF_HEIGHT = BATTLE_LETTER_SIZE * 0.32`를 쓰는 이유는 한글 마스크가 정사각 박스를 다 채우지 않아 시각적 오판정이 생기기 때문이다.
- 결과 기록은 `ceil(playTimeMs / 1000)`의 경과 초다.
- 플레이 시간은 물리용 델타 제한과 분리해 실제 경과 델타 전체를 누적하고, `RUNNING`에서 100ms 단위로 스냅샷을 갱신한다. 그러지 않으면 카메라·인식 이벤트가 있을 때만 시간이 흐르는 것처럼 보인다.
- 결과 오버레이는 물리 글자보다 높은 레이어에 표시한다.

## 6. 점수와 통계

`ScoringConfig` 기본값: `normalRemovalScore 100`, `comboIncrement 1`, `incorrectComboPolicy "RESET"`, `noTargetPenalty 0`.

점수와 제거 수는 제거 하이라이트가 끝나고 Matter 바디가 실제로 제거된 뒤에 변한다. 잘못된 확정은 콤보 정책만 갱신하고, 보드에 대응 글자가 없는 올바른 확정에는 기본 페널티가 없다.

`LearningStatistics`는 활성 목표 심볼별 집계만 저장한다 — 목표 횟수, 확정 횟수, 정답·오답 수, 평균 확정 confidence, 파생 성공률. 랜드마크, 비디오 프레임, 이미지, 원시 예측 이력은 보관하지 않는다.

## 7. 검증

```powershell
cd frontend
npx.cmd vitest run src/game/block-stacking
```

주요 회귀 테스트:

- `MatterPhysicsWorld.test.ts` (14) — 프레임 분할, 바닥 접촉 후 튀어오름 방지, 리사이즈 정렬·재활성화, 제거 연쇄, 합성모음 공백, sleeping 스킵
- `glyphRaster.test.ts` (5) — 정규화 치수 유한성, 외곽선-콜라이더 분리, L자 마스크 획 분리, `ㅣ` 예외
- `SettlementDetector.test.ts` — 정착·재이동 판정
- `BattleBotPracticeRuntime.integration.test.ts` — 물리+렌더+전송+컨트롤러 통합

실제 Pixi 캔버스 렌더링은 WebGL 브라우저가 필요하다. Node Vitest는 결정적 타이밍만 검증한다.
