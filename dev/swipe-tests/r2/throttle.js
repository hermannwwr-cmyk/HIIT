// Slow-phone emulation (CDP CPU throttling): do quick flicks still commit? And how long is the move that starts the swipe?
const { open } = require('../lib');
const RATE = +process.argv[2] || 4, N = +process.argv[3] || 10;
const URL = process.env.URL || 'http://127.0.0.1:8731/index.html';
(async () => {
  const h = await open({ url: URL });
  await h.toWorkout();
  const { f, page, cdp, touch, stroke, st, go, box } = h;
  await f.evaluate(() => {
    window.__mv = [];
    let t0 = 0;
    window.addEventListener('touchmove', () => { t0 = performance.now(); }, { capture: true, passive: true });
    window.addEventListener('touchmove', () => { window.__mv.push(performance.now() - t0); }, { passive: true });
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  const [cx, cy0] = await box('#stage'); const cy = cy0 - 30;
  const cases = {
    'flick 70px/110ms (7 moves)': stroke(cx + 50, cy, -70, 6, 110, 7, 'in'),
    'flick 60px/100ms (4 moves)': stroke(cx + 50, cy, -60, 6, 100, 4, 'in'),
    'sparse 2 moves 12,70 /100ms': [[cx + 50, cy, 0], [cx + 38, cy + 2, 50], [cx - 20, cy + 4, 50]],
    'flick right 50px/100ms': stroke(cx - 50, cy, 50, 8, 100, 6, 'in'),
  };
  for (const [name, path] of Object.entries(cases)) {
    let ok = 0, mv = [];
    for (let k = 0; k < N; k++) {
      const a = await go('work', 6, k % 3);
      await f.evaluate(() => window.__mv.length = 0);
      await touch(path, { after: 900 });
      const b = await st();
      mv.push(Math.max(...await f.evaluate(() => window.__mv)));
      if (name.includes('right') ? (b.i === a.i && b.into < 2) : b.i === a.i + 1) ok++;
    }
    console.log(`cpu x${RATE} ${name}: ${ok}/${N} committed; slowest touchmove handler ${Math.round(Math.max(...mv))} ms (median ${Math.round(mv.sort((a, b) => a - b)[mv.length >> 1])})`);
  }
  await h.browser.close();
})();
