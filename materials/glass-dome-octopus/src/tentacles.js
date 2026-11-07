// The 8 mechanical tentacles.
//
// Each tentacle is a real joint hierarchy: root -> joint 0 -> joint 1 -> ... (THREE.Object3D chain, every joint
// local to its parent), so STEP 3 can bend or detach any joint on its own. The visible parts are drawn with one
// InstancedMesh per part type for all 8 arms; update() copies every joint's world matrix into the instances, so
// moving a joint moves its parts.
//
// Units: the body radius is 1.0, the floor is y = 0. Each segment is built along +x at radius 1 and length SEG_L,
// then scaled by its own radius, so length tracks thickness (SEG_L * r) and the arm tapers joint by joint.
import * as THREE from 'three';
import {D2R, V3, cylX, merge, ringProfile, solid, sweepX} from './geometry.js';

// rings with a single rounding step per corner: the arms carry ~100 of each, so keep them light
const ring = (x0, x1, r0, r1, round, opts) => sweepX(ringProfile(x0, x1, r0, r1, round, 1), opts);

export const SEG_L = 1.9; // segment length / segment radius (reference: a segment is about as long as it is thick)
const R0 = 0.2; // root radius (reference: root diameter 0.20 of the body width 2.0 -> 0.40)
const RT = 0.058; // tip radius (reference: 0.3 of the root)

// screen angle theta: 0 = toward the hero camera, 90 = screen right, 180 = away, 270 = screen left
export const HERO_AZ = 35; // hero camera azimuth in degrees (0 = +z, 90 = +x)
// n: number of segments (each arm its own, as in the reference where 13-16 show)
export const TENTACLES = [
  {name: 'T1', theta: 122, kind: 'raised', n: 14, reach: 2.55, peak: 2.25, lat: [0.15, 0.35, 0.3], curl: {R: 0.34, turns: 1.15, tilt: 15}},
  {name: 'T2', theta: 243, kind: 'raised', n: 13, reach: 2.45, peak: 1.85, lat: [-0.1, -0.3, -0.25], curl: {R: 0.3, turns: 1.1, tilt: -20}},
  {name: 'T3', theta: 282, kind: 'floor', n: 13, reach: 2.6, lat: [0.15, 0.3, 0.1], curl: {R: 0.3, turns: 1.2, tilt: 10}},
  {name: 'T4', theta: 318, kind: 'floor', n: 13, reach: 2.45, lat: [-0.1, -0.35, -0.45], curl: {R: 0.3, turns: 1.15, tilt: -82}},
  {name: 'T5', theta: 352, kind: 'floor', n: 12, reach: 2.25, lat: [0.15, 0.35, 0.5], curl: {R: 0.3, turns: 1.15, tilt: 84}},
  {name: 'T6', theta: 27, kind: 'floor', n: 13, reach: 2.45, lat: [0.05, 0.3, 0.2], curl: {R: 0.3, turns: 1.15, tilt: 80}},
  {name: 'T7', theta: 74, kind: 'floor', n: 14, reach: 2.75, lat: [-0.1, -0.25, -0.3], curl: {R: 0.32, turns: 1.2, tilt: -10}},
  {name: 'T8', theta: 170, kind: 'floor', n: 12, reach: 2.4, lift: 0.45, lat: [0.2, 0.4, 0.35], curl: {R: 0.28, turns: 1.15, tilt: 25}},
];

const BODY_Y = 1.45; // body centre height (collar plane); the body sits low, as in the reference
const ROOT_POLAR = 118 * D2R;

const radiusAt = (u) => RT + (R0 - RT) * Math.pow(1 - u, 1.15);

