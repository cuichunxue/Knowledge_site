// 360° check: 8 azimuths at 15° elevation, saved as one contact sheet (screenshots/turntable-360.png).
import {createRequire} from 'node:module';
const {chromium} = createRequire(import.meta.url)('playwright');
const base = process.argv[2] || 'http://localhost:8765/materials/glass-dome-octopus/';
const out = process.argv[3] || 'screenshots';
const browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const p = await browser.newPage({viewport: {width: 800, height: 450}});
await p.goto(`${base}?shot=hero&ui=0&labels=0&q=high`);
await p.waitForFunction(() => window.__ready === true, null, {timeout: 120000});
for (let i = 0; i < 8; i++) {
  await p.evaluate((az) => window.__octo.orbitTo(az, 15, 0.95), i * 45);
  await p.waitForTimeout(200);
  await p.screenshot({path: `${out}/_tt${i}.png`});
}
await browser.close();
