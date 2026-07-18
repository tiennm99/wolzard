# Wolzard

A 2D **dot-art** portrait of **Wolzard**, the Wolf Knight from *Mahou Sentai
Magiranger*, that animates his **Henshin transformation** from the base Knight
form into **Wolzard Fire** — built with **plain HTML5 Canvas 2D + JavaScript**
(no framework, no WebGL).

The portrait is traced from a high-resolution (1440×1080) photo of Wolzard's
wolf-motif helmet: the character is cut from its background with `rembg`
(u2net) and sampled through the resulting alpha mask into ~52,000 round colored
dots — so every edge of the helmet, gold trim and visor stays faithful to the
real suit. Each dot also carries a precomputed "fire" color (a molten ramp
keyed off its brightness); a single `fireLevel` value cross-fades from
purple-and-gold Knight into a lava-red **Wolzard Fire**, with rising flame
particles. On load the dots fly in and assemble into the figure.

To stay smooth at that dot count, the formed figure is rasterised once into
offscreen **Knight** and **Fire** buffers and then just cross-faded/blitted each
frame; only the fly-in and the flame particles draw dynamically.

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
| Transform (Knight ⇆ Wolzard Fire) | **Henshin** button, or press **Space** |
| Re-materialize the dots | **Re-materialize** button, or press **R** |
| Open straight into Fire form | load the page at `#fire` (e.g. `.../wolzard/#fire`) |
| Skip the fly-in (static view) | add `?still` to the URL (also honored for reduced-motion) |

## Files

- `index.html` — page shell and HUD.
- `src/style.css` — HUD / control styling.
- `src/wolzard-dots.js` — generated dot data traced from the reference image.
- `src/dot-figure.js` — the dot renderer: assemble, Knight/Fire recolor, particles.
- `src/main.js` — canvas setup, the transform state machine, and the render loop.
