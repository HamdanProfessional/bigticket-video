---
name: make-ad
description: Generate an animated, scored advert video of a website by filming it live in Chromium. Use when asked to make an ad, promo, teaser, reel, or product video from a web page, or to re-cut an existing one (different length, mood, format, or feature focus). Handles landscape, vertical (9:16) and square (4:5).
---

# Make an ad video

Turns a prompt into a finished MP4: the page is filmed live in Chromium by a
virtual camera, cut to type, graded, and scored with a procedurally generated
track.

## Before you render — read this

**Rendering is slow: roughly 1 frame per second** (sharp landscape ~1.1–2.6 fps,
vertical ~1.8 fps at 2× DSF). A 30s vertical reel is ~885 frames, so 8–15
minutes. The JavaScript is ~3ms/frame — about 2% of the cost. The screenshot and
raster is ~185ms. **There is no JS-side optimisation available**; the only real
lever is fewer or cheaper pixels (`--fps 24` is a free 20%).

Iterate in this order:

1. `--storyboard-only` — instant, no browser. Use for *every* question about the
   edit: which components appear, shot order, motion, pacing, card share, music.
2. `--fast` — ~3× quicker, visibly softer. Use to check anything *visual*.
3. Full render — once, at the end, for delivery.

Say what a render will cost in minutes before starting it, and offer `--fast`.

## The layers

Understand these before changing anything. Each layer only knows about the one
below it, and almost every bug in this system is a fact asserted at the wrong
layer.

```
prompt
  │
  ├─ 1. site profile      src/sites/*.mjs      WHAT can be filmed
  ├─ 2. shot library      src/shotlib.mjs      HOW a thing can move
  ├─ 3. affinity          src/sites/*.mjs      WHICH moves suit WHICH thing
  ├─ 4. director          src/director.mjs     the EDIT — cast, order, timing
  ├─ 5. recorder          src/record.mjs       drives the camera, frame by frame
  ├─ 6. page runtime      src/browser/runtime.js   what the page DOES on camera
  ├─ 7. grade + encode    src/render.mjs       frames → MP4
  └─ 8. score             src/music.py         audio, on the same beat grid
```

### 1. Site profile — components

A component is the atomic unit: a named handle on one real element.

```js
specPerformance: {
  route: PDP, sel: 'text=PERFORMANCE & FEATURES', climb: 1,  // 508x44
  label: 'Performance & features', theme: 'light',
  clickable: true, interactive: true,
},
```

- `sel` + `climb` — the selector, and how far up the DOM to walk to reach the
  enclosing card. `register()` binds the name to an element **once**, up front;
  shots then refer to `specPerformance` and never re-query.
- `route` — which page it lives on. The recorder keeps one primed tab per route.
- `interactive` — the recorder really clicks it on camera. Never mark something
  that navigates: a route is a long-lived tab and following a link replaces the
  page under the camera for every later shot.
- `captionable` + `copy` — this component can carry a title card, and here is
  what it says.

Profiles: `bigticket.mjs` (marketing page), `bigticket-app.mjs` (signed-in,
desktop, multi-route), `bigticket-reels.mjs` (signed-in, mobile DOM,
element-level). Selecting one: `--app`, `--reels`, or neither.

**Components are measured, not discovered.** Every selector and size in a
profile was read off the real page at the real capture width. Nothing survives
being copied between profiles — the mobile DOM swaps whole blocks out. Use the
`retarget-site` skill to build one for a new site.

### 2. Shot library — motion kinds

Every kind is a pure function `(p, ctx) → { cam, ov }` where `p` is 0..1
progress and `ctx` carries the component's **measured rect**. It returns a camera
state and an overlay state. Nothing is hardcoded to a pixel position, which is
why the same kind works on a 508×44 spec row and a full-width hero.

```
pushIn pullBack punchIn panAcross whipTo slideIn driftDiagonal tiltReveal
rackFocus zoomBlurIn sweepReveal spotlight pulseFocus tapFocus cursorClick
hold titleCard
```

The camera is real: `window.scrollTo` plus a CSS transform on `<body>` for
zoom/pan/rotation. The overlay layer is appended to `<html>`, *not* `<body>`, so
the camera transform never scales the cursor or the type.

### 3. Affinity — which move suits which component

```js
specPerformance: ['tapFocus', 'pulseFocus', 'spotlight'],
priceChart: ['pushIn', 'pullBack', 'spotlight', 'sweepReveal', 'tiltReveal'],
```

This is what stops pairing being random. A 44px row gets taps and spotlights;
wide lateral moves have nowhere to go in 9:16 and aren't offered to narrow
elements.

### 4. Director — the edit

Produces a storyboard and nothing else. No browser, no DOM, no pixels — which is
why `--storyboard-only` is instant.

- **Cast**: prompt keywords hit `TOPICS`; otherwise the `SPINE`. Short casts are
  padded from `FILLER`, front-weighted (`rng() ** 2`), so the strongest
  components volunteer and the tail stays reachable.
- **Timing**: shot durations quantised to whole beats at the score's tempo.
- **Cards**: `cardCap` is 1 in portrait, 3 in landscape.
- **Graphics package**: `--style editorial|kinetic|panel`, else picked from
  prompt keywords, then format and mood, then a seeded coin flip.
- **Look**: letterbox, vignette, handheld, safe areas.

Everything is seeded from a hash of the prompt, so a prompt is reproducible and
different prompts genuinely diverge.

### 5. Recorder — deterministic frame stepping

For frame N: compute the state, push it into the page, screenshot. No video
capture, no timing races, perfectly reproducible.

It also owns everything that needs **real measured geometry**, because the
director never saw the page:

