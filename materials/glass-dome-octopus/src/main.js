// Glass-Dome Octopus — entry point: renderer, quality tier, scene, controls, labels, UI, render loop.
import * as THREE from 'three';
import {createControls, orbit} from './controls.js';
import {createStudio} from './lighting.js';
import {makeMaterials} from './materials.js';
import {buildOctopus} from './octopus.js';
import {HERO_AZ} from './tentacles.js';

const params = new URLSearchParams(location.search);
const $ = (s) => document.querySelector(s);
const canvas = $('#c');

// ------------------------------------------------------------ quality tier
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
const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 100);
const studio = createStudio(renderer, scene, tier);
let mats = makeMaterials(tier);
const octo = buildOctopus(mats);
scene.add(octo.root);

// ------------------------------------------------------------ views
const TARGET = new THREE.Vector3(0, 1.05, 0);
// distance that fits the whole octopus (about 5.6 wide, 3.2 tall) in the current aspect
const fitDist = (k = 1) => {
  const v = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return Math.min(21, Math.max(6.2 / v, 5.6 / (v * camera.aspect)) * k);
};
const VIEWS = {
  hero: () => ({target: TARGET, az: HERO_AZ, el: 20, dist: fitDist(0.84)}),
  front: () => ({target: TARGET, az: 0, el: 12, dist: fitDist(1.02)}),
  side: () => ({target: TARGET, az: 90, el: 12, dist: fitDist(1.02)}),
  rear: () => ({target: TARGET, az: 180, el: 16, dist: fitDist(1.02)}),
  top: () => ({target: TARGET, az: HERO_AZ, el: 70, dist: fitDist(1.05)}),
};
let needsRender = true;
const ctl = createControls(camera, canvas, {target: TARGET, home: () => VIEWS.hero(), onChange: () => (needsRender = true)});

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

// ------------------------------------------------------------ labels
const LABELS = [
  ['dome', 'ガラスドーム', '耐圧・広視界'],
  ['reactor', 'コアリアクター', 'エネルギー供給'],
  ['unit', 'コアユニット', '制御・AI'],
  ['camera', '前方カメラ', '光学センサー'],
  ['joint', '関節モジュール', '柔軟・高トルク'],
  ['pad', '吸着パッド', '強力吸着・回収'],
  ['arm', '多関節アーム', '8本・高自由度'],
  ['jet', 'ジェット推進', '高速機動'],
];
const labelLayer = $('#labels');
const bodyCentre = new THREE.Vector3(0, 1.45, 0);
const labelEls = LABELS.map(([key, name, sub]) => {
  const el = document.createElement('div');
  el.className = 'lbl';
  el.innerHTML = `<i></i><span>${name}<small>${sub}</small></span>`;
  labelLayer.append(el);
  const p = octo.anchors[key] instanceof THREE.Vector3 ? octo.anchors[key] : new THREE.Vector3();
  // the inside parts (reactor, unit) are seen through the glass from any side
  const inside = key === 'reactor' || key === 'unit';
  return {el, p, key, inside};
});
let labelsOn = params.get('labels') !== '0';
const v = new THREE.Vector3();
const toCam = new THREE.Vector3();
function placeLabels() {
  labelLayer.hidden = !labelsOn;
  if (!labelsOn) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  for (const L of labelEls) {
    v.copy(L.p).project(camera);
    const x = (v.x * 0.5 + 0.5) * w;
    const y = (-v.y * 0.5 + 0.5) * h;
    // hide labels on the far side of the body
    toCam.copy(camera.position).sub(bodyCentre).normalize();
    const facing = L.inside ? 1 : v.set(L.p.x, L.p.y, L.p.z).sub(bodyCentre).normalize().dot(toCam);
    const show = facing > -0.15;
    L.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    L.el.style.opacity = show ? 1 : 0;
    L.el.classList.toggle('flip', x > w * 0.62);
  }
}

// ------------------------------------------------------------ UI
const autoBtn = $('#autoBtn');
const lblBtn = $('#lblBtn');
let autoOn = params.get('auto') !== '0' && !params.has('shot');
const setAuto = (on) => {
  autoOn = on;
  ctl.setAuto(on);
  autoBtn.setAttribute('aria-pressed', on);
  needsRender = true;
};
setAuto(autoOn);
lblBtn.setAttribute('aria-pressed', labelsOn);
autoBtn.addEventListener('click', () => setAuto(!autoOn));
lblBtn.addEventListener('click', () => {
  labelsOn = !labelsOn;
  lblBtn.setAttribute('aria-pressed', labelsOn);
  labelLayer.hidden = !labelsOn; // immediately, not on the next rendered frame
  needsRender = true;
});
$('#resetBtn').addEventListener('click', () => ctl.reset());
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
const refBox = $('#ref');
$('#refBtn').addEventListener('click', () => {
  refBox.hidden = !refBox.hidden;
  $('#refBtn').setAttribute('aria-pressed', !refBox.hidden);
  if (!refBox.hidden) setView('hero');
});
refBox.addEventListener('click', () => refBox.classList.toggle('big'));
const info = $('#info');
$('#infoBtn').addEventListener('click', () => (info.open ? info.close() : info.show()));
$('#infoClose').addEventListener('click', () => info.close());
addEventListener('keydown', (e) => {
  if (e.target.closest('input,textarea')) return;
  if (e.key === 'r' || e.key === 'R') ctl.reset();
  if (e.key === ' ') {
    e.preventDefault();
    setAuto(!autoOn);
  }
  if (e.key === 'l' || e.key === 'L') lblBtn.click();
});
if (params.get('ui') === '0') document.body.classList.add('no-ui');

// ------------------------------------------------------------ render loop (on demand) + adaptive quality
const fpsEl = $('#fps');
const showFps = params.has('debug');
fpsEl.hidden = !showFps;
let frames = 0;
let t0 = performance.now();
let fps = 0;
let adaptStage = 0;
let measuring = !params.has('shot') && !forced;
const fpsLog = [];
function adapt() {
  // after a 2 s window of continuous frames: drop the pixel ratio, then the glass transmission
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
function loop() {
  requestAnimationFrame(loop);
  const moving = ctl.update();
  if (!moving && !needsRender) {
    t0 = performance.now();
    frames = 0;
    return;
  }
  needsRender = false;
  renderer.render(scene, camera);
  placeLabels();
  frames++;
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
window.__octo = {
  scene,
  octo,
  camera,
  controls: ctl.controls,
  setView,
  camState: () => {
    const d = camera.position.clone().sub(ctl.controls.target);
    return {az: Math.atan2(d.x, d.z) * 180 / Math.PI, dist: d.length(), el: Math.asin(d.y / d.length()) * 180 / Math.PI};
  },
  setLabels: (on) => {
    labelsOn = on;
    needsRender = true;
  },
  setAuto,
  stats: () => ({
    fps,
    fpsLog,
    tier: tier.name,
    transmission: tier.transmission,
    pixelRatio: renderer.getPixelRatio(),
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    ...octo.root.userData.stats,
  }),
  renderNow: () => {
    renderer.render(scene, camera);
    placeLabels();
  },
  forceContinuous: (on) => {
    // keep rendering every frame (for fps measurement without auto-rotate)
    forceOn = on;
  },
};
let forceOn = false;
const _upd = ctl.update;
ctl.update = () => _upd() || forceOn;

if (params.has('shot')) setView(params.get('shot') || 'hero', 0);
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
