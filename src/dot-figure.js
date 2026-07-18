// DotFigure — renders Wolzard as a cloud of colored dots on a 2D canvas.
//
// The dots are traced from the reference image (see wolzard-dots.js). Every
// dot carries its Knight colour and a precomputed Fire colour (a molten ramp
// keyed off the dot's brightness). `fireLevel` (0..1) cross-fades between them.
// An assemble animation flies the dots in from a scatter; idle shimmer and
// rising flame particles add life.

const EASE_OUT = (t) => 1 - Math.pow(1 - t, 3);

// Molten fire ramp keyed by luminance (0..1) -> [r,g,b].
function fireRamp(l) {
  const stops = [
    [0.0, [30, 0, 0]],
    [0.32, [110, 12, 6]],
    [0.55, [200, 40, 12]],
    [0.75, [244, 116, 22]],
    [1.0, [255, 224, 130]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (l <= stops[i][0]) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      const f = (l - a) / (b - a || 1);
      return [
        Math.round(ca[0] + (cb[0] - ca[0]) * f),
        Math.round(ca[1] + (cb[1] - ca[1]) * f),
        Math.round(ca[2] + (cb[2] - ca[2]) * f),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

export class DotFigure {
  constructor(data) {
    const raw = data.dots;
    this.n = raw.length;
    this.vw = data.vw;
    this.vh = data.vh;

    // Centre the artwork on its own origin (data units).
    const cx = data.vw / 2;
    const cy = data.vh / 2;

    this.hx = new Float32Array(this.n); // home position (centred data units)
    this.hy = new Float32Array(this.n);
    this.cxp = new Float32Array(this.n); // current animated position
    this.cyp = new Float32Array(this.n);
    this.sx = new Float32Array(this.n); // scatter start
    this.sy = new Float32Array(this.n);
    this.phase = new Float32Array(this.n);

    this.kr = new Uint8Array(this.n); // knight colour
    this.kg = new Uint8Array(this.n);
    this.kb = new Uint8Array(this.n);
    this.fr = new Uint8Array(this.n); // fire colour
    this.fg = new Uint8Array(this.n);
    this.fb = new Uint8Array(this.n);

    for (let i = 0; i < this.n; i++) {
      const [x, y, c] = raw[i];
      this.hx[i] = x - cx;
      this.hy[i] = y - cy;
      const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
      this.kr[i] = r; this.kg[i] = g; this.kb[i] = b;
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const [fr, fg, fb] = fireRamp(Math.min(1, lum * 1.05 + 0.05));
      this.fr[i] = fr; this.fg[i] = fg; this.fb[i] = fb;
      this.phase[i] = Math.random() * Math.PI * 2;
    }

    // Average cell size (data units) → drives dot render size.
    this.cell = Math.sqrt((this.vw * this.vh) / this.n);

    this.assemble = 0;        // 0 = scattered, 1 = fully formed
    this.particles = [];      // flame particles (data-space)
    this.scatter();
  }

  // Reset every dot to a random off-figure start position, then re-form.
  scatter() {
    const spread = Math.max(this.vw, this.vh) * 1.4;
    for (let i = 0; i < this.n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = spread * (0.4 + Math.random() * 0.6);
      this.sx[i] = Math.cos(a) * d;
      this.sy[i] = Math.sin(a) * d - this.vh * 0.2;
      this.cxp[i] = this.sx[i];
      this.cyp[i] = this.sy[i];
    }
    this.assemble = 0;
  }

  // Snap straight to the formed figure (no fly-in) — reduced-motion / stills.
  form() {
    for (let i = 0; i < this.n; i++) {
      this.cxp[i] = this.hx[i];
      this.cyp[i] = this.hy[i];
    }
    this.assemble = 1;
  }

  update(dt, fireLevel) {
    // Advance the assemble progress (~1.1s to form).
    this.assemble = Math.min(1, this.assemble + dt / 1.1);
    const e = EASE_OUT(this.assemble);
    for (let i = 0; i < this.n; i++) {
      this.cxp[i] = this.sx[i] + (this.hx[i] - this.sx[i]) * e;
      this.cyp[i] = this.sy[i] + (this.hy[i] - this.sy[i]) * e;
    }

    // Spawn flame particles once mostly-Fire.
    if (fireLevel > 0.45 && this.assemble > 0.9) {
      const spawn = Math.floor(fireLevel * 6);
      for (let k = 0; k < spawn; k++) {
        const i = (Math.random() * this.n) | 0;
        this.particles.push({
          x: this.hx[i], y: this.hy[i],
          vx: (Math.random() - 0.5) * 30,
          vy: -60 - Math.random() * 120,
          life: 0.6 + Math.random() * 0.7, age: 0,
          size: this.cell * (0.5 + Math.random()),
        });
      }
    }
    for (let p of this.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy *= 0.98;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
  }

  // Draw centred at (ox, oy) with `scale` data-units→px, blending to Fire.
  draw(ctx, ox, oy, scale, fireLevel, time) {
    const size = Math.max(1.2, this.cell * scale * 0.92);
    const half = size / 2;
    const shimmer = 0.35 * scale;

    for (let i = 0; i < this.n; i++) {
      const jx = Math.sin(time * 1.6 + this.phase[i]) * shimmer;
      const jy = Math.cos(time * 1.4 + this.phase[i]) * shimmer;
      const px = ox + (this.cxp[i]) * scale + jx;
      const py = oy + (this.cyp[i]) * scale + jy;

      let r = this.kr[i], g = this.kg[i], b = this.kb[i];
      if (fireLevel > 0) {
        r = (r + (this.fr[i] - r) * fireLevel) | 0;
        g = (g + (this.fg[i] - g) * fireLevel) | 0;
        b = (b + (this.fb[i] - b) * fireLevel) | 0;
      }
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(px - half, py - half, size, size);
    }

    // Flame particles (additive glow).
    if (this.particles.length) {
      ctx.globalCompositeOperation = "lighter";
      for (const p of this.particles) {
        const t = p.age / p.life;
        const a = (1 - t) * 0.8;
        const s = p.size * scale * (1 - t * 0.5);
        // hot core -> orange -> smoke
        const r = 255;
        const g = Math.round(200 - t * 160);
        const b = Math.round(80 - t * 80);
        ctx.fillStyle = `rgba(${r},${g},${Math.max(0, b)},${a})`;
        ctx.fillRect(ox + p.x * scale - s / 2, oy + p.y * scale - s / 2, s, s);
      }
      ctx.globalCompositeOperation = "source-over";
    }
  }
}
