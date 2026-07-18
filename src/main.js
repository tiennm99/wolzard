// Scene bootstrap: camera, lights, ground, the Wolzard model, and the
// transform state machine that drives Knight <-> Wolzard Fire.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Wolzard } from "./wolzard-character.js";

const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

// --- Scene & camera --------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.FogExp2(0x05060a, 0.035);

// Environment map gives the metal armour real reflections (toy-figure sheen).
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(
  42,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(3.6, 3.6, 7.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 2.5, 0);
controls.minDistance = 3.5;
controls.maxDistance = 16;
controls.maxPolarAngle = Math.PI * 0.56;

// --- Lighting --------------------------------------------------------------
scene.add(new THREE.HemisphereLight(0x8899cc, 0x080810, 0.4));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
keyLight.position.set(5, 9, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 30;
keyLight.shadow.camera.left = -6;
keyLight.shadow.camera.right = 6;
keyLight.shadow.camera.top = 8;
keyLight.shadow.camera.bottom = -2;
keyLight.shadow.bias = -0.0004;
keyLight.shadow.normalBias = 0.02;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x4a6cff, 1.6);
rimLight.position.set(-6, 4, -5);
scene.add(rimLight);

const fillLight = new THREE.DirectionalLight(0xffd9b0, 0.5);
fillLight.position.set(-2, 2, 6);
scene.add(fillLight);

// Warm fill that intensifies as the character catches fire.
const fireLight = new THREE.PointLight(0xff5a1f, 0.0, 14, 2);
fireLight.position.set(0, 3.0, 1.6);
scene.add(fireLight);

// --- Ground ----------------------------------------------------------------
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(16, 64),
  new THREE.MeshStandardMaterial({
    color: 0x0c0e16,
    metalness: 0.5,
    roughness: 0.65,
  })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(32, 32, 0x24304f, 0x121828);
grid.position.y = 0.005;
scene.add(grid);

// --- Character -------------------------------------------------------------
const wolzard = new Wolzard();
scene.add(wolzard.root);

// --- Transform state machine ----------------------------------------------
// target 0 = Knight, 1 = Fire. `fire` eases toward target; `surge` is a
// short-lived spike that powers the aura ring and camera shake.
const state = {
  target: 0,
  fire: 0,
  surge: 0,
};

const formNameEl = document.getElementById("form-name");
const btnTransform = document.getElementById("btn-transform");
const btnReset = document.getElementById("btn-reset");
const chkRotate = document.getElementById("chk-rotate");

function triggerTransform() {
  state.target = state.target === 0 ? 1 : 0;
  state.surge = 1; // kick the surge; it decays in the loop.

  const goingFire = state.target === 1;
  formNameEl.textContent = goingFire ? "Wolzard Fire" : "Wolzard";
  formNameEl.classList.toggle("fire", goingFire);
  btnTransform.classList.toggle("fire", goingFire);
}

btnTransform.addEventListener("click", triggerTransform);

// Deep-link: opening the page at #fire starts already in Wolzard Fire
// (no henshin spin) — handy for sharing / previewing a specific form.
if (location.hash === "#fire") {
  state.target = 1;
  state.fire = 1;
  formNameEl.textContent = "Wolzard Fire";
  formNameEl.classList.add("fire");
  btnTransform.classList.add("fire");
}

btnReset.addEventListener("click", () => {
  controls.reset();
  controls.target.set(0, 2.5, 0);
  camera.position.set(3.6, 3.6, 7.2);
});

// Keyboard: spacebar transforms.
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    triggerTransform();
  }
});

// --- Resize ----------------------------------------------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Animation loop --------------------------------------------------------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const time = clock.getElapsedTime();

  // Ease fire level toward target.
  state.fire += (state.target - state.fire) * 0.06;
  wolzard.setFireLevel(state.fire);

  // Decay the transform surge.
  state.surge *= 0.94;
  if (state.surge < 0.001) state.surge = 0;

  // Fire light tracks the blend plus a flicker while burning.
  const flicker = 1 + Math.sin(time * 18) * 0.12 * state.fire;
  fireLight.intensity = (state.fire * 2.6 + state.surge * 3) * flicker;

  // A brief spin + crouch pop during the surge sells the henshin.
  wolzard.body.rotation.y = Math.sin(time * 0.3) * 0.15 + state.surge * Math.PI * 2;
  wolzard.body.scale.setScalar(1 + state.surge * 0.06);

  wolzard.update(time, state.surge);

  // Optional idle auto-rotation of the whole rig.
  if (chkRotate.checked) {
    wolzard.root.rotation.y += 0.004;
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();
