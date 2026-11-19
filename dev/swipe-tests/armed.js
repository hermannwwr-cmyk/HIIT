const { open } = require('./lib');
(async () => {
  const h = await open({ url: (process.env.URL || 'http://127.0.0.1:8731/index.html'), dsf: 1 });
  await h.toWorkout();
  const { f, page, touch, stroke, st, go, box } = h;
  const [cx, cy0] = await box('#stage'); const cy = cy0 - 30;
  await f.evaluate(() => { window.__arm = []; new MutationObserver(() => window.__arm.push([Math.round(performance.now()), document.getElementById('transport').classList.contains('armed')])).observe(document.getElementById('transport'), { attributes: true, attributeFilter: ['class'] }); });
  for (const [dx, ms, hold] of [[-40, 90, 300], [-60, 140, 250], [-90, 220, 400]]) {
    const a = await go('work', 6);
    await f.evaluate(() => window.__arm.length = 0);
    let armedAtRelease = null;
    await touch(stroke(cx + 60, cy, dx, 0, ms, Math.round(ms / 16), 'lin'), { hold, endDt: 0, onMove: async () => {} });
    const b = await st();
    const arm = await f.evaluate(() => window.__arm.slice());
    // armed state just before touchend = last toggle before the release
    console.log(`quick ${dx}px/${ms}ms then still ${hold}ms: armed toggles ${JSON.stringify(arm.map(x => x[1] ? 'ON' : 'off'))} -> result moved ${b.i - a.i}`);
  }
  // medium-speed drag with natural speed variation: how often does the head flip?
  { const a = await go('work', 6); await f.evaluate(() => window.__arm.length = 0);
    const p = [[cx + 80, cy, 0]]; let x = cx + 80; for (let i = 0; i < 40; i++) { x -= 2.5 + 3 * Math.abs(Math.sin(i / 2.2)); p.push([x, cy + Math.sin(i / 5) * 4, 16]); }
    await touch(p, { hold: 200 });
    const arm = await f.evaluate(() => window.__arm.filter((x, i, A) => i === 0 || x[1] !== A[i - 1][1]).map(x => x[1] ? 'ON' : 'off'));
    console.log('uneven drag of', Math.round(cx + 80 - x), 'px: armed sequence', arm.join(','), '-> moved', (await st()).i - a.i); }
  await h.browser.close();
})();
