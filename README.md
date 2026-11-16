# Overdrive HIIT

A full-body HIIT interval timer with a neon arcade look: a WebGL warp-tunnel backdrop that changes with each phase, glowing animated exercise demos, a ring timer that sheds sparks, and synthesised sound cues with an optional voice coach.

No framework, no dependencies, no build step. Open `index.html` in a browser, or serve the folder:

```sh
npm run serve        # python3 -m http.server 8080, then open http://localhost:8080
```

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

| Level | Each exercise | Then | Sets |
| --- | --- | --- | --- |
| Easy | 30 s | 30 s rest | 3 |
| Medium | 30 s | 30 s jumping jacks | 2 |

Every session opens with a 10 s get-ready countdown. Easy skips the rest after the very last exercise; Medium keeps the final jumping jacks. A 5-exercise session is 14:40 on Easy and 10:10 on Medium.

During rest the stage previews the next exercise. The last three seconds of every interval beep, and the voice coach announces each exercise, the halfway point and what's next.

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
css/style.css       all styling; phase colours are CSS custom properties
js/workout.js       pure workout logic: catalogue, random full-body pick, timeline
js/app.js           UI controller, timer engine, ring timer, particles
js/figure.js        Canvas 2D neon athlete that demonstrates each exercise
js/bg.js            WebGL backdrop shader
js/audio.js         Web Audio sound effects and speechSynthesis voice coach
tests/              node:test unit tests for workout.js
scripts/build.mjs   bundles everything into one HTML file in dist/
```

```sh
npm test             # unit tests (Node 18+)
npm run build        # dist/overdrive-hiit.html, a single self-contained file
```

Settings (intensity, sound, voice) and the completed-workout count are kept in `localStorage` on the device.
