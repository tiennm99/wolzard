// Canvas 2D bootstrap: plays the opening cinematic, then hands off to the
// interactive Knight <-> Wolzard Fire transform. No Three.js — plain 2D canvas.
//
// Each frame is described by a "look" object: the Director produces it during
// the intro, and the interactive state produces it afterwards. Rendering only
// ever reads the look, so both modes share one draw path.

import { WOLZARD_DOTS } from "./wolzard-dots.js";
import { DotFigure } from "./dot-figure.js";
import { Camera } from "./camera.js";
import { Director, SHOTS, baseLook } from "./director.js";
import {
  Bloom, Grain, Vignette, Shockwaves,
  drawFlash, drawSweep, drawLetterbox,
  clamp01, easeInOut, lerp,
} from "./effects.js";

const canvas = document.getElementById("scene");
// The page is always on a dark backdrop and nothing shows through, so an opaque
// context lets the compositor skip per-pixel blending on every full-screen pass.
const ctx = canvas.getContext("2d", { alpha: false });

const figure = new DotFigure(WOLZARD_DOTS);
const camera = new Camera();
const bloom = new Bloom();
const grain = new Grain();
const vignette = new Vignette();
const shockwaves = new Shockwaves();

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// --- Sizing ----------------------------------------------------------------
// Rebuilding the dot buffers costs 2x52k arcs, so it must not happen per resize
// event: a drag-resize or a phone rotation would fire dozens. The canvas resizes
// immediately (cheap) while the rebuild is deferred until the size settles; in
// between, the existing buffer is blitted at the new size.
const REBUILD_SETTLE_MS = 260;
let W = 0, H = 0, DPR = 1;
let canRebuild = true;
let settleTimer = 0;

function readDpr() {
  return Math.min(window.devicePixelRatio || 1, 2);
}

function resize() {
  DPR = readDpr();
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  vignette.invalidate();

  canRebuild = false;
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => { canRebuild = true; }, REBUILD_SETTLE_MS);
}
window.addEventListener("resize", resize);
resize();
canRebuild = true; // the very first build must not be deferred

// A monitor change can alter devicePixelRatio without firing `resize`, which
// would leave the canvas backing store at the wrong density.
if (window.matchMedia) {
  let dprWatch = null;
  const watchDpr = () => {
    dprWatch?.removeEventListener?.("change", onDprChange);
    dprWatch = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    dprWatch.addEventListener?.("change", onDprChange);
  };
  const onDprChange = () => { resize(); watchDpr(); };
  watchDpr();
}

/**
 * Fit the figure inside the viewport on BOTH axes. Fitting height alone cropped
 * roughly 18% off each side of the helmet on a portrait phone, and worse during
 * the charge beat's 1.22 zoom — so the widest camera push is budgeted for here.
 */
const MAX_ZOOM = 1.22;
function figureScale() {
  const byHeight = (H * 0.74) / figure.vh;
  const byWidth = (W * 0.82) / (figure.vw * MAX_ZOOM);
  return Math.min(byHeight, byWidth);
}

// --- Interactive transform state -------------------------------------------
// `hen` eases the ignition front between forms; `flashPulse` decays after each
// henshin so the manual transform gets the same punch as the cinematic one.
const hen = { from: 0, to: 0, t: 1, dur: 1.15 };
let flashPulse = 0;

const formNameEl = document.getElementById("form-name");
const titleFormEl = document.getElementById("title-form");
const liveEl = document.getElementById("live");
const btnTransform = document.getElementById("btn-transform");
const btnCine = document.getElementById("btn-cine");
const btnSkip = document.getElementById("btn-skip");
const btnShots = document.getElementById("btn-shots");
const shotsEl = document.getElementById("shots");

function setFormLabel(fire) {
  formNameEl.textContent = fire ? "Wolzard Fire" : "Wolzard";
  formNameEl.classList.toggle("fire", fire);
  btnTransform.classList.toggle("fire", fire);
  // Label the destination, not the current state.
  btnTransform.textContent = fire ? "Revert" : "Henshin";
  if (titleFormEl) titleFormEl.textContent = fire ? "FIRE" : "WOLF KNIGHT";
}