/** The centre line of one tentacle, in octopus-root coordinates. */
function centreLine(spec) {
  const az = (HERO_AZ + spec.theta) * D2R;
  const out = new V3(Math.sin(az), 0, Math.cos(az));
  const up = new V3(0, 1, 0);
  const side = new V3().crossVectors(up, out).normalize();
  const P = (s, h, l = 0) => out.clone().multiplyScalar(s).addScaledVector(up, h).addScaledVector(side, l);
  const s0 = Math.sin(ROOT_POLAR) * 0.96;
  const h0 = BODY_Y + Math.cos(ROOT_POLAR) * 0.96;
  const [l1, l2, l3] = spec.lat;
  const pts = [P(s0, h0)];
  let down; // which way the tip curls: +up for floor arms, -up for raised arms
  if (spec.kind === 'raised') {
    const pk = spec.peak;
    pts.push(P(s0 + 0.32, h0 + 0.1, l1 * 0.4), P(1.45, pk - 0.45, l1), P(1.95, pk, l2), P(spec.reach, pk - 0.2, l3));
    down = -1;
  } else {
    const lift = spec.lift || 0;
    pts.push(P(s0 + 0.36, h0 - 0.16, l1 * 0.4), P(1.62, 0.5 + lift * 0.8, l1), P(2.02, 0.2 + lift, l2),
      P(spec.reach - 0.3, 0.13 + lift * 0.7, l3), P(spec.reach, 0.11 + lift * 0.55, l3 * 1.15));
    down = 1;
  }
  // the curl: a shrinking spiral that starts along the arm's last direction and turns toward n
  const E = pts[pts.length - 1];
  const t = E.clone().sub(pts[pts.length - 2]).normalize();
  let n = up.clone().multiplyScalar(down);
  n.addScaledVector(t, -n.dot(t)).normalize();
  n.applyAxisAngle(t, spec.curl.tilt * D2R);
  const {R, turns} = spec.curl;
  const C = E.clone().addScaledVector(n, R);
  const steps = 18;
  const tot = turns * Math.PI * 2;
  for (let k = 1; k <= steps; k++) {
    const ph = (k / steps) * tot;
    const r = R * (1 - 0.62 * (ph / tot));
    // centre drifts so the spiral tightens around itself rather than around C
    const c = C.clone().addScaledVector(n, -(R - r) * 0.55);
    pts.push(c.addScaledVector(n, -r * Math.cos(ph)).addScaledVector(t, r * Math.sin(ph)));
  }
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
}

