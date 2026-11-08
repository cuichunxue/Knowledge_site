// STEP 4 — the exploded view.
//
// The model's hierarchy is split into 15 part groups (P01..P15). Each part has a progress e in 0..1 and a pose
// function that sets its objects from their saved REST transforms — never by adding to the current transform — so
// render(state) is a pure function of the state: the same state always gives the same picture, and going back to
// e = 0 lands exactly on the approved STEP 3 model however many times it was opened.
//
// state = {p, ind}: p is the global explode progress (slider / "全体分解"), ind[id] the part's own progress
// (clicking a part). A part's progress is max(its window of p, ind[id]), plus the parts it depends on (the glass
// must be up before the core can rise, an arm must be off the floor before its pads open).
import * as THREE from 'three';

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const stage = (e, a, b) => clamp01((e - a) / (b - a));
export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const UNLOCK = 0.17; // the first 17 % of a part's progress is the unlock (0.2 s of a 1.2 s open)

// arm number (1..8) -> tentacle name in tentacles.js
const ARM = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'];

/** The 15 part groups: id, names, what it does, its slot in the global explode, its camera. */
export const PARTS = [
  {id: 'P01', key: 'dome', name: 'ガラスドーム', en: 'Glass Dome', group: '本体', sub: '耐圧・広視界',
    desc: '深海 4,000m の水圧に耐える透明ドーム。中の AI コアと機構を守りながら、全方位の視界を確保します。',
    motion: '固定ボルトが浮き、ドームが真上に持ち上がります。', window: [0.0, 0.14],
    view: {az: 35, el: 30, dist: 9.6}},
  {id: 'P02', key: 'core', name: 'AI コア', en: 'Core Reactor', group: '本体', sub: 'エネルギー供給・制御 AI',
    desc: '緑に光るリアクターが全身に電力を送り、上部のコアユニットが探査・作業・回収の判断を行います。',
    motion: '上部ユニットが回って外れ、リアクターが浮上してリングが開きます。', window: [0.4, 0.56],
    view: {az: 20, el: 14, dist: 4.4}},
  {id: 'P03', key: 'camera', name: '前方カメラ', en: 'Front Camera', group: '本体', sub: '光学センサー',
    desc: '黒い光学ガラスと緑のリングを持つ主カメラ。右側の副レンズと合わせて、暗い海中でも距離を測ります。',
    motion: 'レンズが 1/4 回転してロックが外れ、光軸に沿って前へ引き出されます。', window: [0.2, 0.34],
    view: {az: 6, el: 6, dist: 3.4}},
  {id: 'P04', key: 'panels', name: '外装パネル', en: 'Armour Panels', group: '本体', sub: '白いクリアコート装甲',
    desc: '3 段に分かれた曲面パネルと側面の "VT-08" 板。継ぎ目の間から内部の機構が見えます。',
    motion: 'ボルトが抜け、パネルが放射状に開きます（下段は触手が外れてから）。', window: [0.1, 0.28],
    view: {az: 100, el: 14, dist: 7.2}},
  {id: 'P05', key: 'gears', name: '内部ギア', en: 'Inner Gears', group: '本体', sub: '駆動・伝達',
    desc: '縦ギア 6・リムの小ギア 12・下部ギア 10・駆動ギア。真鍮とダークチタンの歯車が動力を伝えます。',
    motion: 'ギアが回転しながら軸に沿って外へ抜けます。', window: [0.3, 0.46],
    view: {az: 50, el: 46, dist: 5.4}},
  {id: 'P06', key: 'jet', name: '推進ユニット', en: 'Jet Thruster', group: '本体', sub: '高速機動',
    desc: '背面のジェットノズル。水を噴き出して一気に移動します。奥の緑のリングが噴射口です。',
    motion: 'ノズルがひねって外れ、後方へ引き出されます。', window: [0.8, 0.92],
    view: {az: 180, el: 16, dist: 4.4}},
  ...ARM.map((t, i) => ({id: `P${String(7 + i).padStart(2, '0')}`, key: `arm${i + 1}`, arm: t, name: `触手 ${i + 1}`,
    en: `Tentacle ${i + 1}`, group: '触手', sub: '多関節アーム・高自由度',
    desc: '13〜15 節の関節アーム。各関節に回転リングと軸ピン、下面に吸着パッドが並びます。',
    motion: '根元のロックリングが回り、アームが外れて関節が根元から順に開きます。', window: [0.5 + 0.03 * i, 0.72 + 0.03 * i],
    view: {arm: true, daz: 58, el: 28, dist: 5.4}})),
  {id: 'P15', key: 'pads', name: '吸着パッド', en: 'Suction Pads', group: '細部', sub: '強力吸着・回収（触手 5）',
    desc: '触手 5 の吸着パッド。黒いカップ・緑の発光リム・中央の吸引口が層になっています。',
    motion: 'パッドがカップ・リム・吸引口の 3 層に分かれて浮き上がります。', window: [0.88, 1.0],
    view: {pads: true, daz: 70, el: 20, dist: 4.6}},
];
PARTS.forEach((p) => (p.arm = p.arm || null));

