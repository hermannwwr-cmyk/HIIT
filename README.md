# Overdrive HIIT

A full-body HIIT interval timer with a neon arcade look and a built-in personal trainer: a WebGL warp-tunnel backdrop that changes with each phase, glowing animated exercise demos, a ring timer that sheds sparks, step-by-step form guides, and synthesised sound cues with a spoken coach.

No framework, no dependencies, no build step. Open `index.html` in a browser, or serve the folder:

```sh
npm run serve        # python3 -m http.server 8080, then open http://localhost:8080
```

## Looks

The default is **Automatic**: the Studio look in light or dark to match the phone's system theme, switching live if the phone changes (even mid-workout). Pick a fixed look from the appearance button (◐) in the top bar; that choice is remembered on the device. `?look=auto|studio-dark|studio-light|neon` in the URL overrides it for that visit only.

- **Neon:** a warp-tunnel backdrop, glowing light-trail athlete, sparks and glitch type.
- **Studio dark / Studio light:** clean and quiet.
  - **Backdrop:** a graphite or warm-paper studio with a soft spotlight.
  - **Athlete:** a matte 3D mannequin with contact shadows.
  - **Type:** Geist, with one coral accent.
  - **Timer:** an Apple-style ring with thin oversized digits.
  - **Phase colour:** appears only on the ring, the phase chip and the progress bar. During jumping jacks the ring turns into beads, so the phase reads without colour.
  - **Finish:** a ring sweeps closed around the athlete.

## Workouts

| Exercise | Group |
| --- | --- |
| Push Ups | Upper body |
| Crunches | Abs |
| Leg Raises | Abs |
| Flutter Kicks | Abs |
| Russian Twists | Abs |
| Squats | Legs |
| Lunges | Legs |

- Every session starts with **5 random exercises** that always include at least one upper-body, one abs and one legs exercise. The order is shuffled so the same muscle group rarely comes twice in a row.
- Change the count with **− / +** (3 to 7). The app adds or drops exercises while keeping the full-body mix.
- Tap any exercise to add or remove it. The numbered badges show the order they run in. **Start** stays locked until upper body, abs and legs are all covered.
- **Shuffle** rolls a new random set at the current count.

### Intensity

| Level | Each exercise | Then | Sets | Between sets |
| --- | --- | --- | --- | --- |
| Easy | 30 s | 30 s rest | 3 | 5:00 rest |
| Medium | 30 s | 30 s jumping jacks | 2 | 5:00 rest |

Every session opens with a 10 s get-ready countdown. On Easy the 5-minute set break replaces the rest after the last exercise of a set, and the very last rest is dropped. On Medium every exercise is followed by jumping jacks, then the set break. A 5-exercise session is 23:40 on Easy and 15:10 on Medium.

### Personal trainer

- **Trainer's guide** for every exercise (tap ⓘ on a card, the preview label, or **How to** mid-workout): live animated demo, numbered steps, breathing, mistakes to avoid, and easier / harder versions. The workout timer pauses while the guide is open.
- **On-screen coaching** rotates form cues during each exercise and walks you through the next exercise's steps while you rest.
- **Voice coach** announces each exercise, gives a form cue at 20 s left, calls out 10 seconds, and says what's next. During the set break it checks in at 4, 3, 2 and 1 minute, 30 s and 10 s.
- **Set break** shows a breathing pacer (4 s in, 6 s out), recovery tips, and previews the first exercise of the next set for the last 30 s.

### Always-visible timing

- Top bar: time elapsed, current set, time left in the session.
- Big countdown labelled for what it counts down to: *Time left*, *Next exercise in*, *Set 2 starts in*.
- *Next: Squats in 0:58* line during every exercise, so you always know what's coming and when.
- **Start now** (or **Start set 2**) jumps straight to the next exercise from get-ready, rest or the set break.
- The ring shows the current interval; the thin inner arc shows the whole session. The last three seconds of every interval beep and flash.
- The finish screen shows total time, time spent on each exercise, and your workouts and day streak on this device.

### Controls

| Action | Button | Key |
| --- | --- | --- |
| Pause / resume | centre button | Space |
| Next interval | ⏭ | → |
| Previous interval (or restart the current one) | ⏮ | ← |
| End workout | ✕ | Esc |

The screen is kept awake during a workout where the browser supports the Wake Lock API, and phones vibrate on each phase change.

## Project layout

```
index.html          markup for the three screens (setup, workout, done)
css/style.css       base (Neon) styling; phase colours are CSS custom properties
css/studio.css      Studio look, scoped to html[data-look="studio"] (dark/light via data-scheme)
js/workout.js       pure workout logic: catalogue + trainer content, random full-body pick, timeline
js/app.js           UI controller, timer engine, ring timer, particles
js/figure.js        Canvas 2D athlete that demonstrates each exercise (neon or studio mannequin)
js/bg.js            WebGL backdrop shaders (neon tunnel, studio lighting)
js/audio.js         Web Audio sound effects and speechSynthesis voice coach
tests/              node:test unit tests for workout.js
dev/figure-test.html  gallery of every exercise animation for checking the figures
scripts/build.mjs   bundles everything into one HTML file in dist/
```

```sh
npm test             # unit tests (Node 18+)
npm run build        # dist/overdrive-hiit.html, a single self-contained file
```

Settings (look, intensity, sound, voice), completed workouts, total minutes and the day streak are kept in `localStorage` on the device.
