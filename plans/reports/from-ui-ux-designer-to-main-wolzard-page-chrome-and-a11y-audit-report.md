# Wolzard — page chrome, typography, a11y & motion audit

Date: 2026-07-25
Scope: `index.html`, `src/style.css`, HUD wiring in `src/main.js`, beat list in
`src/director.js`. Canvas rendering and dot data out of scope.
Status: advisory only — no files under `src/` or `index.html` were modified.

---

## 0. Verdict in one paragraph

The artwork is the product; the chrome is a placeholder around it. Three things
make the page read "unfinished" before anyone reads a word: (1) a big gold
`WOLZARD` in `Segoe UI` at `0.32em` tracking parked directly on top of the
helmet crest, (2) three visually equal-weight buttons where only one matters,
(3) a 11px / 35%-opacity hint line that computes to **2.86:1** contrast and
fails WCAG AA. The fix is mostly subtraction: one small identity lockup, one
primary action, one deterministic bottom scrim, one display typeface committed
to the repo. Separately there is a **real photosensitivity bug** (held Space →
~30 full-screen 0.75-alpha flashes/second) that should be fixed regardless of
any design work.

---

## 1. Findings ranked by visual impact per effort

| # | Finding | Impact | Effort | Section |
|---|---------|--------|--------|---------|
| 1 | Top heading collides with the helmet, duplicates the title card | High | XS (delete + move) | §2 |
| 2 | `Segoe UI` + 0.32em tracking for a heroic sentai title | High | S (1 font file or 0 files) | §3 |
| 3 | HUD contrast is non-deterministic (no scrim) — text sits over arbitrary artwork | High | XS | §5.1 |
| 4 | Three equal buttons, no primary; "Re-materialize" is jargon | High | S | §4 |
| 5 | Hint line 2.86:1 → fails AA | Med-High | XS | §5.2 |
| 6 | Held Space = strobe (WCAG 2.3.1 Level A, seizure risk) | Med (severe if hit) | XS | §5.3 |
| 7 | Invisible controls stay in the tab order (incl. Skip when idle) | Med-High | XS | §5.4 |
| 8 | Canvas has no text alternative; form change never announced | Med-High | S | §5.5 |
| 9 | No `:focus-visible` design — UA default over glass/artwork | Med | XS | §5.6 |
| 10 | Blank-then-black cold start, no loading treatment | Med | S | §7 |
| 11 | Reduced motion still drifts/grains/embers forever | Med | S | §5.8 |
| 12 | Tap targets ~40px / ~34px; no tap-to-henshin on canvas | Med | XS | §6 |
| 13 | `#form-label` collides with the wrapped control bar ≤560px | Med | XS | §6 |
| 14 | Short-viewport (landscape phone) chrome eats ~44% of height | Med | S | §6 |
| 15 | Metadata: no description, no OG/Twitter, no favicon, no theme-color | Med (share only) | S + assets | §8 |
| 16 | Pacing: 15s to interactivity; best beat (ignite) is the fastest | Med | S | §9 |
| 17 | Dead `.toggle` CSS; ⚔ glyph renders as color emoji | Low | XS | §10 |

---

## 2. First-impression composition

### 2.1 What is wrong

- **The heading is in the worst possible place.** The figure is drawn centered
  at `H * 0.5` with height `H * 0.74` (`main.js:222–225`), so the top of the
  helmet lands at roughly `13% of viewport height`. `#hud-top` is at `top: 22px`
  with an `h1` up to `60px` tall plus a subtitle — i.e. it occupies `22px →
  ~100px`, which on any viewport under ~900px tall overlaps or crowds the crest.
  The one part of the artwork with the most detail (the wolf head) is where the
  chrome is densest.
- **Two competing wordmarks.** `#hud-top h1` (gold, 0.32em, glow) and
  `#title-card h2` (cream, 0.30em, fire glow) are the same word in two styles at
  two positions. They never co-exist on screen (`title-in` is only set while
  `cinematic` is also set), so the duplication buys nothing — it only guarantees
  the viewer sees two different answers to "what is this thing's wordmark".
- **`#form-label` at right-edge vertical center** is the odd one out: it is the
  only right-anchored element, it has no relationship to any other element, and
  at `top: 50%` it sits over the figure's shoulder/pauldron — the busiest,
  brightest region of the artwork. On mobile the override moves it to
  `bottom: 120px; right: 16px`, which lands it on the chest and, when the
  control bar wraps to two rows (~116px tall from `bottom: 34px`), **overlaps
  the bar**.
- **Three separate floating clusters at the bottom** (bar at `bottom: 34px`,
  hint at `bottom: 10px`, Skip at `right: 24px; bottom: 26px`) with no shared
  alignment or grouping. The Skip button is the same visual weight as the
  secondary buttons but appears in a different place at a different time.
- **Nothing frames the chrome.** Every overlay sits directly on a canvas whose
  luminance ranges from `rgb(5,5,9)` to full-white flash. Legibility is
  therefore a matter of luck per frame.

### 2.2 Proposed hierarchy

Four zones, three of them tiny:

```
┌──────────────────────────────────────────────┐
│ WOLZARD                                      │  1. Identity lockup, top-left
│ WOLF KNIGHT · MAGIRANGER                     │     (wordmark 20px + live form)
│                                              │
│                  ▲ artwork owns the whole    │  2. Artwork — top center and
│                    center of the frame       │     center kept clear
│                                              │
│                                    SKIP ▶    │  3. Escape hatch (cinematic
│         ┌──────────────────────┐             │     only), bottom-right
│         │  HENSHIN  ·  Replay  │             │  4. One bottom cluster:
│         └──────────────────────┘             │     bar + legend, grouped
│           SPACE henshin   C replay           │
└──────────────────────────────────────────────┘
```

Rationale:

- Top-left is the conventional identity slot; at 20px it is a signature, not a
  headline, so it never competes with the end title card. That makes the title
  card the only hero moment in the piece — which is the correct genre grammar
  (the name lands *after* the henshin, like an eyecatch).
- Folding the form readout into the lockup as its second line removes an entire
  element and gives the wordmark a job: `WOLZARD` / `WOLF KNIGHT → FIRE`. The
  state change now happens next to the identity, in a corner that is always
  dark, instead of over the pauldron.
- Bar + legend become one visual group at the bottom center, over a scrim, so
  the whole lower band reads as one deliberate UI surface.

### 2.3 Code — lockup + grouped bottom cluster

HTML (advisory — do not apply yet):

