# Cinematic Canvas Layer — Production-Readiness Review

Date: 2026-07-25
Reviewer: code-reviewer (advisory only — no files under `src/` or `index.html` were modified)
Commit reviewed: `2dfe1ed` (clean tree)

## Scope

| Item | Value |
| --- | --- |
| Files | `src/main.js` (244), `src/director.js` (251), `src/effects.js` (233), `src/camera.js` (91), `src/dot-figure.js` (389), `index.html` (43), `src/style.css` (252) |
| LOC reviewed | ~1,500 (excl. the 947 KB generated `src/wolzard-dots.js`, format only) |
| Focus | Correctness, lifecycle/resize, ctx state hygiene, per-frame cost, memory, cross-browser, reduced motion |
| Threat model | Static art page. No user data, no auth, no network input, no secrets. Nothing in the "security" bucket applies; severities are calibrated to *visible breakage / device stalls / accessibility*, not confidentiality. |

## Method

1. Full read of every source file above; wipe/front math derived by hand for the extremes.
2. Empirical verification in headless Chrome over raw CDP (two probe scripts in the session scratchpad: `cdp-review-probe.mjs`, `cdp-review-probe2.mjs`), served by `python -m http.server 8099`:
   - `document.createElement` patched before module load to log every canvas ever created with its backing size → proves buffer churn and prewarm-key correctness.
   - `PerformanceObserver('longtask')` → relative frame-cost signal.
   - `Emulation.setDeviceMetricsOverride` → simulated drag-resize (8 height steps) and a DPR change.
   - `Input.dispatchKeyEvent` → Ctrl+C, Space spam, R, Tab traversal; `Emulation.setEmulatedMedia` → `prefers-reduced-motion: reduce`.
   - `getImageData` sampling → "are pixels still changing" and early fly-in luminance.
3. **Measurement caveat:** Chrome ran `--disable-gpu --enable-unsafe-swiftshader`. All absolute timings below are software-rasterizer numbers and are **not** representative of real hardware. They are used only for *relative* comparisons and for logic/counting proofs, which are rasterizer-independent.

Findings are tagged **CONFIRMED** (verified by execution, or by an unambiguous code path with derived numbers) or **PLAUSIBLE** (reasoned, not executed).

---

## Findings (ranked)

### F1 — Every resize event synchronously re-rasterises both 52k-dot buffers · HIGH · CONFIRMED

- `src/dot-figure.js:219-221` — `_ensureBuffers` is keyed on `(scale, bufDpr)`.
- `src/main.js:222` — `scale = (H * 0.74) / figure.vh`, recomputed from `H` every frame and passed to `render()` → `_ensureBuffers` (`src/dot-figure.js:264`).
- `src/main.js:30-41` — `resize()` is bound raw to the `resize` event, no debounce.

**What breaks:** *any* change in viewport height invalidates the cache key, so both buffers (2 × 52,687 `fillStyle` + `beginPath` + `arc` + `fill`) are rebuilt inside the next frame, on the main thread. `Bloom._ensure` (`src/effects.js:26-42`) simultaneously allocates 3 new stage canvases because it is keyed on the main canvas's pixel size.

**Failure scenario:** user drags the window edge (Windows/macOS emit resize continuously), rotates a phone, or the mobile URL bar collapses → one full rebuild per event. The tab appears frozen; because `dt` is clamped (`src/main.js:182`) the cinematic also drops into slow motion rather than skipping ahead.

**Evidence:** canvas-creation trace across 8 emulated height steps produced **40 new canvases** (8 × 2 dot buffers + 8 × 3 bloom stages) and long tasks rose from 72-136 ms to **148-195 ms** for every step. In this environment one dot buffer takes ~60-70 ms (timestamp gap between the two `createElement("canvas")` calls), i.e. ~150 ms per resize event for the pair + bloom. The op count is fixed; only the per-op cost varies with hardware.

