# Wolzard Showcase - Concept Debate & Ranked Recommendation

Advisory only. No files were modified. Date: 2026-07-25.

---

## 0. Two measured facts that change the premises

Before any debate, I measured the repo. Two things in the brief are wrong in ways
that matter.

### 0.1 The wire cost is not 947 KB

| Form | Bytes |
| --- | --- |
| `src/wolzard-dots.js` raw | 946,968 |
| gzip -9 | 310,293 |
| brotli -q11 | 195,865 |

GitHub Pages gzips JS. Real transfer is **~310 KB**, not 947 KB. Heavy, but not the
emergency it looks like.

**The actual cost is parse + construction, not transfer.** The file is 52,687 nested
array literals, so the engine allocates ~52k arrays plus 158k numbers before your
code runs. Then the DotFigure constructor builds 6 Float32Arrays, 3 Uint8Arrays and
**105,374 template-string allocations** (`knightStr` + `fireStr`). Then `prewarm()`
synchronously rasterises **2 x 52,687 `arc()` calls** (README: "a few hundred ms").

Load profile: network ~310 KB, then a **single unbroken main-thread block** of
roughly 0.4-0.8 s on desktop and plausibly 1.5-3 s on a mid phone, during which
nothing can be drawn and no JS-driven feedback is possible. Optimising bytes is the
wrong lever. Optimising *the experience of the block* is the right one.

### 0.2 The dot data is literally a 244 x 330 image

Measured: x takes 244 unique values on a stride of 3, y takes 330 unique values on a
stride of 3, 80,520 grid cells, 52,687 filled = 65.4 % coverage.

There is no cleverness in the data. **It is a 244 x 330 RGBA raster with an alpha
mask, re-encoded as JavaScript at roughly 18 bytes per pixel.** A 244 x 330 PNG of
photographic content lands around 90-140 KB, lossless WebP lower, and decodes off
the main thread in single-digit milliseconds instead of blocking the parser.

This reframes several later ideas (variable dot density, perf tiers, the Lab
sliders) from "impossible" to "nearly free". I return to it at #8.

### 0.3 A real bug: the figure is cropped on phones

`main.js:222` - `const scale = (H * 0.74) / figure.vh;`

Height-only fit. On a 390 x 844 phone: `scale = 0.6246`, figure width
`739 * 0.6246 = 461 px` against a 390 px viewport. **The helmet is clipped by ~18 %
on each side**, and the `charge` beat zoom of 1.22 makes it worse. Most links are
opened on phones. This one line quietly destroys the first impression for the
majority of a shared link audience.

Fix: `Math.min((H * 0.74) / figure.vh, (W * 0.9) / figure.vw)`. Ranked #1 not
because it is interesting but because everything below is worthless while it is
broken.

---

## 1. Debate: is one 15 s cinematic + a toggle enough?

### The case FOR "single perfect shot"

Strong. The cinematic in `director.js` is genuinely well-directed: 8 beats, a real
tension curve (void, materialize, hold, charge, flash, ignite, hold, settle), and a
payoff. Sequence pickers are where demos go to die - a menu of 8 animations converts
an *experience* into a *file browser*; the visitor watches two, learns they are
variations, and leaves less impressed than if they had seen only the best one. Every
extra named sequence also dilutes the one you spent the most craft on. A picker
implies a promise: that the sequences are equally good. They will not be.

### The case FOR "a suite the visitor can pick"

Also strong, for a reason about *legibility of effort* rather than entertainment.
Right now a visitor cannot tell how much is here. They see one film, press Space, see
a colour change. The engine underneath - a beat-driven director, a composited
ignition wipe, a bloom chain, a particle system - is invisible. Naming things is how
you make work visible. And the page has a genuine re-engagement problem: after
`endCinematic()` the only affordances are "watch that again" and "toggle a colour".
There is nothing to *do*.

### The distinction that resolves it

Ask of each candidate: **does the silhouette behave differently, or does the frame
just look different?** Silhouette behaviour reads as a new animation. Screen-space
tinting reads as a filter.