```html
<main id="app">
  <canvas id="scene" role="img" aria-label="…see §5.5…"></canvas>

  <!-- Identity lockup: small wordmark + live form readout. Replaces both
       #hud-top and #form-label. -->
  <header id="lockup">
    <h1>Wolzard</h1>
    <p class="meta">
      <span id="form-name">Wolf Knight</span>
      <span class="sep" aria-hidden="true">·</span>
      <span class="src">Mahou Sentai Magiranger</span>
    </p>
  </header>

  <p id="form-status" role="status" class="sr-only"></p>

  <!-- Skip first in DOM so it is the first tab stop while the intro plays. -->
  <button id="btn-skip" class="btn btn-ghost">Skip intro <span aria-hidden="true">&#9654;</span></button>

  <div id="dock">
    <div id="controls">
      <button id="btn-transform" class="btn btn-primary">Henshin</button>
      <button id="btn-cine" class="btn btn-ghost">Replay intro</button>
    </div>
    <p id="legend">
      <kbd>Space</kbd> henshin <kbd>C</kbd> replay <kbd>R</kbd> re-form
    </p>
  </div>

  <div id="title-card" aria-hidden="true"> … unchanged … </div>
</main>
```

CSS:

```css
/* Layer scale -------------------------------------------------------------
   The canvas is layer 0; everything else stacks above a single bottom scrim
   so contrast never depends on what the render is doing this frame. */
:root {
  --z-scrim: 1;
  --z-hud: 2;
  --z-title: 3;
  --z-skip: 4;
}

/* Identity lockup -------------------------------------------------------- */
#lockup {
  position: fixed;
  top: clamp(14px, 2.4vh, 26px);
  left: clamp(14px, 2.6vw, 32px);
  z-index: var(--z-hud);
  pointer-events: none;
  text-shadow: 0 1px 12px rgba(4, 5, 9, 0.9), 0 0 34px rgba(4, 5, 9, 0.7);
}

#lockup h1 {
  font: var(--type-wordmark);
  color: var(--gold);
  text-transform: uppercase;
}

#lockup .meta {
  margin-top: 4px;
  font: var(--type-meta);
  text-transform: uppercase;
  color: rgba(238, 241, 247, 0.62);
}

#form-name {
  color: var(--gold);
  transition: color 0.6s ease;
}
#form-name.fire { color: var(--fire); }

#lockup .sep { margin: 0 0.5em; opacity: 0.5; }
#lockup .src { color: rgba(238, 241, 247, 0.45); }

/* Bottom dock ------------------------------------------------------------
   Bar and keyboard legend are one group, sitting on one scrim. */
#dock {
  position: fixed;
  left: 50%;
  bottom: clamp(18px, 3.4vh, 34px);
  transform: translateX(-50%);
  z-index: var(--z-hud);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

/* Scrim — guarantees deterministic contrast for the dock no matter what the
   canvas is doing underneath. Clears out during the cinematic. */
#app::after {
  content: "";
  position: fixed;
  inset: auto 0 0 0;
  height: clamp(130px, 24vh, 260px);
  background: linear-gradient(to top,
    rgba(4, 5, 9, 0.94) 0%,
    rgba(4, 5, 9, 0.62) 46%,
    rgba(4, 5, 9, 0) 100%);
  pointer-events: none;
  z-index: var(--z-scrim);
  transition: opacity 0.8s ease;
}
body.cinematic #app::after { opacity: 0; }
```

`#hud-top` and `#form-label` rules get deleted; `main.js` keeps writing to
`#form-name` unchanged (same id), so the only JS change is the live region
(§5.5).

---

## 3. Typography

### 3.1 Why the current type fails

`"Segoe UI"` is a UI text face: low contrast, humanist, optimized for 9–14px.
At `clamp(28px, 6vw, 60px) / 800 / 0.32em` it is being asked to do a job it was
not cut for. Two specific errors:

1. **Tracking is inverted.** Loose tracking (`0.2em`+) is a *small-caps label*
   device — it says "HUD readout", "eyebrow", "credit". Heroic display type is
   heavy, narrow and **tight** (`-0.01em` to `0.04em`). The current settings
   read as a corporate tech deck, not a henshin eyecatch.
2. **Faux weight.** Windows synthesises `font-weight: 800` for Segoe UI
   (real weights are Light/Semilight/Regular/Semibold/Bold), so the hero title
   is algorithmically smeared, not designed. Same on Linux fallbacks.

This is correctly identified as the single most visible "unfinished" signal.

### 3.2 Recommendation — commit one variable font (preferred)

**Archivo Variable** (Omnibus-Type, SIL OFL 1.1) — weight `100–900` **and a
width axis `62–125`**, so a single file covers the compressed heroic title, the
condensed HUD readout and the regular-width body labels. It has full Latin +
Vietnamese coverage, which matters if this ever gets localized copy.

Why this satisfies the constraints:

- **No external request** — the file is served from the same origin
  (`./assets/fonts/`). Nothing hits a CDN, nothing needs a `preconnect`.
- **No build step** — one `@font-face` rule; the file is a committed static
  asset like any image. Download the variable TTF from the `google/fonts` repo
  (`ofl/archivo/Archivo[wdth,wght].ttf`), convert to `.woff2` **once, manually,
  offline** (`woff2_compress`, or any online converter) and commit the result
  (~85–110 KB) plus `OFL.txt`. The repo gains one asset and zero tooling.
- **One file, not two.** A second family would be the usual move here; the width
  axis makes it unnecessary. YAGNI holds.

If the width axis feels like too much: **Anton** (OFL, one static weight,
~45 KB woff2) for the hero only, plus the system stack for everything else. It
is the classic condensed-poster face and it is instantly right for `WOLZARD`.
Downside: display-only, so you still need a second stack for labels.

Explicitly rejected: Google Fonts CDN (external request), `@fontsource` (npm),
Bebas Neue (no lowercase — fine for the hero, useless for labels), Orbitron /
Michroma (sci-fi cliché, wrong genre — this is armour, not spaceships).

```css
/* Type ------------------------------------------------------------------
   One self-hosted variable family (Archivo, OFL). The width axis does the
   work two families would normally do: wdth 70 for the heroic title, 100 for
   HUD labels. Nothing is fetched cross-origin. */
@font-face {
  font-family: "Archivo";
  src: url("../assets/fonts/Archivo[wdth,wght].woff2") format("woff2-variations");
  font-weight: 100 900;
  font-stretch: 62% 125%;
  font-display: swap;   /* the canvas is the LCP; never block it on type */
}

:root {
  --font-display: "Archivo", "Arial Narrow", "Haettenschweiler", Impact,
                  system-ui, sans-serif;
  --font-ui: "Archivo", "Segoe UI Variable Text", "Segoe UI", system-ui,
             -apple-system, sans-serif;

  /* Composed shorthands so the HUD rules stay one line each. */
  --type-wordmark: 700 clamp(15px, 1.5vw, 20px) / 1 var(--font-display);
  --type-meta:     600 clamp(10px, 1.15vw, 12px) / 1.4 var(--font-ui);
  --type-btn:      650 clamp(13px, 1.2vw, 14px) / 1 var(--font-ui);
  --type-legend:   500 12px / 1.5 var(--font-ui);
}
```

