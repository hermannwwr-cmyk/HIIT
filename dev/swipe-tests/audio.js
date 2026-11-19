const { open } = require('./lib');
(async () => {
  const h = await open({ url: (process.env.URL || 'http://127.0.0.1:8731/index.html') });
  await h.toWorkout();
  const { f, page, touch, stroke, st, go, box, log } = h;
  const [cx, cy] = await box('#stage');
  let a = await go('work', 24); // inside the last-10-s countdown
  for (let k = 0; k < 5; k++) await touch(stroke(cx + 50, cy - 30, -70, 6, 110, 7, 'in'), { after: 190 });
  await page.waitForTimeout(1200);
  let b = await st(); let l = await log();
  console.log('5 rapid flicks from work@24s: moved', b.i - a.i, '| toast', b.toast, JSON.stringify(b.toastText), '\n  audio:', l.audio.join(' | '));
  // Undo
  await f.evaluate(() => document.getElementById('toastUndo').click()); await page.waitForTimeout(800);
  const c = await st(); l = await log();
  console.log('Undo -> back to', c.i, '(started at', a.i + ')', 'into', c.into, '| audio:', l.audio.join(' | '));
  // flick back during rest's last 3 s
  a = await go('rest', 27); await touch(stroke(cx - 50, cy - 30, 80, 6, 120, 7, 'in')); b = await st(); l = await log();
  console.log('flick back in rest@27 ->', b.i - a.i, b.type, b.into, '| audio:', l.audio.join(' | '));
  await page.waitForTimeout(3500); l = await log(); console.log('  next 3.5 s audio:', l.audio.join(' | '));
  await h.browser.close();
})();
