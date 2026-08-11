// Renders a storyboard to a numbered frame sequence.
//
// Frames are stepped deterministically rather than captured in real time: for
// each frame index we compute the exact camera/overlay state, push it into the
// page, then screenshot. A slow machine yields the same video as a fast one.

import { chromium } from 'playwright';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { COMPONENTS, KINDS, fitZoom } from './shotlib.mjs';
import { tween, ease, clamp01, handheld } from './lib/easing.mjs';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

const UA_MOBILE =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36';

const TRANSITION = 0.42; // seconds, centred on each cut

// Builds the transition overlay for a moment in time near a cut.
function transitionOverlay(style, edge) {
  // edge: -1..1 across the cut, 0 exactly at the cut.
  const k = 1 - Math.abs(edge);
  if (k <= 0) return null;
  switch (style) {
    case 'flash':
      return { opacity: ease('easeOut', k) * 0.85, color: '#ffffff', cover: 1, dir: 'all' };
    case 'wipe':
      return { opacity: 1, color: '#f7f5ff', cover: edge < 0 ? ease('easeIn', k) : ease('easeOut', k), dir: edge < 0 ? 'left' : 'right' };
    case 'softWipe':
      return { opacity: 0.9 * ease('smooth', k), color: '#ffffff', cover: edge < 0 ? ease('smooth', k) : ease('smooth', k), dir: 'up' };
    case 'fadeFromWhite':
      return edge < 0 ? null : { opacity: ease('easeOut', k), color: '#ffffff', cover: 1, dir: 'all' };
    case 'dissolve':
    default:
      return { opacity: ease('smooth', k) * 0.55, color: '#ffffff', cover: 1, dir: 'all' };
  }
}

export async function record(storyboard, outDir, { onProgress, components } = {}) {
  // Site profile is injectable so this renderer is not tied to one site.
  const COMPS = components || COMPONENTS;
  const { fps, width, height, shots, look } = storyboard;
  const framesDir = path.join(outDir, 'frames');
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });

  const runtimeSrc = await readFile(new URL('./browser/runtime.js', import.meta.url), 'utf8');

  const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--disable-lcd-text'] });
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
  });
  const page = await ctx.newPage();

  const url = storyboard.url || 'https://shopbigticket.com/';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
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

  // ---- bind components and measure them once, in page space --------------
  const used = [...new Set(shots.map((s) => s.component))];
  const geometry = {};
  for (const name of used) {
    const spec = COMPS[name];
    const ok = await page.evaluate(
      ([n, s]) => window.__BT.register(n, s),
      [name, { sel: spec.sel, fallback: spec.fallback, climb: spec.climb || 0, minArea: spec.minArea || 0 }]
    );
    if (!ok) {
      console.warn(`  ! component "${name}" did not resolve — its shots will be dropped`);
      continue;
    }
    geometry[name] = await page.evaluate((n) => window.__BT.pageRect('@' + n), name);
  }

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
    timeline.push({ ...s, start: t, end: t + s.duration, rect: geometry[s.component] });
    t += s.duration;
  }
  const total = t;
  const frameCount = Math.round(total * fps);

  const docHeight = await page.evaluate(() => window.__BT.docHeight());

  // ---- render ------------------------------------------------------------
  let lastCamY = Infinity;
  for (let f = 0; f < frameCount; f++) {
    const time = f / fps;
    let idx = timeline.findIndex((s) => time >= s.start && time < s.end);
    if (idx < 0) idx = timeline.length - 1;
    const shot = timeline[idx];
    const p = clamp01((time - shot.start) / shot.duration);

    const comp = { ...COMPS[shot.component], selResolved: '@' + shot.component };
    const zBase = fitZoom(shot.rect, width, height, shot.params.fill ?? 0.78);
    const kind = KINDS[shot.kind] || KINDS.pushIn;
    const { cam, ov } = kind(p, { rect: shot.rect, vw: width, vh: height, zBase, p: shot.params, comp });

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
      const inT = Math.min(0.9, 0.55 / shot.duration);
      const outT = 1 - Math.min(0.9, 0.5 / shot.duration);
      const op = Math.min(tween(p, 0.08, 0.08 + inT, 0, 1, 'easeOutQuint'), tween(p, outT, 1, 1, 0, 'easeIn'));
      // Raw 0..1 progress for the kinetic type: the runtime staggers words,
      // kicker, rule and subtitle off these rather than one shared opacity.
      const inP = clamp01((p - 0.08) / Math.max(0.01, inT));
      const outP = clamp01((p - outT) / Math.max(0.01, 1 - outT));
      caption = { ...shot.caption, opacity: clamp01(op), inP, outP };
    }

    // Transitions live on the cut between this shot and its neighbours.
    let wipe = null;
    const half = TRANSITION / 2;
    const dIn = time - shot.start;
    const dOut = shot.end - time;
    if (dIn < half) {
      wipe = transitionOverlay(shot.transitionIn, dIn / half);
    } else if (dOut < half && idx < timeline.length - 1) {
      wipe = transitionOverlay(timeline[idx + 1].transitionIn, -(dOut / half));
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
        brand: { opacity: clamp01(brandOn) * 0.9, dark: comp.theme === 'light' },
      },
    };

    await page.evaluate((st) => window.__BT.frame(st), state);

    // A cut can jump the camera hundreds of pixels. Reveal-on-view content
    // needs a beat to mount and settle before we capture, or the first frames
    // of a shot catch a half-built section.
    if (Math.abs(cam.y - lastCamY) > 320) await page.waitForTimeout(260);
    lastCamY = cam.y;

    await page.screenshot({
      path: path.join(framesDir, `f${String(f).padStart(5, '0')}.jpg`),
      type: 'jpeg',
      quality: 92,
      animations: 'disabled',
    });

    if (onProgress && f % 15 === 0) onProgress(f, frameCount);
  }

  await browser.close();

  const manifest = { ...storyboard, duration: +total.toFixed(3), frameCount, shots: timeline, framesDir };
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}
