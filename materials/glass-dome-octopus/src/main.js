// Glass-Dome Octopus — entry point.
// STEP 2/3: renderer, quality tier, studio, model, controls, labels, adaptive quality, measurement hooks.
// STEP 4: exploded view (explosion.js), animation (animation.js), camera direction (cameraDirector.js),
//         picking / highlight / focus (interaction.js) and the page UI (ui.js).
import * as THREE from 'three';
import {createAnimator} from './animation.js';
import {createDirector} from './cameraDirector.js';
import {createControls, orbit} from './controls.js';
import {createExplosion} from './explosion.js';
import {createFilm} from './film.js';
import {createInteraction} from './interaction.js';
import {createStudio} from './lighting.js';
import {makeMaterials} from './materials.js';
import {createMeasure} from './measure.js';
import {buildOctopus} from './octopus.js';
import {HERO_AZ} from './tentacles.js';
import {createUI} from './ui.js';

const params = new URLSearchParams(location.search);
const $ = (s) => document.querySelector(s);
const canvas = $('#c');

// ------------------------------------------------------------ quality tier (TRIZ C: detail vs phones)
const coarse = matchMedia('(pointer: coarse)').matches;
const small = Math.min(innerWidth, innerHeight) < 600;
const forced = params.get('q');
const high = forced ? forced === 'high' : !(coarse || small);
const tier = {
  name: high ? 'high' : 'low',
  transmission: high,
  shadowSize: high ? 2048 : 1024,
  pixelRatio: Math.min(devicePixelRatio || 1, high ? 2 : 1.5),
};

// ------------------------------------------------------------ renderer
let renderer;
try {
  renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot')});
} catch (e) {
  fail('WebGL を初期化できませんでした。ブラウザの設定（ハードウェアアクセラレーション）を確認してください。');
  throw e;
}
renderer.setPixelRatio(tier.pixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.debug.checkShaderErrors = true;
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  fail('GPU のコンテキストが失われました。ページを再読み込みしてください。');
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 120);
const studio = createStudio(renderer, scene, tier);
let mats = makeMaterials(tier);
const octo = buildOctopus(mats);
scene.add(octo.root);
const tent = octo.tentacles;

// ------------------------------------------------------------ views
const TARGET = new THREE.Vector3(0, 1.05, 0);
const fitDist = (k = 1) => {
  const v = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return Math.min(30, Math.max(6.2 / v, 5.6 / (v * camera.aspect)) * k);
};
const VIEWS = {
  hero: () => ({target: TARGET, az: HERO_AZ, el: 20, dist: fitDist(0.84)}),
  front: () => ({target: TARGET, az: 0, el: 12, dist: fitDist(1.02)}),
  side: () => ({target: TARGET, az: 90, el: 12, dist: fitDist(1.02)}),
  rear: () => ({target: TARGET, az: 180, el: 16, dist: fitDist(1.02)}),
  top: () => ({target: TARGET, az: HERO_AZ, el: 70, dist: fitDist(1.05)}),
  oblique: () => ({target: TARGET, az: 45, el: 30, dist: fitDist(0.95)}),
};
let needsRender = true;
const ctl = createControls(camera, canvas, {target: TARGET, home: () => VIEWS.hero(), onChange: () => (needsRender = true)});
ctl.controls.maxDistance = 30;

function resize() {
  const w = canvas.clientWidth || innerWidth;
  const h = canvas.clientHeight || innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  needsRender = true;
}
new ResizeObserver(resize).observe(canvas);
resize();
camera.position.copy(orbit(TARGET, HERO_AZ, 20, fitDist(0.84)));
camera.lookAt(TARGET);
ctl.controls.update();

const setView = (name, ms = 900) => {
  const v = VIEWS[name]();
  if (ms === 0) {
    ctl.controls.target.copy(v.target);
    camera.position.copy(orbit(v.target, v.az, v.el, v.dist));
    camera.lookAt(v.target);
    ctl.controls.update();
    needsRender = true;
  } else ctl.goTo(v, ms);
};

