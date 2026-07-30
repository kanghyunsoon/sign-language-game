# Focused design QA — solo paper glyph release

- Reference: the supplied solo-game screen and the requested behavior that the paper glyph grows and falls from the same foreground position.
- Viewport checked: 1256 × 912 at `/game/solo`.
- Paper growth: passed. The target reaches the 140 px physics-glyph size without moving below the paper.
- Handoff position: passed. The physics glyph starts at the same screen center as the completed paper glyph.
- Layering: passed. The falling glyph layer is mounted outside the clipped board canvas and remains above the otter/paper.
- Duplicate glyph: passed. The paper stays empty after release instead of falling back to the board target.
- Build: passed.
- Focused runtime test: passed.

final result: passed

## 2026-07-30 — board gauge and foreground otter follow-up

- Scope: Removed the board grids from solo and 1:1, then added a shared tower-height gauge to the right side of each board.
- Gauge source: The level is derived from the actual topmost Matter glyph, normalized from the board floor to the danger line. It eases both upward and downward as the tower settles or collapses.
- Placement: The transparent rectangular gauge is offset from the right edge and its base aligns between the finish line and the dark-green ground band.
- Foreground layering: The walking hint otter now uses the foreground stacking layer, so it walks in front of stacked physics glyphs instead of being obscured by them.
- Responsive canvas: The fixed game canvas uses its untransformed logical dimensions for Pixi and Matter, avoiding mismatched physics when the page is CSS-scaled.
- Verification: `npm.cmd run build` passed. Targeted tower-height and solo result tests passed. `git diff --check` passed.

### Follow-up adjustments

- The gauge uses the fixed game-canvas dimension instead of viewport units, so browser zoom and window scaling preserve its intended proportion.
- Its level now holds while any Matter glyph is moving and updates only after the pile has settled; this applies to solo and both 1:1 boards.
- Physics glyphs are explicitly in front of the hill scenery, while the walking otter remains in front of the glyph layer.
- The solo result overlay now shares the board's inner padding and its action buttons use the same content width as the card.
