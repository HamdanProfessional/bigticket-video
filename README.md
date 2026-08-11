# Big Ticket — prompt-driven video generator

Turns a text prompt into an animated, scored promo video of
[shopbigticket.com](https://shopbigticket.com/), filmed live in Chromium.

Same structure as the Pinterest piece that inspired it: the page is decomposed
into **components**, components are filmed with a **shot library**, and the shots
are assembled and **scored** — each stage is independently promptable.

```bash
npm install
npx playwright install chromium

node src/make.mjs "a warm soft ad about saving products to your boards"
node src/make.mjs "punchy 12s ad about comparing prices" --format vertical
node src/make.mjs --batch prompts.txt
```

## Formats

```bash
node src/make.mjs "warm ad for big ticket"                    # 1280×720  landscape
node src/make.mjs "warm ad for big ticket" --format vertical  # 1080×1920 reels/tiktok
node src/make.mjs "warm ad for big ticket" --format square    # 1080×1350 feed post
```

The format is also inferred from the prompt — "mobile", "reel", "tiktok",
"story", "vertical", "9:16" all select vertical; "square", "4:5", "feed post"
select square.

| format | capture | delivery | notes |
| --- | --- | --- | --- |
| `landscape` | 1440×810 @1× | 1280×720 | above the site's `xl` breakpoint |
| `vertical` | 540×960 @2× | 1080×1920 | mobile layout, no rescale |
| `square` | 540×675 @2× | 1080×1350 | mobile layout |

Vertical isn't just a crop — it films the site's **mobile** layout with a mobile
UA, picks a mobile-safe cast (the how-it-works carousel is skipped because every
slide reports the same rect), frames tighter, drops overlay captions (the mobile
headings are already in shot, so a caption would print them twice), and runs
much deeper letterbox bars. Those bars are load-bearing: the mobile layout is
short relative to 9:16, so neighbouring sections always intrude and get clipped
mid-sentence. They double as safe zones for the platform UI.

## Speed vs sharpness

The camera zooms with a CSS transform. `will-change: transform` would let
Chromium cache one rasterisation and scale that bitmap — fast, but every zoom
magnifies a stale texture and the whole video looks soft. Sharp output requires
re-rasterising per frame, which is roughly 4× slower.

Sharp is the default. `--fast` flips it back for previewing an edit:

```bash
node src/make.mjs "..." --fast      # ~4x quicker, visibly softer — previews only
```

Rough throughput for a 40s ad: sharp ≈ 18 min landscape / 13 min vertical;
`--fast` ≈ 2 min. Use `--storyboard-only` to iterate on the *edit* for free.

Output lands in `out/<slug>[-format]-<seed>/`:

| file | what it is |
| --- | --- |
| `<slug>.mp4` | H.264 + AAC at the format's delivery size, 30fps |
| `storyboard.json` | every creative decision, before rendering |
| `manifest.json` | the storyboard as actually shot (timings, resolved geometry) |
| `score.wav` | the generated music |
| `poster.jpg` | still for previewing a batch |

## Use as a library

The CLI is a thin wrapper over `src/index.mjs`, so the two can't drift apart.

```js
import { makeVideo, planVideo, FORMATS } from 'bigticket-video';

const { outPath, storyboard, manifest } = await makeVideo({
  prompt: 'a warm soft ad about saving to boards',
  format: 'vertical',          // or omit and let the prompt decide
  seed: 42,                    // reproducible
  onProgress: (f, total) => console.log(f, '/', total),
});

// Plan only — no browser, no render, instant. Iterate on the edit for free.
const sb = planVideo('punchy 12s ad about prices', { format: 'reel' });
```

`makeVideo` returns `{ outPath, posterPath, audioPath, outDir, storyboard, manifest }`.

### Retargeting another site

Nothing site-specific is baked into the camera, motion kinds, scoring or
encoder. Pass a different profile and the same machinery films a different
product:

```js
await makeVideo({
  prompt: 'calm ad about the dashboard',
  url: 'https://example.com/',
  components: {
    hero:  { sel: 'h1', fallback: 'text=Welcome', theme: 'dark' },
    chart: { sel: '.dashboard-chart', captionable: true, theme: 'light',
             copy: { kicker: 'Insight', title: 'See it all at once.' } },
    cta:   { sel: 'a.signup', fallback: 'text=Get started', clickable: true },
  },
  affinity: { hero: ['pushIn', 'rackFocus'], chart: ['spotlight', 'pullBack'], cta: ['cursorClick'] },
  spine: ['hero', 'chart', 'cta'],
  topics: [{ match: /\b(chart|data|report)/i, comps: ['chart'] }],
});
```

`node src/recon.mjs <url>` dumps the structure and geometry to write that
profile against; `node src/components.mjs` exports each component as a PNG.

Individual stages are exported too — `direct`, `record`, `renderVideo`,
`renderPoster`, plus `COMPONENTS`, `AFFINITY`, `KINDS`, `FORMATS` and the
`easing` / `rng` helpers — so you can, say, keep the director and swap the
renderer.

## Pipeline

```
prompt ──▶ director ──▶ storyboard ──▶ recorder ──▶ frames ──┐
                            │                                ├──▶ ffmpeg ──▶ mp4
                            └──▶ music spec ──▶ synth ──▶ wav ┘
```

| stage | file | role |
| --- | --- | --- |
| recon | `src/recon.mjs` | crawls the site, dumps structure + geometry to `recon/` |
| components | `src/components.mjs` | exports each component as a PNG + metadata to `components/` |
| shot library | `src/shotlib.mjs` | named components + 10 motion archetypes |
| director | `src/director.mjs` | prompt → storyboard (the only place creative choices are made) |
| camera/overlay | `src/browser/runtime.js` | injected into the live page: camera, cursor, captions, spotlight |
| recorder | `src/record.mjs` | steps the timeline frame by frame and screenshots |
| score | `src/music.py` | synthesises an original bed in the storyboard's key/tempo |
| encode | `src/render.mjs` | muxes frames + audio |

## The shot library

**Components** — the page decomposed into addressable pieces. Each resolves at
runtime by CSS selector with a `text=` fallback, so a class-name change degrades
to a dropped shot rather than a broken render.

`hero` · `heroCta` · `retailers` · `howItWorks` · `cardInstall` · `cardSave` ·
`cardCompare` · `boards` · `compare` · `pdp` · `sectionArt` · `finalCta` ·
`footer` · `logo`

**Motion kinds** — any kind can be applied to any component; `AFFINITY` limits
each component to the kinds that flatter it.

`pushIn` · `pullBack` · `panAcross` · `tiltReveal` · `hold` · `rackFocus` ·
`spotlight` · `cursorClick` · `whipTo` · `driftDiagonal` · `slideIn` ·
`pulseFocus` · `sweepReveal` · `zoomBlurIn` · `titleCard`

`cursorClick` is the "click on it" beat: a cursor arcs in, presses, and ripples
on a real button. `spotlight` dims the page and rings a component;
`pulseFocus` rings it without dimming, for beats where losing the surrounding
context would lose the story. `sweepReveal` passes a band of brand colour
across and the component is behind it when it clears. `zoomBlurIn` lands from
out of focus and oversized — the hardest punctuation in the set.

Focus borders are *drawn* around the element (SVG `stroke-dashoffset`) rather
than faded in; a line travelling the perimeter is what reads as "look here". On
`cursorClick` it completes just before the pointer lands, so it leads the eye
instead of confirming the click.

Every reel is guaranteed at least one click beat — if the weighted draw doesn't
produce one, the clickable component's shot is promoted. Its approach angle, arc
and click timing still vary per seed.

### Title cards

Cards are what separate an ad from a screen recording. Three layouts:

| layout | when |
| --- | --- |
| **side panel** (left/right, 38–44% of frame) | the default — copy takes a column, the product keeps the rest, so the film never cuts away from what it is selling |
| **lower third** (bottom band, 34% of frame) | full-bleed sections, which are too wide to leave a usable column beside them |
| **full frame** | the sign-off, and any component too large for either panel |

The step-down is decided at *record* time from measured geometry, not guessed
in the director, so it stays correct on any site. The camera cannot zoom below
the capture width without the browser's own canvas showing through, which is
what bounds how much a panel can shrink a component.

Each card is anchored to the component it introduces, so the panel slides away
onto the very thing it just described.

Four finishes, dealt from a shuffled bag so one film shows several — pin one
with `--panel`:

`ink` (deep, the default) · `brand` (violet, loud) · `paper` (dark type on
near-white) · `glass` (frosted over the live page)

Captions are set in the *site's own* typeface, read from a live heading at
runtime — an ad set in a different face to the product reads as a third-party
edit.

### Components as standalone assets

```bash
node src/components.mjs                   # → components/*.png + index.json
```

Each component is exported as a cropped 2× PNG alongside its geometry, copy,
theme and supported motion kinds. That makes a single component its own
project — extract it, animate it, score it — rather than only a beat inside a
full reel. Capture waits for each element's geometry to stabilise, because the
mockups animate in with a scale and clipping against a moving rect shaves their
edges off.

## Variability

Every creative choice is drawn from a PRNG seeded by a hash of the prompt, so the
same prompt is reproducible and different prompts diverge in cast, order, motion,
pacing, easing, transitions, and music. What varies:

- **mood** (`calm` / `premium` / `energetic` / `playful`) — detected from wording,
  and it sets shot length, easing pool, motion weights, letterbox and vignette
- **cast** — topic keywords pull components in (`boards`, `compare`, `price`,
  `extension`, `stores`, `how it works`); otherwise a spine is used, with a beat
  seeded-dropped or reordered
- **motion** — weighted by mood, never repeating the previous kind back to back
- **length** — 30s by default, plus ~8s of title cards (≈38–42s finished). `"12s"`, `"short"` (12s) or `"explainer"`/`"tutorial"` (45s) override it
- **music** — key, tempo, chord set, warmth and density follow the mood

Pin a variant with `--seed`, or override directly:

```bash
node src/make.mjs "..." --seed 42 --duration 20 --mood premium --format vertical
node src/make.mjs "..." --panel glass         # pin every card to one finish
node src/make.mjs "..." --storyboard-only     # inspect the plan, render nothing
node src/make.mjs "..." --keep-frames --no-music
```

## Finishing

Four things separate this from a screen recording with text on it:

- **Title cards.** Full-frame brand-gradient panels carrying a line of copy,
  interleaved between product beats: a hook up front, one card introducing each
  feature, and a sign-off. They're what turns a run of camera moves into an ad
  with a beginning, middle and end — and they let the shot that follows show the
  product clean, with no text over the UI. The page keeps drifting behind the
  panel, so cutting off a card lands on live motion, not a frozen frame.
  Disable with `cards: false`.


- **Kinetic type.** Titles are split into words inside `overflow:hidden` boxes,
  each rising out from behind its own mask on a stagger; the kicker wipes up, a
  rule draws left-to-right, the subtitle trails. A single fade is the clearest
  "this is a screen capture" tell, and this is what replaced it.
- **Beat-locked cutting.** Every shot is quantised to an even number of beats at
  the score's tempo, so cuts land *on* the music rather than near it. The cut
  list handed to the synth then coincides with bar lines by construction.
- **Grade.** An ffmpeg pass: gentle S-curve with the blacks lifted toward the
  brand's blue-purple, a touch of saturation and contrast, `unsharp` to recover
  what the downscale softened, vignette, and film grain — which also stops the
  large flat brand gradients from banding.

## Music

`src/music.py` synthesises the bed from scratch with numpy — no samples, no
licensing. Detuned pad voices with long cosine swells, a sub-bass an octave
down, filtered noise "air", a first-order lowpass for warmth, and FFT
convolution reverb against a synthetic decaying-noise impulse. Bell accents are
placed on the edit's cut points, so the score lands with the picture.

## How the camera works

The camera is real scroll plus a transform on `<body>`:

- **Scroll** drives vertical position, which keeps the site's own reveal-on-view
  animations behaving as they would for a real visitor.
- **The transform** adds zoom, horizontal pan, rotation and sub-pixel vertical
  offset, so motion is smooth rather than stair-stepped to integer scroll.
- **Overlays** are appended to `<html>`, not `<body>`, so the camera transform
  never scales the cursor or captions.

Frames are stepped deterministically — state is computed for frame *N*, pushed
into the page, then screenshotted — so a slow machine produces the same video as
a fast one.

## Notes on this particular site

- Feature sections are `hidden xl:flex`, so capture runs at **1440×810** (above
  Tailwind's 1280px `xl` breakpoint) and is downscaled to 720p on encode. Below
  it those components exist at 0×0 and there is nothing to film.
- The site 403s plain HTTP fetchers; recon and recording both drive a real
  browser with a desktop UA.
- A priming pass scrolls the whole page before filming so lazy images decode and
  reveal-on-view blocks fire.
- `/dashboard` is auth-gated and redirects to the landing page, so the marketing
  page is the only filmable surface.

## Retargeting another site

1. `node src/recon.mjs https://example.com/` → writes `recon/sitemap.json` and
   full-page screenshots.
2. Rewrite `COMPONENTS` in `src/shotlib.mjs` against that structure.
3. Adjust `AFFINITY`, `TOPICS` and `SPINE` in `src/director.mjs`.

The motion kinds, camera, scoring and encoding are all site-agnostic.
