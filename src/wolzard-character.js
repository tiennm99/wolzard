// Wolzard — the Wolf Knight of Mahou Sentai Magiranger.
//
// A detailed, articulated action-figure of Wolzard built entirely from
// Three.js primitives: a wolf-head helmet (muzzle, fangs, ears, mane, glowing
// eyes), layered ornate armour with a chest wolf emblem, visible ball joints,
// a folded cape and an ornate wolf sword.
//
// Two forms are baked into one model:
//   * "Knight"  — black steel with GOLD trim (base Wolzard).
//   * "Fire"    — the armour re-forged with molten RED-ORANGE trim, burning
//                 eyes and living flames (Wolzard Fire).
// A single `fireLevel` (0 -> 1) morphs between them, so the transform is just
// a smooth drive of that one number.

import * as THREE from "three";

// --- Palette ---------------------------------------------------------------
const COLORS = {
  steel: 0x141824,
  steelDark: 0x0a0c14,
  steelEdge: 0x2a3145,
  joint: 0x05060a, // polished ball-joint plastic
  silver: 0xaab2c4, // wolf-face metal
  trimGold: 0xd4af37,
  trimFire: 0xff5a1f,
  eyeGold: 0xffe27a,
  eyeFire: 0xff3a12,
  capeOuter: 0x4a0d16, // deep blood-crimson
  capeInner: 0x14060a,
  capeFire: 0x8a1205,
  blade: 0xd9deea,
};

function lerpColor(target, hexA, hexB, t) {
  target.copy(new THREE.Color(hexA)).lerp(new THREE.Color(hexB), t);
}

