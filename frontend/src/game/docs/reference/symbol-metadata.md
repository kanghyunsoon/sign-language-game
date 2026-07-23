# Game Symbol Metadata

`frontend/src/game/block-stacking/metadata/symbolRegistry.ts` is the single registry for the complete 40-symbol game contract. Every entry defines category, display name, difficulty, collider key, feedback mode, baseline model flag, template availability, guide asset path, and description.

## AI Availability

The registry does not define the live model label order. `CAPABILITIES.supportedSymbols` remains authoritative for current AI support and playable-symbol calculation. 지숫자 1~9는 `modelSupported: false`인 기준선 상태로 등록하며, 실행 중 `CAPABILITIES`가 숫자 라벨을 제공할 때만 출제한다. 숫자 0과 10은 현재 게임 계약에서 제외한다.

## Templates And Assets

정적 pose template은 제공하지 않는다. 지숫자 1~9의 승인된 안내 이미지는 `src/game/assets/guides/number-1.png`부터 `number-9.png`까지이며 `SignGuideImage`가 직접 표시한다. Vowels marked `CLASSIFICATION_ONLY` do not enable static joint comparison.
