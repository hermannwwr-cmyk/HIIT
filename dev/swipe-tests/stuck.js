// A swipe whose touchstart target is replaced mid-gesture (innerHTML) never ends for the app.
const { open } = require('./lib');
(async () => {
  for (const sel of ['#wNext b', '#digits span', '#wEx']) {
    const h = await open({ url: (process.env.URL || 'http://127.0.0.1:8731/index.html') });
    await h.toWorkout();
    const { f, page, touch, stroke, st, box } = h;
    // put a work interval ~0.85 s before a whole-second tick (and 9 s left for the digits case: 10 -> 9 rebuild)
    const seg = await f.evaluate(() => window.__hiit.run.tl.segments.find(s => s.type === 'work'));
    await f.evaluate(([s, off]) => window.__hiit.seek(s + off), [seg.start, sel === '#digits span' ? seg.duration - 10.15 : 6.15]);
    await page.waitForTimeout(30);
    const [x, y, w] = await f.evaluate(s => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width]; }, sel);
    const a = await st();
    const tgt = await f.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e.tagName + '#' + e.id + '.' + e.className + ' in ' + e.parentElement.id; }, [x, y]);
    // slow-ish drag 140 px over 420 ms: the tick (and, for #wEx, arming) happens during it
    await touch(stroke(x + 70, y, -140, 4, 420, 26, 'lin').map((p, i) => i === 0 ? [x, y, 0] : [p[0] - 70, p[1], p[2]]));
    const b = await st();
    const g1 = await f.evaluate(() => [document.getElementById('stage').className, document.getElementById('transport').className]);
    // now a clean flick in the middle of the ring
    const [cx, cy] = await box('#stage');
    await h.go('work', 5, 1);
    const c0 = await st();
    await touch(stroke(cx + 50, cy - 30, -80, 4, 120, 7, 'in'));
    const c1 = await st();
    await touch(stroke(cx + 50, cy - 30, -200, 4, 500, 30, 'inout'));
    const c2 = await st();
    console.log(sel, '| target', tgt, '| drag moved', b.i - a.i, '| after:', g1.join(' / '), '| next flick moved', c1.i - c0.i, ', long drag moved', c2.i - c1.i);
    await h.browser.close();
  }
})();
