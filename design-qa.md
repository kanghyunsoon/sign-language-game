# 1:1 Battle / Solo Visual Alignment QA

## Evidence

- Source visual truth: `C:\Users\khsoo\AppData\Local\Temp\codex-clipboard-fa4b2151-2778-462c-923b-124dde4a563d.png`
- Browser-rendered implementation: `C:\Users\khsoo\Documents\Codex\2026-08-01\c-users-khsoo-desktop-s15p11a405-2\design-qa-battle-implementation.png`
- Combined comparison: `C:\Users\khsoo\Documents\Codex\2026-08-01\c-users-khsoo-desktop-s15p11a405-2\design-qa-battle-comparison.png`
- Local route: `http://127.0.0.1:5174/game/battle/preview`
- State: development-only 1:1 visual preview, two boards and two camera panels, no live room/media side effects
- Browser CSS viewport: 1706 × 960, device pixel ratio 0.75
- Fixed app canvas: 1680 × 945 CSS pixels
- Source pixels: 1630 × 920
- Raw implementation capture: 2240 × 1260 compositor capture
- Density normalization: extracted the first complete 1260 × 709 physical-pixel canvas tile and resized it to 1630 × 920 for a same-size comparison
- Console state: preview rendered normally; previously accumulated development-provider/HMR messages in the tab were not treated as regressions from this styling pass

## Findings

- No actionable P0/P1/P2 visual mismatches remain in the requested 1:1 layout.
- Fonts and typography: the logo asset, rounded utility typography, dark-brown panel labels, compact stage labels, and uppercase camera headings follow the solo screen hierarchy. Battle glyphs use one warm coral tint with a light outline so they remain legible across both day and night.
- Spacing and layout rhythm: the compact 84 px header gives more height to the two play boards, while the right camera rail grows in step and stays aligned. The boards remain visibly separate, with a single centre divider that fades during the night phase rather than producing a bright double seam.
- Colors and visual tokens: both screens now use the same illustrated sky/meadow background, warm cream surfaces, olive stage border, tan camera border, green/gold chips, and restrained soft shadows.
- Image quality and asset fidelity: the existing `solo-start-title.png`, `solo-letter-otter.png`, and `game-mode-background-2d.png` assets are reused without recreating or approximating them. Cropping and scale are consistent with the solo screen.
- Copy and content: the battle badge reads `1 VS 1 · FINISH LINE`, the frame identifies `1 VS 1 · SKY LETTER STAGE`, and room/player labels remain visible. The on-screen finish line is positioned at the exact `1 / 6` gameplay threshold; a settled stack reaching it ends the round.
- Focused region comparison was not required: the normalized 3260 × 920 side-by-side comparison keeps header chips, panel borders, camera headers, and board divisions legible at full resolution.

## Comparison History

1. Initial browser capture showed the fixed 1680 × 945 preview offset from the viewport center, which made the compositor repeat partial canvases and blocked reliable visual judgment.
2. Added the same centered fixed-canvas transform used by the live battle screen to the design-preview route.
3. Re-captured and normalized one complete canvas tile. The resulting comparison shows aligned background crop, panel proportions, border radii, colors, and visual weight.
4. Restored the two distinct battle boards over one shared animated sky, removed the grid, raised the finish line, enlarged the play/camera region, and replaced the centre double border with a night-aware divider.

## Interaction and Runtime Checks

- Preview route rendered successfully.
- Back navigation remains a real link on the preview; the live page uses the existing forfeit-and-leave handler on the matching back control.
- Existing game, WebRTC, camera, AI, recognition, result, and room lifecycle behavior remains intact. The only rule value adjusted is the finish-line threshold, and its visual and win-detection coordinates now share the same ratio.
- TypeScript application check passed with `tsc -p tsconfig.app.json --noEmit --incremental false`.

## Follow-up Polish

- P3: confirm the compact four-item connection-status row with real room data; long translated connection labels may need slightly tighter letter spacing at narrow desktop widths.

final result: passed
