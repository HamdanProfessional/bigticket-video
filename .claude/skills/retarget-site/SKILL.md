---
name: retarget-site
description: Point the video generator at a different website by building a component profile for it. Use when asked to make ads for a new site, product or landing page, or when existing shots stop resolving because the target site's markup changed.
---

# Retarget the generator at a new site

Nothing site-specific lives in the camera, motion kinds, scoring or encoder.
Retargeting means writing one **site profile**: which parts of the page are
worth filming, what copy describes them, and which motions suit each.

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
| `captionable` | overlay a caption — only when the component's own heading is off-frame |
| `copy` | `{ kicker, title, subtitle }`, used for captions and title cards |
| `theme` | `dark` for light text (component sits on a dark/brand background) |

At least one component **must** have `clickable: true`, or the ad has no payoff.

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
- **Reveal-on-scroll.** A priming pass scrolls the whole page first so lazy
  images decode and reveal blocks fire. Don't force `opacity:1` globally to
  "fix" hidden content — that unhides full-bleed overlays and paints the frame
  blank.
- **Full-page screenshots don't render reveal-on-scroll content.** Scroll the
  element into view and clip in viewport space instead.