/** Announce only user-initiated changes; the per-frame look must not write here. */
function announce(text) {
  if (liveEl) liveEl.textContent = text;
}

// Rate-limit the transform. Without this, a held Space repeated at the key-repeat
// rate and each press drives a full-screen 0.75-alpha flash — around 30 flashes a
// second, which is a seizure risk (WCAG 2.3.1) rather than merely ugly.
const HENSHIN_COOLDOWN = 0.34;
let sinceHenshin = HENSHIN_COOLDOWN;

function triggerTransform() {
  // Mid-build-up the sequence owns the transform; once it is only holding, let
  // input take over rather than making the viewer wait out the tail.
  if (director) {
    if (!director.canYield()) return;
    director.skip();
    endCinematic({ keepTitle: true });
  }
  if (sinceHenshin < HENSHIN_COOLDOWN) return;
  sinceHenshin = 0;

  hen.from = currentIgnition();
  hen.to = hen.to >= 0.5 ? 0 : 1;
  hen.t = 0;
  const igniting = hen.to >= 0.5;
  setFormLabel(igniting);
  announce(igniting ? "Wolzard Fire" : "Wolzard, Wolf Knight form");

  if (reduceMotion) return; // no shake, no flash, no shockwave

  camera.kick(igniting ? 16 : 7);
  flashPulse = igniting ? 0.75 : 0.28;
  shockwaves.spawn(W / 2, H * 0.5, {
    r0: 24,
    r1: Math.max(W, H) * (igniting ? 0.95 : 0.6),
    life: igniting ? 0.85 : 0.55,
    w: igniting ? 14 : 7,
    a: igniting ? 0.85 : 0.45,
    color: igniting ? "rgba(255,190,90,1)" : "rgba(190,170,255,1)",
  });
}

function currentIgnition() {
  return lerp(hen.from, hen.to, easeInOut(clamp01(hen.t)));
}

// --- Cinematic -------------------------------------------------------------
let director = null;
let titleTimer = 0;

function playCinematic(shotId) {
  if (director) return; // already running
  shockwaves.clear();
  flashPulse = 0;
  clearTimeout(titleTimer);
  hen.from = hen.to = 1; // the intro ends in Fire form
  hen.t = 1;
  director = new Director({ camera, shockwaves, figure });
  const shot = SHOTS.find((s) => s.id === shotId);
  if (shot) director.seek(shot.beat);
  markShot(shot ? shot.id : null);
  document.body.classList.add("cinematic");
  document.body.classList.remove("title-in", "live");
}

function endCinematic({ keepTitle = false } = {}) {
  director = null;
  hen.from = hen.to = 1;
  hen.t = 1;
  setFormLabel(true);
  document.body.classList.remove("cinematic");
  document.body.classList.add("live");
  markShot(null);
  // Let the title linger over the now-live scene instead of cutting it as the
  // HUD arrives; a hard skip drops it at once.
  clearTimeout(titleTimer);
  if (keepTitle && document.body.classList.contains("title-in")) {
    titleTimer = setTimeout(() => document.body.classList.remove("title-in"), 1400);
  } else {
    document.body.classList.remove("title-in");
  }
  camera.to({ zoom: 1, y: 0, stiffness: 0.8 });
}

// --- Shot picker -----------------------------------------------------------
SHOTS.forEach((shot, i) => {
  const b = document.createElement("button");
  b.className = "btn";
  b.type = "button";
  b.dataset.shot = shot.id;
  b.textContent = `${i + 1}. ${shot.label}`;
  b.addEventListener("click", () => jumpToShot(shot.id));
  shotsEl.appendChild(b);
});

function markShot(id) {
  for (const b of shotsEl.children) {
    if (id && b.dataset.shot === id) b.setAttribute("aria-current", "true");
    else b.removeAttribute("aria-current");
  }
}

function jumpToShot(id) {
  const shot = SHOTS.find((s) => s.id === id);
  if (!shot) return;
  if (director) {
    director.seek(shot.beat);
    markShot(id);
  } else {
    playCinematic(id);
  }
  // Surface the picker: the number-key shortcuts are otherwise invisible.
  toggleShots(true);
  announce(`Shot: ${shot.label}`);
  // Makes every shot linkable. Guarded because replaceState throws on file://.
  try { history.replaceState(null, "", `?shot=${id}`); } catch { /* non-fatal */ }
}

