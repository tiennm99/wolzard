// Director — the opening cinematic, expressed as a list of timed beats.
//
// Each frame the director produces a plain "look" object (ignition, bloom,
// grain, letterbox, sweep, ember rate, ...) that main.js applies to the render,
// and it drives the camera and one-shot events (shake impulses, shockwaves)
// directly. Nothing here draws: keeping the timeline declarative means the beat
// list below reads as the shot list for the sequence.

import { clamp01, smoothstep, easeInOut, lerp } from "./effects.js";

/** Neutral per-frame look. main.js reuses this for the interactive state too. */
export function baseLook() {
  return {
    ignition: 0,
    figureAlpha: 1,
    bloom: 0.4,
    grain: 0.05,
    vignette: 0.55,
    letterbox: 0,
    sweep: -1,          // -1 = no sweep this frame, otherwise 0..1 position
    sweepStrength: 0.4,
    flash: 0,
    flashWarm: 0,
    warm: 0,            // background firelight, 0..1
    bg: 1,              // background brightness — 0 is a true black frame
    ember: 0,
    fire: false,        // drives the FORM label
    title: false,       // show the end title card
  };
}

// Maps a beat-local progress to a sub-range of it, clamped to 0..1.
const seg = (p, a, b) => clamp01((p - a) / (b - a));

const BEATS = [
  {
    name: "void",
    dur: 0.35,
    enter: ({ figure, camera }) => {
      figure.scatter();
      figure.frozen = true; // hold the scatter through the black
      camera.snap({ zoom: 0.8 });
      camera.driftAmp = 0.4;
    },
    at: (p, look) => {
      look.figureAlpha = 0;
      look.letterbox = smoothstep(p);
      look.bloom = 0;
      look.grain = 0.03;
      look.vignette = 0.9;
      // Genuinely black. The vignette leaves the centre of frame untouched, so
      // with nothing else drawn the background gradient reads as a grey disc.
      look.bg = 0;
    },
  },
  {
    name: "materialize",
    dur: 2.0,
    enter: ({ figure, camera }) => {
      figure.frozen = false;
      camera.to({ zoom: 1.0, stiffness: 1.1 });
      camera.driftAmp = 0.7;
    },
    at: (p, look) => {
      look.figureAlpha = smoothstep(p * 1.7);
      look.letterbox = 1;
      // The vault lights up as the dots arrive.
      look.bg = smoothstep(clamp01(p * 1.4));
      look.bloom = lerp(0.14, 0.42, smoothstep(p));
      look.vignette = lerp(0.9, 0.6, smoothstep(p));
      look.grain = 0.05;
    },
  },
  {
    name: "knight",
    dur: 1.8,
    enter: ({ camera }) => {
      camera.to({ zoom: 1.04, stiffness: 0.9 });
      camera.driftAmp = 1;
    },
    at: (p, look) => {
      look.letterbox = 1;
      look.bloom = 0.42;
      // A single raking light pass over the armour.
      const s = seg(p, 0.12, 0.8);
      if (s > 0 && s < 1) {
        look.sweep = s;
        look.sweepStrength = 0.34 * Math.sin(s * Math.PI);
      }
    },
  },
  {
    name: "charge",
    dur: 1.7,
    enter: ({ camera }) => {
      camera.to({ zoom: 1.22, stiffness: 1.9 });
    },
    at: (p, look, { camera }) => {
      look.letterbox = 1;
      look.bloom = lerp(0.42, 0.72, smoothstep(p));
      look.warm = 0.3 * smoothstep(p);
      look.ember = 0.45 * p;
      // Tension: rising tremor plus a gold pre-flicker.
      camera.kick(p * p * 2.4);
      look.flash = Math.max(0, Math.sin(p * 44)) * p * p * 0.06;
      look.flashWarm = 1;
    },
  },
  {
    name: "flash",
    dur: 0.5,
    enter: ({ camera, shockwaves, W, H }) => {
      camera.kick(34);
      camera.to({ zoom: 1.11, stiffness: 2.6 });
      shockwaves.spawn(W / 2, H * 0.5, { r0: 30, r1: Math.max(W, H) * 0.8, life: 0.85, w: 20, a: 0.9 });
      shockwaves.spawn(W / 2, H * 0.5, { r0: 10, r1: Math.max(W, H) * 0.45, life: 0.55, w: 8, a: 0.65, color: "rgba(255,240,210,1)" });
    },
    at: (p, look) => {
      look.letterbox = 1;
      // Hard attack, longer decay.
      look.flash = p < 0.14 ? p / 0.14 : Math.pow(1 - seg(p, 0.14, 1), 1.8);
      look.flashWarm = 0.55;
      look.bloom = 0.95;
      look.warm = 0.3;
      look.ember = 0.5;
    },
  },
  {
    name: "ignite",
    dur: 2.6,
    enter: ({ camera }) => {
      camera.to({ zoom: 1.0, stiffness: 1.2 });
    },
    at: (p, look, ctx) => {
      look.letterbox = 1;
      look.ignition = easeInOut(p);
      look.bloom = lerp(0.9, 0.7, smoothstep(p));
      look.warm = lerp(0.3, 1, smoothstep(p));
      look.ember = lerp(0.7, 1.4, p);
      look.fire = p > 0.4;
      look.flash = Math.pow(1 - clamp01(p * 5), 2) * 0.32;
      look.flashWarm = 1;
      // One aftershock as the front crosses the middle of the helmet.
      if (p > 0.5 && !ctx.once("aftershock")) {
        ctx.camera.kick(9);
        ctx.shockwaves.spawn(ctx.W / 2, ctx.H * 0.52, {
          r0: 40, r1: Math.max(ctx.W, ctx.H) * 0.55, life: 0.7, w: 8, a: 0.32,
          color: "rgba(255,130,50,1)",
        });
      }
    },
  },
  {
    name: "fire",
    dur: 2.2,
    enter: ({ camera }) => {
      camera.to({ zoom: 1.05, stiffness: 0.8 });
      camera.driftAmp = 1.15;
    },
    at: (p, look) => {
      look.letterbox = 1;
      look.ignition = 1;
      look.fire = true;
      look.bloom = 0.7;
      look.warm = 1;
      look.ember = 1;
      const s = seg(p, 0.08, 0.62);
      if (s > 0 && s < 1) {
        look.sweep = s;
        look.sweepStrength = 0.4 * Math.sin(s * Math.PI);
        look.sweepColor = "255,170,110";
      }
    },
  },
  {
    name: "settle",
    dur: 2.4,
    enter: ({ camera, H }) => {
      // Ride the figure up into the top of the frame so the title card lands in
      // clear space below it instead of across the visor.
      camera.to({ zoom: 0.9, y: -H * 0.15, stiffness: 0.85 });
      camera.driftAmp = 0.9;
    },
    at: (p, look) => {
      look.ignition = 1;
      look.fire = true;
      look.warm = 1;
      look.ember = 0.8;
      look.bloom = lerp(0.7, 0.58, p);
      look.letterbox = 1 - smoothstep(seg(p, 0.45, 1));
      look.vignette = lerp(0.6, 0.55, p);
      look.title = p > 0.18;
    },
  },
];

