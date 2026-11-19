// The incoming page's clip while dragging and settling: screencast frames + per-frame clip vs curtain edge.
const { open } = require('../lib');
const fs = require('fs');
(async () => {
  const h = await open({ url: (process.env.URL || 'http://127.0.0.1:8731/index.html'), dsf: 2 });
  await h.toWorkout();
  const { f, page, cdp, touch, stroke, go, box } = h;
  const [cx, cy0] = await box('#stage'); const cy = cy0 - 30;
  await f.evaluate(() => {
    window.__fr = [];
    (function loop(t) { const pk = document.getElementById('riPeek'), cur = document.getElementById('riCur'), ec = document.querySelector('.ri-edge-c'), st = document.getElementById('stage');
      const pr = pk.getBoundingClientRect(), cs = getComputedStyle(pk);
      window.__fr.push([Math.round(t), st.className.replace('w-stage', '').trim(), cs.clipPath, Math.round(new DOMMatrix(cs.transform).m41), Math.round(ec.getBoundingClientRect().left), Math.round(new DOMMatrix(getComputedStyle(cur).transform).m41)]);
      requestAnimationFrame(loop); })(performance.now());
  });
  for (const [tag, type, off, path, hold] of [
    ['slow-commit-work-to-rest', 'work', 6, stroke(cx + 70, cy, -125, 0, 700, 40, 'inout'), 150],
    ['flick-rest-to-work', 'rest', 6, stroke(cx + 60, cy, -70, 0, 110, 7, 'in'), 0],
    ['slow-commit-rest-to-work', 'rest', 6, stroke(cx + 70, cy, -125, 0, 700, 40, 'inout'), 150],
    ['flick-back-work', 'work', 8, stroke(cx - 60, cy, 70, 0, 110, 7, 'in'), 0],
  ]) {
    await go(type, off);
    await f.evaluate(() => window.__fr.length = 0);
    const frames = [];
    const onF = fr => { frames.push(fr.data); cdp.send('Page.screencastFrameAck', { sessionId: fr.sessionId }).catch(() => {}); };
    cdp.on('Page.screencastFrame', onF);
    await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: 780, maxHeight: 1688 });
    await touch(path, { hold, after: 800 });
    await cdp.send('Page.stopScreencast'); cdp.off('Page.screencastFrame', onF);
    const dir = __dirname + '/shots/clip-' + tag + '/'; fs.mkdirSync(dir, { recursive: true });
    frames.forEach((d, i) => fs.writeFileSync(dir + String(i).padStart(3, '0') + '.png', Buffer.from(d, 'base64')));
    const fr = await f.evaluate(() => window.__fr.slice());
    const i0 = fr.findIndex(r => /settle/.test(r[1]));
    console.log(tag, frames.length, 'frames; around settle:');
    for (let i = Math.max(0, i0 - 2); i < Math.min(fr.length, i0 + 14); i++) console.log('   ', fr[i][0] - fr[i0][0], fr[i][1], '| clip', fr[i][2], '| peek x', fr[i][3], '| curtain left', fr[i][4], '| cur x', fr[i][5]);
  }
  await h.browser.close();
})();
