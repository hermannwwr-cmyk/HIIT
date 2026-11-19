const { open } = require('../lib');
(async () => {
  const h = await open({ url: '', frame: 'http://localhost:8732/outer.html' });
  await h.toWorkout(); await h.remap();
  const { f, page, touch, stroke, box, go } = h;
  const outer = () => page.evaluate(() => document.querySelector('.wrap').scrollTop);
  await go('work', 6);
  const [cx, cy] = await box('#stage');
  console.log('root overscroll:', await f.evaluate(() => [getComputedStyle(document.documentElement).overscrollBehaviorY, getComputedStyle(document.body).overscrollBehaviorY]));
  for (const mode of ['as shipped', 'overscroll auto']) {
    if (mode !== 'as shipped') await f.evaluate(() => { document.documentElement.style.overscrollBehavior = 'auto'; document.body.style.overscrollBehavior = 'auto'; });
    for (const [name, x, y, dx, dy] of [['ring', cx, cy + 100, 3, -200], ['ring drift', cx, cy + 80, 15, -120], ['coach', cx, 760, 2, -200], ['digits', cx, 610, 2, -200]]) {
      await page.evaluate(() => document.querySelector('.wrap').scrollTop = 0);
      await touch(stroke(x, y, dx, dy, 300, 18, 'inout'), { after: 500 });
      const el = await f.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e.id || e.className; }, [x, y]);
      console.log(mode, name, '(' + el + ') -> outer scrollTop', await outer());
    }
  }
  await h.browser.close();
})();