// ------------------------------------------------------------ STEP 4: exploded view, animation, camera, picking
const explosion = createExplosion(octo);
const anim = createAnimator();
const byName = (n) => octo.root.getObjectByName(n);
const marker = (parent, x = 0, y = 0, z = 0) => {
  const m = new THREE.Object3D();
  m.position.set(x, y, z);
  parent.add(m);
  return m;
};
const armObj = (t) => explosion.armOf(t);
const midJoint = (t, k = 0.4) => {
  const a = armObj(t);
  return a.joints[Math.floor(a.joints.length * k)];
};
// where the camera looks for each part (children of the moving objects, so they travel with them)
const markers = {
  P01: marker(byName('glass-dome'), 0, -1.55, 0), // between the lifted dome and the opened body, so both stay in view
  P02: marker(byName('core-reactor'), 0, 0.3, 0),
  P03: marker(byName('front-camera').children[0], 0.45, 0, 0),
  P04: marker(byName('hull'), 0, -0.35, 0),
  P05: marker(byName('mechanism-upper'), 0, 0.4, 0),
  P06: marker(byName('jet-nozzle').children[0], 0.25, 0, 0),
  P15: marker(armObj('T5').joints[3]),
};
explosion.ARM.forEach((t, i) => (markers[`P${String(7 + i).padStart(2, '0')}`] = marker(midJoint(t))));
const director = createDirector({camera, ctl, explosion, anim, markers, fitDist, homeView: () => VIEWS.hero()});

// ------------------------------------------------------------ labels (follow the parts as they move)
const LABELS = [
  ['dome', 'ガラスドーム', '耐圧・広視界', 'glass-dome'],
  ['reactor', 'コアリアクター', 'エネルギー供給', 'core-reactor'],
  ['unit', 'コアユニット', '制御・AI', 'control-unit'],
  ['camera', '前方カメラ', '光学センサー', 'front-camera'],
  ['joint', '関節モジュール', '柔軟・高トルク', () => armObj('T6').joints[3]],
  ['pad', '吸着パッド', '強力吸着・回収', () => armObj('T5').joints[6]],
  ['arm', '多関節アーム', '8本・高自由度', () => armObj('T3').joints[5]],
  ['jet', 'ジェット推進', '高速機動', 'jet-nozzle'],
];
const labelLayer = $('#labels');
const bodyCentre = new THREE.Vector3(0, 1.45, 0);
octo.root.updateMatrixWorld(true);
const labelEls = LABELS.map(([key, name, sub, host]) => {
  const el = document.createElement('div');
  el.className = 'lbl';
  el.innerHTML = `<i></i><span>${name}<small>${sub}</small></span>`;
  labelLayer.append(el);
  const parent = typeof host === 'function' ? host() : byName(host);
  const local = parent.worldToLocal((octo.anchors[key] || new THREE.Vector3()).clone());
  return {el, m: marker(parent, local.x, local.y, local.z), inside: key === 'reactor' || key === 'unit'};
});
let labelsOn = params.get('labels') === '1';
const v = new THREE.Vector3();
const w3 = new THREE.Vector3();
const toCam = new THREE.Vector3();
function project(p) {
  v.copy(p).project(camera);
  return {x: (v.x * 0.5 + 0.5) * canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * canvas.clientHeight, front: v.z < 1};
}
function placeLabels() {
  labelLayer.hidden = !labelsOn;
  if (!labelsOn) return;
  toCam.copy(camera.position).sub(bodyCentre).normalize();
  for (const L of labelEls) {
    L.m.getWorldPosition(w3);
    const s = project(w3);
    const facing = L.inside ? 1 : w3.clone().sub(bodyCentre).normalize().dot(toCam);
    L.el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
    L.el.style.opacity = facing > -0.15 && s.front ? 1 : 0;
    L.el.classList.toggle('flip', s.x > canvas.clientWidth * 0.62);
  }
}

