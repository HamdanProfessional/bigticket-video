---
name: make-ad
description: Generate an animated, scored advert video of a website by filming it live in Chromium. Use when asked to make an ad, promo, teaser, reel, or product video from a web page, or to re-cut an existing one (different length, mood, format, or feature focus). Handles landscape, vertical (9:16) and square (4:5).
---

# Make an ad video

Turns a prompt into a finished MP4: the page is filmed live in Chromium by a
virtual camera, cut to title cards and a procedurally generated score.

## Before you render — read this

**Rendering is slow: roughly 1 frame per second.** A 40s ad is ~1200 frames,
so ~15–20 minutes. The code is fast; the capture is not. Budget accordingly and
never re-render just to check a creative decision.

Iterate in this order:

1. `--storyboard-only` — instant, no browser. Use this for *every* question
   about the edit: which features appear, shot order, motion, pacing, music key.
2. `--fast` — ~4× quicker, visibly softer. Use to check anything *visual*
   (framing, a new motion kind, overlays).
3. Full render — only once, at the end, for delivery.

If the user is waiting, say what the render will cost in minutes before starting
it, and offer `--fast`.

## Usage

```bash
node src/make.mjs "a warm soft ad about saving products to boards"
node src/make.mjs "punchy 12s ad about comparing prices" --format vertical
node src/make.mjs "..." --seed 42 --mood premium --duration 25
node src/make.mjs "..." --panel glass      # pin card finish: ink|brand|paper|glass
node src/make.mjs "..." --storyboard-only
node src/make.mjs --batch prompts.txt
```

Or programmatically:

```js
import { makeVideo, planVideo } from './src/index.mjs';
const sb = planVideo('warm ad about boards');            // instant plan
const { outPath } = await makeVideo({ prompt: '...', format: 'vertical' });
```

## What the prompt controls

Everything is seeded from a hash of the prompt, so the same prompt is
reproducible and different prompts genuinely diverge.

| aspect | how to steer it |
| --- | --- |
| mood | "warm/calm", "premium/cinematic", "punchy/energetic", "playful" |
| length | "12s", "short", or "explainer"/"tutorial" (45s). Default 30s + cards |
| format | "mobile"/"reel"/"tiktok"/"vertical" → 9:16; "square"/"4:5" → 4:5 |
| features | "boards", "compare", "price", "extension", "stores", "how it works" |

## Structure

Ad, not explainer: hook card → hero → card → feature → card → feature →
cursor clicks the CTA → closing CTA → sign-off card. Every reel is guaranteed
at least one click beat.

If the user says it "feels like a tutorial", the cause is usually too many
feature beats and numbered step copy — shorten and cut cards, don't add motion.
If they say it's "too short" or "doesn't say enough", raise `--duration`; cards
are added on top of it.

Cards are side panels by default (copy in a column, product live beside it),
stepping down to a lower third for full-bleed sections and to full frame only
for the sign-off. That step-down happens in `record.mjs` from *measured*
geometry — if a card looks wrong, read `manifest.json` to see which layout it
actually got rather than assuming the storyboard's.

## Verifying output

Always check the result rather than assuming. Extract frames and actually look
at them:

```bash
ffmpeg -y -ss 11.5 -i out/<dir>/<name>.mp4 -frames:v 1 -vf scale=520:-1 /tmp/f.png
```

Read `out/<dir>/manifest.json` for the shot list as actually recorded — it can
differ from the storyboard, because a component that fails to resolve has its
shot dropped (a warning is printed).

## Gotchas

- Capture size is set by the site's breakpoints, not the delivery size. Don't
  override `--width`/`--height` casually; below 1280px this site's feature
  blocks are `display:none` and there is nothing to film.
- Sharpness comes from *not* setting `will-change: transform`. `--fast` turns it
  back on. Never "optimise" that back in.
- Portrait suppresses per-shot captions (the mobile layout already shows its
  headings) and uses deep letterbox bars to mask intruding sections.
- The camera must never zoom below the capture width. Under 1× the page stops
  covering the frame and the browser's own canvas shows through below and beside
  it. This is why a panel crops a wide component instead of shrinking it.
- When probing a single shot in isolation, give it a real duration. Transitions
  are 0.42s, so a 0.1s probe shot sits entirely inside a cut and comes back
  washed white — which looks exactly like a rendering bug that isn't there.