**Fix direction:** (a) quantise `scale` so sub-threshold height changes reuse the existing buffer (round to e.g. 1/16 of a step and let `drawImage` scale the last few %), (b) debounce the rebuild ~200 ms and keep blitting the stale buffer until the drag settles, and/or (c) rasterise into an `OffscreenCanvas` in a worker and swap in an `ImageBitmap` — this also removes the initial `prewarm` stall.

---

### F2 — `_drawAssembling` overwrites the caller's `globalAlpha`, discarding `look.figureAlpha` · HIGH · CONFIRMED (code path + derived numbers)

- `src/dot-figure.js:253-259` — `render()` documents and applies `alpha` via `ctx.save(); ctx.globalAlpha = alpha;`.
- `src/dot-figure.js:351-352` — `_drawAssembling` then does `ctx.save(); ctx.globalAlpha = 0.45 + 0.55 * this.assemble;` — an **absolute** assignment, not a multiply. The fade the Director asked for is silently dropped for the entire fly-in.

**Failure scenario (reachable, on the default entry path):** the `materialize` beat sets `look.figureAlpha = smoothstep(p * 1.7)` over a 2.0 s beat (`src/director.js:61`) while `assemble` ramps over 1.35 s (`src/dot-figure.js:133`). At beat-time 0.1 s the Director requests **0.022** opacity; the dots are actually drawn at **0.49** — a 22× error. The intended emergence-from-black becomes a hard pop from invisible (`alpha <= 0.002` early-return at `src/dot-figure.js:254`) to ~49 % opacity within one or two frames. The captured luminance trace is consistent with this (lit-pixel fraction 0 → 0.29 across ~2 frames), though the software rasterizer stretches the timeline too much for that sample alone to be decisive; the code path is unambiguous.

**Same class, currently unreachable:** `src/dot-figure.js:331` sets `ctx.globalAlpha` absolutely for the hot-edge strips, so the ignition glow would also ignore `figureAlpha`. No beat combines `figureAlpha < 1` with `ignition > 0.002`, so it is latent, not live — but it will fire the moment someone adds a cross-fade beat.

**Fix direction:** multiply instead of assign in both places (`ctx.globalAlpha = alpha * (...)`), or hoist the fade into a single `save()` and use relative alpha throughout.

---

### F3 — Hotkeys ignore modifiers: Ctrl/Cmd+C restarts the cinematic, Ctrl/Cmd+R re-scatters · MEDIUM-HIGH · CONFIRMED

`src/main.js:130-132`:

```js
const k = e.key?.toLowerCase();
if (k === "r") figure.scatter();
if (k === "c" && !director) playCinematic();
```

`e.key` is `"c"` for **Ctrl+C / Cmd+C** and `"r"` for **Ctrl+R / Cmd+R**, so copying text restarts the 15 s cinematic and reload also scatters the figure. **Verified:** dispatching a Ctrl-modified `KeyC` on `/?still` flipped `document.body.className` from empty to `cinematic`.

**Fix direction:** `if (e.ctrlKey || e.metaKey || e.altKey) return;` before the letter checks; also bail on `e.repeat` so a held key does not re-scatter every frame.

---

### F4 — Skip button forces Fire form when pressed outside the cinematic · MEDIUM · CONFIRMED

`src/main.js:114-117` — `director?.skip()` is guarded, but `endCinematic()` is called unconditionally. `endCinematic` (`src/main.js:100-109`) sets `hen.from = hen.to = 1; hen.t = 1; setFormLabel(true)`.

**Failure scenario:** in Knight form after the cinematic, activating Skip hard-cuts to full Fire — no wipe, no flash, no shockwave — and relabels the HUD. **Verified:** on `/?still` (Knight), `btnSkip.click()` changed `#form-name` from `Wolzard` to `Wolzard Fire` with `body.className` empty. Reachable today via the keyboard (see F5) since `pointer-events: none` does not remove focusability; reachable by mouse the moment the CSS changes.

**Fix direction:** `if (!director) return;` at the top of the handler.

---

### F5 — Hidden HUD controls stay in the tab order during the cinematic; Replay is unguarded · MEDIUM · CONFIRMED

