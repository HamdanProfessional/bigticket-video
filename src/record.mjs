// Renders a storyboard to a numbered frame sequence.
//
// Frames are stepped deterministically rather than captured in real time: for
// each frame index we compute the exact camera/overlay state, push it into the
// page, then screenshot. A slow machine yields the same video as a fast one.

import { chromium } from 'playwright';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { COMPONENTS, KINDS, fitZoom } from './shotlib.mjs';
import { tween, ease, clamp01, handheld, ramp } from './lib/easing.mjs';
import { CAPTION_LEAD, CAPTION_IN, CAPTION_OUT } from './lib/timing.mjs';
import { ensureSession } from './auth.mjs';
import { fillCopy } from './lib/tokens.mjs';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

const UA_MOBILE =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36';

const TRANSITION = 0.42; // seconds, centred on each cut

// Pause after a cut jumps the camera, so reveal-on-view content can mount.
const SETTLE_MS = 200;

/**
 * Camera-side transitions.
 *
 * The overlay transitions below only paint colour over the frame. Instagram's
 * own set — zoom, spin, warp, glitch — are movements of the picture itself, so
 * they have to reach the camera. This returns multipliers applied on top of
 * whatever the shot's motion kind already computed, strongest at the cut and
 * gone by the edges of the window.
 *
 * `edge` runs -1..1 across the cut: negative on the outgoing side, positive on
 * the incoming one. Several effects flip direction with it, so the shot leaving
 * and the shot arriving move in sympathy rather than both lurching the same way.
 */
function transitionCam(style, edge, vw = 1440) {
  const k = 1 - Math.abs(edge);
  if (k <= 0) return null;
  const dir = edge < 0 ? 1 : -1;
  // Lateral distances are a FRACTION of the frame, not a pixel count. Tuned on
  // a 1440-wide landscape frame, a 320px whip is 22% of the picture; the same
  // 320px on a 540-wide vertical frame is 59%, which throws the subject clean
  // out of shot. Everything horizontal scales with the frame from here on.
  const px = vw / 1440;
  switch (style) {
    // Punches into the cut and eases out of it — the default IG zoom cut.
    case 'zoomCut':
      return { zoom: 1 + 0.20 * ease('easeIn', k) };
    // Rotates through the cut. Small angles: 12 degrees reads as a spin at speed.
    case 'spin':
      return { zoom: 1 + 0.14 * ease('easeIn', k), rot: dir * 12 * ease('easeIn', k) };
    // Zoom-led, not blur-led. At blur 16 on a 540px frame the whole picture
    // went to uniform mush with no scale cue, which reads as a failed load
    // rather than a warp. The zoom does the work; the blur only smears it.
    case 'warp':
      return { zoom: 1 + 0.34 * ease('easeIn', k), blur: 9 * px * ease('easeIn', k) };
    // Whip pan: the frame smears sideways through the cut and lands. The two
    // sides travel the same way, so it reads as one continuous camera move
    // across the edit rather than two shots lurching apart.
    case 'whip':
      return { panX: dir * 320 * px * ease('easeIn', k), blur: 20 * px * ease('easeIn', k) };
    // Digital break-up: hard sub-pixel jitter, no smoothing.
    case 'glitch':
      return { jitter: k * px, zoom: 1 + 0.05 * k };
    default:
      return null;
  }
}

