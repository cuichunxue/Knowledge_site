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
// STEP 3: root diameter 0.46 = 0.24 of the glass diameter 1.93 (reference 0.23), and a slow taper: the reference arm
// is still ~0.73 of its root thickness half way out, ~0.46 at the start of the curl and ~0.25 at the tip.
const R0 = 0.23;
const TAPER = (u) => (1 - 0.72 * Math.pow(u, 1.5)) * (u > 0.8 ? 1 - 1.4 * (u - 0.8) : 1);

// screen angle theta: 0 = toward the hero camera, 90 = screen right, 180 = away, 270 = screen left
export const HERO_AZ = 35; // hero camera azimuth in degrees (0 = +z, 90 = +x)
// The reference's 8 arms, read off the picture: 2 raised behind (upper left, upper right), 2 straight out to the
// sides at mid-body height whose tips curl down, and 4 down / toward the viewer onto the floor. None points away.
// n: segments per arm (13-16 show in the reference).
export const TENTACLES = [
  {name: 'T1', theta: 120, kind: 'raised', n: 15, reach: 2.75, peak: 0.78, lat: [0.15, 0.3, 0.25], curl: {R: 0.3, turns: 1.1, tilt: 15}},
  {name: 'T2', theta: 238, kind: 'raised', n: 14, reach: 2.6, peak: 0.32, lat: [-0.1, -0.25, -0.2], curl: {R: 0.28, turns: 1.05, tilt: -20}},
  {name: 'T3', theta: 270, kind: 'side', n: 14, reach: 2.75, h: -0.22, lat: [0.12, 0.32, 0.12], curl: {R: 0.28, turns: 1.05, tilt: 10}},
  {name: 'T7', theta: 90, kind: 'side', n: 14, reach: 2.55, h: -0.15, lat: [-0.12, -0.3, -0.12], curl: {R: 0.27, turns: 1.05, tilt: -10}},
  {name: 'T4', theta: 298, kind: 'floor', n: 14, reach: 2.3, lat: [-0.05, -0.2, -0.3], curl: {R: 0.34, turns: 0.95, tilt: -45}},
  {name: 'T8', theta: 330, kind: 'floor', n: 13, reach: 1.7, lat: [0.05, 0.1, 0.05], curl: {R: 0.34, turns: 0.95, tilt: -80}},
  {name: 'T5', theta: 2, kind: 'floor', n: 13, reach: 1.42, lat: [0.1, 0.2, 0.25], curl: {R: 0.34, turns: 0.95, tilt: 75}},
  {name: 'T6', theta: 42, kind: 'floor', n: 14, reach: 2.2, lat: [0.05, 0.2, 0.15], curl: {R: 0.34, turns: 0.95, tilt: 55}},
];

const BODY_Y = 1.45; // body centre height; the body sits low, as in the reference
const ROOT_POLAR = 124 * D2R;

const radiusAt = (u) => R0 * TAPER(Math.min(1, u));