- panel step-down (column → lower third → full frame)
- the containment guard that caps zoom so an element stays in frame
- clicks, and re-registering the component afterwards (React replaces DOM nodes
  on toggle, so the original node is detached and reads 0×0)

`record()` is a `try/finally` around `recordInner()` so a throw can never leak a
browser. Do not unwrap that.

### 6. Page runtime — the overlay

Injected into the page. Owns the cursor, focus rings, spotlight cutout, scrim,
letterbox, wipes, flare, glitch, brand mark, and the caption system.

`CAPTION_LOOKS` holds the three graphics packages. They differ typographically,
which is what actually dates a title:

| | weight | leading | tracking | furniture |
|---|---|---|---|---|
| `panel` | 700 | 1.12 | −0.025em | kicker + rule + filled band |
| `editorial` | 800 | 0.92 | −0.042em | none, ranged left on the picture |
| `kinetic` | 900 | 0.95 caps | −0.015em | none, centred, word pop + highlight |

### 7. Grade and encode

image2 → h264 crf 18 preset slow, lanczos downscale, then curves / eq / unsharp
/ vignette / noise, and AAC audio.

### 8. Score

`music.py` synthesises in numpy on the same beat grid the director cut to — key,
mode and tempo come from the mood.

## Usage

```bash
node src/make.mjs "a warm soft ad about saving products to boards"
node src/make.mjs "punchy 12s ad about comparing prices" --format vertical
node src/make.mjs "..." --reels --seed 23 --duration 18      # IG, element-level
node src/make.mjs "..." --app                                # signed-in desktop
node src/make.mjs "..." --style editorial                    # editorial|kinetic|panel
node src/make.mjs "..." --panel glass                        # ink|brand|paper|glass
node src/make.mjs "..." --seed 42 --mood premium --duration 25
node src/make.mjs "..." --storyboard-only
node src/make.mjs --batch prompts.txt
```

`--app` and `--reels` film the signed-in app and need `BT_EMAIL` / `BT_PASSWORD`
in the environment. **Never** write credentials into a file, storyboard, log or
commit; `.auth/`, `*session.json` and `.env` are gitignored because a
storageState file is a bearer credential. Scan with `git grep` before any push.

Programmatically:

```js
import { makeVideo, planVideo } from './src/index.mjs';
const sb = planVideo('warm ad about boards');            // instant plan
const { outPath } = await makeVideo({ prompt: '...', format: 'vertical' });
```

Note `makeVideo` forwards director options by **explicit whitelist**. A new
option added to the director must be added there too, or it is silently ignored.

## What the prompt controls

| aspect | how to steer it |
| --- | --- |
| mood | "warm/calm", "premium/cinematic", "punchy/energetic", "playful" |
| length | "12s", "short", or "explainer"/"tutorial" (45s). Default 30s + cards |
| format | "mobile"/"reel"/"tiktok"/"vertical" → 9:16; "square"/"4:5" → 4:5 |
| style | "kinetic/punchy/hype" → kinetic; "editorial/minimal/premium" → editorial |
| features | "boards", "compare", "price", "specs", "reviews", "referral" |

## Structure

Ad, not explainer: hook card → live beat → card → feature → feature → click →
sign-off. The click beat is the payoff and belongs near the end; left where a
shuffle put it the ad peaks in the middle.

If it "feels like a tutorial", the cause is too many feature beats and step copy
— shorten and cut cards, don't add motion. If it's "too short", raise
`--duration`; cards are added on top of it.

## Verifying output

**Extract frames and look at them.** This is not optional. Nearly every defect
found in this system looked correct in the storyboard and the manifest, and was
only visible in a frame: 30% of the frame painted black, white type on a white
page, a zoom guard silently cancelling every punch-in, a 2.5s shot of a cupboard
corner. Three consecutive attempts at one closing frame produced the same
symptom by three different mechanisms.

```bash
ffmpeg -y -ss 11.5 -i out/<dir>/<name>.mp4 -frames:v 1 -vf scale=405:-1 f.png
```

Read `out/<dir>/manifest.json` for the shot list **as actually recorded** — it
differs from the storyboard when a component fails to resolve and its shot is
dropped. Read `storyboard.json`'s `look` block to confirm which graphics package
and grade actually applied.

## Gotchas

- Capture size is set by the site's breakpoints, not the delivery size. Below
  1280px this site's desktop feature blocks are `display:none`.
- Sharpness comes from *not* setting `will-change: transform`. `--fast` turns it
  back on. Never "optimise" that back in. A CDP-screenshot rewrite was also
  tried: 22% faster in a synthetic loop, 0.1% on the real camera path.
- The camera must never zoom below 1×. Under the capture width the page stops
  covering the frame and the browser's own canvas shows through. This is why a
  panel crops a wide component instead of shrinking it.
- Every pixel constant in the director is scaled by `pxScale = fmt.width / 1440`.
  A magnitude that reads as a flourish in landscape is a third of a vertical
  frame. Adding an unscaled constant is the single most repeated bug here.
- A component wider than ~80% of the frame cannot be punched into without
  cropping its own content. The spotlight does the focusing instead.
- Selectors must stay inside **one visual line**. `innerText` keeps the wrap, so
  a `text=` prefix spanning a line break matches nothing.
- `text=` picks the *smallest* match, often an inner span. That is why `climb`
  exists, and why the size check runs after the climb.
- When probing a single shot, give it a real duration. Transitions are 0.42s, so
  a 0.1s probe sits entirely inside a cut and comes back washed white — which
  looks exactly like a rendering bug that isn't there.
- `tween()` returns its `to` value when `end <= start`. Pushing a fade window
  out of range to "disable" it returns 0 immediately and blanks the element.
- Check that a profile actually defines a component before the director splices
  it into a cast by name. Profiles do not share component names.
