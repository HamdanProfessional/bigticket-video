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
| all looks the same | every card cross-fades identically | card entrances: `left/right/up/down/wipe/wipeUp/fade`; panel finishes `ink/brand/paper/glass` are dealt from a shuffled bag |
| cards look cheap / generic | full-frame card replaces the product for 3s | side panel — copy in a column, product live beside it |
| a card's copy repeats the page's own headline | card anchored to the hero while the hero is on screen | cards anchor to the component they introduce |
| panel colour merges with the page | panel using the site's own brand gradient | `ink` is deliberately deeper than the brand violet |
| is blurry | `will-change: transform` caches one rasterisation and scales the bitmap | that's `--fast`; drop it for delivery |
| cuts feel arbitrary | shots not aligned to the score | durations are quantised to even beats at `mood.music.tempo` |
| shadow/highlight looks dirty | an ellipse over a rectangular component darkens corners unevenly | rounded-rect cutout via `box-shadow` spread |
| text is clipped mid-word | neighbouring sections intruding, or zoom overruns the frame | lower `fill` (zoom multiplies on top of it); check the containment guard |
| copy appears twice | overlay caption duplicating the page's own visible heading | `captionable: false`, or suppress in portrait |
| looks dated / 2019 | kicker + accent rule + filled band + bars + vignette is broadcast furniture | `--style editorial` or `--style kinetic`; both drop the furniture |
| type is small on a phone | caption sized against a landscape frame | portrait type factors in `CAPTION_LOOKS`; target ~5% of frame height |
| headline orphans its last word | default line filling | `text-wrap: balance` on `capTitle` |
| elements sit outside the frame | a pixel constant not scaled by `pxScale` | every distance in the director scales by `fmt.width / 1440` |
| a third of the frame is black | letterbox bars are `H * 0.062 * letterbox` **each** | `letterbox: 0` for non-panel styles; portrait panel caps at 0.5 |
| copy sits on nothing / unreadable | scrim only ramps under **bottom-anchored** captions | anchor bottom; `look.scrim` height and the ramp's density stops |
| a beat is visually dead | filler padding reached a weak component | reorder or remove from `FILLER`; padding is front-weighted, not uniform |
| a shot won't zoom in | containment guard capped it to fit the element | expected for anything wider than ~80% of the frame |
| **isn't advertising** | no problem stated, product never named, no CTA — it is proof dressed as a story | rewrite to problem → product → proof → CTA; the sign-off must name the brand and ask for the click |
| **isn't related to the business** | beats chosen for how well they film, not for what the company sells | audit every beat against "what is this selling?"; cut the ones that film well and say nothing |
| ad is about the demo product | hook quotes this product's price, so the ad is about a toaster | the page is the demo; the subject is the problem the product solves |
| depressing / embarrassing | arc ends on the viewer's loss ("you'd overpay by $30") | same fact as a saving; end where the viewer wins |
| **no journey — same page throughout** | spine confined to one route, or topics replaced the spine | cross routes: browse → choose → compare → reviews; set `narrative: true` so topics shade the spine instead of replacing it |
| animations come out of nowhere | motion picked before anything knew if the shot carried a line; transitions drawn at random and assigned pre-card-interleave | motion weighted by the beat's job; transitions decided on the final cut; loud effects rationed |
| effect lands mid-continuous-move | transition assigned against cast order, not final shot order | a card is anchored to its component — card-then-same-component must dissolve |
| brand name cut in half | kinetic highlights the longest non-stopword; on a logo lockup that splits the name | `hilite: false` on the sign-off |
| copy quotes a stale number | a fact hardcoded into a profile | tokens + `extract`; a line that cannot fill is dropped, never printed with a hole |
| a claim repeats two beats later | padding revisited the component and repeated its caption | claims are spoken once; the revisit keeps the motion, loses the words |

## Where each knob lives

Match the symptom to the **layer** — a fact asserted at the wrong layer is the
most common root cause here. See the `make-ad` skill for the full stack.

- **`src/sites/*.mjs`** — the component profile. What is filmable at all:
  selectors, `climb`, `route`, `clickable`/`interactive`, `copy`, plus
  `AFFINITY` (which motion kinds suit which component), `TOPICS`, `SPINE`,
  `FILLER`. Fix "the wrong things are on screen" here.
- **`src/shotlib.mjs`** — `KINDS`, the motion archetypes. Each is a pure
  `(p, ctx) → { cam, ov }` over the component's *measured* rect. Fix "the move
  is wrong" here.
- **`src/director.mjs`** — the edit. Moods (shot length, easing pool, motion
  weights, ramps, vignette, music), casting, card interleaving and `cardCap`,
  beat quantisation, graphics-package selection, the `look` block, per-shot
  params. Fix pacing, order, and how much is card vs live here.
- **`src/record.mjs`** — anything needing *real geometry*: panel step-down, the
  zoom containment guard, clicks and post-click re-registration, transitions.
- **`src/browser/runtime.js`** — how an overlay *looks*. `CAPTION_LOOKS` (the
  three graphics packages), cursor, focus ring, spotlight, scrim, letterbox,
  panel styles, glitch/flare.
- **`src/index.mjs`** — option forwarding. A director option missing from the
  whitelist here is silently ignored end to end.
- **`src/render.mjs`** — grade, grain, vignette, sharpening, fades.
- **`src/music.py`** — key, tempo, voicing, reverb, bell accents on cut points.

## Graphics packages

Reach for these before hand-tuning caption CSS — most "it looks like a template"
complaints are the package, not the copy.

| `--style` | register | use when |
| --- | --- | --- |
| `editorial` | 800 weight, 0.92 leading, ranged left on the picture, no furniture | premium, considered purchase, landscape |
| `kinetic` | 900 caps, centred, word-pop with a highlight block | Reels/TikTok, punchy, thumb-stopping |
| `panel` | kicker + rule + filled band + bars | broadcast/classic, or when a side column genuinely helps |

Omit `--style` and the director picks from prompt keywords, then format and mood
(landscape never gets centred caps; calm and premium always get editorial), then
a seeded coin flip.

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

Never report a visual fix as working without seeing a frame. **This is the
single most important rule in this repo.** Every defect worth fixing here looked
correct in the storyboard and the manifest and was only visible in a frame:
30% of the frame painted black, white type on a white page, a containment guard
silently cancelling every punch-in, 2.5s of a cupboard corner, a graphics-package
flag that was never forwarded. Three consecutive attempts at one closing frame
produced the same symptom by three different mechanisms.

```bash
ffmpeg -y -ss 11.5 -i out/<dir>/<name>.mp4 -frames:v 1 -vf scale=520:-1 /tmp/f.png
```

`manifest.json` holds the shot list *as recorded*; a component that failed to
resolve has had its shot dropped, and a card whose component is too wide for a
side panel has been stepped down to a lower third or a full frame. The finished
video can therefore differ from the storyboard.

To check card framing without a 3-minute render, film just the card shots:

```js
import { record } from './src/record.mjs';
const sb = JSON.parse(await readFile('out/<dir>/storyboard.json', 'utf8'));
const cards = sb.shots.filter((s) => s.isCard);
// Real durations — transitions are 0.42s, so a 0.1s probe shot sits entirely
// inside a cut and comes back washed white, which reads as a bug that isn't
// there. This cost me two wrong diagnoses.
await record({ ...sb, fast: true, shots: cards.map((s) => ({ ...s, duration: 1.6 })) }, 'probe');
```
