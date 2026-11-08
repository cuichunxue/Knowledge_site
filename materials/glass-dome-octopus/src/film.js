// STEP 5 — the 15 s showcase film.
//
// Everything is a pure function of the film time t (seconds): the explode state, the camera and the captions.
// tools/film.mjs calls frame(t) for every frame and saves the canvas — frame-exact, never a screen recording —
// and tools/film_audio.py builds the sound from the same beat times (BEATS below, exported to beats.json).
import * as THREE from 'three';
import {orbit} from './controls.js';

export const DURATION = 15;

// sound cues on the same timeline (seconds): unlock clicks, lifts, the explode cascade, the reassembly
export const BEATS = {
  unlock: [2.0, 3.6, 5.8],
  lift: [2.15, 3.75, 6.0],
  explode: [8.0, 11.6],
  assemble: [13.4, 14.4],
  title: [0.3, 14.4],
};

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ramp = (t, a, b) => clamp01((t - a) / (b - a));
const smooth = (x) => x * x * x * (x * (6 * x - 15) + 10); // smootherstep

const CAPTIONS = [
  // [start, end, title, subtitle, style]
  [0.25, 2.0, 'Glass-Dome Octopus', 'ガラスドーム・オクトパス', 'hero'],
  [2.2, 3.6, 'P01 ガラスドーム', '耐圧・広視界 — ボルトが浮き、真上へ', 'part'],
  [3.85, 5.5, 'P02 AI コア', 'エネルギー供給・制御 AI — リアクター浮上', 'part'],
  [5.9, 7.7, '多関節アーム', '根元のロックが外れ、関節が順に開く', 'part'],
  [8.2, 11.8, '全体分解', '15 部品グループ・衝突しない軌道', 'part'],
  [12.0, 13.35, 'コードだけで組んだ 3D', 'Three.js · 画像も動画素材も使わない', 'part'],
  [13.55, 15.0, 'Glass-Dome Octopus', 'タップして分解できる HTML5 アプリ', 'end'],
];

export function createFilm({camera, ctl, renderer, scene, explosion, anim, director, fitDist, overlay}) {
  // camera keys: {t, target, az, el, dist}. The arm shot aims where tentacle 3 ends up when opened.
  const armView = director.viewFor('P09');
  const coreView = director.viewFor('P02');
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const wide = fitDist(1.2);
  const KEYS = [
    {t: 0.0, target: V(0, 1.05, 0), az: 18, el: 15, dist: 12.6},
    {t: 2.0, target: V(0, 1.25, 0), az: 40, el: 19, dist: 10.8},
    {t: 3.7, target: V(0, 2.25, 0), az: 52, el: 30, dist: 11.4},
    {t: 5.5, target: coreView.target, az: 26, el: 13, dist: 4.9},
    {t: 6.4, target: V(0, 1.4, 0), az: 12, el: 22, dist: 8.6}, // pull back between the core and the arm: never through the body
    {t: 7.7, target: armView.target, az: armView.az, el: armView.el, dist: armView.dist},
    {t: 8.6, target: V(0, 1.7, 0), az: 20, el: 20, dist: wide * 0.95},
    {t: 11.8, target: V(0, 2.05, 0), az: 62, el: 23, dist: wide},
    {t: 13.4, target: V(0, 2.0, 0), az: 88, el: 21, dist: wide * 0.98},
    {t: 15.0, target: V(0, 1.05, 0), az: 48, el: 17, dist: 11.2},
  ];
  // each segment eases in and out, so the camera dwells on every shot and never cuts
  function cameraAt(t) {
    let i = 0;
    while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const k = smooth(ramp(t, a.t, b.t));
    return {
      target: a.target.clone().lerp(b.target, k),
      az: a.az + (b.az - a.az) * k,
      el: a.el + (b.el - a.el) * k,
      dist: a.dist + (b.dist - a.dist) * k,
    };
  }
  // the explode state at time t (parts in order, then the full explode, then the reassembly)
  function stateAt(t) {
    const back = 1 - smooth(ramp(t, 13.4, 14.4)); // 1 until the reassembly, then down to 0
    const ind = {};
    for (const p of explosion.parts) ind[p.id] = 0;
    ind.P01 = ramp(t, 2.0, 3.3) * back;
    ind.P02 = ramp(t, 3.6, 5.0) * back;
    ind.P09 = ramp(t, 5.8, 7.4) * back;
    const p = ramp(t, 8.0, 11.6) * back;
    return {p, ind};
  }

  function captionAt(t) {
    for (const [a, b, title, sub, style] of CAPTIONS) {
      if (t >= a && t <= b) {
        const fade = Math.min(ramp(t, a, a + 0.35), 1 - ramp(t, b - 0.35, b));
        return {title, sub, style, alpha: smooth(fade), rise: (1 - smooth(ramp(t, a, a + 0.5))) * 14};
      }
    }
    return null;
  }

  function frame(t) {
    const s = stateAt(t);
    anim.snapHome();
    anim.state.p = s.p;
    Object.assign(anim.state.ind, s.ind);
    explosion.render(anim.state);
    const c = cameraAt(t);
    ctl.controls.target.copy(c.target);
    camera.position.copy(orbit(c.target, c.az, c.el, c.dist));
    camera.lookAt(c.target);
    const cap = captionAt(t);
    if (overlay) {
      overlay.hidden = !cap;
      if (cap) {
        overlay.className = `film-cap cap-${cap.style}`; // cap- prefix: ".part" is the part-menu button class
        overlay.style.opacity = cap.alpha.toFixed(3);
        overlay.style.transform = `translateY(${cap.rise.toFixed(1)}px)`;
        overlay.querySelector('b').textContent = cap.title;
        overlay.querySelector('span').textContent = cap.sub;
      }
    }
    renderer.render(scene, camera);
    return {p: s.p, cam: c.az};
  }

  return {frame, DURATION, BEATS, KEYS: KEYS.map((k) => k.t)};
}
