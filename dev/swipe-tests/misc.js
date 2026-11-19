const { open } = require('./lib');
(async () => {
  // 1) short landscape: can the page scroll, and does a vertical drag scroll it?
  { const h = await open({ url: (process.env.URL || 'http://127.0.0.1:8731/index.html'), width: 844, height: 390 });
    await h.toWorkout(); const { f, page, touch, stroke, st, go, box } = h;
    await go('work', 6);
    const sc = await f.evaluate(() => { const els = [document.scrollingElement, ...document.querySelectorAll('#workout, #workout *')].filter(e => e.scrollHeight > e.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(e).overflowY) || e === document.scrollingElement); return els.map(e => (e.id || e.className || e.tagName) + ':' + e.scrollHeight + '/' + e.clientHeight + '@' + e.scrollTop); });
    console.log('landscape scrollables', sc);
    const [cx, cy] = await box('#stage');
    await touch(stroke(cx, cy + 60, 4, -160, 300, 18, 'inout'), { after: 500 });
    const sc2 = await f.evaluate(() => [document.scrollingElement.scrollTop, ...[...document.querySelectorAll('#workout, #workout *')].filter(e => e.scrollTop > 0).map(e => (e.id || e.className) + '@' + e.scrollTop)]);
    console.log('landscape after vertical drag: scrollTop', sc2, 'state', (await st()).type);
    const [x2, y2] = await box('#coach');
    await touch(stroke(x2, y2, 0, -150, 300, 18, 'inout'), { after: 500 });
    console.log('after drag on coach card:', await f.evaluate(() => [document.scrollingElement.scrollTop, ...[...document.querySelectorAll('#workout, #workout *')].filter(e => e.scrollTop > 0).map(e => (e.id || e.className) + '@' + e.scrollTop)]));
    const a = await go('work', 6); await touch(stroke(cx + 60, cy - 20, -80, 5, 120, 7, 'in')); console.log('landscape flick moved', (await st()).i - a.i);
    await page.screenshot({ path: __dirname + '/shots/landscape.png' });
    console.log('errs', h.errs); await h.browser.close(); }
  // 2) mouse drag / click
  { const h = await open({ url: (process.env.URL || 'http://127.0.0.1:8731/index.html') });
    await h.toWorkout(); const { f, page, st, go, box } = h;
    const [cx, cy] = await box('#stage');
    let a = await go('work', 6); await page.mouse.move(cx + 60, cy); await page.mouse.down(); for (let i = 1; i <= 10; i++) { await page.mouse.move(cx + 60 - i * 15, cy + i); await page.waitForTimeout(16); } await page.mouse.up(); await page.waitForTimeout(700);
    console.log('mouse drag 150 moved', (await st()).i - a.i);
    a = await go('work', 6); const [sx, sy] = await box('#skip'); await page.mouse.click(sx, sy); await page.waitForTimeout(700); console.log('mouse click skip moved', (await st()).i - a.i);
    a = await go('work', 6); await page.mouse.move(sx, sy); await page.mouse.down(); for (let i = 1; i <= 8; i++) { await page.mouse.move(sx - i * 15, sy); await page.waitForTimeout(16); } await page.mouse.up(); await page.waitForTimeout(700);
    const l = await h.log(); console.log('mouse drag from skip moved', (await st()).i - a.i, 'clicks', l.clicks);
    await h.browser.close(); }
  // 3) busy main thread, delivery-time stamps (no hardware timestamps)
  { const h = await open({ url: (process.env.URL || 'http://127.0.0.1:8731/index.html') });
    await h.toWorkout(); const { f, page, cdp, st, go, box } = h;
    await f.evaluate(() => { (function spin() { const t = performance.now(); while (performance.now() - t < 30); requestAnimationFrame(spin); })(); });
    const [cx, cy] = await box('#stage');
    let ok = 0, n = 0;
    for (const [dx, ms] of [[-50, 100], [-60, 120], [-70, 150], [-45, 90], [-80, 200]]) {
      const a = await go('work', 6, n % 3);
      let id = 5000 + n; const P = (x, y) => ({ x, y, radiusX: 24, radiusY: 27, force: .6, id });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [P(cx + 50, cy)] });
      const k = Math.round(ms / 16); for (let i = 1; i <= k; i++) { await page.waitForTimeout(ms / k); cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [P(cx + 50 + dx * (i / k) ** 2, cy + i)] }); }
      await page.waitForTimeout(8); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(900); const b = await st(); n++; if (b.i === a.i + 1) ok++;
      console.log(`busy/no-ts flick ${dx}/${ms}: moved ${b.i - a.i}`);
    }
    await h.browser.close(); }
})();