// ------------------------------------------------------------ selection
let selected = null;
let focusOn = true;
let autoOn = params.get('auto') !== '0' && !params.has('shot');
const partOf = (id) => explosion.parts.find((p) => p.id === id);
let lastE = explosion.progress(anim.state);

const ui = createUI({
  parts: explosion.parts,
  on: {
    select: (id) => select(id),
    close: () => deselect(true),
    toggle: (id) => (lastE[id] > 0.5 ? anim.close(id) : anim.open(id)),
    look: (id) => director.focus(id),
    explode: () => explodeAll(),
    assemble: () => assembleAll(),
    playPause: () => playPause(),
    slider: (p) => {
      anim.setP(p);
      ui.dismissHints();
      needsRender = true;
    },
    reset: () => resetAll(),
    auto: () => setAuto(!autoOn),
    labels: () => setLabels(!labelsOn),
    fullscreen: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.().catch(() => {})),
    view: (name) => setView(name),
    ref: () => toggleRef(),
    info: () => ($('#info').open ? $('#info').close() : $('#info').show()),
    focusToggle: () => {
      focusOn = !focusOn;
      ui.setToggle('#focusBtn', focusOn);
      if (selected) focusOn ? interaction.focus(selected) : interaction.clearFocus();
      needsRender = true;
    },
  },
});
ui.setToggle('#focusBtn', focusOn);

const interaction = createInteraction({
  canvas, camera, octo, explosion,
  onPick: (id) => (id ? select(id) : deselect(true)),
  onDouble: () => ctl.reset(),
});

function select(id, {camera: moveCam = true} = {}) {
  if (!id) return deselect(true);
  ui.dismissHints();
  if (id === selected) {
    // a second tap on the selected part toggles it open / closed
    lastE[id] > 0.5 ? anim.close(id) : anim.open(id);
    needsRender = true;
    return;
  }
  if (selected && anim.state.ind[selected] > 0) anim.close(selected); // changing part mid-animation: the old one goes back
  selected = id;
  interaction.highlight(id);
  if (focusOn) interaction.focus(id);
  anim.open(id);
  if (moveCam) director.focus(id);
  setAuto(false);
  ui.setSelected(id);
  ui.showCard(partOf(id), lastE[id]);
  needsRender = true;
}
function deselect(close) {
  if (selected && close) anim.close(selected);
  selected = null;
  interaction.clearHighlight();
  interaction.clearFocus();
  ui.setSelected(null);
  ui.hideCard();
  needsRender = true;
}
function explodeAll() {
  ui.dismissHints();
  deselect(false);
  setAuto(false);
  anim.playGlobal(1);
  director.overview();
}
function assembleAll() {
  deselect(false);
  anim.assembleAll();
  director.home();
}
function playPause() {
  if (anim.playing) anim.pause();
  else if (anim.paused) anim.resume();
  else if (anim.state.p < 1) explodeAll();
  else assembleAll();
  needsRender = true;
}
function resetAll() {
  deselect(false);
  anim.assembleAll(0.8);
  ctl.reset();
  needsRender = true;
}
function setAuto(on) {
  autoOn = on;
  ctl.setAuto(on);
  ui.setToggle('#autoBtn', on);
  needsRender = true;
}
function setLabels(on) {
  labelsOn = on;
  ui.setToggle('#lblBtn', on);
  labelLayer.hidden = !on;
  needsRender = true;
}
const refBox = $('#ref');
function toggleRef() {
  refBox.hidden = !refBox.hidden;
  if (!refBox.hidden) {
    resetAll();
    setView('hero');
  }
}
refBox.addEventListener('click', () => refBox.classList.toggle('big'));
$('#infoClose').addEventListener('click', () => $('#info').close());
setAuto(autoOn);
setLabels(labelsOn);
addEventListener('keydown', (e) => {
  if (e.target.closest('input,textarea')) return;
  const k = e.key.toLowerCase();
  if (k === 'r') resetAll();
  if (k === 'e') explodeAll();
  if (k === 'a') assembleAll();
  if (k === 'l') setLabels(!labelsOn);
  if (k === 'escape') deselect(true);
  if (e.key === ' ') {
    e.preventDefault();
    playPause();
  }
});
if (params.get('ui') === '0') document.body.classList.add('no-ui');
// a drag stops the auto-rotate demo only when the user starts steering
ctl.controls.addEventListener('start', () => ui.dismissHints());
setTimeout(() => ui.dismissHints(), 15000);

