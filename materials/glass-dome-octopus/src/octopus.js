// The Glass-Dome Octopus body, built from code.
//
// Layout (body radius R = 1, collar plane at y = 0 inside the "body" group, which sits at y = BODY_Y):
//   dome (glass, y 0..0.97)  -> core reactor, gears, pistons, hoses, top control unit inside
//   collar ring (y = 0)      -> white ring with a thin green line and bolts, holds the dome
//   lower hull (y 0..-1)     -> 3 rows of curved white plates with gaps, dark sphere and gears behind,
//                               side flare plates ("VT-08"), front camera + small side lens, rear jet nozzle
//   tentacles                -> see tentacles.js (8 jointed arms)
//
// Every part that STEP 3 will open is its own named group with an anchor (userData.anchor).
import * as THREE from 'three';
import {D2R, V3, aimX, cylX, gearGeo, latheY, put, rbox, ring, ringProfile, sph, sweepX, tube} from './geometry.js';
import {glowSprite, textDecal} from './materials.js';
import {buildTentacles} from './tentacles.js';

export const BODY_Y = 1.45;

/** Small helper: InstancedMesh from a list of matrices. */
function inst(parent, geo, mat, list, name) {
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((m, i) => im.setMatrixAt(i, m));
  im.castShadow = true;
  im.receiveShadow = true;
  if (name) im.name = name;
  parent.add(im);
  return im;
}
/** Matrix that puts a +y-axis part at point p with its axis along dir. */
function onAxis(p, dir, s = 1) {
  const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir.clone().normalize());
  return new THREE.Matrix4().compose(p, q, new V3(s, s, s));
}
const group = (parent, name, anchor) => {
  const g = new THREE.Group();
  g.name = name;
  if (anchor) g.userData.anchor = anchor;
  parent.add(g);
  return g;
};