### 3.3 Exact specs

| Role | Family | Weight / width | Size | Tracking | Case |
|---|---|---|---|---|---|
| Hero title (`#title-card h2`) | display | `900` / `wdth 72` | `clamp(3.4rem, 15vw, 11rem)`, `line-height: .84` | `0.02em` | uppercase |
| Hero sub (`#title-form`) | ui | `700` / `wdth 100` | `clamp(.75rem, 2.1vw, 1.15rem)` | `0.44em` | uppercase |
| Wordmark (`#lockup h1`) | display | `700` / `wdth 88` | `clamp(15px, 1.5vw, 20px)` | `0.14em` | uppercase |
| Meta / form line | ui | `600` / `wdth 100` | `clamp(10px, 1.15vw, 12px)` | `0.16em` | uppercase |
| Primary button | ui | `700` | `clamp(13px, 1.2vw, 14px)` | `0.1em` | uppercase |
| Ghost button | ui | `550` | `13px` | `0.07em` | sentence case |
| Legend / `kbd` | ui | `500` | `12px` | `0.05em` | sentence case, `kbd` uppercase |

The reversal to notice: **tracking goes down as size goes up** (0.44em on the
11px sub-line, 0.02em on the 176px hero). That single change does most of the
"now it looks designed" work.

```css
/* Hero title card ------------------------------------------------------- */
#title-card h2 {
  font-family: var(--font-display);
  font-variation-settings: "wght" 900, "wdth" 72;
  font-size: clamp(3.4rem, 15vw, 11rem);
  line-height: 0.84;
  letter-spacing: 0.02em;
  padding-left: 0.02em;              /* balance the tracking */
  text-transform: uppercase;
  color: #fff6e8;
  text-shadow: 0 0 12px rgba(255, 140, 40, 0.75),
               0 0 60px rgba(255, 90, 20, 0.6);
}

#title-card p {
  font: var(--type-meta);
  font-size: clamp(0.75rem, 2.1vw, 1.15rem);
  letter-spacing: 0.44em;
  padding-left: 0.44em;
  text-transform: uppercase;
  color: #ffb27a;
  text-shadow: 0 0 18px rgba(255, 90, 31, 0.9);
}
```

### 3.4 Zero-asset fallback (if no font file is acceptable)

Do not keep `"Segoe UI"` at large sizes — ask for the **display**-optimized
system faces explicitly and fix the tracking/weight:

```css
:root {
  /* Windows 11 ships Segoe UI Variable Display, cut for large sizes; macOS
     maps -apple-system to SF Pro Display above ~20px. Both are real display
     cuts, unlike plain Segoe UI. */
  --font-display: "Segoe UI Variable Display", -apple-system,
                  BlinkMacSystemFont, "Inter", system-ui, sans-serif;
  --font-ui: "Segoe UI Variable Text", -apple-system, BlinkMacSystemFont,
             system-ui, sans-serif;
}
#title-card h2 { font-weight: 900; letter-spacing: 0.03em; }
```

This is a genuine improvement for free, but it will never be *characterful* —
the hero will read "clean", not "heroic". Last-resort CSS-only condensation
(`transform: scaleX(0.86)` on the hero) is available and looks acceptable at one
weight, but it distorts stem/hairline ratios and I would not ship it.

---

## 4. Controls

### 4.1 What is wrong

- `.btn` and `.btn-primary` differ only in fill; all three sit at the same size,
  in the same row, with the same gap. The eye has no entry point.
- `Re-materialize` is implementation vocabulary (`figure.scatter()`), it is the
  least meaningful action on the page, and it is 1 of 3 slots in the primary
  control surface.
- `Replay cinematic` — "cinematic" is production jargon too; "intro" is what a
  viewer calls it.
- `Henshin — Transform` is a tautology plus an em-dash plus a ⚔ glyph. The glyph
  resolves to a **color emoji** in Segoe UI Emoji / Apple Color Emoji, so the
  primary button has a cartoon sticker in it on most machines, and screen
  readers announce "crossed swords".
- No disabled state exists, yet `triggerTransform()` silently no-ops while the
  director runs (`main.js:64`) and `R` is *not* guarded during the cinematic —
  pressing R mid-intro calls `figure.scatter()` and destroys the shot.

### 4.2 Proposal

**Two buttons.** One primary (`Henshin`), one ghost (`Replay intro`).
**Cut `Re-materialize` from the UI** and keep `R` in the keyboard legend. It is a
decorative repeat of the intro's first beat; it does not earn a slot next to the
one action the page exists for. (If it must stay: a third ghost button at 85%
scale, after `Replay intro`, labelled `Re-form dots`. Do not build a settings
popover for it — that is more chrome, not less.)

**Make the primary label state the destination**, so the button and the form
readout never say the same thing twice:

- Knight → button reads `Henshin` with accessible name "Henshin — transform into
  Wolzard Fire"
- Fire → button reads `Revert` with accessible name "Revert to Wolf Knight"

Implementation note for `main.js`: extend `setFormLabel(fire)` to also set
`btnTransform.firstChild.textContent` and `btnTransform.ariaLabel`. No new
element.