- `src/style.css:41-47, 49-65` hide the HUD with `opacity: 0; pointer-events: none` only.
- `src/main.js:113` — `btnCine?.addEventListener("click", playCinematic)` has **no** `if (director) return;`, unlike the C-key path at `src/main.js:132`.

**Verified tab order while the cinematic plays:** `btn-transform → btn-cine → btn-reset → btn-skip → BODY → …`. So a keyboard user tabs through four invisible controls and can activate Replay (spawns a second Director mid-run), Re-materialize (F7) and Skip (F4).

Double-clicking Replay while it is already replaying is otherwise clean — no exception, no leak (the old `Director` is plain state, `shockwaves.clear()` runs, and the new `void` beat re-enters all camera params) — so the fix is about intent and focus hygiene, not crashes.

**Fix direction:** toggle `inert` (or `visibility: hidden`) with the `cinematic` class instead of relying on `opacity`/`pointer-events`, and add the missing `if (director) return;` to `playCinematic`.

---

### F6 — `prefers-reduced-motion: reduce` skips the cinematic but the page animates forever · MEDIUM · CONFIRMED

`src/main.js:138-151` short-circuits the intro, then the `requestAnimationFrame` loop keeps running unchanged: camera handheld drift + breathing zoom (`src/camera.js:67-79`), grain re-anchored by `Math.random()` every frame (`src/effects.js:94-95`), the full bloom chain, and — on `#fire` — continuous ember spawning (`src/dot-figure.js:142-144`, `src/main.js:202`).

**Verified:** with the media feature emulated, **92 frames in 2 s** and the sampled canvas signature changed between samples; same on `#fire`. So a reduced-motion user gets a permanently drifting, flickering image at 60 fps.

Secondary: the manual henshin under reduced motion still fires a 16 px camera shake, a 0.75 full-screen flash and a screen-wide shockwave (`src/main.js:70-80`). That is user-initiated so it is more defensible, but the vestibular-trigger content (shake, drift) is exactly what the media query asks you to drop.

**Fix direction:** when `reduceMotion`, set `camera.driftAmp = camera.breathe = 0`, force `look.grain = 0`, suppress embers and shake, and render once + on interaction instead of holding a permanent rAF loop (also a battery win).

---

### F7 — R re-materialises mid-cinematic while C is guarded · MEDIUM · CONFIRMED

`src/main.js:131` calls `figure.scatter()` unconditionally. **Verified:** pressing R during the `knight` beat changed the sampled canvas signature (figure re-scattered) while the Director kept running.

**Failure scenario:** the timeline continues into `flash`/`ignite`/`fire` with `assemble < 1`, so `render()` takes the `_drawAssembling` branch (`src/dot-figure.js:261`) — the ignition wipe has nothing to wipe (the buffers are not blitted at all), the flash and shockwaves land on a cloud of streaks, and the per-frame cost jumps to 52k `fillRect` during the most expensive beats.

**Fix direction:** guard with `!director` to match C, or route re-materialise through the Director so it can restart the beat.

---

### F8 — DPR changes are only picked up if a `resize` event happens to fire · MEDIUM · PLAUSIBLE

`src/main.js:31` reads `window.devicePixelRatio` **only** inside `resize()`. Moving a window between monitors with different scale factors can leave `innerWidth`/`innerHeight` unchanged while `devicePixelRatio` changes; the `resize` event is not guaranteed in that case (the portable signal is a `matchMedia('(resolution: Xdppx)')` listener).

**What breaks:** `canvas.width/height` and the `setTransform(DPR, …)` stay at the old ratio → the whole scene is drawn blurry (or over-sampled) until any other resize occurs, and the dot buffers keep the old `bufDpr`.

