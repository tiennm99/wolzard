// Canvas 2D bootstrap: renders the Wolzard dot-figure and drives the
// Knight <-> Wolzard Fire transform. No Three.js — plain 2D canvas.

import { WOLZARD_DOTS } from "./wolzard-dots.js";
import { DotFigure } from "./dot-figure.js";

const canvas = document.getElementById("scene");
const ctx = canvas.getContext("2d");

const figure = new DotFigure(WOLZARD_DOTS);

// --- Sizing (device-pixel-ratio aware) -------------------------------------
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener("resize", resize);
resize();

// --- Transform state -------------------------------------------------------
const state = { target: 0, fire: 0 };

const formNameEl = document.getElementById("form-name");
const btnTransform = document.getElementById("btn-transform");
const btnReset = document.getElementById("btn-reset");
const chkRotate = document.getElementById("chk-rotate");
if (chkRotate) chkRotate.closest(".toggle").remove(); // no rotation in 2D

function setFormLabel(fire) {
  formNameEl.textContent = fire ? "Wolzard Fire" : "Wolzard";
  formNameEl.classList.toggle("fire", fire);
  btnTransform.classList.toggle("fire", fire);
}

function triggerTransform() {
  state.target = state.target === 0 ? 1 : 0;
  setFormLabel(state.target === 1);
}

btnTransform.addEventListener("click", triggerTransform);
btnReset.addEventListener("click", () => figure.scatter());
btnReset.textContent = "Re-materialize";

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") { e.preventDefault(); triggerTransform(); }
  if (e.key.toLowerCase() === "r") figure.scatter();
});

// Deep-link: #fire starts already in the Fire form.
if (location.hash === "#fire") {
  state.target = 1;
  state.fire = 1;
  setFormLabel(true);
}

// Start already formed for reduced-motion users or the ?still preview flag.
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduceMotion || new URLSearchParams(location.search).has("still")) {
  figure.form();
}

// --- Animation loop --------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const time = now / 1000;

  // Ease fire level toward target.
  state.fire += (state.target - state.fire) * Math.min(1, dt * 4);

  figure.update(dt, state.fire);

  // Background: subtle vignette that warms with the Fire form.
  ctx.clearRect(0, 0, W, H);
  const warm = state.fire;
  const g = ctx.createRadialGradient(W / 2, H * 0.52, 40, W / 2, H * 0.52, Math.max(W, H) * 0.7);
  g.addColorStop(0, `rgb(${18 + warm * 40},${16 + warm * 6},${24 - warm * 4})`);
  g.addColorStop(1, `rgb(${5 + warm * 10},5,${9})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Fit the figure to ~74% of the viewport height, centred.
  const scale = (H * 0.74) / figure.vh;
  const ox = W / 2;
  const oy = H * 0.5;
  figure.draw(ctx, ox, oy, scale, state.fire, time);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
