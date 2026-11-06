import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { SimClock, SIM_START_MS } from './clock.js';
import { GridModel } from './grid.js';
import { REGION_DEFS, REGION_MAP, EVENT_DEFS } from './regions.js';
import { JobFactory } from './jobs.js';
import { World } from './world.js';
import { createGlobe } from './scene/globe.js';
import { createDataCenter } from './scene/datacenter.js';
import { JobVisuals } from './scene/jobs3d.js';
import { UI } from './ui/panels.js';
import { CIChart } from './ui/charts.js';
import { GuidedTour } from './ui/onboarding.js';

// ---------------------------------------------------------------- parameters

const params = {
  arrivalRate: 2, // jobs per simulated hour
  urgentShare: 0.3,
  greenThreshold: 200, // gCO2/kWh
  routeGain: 0.25, // 25% cleaner required before moving
  dayLength: 60, // real seconds per simulated day
  speed: 1,
};

const clock = new SimClock({ dayLengthSec: params.dayLength, speed: 1 });
const grid = new GridModel();
const factory = new JobFactory(20260621, REGION_DEFS.map((r) => r.id));
const worlds = { aware: null, baseline: null };
let mode = 'aware';
let cameraTween = null;

const realNow = () => performance.now() / 1000;

// ---------------------------------------------------------------- 3D setup

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02060b);

