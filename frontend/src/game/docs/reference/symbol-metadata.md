# Game Symbol Metadata

`frontend/src/game/block-stacking/metadata/symbolRegistry.ts` is the single registry for the complete 41-symbol game contract. Every entry defines category, display name, difficulty, collider key, feedback mode, baseline model flag, template availability, guide asset path, and description.

## AI Availability

The registry does not define the live model label order. `CAPABILITIES.supportedSymbols` remains authoritative for current AI support and playable-symbol calculation. Digits have `modelSupported: false` as a baseline and are never assumed to be available without a capability response.

## Templates And Assets

All entries currently have `templateAvailable: false` and `guideAsset: null`; no pose template or guide image is fabricated. Approved assets belong under `src/game/assets/guides` and must be explicitly referenced by metadata. Vowels marked `CLASSIFICATION_ONLY` do not enable static joint comparison.
