// Virtual camera for the 2D canvas: eased zoom/pan, handheld drift, breathing
// and decaying shake. Because the formed figure is a single blit, a camera move
// costs one extra transform per frame.

import { lerp } from "./effects.js";

export class Camera {
  constructor() {
    this.zoom = 1;
    this.x = 0;
    this.y = 0;
    this.rot = 0;

    // Where the camera is being asked to go, and how fast it chases.
    this.tZoom = 1;
    this.tX = 0;
    this.tY = 0;
    this.tRot = 0;
    this.stiffness = 3;

    this.driftAmp = 1;   // handheld wander, in css px
    this.breathe = 1;    // slow zoom pulse
    this.shake = 0;      // current shake magnitude, decays each frame

    // Pointer parallax lives on its own channel so it can be layered over
    // whatever the director is doing with x/y without fighting it.
    this.paraX = 0;
    this.paraY = 0;
    this.tParaX = 0;
    this.tParaY = 0;
    this.paraAmp = 1;

    this.t = 0;
    this._ox = 0;
    this._oy = 0;
    this._oz = 1;
    this._or = 0;
  }

  /** Ask the camera to move. Only the given fields are changed. */
  to({ zoom, x, y, rot, stiffness }) {
    if (zoom !== undefined) this.tZoom = zoom;
    if (x !== undefined) this.tX = x;
    if (y !== undefined) this.tY = y;
    if (rot !== undefined) this.tRot = rot;
    if (stiffness !== undefined) this.stiffness = stiffness;
  }

  /** Snap instantly (used when skipping the intro). */
  snap({ zoom = 1, x = 0, y = 0, rot = 0 } = {}) {
    this.tZoom = this.zoom = zoom;
    this.tX = this.x = x;
    this.tY = this.y = y;
    this.tRot = this.rot = rot;
    this.shake = 0;
  }

  /** Add an impulse. Magnitudes stack, so repeated kicks build tension. */
  kick(mag) {
    this.shake = Math.min(60, this.shake + mag);
  }

  /** Aim the parallax channel. `nx`/`ny` are -1..1 pointer offsets from centre. */
  setParallax(nx, ny) {
    this.tParaX = nx;
    this.tParaY = ny;
  }

  update(dt) {
    this.t += dt;
    const k = Math.min(1, dt * this.stiffness);
    this.zoom = lerp(this.zoom, this.tZoom, k);
    this.x = lerp(this.x, this.tX, k);
    this.y = lerp(this.y, this.tY, k);
    this.rot = lerp(this.rot, this.tRot, k);

    this.shake *= Math.pow(0.0008, dt); // ~fast exponential decay

    // Parallax eases on its own, slower than the pointer moves, so the figure
    // feels weighty rather than glued to the cursor.
    const pk = Math.min(1, dt * 2.4);
    this.paraX += (this.tParaX - this.paraX) * pk;
    this.paraY += (this.tParaY - this.paraY) * pk;

    const t = this.t;
    // Two incommensurate sines per axis so the wander never obviously loops.
    const dx = (Math.sin(t * 0.31) * 0.6 + Math.sin(t * 0.73 + 1.1) * 0.4) * 7 * this.driftAmp;
    const dy = (Math.sin(t * 0.27 + 2.1) * 0.6 + Math.sin(t * 0.61 + 0.4) * 0.4) * 5 * this.driftAmp;
    const dr = Math.sin(t * 0.19 + 0.7) * 0.0022 * this.driftAmp;

    const sh = this.shake;
    const sx = sh ? (Math.random() * 2 - 1) * sh : 0;
    const sy = sh ? (Math.random() * 2 - 1) * sh : 0;
    const sr = sh ? (Math.random() * 2 - 1) * sh * 0.0006 : 0;

    const pAmp = 26 * this.paraAmp;
    this._ox = this.x + dx + sx + this.paraX * pAmp;
    this._oy = this.y + dy + sy + this.paraY * pAmp * 0.6;
    this._or = this.rot + dr + sr + this.paraX * 0.012 * this.paraAmp;
    this._oz = this.zoom * (1 + Math.sin(t * 0.9) * 0.004 * this.breathe);
  }

  /** Wrap the figure draw in save()/apply()/restore(). */
  apply(ctx, W, H) {
    const cx = W / 2;
    const cy = H * 0.5;
    ctx.translate(cx + this._ox, cy + this._oy);
    ctx.rotate(this._or);
    ctx.scale(this._oz, this._oz);
    ctx.translate(-cx, -cy);
  }
}