| Candidate | Silhouette behaves differently? | Verdict |
| --- | --- | --- |
| Materialize | Yes - dots travel | Exists |
| Henshin / Ignite | Yes - wavy front crosses the form | Exists |
| **Dissolve / Disintegrate** | Yes - form erodes into embers | **New animation** |
| **Glitch / scan** | Yes - slices displace, form tears | **New animation** |
| Shatter | Yes, but it is Dissolve with a different velocity field | Merge into Dissolve |
| Idle-loop | Barely - drift + embers already exist | Effect, not animation |
| Portrait-orbit | No - there is no depth to orbit | Reject (see section 5) |
| "Charge-up" variant | No - more bloom on the same beat | Effect, not animation |

**Verdict: three real animations, not eight.** Materialize and Ignite exist. Add
**Dissolve** and **Glitch/scan** - four total, enough to justify a picker, each
honestly distinct. Refuse the other four; a picker with eight entries of which four
are re-tints is *less* impressive than four honest ones, because the visitor notices
the padding.

Structural bonus: Dissolve is a natural *loop closer*. Materialize, Ignite, Dissolve,
black, Materialize gives an endless, non-repetitive attract loop out of three
sequences. That is a better use of Dissolve than a menu item.

---

## 2. Debate: page architecture

### (a) Single immersive full-bleed canvas + minimal HUD - the status quo

**FOR:** Correct format for a cold link click. No chrome competes with the artwork,
the cinematic gets the whole viewport, and it is the only architecture where
`overflow: hidden` plus a fixed-position canvas - the current CSS - is the right call.

**AGAINST:** Zero depth for the curious. A visitor who wants to understand what they
are looking at gets a hint line and three buttons.

### (b) Scroll-driven / scroll-scrubbed narrative

**FOR:** Scroll-scrubbing is the most reliably impressive interaction pattern on the
web right now, and it fixes the worst structural flaw of the cinematic - that it is
**forward-only and unreviewable**. A visitor who blinks through the flash beat can
only restart from black. Scroll gives frame-level control of the exact moment they
want, plus room for captions explaining the technique.

**AGAINST - the decisive objection:** `director.js` is a **forward-only state machine
with side effects**, so it is not scrubbable without a rewrite. Concretely:

- `enter()` hooks fire imperatively (`camera.kick`, `shockwaves.spawn`, `figure.scatter`).
- `this._fired`, the `once()` guard set, is monotonic - it never un-fires.
- The camera integrates toward targets with `lerp(..., dt * stiffness)`; its state at
  time t depends on the path taken to t, not on t.
- `figure.particles` is an integrated particle system with no inverse.
- `figure.assemble` accumulates `dt / 1.35`.

Scroll-scrubbing requires the timeline to be a **pure function of t**. Making it one
means rewriting the camera as sampled keyframes, replacing the particle system with a
deterministic seeded-noise field, and deleting `once()`. That is an L-effort rewrite
of the three modules that currently work best, with high regression risk to `?still`
and reduced-motion. Secondary: scroll-jacking on mobile is where "impressive"
reliably becomes "broken", and a tall document fights the current fullscreen CSS.

**Verdict: reject (b).** But extract its one genuine insight - *reviewability* - and
buy it 80 % cheaper:

> **Shot list plus `director.seek(beatIndex)`.** A horizontal strip of the 8 beat
> names. Clicking one restarts the director at the start time of that beat. Seeking
> **forward to a beat boundary** needs no time-reversal: reset figure and camera to a
> known state, clear particles and shockwaves, replay `enter()` for the target beat,
> run. No purity rewrite, no scroll hijack, and it *reads as* "this thing has eight
> distinct shots" - exactly the plural animations the user asked for, delivered by
> labelling work that already exists.

Highest-leverage idea in this report, at M effort.

### (c) Showcase gallery / lab with parameter controls

**FOR:** Cheap, because the architecture already anticipated it. `look` is a plain
object produced once per frame and consumed by one draw path, so a slider panel that
overrides fields on `look` is nearly free. `WIPE_COLS`, bloom strength, grain,
vignette, letterbox, `driftAmp` and ember rate are all already parameters. For a
technical audience, a live "wipe columns: 72" slider communicates craft better than
any amount of bloom.