const beatIndex = (name) => BEATS.findIndex((b) => b.name === name);
// Beats from "knight" onward assume an already-assembled figure.
const FIRST_FORMED = beatIndex("knight");
// From "fire" onward the sequence is just holding, so input may take over.
const YIELD_FROM = beatIndex("fire");

/**
 * Named entry points into the timeline, in running order — the shot list. Used
 * by the `?shot=` deep link and the shot picker, so each beat of the cinematic
 * is individually addressable rather than only reachable by watching from 0.
 */
export const SHOTS = [
  { id: "materialize", beat: "materialize", label: "Materialize" },
  { id: "knight", beat: "knight", label: "Wolf Knight" },
  { id: "charge", beat: "charge", label: "Charge" },
  { id: "ignite", beat: "ignite", label: "Ignition" },
  { id: "fire", beat: "fire", label: "Wolzard Fire" },
  { id: "title", beat: "settle", label: "Title" },
];

export class Director {
  constructor({ camera, shockwaves, figure }) {
    this.camera = camera;
    this.shockwaves = shockwaves;
    this.figure = figure;
    this.t = 0;
    this.index = -1;
    this.done = false;
    this._fired = new Set();
  }

  /** One-shot guard for events inside a beat's `at`. Returns true if already fired. */
  once(key) {
    const k = this.index + ":" + key;
    if (this._fired.has(k)) return true;
    this._fired.add(k);
    return false;
  }

  /**
   * True once the sequence has reached its tail. Before this, input is ignored so
   * a stray keypress cannot derail the build-up; after it, the remaining beats
   * are only holding and the user may take over immediately.
   */
  canYield() {
    return this.index >= YIELD_FROM;
  }

  /**
   * Jump to a named beat. The world is put into the state that beat assumes
   * (assembled or scattered) and the beat's own `enter` runs on the next update,
   * so nothing has to be replayed and the timeline stays forward-only.
   */
  seek(beatName) {
    const i = beatIndex(beatName);
    if (i < 0) return false;
    let acc = 0;
    for (let k = 0; k < i; k++) acc += BEATS[k].dur;
    this.t = acc;
    this.index = -1;
    this.done = false;
    this._fired.clear();
    this.shockwaves.clear();
    if (i >= FIRST_FORMED) {
      this.figure.frozen = false;
      this.figure.form();
    }
    return true;
  }

  /** Abandon the cinematic and land on the end state (formed, Fire form). */
  skip() {
    this.done = true;
    this.figure.frozen = false;
    this.figure.form();
    this.shockwaves.clear();
    this.camera.snap({ zoom: 1 });
    this.camera.driftAmp = 1;
  }

  /** Advance the timeline and return the look for this frame (null when done). */
  update(dt, W, H) {
    if (this.done) return null;
    this.t += dt;

    // Find the active beat.
    let acc = 0;
    let i = 0;
    for (; i < BEATS.length; i++) {
      if (this.t < acc + BEATS[i].dur) break;
      acc += BEATS[i].dur;
    }
    if (i >= BEATS.length) {
      this.done = true;
      return null;
    }

    const beat = BEATS[i];
    const ctx = { camera: this.camera, shockwaves: this.shockwaves, figure: this.figure, W, H, once: (k) => this.once(k) };
    if (i !== this.index) {
      this.index = i;
      beat.enter?.(ctx);
    }

    const look = baseLook();
    beat.at(clamp01((this.t - acc) / beat.dur), look, ctx);
    return look;
  }
}
