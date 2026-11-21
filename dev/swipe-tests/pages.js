// Pages: what a swipe looks like as whole pages. Holds a finger mid-drag (about 50 px and 140 px),
// then lets go, and screenshots each step: titles, countdowns and the lower area must travel with
// their dials, with one name per page. Usage: node pages.js [only-tag-substring]
const { open } = require('./lib');
const SHOTS = __dirname + (process.env.SHOTS || '/shots/pages/');
require('fs').mkdirSync(SHOTS, { recursive: true });
const URL = process.env.URL || 'http://127.0.0.1:8731/index.html';
const only = process.argv[2] || '';
const VIEWS = [[360, 640, 'light'], [390, 844, 'light'], [390, 844, 'dark'], [844, 390, 'light']];
// [tag, segment type or 'last', seconds in, direction (+1 next, -1 back), nth of that type]
const CASES = [['work-rest', 'work', 6, 1, 0], ['rest-work', 'rest', 6, 1, 0], ['work-restart', 'work', 8, -1, 0],
  ['warm-warm', 'warmup', 1, 1, 0], ['last-edge', 'last', 4, 1, 0], ['warm-lead', 'warmup', 3, 1, 3], ['rest-back', 'rest', 6, -1, 0], ['prep-work', 'prep', 3, 1, 0]];
(async () => {
  for (const [W, H, scheme] of VIEWS) {
    const h = await open({ url: URL, width: W, height: H });
    const { f, page, cdp, go } = h;
    await page.emulateMedia({ colorScheme: scheme });
    await page.reload(); await page.waitForTimeout(700);
    await h.toWorkout();
    const pre = `${SHOTS}${W}x${H}-${scheme}-`;
    for (const [tag, type, into, dir, nth] of CASES) {
      if (only && !(pre + tag).includes(only)) continue;
      if (type === 'last') { await f.evaluate(s => { const tl = window.__hiit.run.tl; window.__hiit.seek(tl.segments[tl.segments.length - 1].start + s); }, into); await page.waitForTimeout(450); }
      else await go(type, into, nth);
      await f.evaluate(() => { document.getElementById('toast').hidden = true; });
      const b = await f.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
      const x0 = b[0] + dir * 70, y = b[1] - 20;
      let vt = Date.now() / 1000, x = x0, id = 100 + Math.floor(Math.random() * 1e6);
      const P = () => [{ x, y, radiusX: 22, radiusY: 25, force: 0.6, id }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: P(), timestamp: vt });
      const dragTo = async d => {
        const target = x0 - dir * d;
        while (Math.abs(target - x) > 0.5) { x += Math.sign(target - x) * Math.min(6, Math.abs(target - x)); vt += 0.016; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: P(), timestamp: vt }); await page.waitForTimeout(16); }
        await page.waitForTimeout(300); vt += 0.3;
      };
      await dragTo(50); await page.screenshot({ path: `${pre}${tag}-1-50.png` });
      await dragTo(W > 700 ? 200 : 140); await page.screenshot({ path: `${pre}${tag}-2-140.png` });
      const st = await f.evaluate(() => document.getElementById('transport').className);
      vt += 0.02;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: vt });
      await page.waitForTimeout(90); await page.screenshot({ path: `${pre}${tag}-3-rel90.png` });
      await page.waitForTimeout(330); await page.screenshot({ path: `${pre}${tag}-4-rel420.png` });
      await page.waitForTimeout(700); await page.screenshot({ path: `${pre}${tag}-5-landed.png` });
      const after = await h.st();
      console.log(`${W}x${H} ${scheme} ${tag}: ${/armed/.test(st) ? 'armed' : 'not armed'} at 140 -> ${after.type} (${after.into}s in)`);
      // and a cancelled swipe: out to 60 px, back, let go: everything must be back
      await go(type === 'last' ? 'work' : type, into, nth);
      x = x0; id++; vt += 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: P(), timestamp: vt });
      await dragTo(60); await dragTo(8);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: vt });
      await page.waitForTimeout(700); await page.screenshot({ path: `${pre}${tag}-6-cancelled.png` });
    }
    if (h.errs.length) console.log('errors:', h.errs);
    await h.browser.close();
  }
})();
