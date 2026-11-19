const { open } = require('./lib');
(async () => {
  const h = await open({ url: (process.env.URL || 'http://127.0.0.1:8731/index.html'), dsf: 1 });
  await h.toWorkout();
  const { f, page, touch, stroke, st, box } = h;
  await h.go('work', 6);
  const [x, y] = await box('#wEx b');
  const tgt = await f.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e.tagName + ' in #' + e.parentElement.id; }, [x, y]);
  const a = await st();
  // slow 150 px drag from "Upper body": arms at ~117 px -> wEx.innerHTML is rewritten
  await touch(stroke(x, y, -150, 3, 500, 30, 'lin'), { after: 600 });
  const b = await st();
  await page.screenshot({ path: __dirname + '/shots/stuck-after-wEx.png' });
  const cls = await f.evaluate(() => [document.getElementById('stage').className, document.getElementById('transport').className, document.getElementById('wName').textContent]);
  console.log('target', tgt, 'moved', b.i - a.i, cls);
  // does ⏭ still work? does a normal swipe?
  const [sx, sy] = await box('#skip');
  await touch([[sx, sy, 0]], { endDt: 60 });
  const c = await st();
  const cls2 = await f.evaluate(() => [document.getElementById('stage').className, document.getElementById('transport').className]);
  console.log('tap skip moved', c.i - b.i, cls2);
  const [cx, cy] = await box('#stage');
  await touch(stroke(cx + 50, cy - 30, -80, 4, 120, 7, 'in'));
  const d = await st();
  console.log('flick after tap moved', d.i - c.i);
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(800);
  console.log('key moved', (await st()).i - d.i);
  await page.screenshot({ path: __dirname + '/shots/stuck-later.png' });
  await h.browser.close();
})();
