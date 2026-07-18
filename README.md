# Wolzard

A WebGL toy that draws **Wolzard**, the Wolf Knight from *Mahou Sentai
Magiranger*, as a detailed articulated action-figure and animates his **Henshin
transformation** from the base Knight form into **Wolzard Fire** — built with
**JavaScript + Three.js only**.

The whole figure is modelled from Three.js primitives: a wolf-head helmet
(silver muzzle, ears, fangs, glowing eyes, mane), layered ornate armour with a
chest wolf emblem, visible ball joints, gold-trimmed pauldron spikes, a folded
cape, an ornate wolf sword, and a hex display stand — lit with PBR metal
reflections and soft shadows. A single `fireLevel` value morphs between forms:
gold trim re-forges into molten red-orange, the eyes ignite, the cape brightens
to crimson and living flames erupt from the armour.

## Run

ES modules + an import map need to be served over HTTP (not opened as a
`file://` path). From the project root:

```bash
# any static server works — pick one you have
python3 -m http.server 8080
# then open http://localhost:8080/
```

Three.js is loaded from a CDN via the import map in `index.html`, so there is
**no build step and no `npm install`**.

## Controls

| Action | How |
| --- | --- |
| Transform (Knight ⇆ Wolzard Fire) | **Henshin** button, or press **Space** |
| Orbit the camera | drag |
| Zoom | scroll |
| Reset camera | **Reset Pose** button |
| Toggle idle spin | **Auto-rotate** checkbox |
| Open straight into Fire form | load the page at `#fire` (e.g. `.../wolzard/#fire`) |

## Files

- `index.html` — page shell, HUD and the Three.js import map.
- `src/style.css` — HUD / control styling.
- `src/wolzard-character.js` — builds the character and drives the two forms.
- `src/main.js` — scene, lights, camera, and the transform state machine.