const camera = new THREE.PerspectiveCamera(
  42,
  window.innerWidth / window.innerHeight,
  0.1,
  400,
);
const HOME_CAMERA = new THREE.Vector3(10.8, 5.4, 10.8);
camera.position.set(16.5, 9.5, 16.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.rotateSpeed = 0.62;
controls.zoomSpeed = 0.8;
controls.enablePan = false;
controls.minDistance = 7.4;
controls.maxDistance = 28;
controls.target.set(0, 0, 0);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.52,
  0.55,
  0.78,
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const globe = createGlobe(scene);
const dataCenters = new Map();
const pickTargets = [];
for (const def of REGION_DEFS) {
  const dc = createDataCenter(def, globe.group);
  dataCenters.set(def.id, dc);
  pickTargets.push(dc.hitMesh);
}
const jobVisuals = new JobVisuals(scene, dataCenters);

// ------------------------------------------------------------------- worlds

function buildWorlds() {
  worlds.aware = new World('aware', grid, params);
  worlds.baseline = new World('baseline', grid, params);
  worlds.aware.onJobDone = (job, region) => {
    if (mode === 'aware') jobVisuals.spawnDone(job, region, realNow());
  };
  worlds.baseline.onJobDone = (job, region) => {
    if (mode === 'baseline') jobVisuals.spawnDone(job, region, realNow());
  };
}

function activeWorld() {
  return mode === 'aware' ? worlds.aware : worlds.baseline;
}

function submitBoth(spec) {
  const now = clock.simMs;
  worlds.aware.submit(spec, now);
  worlds.baseline.submit(spec, now);
}

function seedInitialJobs() {
  for (let i = 0; i < 10; i++) {
    submitBoth(factory.make('auto', params.urgentShare));
  }
}

buildWorlds();

// --------------------------------------------------------------------- chart

const chart = new CIChart(document.getElementById('ci-chart'), REGION_DEFS);
chart.seed(grid, clock.simMs);

// ------------------------------------------------------------------------ UI

const ui = new UI({
  regionDefs: REGION_DEFS,
  params,
  onMode: setMode,
  onPlay: togglePlay,
  onSpeed: setSpeed,
  onDayLength: (v) => {
    params.dayLength = v;
    clock.dayLengthSec = v;
  },
  onParam: (key, value) => {
    params[key] = value;
  },
  onBatch: submitBatchOfTen,
  onReset: resetSimulation,
  onEvent: triggerEvent,
  onRegion: selectRegion,
  onResetView: resetView,
});

ui.setMode('aware');
ui.setRunning(true);
ui.setSpeed(1);
seedInitialJobs();
ui.update(worlds.aware, worlds.aware, worlds.baseline, grid, clock);

// ------------------------------------------------------------------- guide

const guide = new GuidedTour({
  onFocusRegion: selectRegion,
  onRunBaseline: () => {
    setMode('baseline');
    setSpeed(4);
    resetSimulation();
  },
  onShowAware: () => {
    setMode('aware');
    setSpeed(4);
    clock.running = true;
    ui.setRunning(true);
  },
  onParam: (key, value) => {
    params[key] = value;
    ui.syncParamInputs();
  },
  onDefaults: () => {
    params.urgentShare = 0.3;
    params.greenThreshold = 200;
    params.routeGain = 0.25;
    ui.syncParamInputs();
  },
  onBatch: submitBatchOfTen,
  onMode: setMode,
  onPause: () => {
    clock.running = false;
    ui.setRunning(false);
  },
});

document.getElementById('btn-guide').addEventListener('click', () => guide.open(0));

// ------------------------------------------------------------------ actions

function setMode(next) {
  if (next === mode) return;
  mode = next;
  jobVisuals.clear();
  ui.setMode(mode);
  ui.showToast(
    mode === 'aware' ? 'Showing carbon-aware world' : 'Showing carbon-blind baseline',
    mode === 'aware' ? '#3df5a5' : '#ffc857',
  );
}

function togglePlay() {
  clock.running = !clock.running;
  ui.setRunning(clock.running);
}

function setSpeed(speed) {
  params.speed = speed;
  clock.speed = speed;
  ui.setSpeed(speed);
}

function submitBatchOfTen() {
  for (const spec of factory.batchOfFlexible(10)) submitBoth(spec);
  ui.showToast('10 flexible jobs submitted to both simulations', '#4dd4ff');
}

function triggerEvent(regionId, type) {
  const def = EVENT_DEFS[type];
  const region = REGION_MAP[regionId];
  if (!def || !region) return;
  grid.triggerEvent(regionId, type, clock.simMs, def.durationH);
  const msg = `GRID EVENT · ${def.label} · ${region.name} (${def.durationH}h)`;
  worlds.aware.addLog(msg, 'event', clock.simMs);
  worlds.baseline.addLog(msg, 'event', clock.simMs);
  ui.showToast(`${def.label} → ${region.name}`, def.color);
  ui.lastEventsHtml.clear();
}

function resetSimulation() {
  clock.reset(SIM_START_MS);
  clock.dayLengthSec = params.dayLength;
  clock.speed = params.speed;
  clock.running = true;
  grid.reset();
  factory.reset(20260621);
  buildWorlds();
  jobVisuals.clear();
  spawnAccum = 0;
  nextHistorySimMs = clock.simMs + 15 * 60_000;
  chart.seed(grid, clock.simMs);
  seedInitialJobs();
  ui.closeDetail();
  ui.setRunning(true);
  ui.setSpeed(params.speed);
  ui.setMode(mode);
  ui.lastEventsHtml.clear();
  ui.update(worlds.aware, worlds.aware, worlds.baseline, grid, clock);
  ui.showToast('Simulation reset · day 1 · 14:00 UTC', '#4dd4ff');
  resetView();
}

function focusRegion(regionId) {
  const dc = dataCenters.get(regionId);
  if (!dc) return;
  const point = dc.position.clone();
  const normal = dc.normal.clone();
  const tangent = new THREE.Vector3(0, 1, 0).cross(normal);
  if (tangent.lengthSq() < 1e-4) tangent.set(1, 0, 0).cross(normal);
  tangent.normalize();

  const camTo = point
    .clone()
    .addScaledVector(normal, 8.4)
    .addScaledVector(tangent, 2.3)
    .add(new THREE.Vector3(0, 1.5, 0));

  cameraTween = {
    from: camera.position.clone(),
    to: camTo,
    targetFrom: controls.target.clone(),
    targetTo: point.clone(),
    t0: realNow(),
    dur: 0.9,
  };
  controls.enabled = false;
}

function selectRegion(regionId) {
  focusRegion(regionId);
  ui.openDetail(regionId);
}

function resetView() {
  cameraTween = {
    from: camera.position.clone(),
    to: HOME_CAMERA.clone(),
    targetFrom: controls.target.clone(),
    targetTo: new THREE.Vector3(0, 0, 0),
    t0: realNow(),
    dur: 1.0,
  };
  controls.enabled = false;
}

// ---------------------------------------------------------------- interaction

let pointerDown = null;
canvas.addEventListener('pointerdown', (event) => {
  pointerDown = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener('pointerup', (event) => {
  if (!pointerDown) return;
  const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
  pointerDown = null;
  if (moved > 6) return;
  const pointer = new THREE.Vector2(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1,
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickTargets, false);
  if (hits.length > 0) selectRegion(hits[0].object.userData.regionId);
});

window.addEventListener('keydown', (event) => {
  const tag = event.target?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (guide.isOpen) return;
  if (event.code === 'Space') {
    event.preventDefault();
    togglePlay();
  } else if (event.key === 'r' || event.key === 'R') {
    resetSimulation();
  }
});

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
});

// ------------------------------------------------------------------- runtime

let spawnAccum = 0;
let nextHistorySimMs = clock.simMs + 15 * 60_000;
let lastFrame = realNow();
let uiAccum = 0;
let booted = false;

// Cinematic entrance, then normal orbit controls.
cameraTween = {
  from: camera.position.clone(),
  to: HOME_CAMERA.clone(),
  targetFrom: new THREE.Vector3(0, 0, 0),
  targetTo: new THREE.Vector3(0, 0, 0),
  t0: realNow(),
  dur: 2.4,
};
controls.enabled = false;

function step(dtReal) {
  const advanced = clock.advance(dtReal);
  if (advanced > 0) {
    const now = clock.simMs;
    grid.cleanup(now);

    spawnAccum += advanced / 60_000;
    const interval = 60 / Math.max(0.1, params.arrivalRate);
    let guard = 0;
    while (spawnAccum >= interval && guard++ < 12) {
      spawnAccum -= interval;
      submitBoth(factory.make('auto', params.urgentShare));
    }

    worlds.aware.update(now, params);
    worlds.baseline.update(now, params);

    if (now >= nextHistorySimMs) {
      chart.push(grid, now);
      nextHistorySimMs = now + 15 * 60_000;
    }
  }
}

function updateScene(dtReal, t) {
  globe.update(clock.simMs, dtReal);
  const world = activeWorld();
  const now = clock.simMs;

  for (const def of REGION_DEFS) {
    const region = world.regionsById[def.id];
    const dc = dataCenters.get(def.id);
    let running = 0;
    for (const job of region.assigned) if (job.state === 'running') running++;
    dc.update(
      {
        ci: grid.intensity(region, now),
        solar: grid.solarAt(region, now),
        wind: grid.windAt(region, now),
        load: world.load(region, now),
        assigned: region.assigned.length,
        running,
        offline: grid.hasEvent(def.id, 'outage', now),
      },
      t,
      dtReal,
    );
  }

  jobVisuals.sync(world, dtReal, t);

  if (cameraTween) {
    const k = Math.min(1, (t - cameraTween.t0) / cameraTween.dur);
    const e = 1 - Math.pow(1 - k, 3);
    camera.position.lerpVectors(cameraTween.from, cameraTween.to, e);
    controls.target.lerpVectors(cameraTween.targetFrom, cameraTween.targetTo, e);
    if (k >= 1) {
      cameraTween = null;
      controls.enabled = true;
    }
  }
}

function frame() {
  requestAnimationFrame(frame);
  const t = realNow();
  const dtReal = Math.min(0.1, Math.max(0, t - lastFrame));
  lastFrame = t;

  step(dtReal);
  updateScene(dtReal, t);
  controls.update();

  uiAccum += dtReal;
  if (uiAccum >= 0.1) {
    uiAccum = 0;
    ui.update(activeWorld(), worlds.aware, worlds.baseline, grid, clock);
  }

  composer.render();

  if (!booted) {
    booted = true;
    // Let the first frame paint before revealing the scene.
    requestAnimationFrame(() => {
      document.getElementById('boot').classList.add('done');
      guide.maybeAutoOpen();
    });
  }
}

requestAnimationFrame(frame);

// Handy for demos / console experiments.
window.__carbon = {
  clock,
  grid,
  worlds,
  params,
  chart,
  scene,
  camera,
  renderer,
  dataCenters,
  jobVisuals,
  get mode() {
    return mode;
  },
  setMode,
  submitBatchOfTen,
  triggerEvent,
  resetSimulation,
  focusRegion,
  guide,
};
