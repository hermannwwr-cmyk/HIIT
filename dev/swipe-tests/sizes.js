// Content sizes at the usual screens: ring, figure, countdown digits, pause. Run before and after a layout
// change; a drop in the figure or the countdown is a regression unless it was asked for.
//   node sizes.js            (URL=http://127.0.0.1:8731/index.html by default; serve the repo root there)
const { open } = require('./lib');
const SIZES = [[320, 568], [360, 640], [375, 667], [390, 844], [430, 932], [844, 390], [820, 1180], [1180, 820]];
(async () => {
  for (const [w, h] of SIZES) {
    const s = await open({ url: (process.env.URL || 'http://127.0.0.1:8731/index.html'), width: w, height: h });
    await s.toWorkout(); await s.go('work', 6); await s.page.waitForTimeout(400);
    const work = await s.f.evaluate(() => { const g = window.__hiit.ring.geo, r = id => Math.round(document.getElementById(id).getBoundingClientRect().width); return { ring: Math.round(g.S), fig: r('fig'), digits: Math.round(parseFloat(getComputedStyle(document.getElementById('digits')).fontSize)), pause: r('pause') }; });
    await s.go('rest', 6); await s.page.waitForTimeout(400);
    const rest = await s.f.evaluate(() => { const c = document.getElementById('upNext').getBoundingClientRect(), b = document.getElementById('unStart').getBoundingClientRect(); return { restDigits: Math.round(parseFloat(getComputedStyle(document.getElementById('dialDigits')).fontSize)), card: Math.round(c.width) + 'x' + Math.round(c.height), start: Math.round(b.height) }; });
    console.log((w + 'x' + h).padEnd(9), JSON.stringify(Object.assign(work, rest)), s.errs.length ? 'ERRORS ' + s.errs.join(' | ') : '');
    await s.browser.close();
  }
})();
