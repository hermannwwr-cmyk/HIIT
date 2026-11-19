// Does what `armed` showed at the moment of release match what the release did? (event clock vs wall clock)
const { open } = require('../lib');
const RATE = +process.argv[2] || 1, N = +process.argv[3] || 3;
(async () => {
  const h = await open({ url: (process.env.URL || 'http://127.0.0.1:8731/index.html') });
  await h.toWorkout();
  const { f, page, cdp, touch, stroke, st, go, box } = h;
  await f.evaluate(() => {
    window.__a = { at: null, offFor: 0, log: [] };
    const tp = document.getElementById('transport'); let lastChange = performance.now();
    new MutationObserver(() => { lastChange = performance.now(); }).observe(tp, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('touchend', () => { window.__a.at = tp.classList.contains('armed'); window.__a.since = Math.round(performance.now() - lastChange); }, { capture: true, passive: true });
  });
  if (RATE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  const [cx, cy0] = await box('#stage'); const cy = cy0 - 30;
  const cases = [];
  for (const hold of [0, 40, 70, 90, 110, 140, 200]) cases.push(['flick 70/110 then hold ' + hold, stroke(cx + 50, cy, -70, 6, 110, 7, 'in'), hold]);
  for (const hold of [0, 60, 100, 150]) cases.push(['sparse 12,70 then hold ' + hold, [[cx + 50, cy, 0], [cx + 38, cy + 2, 50], [cx - 20, cy + 4, 50]], hold]);
  cases.push(['drag 0.2 px/ms 80 px', stroke(cx + 60, cy, -80, 0, 400, 25, 'lin'), 0]);
  cases.push(['drag 0.27 px/ms 80 px', stroke(cx + 60, cy, -80, 0, 300, 19, 'lin'), 0]);
  cases.push(['fast 40 then slow 40 (0.18)', [...stroke(cx + 60, cy, -40, 0, 80, 5, 'lin'), ...stroke(cx + 20, cy, -40, 0, 220, 14, 'lin').slice(1)], 0]);
  cases.push(['fast 40 then slow 40 (0.12)', [...stroke(cx + 60, cy, -40, 0, 80, 5, 'lin'), ...stroke(cx + 20, cy, -40, 0, 330, 20, 'lin').slice(1)], 0]);
  const bad = [];
  let total = 0;
  for (const [name, path, hold] of cases) {
    const res = [];
    for (let k = 0; k < N; k++) {
      const a = await go('work', 6, k % 3);
      await touch(path, { hold, endDt: hold ? 0 : 8, after: 800 });
      const b = await st(); const A = await f.evaluate(() => window.__a);
      const moved = b.i - a.i; total++;
      res.push((A.at ? 'A' : 'a') + moved + (A.at === !!moved ? '' : '!') + (A.at === false && moved ? '(off ' + A.since + 'ms)' : ''));
      if (A.at !== !!moved) bad.push(name + ': armed=' + A.at + ' (for ' + A.since + ' ms) moved=' + moved);
    }
    console.log(`x${RATE} ${name}: ${res.join(' ')}`);
  }
  console.log(`x${RATE} disagreements: ${bad.length}/${total}`);
  await h.browser.close();
})();
