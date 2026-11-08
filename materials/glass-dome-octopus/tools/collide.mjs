// Interpenetration check for the exploded view (conservative, approximate).
//
// Body meshes are approximated by world AABBs (from their vertices), arm segments by 2 spheres each. For a sweep of
// states it counts the pairs that overlap NOW but did not overlap in the assembled model ("new contacts"): parts
// that start touching by design (plates on the hull) are not counted, parts that run into each other are.
// AABBs of curved plates are larger than the plates, so a reported contact is a candidate to look at, not proof.
// usage: node tools/collide.mjs [baseUrl]
import {createRequire} from 'node:module';
const {chromium} = createRequire(import.meta.url)('playwright');
const base = process.argv[2] || 'http://localhost:8765/materials/glass-dome-octopus/';
const browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const p = await browser.newPage({viewport: {width: 640, height: 360}});
await p.goto(`${base}?ui=0&auto=0&q=low`);
await p.waitForFunction(() => window.__ready === true, null, {timeout: 120000});

const result = await p.evaluate(() => {
  const O = window.__octo;
  const THREE = O.scene.constructor; // not needed; vectors via existing objects
  const root = O.octo.root;
  const arms = O.octo.tentacles.arms;
  // body meshes that belong to a moving part (P01..P06), with their part id
  const bodies = [];
  root.traverse((o) => {
    if (o.isMesh && !o.isSprite && !o.isInstancedMesh && o.userData.partId && !o.userData.outline) bodies.push(o);
  });
  const box = (o) => {
    o.geometry.computeBoundingBox();
    return o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
  };
  const spheres = () => {
    const out = [];
    for (const a of arms) {
      for (const j of a.joints) {
        const r = j.userData.radius;
        const L = j.userData.length || r * 2;
        for (const f of [0.25, 0.75]) {
          const c = j.localToWorld(j.position.clone().set(L * f, 0, 0));
          out.push({arm: a.name, c, r: Math.max(r, L / 4) * 1.02});
        }
      }
    }
    return out;
  };
  const sphereBox = (s, b) => b.distanceToPoint(s.c) < s.r;
  function contacts() {
    root.updateMatrixWorld(true);
    const B = bodies.map((o) => ({o, b: box(o), id: o.userData.partId, name: o.name || o.parent.name}));
    const S = spheres();
    const set = new Set();
    for (let i = 0; i < B.length; i++) {
      for (let k = i + 1; k < B.length; k++) {
        if (B[i].id !== B[k].id && B[i].b.intersectsBox(B[k].b)) set.add(`${B[i].id}:${i}|${B[k].id}:${k}`);
      }
      for (let k = 0; k < S.length; k++) if (sphereBox(S[k], B[i].b)) set.add(`${B[i].id}:${i}|${S[k].arm}:s${k}`);
    }
    for (let i = 0; i < S.length; i++) {
      for (let k = i + 1; k < S.length; k++) {
        if (S[i].arm !== S[k].arm && S[i].c.distanceTo(S[k].c) < S[i].r + S[k].r) set.add(`${S[i].arm}:s${i}|${S[k].arm}:s${k}`);
      }
    }
    return {set, B};
  }
  O.pose({p: 0});
  const restSet = contacts().set;
  const summarise = (label, fresh, B) => {
    const pairs = {};
    for (const key of fresh) {
      const [a, b] = key.split('|').map((x) => x.split(':')[0]);
      const k = [a, b].sort().join(' x ');
      pairs[k] = (pairs[k] || 0) + 1;
    }
    return {label, newContacts: fresh.length, pairs};
  };
  const rows = [];
  // the global explode
  for (let i = 0; i <= 40; i++) {
    const pv = i / 40;
    O.pose({p: pv});
    const {set, B} = contacts();
    const fresh = [...set].filter((k) => !restSet.has(k));
    rows.push(summarise(`p=${pv.toFixed(3)}`, fresh, B));
  }
  // each part on its own, half open and fully open
  const single = [];
  for (const part of O.explosion.parts) {
    for (const e of [0.5, 1]) {
      O.pose({p: 0});
      O.anim.state.ind[part.id] = e;
      O.explosion.render(O.anim.state);
      const {set, B} = contacts();
      const fresh = [...set].filter((k) => !restSet.has(k));
      single.push(summarise(`${part.id} e=${e}`, fresh, B));
    }
  }
  O.pose({p: 0});
  return {bodies: bodies.length, restContacts: restSet.size, sweep: rows, single, restError: O.restError()};
});
console.log(JSON.stringify(result, null, 1));
await browser.close();
