// STEP 4 screenshots: the app in its main states (UI visible) + the assembled model without UI for the
// appearance check against STEP 3 (screenshots/round2.png).
// usage: node tools/capture_step4.mjs [baseUrl]
import {createRequire} from 'node:module';
const {chromium, devices} = createRequire(import.meta.url)('playwright');
const base = process.argv[2] || 'http://localhost:8765/materials/glass-dome-octopus/';
const browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const shot = async (p, path) => p.screenshot({path, timeout: 240000});

// appearance check: exactly the STEP 3 capture settings
{
  const p = await browser.newPage({viewport: {width: 1600, height: 900}});
  await p.goto(`${base}?shot=hero&ui=0&labels=0&q=high`);
  await p.waitForFunction(() => window.__ready === true, null, {timeout: 180000});
  await p.evaluate(() => window.__octo.renderNow());
  await p.waitForTimeout(400);
  await shot(p, 'screenshots/step4-assembled-noui.png');
  await p.close();
}
// the app
{
  const p = await browser.newPage({viewport: {width: 1600, height: 900}});
  await p.goto(`${base}?auto=0&q=high`);
  await p.waitForFunction(() => window.__ready === true, null, {timeout: 180000});
  await p.waitForTimeout(600);
  await shot(p, 'screenshots/assembled.png');
  const states = [
    ['dome-open', {open: ['P01'], view: 'P01', select: 'P01'}, 'P01'],
    ['core-exposed', {open: ['P02'], view: 'P02', select: 'P02'}, 'P02'],
    ['camera-macro', {open: ['P03'], view: 'P03', select: 'P03'}, 'P03'],
    ['gears-out', {open: ['P05'], view: 'P05', select: 'P05'}, 'P05'],
    ['tentacle-exploded', {open: ['P09'], view: 'P09', select: 'P09'}, 'P09'],
    ['pads-open', {open: ['P15'], view: 'P15', select: 'P15'}, 'P15'],
    ['full-explosion', {p: 1, view: 'overview'}, null],
  ];
  for (const [name, s, card] of states) {
    await p.evaluate(({s, card}) => {
      window.__octo.deselect(false);
      window.__octo.pose(s);
      if (card) {
        // show the card the way a click would (select() without moving anything)
        document.querySelector(`.part[data-id="${card}"]`).setAttribute('aria-pressed', 'true');
      }
    }, {s, card});
    if (card) await p.evaluate((card) => window.__octo.showCardFor(card), card);
    await p.evaluate(() => window.__octo.renderNow());
    await p.waitForTimeout(500);
    await shot(p, `screenshots/${name}.png`);
  }
  await p.close();
}
// phone
{
  const ctx = await browser.newContext({...devices['iPhone 13']});
  const p = await ctx.newPage();
  await p.goto(`${base}?auto=0`);
  await p.waitForFunction(() => window.__ready === true, null, {timeout: 180000});
  await p.evaluate(() => window.__octo.pose({open: ['P13'], view: 'P13', select: 'P13'}));
  await p.evaluate(() => window.__octo.showCardFor('P13'));
  await p.evaluate(() => window.__octo.renderNow());
  await p.waitForTimeout(500);
  await p.screenshot({path: 'screenshots/step4-mobile.png', scale: 'css', timeout: 240000});
  await ctx.close();
}
await browser.close();
console.log('done');
