// Wolzard — the Wolf Knight of Mahou Sentai Magiranger.
// A stylized knight built entirely from Three.js primitives.
//
// Two forms are baked into one model:
//   * "Knight"  — black armour with GOLD trim (base Wolzard).
//   * "Fire"    — the same armour re-forged with molten RED-ORANGE trim,
//                 burning eyes and living flames (Wolzard Fire).
//
// A single `fireLevel` value (0 -> 1) morphs between the two, so the
// transform animation is just a smooth drive of that one number.

import * as THREE from "three";

// --- Palette ---------------------------------------------------------------
const COLORS = {
  armour: 0x14161f, // near-black steel
  armourDark: 0x0a0b11,
  trimGold: 0xd4af37,
  trimFire: 0xff5a1f,
  eyeGold: 0xffe08a,
  eyeFire: 0xff3a12,
  capeKnight: 0x3a0d12, // deep blood-crimson
  capeFire: 0x8a1205,
};

// Linear interpolate between two hex colours into a target Color.
function lerpColor(target, hexA, hexB, t) {
  const a = new THREE.Color(hexA);
  const b = new THREE.Color(hexB);
  target.copy(a).lerp(b, t);
}

export class Wolzard {
  constructor() {
    this.root = new THREE.Group();

    // `body` holds everything that should bob / rotate as a unit.
    this.body = new THREE.Group();
    this.root.add(this.body);

    // Material buckets that react to the transform.
    this.trimMats = [];
    this.eyeMats = [];
    this.capeMat = null;
    this.flames = []; // { mesh, mat, baseScale, phase }

    this._fireLevel = 0;

    this._buildLegs();
    this._buildTorso();
    this._buildArms();
    this._buildHead();
    this._buildCape();
    this._buildSword();
    this._buildFlames();
    this._buildAura();

    this.setFireLevel(0);
  }

  // --- Material factories --------------------------------------------------
  _armourMat(dark = false) {
    return new THREE.MeshStandardMaterial({
      color: dark ? COLORS.armourDark : COLORS.armour,
      metalness: 0.85,
      roughness: 0.38,
    });
  }

