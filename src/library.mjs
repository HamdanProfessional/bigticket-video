// Exports a site profile into a reusable component library.
//
// This is the "pull the page apart" half of building a video from a shot
// library rather than from the live site. It visits the page once and writes:
//
//   library/<name>.png   a cropped, device-scaled image of each component
//   library/index.json   geometry, copy and the facts read off the page
//
// Why bother, when the recorder can already film the page directly: filming in
// place means every frame inherits the page's own background, margins and
// colour. A 9:16 cut of a pale marketing page is a pale 9:16 cut, whatever the
// camera does. Exported, a component can be composited onto a background that
// was designed rather than inherited — see stage.mjs.
//
// It is also much faster to iterate on. The export is one page load; after that
// a video costs no network, no login and no navigation at all.
//
//   node src/library.mjs --reels
//   node src/library.mjs --app --out library/app

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureSession, credentialsFromEnv, SESSION_PATH } from './auth.mjs';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const UA_MOBILE =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

/**
 * @param {object} profile  A site profile: components, extract, defaultRoute…
 * @param {object} o
 * @param {string} [o.origin]  Site origin.
 * @param {string} [o.outDir]  Where to write. Defaults to `library`.
 * @param {number} [o.width]   Capture width. 540 matches the reels profile.
 * @param {number} [o.scale]   deviceScaleFactor. 3 gives room to punch in later.
 */
