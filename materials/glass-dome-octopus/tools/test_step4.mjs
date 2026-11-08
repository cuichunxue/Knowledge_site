// STEP 4 test suite: exploded view, reassembly, slider, picking, camera vs animation, stability, phone.
// Headless Chromium + software WebGL (SwiftShader): the animations are time-based and run at `SPEED`x so the suite
// finishes; every wait polls a condition instead of sleeping a fixed time.
// usage: node tools/test_step4.mjs [baseUrl]   -> prints PASS/FAIL lines and writes quality/step4-tests.json
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
const {chromium, devices} = createRequire(import.meta.url)('playwright');
const base = process.argv[2] || 'http://localhost:8765/materials/glass-dome-octopus/';
const SPEED = 8;
const browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const results = [];
const ok = (group, name, pass, info = '') => {
  results.push({group, name, pass: !!pass, info});
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${group}] ${name}${info ? '  — ' + info : ''}`);
};
const waitFor = async (p, fn, arg, timeout = 240000) => {
  try {
    await p.waitForFunction(fn, arg, {timeout, polling: 150});
    return true;
  } catch {
    return false;
  }
};
const idle = (p) => waitFor(p, () => !window.__octo.anim.busy);
const S = (p) => p.evaluate(() => ({p: window.__octo.anim.state.p, ind: {...window.__octo.anim.state.ind}, e: window.__octo.progress(), sel: window.__octo.selected,
  err: window.__octo.restError()}));
// screen position of a world point given by a JS expression evaluated in the page
const screenOf = (p, expr) => p.evaluate((expr) => {
  const v = eval(expr);
  const c = document.getElementById('c').getBoundingClientRect();
  v.project(window.__octo.camera);
  return {x: c.left + (v.x * 0.5 + 0.5) * c.width, y: c.top + (-v.y * 0.5 + 0.5) * c.height};
}, expr);

async function open(page, url) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, {timeout: 180000});
  await page.evaluate((s) => window.__octo.anim.setSpeed(s), SPEED);
  return errors;
}

// ====================================================================== desktop: functional
{
  const page = await browser.newPage({viewport: {width: 1100, height: 640}});
  const errors = await open(page, `${base}?auto=0&q=low`);
  const mem0 = await page.evaluate(() => ({heap: performance.memory?.usedJSHeapSize, geo: window.__octo.stats().geometries, tex: window.__octo.stats().textures}));

  // F1 + F2: every part group from the menu; arms move alone
  const ids = await page.evaluate(() => window.__octo.explosion.parts.map((p) => p.id));
  let allOpened = true;
  let allCards = true;
  let armsAlone = true;
  const armInfo = [];
  for (const id of ids) {
    await page.click(`.part[data-id="${id}"]`);
    const opened = await waitFor(page, (id) => window.__octo.progress()[id] > 0.999 && !window.__octo.anim.busy, id);
    const card = await page.$eval('#card .id', (el) => el.textContent).catch(() => '');
    if (!opened) allOpened = false;
    if (!card.startsWith(id)) allCards = false;
    const armName = await page.evaluate((id) => window.__octo.explosion.parts.find((p) => p.id === id).arm, id);
    if (armName) {
      const moved = await page.evaluate(() => window.__octo.octo.tentacles.arms.filter((a) => a.root.position.length() > 1e-6).map((a) => a.name));
      armInfo.push(`${id}:${moved.join('+')}`);
      if (moved.length !== 1 || moved[0] !== armName) armsAlone = false;
    }
    await page.click('#card [data-act="close"]');
    await idle(page);
  }
  ok('機能', '15 部品グループをメニューから選択・分解できる', allOpened && ids.length === 15, `${ids.length} groups, all reached e=1: ${allOpened}`);
  ok('機能', '選択した部品の名前・説明カードが出る', allCards);
  ok('機能', '8 本の触手を個別に操作できる（動くのはその 1 本だけ）', armsAlone, armInfo.join(' '));
  let st = await S(page);
  ok('機能', '個別に開閉したあと完全に元の位置へ戻る', st.err < 1e-9, `rest error ${st.err}`);

  // F3 + F4: full explode, full reassembly
  await page.click('#explodeBtn');
  const exploded = await waitFor(page, () => window.__octo.anim.state.p >= 1 && !window.__octo.anim.busy);
  st = await S(page);
  ok('機能', '全体分解が最後まで進む（全 15 部品 e=1）', exploded && Object.values(st.e).every((v) => v > 0.999));
  await page.click('#assembleBtn');
  await waitFor(page, () => window.__octo.anim.state.p === 0 && !window.__octo.anim.busy);
  st = await S(page);
  ok('機能', '再組み立てで完全復元（全 Transform・全インスタンス行列）', st.err < 1e-9 && st.p === 0, `rest error ${st.err}`);

  // F5: slider to arbitrary values
  const values = [0, 0.137, 0.5, 0.731, 1, 0.25];
  let sliderOk = true;
  for (const v of values) {
    await page.$eval('#slider', (el, v) => {
      el.value = String(Math.round(v * 1000));
      el.dispatchEvent(new Event('input', {bubbles: true}));
    }, v);
    const p = await page.evaluate(() => window.__octo.anim.state.p);
    if (Math.abs(p - v) > 1e-3) sliderOk = false;
  }
  ok('機能', 'スライダーを任意の位置へ動かせる', sliderOk, values.join(', '));
  await page.click('#assembleBtn');
  await idle(page);

  // F6: reverse in the middle of the explode
  await page.click('#explodeBtn');
  await waitFor(page, () => window.__octo.anim.state.p > 0.3);
  const pMid = await page.evaluate(() => window.__octo.anim.state.p);
  await page.click('#assembleBtn');
  const back = await waitFor(page, () => window.__octo.anim.state.p === 0 && !window.__octo.anim.busy);
  st = await S(page);
  ok('機能', 'アニメーション途中で逆再生できる', back && st.err < 1e-9, `reversed at p=${pMid.toFixed(3)}, rest error ${st.err}`);

  // F9: pause / resume
  await page.click('#explodeBtn');
  await waitFor(page, () => window.__octo.anim.state.p > 0.15);
  await page.click('#playBtn');
  const p1 = await page.evaluate(() => window.__octo.anim.state.p);
  await page.waitForTimeout(1500);
  const p2 = await page.evaluate(() => window.__octo.anim.state.p);
  await page.click('#playBtn');
  const resumed = await waitFor(page, (p) => window.__octo.anim.state.p > p + 0.02, p2);
  ok('機能', '一時停止 / 再生', Math.abs(p2 - p1) < 1e-9 && resumed, `paused at ${p1.toFixed(3)} (held ${p2.toFixed(3)}), resumed: ${resumed}`);
  await waitFor(page, () => window.__octo.anim.state.p >= 1 && !window.__octo.anim.busy);
  await page.click('#assembleBtn');
  await idle(page);

  // F7: camera vs animation: a drag during the explode wins over the director, the animation carries on
  await page.click('#explodeBtn');
  await waitFor(page, () => window.__octo.anim.state.p > 0.1);
  const c0 = await page.evaluate(() => window.__octo.camState());
  await page.mouse.move(550, 320);
  await page.mouse.down();
  await page.mouse.move(800, 300, {steps: 10});
  await page.mouse.up();
  await page.waitForTimeout(600);
  const c1 = await page.evaluate(() => window.__octo.camState());
  const done = await waitFor(page, () => window.__octo.anim.state.p >= 1 && !window.__octo.anim.busy);
  const c2 = await page.evaluate(() => window.__octo.camState());
  ok('機能', 'カメラ操作とアニメーションが競合しない（ドラッグ優先・分解は継続）', Math.abs(c1.az - c0.az) > 8 && done && Math.abs(c2.az - c1.az) < 3,
    `az ${c0.az.toFixed(1)} → drag ${c1.az.toFixed(1)} → after anim ${c2.az.toFixed(1)}; explode finished: ${done}`);
  await page.click('#assembleBtn');
  await idle(page);
  await page.evaluate(() => window.__octo.setView('hero', 0));

  // F8: picking by clicking the model
  await page.waitForTimeout(400);
  const camPt = await screenOf(page, "window.__octo.scene.getObjectByName('front-camera').children[0].localToWorld(new (window.__octo.camera.position.constructor)(0.48, 0, 0))");
  await page.mouse.click(camPt.x, camPt.y);
  const pickedCam = await waitFor(page, () => window.__octo.selected === 'P03', null, 30000);
  await idle(page);
  await page.evaluate(() => window.__octo.deselect(true));
  await idle(page);
  await page.evaluate(() => window.__octo.setView('hero', 0));
  await page.waitForTimeout(400);
  const armPt = await screenOf(page, "window.__octo.explosion.armOf('T7').joints[5].localToWorld(new (window.__octo.camera.position.constructor)(0.1, 0, 0))");
  await page.mouse.click(armPt.x, armPt.y);
  const pickedArm = await waitFor(page, () => window.__octo.selected === 'P13', null, 30000);
  await idle(page);
  await page.mouse.click(30, 600); // empty floor at the bottom-left corner
  const cleared = await waitFor(page, () => window.__octo.selected === null && !window.__octo.anim.busy, null, 60000);
  ok('機能', '部品クリックで選択（カメラ P03・触手 7 = P13）、背景クリックで解除', pickedCam && pickedArm && cleared, `camera ${pickedCam}, arm ${pickedArm}, cleared ${cleared}`);
  st = await S(page);
  ok('機能', 'クリック操作のあとも完全復元', st.err < 1e-9, `rest error ${st.err}`);

  // ====================================================================== stability
  // S1: 20 explode / assemble cycles
  let worst = 0;
  let cyclesDone = 0;
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => window.__octo.explodeAll());
    const a = await waitFor(page, () => window.__octo.anim.state.p >= 1 && !window.__octo.anim.busy);
    await page.evaluate(() => window.__octo.assembleAll());
    const b = await waitFor(page, () => window.__octo.anim.state.p === 0 && !window.__octo.anim.busy);
    if (a && b) cyclesDone++;
    worst = Math.max(worst, (await S(page)).err);
  }
  ok('安定性', '分解と組み立てを連続 20 回', cyclesDone === 20 && worst < 1e-9, `${cyclesDone}/20 cycles, worst rest error ${worst}`);

  // S2: 100 random slider moves + determinism (same p -> same transforms)
  const det = await page.evaluate(() => {
    const O = window.__octo;
    const slider = document.getElementById('slider');
    let bad = 0;
    let maxDiff = 0;
    const snaps = {};
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 100; i++) {
      const v = Math.round(rnd() * 1000) / 1000;
      slider.value = String(Math.round(v * 1000));
      slider.dispatchEvent(new Event('input', {bubbles: true}));
      if (Math.abs(O.anim.state.p - v) > 1e-9) bad++;
      O.explosion.render(O.anim.state);
      const s = O.explosion.snapshot();
      const key = v.toFixed(3);
      const flat = s.objs.flat().concat(...s.inst.map((a) => Array.from(a)));
      if (snaps[key]) flat.forEach((x, k) => (maxDiff = Math.max(maxDiff, Math.abs(x - snaps[key][k]))));
      else snaps[key] = flat;
    }
    // revisit 10 of the values in reverse order and compare
    const keys = Object.keys(snaps).slice(0, 10).reverse();
    for (const key of keys) {
      O.anim.setP(Number(key));
      O.explosion.render(O.anim.state);
      const s = O.explosion.snapshot();
      const flat = s.objs.flat().concat(...s.inst.map((a) => Array.from(a)));
      flat.forEach((x, k) => (maxDiff = Math.max(maxDiff, Math.abs(x - snaps[key][k]))));
    }
    O.anim.setP(0);
    O.explosion.render(O.anim.state);
    return {bad, maxDiff, revisited: keys.length, err: O.restError()};
  });
  ok('安定性', 'スライダーをランダムに 100 回操作（値の一致）', det.bad === 0, `${det.bad} mismatches`);
  ok('安定性', '決定論的な描画（同じ p → 同じ配置）', det.maxDiff === 0 && det.err < 1e-9, `max diff over revisits ${det.maxDiff}, rest error after ${det.err}`);

  // S3: change part in the middle of its animation
  await page.evaluate(() => window.__octo.anim.setSpeed(1));
  await page.click('.part[data-id="P03"]');
  await waitFor(page, () => window.__octo.anim.state.ind.P03 > 0.2); // really in the middle of its opening
  const midA = await page.evaluate(() => window.__octo.anim.state.ind.P03);
  await page.click('.part[data-id="P05"]');
  await page.evaluate((s) => window.__octo.anim.setSpeed(s), SPEED);
  await idle(page);
  st = await S(page);
  ok('安定性', 'アニメーション途中で部品を変更', midA > 0.2 && midA < 1 && st.ind.P03 === 0 && st.ind.P05 === 1 && st.sel === 'P05', `P03 was at ${midA.toFixed(2)} → ${st.ind.P03}, P05 → ${st.ind.P05}, selected ${st.sel}`);
  await page.evaluate(() => window.__octo.resetAll());
  await idle(page);

  // memory: counts before / after everything above (outline meshes and ghost materials are created on demand)
  const mem1 = await page.evaluate(() => ({heap: performance.memory?.usedJSHeapSize, geo: window.__octo.stats().geometries, tex: window.__octo.stats().textures}));
  ok('安定性', 'メモリ（JS ヒープ・ジオメトリ数・テクスチャ数）', mem1.geo <= mem0.geo + 5 && mem1.tex === mem0.tex,
    `heap ${(mem0.heap / 1048576).toFixed(1)} → ${(mem1.heap / 1048576).toFixed(1)} MB, geometries ${mem0.geo} → ${mem1.geo}, textures ${mem0.tex} → ${mem1.tex}`);

  // FPS while exploding (software rendering, NOT a real GPU)
  await page.evaluate(() => window.__octo.anim.setSpeed(1));
  await page.evaluate(() => window.__octo.explodeAll());
  await page.waitForTimeout(7000);
  const fps = await page.evaluate(() => window.__octo.stats());
  ok('安定性', 'FPS 計測（ソフトウェア描画・実機ではない）', fps.fpsLog.length > 0, `fpsLog=${JSON.stringify(fps.fpsLog)} tier=${fps.tier} calls=${fps.calls} tris=${fps.triangles}`);
  await page.evaluate(() => window.__octo.anim.setSpeed(8));
  await page.evaluate(() => window.__octo.resetAll());
  await idle(page);
  ok('安定性', 'WebGL / ページエラーなし（デスクトップ）', errors.length === 0, errors.slice(0, 5).join(' | '));
  await page.close();
}

// ====================================================================== phone (emulated iPhone 13)
{
  const ctx = await browser.newContext({...devices['iPhone 13']});
  const page = await ctx.newPage();
  const errors = await open(page, `${base}?auto=0`);
  const tier = await page.evaluate(() => window.__octo.stats());
  // tap a part (touch)
  await page.waitForTimeout(500);
  const pt = await screenOf(page, "window.__octo.scene.getObjectByName('front-camera').children[0].localToWorld(new (window.__octo.camera.position.constructor)(0.48, 0, 0))");
  await page.touchscreen.tap(pt.x, pt.y);
  const tapped = await waitFor(page, () => window.__octo.selected === 'P03', null, 60000);
  const cardVisible = await page.isVisible('#card');
  await idle(page);
  ok('スマホ', 'タップで部品を選択・分解し、カードが出る', tapped && cardVisible, `tier=${tier.tier} pr=${tier.pixelRatio}`);
  // fold-out part menu
  await page.tap('#card [data-act="close"]');
  await idle(page);
  await page.tap('#partsToggle');
  const panelOpen = await page.evaluate(() => document.getElementById('parts').classList.contains('open'));
  await page.tap('.part[data-id="P11"]');
  const opened = await waitFor(page, () => window.__octo.progress().P11 > 0.999 && !window.__octo.anim.busy);
  const panelClosed = await page.evaluate(() => !document.getElementById('parts').classList.contains('open'));
  ok('スマホ', '折りたたみの部品メニュー（開く → 選ぶ → 自動で閉じる）', panelOpen && opened && panelClosed);
  // dock buttons
  await page.tap('#explodeBtn');
  const ex = await waitFor(page, () => window.__octo.anim.state.p >= 1 && !window.__octo.anim.busy);
  await page.tap('#assembleBtn');
  const as = await waitFor(page, () => window.__octo.anim.state.p === 0 && !window.__octo.anim.busy);
  const err = await page.evaluate(() => window.__octo.restError());
  ok('スマホ', '全体分解・再組み立て（タップ）', ex && as && err < 1e-9, `rest error ${err}`);
  // touch rotate + pinch still work
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: pts.map(([x, y], i) => ({x, y, id: i}))});
  const a0 = await page.evaluate(() => window.__octo.camState());
  await touch('touchStart', [[195, 380]]);
  for (let i = 1; i <= 10; i++) await touch('touchMove', [[195 + i * 14, 380]]);
  await touch('touchEnd', []);
  await page.waitForTimeout(800);
  const a1 = await page.evaluate(() => window.__octo.camState());
  await touch('touchStart', [[170, 380], [220, 380]]);
  for (let i = 1; i <= 10; i++) await touch('touchMove', [[170 - i * 8, 380], [220 + i * 8, 380]]);
  await touch('touchEnd', []);
  await page.waitForTimeout(800);
  const a2 = await page.evaluate(() => window.__octo.camState());
  ok('スマホ', 'タッチ回転・ピンチズーム', Math.abs(a1.az - a0.az) > 8 && a2.dist < a1.dist - 0.3, `az ${a0.az.toFixed(1)} → ${a1.az.toFixed(1)}, dist ${a1.dist.toFixed(2)} → ${a2.dist.toFixed(2)}`);
  // rotation to landscape and back
  await page.setViewportSize({width: 844, height: 390});
  const land = await waitFor(page, () => Math.abs(document.getElementById('c').width - Math.round(844 * window.__octo.stats().pixelRatio)) <= 1, null, 60000);
  const dockVisible = await page.isVisible('#dock');
  await page.setViewportSize({width: 390, height: 844});
  const port = await waitFor(page, () => Math.abs(document.getElementById('c').width - Math.round(390 * window.__octo.stats().pixelRatio)) <= 1, null, 60000);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  ok('スマホ', '画面回転（縦 → 横 → 縦）でキャンバスと操作パネルが追従', land && port && dockVisible && !overflow);
  ok('スマホ', 'WebGL / ページエラーなし（スマホ）', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

await browser.close();
writeFileSync('quality/step4-tests.json', JSON.stringify(results, null, 1));
console.log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
