---
name: retarget-site
description: Point the video generator at a different website by building a component profile for it. Use when asked to make ads for a new site, product or landing page, or when existing shots stop resolving because the target site's markup changed.
---

# Retarget the generator at a new site

Nothing site-specific lives in the camera, motion kinds, scoring or encoder.
Retargeting means writing one **site profile**: which parts of the page are
worth filming, what copy describes them, and which motions suit each.

The profile is layer 1 of the stack (see the `make-ad` skill). It supplies the
nouns; layers 2–8 — shot library, director, recorder, runtime, grade, score —
are shared and should need no edits. **If retargeting makes you want to change
`shotlib.mjs` or `record.mjs`, that is a signal the fact belongs in the profile
instead.**

A profile bundles all of this, and `--app`/`--reels`-style flags select one:

```js
export const MY_PROFILE = {
  components, affinity, topics, spine, filler, hook, signoff,
  defaultRoute: '/', defaultFormat: 'vertical', requiresAuth: false,
};
```

## 0. One profile per layout, not per site

Components are **measured, not discovered**, and almost nothing survives being
copied between layouts. This repo ships three profiles for one site: the
marketing page, the signed-in desktop app, and the signed-in mobile DOM at
540×960. The mobile layout swaps whole blocks out, so every selector and size in
the reels profile was re-read on the real page at the real capture width.

Decide the capture width first, then measure at it.

## 1. Recon the page

```bash
node src/recon.mjs https://example.com/
```

Writes `recon/sitemap.json` — every heading, button, image and section with
page-space geometry — plus full-page screenshots in `recon/shots/`.

**Look at the screenshots.** Read the JSON for selectors, but decide what to
film by eye: the strongest shots are almost always product UI mockups, not
paragraphs of copy.

## 2. Write the profile

```js
import { makeVideo } from './src/index.mjs';

await makeVideo({
  prompt: 'calm ad about the dashboard',
  url: 'https://example.com/',
  components: {
    hero:  { sel: 'h1', fallback: 'text=Welcome', theme: 'dark' },
    chart: { sel: '.dashboard-chart', captionable: true, theme: 'light',
             copy: { kicker: 'Insight', title: 'See it all at once.',
                     subtitle: 'Every metric, one screen.' } },
    cta:   { sel: 'a.signup', fallback: 'text=Get started', clickable: true },
  },
  affinity: { hero: ['pushIn', 'rackFocus'],
              chart: ['spotlight', 'pullBack', 'slideIn'],
              cta:   ['cursorClick'] },
  spine: ['hero', 'chart', 'cta'],
  topics: [{ match: /\b(chart|data|report)/i, comps: ['chart'] }],
});
```

### Component fields

| field | meaning |
| --- | --- |
| `sel` | CSS selector. A **visible** match is preferred over the first match |
| `fallback` | `text=Some words` — matches the *smallest* element starting with it |
| `climb` / `minArea` | walk up to the enclosing card when the selector hits a heading |
| `clickable` | the CTA. Gets the cursor-click payoff beat, forced near the end |
| `interactive` | the recorder **really clicks it** on camera — accordions, dropdowns |
| `route` | which page it lives on; the recorder keeps one primed tab per route |
| `captionable` | overlay a caption — only when the component's own heading is off-frame |
| `copy` | `{ kicker, title, subtitle }`, used for captions and title cards |
| `theme` | `dark` for light text (component sits on a dark/brand background) |

At least one component **must** have `clickable: true`, or the ad has no payoff.

**Never mark something `interactive` if it navigates.** A route is a long-lived
tab; following a link replaces the page under the camera for every later shot on
that route. Accordions, dropdowns and toggles are the right candidates — they
change state in place, and that state change is the shot.

### The other four lists

`components` is only half a profile. The rest decides the edit:

| list | job | failure mode if wrong |
| --- | --- | --- |
| `affinity` | which motion kinds suit each component | 44px rows get wide lateral moves that have nowhere to go |
| `topics` | prompt keywords → components | prompts about "price" don't reach the price chart |
| `spine` | the default narrative when no topic matches | the ad has no shape |
| `filler` | padding when the cast is short of beats | weak components get 2.5s each |

A profile that tells a story sets `narrative: true`. Then the spine survives
topic matching intact rather than being replaced by whatever the prompt named,
the director stops shuffling it, the click stays where the story puts it, and
all its copy counts as ad lines rather than labels. Without it, a prompt saying
"comparing prices" collapsed a seven-beat journey to the three price beats.