// Builds the transition overlay for a moment in time near a cut.
function transitionOverlay(style, edge) {
  // edge: -1..1 across the cut, 0 exactly at the cut.
  const k = 1 - Math.abs(edge);
  if (k <= 0) return null;
  switch (style) {
    case 'flash':
      return { opacity: ease('easeOut', k) * 0.85, color: '#ffffff', cover: 1, dir: 'all' };
    // A BAND sweeping across, not a full cover.
    //
    // The old wipe ramped `cover` to 1 at the cut, which painted the entire
    // frame #f7f5ff — several consecutive blank frames that read as a dropped
    // render, not a transition. A cross-dissolve between two pages is not
    // available to us (they are different tabs), so the wipe has to be a band
    // that never occludes everything: `pos` travels 0..1 across the cut and the
    // band is half a frame wide, so at least a quarter of the picture is always
    // visible on each side.
    case 'wipe':
      return { opacity: 1, color: '#f7f5ff', band: 0.5, pos: (edge + 1) / 2 };
    case 'softWipe':
      return { opacity: 0.9 * ease('smooth', k), color: '#ffffff', cover: edge < 0 ? ease('smooth', k) : ease('smooth', k), dir: 'up' };
    case 'fadeFromWhite':
      return edge < 0 ? null : { opacity: ease('easeOut', k), color: '#ffffff', cover: 1, dir: 'all' };
    // A streak of light rakes across the cut. Pure overlay — the camera is
    // untouched, which is what keeps it from feeling like a zoom.
    case 'flare':
      return { opacity: ease('smooth', k), color: '#ffffff', cover: 1, dir: 'all', flare: k, flareDir: edge < 0 ? 1 : -1 };
    // These three are camera moves; the overlay only softens the seam.
    case 'zoomCut':
    case 'spin':
    case 'warp':
    case 'whip':
      return { opacity: ease('smooth', k) * 0.34, color: '#ffffff', cover: 1, dir: 'all' };
    case 'glitch':
      return { opacity: 0, color: '#ffffff', cover: 1, dir: 'all', glitch: k };
    case 'dissolve':
    default:
      return { opacity: ease('smooth', k) * 0.55, color: '#ffffff', cover: 1, dir: 'all' };
  }
}

/**
 * Renders a storyboard to frames.
 *
 * Wrapper exists purely to guarantee the browser is closed. Everything below
 * used to run inline with a single `browser.close()` at the very end, so any
 * throw — a bad selector, a typo in a shot kind — skipped it and left a
 * headless Chromium running with a node process pinned open by its handle.
 * One such orphan sat on this machine for three hours after a render failed on
 * an undefined variable.
 */
export async function record(storyboard, outDir, opts = {}) {
  let browser = null;
  const setBrowser = (b) => { browser = b; };
  try {
    return await recordInner(storyboard, outDir, opts, setBrowser);
  } finally {
    // `catch`-free on purpose: a close failure must not mask the real error.
    if (browser) await browser.close().catch(() => {});
  }
}

