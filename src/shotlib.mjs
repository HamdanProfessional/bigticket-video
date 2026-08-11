// The shot library.
//
// COMPONENTS: the page decomposed into named, addressable pieces (derived from
// recon/sitemap.json). Selectors are runtime-resolved with a text= fallback so
// a class-name change doesn't break the whole reel.
//
// KINDS: motion archetypes. Any kind can be applied to any component, which is
// where the variability comes from — the director picks pairings per prompt.

import { tween, ease, lerp, clamp01 } from './lib/easing.mjs';

export const COMPONENTS = {
  logo: {
    sel: 'header img, header a img, a[href="/"] img',
    fallback: 'text=big ticket',
    label: 'Logo',
    theme: 'light',
  },
  hero: {
    sel: 'h1',
    fallback: 'text=Buy once',
    label: 'Hero headline',
    theme: 'dark', // sits on the purple gradient
    copy: { kicker: 'Big Ticket', title: 'Buy once. Buy well.', subtitle: 'Save as you browse, compare easily.' },
  },
  heroCta: {
    sel: 'main button, main a[class*="button"]',
    fallback: 'text=Add to Chrome',
    label: 'Hero CTA',
    theme: 'dark',
    clickable: true,
  },
  retailers: {
    minArea: 90000,
    sel: 'h2',
    fallback: 'text=Big Ticket works across',
    label: 'Retailer strip',
    theme: 'light',
    copy: { kicker: 'Works everywhere', title: 'The stores you already browse.', subtitle: 'Best Buy, Target, Macy’s, Walmart, Nordstrom, Williams Sonoma, Amazon.' },
  },
  howItWorks: {
    minArea: 26000,
    sel: null,
    fallback: 'text=How it works',
    label: 'How it works card',
    theme: 'light',
    copy: { kicker: 'How it works', title: 'Three steps. No tabs.', subtitle: 'Discover, organize, and compare products in seconds.' },
  },
  cardInstall: {
    minArea: 26000,
    sel: null,
    fallback: 'text=Install the Big Ticket',
    label: 'Install card',
    theme: 'light',
    copy: { kicker: 'One click', title: 'Install the extension.', subtitle: 'You’ll wonder how you shopped without it.' },
  },
  cardSave: {
    minArea: 26000,
    sel: null,
    fallback: 'text=Save as you browse',
    label: 'Save card',
    theme: 'light',
    copy: { kicker: 'Anywhere you shop', title: 'Save as you browse.', subtitle: 'Everything you love, in one place.' },
  },
  cardCompare: {
    minArea: 26000,
    sel: null,
    fallback: 'text=Compare. Decide.',
    label: 'Compare card',
    theme: 'light',
    copy: { kicker: 'No more tabs', title: 'Compare. Decide. Done.', subtitle: 'No second-guessing.' },
  },
  boards: {
    captionable: true,
    sel: 'img[alt="My Boards"]',
    fallback: 'text=Found it. Saved it',
    label: 'Boards UI',
    theme: 'light',
    copy: { kicker: 'Boards', title: 'Found it. Saved it.', subtitle: 'On your board, ready when you are.' },
  },
  compare: {
    captionable: true,
    sel: 'img[alt="Comparison"]',
    fallback: 'text=Your shortlist',
    label: 'Comparison UI',
    theme: 'light',
    copy: { kicker: 'Compare', title: 'Your shortlist, actually compared.', subtitle: 'Specs and prices, side by side.' },
  },
  pdp: {
    captionable: true,
    sel: 'img[alt="Product Detail Page"]',
    fallback: 'text=Same product',
    label: 'Product detail UI',
    theme: 'light',
    copy: { kicker: 'Price', title: 'Same product. Better price.', subtitle: 'Catch the drop before you buy.' },
  },
  sectionArt: {
    sel: 'img[alt="Section"]',
    fallback: null,
    label: 'Section artwork',
    theme: 'light',
  },
  finalCta: {
    minArea: 60000,
    sel: null,
    fallback: 'text=Built for better decisions',
    label: 'Closing CTA',
    theme: 'light',
    copy: { kicker: 'Join Big Ticket', title: 'Built for better decisions.', subtitle: 'Add to Chrome — it’s free.' },
  },
  footer: { sel: 'footer', fallback: null, label: 'Footer', theme: 'dark' },
};

// ---------------------------------------------------------------- framing