export class Wolzard {
  constructor() {
    this.root = new THREE.Group();

    // `body` holds everything that bobs / spins as a unit.
    this.body = new THREE.Group();
    this.root.add(this.body);

    // Material buckets that react to the transform.
    this.trimMats = [];
    this.eyeMats = [];
    this.capeMat = null;
    this.flames = [];

    this._fireLevel = 0;

    // Shared materials (reused across many meshes for performance + DRY).
    this.mSteel = this._steel(COLORS.steel, 0.42);
    this.mSteelDark = this._steel(COLORS.steelDark, 0.5);
    this.mSteelEdge = this._steel(COLORS.steelEdge, 0.3);
    this.mJoint = new THREE.MeshStandardMaterial({
      color: COLORS.joint, metalness: 0.3, roughness: 0.25,
    });
    this.mSilver = new THREE.MeshStandardMaterial({
      color: COLORS.silver, metalness: 1.0, roughness: 0.28,
    });
    this.mBlade = new THREE.MeshStandardMaterial({
      color: COLORS.blade, metalness: 1.0, roughness: 0.12,
    });

    this._buildBase();
    this._buildLegs();
    this._buildPelvis();
    this._buildTorso();
    this._buildChestEmblem();
    this._buildArms();
    this._buildHead();
    this._buildCape();
    this._buildSword();
    this._buildFlames();
    this._buildAura();

    // Enable shadow casting on every mesh.
    this.root.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });

    this.setFireLevel(0);
  }

  // --- Material factories --------------------------------------------------
  _steel(color, roughness) {
    return new THREE.MeshStandardMaterial({ color, metalness: 0.9, roughness });
  }

  // A fresh gold-trim material (tracked so it can morph to fire).
  _trim() {
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.trimGold, metalness: 1.0, roughness: 0.22,
      emissive: COLORS.trimGold, emissiveIntensity: 0.12,
    });
    this.trimMats.push(mat);
    return mat;
  }

  _eye() {
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.eyeGold, emissive: COLORS.eyeGold,
      emissiveIntensity: 1.6, roughness: 0.4,
    });
    this.eyeMats.push(mat);
    return mat;
  }

  // --- Small reusable ornaments -------------------------------------------
  _add(group, geo, mat, x, y, z) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  }

  // A spike (cone) with configurable size, gold by default.
  _spike(group, h, r, x, y, z, mat) {
    return this._add(group, new THREE.ConeGeometry(r, h, 8), mat || this._trim(), x, y, z);
  }

  // A ball joint sphere.
  _joint(group, r, x, y, z) {
    return this._add(group, new THREE.SphereGeometry(r, 16, 12), this.mJoint, x, y, z);
  }

  // Ring of rivets around a torus path (decorative trim studs).
  _rivetRing(group, radius, count, y, z, r = 0.035) {
    const geo = new THREE.SphereGeometry(r, 8, 6);
    const mat = this._trim();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      this._add(group, geo, mat, Math.cos(a) * radius, y, z + Math.sin(a) * radius * 0.55);
    }
  }

  // --- Display stand -------------------------------------------------------
  _buildBase() {
    const g = new THREE.Group();
    // Hex pedestal disc.
    const disc = this._add(
      g, new THREE.CylinderGeometry(1.7, 1.9, 0.28, 6), this.mSteelDark, 0, 0.14, 0
    );
    disc.rotation.y = Math.PI / 6;
    // Gold rim.
    const rim = this._add(
      g, new THREE.TorusGeometry(1.62, 0.06, 12, 6), this._trim(), 0, 0.29, 0
    );
    rim.rotation.set(Math.PI / 2, 0, Math.PI / 6);
    // Inner riser the figure stands on.
    this._add(g, new THREE.CylinderGeometry(1.15, 1.35, 0.14, 24), this.mSteel, 0, 0.35, 0);
    this._rivetRing(g, 1.5, 6, 0.3, 0, 0.05);
    this.root.add(g);
    this.base = g;
  }

  // --- Legs ----------------------------------------------------------------
  _buildLegs() {
    const g = new THREE.Group();

    for (const side of [-1, 1]) {
      const x = 0.34 * side;

      // Hip ball joint.
      this._joint(g, 0.24, x, 2.28, 0);

      // Thigh — tapered armour.
      this._add(g, new THREE.CylinderGeometry(0.26, 0.22, 0.8, 14), this.mSteel, x, 1.9, 0);
      // Thigh plate (front).
      const tp = this._add(g, new THREE.BoxGeometry(0.34, 0.5, 0.16), this.mSteelEdge, x, 1.95, 0.2);
      tp.rotation.x = 0.1;

      // Knee ball joint + guard.
      this._joint(g, 0.18, x, 1.5, 0);
      const knee = this._add(
        g, new THREE.SphereGeometry(0.24, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        this._trim(), x, 1.52, 0.06
      );
      knee.rotation.x = -0.2;
      this._spike(g, 0.28, 0.07, x, 1.52, 0.24, this._trim());

      // Greave — lower leg, tapered.
      this._add(g, new THREE.CylinderGeometry(0.2, 0.17, 0.85, 14), this.mSteelDark, x, 1.05, 0);
      // Shin trim strip.
      const shin = this._add(g, new THREE.BoxGeometry(0.1, 0.7, 0.06), this._trim(), x, 1.05, 0.17);

      // Ankle joint.
      this._joint(g, 0.13, x, 0.6, 0);

      // Armoured boot (foot points forward).
      const boot = this._add(g, new THREE.BoxGeometry(0.4, 0.34, 0.85), this.mSteel, x, 0.42, 0.15);
      boot.rotation.x = 0.04;
      // Toe cap.
      this._add(g, new THREE.BoxGeometry(0.38, 0.22, 0.28), this.mSteelDark, x, 0.34, 0.55);
      // Boot gold trim.
      this._add(g, new THREE.BoxGeometry(0.42, 0.06, 0.6), this._trim(), x, 0.56, 0.2);
      void shin;
    }
    this.body.add(g);
    this.legs = g;
  }

  _buildPelvis() {
    const g = new THREE.Group();
    // Waist block.
    this._add(g, new THREE.CylinderGeometry(0.42, 0.48, 0.5, 14), this.mSteel, 0, 2.45, 0);
    // Belt.
    const belt = this._add(g, new THREE.TorusGeometry(0.46, 0.08, 12, 28), this._trim(), 0, 2.42, 0);
    belt.rotation.x = Math.PI / 2;
    // Central belt buckle gem.
    const buckle = this._add(g, new THREE.OctahedronGeometry(0.14), this._trim(), 0, 2.42, 0.46);
    buckle.scale.set(1, 1.3, 0.5);
    // Front + side tassets (hip skirt plates).
    for (const [ang, sx] of [[0, 0], [0.9, 1], [-0.9, 1]]) {
      const plate = this._add(
        g, new THREE.BoxGeometry(0.34, 0.5, 0.1), this.mSteelEdge,
        Math.sin(ang) * 0.42, 2.18, Math.cos(ang) * 0.42
      );
      plate.rotation.y = ang;
      plate.rotation.x = 0.15;
      // gold hem
      this._add(g, new THREE.BoxGeometry(0.34, 0.06, 0.11),
        this._trim(), Math.sin(ang) * 0.44, 1.96, Math.cos(ang) * 0.44).rotation.y = ang;
      void sx;
    }
    this.body.add(g);
  }

  // --- Torso ---------------------------------------------------------------
  _buildTorso() {
    const g = new THREE.Group();

    // Cuirass — layered chest.
    const chest = this._add(g, new THREE.CylinderGeometry(0.5, 0.56, 1.1, 10), this.mSteel, 0, 3.05, 0);
    chest.scale.z = 0.8;
    // Overlapping upper chest plate.
    const upper = this._add(g, new THREE.SphereGeometry(0.56, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), this.mSteelEdge, 0, 3.25, 0);
    upper.scale.set(1, 0.8, 0.82);

    // Abdominal segmented plates.
    for (let i = 0; i < 3; i++) {
      const seg = this._add(g, new THREE.BoxGeometry(0.5 - i * 0.05, 0.12, 0.34), this.mSteelDark, 0, 2.78 - i * 0.16, 0.3);
      seg.rotation.x = -0.2;
    }

    // Gorget (neck collar).
    const gorget = this._add(g, new THREE.CylinderGeometry(0.26, 0.34, 0.28, 12), this.mSteelEdge, 0, 3.62, 0);
    const collar = this._add(g, new THREE.TorusGeometry(0.3, 0.06, 10, 24), this._trim(), 0, 3.72, 0);
    collar.rotation.x = Math.PI / 2;
    void gorget;

    // Shoulder pauldrons — layered domes with a fang row.
    this._buildPauldrons(g);

    this.body.add(g);
    this.torso = g;
  }

  _buildPauldrons(g) {
    for (const side of [-1, 1]) {
      const px = 0.62 * side;
      // Outer dome.
      const dome = this._add(
        g, new THREE.SphereGeometry(0.42, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        this.mSteel, px, 3.5, 0
      );
      dome.rotation.z = -0.4 * side;
      dome.scale.set(1.05, 1, 1.05);
      // Inner raised plate.
      const inner = this._add(
        g, new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        this.mSteelEdge, px, 3.62, 0
      );
      inner.rotation.z = -0.4 * side;
      // Gold ridge crest along the pauldron.
      const ridge = this._add(g, new THREE.TorusGeometry(0.4, 0.045, 8, 20, Math.PI), this._trim(), px, 3.5, 0);
      ridge.rotation.set(0, Math.PI / 2, -0.4 * side + Math.PI / 2);

      // Fang spikes fanning off the shoulder.
      for (let i = 0; i < 3; i++) {
        const a = (i - 1) * 0.5;
        this._spike(
          g, 0.44, 0.08,
          px + Math.sin(a) * 0.34 * side, 3.66, Math.cos(a) * 0.3 - 0.05,
          this._trim()
        ).rotation.set(-0.5, 0, (-0.7 - a * 0.3) * side);
      }
    }
  }

  // --- Chest wolf emblem ---------------------------------------------------
  _buildChestEmblem() {
    const g = new THREE.Group();
    g.position.set(0, 3.05, 0.44);

    // Shield backing.
    const shield = this._add(g, new THREE.CircleGeometry(0.24, 6), this._trim(), 0, 0, 0.02);
    shield.rotation.z = Math.PI / 6;

    // Silver wolf face.
    const face = this._add(g, new THREE.SphereGeometry(0.15, 14, 10), this.mSilver, 0, 0.01, 0.05);
    face.scale.set(1, 0.9, 0.6);
    // Muzzle.
    this._add(g, new THREE.ConeGeometry(0.08, 0.16, 6), this.mSilver, 0, -0.06, 0.12).rotation.x = Math.PI / 2;
    // Ears.
    for (const s of [-1, 1]) {
      this._add(g, new THREE.ConeGeometry(0.05, 0.14, 5), this.mSilver, 0.1 * s, 0.14, 0.04).rotation.z = 0.3 * s;
    }
    // Eyes.
    for (const s of [-1, 1]) {
      this._add(g, new THREE.SphereGeometry(0.028, 8, 6), this._eye(), 0.06 * s, 0.02, 0.14);
    }
    this.body.add(g);
    void shield;
  }

  // --- Arms ----------------------------------------------------------------
  _buildArms() {
    this.armR = new THREE.Group();
    this.armL = new THREE.Group();

    const build = (group, side) => {
      // Shoulder ball joint.
      this._joint(group, 0.2, 0, 0, 0);
      // Upper arm.
      this._add(group, new THREE.CylinderGeometry(0.15, 0.14, 0.6, 12), this.mSteelDark, 0, -0.4, 0);
      // Bicep band trim.
      const band = this._add(group, new THREE.TorusGeometry(0.15, 0.03, 8, 16), this._trim(), 0, -0.28, 0);
      band.rotation.x = Math.PI / 2;

      // Elbow ball joint + guard.
      this._joint(group, 0.15, 0, -0.74, 0);
      this._spike(group, 0.2, 0.06, 0, -0.74, -0.14, this._trim()).rotation.x = Math.PI;

      // Forearm vambrace (tapered, wider at cuff).
      this._add(group, new THREE.CylinderGeometry(0.16, 0.13, 0.62, 12), this.mSteel, 0, -1.1, 0);
      // Gauntlet cuff (flared).
      const cuff = this._add(group, new THREE.CylinderGeometry(0.2, 0.15, 0.16, 12), this.mSteelEdge, 0, -1.4, 0);
      const cuffTrim = this._add(group, new THREE.TorusGeometry(0.19, 0.035, 8, 18), this._trim(), 0, -1.46, 0);
      cuffTrim.rotation.x = Math.PI / 2;
      void cuff;

      // Fist.
      this._add(group, new THREE.SphereGeometry(0.17, 12, 10), this.mSteelDark, 0, -1.6, 0.02).scale.set(1, 0.9, 1.1);
      // Knuckle plate.
      this._add(group, new THREE.BoxGeometry(0.28, 0.1, 0.14), this._trim(), 0, -1.6, 0.16);

      group.position.set(0.82 * side, 3.5, 0);
      group.rotation.z = 0.14 * side;
    };

    build(this.armR, 1);
    build(this.armL, -1);
    this.body.add(this.armR, this.armL);
  }

  // --- Wolf-head helmet ----------------------------------------------------
  _buildHead() {
    this.head = new THREE.Group();
    this.head.position.y = 3.98;

    // Cranium.
    const cranium = this._add(this.head, new THREE.SphereGeometry(0.34, 20, 16), this.mSteel, 0, 0.08, -0.06);
    cranium.scale.set(1, 1.02, 1.08);

    // Silver face mask under the muzzle.
    this._add(this.head, new THREE.SphereGeometry(0.28, 16, 12), this.mSilver, 0, 0, 0.12).scale.set(1, 0.95, 0.95);

    // Muzzle — tapered snout pushing forward (silver, so the wolf reads).
    const muzzle = this._add(this.head, new THREE.CylinderGeometry(0.15, 0.22, 0.52, 8), this.mSilver, 0, -0.05, 0.4);
    muzzle.rotation.x = Math.PI / 2;
    // Muzzle top ridge (dark).
    this._add(this.head, new THREE.BoxGeometry(0.16, 0.1, 0.4), this.mSteelDark, 0, 0.06, 0.42).rotation.x = -0.1;
    // Nose tip.
    this._add(this.head, new THREE.SphereGeometry(0.08, 10, 8), this.mJoint, 0, 0.04, 0.66);

    // Lower jaw.
    const jaw = this._add(this.head, new THREE.BoxGeometry(0.26, 0.1, 0.36), this.mSteelDark, 0, -0.16, 0.3);
    jaw.rotation.x = 0.08;

    // Fangs (upper + lower).
    for (const s of [-1, 1]) {
      this._spike(this.head, 0.12, 0.03, 0.07 * s, -0.11, 0.46, this.mSilver).rotation.x = Math.PI;
      this._spike(this.head, 0.09, 0.025, 0.05 * s, -0.19, 0.42, this.mSilver);
    }

    // Brow ridge (gold).
    const brow = this._add(this.head, new THREE.BoxGeometry(0.44, 0.08, 0.14), this._trim(), 0, 0.12, 0.24);
    brow.rotation.x = -0.2;

    // Fierce slanted glowing eyes.
    for (const s of [-1, 1]) {
      const eye = this._add(this.head, new THREE.BoxGeometry(0.2, 0.07, 0.05), this._eye(), 0.16 * s, 0.05, 0.3);
      eye.rotation.z = 0.4 * -s;
    }

    // Wolf ears — tall pyramids swept up and back.
    for (const s of [-1, 1]) {
      const ear = this._add(this.head, new THREE.ConeGeometry(0.13, 0.66, 4), this.mSilver, 0.24 * s, 0.46, -0.02);
      ear.rotation.set(-0.25, Math.PI / 4, 0.38 * s);
      // Gold ear tip.
      this._spike(this.head, 0.18, 0.06, 0.33 * s, 0.72, -0.05, this._trim()).rotation.set(-0.25, 0, 0.48 * s);
    }

    // Crest fin (mohawk) — a row of descending gold fins along the crown.
    for (let i = 0; i < 3; i++) {
      const fin = this._add(this.head, new THREE.ConeGeometry(0.06, 0.26 - i * 0.05, 4), this._trim(), 0, 0.4 - i * 0.02, 0.12 - i * 0.18);
      fin.scale.z = 1.8;
    }

    // Mane — short fur tufts ringing the back of the head.
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI - Math.PI / 2;
      this._spike(this.head, 0.22, 0.05, Math.sin(a) * 0.33, 0.06 + Math.cos(a) * 0.05, -0.28 - Math.abs(Math.sin(a)) * 0.05, this.mSteelEdge)
        .rotation.set(Math.PI - 0.6, 0, Math.sin(a) * 0.8);
    }

    this.body.add(this.head);
  }

  // --- Cape ----------------------------------------------------------------
  _buildCape() {
    // Two folded planes: crimson outer + dark inner lining.
    const geo = new THREE.PlaneGeometry(1.9, 3.2, 20, 24);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // Vertical folds + a gathered top and flared bottom.
      const gather = THREE.MathUtils.mapLinear(y, 1.6, -1.6, 0.55, 1.15);
      const fold = Math.sin(x * 5.2) * 0.12 * gather;
      const bow = Math.cos((x / 0.95) * 1.2) * 0.5;
      pos.setX(i, x * gather);
      pos.setZ(i, fold + bow - Math.max(0, -y) * 0.18);
    }
    geo.computeVertexNormals();

    this.capeMat = new THREE.MeshStandardMaterial({
      color: COLORS.capeOuter, roughness: 0.82, metalness: 0.15,
      side: THREE.FrontSide, emissive: 0x000000, emissiveIntensity: 0,
    });
    const lining = new THREE.MeshStandardMaterial({
      color: COLORS.capeInner, roughness: 0.95, metalness: 0.05, side: THREE.BackSide,
    });

    this.cape = new THREE.Group();
    const outer = new THREE.Mesh(geo, this.capeMat);
    const inner = new THREE.Mesh(geo, lining);
    inner.position.z = -0.02;
    this.cape.add(outer, inner);
    this.cape.position.set(0, 3.55, -0.42);
    this.cape.rotation.x = -0.08;
    this.body.add(this.cape);

    // Gold clasp chain across the collar.
    for (const s of [-1, 1]) {
      this._add(this.body, new THREE.SphereGeometry(0.06, 10, 8), this._trim(), 0.28 * s, 3.68, 0.12);
    }
  }

  // --- Sword ---------------------------------------------------------------
  _buildSword() {
    this.sword = new THREE.Group();

    // Double-edged blade (two thin wedges back to back).
    const blade = this._add(this.sword, new THREE.BoxGeometry(0.12, 2.1, 0.04), this.mBlade, 0, 1.05, 0);
    // Fuller (center ridge, gold).
    this._add(this.sword, new THREE.BoxGeometry(0.03, 2.0, 0.05), this._trim(), 0, 1.05, 0);
    // Point.
    this._add(this.sword, new THREE.ConeGeometry(0.06, 0.24, 4), this.mBlade, 0, 2.18, 0);
    void blade;

    // Ornate wolf crossguard — swept wings.
    for (const s of [-1, 1]) {
      const wing = this._add(this.sword, new THREE.BoxGeometry(0.3, 0.08, 0.1), this._trim(), 0.18 * s, 0, 0);
      wing.rotation.z = 0.5 * s;
      this._spike(this.sword, 0.16, 0.05, 0.36 * s, 0.06, 0, this._trim()).rotation.z = -Math.PI / 2 * s + 0.4 * s;
    }

    // Wrapped grip.
    this._add(this.sword, new THREE.CylinderGeometry(0.055, 0.055, 0.46, 8), this.mSteelDark, 0, -0.28, 0);
    for (let i = 0; i < 4; i++) {
      this._add(this.sword, new THREE.TorusGeometry(0.057, 0.012, 6, 12), this._trim(), 0, -0.13 - i * 0.1, 0).rotation.x = Math.PI / 2;
    }

    // Wolf-head pommel.
    const pommel = this._add(this.sword, new THREE.SphereGeometry(0.1, 12, 10), this._trim(), 0, -0.56, 0);
    this._add(this.sword, new THREE.ConeGeometry(0.05, 0.1, 6), this._trim(), 0, -0.6, 0.07).rotation.x = Math.PI / 2 + 0.5;
    void pommel;

    // Mount at the right fist, held blade-up.
    this.sword.position.set(1.12, 3.05, 0.12);
    this.sword.rotation.set(0.05, 0, 0.2);
    this.body.add(this.sword);
  }

  // --- Fire-form flames ----------------------------------------------------
  _buildFlames() {
    const anchors = [
      [0.72, 3.9, 0], [-0.72, 3.9, 0],   // pauldrons
      [0.46, 0.6, 0.15], [-0.46, 0.6, 0.15], // boots
      [0.46, 4.6, -0.06], [-0.46, 4.6, -0.06], // ear tips
      [1.12, 4.3, 0.12],                 // sword tip
      [0, 3.05, 0.5],                    // chest emblem
    ];
    const geo = new THREE.ConeGeometry(0.24, 1.1, 12);
    for (const [x, y, z] of anchors) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffb020, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = false;
      this.body.add(mesh);
      this.flames.push({ mesh, mat, baseScale: 1.0 + Math.abs(x) * 0.4, phase: x * 3 + y });
    }
  }

  _buildAura() {
    this.aura = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.7, 48),
      new THREE.MeshBasicMaterial({
        color: COLORS.trimFire, transparent: true, opacity: 0,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    this.aura.rotation.x = -Math.PI / 2;
    this.aura.position.y = 0.44;
    this.aura.castShadow = false;
    this.root.add(this.aura);
  }

  // --- Transform driving ---------------------------------------------------
  setFireLevel(t) {
    this._fireLevel = t;
    for (const mat of this.trimMats) {
      lerpColor(mat.color, COLORS.trimGold, COLORS.trimFire, t);
      lerpColor(mat.emissive, COLORS.trimGold, COLORS.trimFire, t);
      mat.emissiveIntensity = 0.12 + t * 0.95;
    }
    for (const mat of this.eyeMats) {
      lerpColor(mat.color, COLORS.eyeGold, COLORS.eyeFire, t);
      lerpColor(mat.emissive, COLORS.eyeGold, COLORS.eyeFire, t);
      mat.emissiveIntensity = 1.6 + t * 1.8;
    }
    if (this.capeMat) {
      lerpColor(this.capeMat.color, COLORS.capeOuter, COLORS.capeFire, t);
      this.capeMat.emissive.setHex(COLORS.capeFire);
      this.capeMat.emissiveIntensity = t * 0.4;
    }
  }

  get fireLevel() { return this._fireLevel; }

  // --- Per-frame animation -------------------------------------------------
  update(time, surge = 0) {
    // Idle breathing + head + cape sway.
    this.body.position.y = Math.sin(time * 1.4) * 0.04;
    if (this.head) this.head.rotation.y = Math.sin(time * 0.6) * 0.1;
    if (this.cape) this.cape.rotation.x = -0.08 + Math.sin(time * 1.1) * 0.05;

    // Flames flicker, scaled by current fire level.
    const lvl = this._fireLevel;
    for (const f of this.flames) {
      const flick = 0.7 + Math.sin(time * 12 + f.phase) * 0.3;
      const s = f.baseScale * flick * lvl;
      f.mesh.scale.set(s * 0.85, s * (1.2 + flick * 0.5), s * 0.85);
      f.mat.opacity = lvl * (0.7 + Math.sin(time * 9 + f.phase) * 0.28);
      f.mesh.visible = lvl > 0.02;
    }

    // Transform surge ring.
    if (this.aura) {
      const s = 1 + surge * 1.5;
      this.aura.scale.set(s, s, s);
      this.aura.material.opacity = surge * 0.9;
      this.aura.rotation.z += 0.03;
    }
  }
}