**AGAINST:** A visible slider panel on load says "unfinished dev tool", not
"impressive". It is also the most tempting place to burn effort for the least
first-impression return - the visitor who tweaks sliders was already impressed. And
the one slider that would genuinely stop people, **dot density**, is impossible with
the baked JS data (see #8).

**Verdict: keep, behind one click.** Progressive disclosure answers the whole
question:

1. Cold link: cinematic, no chrome. Option (a), unchanged.
2. Handoff: HUD fades in plus a shot-list strip. The payoff of (b), cheaply.
3. One click on "Lab": drawer with live look params. Option (c), opt-in, `?lab`
   deep-link.

They coexist because they are *sequential*, not simultaneous. Nothing in (c) is
visible until the visitor has already seen the film.

---

## 3. Debate: the first three seconds

### What actually happens today

1. Browser paints the CSS radial gradient on `body` (dark). Good - not white.
2. `main.js` imports 947 KB of module. **Main thread blocks.** No feedback possible.
3. Constructor: 9 typed arrays plus 105k strings. **Still blocked.**
4. First rAF, then `prewarm()`, then 105k `arc()` calls. **Still blocked.**
5. The `void` beat: **0.8 s of deliberate black.**
6. Dots streak in.

Steps 2-4 are an invisible block of unknown length. Step 5 then adds 0.8 s of
*intentional* black on top of it. On a mid-range phone the visitor may sit on an empty
dark screen for 2-4 seconds with no signal that anything is loading.

**Is straight-to-black-then-materialize the strongest opening? No.** It is a film
convention imported into a medium where it fails. In cinema, black before fade-in is
anticipation because the audience knows the projector works. On the web, **a black
screen means broken**, and the thumb is already moving toward back. The 0.8 s void
beat is the most confident-looking and most costly beat in the timeline.

### Loading strategy options

**(i) A designed loader that IS part of the show.** FOR: the only option that
addresses the real problem, which is that the block is unavoidable. AGAINST: loading
screens are a smell. Rebuttal: not when the wait is real and honest.

The decisive technical detail: **a CSS loader animated purely with `transform` and
`opacity` keeps animating during the main-thread block**, because those properties are
composited off the main thread. A JS-driven or width/filter-driven loader would freeze
solid and look worse than black. So the loader must be:

- in the initial `index.html`, since it has to render before the module parses,
- styled in `style.css`,
- animated with transform rotate/scale plus opacity only,
- removed by `main.js` after `prewarm()`.

A slowly rotating gold sigil or magic circle is on-theme for Magiranger, costs no
bytes, and turns dead air into anticipation. Effort **S**, and the highest-value
change in this report after the mobile fix.

**(ii) Progressive reveal** - stream the data, start with a subset. FOR: dots
appearing in tranches is thematically perfect. AGAINST: it is visually
**indistinguishable from the materialize beat you already have** - you would build a
streaming loader to reproduce an effect that already plays two seconds later. Real
complexity, zero incremental perception. **Cut.**

**(iii) Tiny inline low-res preview.** A ~2 KB inline base64 WebP of the finished
portrait, heavily blurred, behind the loader. FOR: instant "here is what you are
waiting for". AGAINST: it spoils the reveal the entire cinematic is built around.
**Verdict: use it for the `?still` path and the OG image, not the cinematic entry.**
If used on the cinematic entry, crush it to a near-black silhouette so it teases a
shape without giving away the render.

**(iv) Trim the void beat.** `void.dur` from 0.8 to about 0.35, and put one visible
thing in it - the letterbox bars snapping in, or a single gold flicker. The frame
should never be *empty*, only *dark*. Effort **S**, `director.js` only, one number and
two lines.

**Verdict on section 3: take (i) and (iv), reject (ii), scope (iii) to stills and OG.**

---

## 4. Debate: shareability

### OG / Twitter card

Right now a shared link unfurls as a bare title with no image. For a project whose
entire value is visual, **this is the largest single impressiveness leak in the
project** - most people first meet it as a link preview, and that preview currently
shows nothing.

Can it be done without a build step? Yes, and the confusion is worth naming:

- **Commit a static `og.png`, hand-exported once from the running page.** A committed
  binary artifact is *not* a build step - it is the same category as
  `wolzard-dots.js`, which is also generated and committed. The image will never need
  to change. Effort **S**: one PNG plus five meta tags in `index.html`.
- **A Playwright or Puppeteer GH Action that re-renders it on push.** This *is* a
  build step, adds npm to CI, and exists to regenerate a file that changes never.
  Absurd overkill. **Reject.**

Also add `twitter:card` as `summary_large_image`, `og:image:width` and `og:image:height`,
and a real `og:description`. And a plain meta description - there is none today.

### Deep links

`#fire` and `?still` exist and are good. Once `seek()` exists (section 2),
`?shot=charge` falls out for free, as does `?lab`. Effort **S** on top of `seek()`.

### In-browser recorder: MediaRecorder plus canvas captureStream

**FOR:** Zero dependencies, works on static hosting, and download-the-clip-you-just-made
is a genuine differentiator that drives organic sharing. The most *novel* idea on the
list.

**AGAINST, and one of these is fatal:**

1. **The payoff shot is not on the canvas.** `#title-card`, `#hud-top` and
   `#form-label` are DOM elements. `captureStream()` captures the canvas *only*. So
   the recorded clip ends on the fire portrait with **no title card** - the exact
   frame the whole 15 s builds toward is missing. Users will read this as a bug,
   correctly. Fixing it means porting the title card into canvas text rendering, which
   means reimplementing clamped type sizing, letter-spacing and layered text-shadow
   glow in Canvas 2D. That converts an S-effort toy into an L-effort project.
2. **Codec reality.** Output is WebM/VP9. Safari support for MediaRecorder on canvas
   streams is historically patchy, iOS worse. Windows tooling and several social
   platforms handle WebM poorly. You would ship a button producing a file a third of
   your visitors cannot use.
3. **GIF requires a dependency** such as gif.js, which breaks zero-dep, and a
   256-colour palette will band the fire ramp and the bloom into visible mud. Dark,
   glowing, grainy content is the worst possible case for GIF.
4. Recording a 15 s 1080p canvas stream while also running the bloom chain will drop
   frames on exactly the machines where the visitor most wants a clip.

**Verdict: cut the recorder.** Ship its cheap, robust cousin instead:

> **Save frame, via `canvas.toBlob()` and a download link.** About 15 lines, no
> dependency, works in every browser, produces a PNG that is trivially shareable
> everywhere, and has none of the codec or DOM-compositing problems. It also doubles
> as the tool you use to produce `og.png`.

A case where the 20 % solution is not a compromise - it is strictly better per unit of
effort and per unit of risk.

---

## 5. Debate: depth without 3D

This is the central engineering tension, so I will be precise about cost. Current
steady state: **2 drawImage calls** - background gradient plus figure blit - plus the
bloom chain of about 6 blits. Budget is enormous. The fly-in is **52,687 fillRects per
frame** and is the only expensive path.

The critical reframe:

> **Per-dot cost is affordable in *bursts*, not in *steady state*.** The fly-in
> already proves 52k fillRect per frame is survivable for about 1.4 s. Anything
> transient may be per-dot. Anything always-on must be buffer-composited.

Every idea below is judged on that line.

| Idea | Cost model | Breaks one-blit? | Verdict |
| --- | --- | --- | --- |
| Cursor-tracked camera (`camera.tX/tY/tRot` chase the pointer) | 0 extra draws - it is the existing transform | **No** | **Take.** S effort, `camera.js` plus one listener in `main.js`. |
| Counter-moving background (gradient centre offsets opposite the camera) | 0 extra draws - same gradient, different centre | **No** | **Take.** S, `main.js` `drawBackground`. This is what converts camera-follow into perceived parallax. |
| In-silhouette moving specular | +1 blit | **No** | **Take.** See below. |
| 2.5D tilt (horizontal squash on the blit) | 0 extra - one more scale factor | **No** | Weak alone; harmless with the above. |
| Luminance-derived depth bands (N layers, N offsets) | 2N blits, N times buffer memory | No, still blits, but **N times memory** | **Conditional.** See below. |
| Per-dot cursor repulsion, always on | 52k fillRect per frame forever | **Yes, fatally** | **Reject as always-on.** |
| Per-dot displacement as a *triggered burst* | 52k fillRect for about 1 s, then back to blit | No - transient | **Take, as Dissolve/Shatter.** |
| Gyro parallax on mobile | 0 extra - feeds the same camera | **No** | Cheap add-on. Needs DeviceOrientation permission on iOS - one prompt, and prompts on load are a smell. Ship sensor-only where no prompt is needed, or skip. |
| Audio reactivity | 0 extra - drives `look` fields | **No** | Only meaningful if audio ships. See section 6. |

### The specular highlight - the best depth-per-effort on the board

The technique already exists in this codebase. The hot-edge pass in `_drawIgnition()`
re-draws the fire buffer over itself in `lighter` mode with a bell-curve alpha, and the
comment states the reason: *"Sourcing it from the buffer keeps the glow inside the
silhouette."*

Apply the same trick with a cursor-following radial gradient instead of a horizontal
band: draw the buffer once more in `lighter` mode, clipped or alpha-masked to a soft
radial falloff centred near the pointer. Result: **a bright metallic highlight that
slides across the armour and never leaves the silhouette.** Cost: **one extra
drawImage.** It reads as curved metal because that is exactly how specular highlights
on curved metal behave - brightness varies with view angle.

Combined with camera-follow and a counter-moving background, three S-effort changes
totalling one extra draw call produce a convincing sense of a solid object in a room,
with the one-blit architecture fully intact. **This is the answer to depth without 3D.**
Modules: `dot-figure.js`, which owns buffer access, plus `camera.js` and `main.js`.

### Depth bands - the honest cost of real parallax

Real parallax needs relative motion between parts, which needs layers. Splitting the
dots into N luminance bands and rasterising 2N buffers keeps the blit architecture -
2N draws is still trivial - but multiplies memory:

Desktop 1080p: figure about 800 x 547 css px, `bufDpr = min(3, 2 * 1.25) = 2.5`, so
2000 x 1368 x 4 B is about **10.9 MB per buffer**. Today: 2 buffers, about 22 MB. With
4 bands: 8 buffers, about **87 MB of canvas memory.** On a phone the figure is smaller,
about 7 MB per buffer, so about 29 MB for 4 bands - survivable but not comfortable, and
Safari is the least forgiving about canvas memory.

Per-band bounding boxes do **not** help: luminance bands are spatially interleaved
across the whole helmet, so every band bbox is the full figure.

Mitigation if you want it: **2 bands, not 4** - one threshold splitting bright trim from
dark body - giving 4 buffers, about 44 MB desktop and 15 MB mobile, and drop `bufDpr`
for the back band since it is behind. Effort **M**, medium risk.

**Verdict: do the free trio first** - camera-follow, counter-background, specular. Ship
it and look at it. My honest prediction is that it will read as sufficiently volumetric
and you will not want the bands. Only if it does not should you spend M effort and 2x
memory on 2-band parallax. Do not build 4 bands.

---

## 6. Debate: sound

**FOR:** Sentai *is* an audio-native genre. The henshin sting is as iconic as the suit.
A silent transformation sequence is missing the thing that makes the transformation
land. Of everything in this report, audio has the highest ceiling on emotional payoff.

**AGAINST, four distinct objections:**

1. **Autoplay policy defeats the exact use you want.** The opening cinematic plays on
   load with no gesture, so it will be **silent for every first-time visitor**. The
   only fix is a click-to-begin gate, which destroys the cold open that is currently
   the best asset the page has. You cannot score the cinematic. Accept it.
2. **Rights posture materially worsens.** The dot art is a stylised derivative of a
   photograph - defensible-ish fan work. Redistributing the actual Toei henshin SFX is
   distributing the rightsholder audio recording verbatim. That is a different and
   worse category, and it is the kind of thing that attracts takedowns where dot art
   does not.
3. **Weight.** You are already the heaviest thing you can be. A decent sting plus an
   ambient drone is 200-600 KB, competing directly with a payload you cannot currently
   reduce.
4. **Muted-by-default audio lands for essentially no one.** A speaker icon in a corner
   is clicked by a rounding error of visitors.

### The synthesis that beats both positions

**Generate the audio with WebAudio. Zero bytes, zero rights exposure, gated on the
gesture you already have.**

A convincing henshin impact is a filtered noise burst for the crack, a fast descending
sine sweep for the body, a short resonant band-passed ring for the metal, and an
optional rising saw riser for the charge. That is about 60-80 lines of oscillator and
biquad graph. Nothing to download. Nothing that belongs to Toei. And it fires on Space
or the Henshin button - **which is a user gesture, so the AudioContext is allowed to
start.**

The resulting design works *with* the autoplay policy instead of against it:

- Cinematic on load: **silent**, as today, unchanged, no gate, no regression.
- Interactive henshin: **has sound**, because the visitor just pressed a key.
- Replay cinematic via button or `C`: also a gesture, so the *replay* can be scored - a
  hidden reward for anyone who watches twice.

Effort **M**. New module `src/audio.js` - a new file, but a genuinely new boundary,
since nothing existing owns audio, so it does not violate the module structure. Risk
low; the whole thing sits behind one feature flag and one gesture. Must be a no-op
under `prefers-reduced-motion`.

Audio reactivity from section 5 becomes nearly free once this exists: the synth envelope
values can drive `look.bloom` and `look.flash`, costing zero draw calls.

---

## 7. What to explicitly NOT do

With teeth, as requested.

1. **A WebGL or Three.js rewrite for real 3D.** There is no depth data. It is a trace
   of one photograph. You would spend L effort to arrive at a textured quad in a 3D
   scene - which is functionally what you have, minus the hand-tuned 2D compositing you
   would then have to rebuild in shaders. Also: the deploy workflow comment still claims
   *the app loads Three.js from a CDN import map*. That is stale and should be corrected
   before it tempts someone.
2. **Scroll-scrubbed narrative.** Section 2. `director.js` is forward-only with side
   effects; making it scrubbable is an L rewrite of the three best modules, with
   regression risk to `?still` and reduced-motion, in exchange for an interaction
   pattern that also breaks on mobile.
3. **More dots.** 52,687 dots at the default scale already exceed useful screen
   resolution - dot radius is `max(0.8, cell * scale * 0.62)`, which is near sub-pixel
   already. Additional dots buy **zero visible fidelity** and cost load time linearly.
   The most recent commit, ultra-sharp at about 52k, is the last one that should have
   gone in that direction. The density ratchet is done. Stop.
4. **More post effects.** This is the trap this project is *most likely* to fall into,
   precisely because post is cheap and the budget is huge. Chromatic aberration plus DOF
   plus lens flare plus anamorphic streaks stacked on the existing
   bloom/grain/vignette/letterbox/sweep/flash/shockwave set does not read as
   impressive, it reads as **a filter preset**. The existing bloom is already doing
   heavy lifting; adding to it lowers contrast and makes the dot art - the actual
   subject - less legible. Any new effect should *replace* budget, not add to it.
5. **The GIF or WebM recorder.** Section 4. The title card is DOM and will be missing
   from the capture; Safari support is patchy; GIF needs a dependency and will band the
   fire ramp into mud. Ship Save-frame instead.
6. **Always-on per-dot cursor interaction.** 52k fillRect per frame in steady state
   discards the single optimisation the whole project is built on, to add an effect the
   visitor notices for four seconds.
7. **A multi-character roster or gallery.** There is one model. A gallery with one item
   is worse than no gallery - it advertises absence.
8. **A physics engine such as matter.js for shatter.** A seeded velocity field plus
   gravity is 20 lines and indistinguishable at this dot size and duration. A dependency
   for this is unjustifiable.
9. **GSAP or any animation library.** `director.js` plus CSS transitions already do
   everything needed, and `look` is a better abstraction for this problem than a generic
   tween library.
10. **A share-to-X button.** Nobody clicks them. Correct OG tags do the entire job and
    are invisible.
11. **Analytics, consent banner, newsletter capture.** On a non-commercial fan-art page
    these are pure credibility loss.
12. **Requesting fullscreen, or a gyro permission, on load.** A permission dialog before
    the visitor has seen anything is the fastest route to a bounce.
13. **A visible FPS or dot-count debug readout in the default view.** It says prototype.
    Put it in the Lab drawer if anywhere.

---

## 8. The deferred item I would argue hardest for

**Replace `src/wolzard-dots.js` with a 244 x 330 PNG.**

Per section 0.2, the data is exactly a 244 x 330 RGBA raster. Ship it as an image,
decode it with `createImageBitmap` plus one offscreen `getImageData`, and rebuild the
typed arrays in a loop of 80,520 iterations - single-digit ms.

Payoff:

- Transfer drops from about 310 KB gzip to roughly 90-140 KB.
- The parse block **disappears** - image decode is off the main thread.
- **Dot density becomes a runtime parameter.** Sample every cell for desktop, every
  other cell for low-end mobile - an automatic perf tier for free. And it makes the most
  compelling Lab slider possible, dots at 13k versus 52k, which is the one control that
  would make a technical visitor actually stop and play.
- `getImageData` on a same-origin image on Pages has no CORS problem.

Costs and honest risks:

- The generation pipeline is **not in the repo** - no script, only the committed output.
  That is a repo-health problem independent of this idea.
- Mitigation that removes the blocker: because the data is a perfect grid, a roughly
  30-line one-off script can read `wolzard-dots.js` and emit the PNG. **Reproducible
  from what is already committed**, no rembg re-run, no access to the original photo.
- `main.js` becomes async before the first frame. That is fine and arguably more honest,
  but it must not regress `?still` or reduced-motion, which is the real test.
- The PNG is a committed artifact, exactly like the current JS. **Still no build step.**
  Effort **M**, medium risk.

Ranked #8 rather than higher only because its user-visible payoff is *load speed*, and
the CSS loader at #3 already makes the wait tolerable. If you want an eighth change,
this is the one. If you ever want the density slider, it is mandatory.

---

## 9. Ranked shortlist - best impressiveness per effort, in implementation order

| # | Change | Effort | Risk | Modules | One-blit | Build step |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **Fit-to-viewport scale** - `min` of height and width fit; stops the helmet being cropped about 18 % on phones | **S** | Low | `main.js` | Safe | None |
| 2 | **OG / Twitter card plus meta description** - one hand-exported `og.png` committed as an artifact | **S** | Low | `index.html` plus 1 PNG | Safe | None |
| 3 | **Compositor-only CSS loader plus trim void from 0.8 s to about 0.35 s** - transform/opacity keyframes keep animating through the main-thread block | **S** | Low | `index.html`, `style.css`, `director.js` | Safe | None |
| 4 | **Depth trio: cursor-tracked camera, counter-moving background, in-silhouette specular** - total one extra draw call | **S-M** | Low | `camera.js`, `main.js`, `dot-figure.js` | **Preserved**, +1 blit | None |
| 5 | **Shot list plus `director.seek(beat)` plus `?shot=` deep links** - forward-only seek, no purity rewrite; delivers plural animations from work already done | **M** | Med | `director.js`, `main.js`, `index.html`, `style.css` | Safe | None |
| 6 | **Two genuinely new sequences: Dissolve (transient per-dot) and Glitch/Scan (screen-space slice displacement plus RGB split)**, plus the Materialize-Ignite-Dissolve attract loop | **M** | Low-Med | `dot-figure.js`, `effects.js`, `director.js` | Dissolve is a *burst*, same cost as the existing fly-in then back to blit; Glitch is pure blits | None |
| 7 | **WebAudio synthesised henshin sting, gesture-gated** - zero asset bytes, zero rights exposure; cinematic stays silent, interactive henshin and replays are scored | **M** | Low | new `src/audio.js`, `main.js` | Safe | None |
| - | *(#8, deferred)* **PNG-sourced dot data** - kills the parse block, about 2.5x lighter wire, unlocks a runtime density slider | **M** | Med | `dot-figure.js`, `main.js`, one-off gen script | Safe | None, committed artifact |

Fold in during #5, near-free once the strip exists: a collapsed **Lab drawer** overriding
`look` fields, a `?lab` deep-link, and **Save frame** via `canvas.toBlob()`, which is
also how you produce the `og.png` for #2.

Every item above preserves the one-blit optimisation and requires no build step and no
npm. Nothing here regresses `?still`, `#fire` or `prefers-reduced-motion`, provided the
pointer handlers in #4 and the audio in #7 are both no-ops under reduced motion.

### Cut list

| Rejected | Why |
| --- | --- |
| **In-browser WebM/GIF recorder** | The title card is DOM, so `captureStream()` loses the payoff frame; patchy Safari support; GIF needs a dependency and bands the fire ramp into mud. Ship `canvas.toBlob()` Save-frame instead. |
| **Scroll-scrubbed narrative** | `director.js` is a forward-only state machine with side effects - `once()`, camera lerp, particle integration. Scrubbing demands a pure function of t: an L rewrite of the three best modules, with regression risk, for a pattern that also breaks on mobile. Buy its one real benefit via `seek()` at #5. |
| **More dots / higher density** | 52,687 already exceeds useful screen resolution at the default scale. Zero visible fidelity gain, linear load cost. The ratchet is finished. |
| More post effects: chromatic aberration, DOF, lens flare | Cheap to add, which is the trap. Reads as a filter preset and reduces legibility of the actual subject. |
| WebGL / Three.js rewrite | No depth data exists. L effort to reproduce what already works. |
| 4-band luminance parallax | About 87 MB canvas memory on desktop. Do the free depth trio first; you will probably not want this. |
| Always-on per-dot cursor repulsion | Discards the one-blit architecture permanently for a four-second novelty. |
| Multi-character roster | One model. A one-item gallery advertises absence. |
| Physics engine for shatter | 20 lines of seeded velocity plus gravity is indistinguishable here. |
| GSAP or animation library | `look` plus `director.js` is already the better abstraction for this problem. |
| Share buttons, analytics, consent banner, fullscreen or gyro prompt on load | Credibility loss, bounce risk, or both. |
| Licensed Toei henshin SFX | Materially worse rights posture than the dot art, plus weight. Synthesise instead, #7. |

---

## 10. Is the page already near its ceiling?

Partly, and I want to be blunt about which parts.

**Near the ceiling:** the cinematic direction, the ignition wipe, the post-effect stack,
and the fidelity of the dot trace. The beat list in `director.js` is a well-shaped 15
seconds and I would not restructure it. The ignition wipe is the cleverest thing in the
repo and it is done. **Do not spend effort on the render or the timeline.** Further work
there is polish on something already good, and adding post effects will actively make it
worse.

**Nowhere near the ceiling:** everything around the render.

- The **first three seconds are unmanaged** - an invisible multi-second block followed by
  0.8 s of deliberate black. The best-directed cinematic in the world loses to a visitor
  who left during the load.
- **Mobile is broken**, section 0.3, and mobile is most of the audience for a shared link.
- **The link preview is empty**, so most people first meet the project via something that
  shows them nothing.
- **The engine is invisible.** Eight distinct beats exist, and are named in the source and
  nowhere else. Labelling them is the cheapest possible way to make 15 s of craft legible
  as 15 s of craft.
- **Nothing responds to the visitor** until the film ends. Pointer-reactive camera and
  specular fix that for one extra draw call.

Honest summary: **you have a very good renderer wrapped in a poor showcase.** Items 1-5
are all showcase work, not renderer work, and that is not a coincidence - it is where the
remaining impressiveness actually lives. Item 6 is the only one that adds new animation,
and it should be exactly two sequences, not eight.

---

## Unresolved questions

1. Who is the primary audience - Sentai fans, or developers? It changes whether the Lab
   drawer at #5 is a headline feature or a footnote.
2. Is a landscape-oriented mobile experience in scope, or is portrait-only fit at #1
   sufficient?
3. Do you still have the original rembg cutout PNG, or must the #8 image be reconstructed
   from the committed JS grid?
4. Should Dissolve be a menu item, an attract-loop closer, or both?
5. Is the current `?still` entry meant as a preview and OG source, or as a genuine
   accessibility path? It affects whether the inline LQIP from section 3 (iii) is worth
   adding.
