// Feel: settle speed vs finger speed, frame times during drag/settle/land, mid-drag screenshots.
const { open } = require('./lib');
const SHOTS = __dirname + (process.env.SHOTS || '/shots/');
require('fs').mkdirSync(SHOTS, { recursive: true });
(async () => {
  const h = await open({ url: (process.env.URL || 'http://127.0.0.1:8731/index.html'), dsf: 1 });
  await h.toWorkout();
  const { f, page, cdp, touch, stroke, st, go, box } = h;
  await f.evaluate(() => {
    window.__fr = []; window.__lt = [];
    (function loop(t) { const el = document.getElementById('riCur'), pk = document.getElementById('riPeek');
      const m = new DOMMatrix(getComputedStyle(el).transform); const m2 = new DOMMatrix(getComputedStyle(pk).transform);
      window.__fr.push([t, m.m41, m2.m41, document.getElementById('stage').className]); if (window.__fr.length > 2000) window.__fr.shift(); requestAnimationFrame(loop); })(performance.now());
    try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: false }); } catch (e) {}
  });
  const [cx, cy0] = await box('#stage'); const cy = cy0 - 30;

  // 1) settle continuity: steady flicks at several speeds
  for (const [dx, ms] of [[-80, 160], [-100, 120], [-60, 60], [-150, 400], [-90, 300]]) {
    await go('work', 6);
    await f.evaluate(() => { window.__fr.length = 0; window.__lt.length = 0; window.__rel = 0; });
    const fingerV = Math.abs(dx) / ms;
    const p = stroke(cx + 60, cy, dx, 0, ms, Math.round(ms / 16), 'lin');
    await touch(p, { after: 700 });
    const fr = await f.evaluate(() => window.__fr.slice());
    const lt = await f.evaluate(() => window.__lt.slice());
    // first frame with "settle" class, then the speed in the next frames
    const i0 = fr.findIndex(r => /settle/.test(r[3]));
    let rows = [];
    if (i0 > 0) for (let i = i0 - 2; i < Math.min(fr.length, i0 + 6); i++) rows.push([(fr[i][0] - fr[i0][0]).toFixed(0), fr[i][1].toFixed(1), fr[i][3].replace('w-stage', '').trim()]);
    const v = [];
    for (let i = Math.max(1, i0 - 2); i < Math.min(fr.length, i0 + 5); i++) v.push(((fr[i][1] - fr[i - 1][1]) / (fr[i][0] - fr[i - 1][0])).toFixed(2));
    // biggest frame gap from drag start to 600 ms after release
    const gaps = []; for (let i = 1; i < fr.length; i++) gaps.push(fr[i][0] - fr[i - 1][0]);
    console.log(`flick ${dx}px/${ms}ms finger ${fingerV.toFixed(2)} px/ms -> per-frame speed around release: ${v.join(' ')} | max frame gap ${Math.max(...gaps).toFixed(0)}ms | longtasks ${JSON.stringify(lt.map(x => Math.round(x[1])))}`);
    console.log('   ', rows.map(r => r.join(':')).join('  '));
  }
  // 1b) spring back from a slow drag released at 80 px
  { await go('work', 6); await f.evaluate(() => { window.__fr.length = 0; });
    await touch(stroke(cx + 60, cy, -80, 0, 500, 30, 'inout'), { hold: 120, after: 600 });
    const fr = await f.evaluate(() => window.__fr.slice()); const i0 = fr.findIndex(r => /settle/.test(r[3]));
    console.log('springback from 80 px:', fr.slice(Math.max(0, i0 - 1), i0 + 14).map(r => r[1].toFixed(0)).join(' ')); }

  // 2) screenshots mid-drag: work->rest (dial), rest->work (figure), back (restart)
  async function shots(tag, type, off, dir, dists) {
    await go(type, off);
    let vt = Date.now() / 1000; const id = 900 + Math.floor(Math.random() * 1000);
    const P = (x, y) => ({ x, y, radiusX: 24, radiusY: 27, force: .6, id });
    const x0 = dir > 0 ? cx + 90 : cx - 90;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [P(x0, cy)], timestamp: vt });
    let x = x0;
    for (const d of dists) {
      const target = x0 - dir * d;
      while (Math.abs(target - x) > 0.5) { x += Math.sign(target - x) * Math.min(6, Math.abs(target - x)); vt += 0.016; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [P(x, cy + (x0 - x) * 0.05)], timestamp: vt }); await page.waitForTimeout(16); }
      await page.waitForTimeout(350); vt += 0.35;
      const cls = await f.evaluate(() => document.getElementById('transport').className);
      await page.screenshot({ path: `${SHOTS}${tag}-${d}px${/armed/.test(cls) ? '-armed' : ''}.png` });
    }
    // and settle back
    for (let k = 0; k < 20; k++) { x += dir * 8; vt += 0.03; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [P(x, cy)], timestamp: vt }); await page.waitForTimeout(30); if ((dir > 0 && x >= x0) || (dir < 0 && x <= x0)) break; }
    await page.waitForTimeout(200); vt += .2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: vt });
    await page.waitForTimeout(600);
  }
  const W = 390, cd = Math.min(140, W * 0.3);
  await shots('work-to-rest', 'work', 6, 1, [Math.round(cd * .25), Math.round(cd * .5), Math.round(cd * 1.05), 200]);
  await shots('rest-to-work', 'rest', 6, 1, [Math.round(cd * .25), Math.round(cd * .5), Math.round(cd * 1.05)]);
  await shots('work-back-restart', 'work', 8, -1, [Math.round(cd * .5), Math.round(cd * 1.05)]);
  await shots('rest-back', 'rest', 6, -1, [Math.round(cd * .5), Math.round(cd * 1.05)]);
  await shots('warm-lead-next', 'warmup', 1, 1, [Math.round(cd * .5), Math.round(cd * 1.05)]);
  await h.browser.close();
})();
