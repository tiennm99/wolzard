// DotFigure — renders Wolzard as a cloud of colored dots on a 2D canvas.
//
// The dots are traced from the reference image (see wolzard-dots.js). Every
// dot carries its Knight colour and a precomputed Fire colour (a molten ramp
// keyed off the dot's brightness).
//
// The formed figure is rasterised once into offscreen Knight and Fire buffers,
// so a steady-state frame is a single blit. The transform is not a uniform
// fade: an `ignition` front (0..1) climbs the figure column by column, each
// column offset by smooth noise, so fire visibly spreads across the silhouette
// with a hot glowing edge. Embers are spawned from dots at the front.

const EASE_OUT = (t) => 1 - Math.pow(1 - t, 3);
const TWO_PI = Math.PI * 2;

// Vertical slices used by the ignition wipe. Higher = smoother front, more
// drawImage calls per frame (only while the wipe is mid-flight).
const WIPE_COLS = 72;
// Softness of the front, in normalized figure heights.
const WIPE_SOFT = 0.13;

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

    this.kr = new Uint8Array(this.n); // knight colour
    this.kg = new Uint8Array(this.n);
    this.kb = new Uint8Array(this.n);

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
      this.knightStr[i] = `rgb(${r},${g},${b})`;
      this.fireStr[i] = `rgb(${fr},${fg},${fb})`;
    }

    // Per-column front offsets: two incommensurate sines give the wipe an
    // organic wavy edge instead of a straight bar.
    this.colOff = new Float32Array(WIPE_COLS);
    for (let c = 0; c < WIPE_COLS; c++) {
      const u = c / WIPE_COLS;
      this.colOff[c] =
        Math.sin(u * 11.3) * 0.55 + Math.sin(u * 4.1 + 1.7) * 0.45;
    }

    // Average cell size (data units) → drives dot render size.
    this.cell = Math.sqrt((this.vw * this.vh) / this.n);

    this.assemble = 0;        // 0 = scattered, 1 = fully formed
    this.frozen = false;      // hold the scatter (used by the intro's black beat)
    this.particles = [];      // embers (data-space)
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
    this.particles.length = 0;
  }

  // Snap straight to the formed figure (no fly-in) — reduced-motion / stills.
  form() {
    for (let i = 0; i < this.n; i++) {
      this.cxp[i] = this.hx[i];
      this.cyp[i] = this.hy[i];
    }
    this.assemble = 1;
    this.frozen = false;
  }

  /**
   * @param ignition 0..1 — how far the fire front has climbed the figure.
   * @param emberRate 0..~1.5 — ember spawn multiplier.
   */
  update(dt, ignition, emberRate = 1) {
    if (!this.frozen && this.assemble < 1) {
      this.assemble = Math.min(1, this.assemble + dt / 1.15);
      const e = EASE_OUT(this.assemble);
      for (let i = 0; i < this.n; i++) {
        this.cxp[i] = this.sx[i] + (this.hx[i] - this.sx[i]) * e;
        this.cyp[i] = this.sy[i] + (this.hy[i] - this.sy[i]) * e;
      }
    }

    const front = this._front(ignition);
    if (this.assemble > 0.88 && ignition > 0.02) {
      this._spawnEmbers(front, emberRate);
    }

    for (const p of this.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy *= 0.985;
      // Sideways turbulence keeps the columns of embers from looking linear.
      p.vx += Math.sin(p.age * p.wob + p.seed) * 34 * dt;
    }
    if (this.particles.length) {
      this.particles = this.particles.filter((p) => p.age < p.life);
      if (this.particles.length > 900) {
        this.particles.splice(0, this.particles.length - 900);
      }
    }
  }

  // Normalized front height, travelling past both edges so ignition 0 and 1
  // are fully clean states.
  _front(ignition) {
    return -WIPE_SOFT + ignition * (1 + 2 * WIPE_SOFT);
  }

  // Embers come off dots near the fire front while it climbs, and from the
  // already-burning region once it has passed.
  _spawnEmbers(front, rate) {
    const count = Math.round(rate * 9);
    const moving = front > 0 && front < 1;
    for (let k = 0; k < count; k++) {
      let i = -1;
      for (let tries = 0; tries < 10; tries++) {
        const j = (Math.random() * this.n) | 0;
        const u = 0.5 - this.hy[j] / this.vh; // 0 at the bottom, 1 at the top
        if (moving) {
          // Strongly favour the front; allow a thinner tail behind it.
          if (Math.abs(u - front) < 0.09 || (u < front && Math.random() < 0.25)) {
            i = j;
            break;
          }
        } else if (u < front) {
          i = j;
          break;
        }
      }
      if (i < 0) continue;
      const big = Math.random() < 0.12; // occasional slow cinder
      this.particles.push({
        x: this.hx[i] + (Math.random() - 0.5) * this.cell * 2,
        y: this.hy[i],
        vx: (Math.random() - 0.5) * 40,
        vy: big ? -34 - Math.random() * 40 : -80 - Math.random() * 190,
        life: big ? 1.4 + Math.random() * 1.2 : 0.5 + Math.random() * 0.8,
        age: 0,
        size: this.cell * (big ? 1.1 + Math.random() : 0.45 + Math.random() * 0.9),
        wob: 3 + Math.random() * 5,
        seed: Math.random() * TWO_PI,
      });
    }
  }

  /**
   * Build the offscreen buffers ahead of time. Rasterising 2 x ~52k arcs costs
   * a few hundred ms; left lazy it lands exactly when the fly-in completes, so
   * the cinematic hitches on its own first beat. Call this while the frame is
   * still black.
   */
  prewarm(scale, dpr) {
    this._ensureBuffers(scale, dpr);
  }

  // Pre-render the fully-formed figure into Knight + Fire offscreen buffers.
  // With ~52k dots, drawing every dot each frame is too slow, so the formed
  // figure is rasterised once per (scale, dpr) and blitted thereafter. The
  // buffers are built slightly over-resolution so a camera push-in stays sharp.
  _ensureBuffers(scale, dpr) {
    const bufDpr = Math.min(3, dpr * 1.25);
    if (this.knightBuf && this._bufScale === scale && this._bufDpr === bufDpr) return;

    // Drop the previous pair first, and zero their dimensions so the backing
    // stores are reclaimed now rather than whenever GC decides to look.
    for (const old of [this.knightBuf, this.fireBuf]) {
      if (old) { old.width = 0; old.height = 0; }
    }
    this.knightBuf = this.fireBuf = null;

    const radius = Math.max(0.8, this.cell * scale * 0.62);
    const pad = radius + 2;
    const cssW = this.vw * scale + pad * 2;
    const cssH = this.vh * scale + pad * 2;
    const midX = cssW / 2, midY = cssH / 2;

    const build = (colorStr) => {
      const cv = document.createElement("canvas");
      cv.width = Math.ceil(cssW * bufDpr);
      cv.height = Math.ceil(cssH * bufDpr);
      const b = cv.getContext("2d");
      b.scale(bufDpr, bufDpr);
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
    this._bufDpr = bufDpr;
  }

  // Render centred at (ox, oy). `scale` = data-units→css-px, `dpr` for crisp
  // buffers. Fly-in draws streaked dots; the formed figure blits buffers.
  /**
   * @param canRebuild pass false to forbid re-rasterising the buffers this
   *   frame. Rebuilding costs 2x52k arcs, so a resize must not do it per event;
   *   the existing buffer is blitted at the new size instead (slightly soft)
   *   until the caller settles and allows a rebuild.
   * @param specular 0..1 strength of the pointer-tracked highlight band.
   * @param specularAt 0..1 vertical position of that band within the figure.
   */
  render(ctx, ox, oy, scale, dpr, ignition, alpha = 1, canRebuild = true,
         specular = 0, specularAt = 0.5) {
    if (alpha <= 0.002) return;
    ctx.save();
    ctx.globalAlpha = alpha;

    if (this.assemble < 1) {
      this._drawAssembling(ctx, ox, oy, scale, ignition);
    } else {
      if (canRebuild || !this.knightBuf) this._ensureBuffers(scale, dpr);
      // The buffer may have been built for a different scale; blit it to the
      // size the current scale asks for.
      const k = scale / this._bufScale;
      const w = this._bufCssW * k;
      const h = this._bufCssH * k;
      const dx = ox - w / 2;
      const dy = oy - h / 2;
      const lit = ignition >= 0.5 ? this.fireBuf : this.knightBuf;

      if (ignition >= 0.999) {
        ctx.drawImage(this.fireBuf, dx, dy, w, h);
      } else {
        ctx.drawImage(this.knightBuf, dx, dy, w, h);
        if (ignition > 0.002) this._drawIgnition(ctx, dx, dy, w, h, ignition);
      }
      if (specular > 0.004) {
        this._bandGlow(ctx, lit, dx, dy, w, h, specularAt, 0.17, specular);
      }
    }

    this._drawEmbers(ctx, ox, oy, scale);
    ctx.restore();
  }

  /**
   * Add a buffer back over itself inside a soft horizontal band — used for both
   * the ignition hot edge and the pointer-tracked specular. Sourcing the glow
   * from the buffer keeps it inside the silhouette, which a screen-space
   * gradient cannot do. Split into strips with bell-curve alpha because one flat
   * strip reads as a rectangle laid across the face.
   *
   * @param center 0..1 band centre, 0 = top of the figure.
   * @param spread 0..1 half-height of the band.
   */
  _bandGlow(ctx, buf, dx, dy, w, h, center, spread, peakAlpha) {
    const ph = buf.height;
    const y0 = Math.max(0, (center - spread) * ph);
    const y1 = Math.min(ph, (center + spread) * ph);
    const avail = y1 - y0;
    if (avail <= 0) return;
    const strips = 8;
    const stripPx = avail / strips;
    ctx.save();
    const base = ctx.globalAlpha; // keep the caller's fade
    ctx.globalCompositeOperation = "lighter";
    for (let s = 0; s < strips; s++) {
      const sy = y0 + stripPx * s;
      ctx.globalAlpha =
        base * peakAlpha * Math.pow(Math.sin((Math.PI * (s + 0.5)) / strips), 1.4);
      ctx.drawImage(
        buf,
        0, sy, buf.width, stripPx,
        dx, dy + (sy / ph) * h, w, (stripPx / ph) * h + 0.6
      );
    }
    ctx.restore();
  }

  /**
   * Composite the Fire buffer over the Knight one up to a wavy rising front.
   * Both buffers share the same geometry, so a fire slice replaces exactly the
   * knight dots it covers — the silhouette stays intact and the boundary
   * follows the artwork rather than a rectangle.
   */
  _drawIgnition(ctx, dx, dy, cssW, cssH, ignition) {
    const pw = this.fireBuf.width;
    const ph = this.fireBuf.height;
    const colPx = pw / WIPE_COLS;
    const colCss = cssW / WIPE_COLS;
    const front = this._front(ignition);

    // Column slices land on fractional coordinates (and the camera transform
    // moves them again), so abutting them leaves antialiased vertical seams.
    // Overlapping each slice by a pixel removes the seam: the shared band is
    // the same image sampled the same way, so the overwrite is invisible.
    const padCss = 1;
    const padPx = padCss * (pw / cssW);

    ctx.save();
    for (let c = 0; c < WIPE_COLS; c++) {
      const u = front + this.colOff[c] * WIPE_SOFT;
      if (u <= 0) continue;
      const filled = u >= 1 ? 1 : u;
      const hPx = filled * ph;
      const hCss = filled * cssH;
      const sx = c * colPx;
      const sw = Math.min(colPx + padPx, pw - sx);
      ctx.drawImage(
        this.fireBuf,
        sx, ph - hPx, sw, hPx,
        dx + c * colCss, dy + cssH - hCss, colCss + padCss, hCss
      );
    }

    ctx.restore();

    // Hot edge: a glow band riding the mean front height.
    if (front > 0 && front < 1) {
      this._bandGlow(ctx, this.fireBuf, dx, dy, cssW, cssH,
        1 - front, WIPE_SOFT * 0.35, 0.8);
    }
  }

  // Cheap fly-in: dots smear toward where they came from (axis-aligned, so it
  // stays a single fillRect each) and fade up as they land.
  _drawAssembling(ctx, ox, oy, scale, ignition) {
    const size = Math.max(1, this.cell * scale * 1.05);
    const half = size / 2;
    const cache = ignition <= 0.5 ? this.knightStr : this.fireStr;
    // Long smears early on turn 52k dots into undifferentiated noise, so keep
    // the trail short enough that individual streaks stay readable.
    const trail = 0.11 * (1 - this.assemble);
    const cap = 18;

    ctx.save();
    // Multiply, never assign: render() has already applied the caller's fade
    // (the director's figureAlpha), and overwriting it turns the fade up from
    // black into a pop.
    ctx.globalAlpha *= 0.45 + 0.55 * this.assemble;
    for (let i = 0; i < this.n; i++) {
      const px = ox + this.cxp[i] * scale;
      const py = oy + this.cyp[i] * scale;
      // Streak points back along the travel direction (away from home).
      let tx = (px - (ox + this.hx[i] * scale)) * trail;
      let ty = (py - (oy + this.hy[i] * scale)) * trail;
      if (tx > cap) tx = cap; else if (tx < -cap) tx = -cap;
      if (ty > cap) ty = cap; else if (ty < -cap) ty = -cap;

      ctx.fillStyle = cache[i];
      ctx.fillRect(
        Math.min(px, px + tx) - half,
        Math.min(py, py + ty) - half,
        size + Math.abs(tx),
        size + Math.abs(ty)
      );
    }
    ctx.restore();
  }

  _drawEmbers(ctx, ox, oy, scale) {
    if (!this.particles.length) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.particles) {
      const t = p.age / p.life;
      const a = (1 - t) * (1 - t) * 0.9;
      const s = Math.max(0.6, p.size * scale * (1 - t * 0.45));
      // Cool from yellow-white through orange to a dull red.
      const g = Math.round(225 - t * 185);
      const b = Math.max(0, Math.round(140 - t * 150));
      ctx.fillStyle = `rgba(255,${g},${b},${a})`;
      ctx.fillRect(ox + p.x * scale - s / 2, oy + p.y * scale - s / 2, s, s);
    }
    ctx.restore();
  }
}