**Span routes.** A profile confined to one page produces ads with no journey —
they open already looking at what they end on. Give the spine the real product
experience: browse → choose → compare → decide. The recorder keeps one tab per
route, so crossing pages is nearly free.

`filler` is drawn **front-weighted**, so order it by how well each component
carries a shot on its own — and leave out anything that films badly rather than
demoting it. Padding will reach the end of the list eventually: a page with
seven strong components cannot fill a 30s cut without revisiting, and revisiting
a good component beats visiting a bad one.

### Copy is part of the profile

Avoid hardcoded numbers in `copy.title` ("Thirteen reviews, one answer") — they
go stale the moment the site's data changes and nothing catches it. Add an
`extract` function instead and write `{price}`-style tokens; a line that cannot
be filled is dropped rather than printed with a hole in it.

Write the copy as an ad, not as labels for what is on screen: problem → product
→ proof → CTA, with a beat that names the advertiser and a beat that asks for
the click. See the `make-ad` skill, which has the full checklist and the
failures that produced it.

## 3. Verify components resolve

```bash
node src/components.mjs https://example.com/
```

Exports every component as a cropped PNG plus `components/index.json`. **Open
the PNGs.** A component that exports blank or clipped will film blank or
clipped. Anything reported unresolved will have its shots silently dropped.

## 4. Check the plan, then render

```bash
node src/make.mjs "..." --url https://example.com/ --storyboard-only   # instant
node src/make.mjs "..." --url https://example.com/ --fast              # ~4x quicker
```

## Traps that cost real time

- **Responsive breakpoints.** Elements can exist at 0×0 because a utility class
  hides them at the capture width. Set the capture size above the breakpoint
  where the content you want is visible; below it there is literally nothing to
  film. Check `FORMATS` in `src/director.mjs`.
- **Two copies of the same block.** Responsive sites often ship a desktop and a
  mobile version and hide one. Resolution prefers a visible match, but verify.
- **Carousels.** Every slide can report the same rect, so a shot aimed at one
  may frame another. Exclude them from the cast.
- **Late hydration.** A section can be plain markup when you measure it and a
  carousel when you film it. On this site `.slick-track` count went 0 → 5 and
  the dashboard was still restructuring at **10.7s**, while the PDP's
  `scrollHeight` swung 3460 → 2890 → 3270 → 4027 as offers arrived. Never wait a
  fixed number of seconds; wait until text length, element count *and*
  scrollHeight all stop moving. Text alone will not catch it — hydration keeps
  the same words and rebuilds the nodes. Re-measure every component per shot,
  not once at bind time; stale rects framed a close-up of one retailer logo.
- **Reveal-on-scroll.** A priming pass scrolls the whole page first so lazy
  images decode and reveal blocks fire. Don't force `opacity:1` globally to
  "fix" hidden content — that unhides full-bleed overlays and paints the frame
  blank.
- **Full-page screenshots don't render reveal-on-scroll content.** Scroll the
  element into view and clip in viewport space instead.
- **`innerText` keeps line breaks.** A heading that wraps as "Earn a $10 Gift\n
  Card." will not match a `text=` prefix spanning the break. Keep selectors
  inside one visual line.
- **`text=` matches the *smallest* element**, often an inner span. That is what
  `climb` is for — and any minimum-size check must run *after* the climb, or it
  rejects valid element-level selectors.
- **React replaces DOM nodes on state change.** After an `interactive` click the
  original node is detached and measures 0×0. Re-register the component, then
  re-measure, and guard on both dimensions.
- **A fresh account has empty states.** Dashboards, boards and progress widgets
  film as blank grey. Either populate the test account or exclude those
  components from `spine` and `filler`.
- **Lifestyle photography does not crop.** A product tile that is a photo of a
  kitchen becomes, at 9:16 fill, a shot of a cupboard. Prefer UI, charts and
  text blocks.

## Authenticated sites

Set `requiresAuth: true` and drive the login in `src/auth.mjs`. Credentials come
from `BT_EMAIL` / `BT_PASSWORD` in the environment **only** — never a file,
storyboard, log or commit. `.auth/`, `*session.json` and `.env` are gitignored
because a storageState file is a bearer credential granting account access
without the password. `git grep` for the literals before any push.

Login forms are full of near-miss selectors: on this site the modal's email
field is `input[name=email][type=text]` while the footer newsletter field is
`type=email`, so the obvious selector fills the wrong form and the login
silently does nothing.
