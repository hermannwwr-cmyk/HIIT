// The offline copy's update path, as a phone sees it: one tab that is never closed. It stamps four
// versions the way the Pages workflow does, serves them on port 8771 and drives one tab through them.
//   node dev/offline-test.js      (needs a globally installed Playwright; must end "fails: 0")
const { chromium } = require('playwright'); const fs = require('fs'); const cp = require('child_process'); const path = require('path');
const SRC = path.resolve(__dirname, '..'), SITE = require('os').tmpdir() + '/overdrive-swsite', PORT = 8771, URL = `http://127.0.0.1:${PORT}/index.html`;
function deploy(v) {
  fs.rmSync(SITE, { recursive: true, force: true }); fs.mkdirSync(SITE, { recursive: true });
  cp.execSync(`cp -r index.html manifest.webmanifest sw.js css js icons fonts ${SITE}/`, { cwd: SRC });
  let sw = fs.readFileSync(SITE + '/sw.js', 'utf8'); sw = sw.replace(/^var VERSION = 'dev';.*$/m, `var VERSION = '${v}';`); fs.writeFileSync(SITE + '/sw.js', sw);
  let h = fs.readFileSync(SITE + '/index.html', 'utf8'); h = h.replace(/<title>[^<]*<\/title>/, `<title>build ${v}</title>`); fs.writeFileSync(SITE + '/index.html', h);
}
let fails = 0; const ok = (n, c, g) => { console.log((c ? 'PASS ' : 'FAIL ') + n + '  [' + JSON.stringify(g) + ']'); if (!c) fails++; };
(async () => {
  deploy('v1');
  let srv = cp.spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: SITE, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const info = () => page.evaluate(async () => ({ title: document.title, keys: await caches.keys(), ctl: !!navigator.serviceWorker.controller, screen: document.body.getAttribute('data-screen') }));
  await page.goto(URL); await page.evaluate(() => { window.__first = 1; }); await page.waitForTimeout(2500);
  ok('first ever visit: the copy is saved without a reload', await page.evaluate(() => window.__first === 1), (await info()).keys);
  await page.reload(); await page.waitForTimeout(1500);
  let i = await info(); ok('v1 installed and controlling', i.title === 'build v1' && i.ctl && i.keys.join() === 'overdrive-hiit-v1', i);
  // one open: the old version shows, the new one downloads, the page switches to it by itself
  deploy('v2');
  await page.reload(); await page.waitForTimeout(250);
  const shown = (await info()).title;
  await page.waitForTimeout(4000);
  i = await info(); ok('one open after a deploy: opens as v1, then switches to v2, old copy gone', shown === 'build v1' && i.title === 'build v2' && i.keys.join() === 'overdrive-hiit-v2', [shown, i]);
  await page.evaluate(() => { window.__mark = 1; }); await page.waitForTimeout(3000);
  ok('no reload loop', await page.evaluate(() => window.__mark === 1) && (await info()).title === 'build v2', (await info()).title);
  // the app was only in the background: coming back is enough
  deploy('v3');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.waitForTimeout(4500);
  i = await info(); ok('back from the background on the setup screen: switches to v3', i.title === 'build v3' && i.keys.join() === 'overdrive-hiit-v3', i);
  // a workout is never interrupted: v4 arrives while one runs
  deploy('v4');
  await page.click('#start'); await page.waitForTimeout(600); await page.click('#bStart'); await page.waitForTimeout(3000);
  await page.evaluate(() => { window.__alive = 1; return navigator.serviceWorker.getRegistration().then(r => r.update()); }); await page.waitForTimeout(3500);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.waitForTimeout(1500);
  i = await info(); const alive = await page.evaluate(() => window.__alive === 1);
  ok('mid-workout: no reload, still v3, v4 waits', alive && i.title === 'build v3' && i.screen === 'workout' && i.keys.length === 2, i);
  // …and is taken as soon as the workout is over and the app is back on the setup screen
  await page.evaluate(() => { window.__hiit.finish(); }); await page.waitForTimeout(1200);
  const done = (await info()).screen;
  await page.evaluate(() => { document.getElementById('newWorkout').click(); }); await page.waitForTimeout(4000);
  i = await info(); ok('workout over, back on the setup screen: v4', i.title === 'build v4' && i.screen === 'setup' && i.keys.join() === 'overdrive-hiit-v4', [done, i]);
  // offline
  srv.kill(); await new Promise(r => setTimeout(r, 500));
  await page.reload(); await page.waitForTimeout(3000);
  i = await info(); const font = await page.evaluate(() => document.fonts.check('400 16px Geist'));
  ok('server stopped: the app still opens', i.title === 'build v4' && i.screen === 'setup', i);
  ok('font available offline', font, font);
  await page.click('#start'); await page.waitForTimeout(600); await page.click('#bStart'); await page.waitForTimeout(2500);
  ok('offline: a workout starts', (await info()).screen === 'workout', (await info()).screen);
  ok('no page errors', errs.length === 0, errs);
  console.log('fails:', fails);
  await b.close();
})();
