---
name: tune-ad-edit
description: Diagnose and fix how a generated ad feels — pacing, shot variety, framing, captions, music, or "it looks like a screen recording / a tutorial / a template". Use when reviewing a rendered video and deciding what to change, before spending 15+ minutes on another render.
---

# Tune the edit

Almost every complaint about a generated ad maps to a specific knob. Find the
knob, change it, and confirm with `--storyboard-only` (instant) or `--fast`
(~4× quicker) — **not** a full render.

## Symptom → cause

| "It..." | Actual cause | Fix |
| --- | --- | --- |
| feels like a tutorial | too many feature beats; numbered "Step one/two" copy | shorten `--duration`; rewrite kickers as benefits |
| is too short / says nothing | 15s only names one feature | raise `--duration`; title cards add ~8s on top |
| looks like a screen recording | no cards, captions fading as one block | title cards + kinetic type are what fix this |
| all looks the same | every card cross-fades identically | card entrances: `left/right/up/down/wipe/wipeUp/fade` |
| is blurry | `will-change: transform` caches one rasterisation and scales the bitmap | that's `--fast`; drop it for delivery |
| cuts feel arbitrary | shots not aligned to the score | durations are quantised to even beats at `mood.music.tempo` |
| shadow/highlight looks dirty | an ellipse over a rectangular component darkens corners unevenly | rounded-rect cutout via `box-shadow` spread |
| text is clipped mid-word | neighbouring sections intruding, or zoom overruns the frame | deeper letterbox bars; lower `fill` (zoom multiplies on top of it) |
| copy appears twice | overlay caption duplicating the page's own visible heading | `captionable: false`, or suppress in portrait |

## Where each knob lives

- **`src/director.mjs`** — everything creative. Moods (shot length, easing pool,
  motion weights, letterbox, vignette, music), `TOPICS`, `SPINE`, card
  interleaving, beat quantisation, per-shot params.
- **`src/shotlib.mjs`** — `COMPONENTS` (what is filmable) and `KINDS` (motion
  archetypes); `AFFINITY` restricts which kinds suit which component.
- **`src/browser/runtime.js`** — camera, cursor, captions, spotlight, panel,
  letterbox. Anything about how an overlay *looks*.
- **`src/render.mjs`** — grade, grain, vignette, sharpening, fades.
- **`src/music.py`** — key, tempo, voicing, reverb, bell accents on cut points.

## Method

1. Reproduce with a seed: `--seed N` makes it deterministic.
2. `--storyboard-only` and read the shot list. Most "feel" problems are visible
   there — repeated components, one motion kind dominating, no click beat.
3. Check the *distribution*, not one sample. A single seed is a bad witness:

```js
import { planVideo } from './src/index.mjs';
const counts = {};
for (let s = 0; s < 300; s++)
  for (const sh of planVideo('warm ad', { seed: s }).shots)
    counts[sh.kind] = (counts[sh.kind] || 0) + 1;
console.log(counts);
```

4. Only then render, and prefer `--fast` unless it's the delivery cut.

## Verify by looking

Never report a visual fix as working without seeing a frame:

```bash
ffmpeg -y -ss 11.5 -i out/<dir>/<name>.mp4 -frames:v 1 -vf scale=520:-1 /tmp/f.png
```

`manifest.json` holds the shot list *as recorded*; a component that failed to
resolve has had its shot dropped, so the finished video can differ from the
storyboard.