```css
/* Controls --------------------------------------------------------------- */
#controls {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 16px;
  backdrop-filter: blur(10px);
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.45);
}

.btn {
  font: var(--type-btn);
  min-block-size: 44px;              /* touch target floor */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 20px;
  border-radius: 11px;
  border: 1px solid transparent;
  color: var(--text);
  background: transparent;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: transform .12s ease, background .2s ease,
              border-color .2s ease, color .2s ease, opacity .2s ease;
}

/* Primary — the only filled control on the page. */
.btn-primary {
  text-transform: uppercase;
  letter-spacing: .1em;
  font-weight: 700;
  color: #1a1406;
  background: linear-gradient(135deg, #e4bf46, var(--gold) 55%, #b8912b);
  border-color: rgba(255, 240, 200, .55);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, .35), 0 6px 22px rgba(212, 175, 55, .28);
}
.btn-primary:hover {
  background: linear-gradient(135deg, #f2d360, #e0bc44 55%, var(--gold));
  transform: translateY(-1px);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, .35), 0 8px 28px rgba(212, 175, 55, .42);
}
.btn-primary:active { transform: translateY(0) scale(.985); }

/* Fire form: the primary re-skins so the bar always states the current form. */
.btn-primary.fire {
  color: #200a02;
  /* Darkened stop lifted to #d7431a so 14px bold text still clears 4.5:1
     against the darkest end of the gradient (see §5.2). */
  background: linear-gradient(135deg, #ff7a3d, var(--fire) 55%, #d7431a);
  border-color: rgba(255, 220, 190, .5);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, .35), 0 6px 22px rgba(255, 90, 31, .3);
}
.btn-primary.fire:hover {
  background: linear-gradient(135deg, #ff9460, #ff6b30 55%, var(--fire));
}

/* Ghost — recessive, text-first. */
.btn-ghost {
  color: rgba(238, 241, 247, .78);
  border-color: rgba(255, 255, 255, .22);   /* 3:1 vs panel, see §5.2 */
  background: rgba(255, 255, 255, .04);
}
.btn-ghost:hover {
  color: var(--text);
  border-color: rgba(212, 175, 55, .6);
  background: rgba(212, 175, 55, .12);
}
.btn-ghost:active { transform: translateY(1px); }

/* Disabled / busy — used while a henshin is mid-flight and while the
   cinematic owns the transform. */
.btn[disabled],
.btn[aria-disabled="true"] {
  opacity: .42;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
  filter: saturate(.55);
}

/* Keyboard legend ------------------------------------------------------- */
#legend {
  font: var(--type-legend);
  letter-spacing: .05em;
  color: rgba(238, 241, 247, .72);   /* 9.2:1 on black, 5.5:1 on firelight */
  display: flex;
  gap: 14px;
  align-items: center;
  pointer-events: none;
}
#legend kbd {
  font: 600 11px/1 var(--font-ui);
  letter-spacing: .08em;
  text-transform: uppercase;
  padding: 3px 6px;
  margin-right: 5px;
  border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, .22);
  background: rgba(255, 255, 255, .07);
  color: var(--text);
}

/* No keyboard, no legend. */
@media (hover: none) and (pointer: coarse) {
  #legend { display: none; }
}

/* Skip ------------------------------------------------------------------- */
#btn-skip {
  position: fixed;
  right: clamp(14px, 2.6vw, 26px);
  bottom: clamp(16px, 3vh, 28px);
  z-index: var(--z-skip);
  min-block-size: 44px;
  font-size: 12px;
  letter-spacing: .12em;
  text-transform: uppercase;
  opacity: 0;
  visibility: hidden;                /* out of the a11y tree + tab order */
  transition: opacity .5s ease .8s, visibility 0s linear 1.3s;
}
body.cinematic #btn-skip {
  opacity: .85;                      /* was .65 — see §5.2 */
  visibility: visible;
  transition: opacity .5s ease .8s, visibility 0s;
}
body.cinematic #btn-skip:hover { opacity: 1; }
```

Note the `transition-delay: .8s` on Skip: it stays operable from t=0 (Esc works,
the button is clickable) but only *appears* once the dots start streaming in, so
the first second of black is not "an ad with a skip button". See §9.

---

## 5. Accessibility

Contrast figures below are computed with the WCAG 2.x relative-luminance
formula. Two reference backgrounds are used, because the canvas has no fixed
colour: **A** = `#05060a` (the darkest frame, `L = 0.0018`) and **B** = the
warm bottom-center firelight at `warm = 1`, ≈ `rgb(93,38,18)` (`L = 0.0375`),
which is exactly where `#hint` and `#controls` sit.

### 5.1 Contrast table

| Element | Colour | vs A (`#05060a`) | vs B (firelight) | Size | WCAG |
|---|---|---|---|---|---|
| `#hud-top h1` | `#d4af37` gold | **9.63:1** | 5.71:1 | 28–60px | AAA pass |
| `#form-name` | gold | 9.63:1 | 5.71:1 | 18–30px | AAA pass |
| `#form-name.fire` | `#ff5a1f` | **6.49:1** | 3.85:1 | 18–30px | AA pass (AAA fail); large-text AA holds on B |
| `.subtitle` | `#eef1f7` @ 55% | **5.65:1** | 3.1:1 | 10–13px | AA pass on A, **AA fail on B** |
| `#hint` | `#eef1f7` @ 35% | **2.86:1** | **2.60:1** | 11px | **FAIL AA (needs 4.5:1) and FAIL the 3:1 large-text bar** |
| `#btn-skip` label @ .65 | `#eef1f7` @ 65% | 7.31:1 | — | 12px | AA pass on dark; **collapses during the `flash` beat** |
| `.btn` label | `#eef1f7` on panel | **15.5:1** | — | 14px | AAA pass |
| `.btn` border | `rgba(255,255,255,.14)` vs button fill | **1.27:1** | — | UI boundary | **FAIL SC 1.4.11 (needs 3:1)** |
| `.btn` fill vs `#controls` panel | — | **1.12:1** | — | UI boundary | **FAIL SC 1.4.11** — the ghost buttons are effectively invisible as controls |
| `.btn-primary` `#1a1406` on gold | — | 8.71:1 light end / **6.22:1** dark end | — | 14px bold | AA pass |
| `.btn-primary.fire` `#200a02` on `#ff5a1f`→`#c73a10` | — | 6.09:1 light end / **3.65:1** dark end | — | 14px bold (not "large") | **FAIL AA at the dark end** |

Fixes:

- **`#hint` → `#legend`**: 12px at `rgba(238,241,247,.72)` = **9.24:1 on A**,
  **5.47:1 on B**. AA pass everywhere. (At `.60` it is 4.82:1 on B — that is the
  floor; `.72` gives headroom.)
- **`.subtitle` / `.meta`**: raise to `.62` and add the scrim + text-shadow from
  §2.3. On the always-dark top-left corner it clears AA comfortably.
- **`.btn-ghost` boundary**: `rgba(255,255,255,.22)` border over the panel gives
  ≈ 3.05:1 against the button interior — SC 1.4.11 satisfied.
- **`.btn-primary.fire`**: move the dark gradient stop from `#c73a10` to
  `#d7431a`; `#200a02` on `#d7431a` = 4.6:1. AA pass at 14px bold.
- **`#form-name.fire`** is AA but not AAA at 18px. Acceptable for a state
  readout; if AAA is wanted use `#ff7a45` (8.1:1 on A).
- **Skip during `flash`**: the flash beat paints near-white full-screen for
  ~0.5s and Skip is light-on-transparent, so it disappears exactly when a viewer
  might reach for it. Give Skip a solid backing (`background: rgba(4,5,9,.72)`
  + the `.22` border) instead of relying on the canvas being dark.

### 5.2 Focus visibility (SC 2.4.7 AA, 1.4.11 AA)

Nothing is defined, so the UA default applies. That is technically not a 2.4.7
failure, but it is visually inconsistent across browsers, it is a thin ring over
a `backdrop-filter` surface, and on the gold primary button Chrome's dark ring
is nearly invisible (`#101010` on `#d4af37` ≈ 4.4:1 is fine, but Safari's blue
glow over gold is not). Define it, and make it survive landing on arbitrary
bright artwork by double-ringing:

