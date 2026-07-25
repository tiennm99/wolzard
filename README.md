# Wolzard

A 2D **dot-art** portrait of **Wolzard**, the Wolf Knight from *Mahou Sentai
Magiranger*, that animates his **Henshin transformation** from the base Knight
form into **Wolzard Fire** — built with **plain HTML5 Canvas 2D + JavaScript**
(no framework, no WebGL).

On load it plays a ~13.5 s **cinematic**: the dots streak in out of black, a
raking light passes over the armour, the frame shakes and flashes, fire climbs
the helmet, and the sequence settles onto a title card. Input takes over from the
`Wolzard Fire` beat onward (~9 s), so you never have to wait out the tail. Each
beat is also addressable on its own — see **Shots** below.

The portrait is traced from a high-resolution (1440×1080) photo of Wolzard's
wolf-motif helmet: the character is cut from its background with `rembg`
(u2net) and sampled through the resulting alpha mask into ~52,000 round colored
dots — so every edge of the helmet, gold trim and visor stays faithful to the
real suit. Each dot also carries a precomputed "fire" color (a molten ramp
keyed off its brightness).

To stay smooth at that dot count, the formed figure is rasterised once into
offscreen **Knight** and **Fire** buffers and then blitted each frame; only the
fly-in, the embers and the post effects draw dynamically. That leaves plenty of
per-frame budget, which is what pays for the cinematic:

- **Ignition wipe** — the transform is not a uniform fade. An `ignition` front
  climbs the figure in vertical slices, each offset by smooth noise, so fire
  spreads across the silhouette behind a wavy, glowing edge. Because both
  buffers share the same geometry, a fire slice replaces exactly the Knight dots
  it covers and the silhouette stays intact.
- **Post effects** — additive bloom (progressive 2× downscale chain), film
  grain, vignette, letterbox bars, flash, raking light sweeps and expanding
  shockwave rings.
- **Camera** — eased zoom/pan with handheld drift, breathing and decaying shake,
  plus a pointer-tracked parallax channel that layers over whatever the director
  is doing. Since the figure is one blit, a camera move costs a single extra
  transform.
- **Specular band** — a highlight that follows the cursor up and down the armour.
  It is the fire buffer re-added over itself inside a soft band, which keeps the
  glow inside the silhouette; a screen-space gradient could not do that.

Resizing does not re-rasterise the buffers per event — that costs 2×52k arcs and
a drag-resize would fire dozens. The canvas resizes immediately and the rebuild
is deferred until the size settles, blitting the existing buffer in between.

> Fan project. Wolzard and Mahou Sentai Magiranger are © Toei; the reference
> imagery belongs to its respective owners and is used here only to derive a
> stylized, non-commercial dot recreation.

## Run

ES modules must be served over HTTP (not opened as a `file://` path). From the
project root:

```bash
# any static server works — pick one you have
python3 -m http.server 8080
# then open http://localhost:8080/
```

No build step and no `npm install` — it's static files.

## Controls

| Action | How |
| --- | --- |
| Transform (Knight ⇆ Wolzard Fire) | **Henshin** button, **tap the artwork**, or press **Space** |
| Jump to a shot | **Shots** button, or press **1**–**6** |
| Skip the opening cinematic | **Skip intro** button, or press **Esc** |
| Replay the cinematic | **Replay intro** button, or press **C** |
| Save the current frame as a PNG | press **S** |
| Re-materialize the dots | press **R** |
| Open straight into Fire form | load the page at `#fire` |
| Skip the cinematic entirely (static view) | add `?still` to the URL |

### Shots

The cinematic's beats are individually addressable, so a link can point at the
moment worth seeing rather than at the start:

`?shot=materialize` · `?shot=knight` · `?shot=charge` · `?shot=ignite` ·
`?shot=fire` · `?shot=title`

Jumping puts the world into the state that beat assumes and runs from there, so
the timeline stays forward-only and nothing has to be replayed.

### Reduced motion

`prefers-reduced-motion: reduce` produces a genuinely **still** image: the
cinematic and fly-in are skipped, camera drift and breathing are off, embers are
suppressed, and the render loop stops instead of idling — frames are only drawn
while a transform is actually resolving. Manual transforms still work, without
the shake, flash or shockwave.

## Files

- `index.html` — page shell, HUD, title card, share metadata, and the inlined
  boot overlay (its animation is compositor-only, so it keeps moving through the
  long main-thread block where the dot data is parsed and the buffers built).
- `src/style.css` — HUD / control / title-card styling.
- `assets/` — `favicon.svg`, `apple-touch-icon.png`, and `og.jpg` for link
  previews. `og.jpg` is a screenshot of the page's own title beat; regenerate it
  by capturing `?shot=fire` at 1200×630 with the chrome hidden.
- `src/wolzard-dots.js` — generated dot data traced from the reference image.
- `src/dot-figure.js` — the dot renderer: assemble, ignition wipe, embers.
- `src/effects.js` — screen-space post effects (bloom, grain, vignette, flash,
  sweep, shockwaves, letterbox).
- `src/camera.js` — virtual camera: eased moves, drift, shake.
- `src/director.js` — the cinematic as a list of timed beats; emits a per-frame
  "look" and drives the camera and one-shot events.
- `src/main.js` — canvas setup, viewport fitting, input, the interactive
  transform state, and the render loop that applies whatever look is current.
