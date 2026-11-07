// Render the hero still, the silhouette masks and the screen-space measurements for one build.
// usage: node tools/measure_render.mjs <outDir> [baseUrl]
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
const {chromium} = createRequire(import.meta.url)('playwright');
const [out = 'screenshots', base = 'http://localhost:8765/materials/glass-dome-octopus/'] = process.argv.slice(2);
const browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const p = await browser.newPage({viewport: {width: 1600, height: 900}, deviceScaleFactor: 1});
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(`${base}?shot=hero&ui=0&labels=0&q=high`);
await p.waitForFunction(() => window.__ready === true, null, {timeout: 120000});
await p.evaluate(() => window.__octo.renderNow());
await p.waitForTimeout(400);
await p.screenshot({path: `${out}/hero.png`});
const m = await p.evaluate(() => ({...window.__octo.measure(), stats: window.__octo.stats()}));
for (const mode of ['all', 'body']) {
  await p.evaluate((md) => { window.__restore = window.__octo.mask(md); }, mode);
  await p.screenshot({path: `${out}/mask-${mode}.png`});
  await p.evaluate(() => { window.__restore(); window.__octo.renderNow(); });
}
writeFileSync(`${out}/measure.json`, JSON.stringify(m, null, 1));
console.log(JSON.stringify(m));
console.log('errors', JSON.stringify(errors));
await browser.close();