/** The centre line of one tentacle, in octopus-root coordinates. */
function centreLine(spec) {
  const az = (HERO_AZ + spec.theta) * D2R;
  const out = new V3(Math.sin(az), 0, Math.cos(az));
  const up = new V3(0, 1, 0);
  const side = new V3().crossVectors(up, out).normalize();
  const P = (s, h, l = 0) => out.clone().multiplyScalar(s).addScaledVector(up, h).addScaledVector(side, l);
  const s0 = Math.sin(ROOT_POLAR) * 0.92;
  const h0 = BODY_Y + Math.cos(ROOT_POLAR) * 0.92;
  const [l1, l2, l3] = spec.lat;
  const pts = [P(s0, h0)];
  let down; // which way the tip curls: +up for floor arms, -up for raised and side arms
  if (spec.kind === 'raised') {
    const pk = BODY_Y + spec.peak;
    pts.push(P(s0 + 0.32, h0 + 0.12, l1 * 0.4), P(1.35, pk - 0.4, l1), P(1.8, pk, l2), P(spec.reach, pk - 0.2, l3));
    down = -1;
  } else if (spec.kind === 'side') {
    // straight out at mid-body height, a slight sag, then the tip curls under
    const hs = BODY_Y + spec.h;
    pts.push(P(s0 + 0.32, h0 + 0.02, l1 * 0.4), P(1.4, hs + 0.04, l1), P(1.85, hs, l2), P(spec.reach, hs - 0.15, l3));
    down = -1;
  } else {
    pts.push(P(s0 + 0.32, h0 - 0.22, l1 * 0.4), P(1.35, 0.42, l1), P(1.62, 0.22, l2),
      P(spec.reach - 0.22, 0.16, l3), P(spec.reach, 0.15, l3 * 1.1));
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
  // STEP 3 armour: an overlapping shell (armadillo-like) instead of separate white blocks. Each shell flares at its
  // rear lip (r 1.07) and overhangs the joint, so neighbouring segments read as layered plates, not zebra stripes.
  const X1 = 1.55;
  const plate = (a0, a1) => sweepX([
    [0.04, 0.92], [0.12, 0.99], [0.35, 1.01], [1.3, 1.03], [1.47, 1.07], [X1, 1.04], [X1, 0.95], [1.4, 0.9], [0.04, 0.86],
  ], {a0, a1, segs: 16, smooth: 40});
  const shell = merge([plate(-122 * D2R, -4 * D2R), plate(4 * D2R, 122 * D2R)]);
  // a dark panel seam across the shell, splitting it into a front and a rear plate
  const seam = merge([
    sweepX(ringProfile(0.86, 0.9, 0.99, 1.035, 0.008, 1), {a0: -122 * D2R, a1: -4 * D2R, segs: 12}),
    sweepX(ringProfile(0.86, 0.9, 0.99, 1.035, 0.008, 1), {a0: 4 * D2R, a1: 122 * D2R, segs: 12}),
  ]);
  // a second, grey under-plate on each lower flank (the layered side armour of the reference)
  const under = merge([
    sweepX(ringProfile(0.2, 1.42, 0.86, 0.98, 0.03, 1), {a0: 118 * D2R, a1: 160 * D2R, segs: 8}),
    sweepX(ringProfile(0.2, 1.42, 0.86, 0.98, 0.03, 1), {a0: -160 * D2R, a1: -118 * D2R, segs: 8}),
  ]);
  // dark structural core running through the whole segment
  const core = cylX(0.8, 0.76, L, 16).translate(L / 2, 0, 0);
  // the rotary joint: two titanium rings with a groove (grey metal, not black: reference joints read as dark steel)
  const joint = merge([ring(X1 + 0.02, X1 + 0.16, 0.6, 0.86, 0.025, {segs: 24}), ring(X1 + 0.2, L + 0.04, 0.6, 0.82, 0.02, {segs: 24})]);
  // a thin green line in the joint's groove (the reference's lit joint rings)
  const jointGlow = ring(X1 + 0.165, X1 + 0.195, 0.8, 0.845, 0.006, {segs: 24});
  // hinge pins on both flanks of the joint
  const pins = merge([
    new THREE.CylinderGeometry(0.12, 0.12, 0.14, 10).rotateX(Math.PI / 2).translate(X1 + 0.18, 0, 0.88),
    new THREE.CylinderGeometry(0.12, 0.12, 0.14, 10).rotateX(Math.PI / 2).translate(X1 + 0.18, 0, -0.88),
  ]);
  // suction pads: dark cup + glowing green rim + black eye; 2 on the underside, 2 on the joint's lower flanks
  const padAt = (x, a, out) => new THREE.Matrix4().makeRotationX(a).multiply(new THREE.Matrix4().makeTranslation(x, out, 0));
  const cup = new THREE.CylinderGeometry(0.27, 0.31, 0.16, 16);
  const rim = new THREE.TorusGeometry(0.245, 0.068, 6, 20).rotateX(Math.PI / 2).translate(0, 0.085, 0);
  const eye = new THREE.CylinderGeometry(0.11, 0.11, 0.2, 10);
  const padDefs = [[0.8, 180 * D2R - 0.48, 0.82], [0.8, 180 * D2R + 0.48, 0.82], [X1 + 0.18, 180 * D2R - 1.95, 0.84], [X1 + 0.18, 180 * D2R + 1.95, 0.84]];
  // each pad on its own (cup / rim / eye), with the outward normal it lifts along when opened (STEP 4)
  const padParts = padDefs.map(([x, a, out]) => {
    const mm = padAt(x, a, out);
    return {cup: cup.clone().applyMatrix4(mm), rim: rim.clone().applyMatrix4(mm), eye: eye.clone().applyMatrix4(mm), n: new V3(0, Math.cos(a), Math.sin(a))};
  });
  // dark slots cut into the shell: one along the top, one on each flank
  const slot = (x, a, w) => new THREE.BoxGeometry(w, 0.06, 0.18).translate(0, 1.02, 0).applyMatrix4(new THREE.Matrix4().makeRotationX(a)).translate(x, 0, 0);
  const slots = merge([slot(0.75, 64 * D2R, 0.46), slot(0.75, -64 * D2R, 0.46), slot(0.72, 0, 0.42)]);
  // bolts at the shell corners
  const bolt = new THREE.CylinderGeometry(0.05, 0.05, 0.06, 6);
  const bolts = merge([[0.3, 26], [0.3, -26], [1.25, 26], [1.25, -26]].map(([x, a]) =>
    bolt.clone().translate(0, 1.02, 0).applyMatrix4(new THREE.Matrix4().makeRotationX(a * D2R)).translate(x, 0, 0)));
  // the tip: a rounded white cap with a thin green ring (the reference's green tips)
  const tip = solid(0.05, 2.1, (u) => (u < 0.82 ? 1 - 0.5 * u : (1 - 0.5 * 0.82) * Math.sqrt(Math.max(0, 1 - ((u - 0.82) / 0.18) ** 2))), {segs: 20}, 16);
  const tipGlow = ring(1.4, 1.52, 0.6, 0.66, 0.01, {segs: 20});
  // the root collar where the arm leaves the body: a white cowl, a dark ring, a green line
  const collar = ring(-0.6, 0.3, 0.95, 1.3, 0.06, {segs: 32});
  // the locking ring: 4 small teeth on it so its quarter-turn unlock reads (STEP 4)
  const collarDark = merge([ring(0.28, 0.5, 0.8, 1.12, 0.03, {segs: 32}),
    ...[0, 1, 2, 3].map((k) => new THREE.BoxGeometry(0.14, 0.06, 0.1).translate(0.39, 1.14, 0).rotateX(k * Math.PI / 2 + Math.PI / 4))]);
  // the joint's inner works, only seen when the joints open (STEP 4): a centre axle and two side pistons,
  // built along +x from 0 to 1 so they can be stretched over the gap
  const axle = merge([cylX(0.3, 0.3, 1, 14).translate(0.5, 0, 0), cylX(0.075, 0.075, 1, 8).translate(0.5, 0.0, 0.52), cylX(0.075, 0.075, 1, 8).translate(0.5, 0.0, -0.52)]);
  const axleDark = merge([cylX(0.14, 0.14, 0.55, 10).translate(0.275, 0, 0.52), cylX(0.14, 0.14, 0.55, 10).translate(0.275, 0, -0.52), cylX(0.42, 0.42, 0.12, 18).translate(0.94, 0, 0)]);
  const collarGlow = ring(0.3, 0.36, 1.11, 1.16, 0.01, {segs: 32});
  return {shell, seam, jointGlow, under, core, joint, pins, padParts, slots, bolts, tip, tipGlow, collar, collarDark, collarGlow, axle, axleDark};
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
    // STEP 4: rest transforms (every pose is computed from these, never accumulated) and the detach direction
    const az = (HERO_AZ + spec.theta) * D2R;
    const out = new V3(Math.sin(az), 0, Math.cos(az));
    const detachDir = out.clone().multiplyScalar(spec.kind === 'raised' ? 0.8 : 0.92).add(new V3(0, spec.kind === 'raised' ? 0.3 : 0.18, 0)).normalize();
    const rest = joints.map((jj) => ({p: jj.position.clone(), q: jj.quaternion.clone()}));
    arms.push({name: spec.name, spec, root, joints, radii, curve, length: len, azimuth: az, detachDir, rest,
      pose: {slide: 0, lock: 0, open: 0, pad: 0}, gaps: joints.map(() => 0)});
  }

  // ---- instanced parts: one InstancedMesh per part type for all arms
  const segJoints = [];
  const tipJoints = [];
  const rootJoints = [];
  const axleJoints = [];
  for (const a of arms) {
    a.joints.forEach((j, i) => {
      j.userData.arm = a;
      if (j.userData.last) tipJoints.push(j);
      else segJoints.push(j);
      if (i === 0) rootJoints.push(j);
      else axleJoints.push(j);
    });
  }
  // kind: how the instance matrix is built (see update); tint: carries a per-arm colour; pick: raycast target
  const L = (geo, mat, joints, kind = 'seg', extra = {}) => ({geo, mat, joints, kind, ...extra});
  const layers = [
    L(U.shell, mats.shell, segJoints, 'seg', {tint: true, pick: true, outline: true}),
    L(U.seam, mats.titanium, segJoints),
    L(U.jointGlow, mats.glow, segJoints),
    L(U.under, mats.titanium, segJoints, 'seg', {tint: true, pick: true}),
    L(U.core, mats.graphite, segJoints),
    L(U.joint, mats.titanium, segJoints, 'seg', {pick: true}),
    L(U.pins, mats.steel, segJoints, 'seg', {detail: true}),
    ...U.padParts.flatMap((pp, k) => [
      L(pp.cup, mats.graphite, segJoints, 'pad', {n: pp.n, off: 0.35, pick: true, pad: true}),
      L(pp.rim, mats.glow, segJoints, 'pad', {n: pp.n, off: 0.62, pad: true}),
      L(pp.eye, mats.black, segJoints, 'pad', {n: pp.n, off: 0.95, pad: true}),
    ]),
    L(U.slots, mats.black, segJoints, 'seg', {detail: true}),
    L(U.bolts, mats.steel, segJoints, 'seg', {detail: true}),
    L(U.tip, mats.shell, tipJoints, 'seg', {tint: true, pick: true, outline: true}),
    L(U.tipGlow, mats.glow, tipJoints),
    L(U.collar, mats.shell, rootJoints, 'seg', {tint: true, pick: true, outline: true}),
    L(U.collarDark, mats.titanium, rootJoints, 'lock'),
    L(U.collarGlow, mats.glow, rootJoints),
    L(U.axle, mats.steel, axleJoints, 'axle'),
    L(U.axleDark, mats.graphite, axleJoints, 'axle'),
  ];
  const meshes = layers.map((ly) => {
    const im = new THREE.InstancedMesh(ly.geo, ly.mat, ly.joints.length);
    im.userData = {joints: ly.joints, layer: ly, pickable: !!ly.pick, detail: !!ly.detail};
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false; // instances span the whole octopus; the bounding sphere of the unit part would cull them
    if (ly.tint) {
      // per-arm tint (selection / dimming); white = the approved look
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ly.joints.length * 3).fill(1), 3);
    }
    group.add(im);
    return im;
  });

  // ---- the pose of one arm (STEP 4): absolute, from the rest transforms
  const stage = (e, a, b) => Math.min(1, Math.max(0, (e - a) / (b - a)));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function applyPose(arm) {
    const {slide, open} = arm.pose;
    arm.root.position.copy(arm.detachDir).multiplyScalar(1.1 * ease(slide));
    arm.root.quaternion.identity();
    const n = arm.joints.length;
    arm.joints.forEach((j, i) => {
      j.position.copy(arm.rest[i].p);
      j.quaternion.copy(arm.rest[i].q);
      arm.gaps[i] = 0;
      if (i === 0) return;
      // the joints open one after another, root first; the gap is half the parent segment's radius
      const t0 = (0.75 * (i - 1)) / (n - 1);
      const g = 0.5 * arm.joints[i - 1].userData.radius * ease(stage(open, t0, t0 + 0.25));
      arm.gaps[i] = g;
      j.position.x += g; // along the parent segment's axis: the segment slides off its joint
    });
  }

  const m = new THREE.Matrix4();
  const S = new THREE.Matrix4();
  const T = new THREE.Matrix4();
  const R = new THREE.Matrix4();
  const inv = new THREE.Matrix4();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  let outline = null; // {arm, meshes}
  function update() {
    for (const a of arms) applyPose(a);
    group.updateMatrixWorld(true);
    inv.copy(group.matrixWorld).invert();
    for (const im of meshes) {
      const ly = im.userData.layer;
      im.userData.joints.forEach((j, i) => {
        const r = j.userData.radius;
        const arm = j.userData.arm;
        // length follows the segment's own length (close to SEG_L * r), section follows its radius
        const sx = j.userData.last ? r : j.userData.length / SEG_L;
        S.makeScale(sx, r, r);
        m.multiplyMatrices(inv, j.matrixWorld);
        if (ly.kind === 'axle') {
          const g = arm.gaps[j.userData.index];
          if (g < 1e-4) {
            im.setMatrixAt(i, ZERO);
            return;
          }
          const rp = arm.joints[j.userData.index - 1].userData.radius;
          m.multiply(T.makeTranslation(-g, 0, 0)).multiply(S.makeScale(g, rp, rp));
        } else {
          m.multiply(S);
          if (ly.kind === 'lock') m.multiply(R.makeRotationX(ease(arm.pose.lock) * Math.PI / 2));
          if (ly.kind === 'pad') {
            const k = ly.off * ease(Math.max(arm.pose.pad, 0.35 * stage(arm.pose.open, 0.5, 1)));
            m.multiply(T.makeTranslation(ly.n.x * k, ly.n.y * k, ly.n.z * k));
          }
        }
        im.setMatrixAt(i, m);
      });
      im.instanceMatrix.needsUpdate = true;
      im.boundingSphere = null; // recomputed lazily by the raycaster
    }
    if (outline) {
      for (const om of outline.meshes) {
        om.userData.joints.forEach((j, i) => {
          const r = j.userData.radius;
          const sx = j.userData.last ? r : j.userData.length / SEG_L;
          m.multiplyMatrices(inv, j.matrixWorld).multiply(S.makeScale(sx, r, r));
          om.setMatrixAt(i, m);
        });
        om.instanceMatrix.needsUpdate = true;
      }
    }
  }
  update();

  /** Tint one arm (selection) and optionally dim the others; null clears. */
  function setTint(armName, sel = [0.82, 1, 0.9], dim = [1, 1, 1]) {
    for (const im of meshes) {
      if (!im.instanceColor) continue;
      im.userData.joints.forEach((j, i) => {
        const c = !armName ? [1, 1, 1] : j.userData.arm.name === armName ? sel : dim;
        im.instanceColor.setXYZ(i, c[0], c[1], c[2]);
      });
      im.instanceColor.needsUpdate = true;
    }
  }
  /** Green outline around one arm (inverted hull, see interaction.js); null clears. */
  function setOutline(armName, material) {
    if (outline) {
      outline.meshes.forEach((om) => {
        group.remove(om);
        om.dispose();
      });
      outline = null;
    }
    const arm = arms.find((a) => a.name === armName);
    if (!arm || !material) return;
    const ms = layers.filter((ly) => ly.outline).map((ly) => {
      const js = ly.joints.filter((j) => j.userData.arm === arm);
      const om = new THREE.InstancedMesh(ly.geo, material, js.length);
      om.userData = {joints: js, outline: true};
      om.frustumCulled = false;
      om.renderOrder = 3;
      group.add(om);
      return om;
    });
    outline = {arm, meshes: ms};
    update();
  }
  /** Distance-based detail culling (LOD): hide pins, slots and bolts when the camera is far away. */
  function setDetail(on) {
    for (const im of meshes) if (im.userData.detail) im.visible = on;
  }

  const count = () => meshes.reduce((n, im) => n + im.count, 0);
  return {group, arms, update, count, meshes, setTint, setOutline, setDetail};
}
