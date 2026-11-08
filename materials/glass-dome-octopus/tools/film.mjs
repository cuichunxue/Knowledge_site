// Render the 15 s film frame by frame (frame-exact: film.frame(t) sets everything from t), in parallel pages.
// usage: node tools/film.mjs <outDir> [width=1920] [height=1080] [fps=30] [workers=3] [from=0] [to=all] [baseUrl]
import {createRequire} from 'node:module';
import {mkdirSync, existsSync} from 'node:fs';
const {chromium} = createRequire(import.meta.url)('playwright');
const [out = 'film-frames', W = '1920', H = '1080', FPS = '30', WORKERS = '3', FROM = '0', TO = '', base = 'http://localhost:8765/materials/glass-dome-octopus/'] = process.argv.slice(2);
mkdirSync(out, {recursive: true});
const fps = Number(FPS);
const total = Math.round(15 * fps);
const last = TO ? Number(TO) : total - 1;
const queue = [];
for (let f = Number(FROM); f <= last; f++) if (!existsSync(`${out}/f${String(f).padStart(4, '0')}.png`)) queue.push(f); // resumable
console.log(`${queue.length} frames to render at ${W}x${H}`);
const browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const t0 = Date.now();
let done = 0;
await Promise.all(Array.from({length: Number(WORKERS)}, async () => {
  const p = await browser.newPage({viewport: {width: Number(W), height: Number(H)}, deviceScaleFactor: 1});
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(`${base}?film&shot=hero&q=high&ui=0&labels=0&auto=0`);
  await p.waitForFunction(() => window.__ready === true && window.__octo.film, null, {timeout: 240000});
  while (queue.length) {
    const f = queue.shift();
    await p.evaluate((t) => window.__octo.film.frame(t), f / fps);
    await p.screenshot({path: `${out}/f${String(f).padStart(4, '0')}.png`, timeout: 600000});
    done++;
    if (done % 10 === 0) console.log(`${done} frames, ${((Date.now() - t0) / done / 1000).toFixed(1)} s/frame avg`);
  }
  await p.close();
}));
await browser.close();
console.log(`done ${done} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
