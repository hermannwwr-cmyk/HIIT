// Vertical scrolling: embedding page (iframe) and the app page itself on a short screen.
const { open } = require('../lib');
(async () => {
  { const h = await open({ url: '', frame: 'http://localhost:8732/outer.html' });
    await h.toWorkout(); await h.remap();
    const { f, page, touch, stroke, box, go, cdp } = h;
    await f.evaluate(() => { window.__dp = []; window.addEventListener('touchmove', e => setTimeout(() => window.__dp.push((e.cancelable ? 'c' : 'u') + (e.defaultPrevented ? 'P' : '-')), 0), { passive: true }); });
    const outer = () => page.evaluate(() => document.querySelector('.wrap').scrollTop);
    await go('work', 6);
    const [cx, cy] = await box('#stage');
    for (const [name, x, y, dx, dy] of [['straight up 200px on the ring', cx, cy + 100, 3, -200], ['up 200px on the coach card', cx, 760, 2, -200], ['up 120px, slight drift', cx, cy + 80, 15, -120]]) {
      await page.evaluate(() => document.querySelector('.wrap').scrollTop = 0); await f.evaluate(() => window.__dp.length = 0);
      await touch(stroke(x, y, dx, dy, 300, 18, 'inout'), { after: 500 });
      console.log('iframe:', name, '-> outer scrollTop', await outer(), '| touchmoves', (await f.evaluate(() => window.__dp.join(' '))));
    }
    // control: drag on the outer page's own area (the grey pad below the iframe) after scrolling a bit
    await page.evaluate(() => document.querySelector('.wrap').scrollTop = 0);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 30, id: 99 }] });
    for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 30 + i * 3, id: 99 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await h.browser.close(); }
  { const h = await open({ url: (process.env.URL || 'http://127.0.0.1:8731/index.html'), width: 360, height: 560 });
    await h.toWorkout(); const { f, touch, stroke, box, go } = h;
    await go('rest', 6);
    const sh = await f.evaluate(() => [document.scrollingElement.scrollHeight, innerHeight]);
    const [cx, cy] = await box('#stage');
    await touch(stroke(cx, cy + 100, 3, -200, 300, 18, 'inout'), { after: 500 });
    console.log('short 360x560 page: scrollHeight/innerHeight', sh, '-> scrollTop after vertical drag', await f.evaluate(() => document.scrollingElement.scrollTop));
    await h.browser.close(); }
})();