```css
/* Focus ----------------------------------------------------------------
   Two rings: a gold indicator plus a near-black halo, so the indicator holds
   3:1 whether it lands on the black vault or on lit fire dots. */
:where(a, button, [tabindex]):focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 3px;
  box-shadow: 0 0 0 6px rgba(4, 5, 9, .92);
  border-radius: 12px;
}
.btn-primary:focus-visible {
  outline-color: #fff6e8;            /* 17.4:1 vs the panel behind the offset */
}
body.fire .btn-primary:focus-visible { outline-color: #fff2e2; }
```

Measured: gold ring vs the `#05060a` halo = **9.6:1**; `#fff6e8` ring vs halo =
**17.4:1**. Both clear the 3:1 non-text requirement, and because the ring sits
in the 3px offset (over the halo, not the button fill) the gold-on-gold problem
disappears.

### 5.3 Photosensitivity (SC 2.3.1 Level A) — **fix this first**

`triggerTransform()` has no cooldown and the keydown handler does not check
`e.repeat`. Holding **Space** therefore fires a transform per key-repeat event
(~25–35/s after the initial delay), each setting `flashPulse = 0.75` and
spawning a full-screen shockwave. That is a full-viewport high-amplitude strobe
well above the 3 Hz general-flash threshold — a hard SC 2.3.1 failure and a
genuine seizure risk. Fix in `main.js`:

```js
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;                       // no strobe on key-repeat
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const editable = e.target.closest?.("input, textarea, [contenteditable]");
  if (editable) return;                       // SC 2.1.4 hygiene
  …
  if (k === "r" && !director) figure.scatter(); // guard: R breaks the intro today
});

function triggerTransform() {
  if (director) return;
  if (hen.t < 0.35) return;                   // min interval between flashes
  …
}
```

Secondary flash notes:

- `charge` flickers at `Math.sin(p * 44)` ≈ **4.1 Hz full-screen**, but peak
  alpha is `0.06` warm-on-dark, i.e. ΔL ≈ 0.02 — under the 0.1 relative
  luminance delta in the general flash threshold. It passes, but with little
  margin: **do not raise that 0.06**, and zero it under reduced motion.
- The `flash` beat is a single flash in 0.5s. Fine.

### 5.4 Tab order and hidden focus traps

Current DOM order → tab order: `btn-transform`, `btn-cine`, `btn-reset`,
`btn-skip`.

Two failures:

1. **During the cinematic**, `#controls` is `opacity: 0; pointer-events: none`
   but still focusable and still in the accessibility tree. A keyboard user
   tabbing during the intro focuses three invisible buttons that do nothing
   (`triggerTransform` early-returns) before reaching Skip. This is an SC 2.4.3 /
   2.4.7 problem (focus goes somewhere invisible).
2. **When idle**, `#btn-skip` is `opacity: 0` but focusable and announced —
   a keyboard user can focus and activate an invisible "Skip" button.

Fix: `visibility: hidden` (or the `inert` attribute) on both, plus move Skip
before `#controls` in the DOM so it is the first tab stop while it is the only
visible control. `position: fixed` means the DOM move has no visual effect.

```css
body.cinematic #lockup,
body.cinematic #dock {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity .8s ease, visibility 0s linear .8s;
}
#lockup, #dock {
  transition: opacity .8s ease, visibility 0s;
}
```

Also worth adding: a genuine skip-to-controls affordance is unnecessary (4 stops
total), but the `<canvas>` must **not** get `tabindex` — it is not operable, and
adding one creates a focus stop with no action.

### 5.5 Text alternative + live region

The canvas currently exposes nothing: a screen reader user gets `WOLZARD` and a
subtitle, then silence. `role="img"` + `aria-label` is the correct treatment for
a canvas that is a picture rather than a control.

```html
<canvas id="scene" role="img"
  aria-label="Dot-art portrait of Wolzard, the Wolf Knight from Mahou Sentai
  Magiranger: a gold-trimmed wolf-motif helmet and armoured shoulders rendered
  from roughly 52,000 coloured dots on black. Using the Henshin control
  re-colours the figure into the flaming orange Wolzard Fire form."></canvas>
```

The form change is currently announced to nobody. Do **not** put `aria-live` on
`#form-name` — `main.js:209–212` syncs it from `look.fire` every frame the value
flips, and the director flips it mid-`ignite`, so a live region there will fire
during the cinematic and can double-announce. Use a dedicated status node
written only on user-initiated changes:

```html
<p id="form-status" role="status" class="sr-only"></p>
```

```js
// in triggerTransform() and endCinematic(), NOT in the per-frame sync
formStatusEl.textContent = fire
  ? "Transformed. Current form: Wolzard Fire."
  : "Reverted. Current form: Wolf Knight.";
```

```css
/* Screen-reader-only ---------------------------------------------------- */
.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  margin: -1px; padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
```

Also: wrap the app in `<main>` (currently `<div id="app">`) for a landmark, and
keep exactly one `h1` — which, after §2, is the small lockup wordmark.

### 5.6 Keyboard shortcuts (SC 2.1.4 Level A)

`R` and `C` are single-character shortcuts with no modifier. SC 2.1.4 requires
that such shortcuts can be turned off, remapped, **or** are active only on
focus. There are no text inputs today so the practical risk is near zero, but
the minimum defensible position is: ignore the shortcut when a modifier is held
or the target is editable (code in §5.3), and **make them visible** — which the
`#legend` with `<kbd>` chips does. A discoverable shortcut is also just better
UX: today they are in a 2.86:1 sentence nobody can read.

### 5.7 `user-select: none` on `<body>`

