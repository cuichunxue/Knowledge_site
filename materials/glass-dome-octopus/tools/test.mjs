// Functional test: desktop mouse + buttons, mobile touch (emulated iPhone), resize, errors, fps (software GL).
// usage: node tools/test.mjs [baseUrl]
import {createRequire} from 'node:module';
const {chromium, devices} = createRequire(import.meta.url)('playwright');
const base = process.argv[2] || 'http://localhost:8765/materials/glass-dome-octopus/';
const browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const results = [];
const ok = (name, pass, info = '') => results.push({name, pass, info});
const camState = (p) => p.evaluate(() => {
  const c = window.__octo.camera, t = window.__octo.controls.target;
  const d = c.position.clone().sub(t);
  return {az: Math.atan2(d.x, d.z) * 180 / Math.PI, dist: d.length(), el: Math.asin(d.y / d.length()) * 180 / Math.PI};
});
const settle = (p, ms = 1400) => p.waitForTimeout(ms);
// wait until the camera satisfies a condition (az/el/dist), up to 60 s; returns the final state
const waitCam = async (p, cond, timeout = 60000) => {
  try { await p.waitForFunction(cond, null, {timeout, polling: 200}); } catch {}
  return camState(p);
};

// ---------------- desktop
{
  const errors = [];
  const p = await browser.newPage({viewport: {width: 1280, height: 720}});
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(base);
  await p.waitForFunction(() => window.__ready === true, null, {timeout: 120000});
  // fps over ~8 s with auto-rotate (continuous rendering), software GL
  await p.waitForTimeout(8500);
  const st = await p.evaluate(() => window.__octo.stats());
  ok('desktop: loads, tier', st.tier === 'high', `tier=${st.tier} transmission=${st.transmission} calls=${st.calls} tris=${st.triangles} perArm=${st.perArm}`);
  ok('desktop: fps measured (SwiftShader CPU rendering, NOT a real GPU)', st.fpsLog.length > 0, `fpsLog=${JSON.stringify(st.fpsLog)} pr=${st.pixelRatio} transmission=${st.transmission}`);
  // auto-rotate toggle
  await p.click('#autoBtn');
  ok('desktop: auto-rotate OFF button', (await p.getAttribute('#autoBtn', 'aria-pressed')) === 'false' && !(await p.evaluate(() => window.__octo.controls.autoRotate)));
  const a0 = await camState(p);
  await settle(p, 800);
  const a1 = await camState(p);
  ok('desktop: camera still when auto-rotate OFF', Math.abs(a1.az - a0.az) < 0.5, `${a0.az.toFixed(2)} -> ${a1.az.toFixed(2)}`);
  await p.click('#autoBtn');
  const a2 = await waitCam(p, `Math.abs(window.__octo.camState().az - (${a1.az})) > 0.5`);
  ok('desktop: auto-rotate ON turns the camera', Math.abs(a2.az - a1.az) > 0.5, `${a1.az.toFixed(2)} -> ${a2.az.toFixed(2)}`);
  await p.click('#autoBtn');
  // labels toggle
  const lblVisible = () => p.evaluate(() => !document.getElementById('labels').hidden);
  const before = await lblVisible();
  await p.click('#lblBtn');
  await settle(p, 300);
  const after = await lblVisible();
  ok('desktop: labels ON -> OFF', before === true && after === false);
  await p.click('#lblBtn');
  // view buttons
  await p.click('[data-view="side"]');
  const sv = await waitCam(p, 'Math.abs(window.__octo.camState().az - 90) < 1');
  ok('desktop: side view button', Math.abs(sv.az - 90) < 3, `az=${sv.az.toFixed(1)}`);
  // mouse drag rotates
  const s0 = await camState(p);
  await p.mouse.move(640, 360);
  await p.mouse.down();
  await p.mouse.move(840, 330, {steps: 12});
  await p.mouse.up();
  const s1 = await waitCam(p, `Math.abs(window.__octo.camState().az - (${s0.az})) > 10`);
  ok('desktop: mouse drag rotates', Math.abs(s1.az - s0.az) > 10, `az ${s0.az.toFixed(1)} -> ${s1.az.toFixed(1)}`);
  // wheel zoom
  await p.mouse.move(640, 360);
  for (let i = 0; i < 5; i++) await p.mouse.wheel(0, -200);
  const z1 = await waitCam(p, `window.__octo.camState().dist < ${s1.dist} - 0.3`);
  ok('desktop: wheel zoom in', z1.dist < s1.dist - 0.3, `dist ${s1.dist.toFixed(2)} -> ${z1.dist.toFixed(2)}`);
  // double click -> home (hero: az 35, el 20)
  await p.mouse.dblclick(640, 360);
  const h = await waitCam(p, 'Math.abs(window.__octo.camState().az - 35) < 1 && Math.abs(window.__octo.camState().el - 20) < 1');
  ok('desktop: double-click resets to the hero view', Math.abs(h.az - 35) < 2 && Math.abs(h.el - 20) < 2, `az=${h.az.toFixed(1)} el=${h.el.toFixed(1)}`);
  // reset button
  await p.click('[data-view="rear"]');
  await waitCam(p, 'Math.abs(Math.abs(window.__octo.camState().az) - 180) < 1');
  await p.click('#resetBtn');
  const h2 = await waitCam(p, 'Math.abs(window.__octo.camState().az - 35) < 1');
  ok('desktop: reset button', Math.abs(h2.az - 35) < 2, `az=${h2.az.toFixed(1)}`);
  // reference overlay + info panel
  await p.click('#refBtn');
  ok('desktop: reference overlay opens', await p.isVisible('#ref'));
  await p.click('#refBtn');
  await p.click('#infoBtn');
  ok('desktop: info panel opens', await p.isVisible('#info'));
  await p.click('#infoClose');
  // resize
  await p.setViewportSize({width: 900, height: 900});
  try { await p.waitForFunction(() => document.getElementById('c').width === 900, null, {timeout: 60000}); } catch {}
  const sz = await p.evaluate(() => ({w: document.getElementById('c').width, h: document.getElementById('c').height}));
  ok('desktop: resize updates the drawing buffer', sz.w === 900 && sz.h === 900, JSON.stringify(sz));
  const mem = await p.evaluate(() => ({
    jsHeapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
    geometries: window.__octo.stats().geometries, textures: window.__octo.stats().textures,
  }));
  ok('desktop: memory (Chromium performance.memory + three renderer.info)', mem.geometries > 0, JSON.stringify(mem));
  ok('desktop: no page / WebGL errors', errors.length === 0, errors.join(' | '));
  await p.close();
}

