# Game Symbol Metadata

`frontend/src/game/block-stacking/metadata/symbolRegistry.ts` is the single registry for the complete 40-symbol game contract. Every entry defines category, display name, difficulty, collider key, feedback mode, baseline model flag, template availability, guide asset path, and description.

## AI Availability

The registry does not define the live model label order. `CAPABILITIES.supportedSymbols` remains authoritative for current AI support and playable-symbol calculation. 지숫자 1~9는 레지스트리에 보관하지만 현재 게임 출제·인식 대상에서는 제외한다. 숫자 0과 10도 현재 게임 계약에서 제외한다.

## Templates And Assets

정적 pose template은 제공하지 않는다. 자음·모음 안내는
`src/game/media/korean-fingerspelling-sheet.png`의 검증된 기호별 crop을,
지숫자 1~9의 개별 이미지는 보관하되 현재 게임 화면에서는 사용하지 않는다.
`SignGuideImage`의 공용 기호 키와 자동 테스트가 게임에 출제할 수 있는 지문자
31개 모두에 정확히 하나의 안내 이미지를 요구한다. Vowels marked
`CLASSIFICATION_ONLY` do not enable static joint comparison.