**Verified sub-part (FINE):** when a resize *does* fire with a new ratio, everything updates correctly — the backing store became `2880×1400` at DPR 2 — and there is **no per-frame thrash**: `DPR` is only read in `resize()`, so `_ensureBuffers` sees a stable `bufDpr` and rebuilds exactly once. Browser zoom does change `innerWidth/innerHeight`, so zoom is covered by the existing handler (at the cost of F1's rebuild).

**Fix direction:** add a self-re-arming `matchMedia(`(resolution: ${devicePixelRatio}dppx)`)` change listener that calls `resize()`.

---

### F9 — Buffer memory and rebuild peak; old buffers are not released before the new pair is built · MEDIUM · CONFIRMED (arithmetic) / PLAUSIBLE (mobile OOM)

`src/dot-figure.js:243-248` builds `knightBuf` **then** `fireBuf` and only then reassigns the fields, so during a rebuild the old pair is still reachable → 4 large canvases alive at once, plus the 3 freshly allocated bloom stages. Nothing sets `width = height = 0` on the outgoing canvases, so their backing stores linger until GC decides to run.

Computed from the actual formulas (`bufDpr = min(3, min(dpr,2) * 1.25)`, `cssH = vh*scale + 2*pad`, `scale = 0.74*H/vh`):

| Viewport (CSS @ DPR) | Buffer px | Per buffer | Pair | Main canvas | Bloom | Steady total | Peak during rebuild |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1440×900 @1 | 625×842 | 2.0 MB | 4.0 MB | 4.9 MB | 1.6 MB | 10.6 MB | 16.2 MB |
| 1920×1080 @2 | 1496×2018 | 11.5 MB | 23.0 MB | 31.6 MB | 10.4 MB | 65.1 MB | 98.5 MB |
| 3840×2160 @1 (4K, 100 %) | 1491×2013 | 11.4 MB | 22.9 MB | 31.6 MB | 10.4 MB | 64.9 MB | 98.2 MB |
| 2560×1440 @2 (5K iMac) | 1992×2687 | 20.4 MB | 40.8 MB | 56.3 MB | 18.5 MB | 115.5 MB | 174.8 MB |
| 1024×1366 @2 (iPad Pro) | 1890×2549 | 18.4 MB | 36.8 MB | 21.3 MB | 7.0 MB | 65.1 MB | 108.9 MB |
| 390×844 @3→2 (iPhone) | 1172×1579 | 7.1 MB | 14.1 MB | 5.0 MB | 1.6 MB | 20.8 MB | 36.6 MB |

**Canvas-size cap: not at risk.** The largest dimension in any realistic case is ~2,700 px and the largest single canvas ~5.4 MP — far below Chrome's 65,535-per-side / 268 MP limits and below iOS Safari's ~16.7 MP-per-canvas ceiling.

**Mobile OOM: plausible, and F1 is the trigger.** An iPad Pro orientation change fires resize → ~109 MB peak with two dead 18 MB buffers still resident, repeated for each resize event in the rotation animation. iOS Safari's per-tab canvas budget plus that churn is a realistic "page reloaded" scenario on older tablets. Note also that `Math.min(3, dpr * 1.25)` is unreachable — `main.js:31` already clamps DPR to 2, so `bufDpr` never exceeds 2.5; the `3` is misleading.

**Fix direction:** release explicitly (`old.width = old.height = 0`) before allocating the replacement, build one buffer at a time (reuse the same element by resizing it), and combine with F1's debounce so rotation costs at most one rebuild.

---

### F10 — Fly-in draw cost: 52,687 `fillStyle` string assignments + 52,687 `fillRect` per frame · MEDIUM (perf) · CONFIRMED (op count) / PLAUSIBLE (real-hardware impact)

`src/dot-figure.js:344-371`, active while `assemble < 1` (1.35 s ≈ 81 frames at 60 fps) → **~4.3 M `fillRect` and ~4.3 M CSS-colour parses** per fly-in. Each `ctx.fillStyle = "rgb(r,g,b)"` with a *different* string forces a colour parse (implementations cache only the most recent string), and this cost is CPU-side op recording — GPU acceleration does not remove it. This is very likely the frame-time driver on real hardware, where the bloom's fill-rate work is cheap and this is not.

Measured (SwiftShader, relative only): frames during the fly-in registered as 111-136 ms long tasks versus 72-102 ms in steady state, i.e. the fly-in adds ~35 % on top of an already fill-rate-saturated software baseline.

`update()`'s companion 52k typed-array loop (`src/dot-figure.js:135-138`) is negligible by comparison.

**Fix directions that preserve the streak look:**
1. **Bucket by quantised colour once** in the constructor (e.g. 5 bits/channel → a few hundred buckets; store an index array sorted by bucket). Per frame: one `fillStyle` per bucket, then its `fillRect`s. Removes ~52k colour parses per frame with pixel-identical output at 5-bit quantisation, and is the best cost/benefit change here.
2. Accumulate each bucket's rects into a single `beginPath()`/`rect()` batch and one `fill()` — one draw op per bucket instead of 52k.
3. Draw every other dot at ~1.35× size while `assemble < 0.6` (nobody counts 52k streaks) and switch to the full set for the landing.

Also worth noting: `_ensureBuffers` is the same shape of cost (2 × 52,687 `fillStyle` + `arc` + `fill`) and is what makes F1 expensive; bucketing helps there too, and moving it to a worker `OffscreenCanvas` removes both the prewarm stall and the resize stall.

---

### F11 — ~9-10 full-screen composited passes per frame, at device resolution, even when nothing moves · MEDIUM (perf) · CONFIRMED (inventory) / PLAUSIBLE (magnitude)

Per-frame inventory at steady state (formed figure, no wipe):

| Stage | Draw ops | Full-screen pixel passes |
| --- | --- | --- |
| `drawBackground` (`main.js:156-174`) | `clearRect` + 1-2 `createRadialGradient` + 1-2 fills | 2-3 |
| figure blit (`dot-figure.js:268/270`) | 1 `drawImage` | ~0.4 |
| embers (`dot-figure.js:373-388`) | ≤900 × (`rgba()` string build + `fillRect`), `lighter` | small |
| `Bloom.apply` (`effects.js:46-70`) | 3 downscale `drawImage` (first reads the whole main canvas) + 3 additive upscale blits (one at 1.07×) | ~1.3 read + 3.2 write |
| `drawSweep` when active (`effects.js:202-222`) | 1 `createLinearGradient` + 1 rotated oversized fill | 1 |
| `Shockwaves.draw` (`effects.js:153-178`) | ≤4 rings × 2 wide ellipse strokes (`lineWidth` up to 80) | ~1 while alive |
| `drawFlash` / `Grain` / `Vignette` | 3 full-screen fills, one of them an `overlay` read-modify-write | 3 |
| `drawLetterbox` | 2 small fills | ~0.2 |

At 1920×1080 @ DPR 2 that is ~10 × 8.3 M = **~80 M pixel touches per frame**; at a 4K desktop @ DPR 2 (33 M px canvas) it is ~330 M — no device holds 60 fps there. The DPR clamp to 2 (`main.js:31`) is the right instinct; the chain itself is the remaining lever.

**On the specific "is the main-canvas read a readback stall?" question:** no. `drawImage(mainCanvas, …)` into another canvas is a texture-to-texture copy on Chrome and Safari, not a `getImageData`-style CPU readback; it forces a flush of that canvas's queued ops but does not round-trip to the CPU. The `Bloom` comment's "never a self-read" claim also checks out — the stages snapshot first and the additive blits read only stage canvases. The browser to watch is **Firefox**, where canvas2d acceleration is less consistently enabled and every one of those passes becomes CPU work; the `overlay` grain blend is the most expensive single pass there.

**Fix directions:** recompute the bloom chain every *other* frame and re-blit the cached stages on odd frames (visually identical at this blur radius, halves the most expensive stage); pass `{ alpha: false }` to `getContext("2d")` (`main.js:19`) so the canvas and its page composite skip the alpha channel — the code already covers the surface with an opaque gradient, which also makes the `clearRect` at `main.js:157` redundant.

---

### F12 — Two `CanvasGradient` objects allocated per frame · LOW · CONFIRMED

`src/main.js:158` and `src/main.js:165` build radial gradients every frame. Cache them keyed on `(W, H, quantised warm)` — `warm` only takes a handful of distinct values per beat, and `Vignette` (`src/effects.js:110-118`) already demonstrates the pattern.

### F13 — Dead code / API drift · LOW · CONFIRMED (grep)

- `src/dot-figure.js:64-66, 77` — `kr`/`kg`/`kb` `Uint8Array`s are written and **never read** (the `knightStr`/`fireStr` caches carry the colours). 3 × 52,687 bytes plus 3 stores per dot at construction.
- `src/director.js:191` — `CINEMATIC_DURATION` is exported and never imported.
- `src/director.js:247` — `look.beat` is assigned and never read by `main.js`.
- `src/style.css:227-235` — `.toggle` / `.toggle input` rules have no matching element; this is the residue of the removed `chk-rotate` control (no other reference to it remains anywhere).
- `src/camera.js:20, 34-37` — `tRot`/`to({ rot })` is never driven by any beat (only the drift/shake terms touch rotation).
- `src/director.js:12-29` — `sweepColor` is *not* initialised in `baseLook()` although every other look field is; it only works because `drawSweep` defaults it (`src/effects.js:215`). Inconsistent contract for the one field a caller might reasonably read.
- `src/dot-figure.js:48` — `WOLZARD_DOTS.dots` (52,687 three-element arrays) stays referenced by the module binding for the page's lifetime even though the constructor copies everything into typed arrays. Measured total JS heap: **9 MB**. A flat `Int16Array`/`Uint32Array` payload would cut both parse time and retained heap.

**Still used, confirmed:** `this.cell` (`dot-figure.js:94`) drives dot radius, ember size and jitter, and the fly-in rect size; `figure.vh` is read by `main.js`; `easeOut` is used by `Shockwaves`.

### F14 — `_drawIgnition` clamps the source width but not the destination width · LOW · CONFIRMED

`src/dot-figure.js:309-314`: `sw = Math.min(colPx + padPx, pw - sx)` is clamped for the last column, but the destination width stays `colCss + padCss`, so the rightmost slice is horizontally stretched by ~1 CSS px. Invisible today (that column is inside the `pad` margin, `dot-figure.js:223`), but it is an asymmetry that becomes a real artefact if `WIPE_COLS` or `pad` changes. Clamp both, or drop the pad on the last column.

### F15 — Timeline slows down under load rather than dropping time · LOW · CONFIRMED

`src/main.js:182` clamps `dt` to 0.05. At a sustained 15 fps the ~15 s cinematic stretches to ~20 s; a 150 ms resize rebuild (F1) mid-beat stretches it further. This is a defensible choice for a visual-only timeline (no audio to desync from) — flagged only so it is a decision rather than an accident.

### F16 — `preventDefault()` on Space blocks keyboard activation of buttons · LOW · CONFIRMED

`src/main.js:120-124` preventDefaults Space unconditionally. Space is the standard activation key for `<button>`, so a focused Henshin / Replay / Re-materialize button cannot be activated with Space (Enter still works). Combine the fix with F5: only preventDefault when the event target is not a control (`if (e.target === document.body)` or check `closest("button")`).

### Minor notes (LOW, no action needed unless the contract changes)

- `src/main.js:140` reads `location.hash` once; there is no `hashchange` handler, so an in-page navigation to `#fire` does nothing. The README documents this as load-time only, so it matches the stated contract.
- `src/main.js:138` reads the reduced-motion query once with no `change` listener — an OS-level toggle mid-session is not honoured.
- `src/main.js:56-60` — `setFormLabel` assumes `#form-name` and `#btn-transform` exist while sibling lookups use `?.` (`main.js:113-114`). Inconsistent: a markup rename turns into a module-load `TypeError` that kills the render loop entirely, with no visible canvas at all. Either guard all of them or none.

---

## Checked and FINE (coverage)

1. **`drawImage` argument validity in the wipe** — proved bounded by hand for all `ignition ∈ (0.002, 0.999)`: `u <= 0` is skipped (`dot-figure.js:304`), so `filled ∈ (0, 1]`, `hPx > 0`, `sy = ph - hPx ≥ 0` and `sy + hPx = ph` exactly; `sw = min(colPx + padPx, pw - sx) > 0` and never exceeds the source (worst case `c = 71` → `sw = colPx`). Hot edge: `top ≥ 0`, `avail = min(bandPx, ph - top) > 0`, `top + avail ≤ ph`, `stripPx > 0`. No negative, zero or NaN width/height and no out-of-range source rect anywhere — so no `IndexSizeError` risk. (Per current spec a zero `sw`/`sh` aborts silently rather than throwing, so even a degenerate case would not throw.)
2. **Small/degenerate viewports** — with `H = 0`, `radius`'s `Math.max(0.8, …)` floor (`dot-figure.js:222`) keeps the buffer at 7×7 rather than 0×0; `Bloom.apply` guards `src.width < 16`; the radial gradients with `r0 > r1 = 0` are legal (only a *negative* radius throws). No crash path found.
3. **`_front()` / `WIPE_SOFT` extremes** — `front` spans −0.13 … 1.13 and `colOff × WIPE_SOFT ∈ [−0.13, 0.13]`, so both ends of the wipe are fully clean states. The `ignition >= 0.999` snap to the pure Fire blit changes at most 0.13 % of the buffer height — imperceptible. `easeInOut(1)` is exactly 1, so the interactive path lands exactly on 0 / 1 and hits the fast paths rather than hovering at 0.9998.
4. **ctx state hygiene** — every effect (`Bloom.apply`, `Grain.draw`, `Vignette.draw`, `Shockwaves.draw`, `drawFlash`, `drawSweep`, `drawLetterbox`) and every `DotFigure` draw path (`render`, `_drawIgnition`, `_drawAssembling`, `_drawEmbers`) has balanced `save`/`restore`, and every early return happens *before* its `save()`. `Bloom` mutates only its private stage contexts (`globalCompositeOperation = "copy"`, intentional and re-set before each use). No `globalAlpha` / `globalCompositeOperation` / `fillStyle` / `lineWidth` leaks across frames. The only alpha problem is F2, which is *inside* a balanced save and therefore a contract bug, not a leak.
5. **`Grain.pattern` is created exactly once** (`effects.js:92`) and is not invalidated by resize or by the DPR transform — `CanvasPattern` is not bound to the creating context's transform, and its source is the private 96 px tile, not the main canvas. Confirmed by the canvas-creation trace: exactly one 96×96 canvas is ever created, and `Math.random()` runs twice per frame as intended. (Cosmetic only: the tile is upscaled by DPR with smoothing on, so grain is softer on HiDPI and crawls in 2-device-px steps.)
6. **`prewarm` keying is correct** — `main.js:189` and `main.js:222` compute `scale` with the identical expression, so the prewarmed buffers are hit, not rebuilt, when the fly-in lands. Confirmed by the trace: two dot-buffer canvases at t = 95 ms / 160 ms and none afterwards until the first resize. `last` is re-read after `prewarm` (`main.js:190`), so the prewarm stall consumes no timeline time.
7. **`dt` clamp** prevents a background-tab-restore jump (`main.js:182`); rAF pauses while hidden, so no extra `visibilitychange` handling is needed.
8. **Space during the cinematic is a no-op** — `triggerTransform`'s `if (director) return` (`main.js:64`). Verified: six rapid Space presses mid-cinematic left the form label unchanged with no exceptions.
9. **Rapid Space spam mid-transform is correct** — `hen.from = currentIgnition()` re-anchors at the current eased value and `hen.to` flips off `hen.to >= 0.5` (`main.js:65-67`), so there is no snap or double-flip. (Only cosmetic quirk: `hen.dur` is a fixed 1.15 s regardless of how far the front has to travel, so a rapid reversal is slower per unit of travel.)
10. **`lastFire` / `setFormLabel` never desync from ignition** — the label is set eagerly on trigger and reconciled from `look.fire` each frame (`main.js:209-212`); every state transition sets `hen.to` and the label consistently, including cinematic entry/exit. The single anomaly is F4 (Skip outside the cinematic).
11. **Replay while replaying** — no exception, no leak; the old `Director` is plain state and is dropped, `shockwaves.clear()` runs and the new `void` beat re-enters all camera params. Verified by a double click.
12. **Esc after the cinematic ended** — correctly guarded by `&& director` (`main.js:125`).
13. **In-flight shockwaves after a resize** keep their old centre and radius (`effects.js:133-146`) → briefly off-centre rings, but they expire in < 0.9 s and are cleared on cinematic start/skip. Cosmetic only; not worth code.
14. **Particle / shockwave lifecycle** — both are age-filtered and `particles` has a hard 900 cap that trims the oldest (`dot-figure.js:154-159`). No unbounded growth. The per-frame `filter()` allocation is negligible.
15. **Cross-browser API surface** — `globalCompositeOperation` `"overlay"` and `"lighter"`, `ctx.ellipse`, `createImageData`, `createPattern`, `matchMedia`, optional chaining, `URLSearchParams` and ES modules are all supported across the evergreen targets. `imageSmoothingQuality` (`effects.js:32`) is ignored by Firefox — harmless. An unsupported composite value is ignored per spec (it would degrade to `source-over`, not throw).
16. **No console errors or uncaught exceptions** on any exercised path: default load, `?still`, `#fire`, skip, replay ×2, Space spam, R mid-cinematic, reduced motion, DPR change, 8-step resize.
17. **Photosensitivity (WCAG 2.3.1)** — the `charge` beat flickers full-screen at ~4.1 Hz (`Math.max(0, Math.sin(p * 44))` over 1.7 s, `director.js:99`), which exceeds the 3-per-second *count*, but its peak amplitude is 0.06 additive → ΔL ≈ 0.01 relative luminance against the dark background, an order of magnitude below the ≥0.1 general flash threshold. The `flash` beat's full-amplitude hit is a single flash. No SC 2.3.1 issue.
18. **`n + 1`-style loops / query efficiency** — not applicable (no I/O, no storage). The nearest analogue, ember rejection sampling (`dot-figure.js:173-188`), is bounded at 10 tries × ≤13 samples per frame.

---

## Recommended actions (in order)

1. **F1** — debounce/quantise the buffer rebuild (and ideally move rasterisation off the main thread). This is the only finding that makes the page look broken to an ordinary user resizing a window.
2. **F2** — multiply rather than assign `globalAlpha` in `_drawAssembling` (and `_drawIgnition`'s strips); this restores the intended emergence-from-black in the signature shot.
3. **F3, F4, F7** — three one-line guards: modifier check on hotkeys, `if (!director) return` in the Skip handler, `!director` on R.
4. **F5** — `inert`/`visibility` for the hidden HUD plus the missing `if (director) return` in `playCinematic`.
5. **F6** — honour reduced motion for the *ongoing* animation, not just the intro.
6. **F9** — release the outgoing buffers before allocating replacements; drop the unreachable `min(3, …)`.
7. **F10, F11** — colour bucketing for the fly-in; alternate-frame bloom; `{ alpha: false }`.
8. **F12-F16** — cleanup batch.

## Metrics

- Type coverage: n/a (plain JS, no annotations, no build step). `node --check` passes on all five modules.
- Test coverage: none exists; not flagged (per review scope).
- Lint: no linter configured in the repo.
- Runtime errors observed across 9 exercised entry/interaction paths: 0.

## Unresolved questions

1. **F2** — is the `0.45 + 0.55 * assemble` floor the intended look for the fly-in, with `look.figureAlpha` meant to be redundant? Either way the two intents currently fight and the Director's fade loses; confirm which one should win before fixing.
2. **F6** — how strict should reduced motion be? Freezing drift/breathe/grain is clearly in scope; the question is whether a *user-initiated* henshin should still be allowed its shake and flash.
3. **F9** — is a 5K/6K desktop display or an older iPad in the target matrix? If not, the memory findings drop to informational.
