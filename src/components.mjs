// Exports the shot library's components as standalone assets.
//
// This is the "pull the page apart into a component library" stage: each entry
// becomes a cropped PNG plus its geometry, copy and the motion kinds it
// supports — so a component can be treated as its own project (extract →
// animate → score) rather than only as a beat inside a full reel.
//
//   node src/components.mjs [url]

import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { COMPONENTS, AFFINITY } from './shotlib.mjs';

const URL_ = process.argv[2] || 'https://shopbigticket.com/';
const OUT = 'components';
// Must stay above the site's xl breakpoint or the feature blocks collapse.
const VW = 1440, VH = 810;
// Generous margin: some of the mockup SVGs paint slightly outside their own
// border box, and a tight clip shaves the edges off.
const PAD = 44;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

const runtimeSrc = await readFile(new URL('./browser/runtime.js', import.meta.url), 'utf8');

const browser = await chromium.launch();
const ctx = await browser.newContext({ userAgent: UA, viewport: { width: VW, height: VH }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000);
await page.evaluate(runtimeSrc);
await page.evaluate(async () => {
  for (let y = 0; y < document.documentElement.scrollHeight; y += 320) {
    scrollTo(0, y); await new Promise((r) => setTimeout(r, 90));
  }
  scrollTo(0, 0);
});
await page.waitForTimeout(1200);
await page.evaluate(() => window.__BT.freezeSiteMotion());

await mkdir(OUT, { recursive: true });

const docHeight = await page.evaluate(() => window.__BT.docHeight());
const index = [];

for (const [name, spec] of Object.entries(COMPONENTS)) {
  const ok = await page.evaluate(
    ([n, s]) => window.__BT.register(n, s),
    [name, { sel: spec.sel, fallback: spec.fallback, climb: spec.climb || 0, minArea: spec.minArea || 0 }]
  );
  if (!ok) {
    console.log(`  - ${name.padEnd(12)} unresolved`);
    index.push({ name, label: spec.label, resolved: false });
    continue;
  }
  const rect = await page.evaluate((n) => window.__BT.pageRect('@' + n), name);

  // Scroll the component into view and clip in viewport space. A fullPage
  // screenshot re-lays-out the page and does NOT paint reveal-on-scroll
  // content, which silently yields blank crops for the feature mockups.
  const vr = await page.evaluate((n) => {
    const el = window.__BT.resolve('@' + n);
    const r = el.getBoundingClientRect();
    const target = r.top + scrollY - (innerHeight - r.height) / 2;
    scrollTo(0, Math.max(0, target));
    return null;
  }, name);
  void vr;

  // These mockups animate in with a scale, so the rect right after scrolling is
  // a moving target — clipping against it shaves the edges off. Poll until two
  // consecutive measurements agree, then capture.
  let live = null;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(180);
    const next = await page.evaluate((n) => window.__BT.viewRect('@' + n), name);
    if (live && Math.abs(next.w - live.w) < 0.5 && Math.abs(next.h - live.h) < 0.5 && Math.abs(next.y - live.y) < 0.5) {
      live = next;
      break;
    }
    live = next;
  }
  const clip = {
    x: Math.max(0, Math.min(VW - 1, live.x - PAD)),
    y: Math.max(0, Math.min(VH - 1, live.y - PAD)),
    width: Math.min(VW, live.w + PAD * 2),
    height: Math.min(VH, live.h + PAD * 2),
  };
  clip.width = Math.min(clip.width, VW - clip.x);
  clip.height = Math.min(clip.height, VH - clip.y);

  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, clip });

  index.push({
    name,
    label: spec.label,
    resolved: true,
    theme: spec.theme || 'light',
    captionable: !!spec.captionable,
    clickable: !!spec.clickable,
    selector: spec.sel || spec.fallback,
    rect,
    copy: spec.copy || null,
    motionKinds: AFFINITY[name] || [],
    asset: file.replace(/\\/g, '/'),
  });
  console.log(`  ✓ ${name.padEnd(12)} ${rect.w}×${rect.h} @ y=${Math.round(rect.y)}`);
}

await writeFile(
  path.join(OUT, 'index.json'),
  JSON.stringify({ url: URL_, capturedAt: { viewport: [VW, VH], deviceScaleFactor: 2 }, docHeight, components: index }, null, 2)
);

await browser.close();
const n = index.filter((c) => c.resolved).length;
console.log(`\n${n}/${index.length} components exported → ${OUT}/`);
