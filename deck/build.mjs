// Writes the pitch deck to web/public/slidedeck (served at /slidedeck/), with the screenshots
// beside it, and optionally a PDF and per-slide PNGs rendered with the system Chrome.
//   node deck/build.mjs                  -> web/public/slidedeck/index.html + img/
//   node deck/build.mjs --pdf            -> + web/public/slidedeck/portside-deck.pdf
//   node deck/build.mjs --shots DIR      -> + DIR/slide-NN.png and an overflow check
//   PORTSIDE_VIDEO=<url> node deck/build.mjs   adds the demo video link to the last slide
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const dir = path.dirname(new URL(import.meta.url).pathname);
const outDir = path.resolve(dir, '../web/public/slidedeck');
fs.mkdirSync(path.join(outDir, 'img'), { recursive: true });
for (const f of fs.readdirSync(path.join(dir, 'img'))) fs.copyFileSync(path.join(dir, 'img', f), path.join(outDir, 'img', f));
let html = fs.readFileSync(path.join(dir, 'src.html'), 'utf8');
const video = process.env.PORTSIDE_VIDEO;
if (video) html = html.replace('<!--VIDEO-->', `<a href="${video}"><small>Demo video</small><b>${video.replace(/^https?:\/\//, '')}</b></a>`);
const out = path.join(outDir, 'index.html');
fs.writeFileSync(out, html);
console.log('wrote', out);

const args = process.argv.slice(2);
if (!args.includes('--pdf') && !args.includes('--shots')) process.exit(0);
const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_CORE || '/Users/mac/Documents/Hacks/zecathon/stowaway-video/node_modules/puppeteer-core');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto('file://' + out, { waitUntil: 'networkidle0' });
await page.addStyleTag({ content: '.hud{display:none!important}' });
await page.evaluate(() => document.fonts.ready);
const si = args.indexOf('--shots');
if (si >= 0) {
  const shotDir = args[si + 1];
  fs.mkdirSync(shotDir, { recursive: true });
  const n = await page.evaluate(() => window.__deck.count);
  for (let k = 0; k < n; k++) {
    await page.evaluate((k) => window.__deck.go(k), k);
    await page.screenshot({ path: path.join(shotDir, `slide-${String(k + 1).padStart(2, '0')}.png`) });
  }
  const issues = await page.evaluate(() => {
    const res = [];
    document.querySelectorAll('.slide').forEach((s, k) => {
      window.__deck.go(k);
      const sr = s.getBoundingClientRect();
      s.querySelectorAll('*').forEach((el) => {
        if (el.classList.contains('bg')) return;
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > sr.right + 1 || r.bottom > sr.bottom + 1)) res.push(`slide ${k + 1}: ${el.tagName}.${el.className} overflows`);
      });
      const foot = s.querySelector('.foot')?.getBoundingClientRect();
      if (foot) s.querySelectorAll(':scope > *:not(.foot):not(.bg)').forEach((el) => { const r = el.getBoundingClientRect(); if (r.height && r.bottom > foot.top - 8 && !s.classList.contains('cover') && !s.classList.contains('close')) res.push(`slide ${k + 1}: ${el.tagName}.${el.className} runs into the footer (${Math.round(r.bottom - foot.top)} px)`); });
    });
    return res;
  });
  console.log(issues.length ? issues.join('\n') : 'no overflow found');
}
if (args.includes('--pdf')) {
  await page.emulateMediaType('print');
  const pdf = path.join(outDir, 'portside-deck.pdf');
  await page.pdf({ path: pdf, width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true });
  console.log('wrote', pdf, (fs.statSync(pdf).size / 1024 / 1024).toFixed(2), 'MB');
}
await browser.close();
process.exit(0);
