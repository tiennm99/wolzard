// Screen-space cinematic post effects, all plain Canvas 2D.
//
// Everything here runs *after* the figure has been drawn, in CSS-pixel space
// (the main context already carries the DPR transform). Nothing depends on the
// dot data, so these are reusable for any scene drawn into the canvas.

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
};
export const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

const TWO_PI = Math.PI * 2;

/**
 * Additive bloom via two-stage downscale + upscale (bilinear filtering is the
 * blur). No `ctx.filter` and no shaders, so it works everywhere; dark regions
 * contribute almost nothing to an additive blit, which is what makes this read
 * as a bright-pass without an actual threshold pass.
 */
export class Bloom {
  _ensure(pw, ph) {
    if (this.stages && this._pw === pw && this._ph === ph) return;
    const mk = (w, h) => {
      const cv = document.createElement("canvas");
      cv.width = Math.max(1, w);
      cv.height = Math.max(1, h);
      const c = cv.getContext("2d");
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = "high";
      return { cv, c };
    };
    // Halving one step at a time matters: bilinear filtering only samples 2x2,
    // so a single 8x reduction aliases into visible blocky banding once it is
    // scaled back up. Three 2x steps average cleanly.
    this.stages = [1, 2, 3].map((n) => mk(pw >> n, ph >> n));
    this._pw = pw;
    this._ph = ph;
  }

  // `src` is the live main canvas; we snapshot it into our own buffers first,
  // so blitting the result back is never a self-read.
  apply(ctx, src, W, H, strength) {
    if (strength <= 0.003 || src.width < 16) return;
    this._ensure(src.width, src.height);
    const st = this.stages;

    for (let i = 0; i < st.length; i++) {
      const from = i === 0 ? src : st[i - 1].cv;
      st[i].c.globalCompositeOperation = "copy";
      st[i].c.drawImage(from, 0, 0, st[i].cv.width, st[i].cv.height);
    }

    const s = Math.min(1.15, strength);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // Wide soft halo, oversized so it spills past the silhouette.
    ctx.globalAlpha = s * 0.26;
    ctx.drawImage(st[2].cv, -W * 0.035, -H * 0.035, W * 1.07, H * 1.07);
    // Main glow.
    ctx.globalAlpha = s * 0.34;
    ctx.drawImage(st[2].cv, 0, 0, W, H);
    // Tighter pass keeps highlights from turning into featureless mush.
    ctx.globalAlpha = s * 0.16;
    ctx.drawImage(st[1].cv, 0, 0, W, H);
    ctx.restore();
  }
}

/** Animated film grain, drawn as one tiled pattern fill. */
export class Grain {
  constructor(size = 96) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = size;
    const c = cv.getContext("2d");
    const img = c.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 96 + ((Math.random() * 96) | 0);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    this.size = size;
    this.tile = cv;
  }

  draw(ctx, W, H, alpha) {
    if (alpha <= 0.002) return;
    if (!this.pattern) this.pattern = ctx.createPattern(this.tile, "repeat");
    // Re-anchoring the pattern each frame is what makes the grain crawl.
    const ox = (Math.random() * this.size) | 0;
    const oy = (Math.random() * this.size) | 0;
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.pattern;
    ctx.translate(-ox, -oy);
    ctx.fillRect(ox, oy, W, H);
    ctx.restore();
  }
}

/** Darkened edges. The gradient is cached; intensity rides on globalAlpha. */
export class Vignette {
  /** Drop the cached gradient — it is tied to a viewport size and a context. */
  invalidate() {
    this.g = null;
  }

  draw(ctx, W, H, intensity) {
    if (intensity <= 0.002) return;
    if (!this.g || this._w !== W || this._h !== H) {
      const g = ctx.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.18, W / 2, H * 0.5, Math.max(W, H) * 0.72);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.55, "rgba(0,0,0,0.22)");
      g.addColorStop(1, "rgba(0,0,0,0.95)");
      this.g = g;
      this._w = W;
      this._h = H;
    }
    ctx.save();
    ctx.globalAlpha = intensity;
    ctx.fillStyle = this.g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

/** Expanding additive rings — the henshin shockwave. */
export class Shockwaves {
  constructor() {
    this.list = [];
  }

  spawn(x, y, opts = {}) {
    this.list.push({
      x,
      y,
      age: 0,
      life: opts.life ?? 0.9,
      r0: opts.r0 ?? 20,
      r1: opts.r1 ?? 900,
      w: opts.w ?? 14,
      a: opts.a ?? 0.9,
      squash: opts.squash ?? 0.72,
      color: opts.color ?? "rgba(255,190,90,1)",
    });
  }

  update(dt) {
    for (const s of this.list) s.age += dt;
    if (this.list.length) this.list = this.list.filter((s) => s.age < s.life);
  }

  draw(ctx) {
    if (!this.list.length) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const s of this.list) {
      const t = s.age / s.life;
      const r = lerp(s.r0, s.r1, easeOut(t));
      // Cubic falloff: a wide ring that lingers reads as an outline, not energy.
      const a = Math.pow(1 - t, 3) * s.a;
      const w = Math.max(0.5, s.w * (1 - t * 0.85));
      ctx.strokeStyle = s.color;
      // A wide dim pass under a narrow bright one turns the stroke into a glow
      // band rather than a drawn ellipse.
      ctx.globalAlpha = a * 0.3;
      ctx.lineWidth = w * 4;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, r, r * s.squash, 0, 0, TWO_PI);
      ctx.stroke();
      ctx.globalAlpha = a;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, r, r * s.squash, 0, 0, TWO_PI);
      ctx.stroke();
    }
    ctx.restore();
  }

  clear() {
    this.list.length = 0;
  }
}

/** Full-frame flash. `warm` biases white -> gold -> molten. */
export function drawFlash(ctx, W, H, alpha, warm = 0) {
  if (alpha <= 0.002) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.min(1, alpha);
  const g = Math.round(255 - warm * 40);
  const b = Math.round(245 - warm * 190);
  ctx.fillStyle = `rgb(255,${g},${b})`;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/**
 * A raking light band crossing the frame — reads as a rim/lens light pass.
 * `p` walks 0..1 from one edge to the other.
 */
export function drawSweep(ctx, W, H, p, opts = {}) {
  const strength = opts.strength ?? 0.5;
  if (strength <= 0.002 || p < 0 || p > 1) return;
  const angle = opts.angle ?? -0.42;
  const width = (opts.width ?? 0.16) * W;
  const span = (W + H) * 0.9;
  const x = lerp(-span / 2, span / 2, p);

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(angle);
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createLinearGradient(x - width, 0, x + width, 0);
  const c = opts.color ?? "255,225,170";
  g.addColorStop(0, `rgba(${c},0)`);
  g.addColorStop(0.5, `rgba(${c},${strength})`);
  g.addColorStop(1, `rgba(${c},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(-span, -span, span * 2, span * 2);
  ctx.restore();
}

/** Cinema bars. `amount` 0..1 scales them in from the edges. */
export function drawLetterbox(ctx, W, H, amount) {
  if (amount <= 0.002) return;
  const bar = H * 0.115 * clamp01(amount);
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, bar);
  ctx.fillRect(0, H - bar, W, bar);
  ctx.restore();
}