// Zoom that makes `rect` fill `fill` of the viewport, clamped to sane cinema.
export function fitZoom(rect, vw, vh, fill = 0.8) {
  if (!rect || !rect.w || !rect.h) return 1;
  const z = Math.min((vw * fill) / rect.w, (vh * fill) / rect.h);
  return Math.max(0.85, Math.min(z, 2.6));
}

// Camera that centres `rect` in frame at `zoom`.
//
// Vertical centring comes from scroll (cam.y). Horizontal has no scroll to use,
// and scaling about the element's own centre leaves it wherever it already sat
// on the page — so the base panX actively slides it to the middle of frame.
// Motion kinds ADD to panX rather than assigning it.
export function frameOn(rect, vw, vh, zoom, biasY = 0) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return {
    y: cy - vh / 2 + biasY,
    originX: cx,
    originY: cy + biasY,
    panX: vw / 2 - cx,
    zoom,
  };
}

// -------------------------------------------------------------- shot kinds
// Each kind returns { cam, ov } for a normalised time p in 0..1.
// ctx = { rect, vw, vh, zBase, p: params, comp }

export const KINDS = {
  // Slow cinematic push toward the component.
  pushIn(p, ctx) {
    const { rect, vw, vh, zBase } = ctx;
    const z = tween(p, 0, 1, zBase * (ctx.p.from ?? 0.86), zBase * (ctx.p.to ?? 1.06), ctx.p.easing || 'smoother');
    const cam = frameOn(rect, vw, vh, z, tween(p, 0, 1, ctx.p.driftY ?? 18, 0, 'smoother'));
    return { cam, ov: {} };
  },

  // Starts tight and opens up — good for revealing context around a detail.
  pullBack(p, ctx) {
    const { rect, vw, vh, zBase } = ctx;
    const z = tween(p, 0, 1, zBase * (ctx.p.from ?? 1.35), zBase * (ctx.p.to ?? 0.92), ctx.p.easing || 'easeOutQuint');
    return { cam: frameOn(rect, vw, vh, z), ov: {} };
  },

  // Lateral drift across a wide component (retailer logo strip, card rows).
  panAcross(p, ctx) {
    const { rect, vw, vh, zBase } = ctx;
    const dist = ctx.p.distance ?? Math.min(280, rect.w * 0.35);
    const dir = ctx.p.dir === 'left' ? -1 : 1;
    const z = zBase * (ctx.p.zoom ?? 1.08);
    const cam = frameOn(rect, vw, vh, z);
    cam.panX += tween(p, 0, 1, dir * dist * 0.5, -dir * dist * 0.5, ctx.p.easing || 'smoother');
    return { cam, ov: {} };
  },

  // Vertical travel — the scroll shot, but eased instead of linear.
  tiltReveal(p, ctx) {
    const { rect, vw, vh, zBase } = ctx;
    const span = ctx.p.distance ?? Math.max(220, rect.h * 0.7);
    const dir = ctx.p.dir === 'up' ? -1 : 1;
    const z = zBase * (ctx.p.zoom ?? 1.0);
    const base = frameOn(rect, vw, vh, z);
    base.y += tween(p, 0, 1, -dir * span * 0.5, dir * span * 0.5, ctx.p.easing || 'smoother');
    return { cam: base, ov: {} };
  },

  // Near-static beat with a breathing drift, so nothing ever feels frozen.
  hold(p, ctx) {
    const { rect, vw, vh, zBase } = ctx;
    const z = zBase * (1 + Math.sin(p * Math.PI) * 0.018);
    const cam = frameOn(rect, vw, vh, z, Math.sin(p * Math.PI * 2) * 5);
    return { cam, ov: {} };
  },

  // Blur resolves into sharpness — a soft "attention lands here" beat.
  rackFocus(p, ctx) {
    const { rect, vw, vh, zBase } = ctx;
    const z = tween(p, 0, 1, zBase * 0.97, zBase * 1.05, 'smoother');
    const cam = frameOn(rect, vw, vh, z);
    cam.blur = tween(p, 0, 0.42, ctx.p.blur ?? 9, 0, 'easeOut');
    cam.saturate = tween(p, 0, 0.5, 0.72, 1, 'smooth');
    return { cam, ov: {} };
  },

  // Dim the page, ring the component: the literal "this is the feature" shot.
  spotlight(p, ctx) {
    const { rect, vw, vh, zBase, comp } = ctx;
    const z = tween(p, 0, 1, zBase * 0.98, zBase * 1.1, 'smoother');
    const cam = frameOn(rect, vw, vh, z);
    const on = Math.min(tween(p, 0.06, 0.3, 0, 1, 'easeOut'), tween(p, 0.82, 1, 1, 0, 'easeIn'));
    return {
      cam,
      ov: {
        spotlight: { sel: comp.selResolved, opacity: on, pad: ctx.p.pad ?? 44, strength: ctx.p.strength ?? 0.55 },
        // The border is DRAWN around the component rather than faded in — a
        // line travelling the perimeter is what actually reads as "look here".
        highlight: {
          sel: comp.selResolved, opacity: on,
          pad: ctx.p.pad ?? 14, radius: ctx.p.radius ?? 18,
          width: ctx.p.ringWidth ?? 3,
          draw: tween(p, 0.08, 0.52, 0, 1, 'easeOutQuint'),
        },
      },
    };
  },

  // Cursor travels in on an arc, presses, ripples. The "click on it" beat.
  cursorClick(p, ctx) {
    const { rect, vw, vh, zBase, comp } = ctx;
    const z = tween(p, 0, 1, zBase * 0.94, zBase * 1.08, 'smoother');
    const cam = frameOn(rect, vw, vh, z);

    const CLICK_AT = ctx.p.clickAt ?? 0.62;
    const raw = Math.min(1, p / CLICK_AT);
    const travel = ease('easeOutQuint', raw);
    // Approach from an off-centre corner with a slight arc so it reads human.
    const sx = (ctx.p.fromX ?? 0.72) * vw - vw / 2;
    const sy = (ctx.p.fromY ?? 0.85) * vh - vh / 2;

    // Nobody lands a mouse exactly on target in one motion. Real pointing
    // overshoots slightly and pulls back — Fitts's law in miniature — and
    // trembles a little on the way. Without this the cursor glides like a
    // machine, which is the giveaway even when everything else looks right.
    const overshoot = Math.sin(Math.min(1, raw / 0.82) * Math.PI) * (ctx.p.overshoot ?? 13);
    const settle = raw > 0.82 ? 1 - ease('easeOutQuint', (raw - 0.82) / 0.18) : 1;
    const tremor = (1 - travel) * 1.8;
    const jx = Math.sin(p * 37 + 1.3) * tremor;
    const jy = Math.cos(p * 31 + 0.7) * tremor;

    const dx = lerp(sx, 0, travel) - overshoot * settle * 0.55 + jx;
    const dy = lerp(sy, 0, travel) - Math.sin(travel * Math.PI) * (ctx.p.arc ?? 46)
             - overshoot * settle * 0.35 + jy;

    const sincePress = (p - CLICK_AT) / 0.1;
    const press = p < CLICK_AT ? 0 : Math.max(0, 1 - Math.abs(sincePress - 0.4) * 2.2);
    const ripple = p < CLICK_AT ? 0 : Math.min(1, Math.max(0, (p - CLICK_AT) / 0.3));

    const ringOn = Math.min(tween(p, 0.1, 0.35, 0, 1, 'easeOut'), tween(p, 0.86, 1, 1, 0, 'easeIn'));
    return {
      cam,
      ov: {
        cursor: { sel: comp.selResolved, dx, dy, opacity: tween(p, 0, 0.12, 0, 1, 'easeOut'), press, ripple },
        // Draws in just ahead of the cursor arriving, so the border leads the
        // eye to the target rather than appearing after the click.
        highlight: {
          sel: comp.selResolved, opacity: ringOn * 0.9, pad: 8,
          radius: ctx.p.radius ?? 28, width: ctx.p.ringWidth ?? 2.5,
          draw: tween(p, 0.12, 0.5, 0, 1, 'easeOutQuint'),
        },
      },
    };
  },

  // Fast, motion-blurred move that lands hard — punctuation between calm beats.
  whipTo(p, ctx) {
    const { rect, vw, vh, zBase } = ctx;
    const z = tween(p, 0, 0.55, zBase * 1.3, zBase, 'easeOutQuint');
    const cam = frameOn(rect, vw, vh, z);
    const dir = ctx.p.dir === 'left' ? -1 : 1;
    cam.panX += tween(p, 0, 0.45, dir * (ctx.p.distance ?? 420), 0, 'easeOutQuint');
    cam.blur = tween(p, 0, 0.4, ctx.p.blur ?? 12, 0, 'easeOut');
    return { cam, ov: {} };
  },

  // Full-frame branded card carrying a line of copy. The page keeps drifting
  // behind it, so cutting off the card lands on live motion rather than a
  // static frame. This is the beat that makes the film read as an ad rather
  // than a screen recording.
  titleCard(p, ctx) {
    const { rect, vw, vh, zBase } = ctx;

    // Side panel: the copy takes a column and the product keeps the rest of the
    // frame, so the film never cuts away from the thing it is selling.
    const side = ctx.p.side || null;
    const frac = ctx.p.panelWidth ?? 0.42;

    // `zBase` fits the component to the WHOLE frame; with a panel it only has
    // the free area, so the fit is scaled down to match. Never below 1x though:
    // under the capture width the page stops covering the frame and the
    // browser's own canvas shows through beside and below it — measured, not
    // assumed. A component too wide for the free area is cropped by the panel
    // instead, which is the lesser fault.
    const band = side === 'bottom';
    const zFit = side ? Math.max(1, zBase * (1 - frac)) : zBase;
    const z = tween(p, 0, 1, zFit * 1.04, zFit * 1.14, 'linear');
    // A lower third eats the bottom of the frame, so the component is lifted
    // into the space above it rather than slid sideways.
    const cam = frameOn(rect, vw, vh, z, band ? (frac / 2) * vh : 0);

    if (side && !band) {
      // frameOn centres the component; we want it centred in the free column
      // instead. A component too wide to fit there can only be slid so far
      // before its far edge leaves the frame — past that point the panel simply
      // overlaps it, which crops the component rather than the page, and is
      // what a real ad does anyway.
      const half = (rect.w * z) / 2;
      const want = side === 'left' ? vw * (1 + frac) / 2 : vw * (1 - frac) / 2;
      const limit = side === 'left' ? vw - half : half;
      const centre = side === 'left'
        ? Math.max(vw / 2, Math.min(want, limit))
        : Math.min(vw / 2, Math.max(want, limit));
      cam.panX += centre - vw / 2;
    }

    // Cards that all cross-fade identically are why a reel reads as a template.
    // The director assigns each one an entrance, so the same storyboard shape
    // still produces a different-feeling film. A side panel always enters from
    // its own edge — anything else and it reads as arriving from nowhere.
    const enter = side || ctx.p.enter || 'fade';
    const IN = 0.22;      // panel is fully in place before the type starts
    const t = ease('easeOutQuint', Math.min(1, p / IN));
    // Mid-film cards dissolve out so the hand-off back to live footage is soft.
    // The CLOSING card must not: fading it left the sign-off copy floating
    // half-transparent over the page for the last half second, so the most
    // important frame in the ad was also its least legible one.
    const out = ctx.p.holdOut ? 1 : tween(p, 0.82, 1, 1, 0, 'easeIn');

    const panel = { opacity: 1, side, width: frac, style: ctx.p.panelStyle || 'ink' };
    switch (enter) {
      case 'left':  panel.dx = (t - 1) * 100; break;      // in from screen-left
      case 'right': panel.dx = (1 - t) * 100; break;
      case 'bottom': panel.dy = (1 - t) * 100; break;     // band rises into place
      case 'up':    panel.dy = (1 - t) * 100; break;      // in from below
      case 'down':  panel.dy = (t - 1) * 100; break;
      case 'wipe':  panel.clip = `inset(0 ${((1 - t) * 100).toFixed(2)}% 0 0)`; break;
      case 'wipeUp':panel.clip = `inset(${((1 - t) * 100).toFixed(2)}% 0 0 0)`; break;
      default:      panel.opacity = tween(p, 0, 0.16, 0, 1, 'easeOut');
    }
    // Everything leaves on a dissolve so the hand-off to live footage is soft.
    panel.opacity = Math.min(panel.opacity, out);

    // A full-frame card is its own image and wants no vignette; a side panel
    // still has live product beside it, which should be graded like any shot.
    return { cam, ov: side ? { panel } : { panel, vignette: 0 } };
  },

  // Camera arrives from one side and settles — the "some come from left/right,
  // some from the bottom" beat. Distinct from panAcross, which drifts THROUGH a
  // component; this one lands on it.
  slideIn(p, ctx) {
    const { rect, vw, vh, zBase } = ctx;
    const z = tween(p, 0, 1, zBase * 1.1, zBase * 1.0, 'easeOutQuint');
    const cam = frameOn(rect, vw, vh, z);
    const d = ctx.p.distance ?? 340;
    const settle = ease('easeOutQuint', Math.min(1, p / 0.55));
    switch (ctx.p.fromSide || 'left') {
      case 'right':  cam.panX += (1 - settle) * -d; break;
      case 'bottom': cam.y += (1 - settle) * d * 0.7; break;
      case 'top':    cam.y -= (1 - settle) * d * 0.7; break;
      default:       cam.panX += (1 - settle) * d;
    }
    return { cam, ov: {} };
  },

  // Slow diagonal glide — the most "ambient" kind, good under long captions.
  driftDiagonal(p, ctx) {
    const { rect, vw, vh, zBase } = ctx;
    const z = tween(p, 0, 1, zBase * 1.02, zBase * 1.12, 'linear');
    const cam = frameOn(rect, vw, vh, z);
    cam.panX += tween(p, 0, 1, (ctx.p.dir === 'left' ? 1 : -1) * 70, 0, 'smoother');
    cam.y += tween(p, 0, 1, 60, -60, 'smoother');
    cam.rot = tween(p, 0, 1, ctx.p.rot ?? 0.6, 0, 'smoother');
    return { cam, ov: {} };
  },

  // Border draws on, breathes, draws off — the same "look here" as spotlight
  // but without dimming the page. Lighter touch, so it can be used on beats
  // where killing the surrounding context would lose the story.
  pulseFocus(p, ctx) {
    const { rect, vw, vh, zBase, comp } = ctx;
    const z = tween(p, 0, 1, zBase * 0.99, zBase * 1.07, 'smoother');
    const cam = frameOn(rect, vw, vh, z);
    const on = Math.min(tween(p, 0.05, 0.26, 0, 1, 'easeOut'), tween(p, 0.84, 1, 1, 0, 'easeIn'));
    // Two beats of breath in the stroke weight after it lands.
    const beat = 1 + Math.sin(Math.max(0, p - 0.4) * Math.PI * 4) * 0.35;
    return {
      cam,
      ov: {
        highlight: {
          sel: comp.selResolved, opacity: on,
          pad: ctx.p.pad ?? 16, radius: ctx.p.radius ?? 20,
          width: (ctx.p.ringWidth ?? 3) * beat,
          draw: tween(p, 0.05, 0.44, 0, 1, 'easeOutQuint'),
        },
      },
    };
  },

  // A band of brand colour sweeps across and the component is behind it when it
  // clears — a reveal rather than a move. Reads as designed, not recorded.
  sweepReveal(p, ctx) {
    const { rect, vw, vh, zBase } = ctx;
    const z = tween(p, 0, 1, zBase * 1.09, zBase * 1.0, 'easeOutQuint');
    const cam = frameOn(rect, vw, vh, z);
    // The camera lags the sweep slightly so the reveal lands on live motion.
    cam.panX += tween(p, 0, 0.6, (ctx.p.dir === 'left' ? -1 : 1) * 90, 0, 'easeOutQuint');
    const k = 1 - Math.abs(tween(p, 0, 0.52, -1, 1, 'smoother'));
    return {
      cam,
      ov: {
        wipe: k > 0.001
          ? { opacity: 1, color: ctx.p.color || '#5b46e5', cover: k, dir: ctx.p.dir === 'left' ? 'right' : 'left' }
          : null,
      },
    };
  },

  /**
   * Beat-synced punch-in: two or three hard steps into the subject, each
   * landing on a beat and holding, rather than one continuous push.
   *
   * The staple of short-form promos, and completely different in feel from
   * pushIn — that one glides, this one arrives in discrete hits. `steps` and
   * `stepZoom` are what the director varies.
   */
  punchIn(p, ctx) {
    const { rect, vw, vh, zBase } = ctx;
    const steps = Math.max(2, Math.min(4, ctx.p.steps ?? 3));
    const per = 1 / steps;
    const i = Math.min(steps - 1, Math.floor(p / per));
    // Snap hard at the step boundary, then hold dead still until the next one.
    const into = ease('easeOutQuint', Math.min(1, (p - i * per) / (per * 0.22)));
    const z = zBase * (1 + (ctx.p.stepZoom ?? 0.13) * (i + into));
    const cam = frameOn(rect, vw, vh, z);
    // A touch of kick on impact, gone within the step.
    cam.rot = (ctx.p.rot ?? 0.5) * (1 - into) * (i % 2 ? -1 : 1);
    return { cam, ov: {} };
  },

  /**
   * Tap. Built for vertical: framed tight on one element, the cursor arrives
   * from below the way a thumb does, presses, and the element genuinely
   * responds — the recorder fires a real click at `clickAt`.
   *
   * Distinct from cursorClick, which arcs in from the side on a wide frame and
   * is a camera move as much as an interaction. This one holds still and lets
   * the UI be the motion.
   */
  tapFocus(p, ctx) {
    const { rect, vw, vh, zBase, comp } = ctx;
    const z = tween(p, 0, 1, zBase * 1.0, zBase * 1.05, 'smoother');
    const cam = frameOn(rect, vw, vh, z);

    const at = ctx.p.clickAt ?? 0.55;
    // Thumb-style approach: up from the bottom of frame, not in from the side.
    const travel = ease('easeOutQuint', Math.min(1, p / at));
    const dy = (1 - travel) * (ctx.p.arc ?? 180);
    const dx = (1 - travel) * (ctx.p.dir === 'left' ? -34 : 34);

    // Press and release around the moment of contact.
    const press = p >= at && p < at + 0.1 ? 1 - Math.abs((p - at) / 0.1 - 0.5) * 2 : 0;
    const ripple = p >= at ? clamp01((p - at) / 0.34) : 0;

    // The border draws in ahead of the tap, then the UI's own change carries
    // the shot — so the border retreats rather than competing with it.
    const ringOn = Math.min(tween(p, 0.05, 0.3, 0, 1, 'easeOut'), tween(p, at, at + 0.22, 1, 0.25, 'easeOut'));

    return {
      cam,
      ov: {
        cursor: { sel: comp.selResolved, dx, dy, opacity: tween(p, 0, 0.14, 0, 1, 'easeOut'), press, ripple },
        highlight: {
          sel: comp.selResolved, opacity: ringOn,
          pad: ctx.p.pad ?? 10, radius: ctx.p.radius ?? 14,
          width: ctx.p.ringWidth ?? 2.5,
          draw: tween(p, 0.05, Math.max(0.18, at - 0.06), 0, 1, 'easeOutQuint'),
        },
      },
    };
  },

  // Lands from out of focus and oversized, then snaps to rest. The hardest
  // punctuation in the set — use it once, on the beat that matters.
  zoomBlurIn(p, ctx) {
    const { rect, vw, vh, zBase } = ctx;
    const z = tween(p, 0, 0.62, zBase * (ctx.p.from ?? 1.55), zBase * 1.02, 'easeOutQuint');
    const cam = frameOn(rect, vw, vh, z);
    cam.blur = tween(p, 0, 0.38, ctx.p.blur ?? 16, 0, 'easeOut');
    cam.saturate = tween(p, 0, 0.55, 1.25, 1, 'smooth');
    return { cam, ov: {} };
  },
};