  _trimMat() {
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.trimGold,
      metalness: 1.0,
      roughness: 0.25,
      emissive: COLORS.trimGold,
      emissiveIntensity: 0.15,
    });
    this.trimMats.push(mat);
    return mat;
  }

  _eyeMat() {
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.eyeGold,
      emissive: COLORS.eyeGold,
      emissiveIntensity: 1.4,
      metalness: 0.0,
      roughness: 0.4,
    });
    this.eyeMats.push(mat);
    return mat;
  }

  // --- Body parts ----------------------------------------------------------
  _buildLegs() {
    const g = new THREE.Group();
    const legGeo = new THREE.CylinderGeometry(0.28, 0.22, 1.6, 12);
    const bootGeo = new THREE.BoxGeometry(0.5, 0.4, 0.75);

    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, this._armourMat());
      leg.position.set(0.34 * side, 0.9, 0);
      g.add(leg);

      // Knee guard (trim).
      const knee = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        this._trimMat()
      );
      knee.position.set(0.34 * side, 0.5, 0.12);
      g.add(knee);

      const boot = new THREE.Mesh(bootGeo, this._armourMat(true));
      boot.position.set(0.34 * side, 0.15, 0.1);
      g.add(boot);
    }
    this.body.add(g);
  }

  _buildTorso() {
    const g = new THREE.Group();

    // Chest — a tapered armoured cuirass.
    const chest = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.62, 1.15, 8),
      this._armourMat()
    );
    chest.position.y = 2.25;
    chest.rotation.y = Math.PI / 8;
    g.add(chest);

    // Central gold breastplate gem/crest.
    const crest = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22),
      this._trimMat()
    );
    crest.position.set(0, 2.45, 0.56);
    crest.scale.set(1, 1.6, 0.5);
    g.add(crest);

    // Waist trim ring.
    const belt = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.09, 10, 24),
      this._trimMat()
    );
    belt.position.y = 1.72;
    belt.rotation.x = Math.PI / 2;
    g.add(belt);

    // Shoulder pauldrons — spiked half-domes.
    for (const side of [-1, 1]) {
      const pauldron = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        this._armourMat()
      );
      pauldron.position.set(0.72 * side, 2.72, 0);
      pauldron.rotation.z = -0.35 * side;
      g.add(pauldron);

      // Spikes fanning off each pauldron.
      for (let i = 0; i < 3; i++) {
        const spike = new THREE.Mesh(
          new THREE.ConeGeometry(0.09, 0.5, 8),
          this._trimMat()
        );
        const a = (i - 1) * 0.5;
        spike.position.set(
          0.72 * side + Math.sin(a) * 0.3 * side,
          2.9,
          Math.cos(a) * 0.3 - 0.15
        );
        spike.rotation.z = (-0.6 - a * 0.3) * side;
        g.add(spike);
      }
    }

    this.body.add(g);
  }

  _buildArms() {
    this.armR = new THREE.Group();
    this.armL = new THREE.Group();

    const upperGeo = new THREE.CylinderGeometry(0.18, 0.16, 0.85, 10);
    const foreGeo = new THREE.CylinderGeometry(0.16, 0.15, 0.8, 10);
    const handGeo = new THREE.SphereGeometry(0.19, 10, 8);

    const build = (group, side) => {
      const upper = new THREE.Mesh(upperGeo, this._armourMat());
      upper.position.y = -0.42;
      group.add(upper);

      const fore = new THREE.Mesh(foreGeo, this._armourMat(true));
      fore.position.y = -1.2;
      group.add(fore);

      // Gauntlet trim cuff.
      const cuff = new THREE.Mesh(
        new THREE.TorusGeometry(0.17, 0.05, 8, 18),
        this._trimMat()
      );
      cuff.position.y = -0.85;
      cuff.rotation.x = Math.PI / 2;
      group.add(cuff);

      const hand = new THREE.Mesh(handGeo, this._armourMat(true));
      hand.position.y = -1.6;
      group.add(hand);

      group.position.set(0.78 * side, 2.62, 0);
      group.rotation.z = 0.12 * side;
    };

    build(this.armR, 1);
    build(this.armL, -1);
    this.body.add(this.armR, this.armL);
  }

  _buildHead() {
    this.head = new THREE.Group();
    this.head.position.y = 3.35;

    // Helmet dome.
    const helm = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 16, 14),
      this._armourMat()
    );
    helm.scale.set(1, 1.05, 1.1);
    this.head.add(helm);

    // Wolf snout / faceguard jutting forward.
    const snout = new THREE.Mesh(
      new THREE.ConeGeometry(0.26, 0.6, 8),
      this._armourMat(true)
    );
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, -0.05, 0.42);
    this.head.add(snout);

    // Gold brow crest.
    const brow = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.12, 0.16),
      this._trimMat()
    );
    brow.position.set(0, 0.12, 0.36);
    this.head.add(brow);

    // Two glowing eyes.
    const eyeGeo = new THREE.SphereGeometry(0.08, 10, 8);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, this._eyeMat());
      eye.position.set(0.15 * side, 0.02, 0.44);
      eye.scale.set(1.3, 0.7, 0.7);
      this.head.add(eye);
    }

    // Wolf ears / horns sweeping up and back.
    const hornGeo = new THREE.ConeGeometry(0.11, 0.85, 8);
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(hornGeo, this._trimMat());
      horn.position.set(0.24 * side, 0.5, -0.05);
      horn.rotation.z = 0.5 * side;
      horn.rotation.x = -0.35;
      this.head.add(horn);
    }

    this.body.add(this.head);
  }

  _buildCape() {
    // A curved plane hanging from the shoulders.
    const geo = new THREE.PlaneGeometry(1.7, 2.8, 12, 16);
    // Give it a gentle billow along X.
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = Math.cos(x * 1.6) * 0.35 - (y < 0 ? Math.abs(y) * 0.12 : 0);
      pos.setZ(i, z);
    }
    geo.computeVertexNormals();

    this.capeMat = new THREE.MeshStandardMaterial({
      color: COLORS.capeKnight,
      roughness: 0.85,
      metalness: 0.1,
      side: THREE.DoubleSide,
      emissive: 0x000000,
      emissiveIntensity: 0.0,
    });

    this.cape = new THREE.Mesh(geo, this.capeMat);
    this.cape.position.set(0, 2.35, -0.55);
    this.body.add(this.cape);
  }

  _buildSword() {
    // Wolzard's living sword, held point-down at his right side.
    this.sword = new THREE.Group();

    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 2.0, 0.03),
      new THREE.MeshStandardMaterial({
        color: 0xd7dbe6,
        metalness: 1.0,
        roughness: 0.15,
      })
    );
    blade.position.y = 1.0;
    this.sword.add(blade);

    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.12, 0.12),
      this._trimMat()
    );
    this.sword.add(guard);

    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8),
      this._armourMat(true)
    );
    grip.position.y = -0.3;
    this.sword.add(grip);

    const pommel = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.11),
      this._trimMat()
    );
    pommel.position.y = -0.58;
    this.sword.add(pommel);

    // Mount at the right hand, angled outward.
    this.sword.position.set(1.05, 1.0, 0.15);
    this.sword.rotation.z = 0.25;
    this.body.add(this.sword);
  }

  _buildFlames() {
    // Living flames that only ignite in the Fire form. Each is an additive
    // cone that flickers via the animation loop.
    const anchors = [
      [0.72, 2.9, 0], [-0.72, 2.9, 0],   // shoulders
      [0.34, 0.35, 0.1], [-0.34, 0.35, 0.1], // boots
      [0.24, 3.9, -0.05], [-0.24, 3.9, -0.05], // horns
      [1.05, 2.1, 0.15],                  // sword
    ];

    const geo = new THREE.ConeGeometry(0.18, 0.7, 10);
    for (const [x, y, z] of anchors) {
      const mat = new THREE.MeshBasicMaterial({
        color: COLORS.trimFire,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      this.body.add(mesh);
      this.flames.push({ mesh, mat, baseScale: 0.8 + Math.abs(x), phase: x * 3 + y });
    }
  }

  _buildAura() {
    // Ground energy ring used during the transform surge.
    this.aura = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.5, 48),
      new THREE.MeshBasicMaterial({
        color: COLORS.trimFire,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.aura.rotation.x = -Math.PI / 2;
    this.aura.position.y = 0.02;
    this.root.add(this.aura);
  }

  // --- Transform driving ---------------------------------------------------
  // Set how "Fire" the character is: 0 = Knight, 1 = Wolzard Fire.
  setFireLevel(t) {
    this._fireLevel = t;

    for (const mat of this.trimMats) {
      lerpColor(mat.color, COLORS.trimGold, COLORS.trimFire, t);
      lerpColor(mat.emissive, COLORS.trimGold, COLORS.trimFire, t);
      mat.emissiveIntensity = 0.15 + t * 0.9;
    }
    for (const mat of this.eyeMats) {
      lerpColor(mat.color, COLORS.eyeGold, COLORS.eyeFire, t);
      lerpColor(mat.emissive, COLORS.eyeGold, COLORS.eyeFire, t);
      mat.emissiveIntensity = 1.4 + t * 1.6;
    }
    if (this.capeMat) {
      lerpColor(this.capeMat.color, COLORS.capeKnight, COLORS.capeFire, t);
      this.capeMat.emissive.setHex(COLORS.capeFire);
      this.capeMat.emissiveIntensity = t * 0.35;
    }
  }

  get fireLevel() {
    return this._fireLevel;
  }

  // --- Per-frame animation -------------------------------------------------
  // `time` seconds, `surge` 0..1 spikes during the transform moment.
  update(time, surge = 0) {
    // Idle breathing + cape sway.
    this.body.position.y = Math.sin(time * 1.4) * 0.05;
    if (this.cape) {
      this.cape.rotation.x = Math.sin(time * 1.1) * 0.06 - 0.05;
      const pos = this.cape.geometry.attributes.position;
      // (kept static geometry; sway handled by rotation for perf)
      void pos;
    }
    this.head.rotation.y = Math.sin(time * 0.6) * 0.12;

    // Flames flicker, scaled by current fire level.
    const lvl = this._fireLevel;
    for (const f of this.flames) {
      const flick = 0.7 + Math.sin(time * 12 + f.phase) * 0.3;
      const s = f.baseScale * flick * lvl;
      f.mesh.scale.set(s * 0.8, s * (1.1 + flick * 0.4), s * 0.8);
      f.mat.opacity = lvl * (0.55 + Math.sin(time * 9 + f.phase) * 0.25);
      f.mesh.visible = lvl > 0.02;
    }

    // Transform surge ring.
    if (this.aura) {
      const s = 1 + surge * 1.4;
      this.aura.scale.set(s, s, s);
      this.aura.material.opacity = surge * 0.9;
      this.aura.rotation.z += 0.03;
    }
  }
}