// ------------------------------------------------------------ hotspots: what can be tapped (Journey 3-8 s)
const HOT = [['P01', 'ガラスドーム'], ['P03', '前方カメラ'], ['P12', '触手'], ['P06', '推進ユニット']];
function placeHotspots() {
  if (!ui.hintsOn) return;
  toCam.copy(camera.position).sub(bodyCentre).normalize();
  ui.placeHotspots(HOT.map(([id, name]) => {
    markers[id].getWorldPosition(w3);
    const s = project(w3);
    const facing = w3.clone().sub(bodyCentre).normalize().dot(toCam);
    return {id, name, x: s.x, y: s.y, visible: s.front && facing > -0.1};
  }));
}

// ------------------------------------------------------------ render loop (on demand) + adaptive quality + LOD
const fpsEl = $('#fps');
fpsEl.hidden = !params.has('debug');
let frames = 0;
let t0 = performance.now();
let fps = 0;
let adaptStage = 0;
let measuring = !params.has('shot') && !forced;
const fpsLog = [];
let detailOn = true;
function adapt() {
  if (!measuring || fps === 0) return;
  if (fps < 40 && adaptStage === 0 && renderer.getPixelRatio() > 1) {
    renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() * 0.7));
    adaptStage = 1;
  } else if (fps < 28 && adaptStage <= 1 && tier.transmission) {
    tier.transmission = false;
    const old = mats.glass;
    const fresh = makeMaterials(tier);
    octo.root.traverse((o) => {
      if (o.material === old) o.material = fresh.glass;
    });
    old.dispose();
    for (const k in fresh) if (k !== 'glass') fresh[k].dispose();
    mats.glass = fresh.glass;
    adaptStage = 2;
  } else if (fps >= 40) measuring = false;
}
let forceOn = false;
let renderedFrames = 0; // for tests: wait until the page has stopped drawing
function loop() {
  requestAnimationFrame(loop);
  if (window.__octo?.film) return; // the film is drawn frame by frame from film.frame(t), nothing else may draw
  const animMoving = anim.tick();
  if (animMoving || needsRender) {
    lastE = explosion.render(anim.state);
    ui.setSlider(anim.state.p);
    ui.setStates(lastE);
    ui.setPlaying(anim.playing, anim.paused);
  }
  const pulsing = interaction.tick();
  const camMoving = ctl.update() || forceOn;
  // LOD: pins, slots and bolts on the arms are sub-pixel from far away
  const far = camera.position.distanceTo(ctl.controls.target) > 15;
  if (far === detailOn) {
    detailOn = !far;
    tent.setDetail(detailOn);
    needsRender = true;
  }
  if (!animMoving && !camMoving && !pulsing && !needsRender) {
    t0 = performance.now();
    frames = 0;
    return;
  }
  needsRender = false;
  renderer.render(scene, camera);
  placeLabels();
  placeHotspots();
  frames++;
  renderedFrames++;
  const now = performance.now();
  if (now - t0 >= 2000) {
    fps = (frames * 1000) / (now - t0);
    fpsLog.push(Math.round(fps * 10) / 10);
    fpsEl.textContent = `${fps.toFixed(0)} fps · ${tier.name} · pr ${renderer.getPixelRatio().toFixed(2)} · ${renderer.info.render.calls} calls · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris`;
    frames = 0;
    t0 = now;
    adapt();
  }
}

