// Screenshot + test harness (Playwright, headless Chromium).
// usage: node tools/capture.mjs <baseUrl> <outDir> [views=hero,front,side,rear] [q=high]
import {createRequire} from 'node:module';
const {chromium} = createRequire(import.meta.url)('playwright');
const [base = 'http://localhost:8765/materials/glass-dome-octopus/', out = 'screenshots', viewsArg = 'hero,front,side,rear', q = 'high'] = process.argv.slice(2);
const browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const errors = [];
for (const view of viewsArg.split(',')) {
  const page = await browser.newPage({viewport: {width: 1600, height: 900}, deviceScaleFactor: 1});
  page.on('pageerror', (e) => errors.push(`[${view}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${view}] ${m.type()}: ${m.text()}`); });
  await page.goto(`${base}?shot=${view}&ui=0&labels=0&q=${q}`);
  await page.waitForFunction(() => window.__ready === true, null, {timeout: 120000});
  await page.evaluate(() => { window.__octo.renderNow(); });
  await page.waitForTimeout(500);
  await page.screenshot({path: `${out}/${view}.png`});
  if (view === viewsArg.split(',')[0]) console.log(JSON.stringify(await page.evaluate(() => window.__octo.stats())));
  await page.close();
}
console.log('errors:', JSON.stringify(errors, null, 1));
await browser.close();