// ---------------- mobile (emulated iPhone 13: touch events, DPR 3, small screen)
{
  const errors = [];
  const ctx = await browser.newContext({...devices['iPhone 13']});
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(base + '?auto=0');
  await p.waitForFunction(() => window.__ready === true, null, {timeout: 120000});
  await settle(p, 1500);
  const st = await p.evaluate(() => window.__octo.stats());
  ok('mobile: low tier chosen (no transmission, pr <= 1.5)', st.tier === 'low' && !st.transmission && st.pixelRatio <= 1.5, `tier=${st.tier} pr=${st.pixelRatio}`);
  const cdp = await ctx.newCDPSession(p);
  const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: pts.map(([x, y], i) => ({x, y, id: i}))});
  // one-finger drag -> rotate
  const m0 = await camState(p);
  await touch('touchStart', [[195, 420]]);
  for (let i = 1; i <= 10; i++) await touch('touchMove', [[195 + i * 14, 420]]);
  await touch('touchEnd', []);
  await settle(p, 900);
  const m1 = await camState(p);
  ok('mobile: one-finger drag rotates', Math.abs(m1.az - m0.az) > 10, `az ${m0.az.toFixed(1)} -> ${m1.az.toFixed(1)}`);
  // two-finger pinch out -> zoom in
  await touch('touchStart', [[170, 420], [220, 420]]);
  for (let i = 1; i <= 10; i++) await touch('touchMove', [[170 - i * 8, 420], [220 + i * 8, 420]]);
  await touch('touchEnd', []);
  await settle(p, 900);
  const m2 = await camState(p);
  ok('mobile: pinch zooms', m2.dist < m1.dist - 0.3, `dist ${m1.dist.toFixed(2)} -> ${m2.dist.toFixed(2)}`);
  // double tap -> home
  for (let k = 0; k < 2; k++) {
    await touch('touchStart', [[195, 420]]);
    await touch('touchEnd', []);
    await p.waitForTimeout(120);
  }
  const m3 = await waitCam(p, 'Math.abs(window.__octo.camState().az - 35) < 1');
  ok('mobile: double-tap resets', Math.abs(m3.az - 35) < 2, `az=${m3.az.toFixed(1)}`);
  // UI buttons reachable by tap
  await p.tap('#autoBtn');
  ok('mobile: tap auto-rotate button', (await p.getAttribute('#autoBtn', 'aria-pressed')) === 'true');
  await p.tap('#autoBtn');
  // rotate to landscape: the drawing buffer follows (pixel ratio 1.5 on this tier)
  await p.setViewportSize({width: 844, height: 390});
  let rot = null;
  try {
    await p.waitForFunction(() => document.getElementById('c').width === Math.round(844 * window.__octo.stats().pixelRatio), null, {timeout: 60000});
    rot = await p.evaluate(() => ({w: document.getElementById('c').width, h: document.getElementById('c').height}));
  } catch {}
  ok('mobile: rotate to landscape resizes the canvas', !!rot, JSON.stringify(rot));
  await p.setViewportSize({width: 390, height: 844});
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  ok('mobile: no horizontal overflow', !overflow);
  try { await p.screenshot({path: 'screenshots/mobile.png', scale: 'css', timeout: 180000}); } catch (e) { ok('mobile: screenshot', false, e.message.split('\n')[0]); }
  ok('mobile: no page / WebGL errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---------------- labels screenshot (desktop, hero)
{
  const p = await browser.newPage({viewport: {width: 1600, height: 900}});
  await p.goto(base + '?shot=hero');
  await p.waitForFunction(() => window.__ready === true, null, {timeout: 120000});
  await p.evaluate(() => window.__octo.renderNow());
  await p.waitForTimeout(400);
  await p.screenshot({path: 'screenshots/hero-labels.png'});
  await p.close();
}
await browser.close();
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.info ? '  — ' + r.info : ''}`);
console.log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