export async function exportLibrary(profile, o = {}) {
  const outDir = o.outDir || 'library';
  const origin = o.origin || 'https://shopbigticket.com';
  const width = o.width || 540;
  const height = o.height || 960;
  // Exported at 3x, not the 2x the recorder films at. A composited shot can
  // punch into an asset well past 1:1, and an image that was captured at the
  // delivery size goes soft the moment it is scaled up — which is the one
  // artefact that makes a composite look cheaper than the live page it
  // replaced. Storage is free; a re-export is a page load.
  const scale = o.scale || 3;
  const mobile = o.mobile ?? width <= 700;

  const runtimeSrc = await readFile(new URL('./browser/runtime.js', import.meta.url), 'utf8');
  const browser = await chromium.launch({
    args: ['--force-color-profile=srgb', '--disable-lcd-text', '--disable-blink-features=AutomationControlled'],
  });

  try {
    let storageState;
    if (profile.requiresAuth) {
      // A cached session is sufficient; credentials only MINT one.
      const creds = o.auth || credentialsFromEnv();
      if (!creds && !existsSync(SESSION_PATH)) {
        throw new Error(
          'This profile films the signed-in app, and there is no cached session ' +
          `at ${SESSION_PATH}. Set BT_EMAIL and BT_PASSWORD to mint one.`
        );
      }
      storageState = await ensureSession(browser, creds, { origin });
    }

    const ctx = await browser.newContext({
      storageState,
      userAgent: mobile ? UA_MOBILE : UA,
      viewport: { width, height },
      deviceScaleFactor: scale,
      isMobile: mobile,
      hasTouch: mobile,
      colorScheme: 'light',
    });

    await mkdir(outDir, { recursive: true });
    const COMPS = profile.components || {};
    const index = { origin, width, height, scale, facts: {}, components: {} };

    // One tab per route, same as the recorder: re-navigating costs ~10s and
    // throws away the scroll priming that makes lazy content mount.
    const pages = new Map();
    const pageFor = async (route) => {
      if (pages.has(route)) return pages.get(route);
      const page = await ctx.newPage();
      // `networkidle`, not `domcontentloaded`. The product page is a React view
      // that fetches its product, prices and review data after the document is
      // ready, so at domcontentloaded the DOM exists and contains none of the
      // things worth exporting. The first export run resolved every dashboard
      // and referral component and not one product-page component, and returned
      // 0/11 facts — the tell that the page was up but empty rather than that
      // the selectors were wrong.
      await page.goto(origin + route, { waitUntil: 'networkidle', timeout: 60000 })
        .catch(() => page.goto(origin + route, { waitUntil: 'domcontentloaded', timeout: 60000 }));
      // Settle on STRUCTURE, not a fixed wait: this site hydrates plain markup
      // into carousels for up to ~10s, and an export taken before that captures
      // a component that no longer exists in that shape.
      await page.evaluate(async () => {
        const read = () => [
          (document.body.innerText || '').length,
          document.getElementsByTagName('*').length,
          Math.round(document.documentElement.scrollHeight),
        ].join(':');
        let prev = -1, stable = 0;
        const deadline = Date.now() + 20000;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 250));
          const n = read();
          if (n === prev) { stable += 250; if (stable >= 1500) return; }
          else { stable = 0; prev = n; }
        }
      });
      // The product page leaves a full-viewport loading curtain up forever;
      // exported through it, every asset carries a grey wash and a spinner.
      for (const rule of (profile.hide || [])) {
        await page.evaluate((r) => {
          for (const el of document.querySelectorAll(r.sel)) {
            if (r.contains && !(el.textContent || '').toLowerCase().includes(String(r.contains).toLowerCase())) continue;
            // Removed rather than hidden: hidden text still reaches textContent,
            // and the extractor reads text.
            el.remove();
          }
        }, rule).catch(() => {});
      }
      await page.evaluate(runtimeSrc);
      await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += 320) {
          scrollTo(0, y); await new Promise((r) => setTimeout(r, 80));
        }
        scrollTo(0, 0);
      });
      await page.waitForTimeout(1000);
      await page.evaluate(() => window.__BT.freezeSiteMotion());

      // Open anything the recorder would have opened on camera.
      //
      // Without this the export captures COLLAPSED state: the seller dropdown
      // on this site expands the retailer list from one row to three, so the
      // library came back with retailerList at 508x90 and facts reporting
      // `sellers: 1`. An ad whose premise is "every seller, one screen" was
      // being built from a one-seller export, and nothing failed — the numbers
      // were simply wrong, which is the worst way for this to go wrong.
      for (const [n, spec] of Object.entries(COMPS)) {
        if (!spec.interactive || (spec.route || profile.defaultRoute || '/') !== route) continue;
        await page.evaluate(
          ([nm, sp]) => window.__BT.register(nm, sp),
          [n, { sel: spec.sel, fallback: spec.fallback, climb: spec.climb || 0, minArea: spec.minArea || 0 }]
        ).catch(() => {});
        const r = await page.evaluate((nm) => window.__BT.click('@' + nm), n).catch(() => null);
        console.log(`  · opened ${n}: ${r && r.ok ? 'ok' : (r && r.reason) || 'failed'}`);
        await page.waitForTimeout(1400);
      }

      pages.set(route, page);
      return page;
    };

    // --- facts -----------------------------------------------------------
    if (profile.extract) {
      const route = profile.factsRoute || Object.values(COMPS)[0]?.route || profile.defaultRoute || '/';
      const page = await pageFor(route);
      index.facts = (await page.evaluate(profile.extract)) || {};
      const got = Object.values(index.facts).filter((v) => v != null && v !== '').length;
      console.log(`  facts ${got}/${Object.keys(index.facts).length}`);
    }

    // --- component images --------------------------------------------------
    let ok = 0;
    for (const [name, spec] of Object.entries(COMPS)) {
      const route = spec.route || profile.defaultRoute || '/';
      const page = await pageFor(route);
      const resolved = await page.evaluate(
        ([n, s]) => window.__BT.register(n, s),
        [name, { sel: spec.sel, fallback: spec.fallback, climb: spec.climb || 0, minArea: spec.minArea || 0 }]
      );
      if (!resolved) {
        console.log(`  - ${name.padEnd(18)} unresolved`);
        continue;
      }
      // Scrolled into view and clipped in VIEWPORT space. A full-page
      // screenshot does not run reveal-on-scroll, so anything that animates in
      // exports blank if it is clipped in page space instead.
      const box = await page.evaluate((n) => {
        const el = window.__BT.resolve('@' + n);
        if (!el) return null;
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }, name);
      if (!box || box.width < 2 || box.height < 2) {
        console.log(`  - ${name.padEnd(18)} zero-sized`);
        continue;
      }
      await page.waitForTimeout(140);
      const file = `${name}.png`;
      const clip = {
        x: Math.max(0, box.x), y: Math.max(0, box.y),
        width: Math.min(box.width, width - Math.max(0, box.x)),
        height: Math.min(box.height, height - Math.max(0, box.y)),
      };
      await page.screenshot({ path: path.join(outDir, file), clip });
      index.components[name] = {
        file,
        label: spec.label || name,
        w: Math.round(clip.width), h: Math.round(clip.height),
        theme: spec.theme || 'light',
        copy: spec.copy || null,
      };
      ok++;
      console.log(`  ✓ ${name.padEnd(18)} ${Math.round(clip.width)}x${Math.round(clip.height)}`);
    }

    await writeFile(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2));
    console.log(`\n  ${ok}/${Object.keys(COMPS).length} components → ${outDir}/`);
    return index;
  } finally {
    await browser.close().catch(() => {});
  }
}
