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

    // Cached fillStyle strings so idle frames avoid per-dot string allocs.
    this.knightStr = new Array(this.n);
    this.fireStr = new Array(this.n);

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
      this.knightStr[i] = `rgb(${r},${g},${b})`;
      this.fireStr[i] = `rgb(${fr},${fg},${fb})`;
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

  // Pre-render the fully-formed figure into Knight + Fire offscreen buffers.
  // With ~35k dots, drawing every dot each frame is too slow, so the formed
  // figure is rasterised once per (scale, dpr) and blitted thereafter.
  _ensureBuffers(scale, dpr) {
    if (this.knightBuf && this._bufScale === scale && this._bufDpr === dpr) return;
    const radius = Math.max(0.8, this.cell * scale * 0.62);
    const pad = radius + 2;
    const cssW = this.vw * scale + pad * 2;
    const cssH = this.vh * scale + pad * 2;
    const midX = cssW / 2, midY = cssH / 2;
    const TWO_PI = Math.PI * 2;

    const build = (colorStr) => {
      const cv = document.createElement("canvas");
      cv.width = Math.ceil(cssW * dpr);
      cv.height = Math.ceil(cssH * dpr);
      const b = cv.getContext("2d");
      b.scale(dpr, dpr);
      for (let i = 0; i < this.n; i++) {
        b.fillStyle = colorStr[i];
        b.beginPath();
        b.arc(midX + this.hx[i] * scale, midY + this.hy[i] * scale, radius, 0, TWO_PI);
        b.fill();
      }
      return cv;
    };

    this.knightBuf = build(this.knightStr);
    this.fireBuf = build(this.fireStr);
    this._bufCssW = cssW;
    this._bufCssH = cssH;
    this._bufScale = scale;
    this._bufDpr = dpr;
  }

  // Render centred at (ox, oy). `scale` = data-units→css-px, `dpr` for crisp
  // buffers. Fly-in uses a cheap square path; the formed figure blits buffers.
  render(ctx, ox, oy, scale, dpr, fireLevel, time) {
    if (this.assemble < 1) {
      this._drawAssembling(ctx, ox, oy, scale, fireLevel);
    } else {
      this._ensureBuffers(scale, dpr);
      const dx = ox - this._bufCssW / 2;
      const dy = oy - this._bufCssH / 2 + Math.sin(time * 1.4) * 3; // gentle bob
      ctx.drawImage(this.knightBuf, dx, dy, this._bufCssW, this._bufCssH);
      if (fireLevel > 0.002) {
        ctx.globalAlpha = Math.min(1, fireLevel);
        ctx.drawImage(this.fireBuf, dx, dy, this._bufCssW, this._bufCssH);
        ctx.globalAlpha = 1;
      }
    }
    this._drawParticles(ctx, ox, oy, scale);
  }

  // Cheap fly-in: eased square dots (fillRect is far faster than 35k arcs).
  _drawAssembling(ctx, ox, oy, scale, fireLevel) {
    const size = Math.max(1, this.cell * scale * 1.05);
    const half = size / 2;
    const cache = fireLevel <= 0.5 ? this.knightStr : this.fireStr;
    for (let i = 0; i < this.n; i++) {
      ctx.fillStyle = cache[i];
      ctx.fillRect(ox + this.cxp[i] * scale - half, oy + this.cyp[i] * scale - half, size, size);
    }
  }

  _drawParticles(ctx, ox, oy, scale) {
    if (!this.particles.length) return;
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.particles) {
      const t = p.age / p.life;
      const a = (1 - t) * 0.8;
      const s = p.size * scale * (1 - t * 0.5);
      const g = Math.round(200 - t * 160);
      const b = Math.max(0, Math.round(80 - t * 80));
      ctx.fillStyle = `rgba(255,${g},${b},${a})`;
      ctx.fillRect(ox + p.x * scale - s / 2, oy + p.y * scale - s / 2, s, s);
    }
    ctx.globalCompositeOperation = "source-over";
  }
}