Blocking selection on the whole document also blocks selecting the title, the
credit line and the source attribution. It is not a WCAG failure, but it is
hostile and it is not what the rule is for (the intent is "don't select the UI
while dragging on the canvas"). Scope it:

```css
body { -webkit-user-select: none; user-select: none; }
#lockup, #title-card, #legend { -webkit-user-select: text; user-select: text; }
```

### 5.8 What reduced motion should actually do

Today `prefers-reduced-motion: reduce` skips the cinematic (good) and then the
render loop runs forever with camera drift (`driftAmp = 1`), breathing zoom,
per-frame film grain and ember spawns. A user who asked for less motion gets a
permanently wobbling, grain-crawling image — and a pegged GPU on a laptop.

Recommended behaviour:

1. **Still image, not a calmer animation.** `camera.driftAmp = 0`,
   `camera.breathe = 0`, `look.ember = 0`, `look.grain` fixed (draw the grain
   once, or set it to 0 — a static grain plate is fine, a crawling one is not).
2. **Stop the loop.** Render on demand instead of `requestAnimationFrame`
   forever: keep a `dirty` flag, set it on resize and on transform, and bail out
   of the loop when `!director && hen.t >= 1 && !dirty`. Re-arm with a single
   `requestAnimationFrame` on the next interaction. This is the part that
   actually respects the user's intent (battery, vestibular calm).
3. **De-punch the henshin**: `hen.dur = 0.35`, no `camera.kick`, no
   `shockwaves.spawn`, `flashPulse = 0`. The ignition wipe itself is a
   colour change across the silhouette, not a moving camera — it can stay,
   and it is the whole point of the page.
4. **Keep the opt-in.** `Replay intro` must remain enabled under reduced motion
   so a user can choose to watch the cinematic. It currently is — keep it, and
   have the director run with drift/shake damped rather than not at all.
5. CSS side: shorten the chrome transitions.

```css
@media (prefers-reduced-motion: reduce) {
  #lockup, #dock, #btn-skip, #title-card, #app::after, .btn {
    transition-duration: .01ms !important;
    transition-delay: 0s !important;
  }
}
```

### 5.9 Auto-play / pause (SC 2.2.2 Level A)

A 15s auto-playing animation needs a stop/pause/hide mechanism available to the
user. `Skip` + `Esc` satisfy it **provided Skip is visible early and reachable
by keyboard** — hence the 0.8s delay (not 5s) and the DOM reorder in §5.4. The
ambient drift/ember loop after the intro is arguably "essential" (it is the
content), but honouring `prefers-reduced-motion` per §5.8 is the right answer
and removes the argument.

### 5.10 Also worth fixing

- `Space` is `preventDefault`ed on `window` for every target, so pressing Space
  while `Replay intro` is focused triggers a **henshin instead of the focused
  button** — a keyboard user cannot activate the secondary buttons with Space.
  Fix: `if (e.target.closest("button")) return;` before the Space branch (Enter
  still works, and Space on the focused button then behaves natively).
- `#title-card` is `aria-hidden="true"` — correct, since the `h1` carries the
  name. Keep it.
- Drop the ⚔ glyph, or if kept: `aria-hidden="true"` +
  `font-variant-emoji: text`. Recommendation: drop it.

---

## 6. Mobile / responsive

### 6.1 Audit

| Case | Problem |
|---|---|
| **Landscape phone** (844×390) | Chrome eats ~170px of 390 (44%): `#hud-top` 22→100px, dock ~34→130px. The figure is only `H*.74 = 289px` tall to begin with. `#form-label` at `top: 50%` lands mid-visor. |
| **Portrait phone** (390×844) | `#hud-top` centered at 22px sits directly above/on the crest (figure top ≈ 110px). `#form-label` override at `bottom: 120px; right: 16px` lands on the chest **and overlaps the wrapped control bar**, which spans ~34→150px once three buttons wrap to two rows. Real collision, reproducible at 390px wide. |
| **Tap targets** | `.btn` = 14px text (~18.6px line box) + 20px padding + 2px border ≈ **40px** — under the 44px iOS/WCAG 2.5.5 guidance (passes WCAG 2.2 SC 2.5.8's 24px floor). `#btn-skip` ≈ **34px** — same verdict. |
| **Touch henshin** | No pointer handler on the canvas at all. The instinct on a phone is to tap the figure; nothing happens. The button exists so it is not a dead end, but the primary gesture is missing. |
| **Title card vs dock** | No live collision (`title-in` only ever co-occurs with `cinematic`, which hides the dock), but the margins are coincidental, not designed. On a 390×844 phone the title sub-line lands at ~127px, exactly where the dock will be. Worth pinning deliberately. |
| **iOS chrome** | `overflow: hidden` handles scroll, but add `overscroll-behavior: none` and consider `height: 100dvh` on `#app` so URL-bar collapse does not retrigger `resize()` (which rescales the canvas against stale prewarmed buffers — a rendering concern, flagged not fixed). |

### 6.2 Recommended breakpoints

Four, each with one job:

```css
/* ≤ 720px — dock goes single-column, primary gets full width -------------- */
@media (max-width: 720px) {
  #controls { width: min(92vw, 420px); flex-direction: column; gap: 8px; }
  .btn { width: 100%; }
  #lockup .src { display: none; }        /* keep wordmark + live form only */
}

/* ≤ 420px — tighten the lockup ------------------------------------------- */
@media (max-width: 420px) {
  #lockup { top: 12px; left: 14px; }
  #dock { bottom: 14px; gap: 8px; }
}

/* Short viewport (landscape phone) — chrome gets out of the artwork's way -
   Height is the scarce axis here, so the lockup collapses to one line and the
   dock hugs the bottom edge. */
@media (max-height: 560px) {
  #lockup { top: 10px; left: 12px; }
  #lockup .meta { display: none; }        /* form moves into the bar instead */
  #controls { flex-direction: row; padding: 8px 10px; }
  #dock { bottom: 10px; gap: 6px; }
  #legend { display: none; }
  #app::after { height: 96px; }
  #title-card { padding-bottom: clamp(28px, 8vh, 64px); }
}

/* Coarse pointer — no keyboard legend, larger targets -------------------- */
@media (pointer: coarse) {
  .btn { min-block-size: 48px; }
  #btn-skip { min-block-size: 48px; padding: 0 18px; }
}
```

When `#lockup .meta` is hidden on short viewports the live form readout must go
somewhere — put a compact static chip at the left of the control bar:

```html
<div id="controls">
  <span id="form-chip" class="chip"><b id="form-name">Wolf Knight</b></span>
  <button id="btn-transform" class="btn btn-primary">Henshin</button>
  <button id="btn-cine" class="btn btn-ghost">Replay intro</button>
</div>
```

That is simpler than two readouts: keep the chip as the *only* form readout on
all sizes and drop the form line from the lockup entirely. One state, one place,
next to the control that changes it — better UX than the top-left version, and
one less responsive special case. **Recommended.**

### 6.3 Tap-to-henshin

Add the gesture as progressive enhancement (buttons stay the accessible path):

```js
// Tap the artwork: dismiss the intro while it plays, otherwise henshin.
canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== undefined && e.button !== 0) return;
  if (director) { director.skip(); endCinematic(); return; }
  triggerTransform();
});
```

Plus `#scene { touch-action: manipulation; }` to kill double-tap zoom and the
300ms delay. Do not give the canvas `role="button"` — it stays `role="img"`, and
the visible buttons remain the exposed control (SC 4.1.2 is satisfied by them).

---

## 7. Loading state

`src/wolzard-dots.js` is 947 KB of source. GitHub Pages gzips it (~250–300 KB
over the wire) but the parse and the `figure.prewarm()` rasterisation still cost
real time on a phone — and because `<script type="module">` is deferred, the
page shows the CSS background gradient and nothing else until the module graph
resolves. On a cold 4G load that is plausibly 1.5–3s of "is this broken?", then
the `void` beat adds another 0.8s of intentional black on top. Worst case a
viewer stares at ~4s of nothing.

Recommended treatment — make the first paint *be* the first beat, in HTML+CSS
only:

```html
<!-- Boot state: the "void" beat, in CSS, so the first paint is intentional.
     Inline (no extra request); main.js removes #boot after the first frame. -->
<style>
  #boot {
    position: fixed; inset: 0; z-index: 9;
    background: #05060a;
    display: grid; place-items: center;
    transition: opacity .6s ease;
  }
  #boot::before,
  #boot::after {           /* the letterbox bars the director uses */
    content: ""; position: fixed; left: 0; right: 0; height: 8vh;
    background: #000;
  }
  #boot::before { top: 0; }
  #boot::after { bottom: 0; }
  #boot i {                /* a 1px gold rule that breathes and travels */
    display: block; width: min(38vw, 320px); height: 1px;
    background: linear-gradient(90deg,
      transparent, #d4af37 18%, #fff6e8 50%, #d4af37 82%, transparent);
    opacity: .35;
    animation: boot-scan 1.6s ease-in-out infinite;
  }
  @keyframes boot-scan {
    0%, 100% { opacity: .22; transform: scaleX(.72); }
    50%      { opacity: .9;  transform: scaleX(1); }
  }
  body.booted #boot { opacity: 0; pointer-events: none; }
  @media (prefers-reduced-motion: reduce) {
    #boot i { animation: none; opacity: .5; }
  }
</style>
<div id="boot" aria-hidden="true"><i></i></div>
```

```js
// after the first successful frame (inside frame(), once `warmed` is true)
document.body.classList.add("booted");
setTimeout(() => document.getElementById("boot")?.remove(), 700);
```

Why this and not a spinner: it is the piece's own visual language (letterbox
bars + a gold rule + the raking-light motif), it costs zero requests, it is
~30 lines, and it makes the first 2 seconds read as the opening of a film rather
than a failed load. Indeterminate on purpose — script parse progress is not
observable, and faking a percentage would be worse.

Two cheap adjuncts:

```html
<!-- Start the big data fetch in parallel with the module graph resolution
     instead of after main.js is parsed. -->
<link rel="modulepreload" href="./src/wolzard-dots.js" />
<link rel="modulepreload" href="./src/main.js" />
<meta name="color-scheme" content="dark" />   <!-- no white flash, dark UA UI -->
```

Then shorten the `void` beat (§9) since the boot overlay has already served the
"black" function.

---

## 8. Metadata / share

Site URL is `https://tiennm99.github.io/wolzard/`. Recommended head, in order:

```html
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<meta name="theme-color" content="#05060a" />

<title>Wolzard — dot-art henshin, Mahou Sentai Magiranger</title>
<meta name="description" content="A Canvas 2D dot-art portrait of Wolzard, the Wolf Knight from Mahou Sentai Magiranger, built from ~52,000 coloured dots — with a 15-second henshin cinematic into Wolzard Fire. No WebGL, no framework." />
<link rel="canonical" href="https://tiennm99.github.io/wolzard/" />

<meta property="og:type" content="website" />
<meta property="og:site_name" content="Wolzard" />
<meta property="og:title" content="Wolzard — dot-art henshin" />
<meta property="og:description" content="52,000 dots, one wolf knight, one transformation into Wolzard Fire. Canvas 2D, no framework." />
<meta property="og:url" content="https://tiennm99.github.io/wolzard/" />
<meta property="og:image" content="https://tiennm99.github.io/wolzard/assets/og-wolzard.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Dot-art portrait of Wolzard's wolf helmet, half gold armour and half flaming orange." />

<meta name="twitter:card" content="summary_large_image" />

<link rel="icon" href="./assets/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="./assets/favicon-32.png" sizes="32x32" />
<link rel="apple-touch-icon" href="./assets/apple-touch-icon.png" />
```

**Assets that do not exist yet** (all three need creating):

1. `assets/og-wolzard.png` — 1200×630. Cheapest authentic source: load the page
   with `#fire`, run `scene.toDataURL("image/png")` in the console at a 1200×630
   window, then crop/letterbox and add the wordmark in the new display face.
   Under 300 KB. **Note: `og:image` must be an absolute URL** — relative paths
   are ignored by most crawlers.
2. `assets/favicon.svg` — at 16px the helmet is unreadable. Use the dot motif
   instead: 4–6 gold circles on `#05060a` forming a wolf-ear silhouette, or a
   single gold dot with an orange core. A ~400-byte inline SVG.
3. `assets/apple-touch-icon.png` — 180×180, no transparency, `#05060a` field.

Also worth fixing: `.github/workflows/deploy-pages.yml` still says "the app
loads Three.js from a CDN import map" — stale since the Canvas 2D rewrite.

---

## 9. Motion design critique

Beat sheet as written (`director.js`), total **15.0s**:

| # | Beat | Dur | Cum | Read |
|---|---|---|---|---|
| 1 | void | 0.8 | 0.8 | Black. Nothing. |
| 2 | materialize | 2.0 | 2.8 | Dots streak in — the hook. |
| 3 | knight | 2.4 | 5.2 | Hold + one raking sweep (p .12–.80 = 1.6s). |
| 4 | charge | 1.7 | 6.9 | Push to 1.22×, rising tremor, gold pre-flicker. |
| 5 | flash | 0.5 | 7.4 | Impact. |
| 6 | ignite | 2.2 | 9.6 | **The ignition wipe** — the best 2 seconds in the piece. |
| 7 | fire | 3.0 | 12.6 | Burning hold + a second sweep. Longest beat. |
| 8 | settle | 2.4 | 15.0 | Ride up, letterbox out, title from p>.18 (~2.0s on screen). |

### 9.1 The structural problem

**Interactivity is gated on the title card finishing.** The title is on screen
for the last ~2.0s and `endCinematic()` fires only when the timeline runs out,
so a viewer who is ready to press something at 10s has to wait 5 more seconds
for a card to fade. Those two things should be decoupled:

- End the director's *input lock* at the end of `ignite`/early `fire` (~10s):
  call `endCinematic()` there, fade the HUD in.
- Let the title card **persist over the interactive scene**, then dismiss on
  first input or after ~3s. `#title-card` is already `pointer-events: none` and
  `z-index`-separated, so this needs no layout work — just stop clearing
  `title-in` inside `endCinematic()` and clear it on the first
  `triggerTransform` / `pointerdown` instead.

That alone takes "time to interactive" from 15s → ~10s with **zero loss of
material**, which is the single highest-value motion change.

### 9.2 Is 15s too long?

For a shared link, yes — the honest budget is ~8–12s before a viewer wants
agency. But it is not uniformly too long; it is unevenly distributed. Cut the
dead air, keep the climax:

| Beat | Now | Proposed | Why |
|---|---|---|---|
| void | 0.8 | **0.35** | The boot overlay (§7) already served black. 0.8s of black *after* an unknown load wait is where people bounce. |
| materialize | 2.0 | 2.0 | Hold. This is the hook; it earns its time. |
| knight | 2.4 | **1.8** | Longest static beat and it is early. The sweep only needs ~1.3s. |
| charge | 1.7 | 1.7 | Hold. Tension needs length; this is correctly sized. |
| flash | 0.5 | 0.5 | Hold. |
| ignite | 2.2 | **2.6** | The ignition wipe is the best asset on the page and it currently plays *fastest*. Give it the time taken from `knight`. Slow the front, let the wavy edge read. |
| fire | 3.0 | **2.2** | Post-climax dwell — the longest beat sits *after* the payoff. The second sweep can live in 1.6s. |
| settle | 2.4 | 2.4 | Keep, but hand off input at p≈0.45 per §9.1. |
| **total** | **15.0** | **13.55** | Time-to-interactive ≈ **10.0s**, title still lands. |

### 9.3 Title at the end or the start?

**Keep it at the end.** Name-after-transformation is the genre's own grammar
(the eyecatch lands on the completed form), and the card is the only moment in
the piece with a real hero-type opportunity. The current problem is not the
order — it is that a *second*, weaker, differently-styled `WOLZARD` is bolted to
the top of the interactive state and pre-empts it. Fix that by shrinking the
persistent wordmark to a corner signature (§2), and the end card becomes the
payoff it was designed to be.

### 9.4 Smaller notes

- **Skip appears at t=0** as the only lit pixel on a black screen. That frames
  the piece as an ad. Delay its *appearance* to ~0.8s (CSS `transition-delay`,
  §4.2) while keeping it operable from frame one so SC 2.2.2 still holds.
- **The two sweeps are the same gesture twice** (`knight` p.12–.80 and `fire`
  p.08–.62), 7 seconds apart, only differing in colour. Consider reversing the
  direction or steepening the angle on the second one so it reads as a
  consequence rather than a repeat. (Cheap: negate the sweep position in
  `drawSweep` for the fire pass.)
- **`settle` rides the figure up by `H * 0.1`** to clear space for the title.
  On a landscape phone (`H = 390`) that is 39px — not enough to clear an 80px
  title. Make it proportional to the title block, e.g. `y: -Math.max(H * 0.1,
  0.5 * titleBlockHeight)`, or bias it on short viewports.
- **`R` during the cinematic** calls `figure.scatter()` and breaks the shot
  (`main.js:131` is unguarded). Guard it (§5.3).

---

## 10. Cut this

Explicit removal list, highest value first:

1. **`#hud-top` entirely** (`h1` + `.subtitle`) — replaced by a ~20px top-left
   lockup. Removes the wordmark duplication *and* stops the chrome sitting on
   the helmet crest. Biggest single win on the page.
2. **`#form-label` as a standalone element** — the readout moves into the
   control bar as a chip next to the button that changes it. Removes a
   fixed-position element, its mobile override, and the ≤560px collision.
3. **`Re-materialize` button** — jargon, lowest-value action, occupying 1/3 of
   the primary control surface. Keep the `R` shortcut in the legend.
4. **The `#hint` sentence as written** — three clauses, 11px, 2.86:1. Replaced
   by three `<kbd>` chips at 12px / 72% opacity, hidden on coarse pointers.
5. **The `⚔` glyph** (`.btn .glyph` + the rule) — renders as a colour emoji on
   most platforms and is announced as "crossed swords".
6. **`.toggle` / `.toggle input` rules** (`style.css:227–235`) — dead code, no
   `.toggle` element exists in `index.html`.
7. **`0.32em` / `0.30em` tracking on display sizes** — keep loose tracking only
   below ~14px.
8. **`body { user-select: none }` as a blanket rule** — scope it so the title
   and credits stay copyable.
9. **`#btn-skip`'s hover-only opacity bump as its sole affordance** — replaced
   by a solid backing plus a real focus ring.
10. **The em-dash tautology in `Henshin — Transform`** — the label states the
    destination instead (`Henshin` / `Revert`).

Net: the page loses one whole element, one button, one glyph, one dead CSS
block, and gains a scrim, a focus style, a live region and a boot state.

---

## 11. Suggested order of work

1. **A11y correctness (no visual change):** key-repeat/flash guard, `R` guard,
   Space-vs-focused-button fix, `visibility: hidden` on hidden chrome, Skip DOM
   reorder, `role="img"` + label, `role="status"` live region, `:focus-visible`.
   ~1 hour, removes every Level-A concern.
2. **Contrast + scrim:** `#app::after`, hint→legend at 72%, ghost-button border
   to `.22`, fire-gradient dark stop to `#d7431a`. ~30 min, fixes all AA fails.
3. **Composition cut:** delete `#hud-top` and `#form-label`, add the lockup and
   the dock, move the form chip into the bar.
4. **Type:** commit `Archivo[wdth,wght].woff2` + `OFL.txt`, add the tokens,
   apply the scale.
5. **Boot overlay + `modulepreload` + metadata head.**
6. **Motion retiming + early handoff** (`director.js` durations, `endCinematic`
   decoupled from `title-in`).
7. **Responsive:** the four breakpoints, 44/48px targets, tap-to-henshin.

Steps 1–2 are the ones I would not ship without.

---

## Unresolved questions

1. **Font file acceptable?** The whole typography recommendation hinges on
   committing one ~100 KB `.woff2` to the repo. If the answer is "no new binary
   assets", fall back to §3.4 and accept a clean-but-not-heroic result.
2. **Keep `Re-materialize` at all?** I recommend cutting the button. If it is a
   feature you actively demo, say so and it becomes a third ghost button rather
   than a keyboard-only easter egg.
3. **OG image** — happy to spec the crop and overlay, but someone has to capture
   the frame; do you want the Knight form, the Fire form, or the mid-ignition
   wipe (my pick — it is the most distinctive frame in the piece)?
4. **Is a `docs/design-guidelines.md` wanted?** The tokens, type scale and
   states in this report are the seed of one. Not created — out of the stated
   scope.
5. **Resize during play** rescales the canvas against already-rasterised dot
   buffers (`figure.prewarm` runs once, `main.js:187–191`). Suspected blur after
   a mobile URL-bar collapse or a desktop window resize. Flagged only —
   rendering was out of scope.