export function createExplosion(octo) {
  const root = octo.root;
  const tent = octo.tentacles;
  const byName = (n) => root.getObjectByName(n);
  const armOf = (name) => tent.arms.find((a) => a.name === name);

  // ---- objects each part moves, with their rest transforms
  const rest = new Map();
  const keep = (o) => {
    if (!rest.has(o)) rest.set(o, {p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone(), v: o.visible});
    return o;
  };
  const R = (o) => rest.get(o);
  const reset = (o) => {
    const r = R(o);
    o.position.copy(r.p);
    o.quaternion.copy(r.q);
    o.scale.copy(r.s);
    o.visible = r.v;
  };

  const dome = keep(byName('glass-dome'));
  const collarBolts = keep(byName('collar-bolts'));
  const inner = byName('mechanism-upper');
  const unit = keep(byName('control-unit'));
  const reactor = keep(byName('core-reactor'));
  const rings = reactor.children.filter((c) => c.userData.ring).map(keep);
  const halo = keep(reactor.children.find((c) => c.isSprite));
  const camera = keep(byName('front-camera'));
  const camInner = keep(camera.children[0]);
  const sideLens = keep(byName('side-lens'));
  const jet = keep(byName('jet-nozzle'));
  const jetInner = keep(jet.children[0]);
  const plates = byName('armour-plates').children.filter((c) => c.userData.plate).map(keep);
  const flares = [byName('side-plate-right'), byName('side-plate-left')].map(keep);
  const plateBolts = keep(byName('plate-bolts'));
  const bigGears = byName('gears').children.map(keep);
  const rimGears = byName('rim-gears').children.map(keep);
  const lowerGears = byName('mechanism-lower').children.map(keep);
  const driveGear = keep(byName('drive-gear'));
  // world directions of the camera / lens / jet axes, in their parents' frames
  const camDir = camInner.position.clone().normalize();
  const lensDir = sideLens.children[0].position.clone().normalize();
  const jetDir = jetInner.position.clone().normalize();
  const camOut = camDir.clone().addScaledVector(UP, 0.55).normalize(); // first move of the camera: out and up
  // the band plates that sit right next to an arm wait for that arm to leave (no plate runs into an arm)
  const nearestArm = (d, limit) => {
    const az = Math.atan2(d.x, d.z);
    let best = null;
    for (const a of tent.arms) {
      const dz = Math.abs(Math.atan2(Math.sin(az - a.azimuth), Math.cos(az - a.azimuth)));
      if (dz < limit && (!best || dz < best.dz)) best = {dz, arm: a.name};
    }
    return best ? best.arm : null;
  };
  for (const pl of plates) pl.userData.waitFor = nearestArm(pl.userData.plate.dir, 0.5);
  for (const f of flares) f.userData.waitFor = nearestArm(f.userData.plate.dir, 0.7); // the big side plates
  for (const g of lowerGears) g.userData.waitFor = nearestArm(g.userData.axis, 0.45);

  // tag every object with its part id, for picking
  const tag = (o, id) => o.traverse((c) => (c.userData.partId = id));
  tag(dome, 'P01');
  tag(unit, 'P02');
  tag(reactor, 'P02');
  tag(camera, 'P03');
  tag(sideLens, 'P03');
  tag(byName('armour-plates'), 'P04');
  flares.forEach((f) => tag(f, 'P04'));
  tag(byName('collar'), 'P04');
  tag(byName('hull').children[0], 'P04'); // the dark inner sphere behind the plates
  tag(byName('gears'), 'P05');
  tag(byName('rim-gears'), 'P05');
  tag(byName('mechanism-lower'), 'P05');
  tag(driveGear, 'P05');
  inner.children.forEach((c) => c.userData.partId ?? tag(c, 'P05')); // deck, drum, pistons, hoses -> the gear works
  tag(jet, 'P06');

  // ---- progress per part from the state (with dependencies)
  function progress(state) {
    const e = {};
    for (const p of PARTS) e[p.id] = Math.max(stage(state.p, p.window[0], p.window[1]), state.ind[p.id] || 0);
    // dependencies: what has to be out of the way first
    e.P01 = Math.max(e.P01, e.P02, e.P05); // the glass lifts before the core rises or the gears come out
    e.P04 = Math.max(e.P04, e.P05); // the band panels open before the lower gears come out
    e.P11 = Math.max(e.P11, Math.min(1, e.P15 * 0.6)); // tentacle 5 leaves the floor before its pads open
    return e;
  }

  const q = new THREE.Quaternion();
  const axisQ = (axis, ang) => q.setFromAxisAngle(axis, ang);

  function render(state) {
    const e = progress(state);
    for (const o of rest.keys()) reset(o);

    // P01 glass dome: the collar bolts lift (unlock), then the dome rises straight up, clear of the core unit
    {
      const u = stage(e.P01, 0, UNLOCK);
      collarBolts.position.y += 0.035 * ease(u);
      dome.position.y += 3.0 * ease(stage(e.P01, UNLOCK, 1));
    }
    // P02 core: the control unit turns 30° (unlock) and rises; the reactor follows and its rings swing open
    {
      unit.quaternion.premultiply(axisQ(UP, (Math.PI / 6) * ease(stage(e.P02, 0, UNLOCK))));
      unit.position.y += 1.45 * ease(stage(e.P02, UNLOCK, 0.8));
      reactor.position.y += 0.75 * ease(stage(e.P02, 0.3, 1));
      const open = ease(stage(e.P02, 0.45, 1));
      rings.forEach((rg, k) => rg.quaternion.multiply(axisQ(new V3(1, 0, 0), open * (0.9 + 0.5 * k))));
      halo.scale.multiplyScalar(1 + 0.25 * open);
    }
    // P03 camera: a quarter-turn of the lens (unlock), out along the optical axis, then up over the arms
    {
      camInner.quaternion.multiply(axisQ(new V3(1, 0, 0), (Math.PI / 2) * ease(stage(e.P03, 0, UNLOCK))));
      camera.position.addScaledVector(camOut, 0.38 * ease(stage(e.P03, UNLOCK, 0.5)));
      const lift = ease(stage(e.P03, 0.45, 1));
      camera.position.addScaledVector(camDir, 0.65 * lift).addScaledVector(UP, 0.5 * lift);
      sideLens.position.addScaledVector(lensDir, 0.55 * ease(stage(e.P03, UNLOCK, 1))).addScaledVector(UP, 0.3 * ease(stage(e.P03, 0.4, 1)));
    }
    // P04 panels: the bolts back out (unlock) and drop away; the band row opens outward and up (above the arm
    // roots), the side plates outward; the two lower rows only unseat until the arms have left
    let minSlide = 1;
    const slideOf = {};
    for (let i = 0; i < 8; i++) {
      slideOf[ARM[i]] = stage(e[`P${String(7 + i).padStart(2, '0')}`], 0.15, 0.6);
      minSlide = Math.min(minSlide, slideOf[ARM[i]]);
    }
    {
      const u = stage(e.P04, 0, UNLOCK);
      plateBolts.scale.multiplyScalar(1 + 0.05 * ease(u));
      plateBolts.visible = e.P04 < UNLOCK;
      const t = ease(stage(e.P04, UNLOCK, 1));
      const low = ease(stage(e.P04, UNLOCK, 1) * (0.15 + 0.85 * minSlide));
      const st = stage(e.P04, UNLOCK, 1);
      for (const pl of plates) {
        const {dir, row} = pl.userData.plate;
        if (row === 0) {
          // band plates: out and up; next to an arm only unseated (25 %) until that arm has left
          const k = pl.userData.waitFor ? ease(st * (0.25 + 0.75 * slideOf[pl.userData.waitFor])) : t;
          pl.position.addScaledVector(dir, 0.42 * k).addScaledVector(UP, 0.32 * k);
        } else pl.position.addScaledVector(dir, 0.42 * low);
      }
      for (const f of flares) {
        const d = f.userData.plate.dir.clone().setY(0).normalize();
        const k = t;
        f.position.addScaledVector(d, 0.2 * k).addScaledVector(UP, 0.7 * k); // mostly up: the arms run outward below
      }
    }
    // P05 gears: out along their own axes while spinning; the big ones also climb clear of the rim ring
    {
      const t = ease(stage(e.P05, UNLOCK, 1));
      const spin = e.P05 * Math.PI * 2;
      for (const g of bigGears) {
        const ax = g.userData.axis;
        g.position.addScaledVector(ax, 0.3 * t).addScaledVector(UP, 1.15 * t);
        if (!g.userData.hubOf) g.quaternion.premultiply(axisQ(ax, spin));
      }
      for (const g of rimGears) {
        g.position.addScaledVector(g.userData.axis, -0.08 * t).addScaledVector(UP, 0.5 * t); // up and a touch inward, away from the raised arms
        g.quaternion.premultiply(axisQ(g.userData.axis, -spin * 1.6));
      }
      const sl = stage(e.P05, 0.3, 1);
      for (const g of lowerGears) {
        const tl = g.userData.waitFor ? ease(sl * (0.3 + 0.7 * slideOf[g.userData.waitFor])) : ease(sl);
        g.position.addScaledVector(g.userData.axis, 0.2 * tl).addScaledVector(UP, 0.08 * tl);
        g.quaternion.premultiply(axisQ(g.userData.axis, spin));
      }
      driveGear.quaternion.premultiply(axisQ(UP, spin * 0.5));
    }
    // P06 jet: a 60° twist (unlock), then straight back along the nozzle axis
    {
      jetInner.quaternion.multiply(axisQ(new V3(1, 0, 0), (Math.PI / 3) * ease(stage(e.P06, 0, UNLOCK))));
      jet.position.addScaledVector(jetDir, 0.9 * ease(stage(e.P06, UNLOCK, 1)));
    }
    // P07..P14 tentacles and P15 pads: lock ring, slide off, joints open root first
    ARM.forEach((t, i) => {
      const id = `P${String(7 + i).padStart(2, '0')}`;
      const arm = armOf(t);
      const ea = e[id];
      arm.pose.lock = stage(ea, 0, 0.15);
      arm.pose.slide = stage(ea, 0.15, 0.6);
      arm.pose.open = stage(ea, 0.4, 1);
      arm.pose.pad = t === 'T5' ? stage(e.P15, 0.3, 1) : 0;
    });
    tent.update();
    root.updateMatrixWorld(true);
    return e;
  }

  // ---- the rest snapshot (for the "no drift" check): every local transform + every instance matrix
  const snap = () => {
    const objs = [];
    for (const o of rest.keys()) objs.push([...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()]);
    for (const a of tent.arms) for (const j of a.joints) objs.push([...j.position.toArray(), ...j.quaternion.toArray()]);
    for (const a of tent.arms) objs.push([...a.root.position.toArray(), ...a.root.quaternion.toArray()]);
    const inst = tent.meshes.map((im) => Float32Array.from(im.instanceMatrix.array));
    return {objs, inst};
  };
  render({p: 0, ind: {}});
  const restSnap = snap();
  /** Max absolute difference between now and the rest snapshot (0 after a full reassembly). */
  function restError() {
    const now = snap();
    let m = 0;
    now.objs.forEach((v, i) => v.forEach((x, k) => (m = Math.max(m, Math.abs(x - restSnap.objs[i][k])))));
    now.inst.forEach((arr, i) => arr.forEach((x, k) => (m = Math.max(m, Math.abs(x - restSnap.inst[i][k])))));
    return m;
  }

  return {parts: PARTS, render, progress, restError, snapshot: snap, armOf, ARM};
}
