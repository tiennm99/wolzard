# Wolzard

A tiny WebGL toy that draws **Wolzard**, the Wolf Knight from *Mahou Sentai
Magiranger*, and animates his **Henshin transformation** from the base Knight
form into **Wolzard Fire** — built with **JavaScript + Three.js only**.

The whole character (armour, wolf-motif helmet, pauldron spikes, cape and living
sword) is modelled from Three.js primitives. A single `fireLevel` value morphs
the model between forms: gold trim re-forges into molten red-orange, the eyes
ignite, the cape deepens to crimson and living flames erupt from the armour.

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

## Files

- `index.html` — page shell, HUD and the Three.js import map.
- `src/style.css` — HUD / control styling.
- `src/wolzard-character.js` — builds the character and drives the two forms.
- `src/main.js` — scene, lights, camera, and the transform state machine.