export const KIND_NAMES = Object.keys(KINDS);

// Which kinds actually suit which component. Prevents nonsense pairings like a
// cursorClick on the footer while still leaving lots of room to vary.
export const AFFINITY = {
  hero: ['pushIn', 'pullBack', 'rackFocus', 'hold', 'driftDiagonal', 'zoomBlurIn'],
  heroCta: ['cursorClick', 'spotlight', 'pushIn', 'pulseFocus'],
  retailers: ['panAcross', 'tiltReveal', 'pushIn', 'driftDiagonal', 'slideIn', 'sweepReveal'],
  howItWorks: ['pushIn', 'rackFocus', 'hold', 'slideIn', 'sweepReveal'],
  cardInstall: ['spotlight', 'pushIn', 'rackFocus', 'whipTo', 'slideIn', 'pulseFocus'],
  cardSave: ['spotlight', 'pushIn', 'rackFocus', 'whipTo', 'slideIn', 'pulseFocus'],
  cardCompare: ['spotlight', 'pushIn', 'rackFocus', 'whipTo', 'slideIn', 'pulseFocus'],
  boards: ['pushIn', 'pullBack', 'tiltReveal', 'spotlight', 'driftDiagonal', 'rackFocus', 'slideIn', 'sweepReveal', 'zoomBlurIn'],
  compare: ['pushIn', 'pullBack', 'tiltReveal', 'spotlight', 'driftDiagonal', 'rackFocus', 'slideIn', 'pulseFocus', 'zoomBlurIn'],
  pdp: ['pushIn', 'pullBack', 'tiltReveal', 'spotlight', 'driftDiagonal', 'rackFocus', 'slideIn', 'sweepReveal', 'pulseFocus'],
  sectionArt: ['panAcross', 'driftDiagonal', 'pullBack', 'sweepReveal'],
  finalCta: ['pushIn', 'pullBack', 'hold', 'zoomBlurIn'],
  footer: ['tiltReveal', 'hold', 'pullBack'],
  logo: ['pushIn', 'hold', 'rackFocus', 'pulseFocus'],
};
