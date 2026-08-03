# Symbol Guide Assets

지숫자 1~9의 수형 안내 이미지(`number-1.png` ~ `number-9.png`)를 둔다. `recognition/components/SignGuideImage.tsx`가 각 파일을 직접 import해 표시하며, 번들러가 해시 URL로 처리하므로 `public/`이 아닌 이 폴더를 사용한다.

자모 안내 이미지는 아직 없다. `GAME_SYMBOL_REGISTRY`의 모든 항목은 `guideAsset: null`, `templateAvailable: false`를 유지한다. 기준 포즈를 임의로 만들지 않는다는 뜻이며, 승인된 자산이나 촬영된 템플릿이 생기면 그때 `symbolRegistry.ts`의 메타데이터를 명시적으로 갱신한다.

`0`과 `10`은 게임 심볼 등록부에 없으므로 이미지도 두지 않는다. 자모·숫자의 경쟁 출제 가능 여부는 이 폴더가 아니라 `game-contracts/recognition/readiness.json`이 결정한다.