function toggleShots(force) {
  const open = force ?? shotsEl.hidden;
  shotsEl.hidden = !open;
  btnShots.setAttribute("aria-expanded", String(open));
}

// --- Save a frame ----------------------------------------------------------
// A canvas-only capture, so unlike a video recorder it cannot silently omit the
// DOM title card the sequence builds toward — what you see is what you get.
function saveFrame() {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wolzard-${hen.to >= 0.5 ? "fire" : "knight"}.png`;
    a.click();
    URL.revokeObjectURL(url);
    announce("Frame saved");
  }, "image/png");
}

// --- Input -----------------------------------------------------------------
btnTransform.addEventListener("click", triggerTransform);
btnCine.addEventListener("click", () => playCinematic());
btnShots.addEventListener("click", () => toggleShots());
btnSkip.addEventListener("click", () => {
  if (!director) return;
  director.skip();
  endCinematic();
});

// Tap anywhere on the artwork to transform — the only affordance touch users had
// before was the button bar.
canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  triggerTransform();
});

window.addEventListener("keydown", (e) => {
  // Never hijack browser shortcuts: Ctrl/Cmd+R and Ctrl+C were both being eaten.
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  if (e.code === "Space") {
    // Let a focused button handle its own activation.
    if (e.target instanceof HTMLButtonElement) return;
    e.preventDefault();
    if (e.repeat) return;
    triggerTransform();
    return;
  }
  if (e.code === "Escape") {
    if (!director) return;
    director.skip();
    endCinematic();
    return;
  }
  if (e.repeat) return;

  // Number keys jump straight to a shot.
  const n = Number(e.key);
  if (n >= 1 && n <= SHOTS.length) {
    jumpToShot(SHOTS[n - 1].id);
    return;
  }

  switch ((e.key || "").toLowerCase()) {
    case "c": playCinematic(); break;
    // Re-scattering mid-cinematic leaves the ignite beat with no buffer to wipe.
    case "r": if (!director) { figure.scatter(); schedule(); } break;
    case "s": saveFrame(); break;
  }
});

// Pointer parallax. Cheap because the formed figure is a single blit, so this is
// one extra transform rather than any per-dot work.
const paraOn = !reduceMotion;
let pointerY01 = 0.42;
window.addEventListener("pointermove", (e) => {
  if (!paraOn || e.pointerType === "touch") return;
  camera.setParallax((e.clientX / W) * 2 - 1, (e.clientY / H) * 2 - 1);
  pointerY01 = e.clientY / H;
}, { passive: true });
window.addEventListener("pointerleave", () => camera.setParallax(0, 0));

// --- Start state -----------------------------------------------------------
const params = new URLSearchParams(location.search);
const openInFire = location.hash === "#fire";
const shotParam = params.get("shot");
const startShot = SHOTS.find((s) => s.id === shotParam);

setFormLabel(openInFire);

if (reduceMotion || params.has("still") || openInFire) {
  // Reduced motion gets a still image, not merely a skipped intro — see the
  // render loop, which stops after one frame in this case.
  figure.form();
  hen.from = hen.to = openInFire ? 1 : 0;
  hen.t = 1;
  if (reduceMotion) {
    camera.driftAmp = 0;
    camera.breathe = 0;
  }
  document.body.classList.add("live");
} else {
  playCinematic(startShot ? startShot.id : undefined);
  if (startShot) toggleShots(true);
}

// --- Background ------------------------------------------------------------
// Cool purple vault that heats up as the fire takes hold, plus a floor glow
// once the figure is burning. Panned opposite the figure so the two layers
// separate in depth.
function drawBackground(warm, px, py, bg) {
  const cx = W / 2 - px * 34;
  const cy = H * 0.52 - py * 22;
  const g = ctx.createRadialGradient(cx, cy, 40, cx, cy, Math.max(W, H) * 0.7);
  const b = clamp01(bg);
  g.addColorStop(0, `rgb(${(18 + warm * 46) * b},${(16 + warm * 8) * b},${(24 - warm * 6) * b})`);
  g.addColorStop(1, `rgb(${(5 + warm * 12) * b},${5 * b},${9 * b})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (warm > 0.01) {
    const f = ctx.createRadialGradient(W / 2, H * 0.92, 10, W / 2, H * 0.92, Math.max(W, H) * 0.55);
    f.addColorStop(0, `rgba(255,110,30,${0.3 * warm})`);
    f.addColorStop(1, "rgba(255,80,20,0)");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = f;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

// --- Animation loop --------------------------------------------------------
let last = performance.now();
let lastFire = null;
let warmed = false;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // Rasterise the dot buffers on the very first frame, while the cinematic is
  // still on black, rather than hitching when the fly-in lands.
  if (!warmed) {
    warmed = true;
    figure.prewarm(figureScale(), DPR);
    document.body.classList.add("booted");
    last = performance.now();
  }

  sinceHenshin += dt;

  // 1. Decide this frame's look.
  let look = director ? director.update(dt, W, H) : null;
  if (director && !look) endCinematic({ keepTitle: true }); // timeline ran out
  if (!look) {
    if (hen.t < 1) hen.t = Math.min(1, hen.t + dt / hen.dur);
    look = baseLook();
    look.ignition = currentIgnition();
    look.warm = look.ignition;
    look.bloom = 0.34 + look.ignition * 0.32;
    look.ember = look.ignition > 0.02 ? (hen.t < 1 ? 1.2 : 0.75) : 0;
    look.flash = flashPulse;
    look.flashWarm = 1;
    look.fire = hen.to >= 0.5;
  }

  if (reduceMotion) {
    // No embers: with the loop stopping, any in flight would freeze mid-air.
    look.ember = 0;
    look.grain = 0.03;
  }

  document.body.classList.toggle("title-in", !!look.title);
  if (look.fire !== lastFire) {
    lastFire = look.fire;
    setFormLabel(look.fire);
  }

  flashPulse *= Math.pow(0.015, dt);
  camera.update(dt);
  shockwaves.update(dt);
  figure.update(dt, look.ignition, look.ember);

  // 2. Draw: background, then the figure under the camera, then post effects.
  const scale = figureScale();
  drawBackground(look.warm, camera.paraX, camera.paraY, look.bg);

  // Map the pointer from viewport space into the figure's own vertical span, so
  // the specular band tracks the cursor across the armour rather than the page.
  const figH = figure.vh * scale;
  const specAt = clamp01((pointerY01 * H - (H * 0.5 - figH / 2)) / figH);

  ctx.save();
  camera.apply(ctx, W, H);
  figure.render(ctx, W / 2, H * 0.5, scale, DPR, look.ignition, look.figureAlpha,
    canRebuild, paraOn ? 0.2 : 0, specAt);
  ctx.restore();

  bloom.apply(ctx, canvas, W, H, look.bloom);
  if (look.sweep >= 0) {
    drawSweep(ctx, W, H, look.sweep, {
      strength: look.sweepStrength,
      color: look.sweepColor,
    });
  }
  shockwaves.draw(ctx);
  drawFlash(ctx, W, H, look.flash, look.flashWarm);
  grain.draw(ctx, W, H, look.grain);
  vignette.draw(ctx, W, H, look.vignette);
  drawLetterbox(ctx, W, H, look.letterbox);
}

// Under reduced motion the loop must not run indefinitely — an endless rAF kept
// drift, grain and embers moving forever, which is exactly what the preference
// asks us not to do. So frames are scheduled rather than chained: normally that
// is every frame, but with the preference set it is only while something is
// actually resolving (a transform easing, or the figure assembling).
let rafId = 0;

function schedule() {
  if (!rafId) rafId = requestAnimationFrame(tick);
}

function resolving() {
  return !!director || hen.t < 1 || figure.assemble < 1 || flashPulse > 0.01;
}

function tick(now) {
  rafId = 0;
  frame(now);
  if (!reduceMotion || resolving()) schedule();
}

schedule();

// Any state change needs frames drawn, whichever mode we are in.
window.addEventListener("resize", schedule);
window.addEventListener("keydown", schedule);
window.addEventListener("pointerdown", schedule);
