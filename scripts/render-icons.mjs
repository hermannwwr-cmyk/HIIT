// Renders the pre-rendered PNG icons from icons/*.svg:  node scripts/render-icons.mjs [outDir]
// Needs a globally installed Playwright (found through NODE_PATH); nothing in the site or the tests uses this file.
// Chromium writes its screenshots with fast, loose compression, so each one is re-encoded losslessly
// (scripts/png.mjs: best filter, zlib level 9; plain Node, and it checks the pixels are unchanged).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { optimise } from './png.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const icons = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'icons');
const out = process.argv[2] || icons;

// [png, source svg, size in px, opaque]. The favicon keeps its transparent background;
// the home-screen icons are opaque (iOS fills transparent pixels with black).
const JOBS = [
  ['favicon-32.png', 'favicon.svg', 32, false],
  ['apple-touch-icon.png', 'icon.svg', 180, true],
  ['icon-192.png', 'icon.svg', 192, true],
  ['icon-512.png', 'icon.svg', 512, true],
  ['maskable-512.png', 'maskable.svg', 512, true]
];

const browser = await chromium.launch();
for (const [png, svg, size, opaque] of JOBS) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const src = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(icons, svg)).toString('base64');
  await page.setContent('<style>html,body{margin:0;background:transparent}img{display:block}</style>' +
    '<img width="' + size + '" height="' + size + '" src="' + src + '">');
  await page.waitForFunction(() => document.images[0].complete && document.images[0].naturalWidth > 0);
  const shot = await page.screenshot({ omitBackground: !opaque, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  const slim = optimise(shot);
  fs.writeFileSync(path.join(out, png), slim);
  console.log(png, size + ' px', opaque ? 'opaque' : 'transparent', shot.length + ' → ' + slim.length + ' bytes');
}
await browser.close();