export function buildOctopus(mats) {
  const root = new THREE.Group();
  root.name = 'glass-dome-octopus';
  const body = group(root, 'body');
  body.position.y = BODY_Y;
  let smallParts = 0; // the ~260 small parts of the job description: counted as they are placed
  const anchors = {};

  // ================================================================ collar (holds the dome)
  const collar = group(body, 'collar', new V3(1.06, 0, 0));
  put(collar, latheY(ringProfile(-0.07, 0.08, 0.92, 1.075, 0.025), 0, Math.PI * 2, {segs: 96}), mats.shell);
  put(collar, latheY(ringProfile(-0.13, -0.06, 0.88, 1.0, 0.012), 0, Math.PI * 2, {segs: 96}), mats.titanium);
  put(collar, latheY(ringProfile(-0.012, 0.012, 1.07, 1.085, 0.004), 0, Math.PI * 2, {segs: 96}), mats.glow);
  {
    const L = [];
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      L.push(onAxis(new V3(Math.sin(a) * 1.0, 0.085, Math.cos(a) * 1.0), new V3(0, 1, 0)));
    }
    inst(collar, new THREE.CylinderGeometry(0.018, 0.018, 0.02, 8), mats.steel, L, 'collar-bolts');
    smallParts += L.length;
  }

  // ================================================================ glass dome
  const domeG = group(body, 'glass-dome', new V3(0, 1.0, 0));
  const glass = put(domeG, new THREE.SphereGeometry(0.965, 96, 48, 0, Math.PI * 2, 0, Math.PI * 0.5 + 0.06), mats.glass);
  glass.name = 'dome-glass';
  glass.castShadow = false;
  glass.receiveShadow = false;
  glass.renderOrder = 2;
  anchors.dome = sph(40 * D2R, -55 * D2R, 0.97).add(new V3(0, BODY_Y, 0)); // on the glass, front-left (world)

  // ================================================================ inside the dome
  const inner = group(body, 'mechanism-upper', new V3(0, 0.4, 0));
  // deck plate and a stepped ring around it
  put(inner, latheY(ringProfile(-0.05, 0.03, 0, 0.9, 0.01), 0, Math.PI * 2, {segs: 64}), mats.graphite);
  put(inner, latheY(ringProfile(0.03, 0.09, 0.62, 0.86, 0.01), 0, Math.PI * 2, {segs: 64}), mats.titanium);
  // big horizontal drive gear on the deck
  {
    const g = put(inner, gearGeo(48, 0.6, 0.56, 0.05, 0.22, 8).rotateX(Math.PI / 2), mats.titanium, 0, 0.12, 0);
    g.name = 'drive-gear';
  }
  // the core reactor: a glowing sphere in 3 dark rings, on a pedestal
  const reactor = group(inner, 'core-reactor', new V3(0, 0.4, 0));
  reactor.position.y = 0.4;
  put(reactor, new THREE.SphereGeometry(0.19, 32, 20), mats.core).castShadow = false;
  put(reactor, new THREE.IcosahedronGeometry(0.19, 1), new THREE.MeshStandardMaterial({color: '#0b2a1c', emissive: '#19e08a', emissiveIntensity: 0.7, wireframe: true}));
  [[0.26, 0.022, 0, 0], [0.31, 0.02, Math.PI / 2, 0.3], [0.36, 0.024, 1.1, -0.6]].forEach(([R, t, rx, rz]) => {
    const m = put(reactor, new THREE.TorusGeometry(R, t, 10, 64), mats.graphite);
    m.rotation.set(rx, 0, rz);
    const gl = put(reactor, new THREE.TorusGeometry(R - t * 0.9, t * 0.35, 6, 64), mats.glow);
    gl.rotation.copy(m.rotation);
  });
  const halo = glowSprite('#2bff9c', 1.5, 0.75);
  reactor.add(halo);
  put(reactor, cylX(0.12, 0.16, 0.26, 24).rotateZ(Math.PI / 2), mats.titanium, 0, -0.27, 0);
  // 4 posts holding the reactor
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    put(inner, new THREE.CylinderGeometry(0.022, 0.026, 0.58, 10), mats.steel, Math.sin(a) * 0.3, 0.36, Math.cos(a) * 0.3);
  }
  anchors.reactor = new V3(0, BODY_Y + 0.4, 0);
  // a dark drum round the reactor, cut into 5 arcs so the glow shows through the windows
  for (let i = 0; i < 5; i++) {
    const a0 = (i / 5) * Math.PI * 2 - 0.407; // windows centred on az 35 (the hero view) and every 72 deg
    put(inner, latheY(ringProfile(0.08, 0.34, 0.5, 0.56, 0.015), a0, a0 + 0.62 * (Math.PI * 2 / 5), {segs: 16}), mats.graphite);
    put(inner, latheY(ringProfile(0.32, 0.37, 0.46, 0.6, 0.01), a0, a0 + 0.62 * (Math.PI * 2 / 5), {segs: 16}), mats.titanium);
  }
  // an outer ring of 12 small gears and blocks hugging the glass (the reference's dense rim)
  {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.36;
      const dir = new V3(Math.sin(a), 0, Math.cos(a));
      const R = 0.1 + (i % 3) * 0.025;
      const g = new THREE.Mesh(gearGeo(12 + (i % 3) * 2, R, R - 0.025, 0.035, 0.03, 0), i % 2 ? mats.titanium : mats.graphite);
      g.quaternion.setFromUnitVectors(new V3(0, 0, 1), dir);
      g.position.copy(dir.clone().multiplyScalar(0.84)).setY(0.14 + (i % 2) * 0.1);
      g.castShadow = true;
      inner.add(g);
      const b = new THREE.Mesh(rbox(0.12, 0.16, 0.08, 0.015), mats.black);
      b.position.copy(dir.clone().multiplyScalar(0.72)).setY(0.12);
      b.lookAt(dir.clone().multiplyScalar(3).setY(0.12));
      inner.add(b);
    }
  }
  // 6 vertical gears around the reactor, axes radial, mixed sizes
  const gears = group(inner, 'gears');
  const gearSpec = [[0.24, 22], [0.18, 16], [0.26, 24], [0.2, 18], [0.23, 20], [0.17, 16]];
  gearSpec.forEach(([R, n], i) => {
    const a = (i / 6) * Math.PI * 2 + 1.134; // leaves a gap toward the hero view so the core shows
    const dir = new V3(Math.sin(a), 0, Math.cos(a));
    const g = new THREE.Mesh(gearGeo(n, R, R - 0.035, 0.045, 0.05, 5), i % 2 ? mats.graphite : mats.titanium);
    g.castShadow = g.receiveShadow = true;
    // gearGeo's axis is +z: turn it so the axis points along dir
    g.quaternion.setFromUnitVectors(new V3(0, 0, 1), dir);
    g.position.copy(dir.clone().multiplyScalar(0.6)).setY(0.34 + (i % 2) * 0.06);
    gears.add(g);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 16), mats.steel);
    hub.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir);
    hub.position.copy(g.position);
    gears.add(hub);
  });
  // 8 pistons from the deck up to the top unit, leaning inward
  {
    const bodyL = [];
    const rodL = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const lo = new V3(Math.sin(a) * 0.74, 0.08, Math.cos(a) * 0.74);
      const hi = new V3(Math.sin(a) * 0.36, 0.7, Math.cos(a) * 0.36);
      const d = hi.clone().sub(lo);
      const len = d.length();
      d.normalize();
      bodyL.push(onAxis(lo.clone().addScaledVector(d, len * 0.3), d));
      rodL.push(onAxis(lo.clone().addScaledVector(d, len * 0.72), d));
    }
    inst(inner, new THREE.CylinderGeometry(0.04, 0.04, 0.3, 12), mats.graphite, bodyL, 'pistons');
    inst(inner, new THREE.CylinderGeometry(0.018, 0.018, 0.34, 8), mats.steel, rodL, 'piston-rods');
    smallParts += 16;
  }
  // hoses: black rubber cables looping from the deck edge over to the top unit
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.2;
    const s = (r, y, da = 0) => new V3(Math.sin(a + da) * r, y, Math.cos(a + da) * r);
    put(inner, tube([s(0.82, 0.06), s(0.86, 0.3, 0.15), s(0.72, 0.6, 0.3), s(0.42, 0.78, 0.4), s(0.2, 0.74, 0.5)], 0.02, 40, 6), i % 3 ? mats.rubber : mats.titanium);
    smallParts += 1;
  }
  // the top control unit (コアユニット): a stacked dark turret
  const topUnit = group(inner, 'control-unit', new V3(0, 0.8, 0));
  put(topUnit, latheY(ringProfile(0.6, 0.72, 0, 0.3, 0.02), 0, Math.PI * 2, {segs: 48}), mats.graphite);
  put(topUnit, latheY(ringProfile(0.72, 0.76, 0.12, 0.34, 0.01), 0, Math.PI * 2, {segs: 48}), mats.steel);
  put(topUnit, gearGeo(30, 0.27, 0.245, 0.04, 0.08, 6).rotateX(Math.PI / 2), mats.titanium, 0, 0.79, 0);
  put(topUnit, latheY(ringProfile(0.81, 0.9, 0, 0.13, 0.03), 0, Math.PI * 2, {segs: 32}), mats.black);
  put(topUnit, latheY(ringProfile(0.66, 0.68, 0.3, 0.31, 0.003), 0, Math.PI * 2, {segs: 48}), mats.glow);
  anchors.unit = new V3(0, BODY_Y + 0.82, 0);
  // servo boxes and small parts round the deck (the dense small layer)
  {
    const boxL = [];
    const tinyL = [];
    const boltL = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.13;
      const p = new V3(Math.sin(a) * 0.45, 0.1, Math.cos(a) * 0.45);
      boxL.push(new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), a), new V3(1, 1, 1)));
    }
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      tinyL.push(onAxis(new V3(Math.sin(a) * 0.8, 0.1, Math.cos(a) * 0.8), new V3(0, 1, 0)));
    }
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2 + 0.05;
      boltL.push(onAxis(new V3(Math.sin(a) * 0.66, 0.095, Math.cos(a) * 0.66), new V3(0, 1, 0)));
    }
    inst(inner, rbox(0.1, 0.09, 0.14, 0.012), mats.graphite, boxL, 'servos');
    inst(inner, new THREE.CylinderGeometry(0.014, 0.014, 0.07, 8), mats.brass, tinyL, 'terminals');
    inst(inner, new THREE.CylinderGeometry(0.012, 0.012, 0.02, 6), mats.steel, boltL, 'deck-bolts');
    smallParts += boxL.length + tinyL.length + boltL.length;
  }

  // ================================================================ lower hull
  const hull = group(body, 'hull', new V3(0, -0.6, 1.0));
  // dark inner sphere behind the plates
  put(hull, new THREE.SphereGeometry(0.93, 48, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mats.graphite);
  // gears inside, seen through the plate windows
  const lowerMech = group(hull, 'mechanism-lower');
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.15;
    const dir = sph(112 * D2R, a);
    const g = new THREE.Mesh(gearGeo(18, 0.17, 0.14, 0.04, 0.04, 4), i % 2 ? mats.titanium : mats.graphite);
    g.quaternion.setFromUnitVectors(new V3(0, 0, 1), dir);
    g.position.copy(dir.clone().multiplyScalar(0.935));
    g.castShadow = true;
    lowerMech.add(g);
  }
  // the plates: 3 rows of curved panels with gaps; a few left out as windows onto the mechanism
  const plates = group(hull, 'armour-plates');
  const row = (p0, p1, n, off, gap, skip = [], R = 1.0, t = 0.05) => {
    for (let i = 0; i < n; i++) {
      if (skip.includes(i)) continue;
      const a0 = off + (i / n) * Math.PI * 2 + gap / 2;
      const a1 = off + ((i + 1) / n) * Math.PI * 2 - gap / 2;
      const m = put(plates, latheY(domeProfileRim(R, t, p0, p1), a0, a1, {segs: 16}), mats.shell);
      m.name = `plate-${p0.toFixed(2)}-${i}`;
    }
  };
  const domeProfileRim = (R, t, p0, p1, steps = 10) => {
    // a plate cross-section with chamfered rims (the clear coat draws a line along them)
    const out = [];
    const inn = [];
    const c = 0.012;
    for (let k = 0; k <= steps; k++) {
      const p = p0 + ((p1 - p0) * k) / steps;
      const rr = R - (k === 0 || k === steps ? c : 0);
      out.push([rr * Math.cos(p), rr * Math.sin(p)]);
      inn.push([(R - t) * Math.cos(p), (R - t) * Math.sin(p)]);
    }
    return [...out, ...inn.reverse()];
  };
  row(93 * D2R, 116 * D2R, 10, 0.05, 0.09, [4, 8]); // equator row; windows rear-right and front-left
  row(120 * D2R, 142 * D2R, 8, Math.PI / 8 + 0.1, 0.1, [0, 3, 6]); // windows toward the hero view, behind, front-left
  row(146 * D2R, 157 * D2R, 8, 0.25, 0.14, [2, 6]);
  // bottom hub where the arms meet
  put(hull, latheY(ringProfile(-0.98, -0.86, 0, 0.42, 0.04), 0, Math.PI * 2, {segs: 48}), mats.titanium);
  put(hull, latheY(ringProfile(-1.01, -0.96, 0, 0.2, 0.02), 0, Math.PI * 2, {segs: 32}), mats.black);
  // plate bolts along the rows
  {
    const L = [];
    for (const [p, n, off] of [[95, 20, 0.12], [118.5, 16, 0.2], [144.5, 16, 0.3]]) {
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * Math.PI * 2;
        const d = sph(p * D2R, a);
        L.push(onAxis(d.clone().multiplyScalar(1.0), d));
      }
    }
    inst(plates, new THREE.CylinderGeometry(0.016, 0.016, 0.02, 8), mats.steel, L, 'plate-bolts');
    smallParts += L.length;
  }
  // side flare plates (left and right), the right one marked VT-08
  const flare = (phiC, mark) => {
    const g = group(hull, mark ? 'side-plate-right' : 'side-plate-left');
    put(g, latheY(domeProfileRim(1.1, 0.07, 74 * D2R, 120 * D2R), phiC - 32 * D2R, phiC + 30 * D2R, {segs: 24}), mats.shell);
    // a dark mount behind it and a green painted line along its front edge
    put(g, latheY(domeProfileRim(1.035, 0.04, 78 * D2R, 116 * D2R), phiC - 28 * D2R, phiC + 26 * D2R, {segs: 16}), mats.titanium);
    put(g, latheY(domeProfileRim(1.105, 0.02, 76 * D2R, 118 * D2R), phiC - 33.5 * D2R, phiC - 32 * D2R, {segs: 2}), mats.greenPaint);
    // dark vents cut into it
    for (let k = 0; k < 3; k++) {
      const d = sph((100 + k * 6) * D2R, phiC + 14 * D2R);
      const m = new THREE.Mesh(rbox(0.16, 0.03, 0.05, 0.01), mats.black);
      m.position.copy(d.clone().multiplyScalar(1.103));
      m.lookAt(d.clone().multiplyScalar(3));
      g.add(m);
    }
    if (mark) {
      const d = sph(97 * D2R, phiC - 6 * D2R);
      const dec = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.1), textDecal('VT-08'));
      dec.position.copy(d.clone().multiplyScalar(1.107));
      dec.lookAt(d.clone().multiplyScalar(3));
      g.add(dec);
    }
    return g;
  };
  flare(90 * D2R, true);
  flare(-90 * D2R, false);

  // ================================================================ front camera
  const camDir = sph(101 * D2R, 0);
  const camera = group(hull, 'front-camera', camDir.clone().multiplyScalar(1.5));
  {
    const c = new THREE.Group();
    camera.add(c);
    c.position.copy(camDir.clone().multiplyScalar(0.9));
    aimX(c, camDir);
    // the white cowl that wraps the housing into the hull
    put(c, ring(-0.02, 0.2, 0.33, 0.42, 0.05, {segs: 64}), mats.shell);
    put(c, cylX(0.36, 0.36, 0.22, 48).translate(0.0, 0, 0), mats.titanium);
    // the housing barrel and bezels
    put(c, ring(0.1, 0.34, 0.27, 0.37, 0.04, {segs: 64}), mats.shell);
    put(c, ring(0.3, 0.4, 0.22, 0.29, 0.015, {segs: 64}), mats.titanium);
    put(c, ring(0.38, 0.41, 0.205, 0.228, 0.006, {segs: 64}), mats.glow);
    put(c, ring(0.33, 0.37, 0.15, 0.2, 0.01, {segs: 48}), mats.graphite);
    // the lens: a glossy black cap
    const lens = put(c, new THREE.SphereGeometry(0.205, 48, 24, 0, Math.PI * 2, 0, 0.95).rotateZ(-Math.PI / 2), mats.lens, 0.2, 0, 0);
    lens.name = 'lens';
    // a thin inner iris ring glimpsed through it
    put(c, ring(0.36, 0.37, 0.06, 0.075, 0.003, {segs: 32}), mats.glowSoft);
    const L = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      L.push(onAxis(new V3(0.345, Math.cos(a) * 0.32, Math.sin(a) * 0.32), new V3(1, 0, 0)));
    }
    inst(c, new THREE.CylinderGeometry(0.014, 0.014, 0.02, 8), mats.steel, L, 'camera-bolts');
    smallParts += L.length;
  }
  anchors.camera = new V3().copy(camDir).multiplyScalar(1.35).add(new V3(0, BODY_Y, 0));
  // small side lens (right of the main camera in the hero view)
  {
    const d = sph(108 * D2R, 50 * D2R);
    const c = group(hull, 'side-lens', d.clone().multiplyScalar(1.3));
    const s = new THREE.Group();
    c.add(s);
    s.position.copy(d.clone().multiplyScalar(0.96));
    aimX(s, d);
    put(s, ring(-0.02, 0.12, 0.1, 0.17, 0.02, {segs: 48}), mats.shell);
    put(s, ring(0.1, 0.14, 0.085, 0.12, 0.008, {segs: 48}), mats.titanium);
    put(s, ring(0.135, 0.145, 0.08, 0.09, 0.003, {segs: 48}), mats.glow);
    put(s, new THREE.SphereGeometry(0.085, 32, 16, 0, Math.PI * 2, 0, 1.0).rotateZ(-Math.PI / 2), mats.lens, 0.08, 0, 0);
  }

  // ================================================================ rear jet nozzle (ジェット推進)
  {
    const d = sph(112 * D2R, Math.PI);
    const jet = group(hull, 'jet-nozzle', d.clone().multiplyScalar(1.4));
    const s = new THREE.Group();
    jet.add(s);
    s.position.copy(d.clone().multiplyScalar(0.92));
    aimX(s, d);
    put(s, ring(-0.02, 0.18, 0.2, 0.3, 0.04, {segs: 48}), mats.shell);
    // the bell: flares open toward the back
    put(s, sweepBell(), mats.titanium);
    put(s, ring(0.08, 0.1, 0.1, 0.13, 0.004, {segs: 48}), mats.glow);
    put(s, ring(0.03, 0.08, 0, 0.1, 0.01, {segs: 32}), mats.black);
    anchors.jet = d.clone().multiplyScalar(1.3).add(new V3(0, BODY_Y, 0));
  }

  // ================================================================ tentacles
  const tent = buildTentacles(mats);
  root.add(tent.group);
  // anchors on an arm: a joint module and a pad on T6 (front right)
  root.updateMatrixWorld(true);
  const armJoint = (name, k) => tent.arms.find((a) => a.name === name).joints[k];
  const jp = new V3();
  armJoint('T6', 3).getWorldPosition(jp);
  anchors.joint = jp.clone().add(new V3(0, 0.22, 0));
  armJoint('T3', 5).getWorldPosition(jp);
  anchors.arm = jp.clone().add(new V3(0, 0.2, 0));
  armJoint('T5', 6).getWorldPosition(jp);
  anchors.pad = jp.clone().add(new V3(0, 0.12, 0));

  // count small parts in the tentacles too (bolts, pins, pads, slots per segment)
  const segs = tent.arms.reduce((n, a) => n + a.joints.length, 0);
  smallParts += segs * (6 + 2 + 2 + 6); // bolts, pins, pads, slots
  root.userData.stats = {smallParts, segments: segs, perArm: tent.arms.map((a) => a.joints.length)};

  return {root, body, tentacles: tent, anchors};
}

// the jet bell profile: a hollow flared cone along +x
function sweepBell() {
  const pts = [];
  const N = 10;
  for (let k = 0; k <= N; k++) {
    const u = k / N;
    pts.push([0.04 + u * 0.24, 0.12 + 0.07 * u * u + 0.02]);
  }
  for (let k = N; k >= 0; k--) {
    const u = k / N;
    pts.push([0.04 + u * 0.24, 0.1 + 0.07 * u * u]);
  }
  return sweepX(pts, {segs: 48});
}