// ------------------------------------------------------------ test / screenshot hooks
const meas = createMeasure({renderer, scene, camera, octo, canvas});
window.__octo = {
  scene, octo, camera, controls: ctl.controls, setView, explosion, anim,
  measure: meas.measure,
  mask: meas.mask,
  orbitTo: (az, el, k = 1) => {
    camera.position.copy(orbit(TARGET, az, el, fitDist(k)));
    ctl.controls.target.copy(TARGET);
    camera.lookAt(TARGET);
    ctl.controls.update();
    renderer.render(scene, camera);
  },
  camState: () => {
    const d = camera.position.clone().sub(ctl.controls.target);
    return {az: Math.atan2(d.x, d.z) * 180 / Math.PI, dist: d.length(), el: Math.asin(d.y / d.length()) * 180 / Math.PI,
      target: ctl.controls.target.toArray()};
  },
  setLabels,
  setAuto,
  select,
  deselect,
  explodeAll,
  assembleAll,
  resetAll,
  playPause,
  get selected() {
    return selected;
  },
  progress: () => explosion.progress(anim.state),
  restError: () => explosion.restError(),
  partAt: (x, y) => interaction.partAt(x, y),
  showCardFor: (id) => {
    ui.setSelected(id);
    ui.showCard(partOf(id), lastE[id]);
  },
  /** jump straight to a state (screenshots): {p, open: [ids], view: part id | 'overview' | view name} */
  pose: ({p = 0, open = [], view = null, select: sel = null} = {}) => {
    anim.snapHome();
    anim.state.p = p;
    for (const id of open) anim.state.ind[id] = 1;
    if (sel) {
      selected = sel;
      interaction.highlight(sel);
      if (focusOn) interaction.focus(sel);
      interaction.tick();
    }
    lastE = explosion.render(anim.state);
    if (view === 'overview') director.overview(0);
    else if (view && VIEWS[view]) setView(view, 0);
    else if (view) ctl.goTo(director.viewFor(view), 0);
    ctl.update();
    renderer.render(scene, camera);
    placeLabels();
  },
  stats: () => ({
    fps, fpsLog, tier: tier.name, transmission: tier.transmission, pixelRatio: renderer.getPixelRatio(),
    calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
    ...octo.root.userData.stats,
  }),
  renderNow: () => {
    renderer.render(scene, camera);
    placeLabels();
  },
  forceContinuous: (on) => (forceOn = on),
  get frames() {
    return renderedFrames;
  },
};

if (params.has('shot')) setView(params.get('shot') || 'hero', 0);
// STEP 5: ?film -> the film timeline, driven frame by frame by tools/film.mjs (window.__octo.film.frame(t))
if (params.has('film')) {
  document.body.classList.add('no-ui', 'film');
  setAuto(false);
  setLabels(false);
  ui.dismissHints();
  const film = createFilm({camera, ctl, renderer, scene, explosion, anim, director, fitDist, overlay: $('#filmCap')});
  window.__octo.film = film;
  film.frame(0);
}
requestAnimationFrame(() => {
  renderer.compile(scene, camera);
  loop();
  requestAnimationFrame(() => {
    document.body.classList.add('ready');
    window.__ready = true;
  });
});

// ------------------------------------------------------------ cleanup
addEventListener('pagehide', () => {
  ctl.dispose();
  studio.dispose();
  interaction.clearHighlight();
  interaction.clearFocus();
  octo.root.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
      m.map?.dispose();
      m.dispose();
    });
  });
  renderer.dispose();
});

function fail(msg) {
  const el = document.getElementById('err');
  el.textContent = msg;
  el.hidden = false;
}
