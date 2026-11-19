# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Overdrive HIIT is a static, dependency-free HIIT interval timer (no framework, no bundler, no npm dependencies). It is live on GitHub Pages at https://hermannwwr-cmyk.github.io/HIIT/. The README describes the user-facing behaviour (warm-up, intensities, controls, swipe, voice coach) and the file layout.

## Commands

```sh
npm test                                   # node --test tests/*.test.js (Node 18+)
node --test --test-name-pattern "warm" tests/workout.test.js   # run matching tests only
npm run build                              # dist/overdrive-hiit.html: one self-contained file
node scripts/build.mjs out.html --fragment # same, without <html>/<head>/<body> (for hosts that add their own)
npm run serve                              # python3 -m http.server 8080
```

There is no linter or formatter. Opening `index.html` directly (file://) must keep working.

## Architecture

**Classic scripts sharing globals.** `index.html` loads `js/workout.js`, `bg.js`, `audio.js`, `figure.js` and `app.js` in that order. Each file is an IIFE that publishes one global:
- `window.HIIT`: workout logic. It is also `module.exports`, which is how the tests `require` it.
- `HIITBackdrop`: WebGL background.
- `HIITAudio`: synthesised sounds and the speech coach.
- `HIITFigure`: the Canvas 2D mannequin demo.

`app.js` is the controller that uses all of them. Keep the code ES5-style (`var`, plain functions) and module-free, so it runs from file://, from the Pages sub-path, and inlined by `build.mjs`.

**`js/workout.js` is pure data and logic, with no DOM.**
- It holds the exercise catalogue and trainer text, `LEVELS`, `WARMUP_STEPS`, the random full-body pick, and `order()` (upper body → abs → legs).
- `buildTimeline(ids, level, {warmup})` returns a flat list of segments, each with `start`, `end`, `duration` and `index`. Segment `type` is one of `warmup`, `prep`, `work`, `rest`, `jacks` or `setrest`.
- Warm-up segments also carry `lead` (seconds of lead-in before the move) and `countdown` (5, or 3 for a leg switch).
- `tests/workout.test.js` pins exact numbers: the lead values, `WARMUP_SECONDS` formatting to `'4:14'`, and session totals. So timing changes need test updates, plus the static fallback in `index.html` (`#wuTime`).

**Start flow and the coach's brief.**
- Screens: setup → brief (`#brief`) → workout (`#workout`) → done (`#done`).
- On the setup screen, `#start` calls `openBrief()`. The coach reads the plan aloud, and `#bStart` ("Start warm-up", or "Start workout" with the warm-up off) calls `startWorkout()`. `#briefBack`, Esc and browser Back return to setup.
- `HIIT.brief(tl)` in `workout.js` is a pure function. From the timeline it returns the plan (exercises, groups, level, set break, warm-up, total) and the spoken `lines: [{say, show}]`.
- `show` names the part of the screen to light while that line is spoken: `intro`, `warmup`, `exercises`, `ex:<id>`, `intervals`, `sets`, `setbreak`, `total` or `ready`. It matches elements with `data-part="…"`; `briefShow()` toggles `.on`.
- `tests/workout.test.js` pins the brief's wording rules:
  - every line ends in `.`, `!` or `?`, never a comma (each line is its own speech utterance);
  - no digits;
  - "HIIT" is written as "hit" so text-to-speech says the word;
  - a 25–41 s length.
- The welcome lives in the brief, so the warm-up opens with "Let's warm up…".
- Playwright scripts must click `#start` and then `#bStart` to reach the workout.

**`js/app.js` drives the clock in one loop.**
- The clock is `run.base` plus the time since `run.anchor`, read through `elapsedNow()`.
- `update()` runs every animation frame:
  1. finds the segment for the current time;
  2. on entering a new one, calls `enterSegment()`, which then calls `cueSegment()` for sounds and voice;
  3. calls `onSecond()` once per whole second (the last-10-second countdown and trainer calls);
  4. calls `onBeat()` for counted warm-up moves.
- `warmLead()` runs a warm-up step's lead-in: "Get ready", a spoken 5-4-3-2-1, then "Begin!". It can hold the clock by rewriting `run.base` while the coach is still speaking.
- Jumps go through `seek(t)`. Cues only fire on "natural" progress (see the `natural` and `prev` checks), so seeking never replays a whole round of sounds.
- The timer ring is the `Ring` canvas class. `Ring.layout()` writes the stage geometry as CSS custom properties (`--cy`, `--rr`, `--ph`, …) that the CSS uses to place the dial and the swipe carousel inside the ring. The opening at the bottom holds only the pause button; back and skip (0.8 of its size, never under 44 px) sit out at the sides on the same base line, `--bx` from the centre: their outer edges flush with the ring's, or further out to keep the pause's 17 px clearance from the arc, with 16 px to the stage edge for a gripping hand (the clearance gives way to 12 px first, then the ring shrinks). During the warm-up the beat-dot row stays reserved, so the ring keeps one size from move to move.
- `ring.progress` is set in `update()`. Warm-up steps get two sweeps: one for the lead-in, one for the move.
- Rest, prep and the set break switch the screen to `#workout[data-mode="rest"]`: a dial inside the ring plus an "Up next" card.

**Looks.**
- Only the "Studio" look exists. An inline script in `<head>` sets `html[data-look="studio"]` and `data-scheme="light|dark"` before first paint, following the system setting unless the user overrides it.
- `css/style.css` holds the base layout. `css/studio.css` holds everything scoped to `[data-look="studio"]`, including the compact media queries (the countdown digits size via `--dg`).
- Preferences and stats live in localStorage under `overdrive-hiit:v1`.
- Phase colours live in two places that must agree:
  - `app.js`: `PHASE`, `LOOKS[…].phase` and `.group` for light and dark, and `DARK_VARIANTS.charcoal` (the default dark scheme);
  - the CSS custom properties, e.g. `--warm-a`/`--warm-b` in `style.css` and `studio.css`.
- Current phase colours: warm-up leaf green, work coral, rest blue, jacks amber, set break mint-teal. The WARM UP and BEGIN wipes use their own deep green, passed through the `flash()` kind argument, so white text stays readable.
- The only font is Geist, loaded from Google Fonts in `index.html`.

**Audio and voice (`js/audio.js`).**
- All sounds are synthesised with Web Audio; there are no audio files.
- The coach uses `speechSynthesis`, with workarounds for phones:
  - keep a reference to each utterance until it ends;
  - cancel, then wait before speaking the next line;
  - call `resume()` before speaking;
  - unlock speech with a silent word on the first user gesture.
- `voiceWorks()` reports whether recent lines actually started; the countdown falls back to louder ticks when they didn't. `onVoiceProblem` lets the app show a notice when the viewer can't speak at all.

**Mannequin (`js/figure.js`).** It is a 3D skeleton with FK and 2-bone IK, a per-exercise camera, and one "studio" Canvas-2D renderer.
- Exercises live in the `EX` table: `period`, `cam`, draw `order`, and `pose(p)` built from keyframes.
- All instances share one `requestAnimationFrame` loop, which sleeps while no figure needs frames.
- Warm-up moves stay on the count:
  - `app.js` `warmFigOpts()` passes `setExercise(id, {time, period})` with a negative time during the lead-in, so the move is demonstrated without a break and a fresh rep starts exactly on the go. (The figure still supports `ready`, a count-in that waits in a breathing pose, but the app no longer uses it.)
  - From the countdown on, `lockFig()` glides the figure back onto the count after any hold for the coach.
  - `update()` re-syncs through `setTime(t, ease)` when the figure drifts more than 40 ms off the count. Errors up to about 150 ms glide; bigger ones snap.
- Exercise changes cross-dissolve over 0.25 s. The stage uses one body scale for every move; the setup hero and the How-to sheet use `fit: 'fill'`.
- Figure ids differ from workout ids for sided and paced warm-up moves. `app.js` `figIdFor()` and `warmFigId()` map them, e.g. `jog` → `jog-slow`/`jog-quick`, `hamstring` → `hamstring-l`/`-r`.
- `makeFig()` options:
  - setup-card thumbnails use `quality: 'low'`, which means 30 fps and thicker limbs;
  - `clear: [dx, dy, r]` keeps the thumbnail figure out from under the ⓘ badge for the whole cycle;
  - other figures take `fps` (default 60) and `maxDpr` (default 2).
- Draw order comes from each exercise's `order`. `_stOrder()` then depth-sorts the two arms, with hysteresis. Don't add phase-dependent order flips (`orderAt`); they made limbs pop in front of each other.
- Renders are not fully deterministic across sizes or machines:
  - The silhouette rim pass is skipped below 180 px, and the occlusion pass below 200 px.
  - A one-way slow-device guard drops the rim, then the occlusion pass, once frames average more than 8 ms. For pixel comparisons on a busy machine, call `HIITFigure._dev.slow(false)` first.
- Bench: `dev/figure-test.html?sheet=1&style=studio&scheme=light&material=graphite&ph=0,0.25,0.5,0.75` renders a contact sheet of every exercise. Use `&scheme=dark&material=stone&stage=charcoal` for dark.
- `tests/figure.test.js` checks for duplicate top-level function names, finite poses, no IK clamping, seamless loops and the clock.

**Test and debug hook.** `window.__hiit` exposes `run`, `ring`, `seek(t)`, `advance(sec)`, `start()`, `finish()`, `guide(id)` and `look(name)`. Changes are checked by driving `index.html` with Playwright and these hooks, often with a mocked `speechSynthesis`.

## Deploy

- `.github/workflows/pages.yml` runs `npm test` on every push to `main`, then publishes only `index.html`, `manifest.webmanifest`, `css/`, `js/` and `icons/`. Any new file the site needs must be added to that `cp` line.
- `tests/site.test.js` checks the icons and manifest against the workflow. The root-level PNGs and `q2/` are screenshots and are not published.
- `icons/*.svg` are the sources for the icons. The PNGs (favicon-32, a 180 px iPhone icon, 192, 512 and maskable 512) are pre-rendered from them and must be regenerated by hand if the SVGs change; there is no script for it in the repo.
- `scripts/build.mjs` inlines the CSS, the JS and the SVG favicon, and drops the other icon and manifest links.