// ------------------------------------------------------------ unit part geometries (radius 1, along +x)
function unitParts() {
  const L = SEG_L;
  // armour: two rounded plates over the top and sides; the underside (90 deg) stays open on the dark core.
  // The plates stop at 0.76 of the segment so a dark joint gap shows between segments (reference: ~0.25).
  const X1 = 1.27;
  const plate = (a0, a1) => sweepX([
    [0.08, 0.84], [0.08, 0.9], [0.15, 0.975], [0.3, 1.0], [X1 - 0.22, 1.0], [X1 - 0.07, 0.975], [X1, 0.9], [X1, 0.84],
  ], {a0, a1, segs: 16, smooth: 50});
  const shell = merge([plate(-128 * D2R, -5 * D2R), plate(5 * D2R, 128 * D2R)]);
  // dark structural core running through the whole segment
  const core = cylX(0.8, 0.76, L, 16).translate(L / 2, 0, 0);
  // the rotary joint between this segment and the next: two dark rings with a groove
  const joint = merge([ring(X1 + 0.02, X1 + 0.2, 0.6, 0.9, 0.03, {segs: 24}), ring(X1 + 0.26, L + 0.03, 0.6, 0.86, 0.02, {segs: 24})]);
  // hinge pins on both flanks of the joint
  const pins = merge([
    new THREE.CylinderGeometry(0.12, 0.12, 0.14, 10).rotateX(Math.PI / 2).translate(X1 + 0.23, 0, 0.92),
    new THREE.CylinderGeometry(0.12, 0.12, 0.14, 10).rotateX(Math.PI / 2).translate(X1 + 0.23, 0, -0.92),
  ]);
  // suction pads: dark cup + glowing green rim + black eye; 2 on the lower flanks at the joint, 2 on the underside
  const padAt = (x, a, out) => new THREE.Matrix4().makeRotationX(a).multiply(new THREE.Matrix4().makeTranslation(x, out, 0));
  const cup = new THREE.CylinderGeometry(0.26, 0.3, 0.16, 16);
  const rim = new THREE.TorusGeometry(0.22, 0.055, 6, 20).rotateX(Math.PI / 2).translate(0, 0.085, 0);
  const eye = new THREE.CylinderGeometry(0.11, 0.11, 0.2, 10);
  const padMats = [padAt(X1 + 0.23, 180 * D2R - 1.95, 0.9), padAt(X1 + 0.23, 180 * D2R + 1.95, 0.9), padAt(0.75, 180 * D2R - 0.5, 0.8), padAt(0.75, 180 * D2R + 0.5, 0.8)];
  const pads = merge(padMats.map((mm) => cup.clone().applyMatrix4(mm)));
  const padGlow = merge(padMats.map((mm) => rim.clone().applyMatrix4(mm)));
  const padEye = merge(padMats.map((mm) => eye.clone().applyMatrix4(mm)));
  // dark slots cut into the plates' flanks (the reference's black windows), one per flank
  const slot = (x, a, w) => new THREE.BoxGeometry(w, 0.06, 0.2).translate(0, 0.99, 0).applyMatrix4(new THREE.Matrix4().makeRotationX(a)).translate(x, 0, 0);
  const slots = merge([slot(0.68, 72 * D2R, 0.5), slot(0.68, -72 * D2R, 0.5), slot(0.66, 0, 0.5)]);
  // bolts at the plate corners
  const bolt = new THREE.CylinderGeometry(0.05, 0.05, 0.06, 6);
  const bolts = merge([[0.32, 24], [0.32, -24], [X1 - 0.2, 24], [X1 - 0.2, -24]].map(([x, a]) =>
    bolt.clone().translate(0, 1.0, 0).applyMatrix4(new THREE.Matrix4().makeRotationX(a * D2R)).translate(x, 0, 0)));
  // the tip: a rounded white cap with a thin green ring (the reference's green tips)
  const tip = solid(0.05, 2.1, (u) => (u < 0.82 ? 1 - 0.5 * u : (1 - 0.5 * 0.82) * Math.sqrt(Math.max(0, 1 - ((u - 0.82) / 0.18) ** 2))), {segs: 20}, 16);
  const tipGlow = ring(1.4, 1.52, 0.6, 0.66, 0.01, {segs: 20});
  // the root collar where the arm leaves the body: a white cowl, a dark ring, a green line
  const collar = ring(-0.6, 0.3, 0.95, 1.34, 0.06, {segs: 32});
  const collarDark = ring(0.28, 0.52, 0.8, 1.14, 0.03, {segs: 32});
  const collarGlow = ring(0.3, 0.36, 1.13, 1.18, 0.01, {segs: 32});
  return {shell, core, joint, pins, pads, padGlow, padEye, slots, bolts, tip, tipGlow, collar, collarDark, collarGlow};
}

/**
 * Build the 8 tentacles.
 * @returns {{group: THREE.Group, arms: {name:string, root:THREE.Object3D, joints:THREE.Object3D[], radii:number[]}[], update: () => void, count: () => number}}
 */
