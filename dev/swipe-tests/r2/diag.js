// Why do flicks fail under load? Log real handling times vs event times and armed toggles.
const { open } = require('../lib');
const BUSY = process.argv[2] === 'busy', N = +process.argv[3] || 12;
(async () => {
  const h = await open({ url: (process.env.URL || 'http://127.0.0.1:8731/index.html') });
  await h.toWorkout();
  const { f, page, touch, stroke, st, go, box } = h;
  await f.evaluate(() => {
    window.__ev = [];
    const rec = e => window.__ev.push([e.type, Math.round(performance.now()), Math.round(e.timeStamp), e.changedTouches[0] ? Math.round(e.changedTouches[0].clientX) : null, e.cancelable]);
    ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(t => window.addEventListener(t, rec, { capture: true, passive: true }));
    new MutationObserver(() => window.__ev.push(['armed=' + document.getElementById('transport').classList.contains('armed'), Math.round(performance.now())])).observe(document.getElementById('transport'), { attributes: true, attributeFilter: ['class'] });
    let last = performance.now(); (function raf(t) { if (t - last > 45) window.__ev.push(['longframe ' + Math.round(t - last), Math.round(t)]); last = t; requestAnimationFrame(raf); })(last);
  });
  if (BUSY) await f.evaluate(() => { (function spin() { const t = performance.now(); while (performance.now() - t < 30); requestAnimationFrame(spin); })(); });
  const [cx, cy0] = await box('#stage'); const cy = cy0 - 30;
  const cases = {
    'sparse2': [[cx + 50, cy, 0], [cx + 38, cy + 2, 50], [cx - 20, cy + 4, 50]],
    'sparse1': [[cx + 50, cy, 0], [cx - 20, cy + 4, 60]],
    'first4': [[cx + 50, cy, 0], [cx + 46, cy + 1, 30], [cx - 25, cy + 4, 50]],
    'right45': stroke(cx - 50, cy, 45, 10, 100, 6, 'in'),
    'flick70': stroke(cx + 50, cy, -70, 6, 110, 7, 'in'),
  };
  for (const [name, path] of Object.entries(cases)) {
    let ok = 0; const bad = [];
    for (let k = 0; k < N; k++) {
      const a = await go('work', 6, k % 3);
      await f.evaluate(() => window.__ev.length = 0);
      await touch(path, { after: 650 });
      const b = await st();
      const good = name === 'right45' ? (b.i === a.i && b.into < 2) : b.i === a.i + 1;
      if (good) ok++; else bad.push(await f.evaluate(() => window.__ev.slice()));
    }
    console.log(`${BUSY ? 'BUSY ' : ''}${name}: ${ok}/${N}`);
    if (bad[0]) { const t0 = bad[0][0][1]; console.log('   first failure:', bad[0].map(e => e[0] + '@' + (e[1] - t0) + (e[2] != null ? '(ts ' + (e[2] - bad[0][0][2]) + ' x' + e[3] + (e[4] === false ? ' UNCANCELABLE' : '') + ')' : '')).join('  ')); }
  }
  await h.browser.close();
})();