async function recordInner(storyboard, outDir, { onProgress, components, auth, extract, facts: givenFacts } = {}, setBrowser) {
  // Site profile is injectable so this renderer is not tied to one site.
  const COMPS = components || COMPONENTS;
  const { fps, width, height, look } = storyboard;
  // Reassigned when a card's copy quotes a number the page did not supply.
  let { shots } = storyboard;
  const framesDir = path.join(outDir, 'frames');
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });

  const runtimeSrc = await readFile(new URL('./browser/runtime.js', import.meta.url), 'utf8');

  const browser = await chromium.launch({
    // AutomationControlled is what the site's bot check keys off; without this
    // the login modal accepts the credentials and then silently fails.
    args: ['--force-color-profile=srgb', '--disable-lcd-text', '--disable-blink-features=AutomationControlled'],
  });
  // Hand it to the wrapper immediately, so a throw anywhere below still closes.
  setBrowser(browser);

  // A stage is a local file, not a site. `new URL('file:///…').origin` is the
  // string "null", so origin+route would navigate to "null/" — the stage is
  // addressed as a whole document instead, and its routes are ignored because
  // every scene lives in the one page.
  const isLocal = /^file:/i.test(storyboard.url || '');
  const origin = isLocal
    ? storyboard.url
    : new URL(storyboard.url || 'https://shopbigticket.com/').origin;

  // Signing in, if the profile needs it. The session is established in a
  // throwaway context and reused as storageState, so the filming contexts never
  // see the credentials at all.
  let storageState;
  if (auth) {
    storageState = await ensureSession(browser, auth, { origin });
  }

  const ctx = await browser.newContext({
    userAgent: storyboard.mobile ? UA_MOBILE : UA,
    viewport: { width, height },
    // Capturing above 1x and letting the encoder downscale is what keeps type
    // crisp once the camera zooms in.
    deviceScaleFactor: storyboard.deviceScaleFactor || 1,
    isMobile: false,
    hasTouch: !!storyboard.mobile,
    reducedMotion: 'reduce',
    locale: 'en-US',
    ...(storageState ? { storageState } : {}),
  });

  /**
   * One primed tab per route.
   *
   * An app's story spans several pages, and re-navigating at every cut would
   * cost ~10s of load-and-prime each time — more than the shot itself. Keeping
   * a tab open per route means a cut between pages is as cheap as a cut within
   * one, at the price of a little memory.
   */
  const pages = new Map();
  async function pageFor(route) {
    if (pages.has(route)) return pages.get(route);
    const page = await ctx.newPage();
    await page.goto(isLocal ? origin : origin + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // The product page fetches offers and price history after load and shows a
    // "Searching for the best deals..." placeholder until they arrive. Filming
    // that placeholder is worse than not filming the page at all.
    await page.waitForTimeout(route === '/' ? 2000 : 3000);

    // Then wait for the page to STOP CHANGING, rather than for a fixed number
    // of seconds.
    //
    // The fixed 6s wait this replaces was a guess, and it was wrong in the way
    // guesses about networks are wrong: retailer offers arrive one at a time,
    // so the ad filmed whichever had landed by the deadline. A reel whose
    // central claim is "compares every seller" went out showing a single
    // retailer, and nothing anywhere reported a problem — the shot resolved,
    // measured and rendered perfectly. It was simply of half a list.
    //
    // The signal is text length AND structure AND height, because late work
    // comes in three flavours and text alone catches only one.
    //
    // A section here hydrates from plain markup into a carousel: same items,
    // same words, completely different DOM. Measured across loads it is
    // sometimes a `.slick-track` with four slides and sometimes no track at
    // all — so a shot could be measured and frozen against the pre-hydration
    // layout and then watch the section rearrange itself on camera. Text
    // length does not move a byte through that, which is why it went unnoticed
    // while a fixed wait was hiding it.
    await page.evaluate(async () => {
      const read = () => [
        (document.body.innerText || '').length,
        document.getElementsByTagName('*').length,
        Math.round(document.documentElement.scrollHeight),
      ].join(':');
      let prev = -1, stableMs = 0;
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 250));
        const n = read();
        if (n === prev) {
          stableMs += 250;
          if (stableMs >= 1500) return;
        } else { stableMs = 0; prev = n; }
      }
    });
    await page.evaluate(runtimeSrc);

    // Priming pass: walk the page so lazy images decode and reveal blocks fire,
    // then pin everything visible and stop the site animating on its own.
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 320) {
        scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 90));
      }
      scrollTo(0, 0);
    });
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.__BT.freezeSiteMotion());
    // Fast mode trades per-frame re-rasterisation (sharp) for a cached composited
    // layer (soft but ~4x quicker) — for previewing an edit, not for delivery.
    if (storyboard.fast) await page.evaluate(() => window.__BT.setFastRaster(true));
    try {
      await page.waitForLoadState('networkidle', { timeout: 8000 });
    } catch { /* the site keeps a socket open; not fatal */ }
    await page.waitForTimeout(800);

    const entry = { page, docHeight: await page.evaluate(() => window.__BT.docHeight()) };
    pages.set(route, entry);
    return entry;
  }

  const routeOf = (name) => COMPS[name]?.route || storyboard.defaultRoute || '/';

  // ---- bind components and measure them once, in page space --------------
  //
  // Retried once if NOTHING resolves. A single slow page load makes every
  // component measure empty and the run aborts — which cost a slot in a
  // five-video batch, and is indistinguishable at this point from a genuinely
  // broken profile. One reload separates the two: a transient failure passes on
  // the second attempt, a broken profile fails identically twice and still
  // raises. Only the all-or-nothing case retries; individual components that do
  // not resolve are a profile problem and still just drop their shots.
  const used = [...new Set(shots.map((s) => s.component))];
  let geometry = {};
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      console.warn('  ! nothing resolved — reloading and retrying once');
      for (const { page } of pages.values()) await page.close().catch(() => {});
      pages.clear();
    }
    geometry = await bindAll();
    if (Object.keys(geometry).length) break;
  }

  async function bindAll() {
  const geometry = {};
  for (const name of used) {
    const spec = COMPS[name];
    if (!spec) continue;
    const { page } = await pageFor(routeOf(name));
    const ok = await page.evaluate(
      ([n, s]) => window.__BT.register(n, s),
      [name, { sel: spec.sel, fallback: spec.fallback, climb: spec.climb || 0, minArea: spec.minArea || 0 }]
    );
    if (!ok) {
      console.warn(`  ! component "${name}" did not resolve on ${routeOf(name)} — its shots will be dropped`);
      continue;
    }
    geometry[name] = await page.evaluate((n) => window.__BT.pageRect('@' + n), name);
  }
  return geometry;
  }

  // ---- read the page's own numbers, and fill the copy with them ----------
  //
  // Copy that quotes a real price is making an argument; copy that says "Open
  // it up." is describing software. But a number written into a profile rots
  // silently, so profiles ship `{price}`-style tokens and the values come from
  // here, off the page being filmed, on every render.
  //
  // A line that cannot be filled is dropped, never printed with a hole in it —
  // and a title card whose whole reason to exist was that line is dropped with
  // it, because a card with no copy is three seconds of nothing.
  // A stage already had its numbers baked into its type by the library export,
  // so re-extracting them from the rendered stage would be reading our own
  // output back. They are handed in instead.
  let facts = givenFacts || {};
  if (!Object.keys(facts).length && extract) {
    const { page } = await pageFor(storyboard.factsRoute || routeOf(shots[0]?.component));
    facts = (await page.evaluate(extract)) || {};
  }
  {
    const filled = Object.entries(facts).filter(([, v]) => v != null && v !== '').length;
    if (filled) console.log(`  facts ${filled}/${Object.keys(facts).length}`);
  }
  let droppedForFacts = 0;
  for (const s of shots) {
    if (!s.caption) continue;
    const c = fillCopy(s.caption, facts);
    if (c === null) {
      s.caption = null;
      if (s.isCard) { s.dropForFacts = true; droppedForFacts++; }
    } else s.caption = c;
  }
  if (droppedForFacts) {
    console.warn(`  ! ${droppedForFacts} card(s) dropped — the page did not supply the numbers their copy quotes`);
  }
  shots = shots.filter((s) => !s.dropForFacts);

  const live = shots.filter((s) => geometry[s.component]);
  if (!live.length) throw new Error('No components resolved on the page — nothing to record.');

  // A column panel only works if its component still reads in the space the
  // panel leaves free. Full-bleed sections are wider than that column even at
  // 1x — and the camera cannot zoom out past the capture width without the
  // browser's own canvas showing through — so they step down: first to a lower
  // third, which costs height instead of width, and only to a full-frame card
  // if the component is too tall for that too. Decided here rather than in the
  // director because it needs real measured geometry, which keeps it correct
  // for any site.
  let fallbackAt = 0;
  const ENTER = ['wipe', 'up', 'wipeUp', 'down', 'fade'];
  const fits = (r, frac, vertical) => {
    const zFit = Math.max(1, fitZoom(r, width, height, 0.8) * (1 - frac));
    return vertical
      ? r.h * zFit <= height * (1 - frac) * 1.02
      : r.w * zFit <= width * (1 - frac) * 1.02;
  };
  for (const s of live) {
    if (!s.isPanel) continue;
    const r = geometry[s.component];
    if (fits(r, s.params.panelWidth ?? 0.42, false)) continue;
    const bandFrac = 0.34;
    if (fits(r, bandFrac, true)) {
      s.params = { ...s.params, side: 'bottom', panelWidth: bandFrac };
      continue;
    }
    s.isPanel = false;
    s.params = { ...s.params, side: null, fill: 0.8, enter: ENTER[fallbackAt++ % ENTER.length] };
    s.caption = { ...s.caption, align: 'center' };
  }

  // ---- build the timeline ------------------------------------------------
  const timeline = [];
  let t = 0;
  for (const s of live) {
    timeline.push({
      ...s, start: t, end: t + s.duration,
      rect: geometry[s.component], route: routeOf(s.component),
    });
    t += s.duration;
  }
  const total = t;
  const frameCount = Math.round(total * fps);

  // ---- render ------------------------------------------------------------
  let lastCamY = Infinity;
  let lastIdx = -1;
  let lastRoute = null;
  for (let f = 0; f < frameCount; f++) {
    const time = f / fps;
    let idx = timeline.findIndex((s) => time >= s.start && time < s.end);
    if (idx < 0) idx = timeline.length - 1;
    const shot = timeline[idx];
    // Speed ramp: warps how fast the shot travels its own path, leaving the
    // path itself alone. Applied here so every motion kind inherits it.
    const pRaw = clamp01((time - shot.start) / shot.duration);
    const p = ramp(shot.params.ramp || 'linear', pRaw);

    // The tab this shot lives on. Cutting between routes is just cutting
    // between tabs; both are already loaded, primed and frozen.
    const { page, docHeight } = await pageFor(shot.route);
    if (shot.route !== lastRoute) {
      // A background tab's rendering is throttled, so it has to be foremost
      // before its frames are captured.
      await page.bringToFront();
      lastRoute = shot.route;
    }

    const comp = { ...COMPS[shot.component], selResolved: '@' + shot.component };

    // Re-measure at the top of every shot, not once at bind time.
    //
    // Geometry was captured up front, before a single interaction had happened.
    // Anything a click changed elsewhere on the page went unnoticed: the seller
    // dropdown expands the retailer list from one row to three, so the shot
    // that frames that list — the one carrying "Big Ticket compares every
    // seller" — aimed at a 508x90 rect that had since become 508x204, and
    // filmed a close-up of a retailer's logo instead of the comparison.
    //
    // Only the clicked component was refreshed before, which covers an
    // accordion expanding itself and nothing else. One evaluate per shot is
    // noise next to a ~185ms screenshot, and it makes the camera correct for
    // any DOM change from any cause.
    if (idx !== lastIdx) {
      const spec = COMPS[shot.component];
      if (spec) {
        await page.evaluate(
          ([n, s]) => window.__BT.register(n, s),
          [shot.component, { sel: spec.sel, fallback: spec.fallback, climb: spec.climb || 0, minArea: spec.minArea || 0 }]
        ).catch(() => {});
        const fresh = await page.evaluate((n) => window.__BT.pageRect(n), comp.selResolved).catch(() => null);
        if (fresh && fresh.w > 0 && fresh.h > 0) shot.rect = fresh;
      }
    }

    const zBase = fitZoom(shot.rect, width, height, shot.params.fill ?? 0.78);
    const kind = KINDS[shot.kind] || KINDS.pushIn;
    const { cam, ov } = kind(p, {
      rect: shot.rect, vw: width, vh: height, zBase, comp,
      // Shots read the graphics package off their params so a kind does not
      // need the whole look object; injected here rather than written into
      // every shot by the director, so there is one source of truth.
      p: { ...shot.params, look: look.captionStyle },
    });

    /**
     * Containment: an element that fits the frame must STAY in the frame.
     *
     * A component smaller than the viewport is a thing the shot is about — an
     * accordion row, a product tile, a price table. Cropping it defeats the
     * shot. But the kinds stack multipliers on top of the fitted zoom (punchIn
     * ends at 1.68x, pushIn at 1.16x, and transitions add more), and in a 540px
     * vertical frame a 508px-wide element runs out of room almost immediately.
     * That is why elements were disappearing off the edges.
     *
     * Sections larger than the viewport are exempt: cropping into those is the
     * whole point of a push, and there is no zoom at which they fit anyway.
     */
    const isElement = shot.rect.w <= width && shot.rect.h <= height;
    // Wide-but-short elements — a 508px spec row in a 540px frame — fit at 0.94
    // width, which pins them to zoom 1 and flattens every punch-in the mood
    // asked for. Let those go edge to edge instead: losing 6% of a row that
    // reads left-label / right-value is worse than a hair of crop.
    const wideThin = isElement && shot.rect.w > width * 0.8 && shot.rect.h < height * 0.25;
    const inset = wideThin ? 1.0 : 0.94;
    const maxZoom = isElement && !shot.isCard
      ? Math.min((width * inset) / shot.rect.w, (height * 0.94) / shot.rect.h)
      : Infinity;
    if (cam.zoom > maxZoom) cam.zoom = maxZoom;

    // Handheld layer: a few pixels of wander so the move reads as operated
    // rather than computed. Applied off ABSOLUTE time so it flows through cuts,
    // and skipped on full-frame title cards (a graphic panel shouldn't sway).
    // Side-panel cards keep it: live product fills most of the frame there, and
    // freezing it dead beside a moving panel is what gives the trick away.
    if ((!shot.isCard || shot.isPanel) && look.handheld !== 0) {
      const amt = look.handheld ?? 1;
      const h = handheld(time, storyboard.seed);
      const scale = Math.min(1.6, cam.zoom || 1);
      cam.panX = (cam.panX ?? 0) + h.x * 4.2 * amt * scale;
      cam.y += h.y * 3.4 * amt * scale;
      cam.rot = (cam.rot ?? 0) + h.rot * 0.055 * amt;
      cam.zoom *= 1 + h.breath * 0.0016 * amt;
    }

    // Keep the camera inside the document so we never frame blank space.
    cam.y = Math.max(-40, Math.min(cam.y, docHeight - height * 0.55));

    // Same guard horizontally: a pan that runs past the page edge exposes bare
    // canvas beside the content. The page is exactly `width` wide, so solve for
    // the panX range that still covers the viewport at this zoom.
    // A side panel covers one edge of the frame, so the page only has to reach
    // the panel's inner edge — the window widens by the panel's width on that
    // side, which is exactly the room the shot needs to bias the product away.
    // Panel shots are exempt: the panel covers one edge and the shot bounds its
    // own slide against the component's far edge, so this clamp would only
    // fight it — and at panel zoom levels there is no solution that covers the
    // full frame anyway.
    if (shot.isPanel) {
      /* the shot's own bound applies */
    } else if (cam.zoom >= 1) {
      const ox = cam.originX ?? width / 2;
      const lo = (width - ox) * (1 - cam.zoom);
      const hi = ox * (cam.zoom - 1);
      cam.panX = Math.max(lo, Math.min(cam.panX ?? 0, hi));
    } else {
      cam.panX = 0;
    }

    // Caption fades in early and out late within its own shot.
    let caption = null;
    if (shot.caption) {
      const inT = Math.min(0.9, CAPTION_IN / shot.duration);
      const outT = 1 - Math.min(0.9, CAPTION_OUT / shot.duration);
      const fadeIn = tween(p, CAPTION_LEAD, CAPTION_LEAD + inT, 0, 1, 'easeOutQuint');
      // A held card's copy stays up with its panel — the out-tween is skipped
      // outright rather than pushed out of range. Moving `outT` past 1 does NOT
      // disable it: tween() returns its `to` value when end <= start, so an
      // out-of-range window returns 0 immediately and blanked the sign-off copy
      // completely, leaving a bare lilac panel as the last frame of the ad.
      const op = shot.params.holdOut ? fadeIn : Math.min(fadeIn, tween(p, outT, 1, 1, 0, 'easeIn'));
      // Raw 0..1 progress for the kinetic type: the runtime staggers words,
      // kicker, rule and subtitle off these rather than one shared opacity.
      const inP = clamp01((p - CAPTION_LEAD) / Math.max(0.01, inT));
      const outP = shot.params.holdOut ? 0 : clamp01((p - outT) / Math.max(0.01, 1 - outT));
      // The graphics package is a property of the film, not of one caption, so
      // it rides on `look` and every caption inherits it.
      caption = { ...shot.caption, look: look.captionStyle, opacity: clamp01(op), inP, outP };
    }

    // Transitions live on the cut between this shot and its neighbours.
    let wipe = null;
    let tcam = null;
    const half = TRANSITION / 2;
    const dIn = time - shot.start;
    const dOut = shot.end - time;
    if (dIn < half) {
      wipe = transitionOverlay(shot.transitionIn, dIn / half);
      tcam = transitionCam(shot.transitionIn, dIn / half, width);
    } else if (dOut < half && idx < timeline.length - 1) {
      wipe = transitionOverlay(timeline[idx + 1].transitionIn, -(dOut / half));
      tcam = transitionCam(timeline[idx + 1].transitionIn, -(dOut / half), width);
    }

    // Camera-side transitions ride on top of the shot's own move. Applied after
    // the clamps above so a zoom-cut is never clipped back to the page edge —
    // it is meant to overshoot; that overshoot is the effect.
    if (tcam) {
      if (tcam.zoom) cam.zoom *= tcam.zoom;
      if (tcam.panX) cam.panX = (cam.panX ?? 0) + tcam.panX;
      if (tcam.rot) cam.rot = (cam.rot ?? 0) + tcam.rot;
      if (tcam.blur) cam.blur = Math.max(cam.blur ?? 0, tcam.blur);
      // A transition may punch slightly past the containment limit — it lasts a
      // fifth of a second at the cut and the overshoot is the effect — but not
      // far enough to push the subject out of shot.
      if (cam.zoom > maxZoom * 1.06) cam.zoom = maxZoom * 1.06;
      if (tcam.jitter) {
        // Deterministic per-frame jitter: seeded off the frame index so the
        // same film always breaks up identically.
        const j = (n) => (((f * 2654435761 + n * 40503) >>> 0) / 4294967296 - 0.5);
        cam.panX = (cam.panX ?? 0) + j(1) * 26 * tcam.jitter;
        cam.y += j(2) * 14 * tcam.jitter;
      }
    }

    // Global look: settle the letterbox in at the head, hold it after.
    const lb = look.letterbox * ease('easeOutQuint', clamp01(time / 1.1));
    const brandOn =
      look.brand
        ? Math.min(tween(time, 0.6, 1.6, 0, 1, 'easeOut'), tween(time, total - 1.2, total, 1, 0, 'easeIn'))
        : 0;

    const state = {
      cam,
      ov: {
        ...ov,
        letterbox: lb,
        // A shot may override the global vignette (title cards want none).
        vignette: ov.vignette ?? look.vignette,
        caption,
        // A cut's transition wins over a shot's own sweep — they only overlap
        // in the half-second at each end, where the cut is what matters.
        wipe: wipe || ov.wipe || null,
        safeTop: look.safeTop || 0,
        safeBottom: look.safeBottom || 0,
        brand: { opacity: clamp01(brandOn) * 0.9, dark: comp.theme === 'light' },
      },
    };

    await page.evaluate((st) => window.__BT.frame(st), state);

    // Wait for the browser to actually COMMIT the frame before capturing it.
    //
    // `page.evaluate` resolves when the JavaScript returns, which is before
    // style, layout, paint and composite have run. The screenshot was therefore
    // racing the compositor. Chromium rasterises in tiles and uploads them
    // asynchronously, so a capture landing mid-commit gets some tiles carrying
    // the new camera transform and some still carrying the old one: a
    // rectangular slab of the picture visibly offset from the rest, with a hard
    // edge down the seam. It looks like a corrupt video rather than a bug in a
    // camera, which is why it took a screenshot from someone else to spot.
    //
    // Two rAFs, not one: the first fires before that commit, the second after
    // it. Worse under --fast, where `will-change: transform` promotes the page
    // to its own composited layer and makes tile uploads asynchronous, but not
    // exclusive to it — the race exists at any raster setting.
    await page.evaluate(() => new Promise((r) => (
      requestAnimationFrame(() => requestAnimationFrame(() => r()))
    )));

    // Real interaction. When the cursor reaches the target, actually click it,
    // so the accordion opens or the dropdown drops on camera. Fires once per
    // shot, at the same progress point the cursor's press lands, and the page
    // is given a moment to respond before the frame is captured.
    // Fires on RAW progress, not ramped progress. Under a `holdSnap` ramp the
    // ramped value only reaches 0.54 at 82% of real time, so the accordion
    // opened with 0.37s of the shot left and the payoff — the whole reason for
    // the shot — was over before anyone registered it. Real time here
    // guarantees the result of the click gets the rest of the shot.
    if (shot.action && !shot.actionDone && pRaw >= (shot.action.at ?? 0.55)) {
      shot.actionDone = true;
      const res = await page.evaluate((s) => window.__BT.click(s), comp.selResolved);
      if (!res || !res.ok) {
        console.warn(`  ! click on "${shot.component}" skipped — ${res ? res.reason : 'no runtime'}`);
      } else {
        await page.waitForTimeout(shot.action.settle ?? 240);
        // The click can resize the component (an accordion expands), which
        // moves everything below it. Re-measure so the camera stays on target.
        //
        // Re-REGISTER first, rather than measuring the element we already hold:
        // this is a React app, and toggling an accordion replaces its DOM node.
        // The registry's reference is then detached, and a detached node
        // measures 508x0 — which is exactly what shipped, giving specPerformance
        // and specDimensions a zero-height rect and framing them by luck.
        const spec = COMPS[shot.component];
        await page.evaluate(
          ([n, s]) => window.__BT.register(n, s),
          [shot.component, { sel: spec.sel, fallback: spec.fallback, climb: spec.climb || 0, minArea: spec.minArea || 0 }]
        );
        const fresh = await page.evaluate((n) => window.__BT.pageRect(n), comp.selResolved);
        // Both dimensions, not just width — the old guard tested `w > 0` only,
        // so a 508x0 detached node sailed through it.
        if (fresh && fresh.w > 0 && fresh.h > 0) shot.rect = fresh;
      }
    }

    // A cut can jump the camera hundreds of pixels. Reveal-on-view content
    // needs a beat to mount and settle before we capture, or the first frames
    // of a shot catch a half-built section. Only worth paying at a cut: a jump
    // that large mid-shot is a whipTo, where the page is already mounted and
    // the frame is motion-blurred anyway.
    if (idx !== lastIdx && Math.abs(cam.y - lastCamY) > 320) await page.waitForTimeout(SETTLE_MS);
    lastCamY = cam.y;
    lastIdx = idx;

    // Capturing via raw CDP was tried and reverted. It is 22% faster in a loop
    // with a near-static camera, and 0.1% faster on the real camera path — once
    // the camera moves, rasterising the page dominates and both paths pay it
    // equally. Not worth a second code path.
    await page.screenshot({
      path: path.join(framesDir, `f${String(f).padStart(5, '0')}.jpg`),
      type: 'jpeg',
      quality: 92,
      animations: 'disabled',
    });

    if (onProgress && f % 15 === 0) onProgress(f, frameCount);
  }

  // Closed by the wrapper's `finally`, on the success path as well as on a
  // throw — closing here too would just be a redundant second call.

  const manifest = { ...storyboard, duration: +total.toFixed(3), frameCount, shots: timeline, framesDir };
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}