export function buildTentacles(mats) {
  const group = new THREE.Group();
  group.name = 'tentacles';
  const U = unitParts();
  const arms = [];
  const tmpQ = new THREE.Matrix4();
  for (const spec of TENTACLES) {
    const curve = centreLine(spec);
    const len = curve.getLength();
    const root = new THREE.Object3D();
    root.name = `${spec.name}-root`;
    group.add(root);
    const joints = [];
    const radii = [];
    // segment lengths proportional to the local radius, scaled so the arm has exactly spec.n segments
    const countFor = (k) => {
      let q = 0;
      let c = 0;
      while (q < len - 1e-4 && c < 200) {
        q += k * radiusAt(q / len);
        c++;
      }
      return c;
    };
    let lo = 0.2;
    let hi = 20;
    for (let it = 0; it < 40; it++) {
      const mid = (lo + hi) / 2;
      if (countFor(mid) > spec.n) lo = mid;
      else hi = mid;
    }
    const kStep = hi;
    let s = 0;
    let prevWorld = new THREE.Matrix4();
    let prevUp = null;
    let parent = root;
    const p0 = new V3();
    const p1 = new V3();
    while (s < len - 0.02) {
      const u = s / len;
      const r = radiusAt(u);
      let L = kStep * r;
      const last = joints.length === spec.n - 1;
      if (last) L = len - s;
      curve.getPointAt(Math.min(1, u), p0);
      curve.getPointAt(Math.min(1, (s + L) / len), p1);
      const T = p1.clone().sub(p0).normalize();
      // parallel transport of the "up" side so the plates never twist between joints
      let Up = prevUp ? prevUp.clone() : new V3(0, 1, 0);
      Up.addScaledVector(T, -Up.dot(T));
      if (Up.lengthSq() < 1e-6) Up = new V3(1, 0, 0).addScaledVector(T, -T.x);
      Up.normalize();
      const Z = new V3().crossVectors(T, Up).normalize();
      const world = new THREE.Matrix4().makeBasis(T, Up, Z).setPosition(p0);
      const local = tmpQ.copy(prevWorld).invert().multiply(world);
      const j = new THREE.Object3D();
      j.name = `${spec.name}-joint${joints.length}`;
      local.decompose(j.position, j.quaternion, j.scale);
      j.userData = {radius: r, length: L, last, index: joints.length};
      parent.add(j);
      joints.push(j);
      radii.push(r);
      parent = j;
      prevWorld = world;
      prevUp = Up;
      s += L;
      if (last) break;
    }
    arms.push({name: spec.name, spec, root, joints, radii, curve, length: len});
  }

  // ---- instanced parts: one InstancedMesh per part type for all arms
  const segJoints = [];
  const tipJoints = [];
  const rootJoints = [];
  for (const a of arms) {
    a.joints.forEach((j, i) => {
      if (j.userData.last) tipJoints.push(j);
      else segJoints.push(j);
      if (i === 0) rootJoints.push(j);
    });
  }
  const layers = [
    // [geometry, material, which joints]
    [U.shell, mats.shell, segJoints],
    [U.core, mats.graphite, segJoints],
    [U.joint, mats.titanium, segJoints],
    [U.pins, mats.steel, segJoints],
    [U.pads, mats.graphite, segJoints],
    [U.padGlow, mats.glow, segJoints],
    [U.padEye, mats.black, segJoints],
    [U.slots, mats.black, segJoints],
    [U.bolts, mats.steel, segJoints],
    [U.tip, mats.shell, tipJoints],
    [U.tipGlow, mats.glow, tipJoints],
    [U.collar, mats.shell, rootJoints],
    [U.collarDark, mats.titanium, rootJoints],
    [U.collarGlow, mats.glow, rootJoints],
  ];
  const meshes = layers.map(([geo, mat, js]) => {
    const im = new THREE.InstancedMesh(geo, mat, js.length);
    im.userData.joints = js;
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false; // instances span the whole octopus; the bounding sphere of the unit part would cull them
    group.add(im);
    return im;
  });

  const m = new THREE.Matrix4();
  const S = new THREE.Matrix4();
  const inv = new THREE.Matrix4();
  function update() {
    group.updateMatrixWorld(true);
    inv.copy(group.matrixWorld).invert();
    for (const im of meshes) {
      im.userData.joints.forEach((j, i) => {
        const r = j.userData.radius;
        // length follows the segment's own length (close to SEG_L * r), section follows its radius
        const sx = j.userData.last ? r : j.userData.length / SEG_L;
        S.makeScale(sx, r, r);
        m.multiplyMatrices(inv, j.matrixWorld).multiply(S);
        im.setMatrixAt(i, m);
      });
      im.instanceMatrix.needsUpdate = true;
    }
  }
  update();

  const count = () => meshes.reduce((n, im) => n + im.count, 0);
  return {group, arms, update, count, meshes};
}
