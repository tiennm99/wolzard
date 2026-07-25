# Showcase hardening — what was applied, what was deferred

Synthesis of three advisory reviews (code-reviewer, brainstormer, ui-ux-designer;
full reports alongside this file) and the record of what actually landed.

Scope chosen by user: fix + polish + showcase. Font: system stack, no committed
binary. Audio: none.

## Applied

### Confirmed defects
- **Held Space = ~30 full-screen flashes/sec** (WCAG 2.3.1 Level A, seizure
  risk). Fixed with an `e.repeat` guard plus a 0.34 s cooldown. Verified: 10
  presses dispatched in one task collapse to a single transform.
- **Resize rebuilt both 52k-arc buffers per event** → froze on drag-resize and
  rotation. Canvas resizes immediately; buffer rebuild deferred 260 ms until the
  size settles, blitting the existing buffer (scaled) in between. Verified: 8
  height steps now produce 1 long task (~124 ms) instead of 40 canvases.
- **`_drawAssembling` assigned `globalAlpha`**, discarding the director's
  `figureAlpha` — the fade from black was a pop (0.022 requested, 0.49 drawn).
  Now multiplies. `_bandGlow` does the same, preserving the caller's fade.
- **Figure fitted to height only** → helmet cropped ~18% per side on a portrait
  phone. `figureScale()` now fits both axes and budgets for the 1.22 charge zoom.
  Verified: portrait margins 162/123 px, landscape 650/629 px.
- Hotkeys fired with modifiers held (Ctrl+C restarted, Ctrl+R re-scattered).
- Global Space `preventDefault` stole activation from focused buttons.
- `R` mid-cinematic re-scattered, leaving ignite with no buffer to wipe.
- Skip outside the cinematic hard-cut Knight→Fire; `playCinematic` lacked the
  `!director` guard.
- `_ensureBuffers` now zeroes the old canvases' dimensions before replacing, so
  the backing stores are reclaimed immediately.

### Accessibility
- Reduced motion now yields a genuinely still frame: drift/breathe off, embers
  suppressed, and the rAF loop **stops** rather than idling — frames are
  scheduled only while something is resolving. Verified: pixels identical across
  1.4 s.
- Invisible chrome removed from the tab order via `visibility: hidden`. Chrome is
  now hidden by default and revealed by `body.live`, not hidden by a JS-applied
  class — that ordering was making the whole HUD visible for ~0.8 s on load.
  Verified with `checkVisibility()` and a real Tab walk: only Skip during the
  intro, three controls after handoff.
- `:focus-visible` gold ring + black halo; canvas `role="img"` + descriptive
  `aria-label`; `role="status"` live region written only on user-initiated
  changes; tap-to-henshin on the canvas; 44 px targets (48 on coarse pointers).
- Contrast: hint line replaced by `<kbd>` chips at 72% (was 11px @ 35% = 2.86:1,
  failing AA); ghost-button border raised; fire primary stop `#c73a10` →
  `#d7431a` (was 3.65:1).

### Chrome and motion design
- Deleted `#hud-top` (sat on the helmet crest, duplicated the title card) for a
  corner lockup. Cut `Re-materialize` (kept the `R` key). `#form-label` → chip in
  the control bar. Button labels state the destination (`Henshin`/`Revert`).
- Bottom scrim so HUD contrast over the canvas is deterministic.
- Retimed 15.0 → 13.55 s: `void` 0.8→0.35, `knight` 2.4→1.8, `fire` 3.0→2.2, and
  **`ignite` 2.2→2.6** — the ignition wipe is the best asset and was playing
  fastest. Input takes over from the `fire` beat (~9 s) via `Director.canYield()`
  instead of gating on the title card.
- `look.bg` added: the void beat is now true black. The vignette leaves frame
  centre untouched, so with nothing else drawn the background gradient read as a
  grey disc.

### Showcase
- Boot overlay inlined in `<head>`, animated with transform/opacity only so the
  compositor keeps it moving through the main-thread block where the dot data is
  parsed and the buffers built.
- Pointer parallax on its own camera channel (layers over director moves) plus a
  counter-moving background and a cursor-tracked specular band sourced from the
  buffer so it stays inside the silhouette. Costs one extra transform + 8 strip
  blits; the one-blit architecture is intact.
- Shot list: `SHOTS` + `Director.seek()` (forward-only — the world is put into
  the state the beat assumes, so nothing replays), `?shot=` deep links, number
  keys 1–6, and a picker deliberately exempt from cinematic chrome-hiding since
  it only appears when asked for.
- `S` saves the current frame via `canvas.toBlob()`.
- Share metadata + `assets/og.jpg` (61 KB, captured from the page's own title
  beat), `favicon.svg`, `apple-touch-icon.png`.

## Investigated and rejected

- **Pinhole/moire grid in the dot buffers.** Hypothesised that adjacent
  antialiased arcs over a transparent buffer fail to composite to full opacity,
  leaving translucent lattice cell centres. Wrote a fix (pixel-snapped interior
  tiles, round dots on the silhouette), then measured actual canvas pixels: dark
  dips are irregular (gaps 20/13/51/23/55 px), not periodic. The lines were
  moire from downscaling screenshots for review, not present in the product.
  Reverted — do not re-add without a pixel-level measurement showing otherwise.

## Deferred (with reasons)

- **PNG-sourced dot data.** `wolzard-dots.js` is exactly a 244×330 RGBA raster
  (x/y stride 3, 80,520 cells, 65.4% filled) re-encoded as JS at ~18 bytes/pixel.
  Wire cost is 310 KB gzip, so bytes are not the problem — the unbroken
  main-thread block is (52k array literals → 105,374 template strings → 105k
  `arc()` calls). A PNG source would remove the parse block and unlock a density
  slider. Medium effort, medium risk; reproducible from the committed JS.
- **Additional sequences** (Dissolve, Glitch/Scan). Deliberately out of the
  chosen scope. Guiding constraint if added: per-dot cost is affordable in
  *bursts*, not steady state — always-on ideas must be buffer-composited,
  per-dot ideas must be transient.
- **Self-hosted display font** (Archivo variable, ~100 KB woff2). User chose the
  system stack; the hero lacks a true display cut on Linux/Android.

## Cut permanently

- **In-browser GIF/WebM recorder.** Fatal, not merely costly: `#title-card` is
  DOM and `captureStream()` is canvas-only, so a recording would omit the exact
  frame the sequence builds toward. `canvas.toBlob()` save-frame ships instead.
- **Scroll-scrubbed narrative.** `director.js` is forward-only with side effects
  (`once()` set, camera `lerp`, particle integration); scrubbing needs a pure
  function of *t* — a rewrite of the three best modules.
- **More dots / more post effects.** 52k already exceeds screen resolution; more
  post reads as a filter preset and costs subject legibility.

## Unresolved

- Frame rate has only been measured under `--disable-gpu` (SwiftShader), where it
  sits at 26–32 fps. Not representative; real-hardware perf is unmeasured. If it
  stutters, bloom (3 downscales + 3 blits/frame) is the first thing to dial back,
  then alternate-frame bloom.
- `og.jpg` must be regenerated if the title beat's look changes.
