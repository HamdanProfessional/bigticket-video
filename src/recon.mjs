// Recon: crawl the target site with a real browser and dump a structural map
// that the shot library can be authored against.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const ROOT = process.argv[2] || 'https://shopbigticket.com/';
const OUT = 'recon';
const MAX_PAGES = 12;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

// Pulls the things a shot needs: headings, CTAs, images, and any element big
// enough to be worth framing a camera move on.
function extract() {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0';
  };
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x + scrollX),
      y: Math.round(r.y + scrollY),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  };
  // Stable-ish selector so shots can re-find the node on a later run.
  const sel = (el) => {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && parts.length < 4) {
      let p = n.tagName.toLowerCase();
      const cls = [...n.classList].filter((c) => !/^(css-|sc-)/.test(c)).slice(0, 2);
      if (cls.length) p += '.' + cls.map((c) => CSS.escape(c)).join('.');
      const sibs = n.parentElement ? [...n.parentElement.children].filter((s) => s.tagName === n.tagName) : [];
      if (sibs.length > 1) p += `:nth-of-type(${sibs.indexOf(n) + 1})`;
      parts.unshift(p);
      n = n.parentElement;
    }
    return parts.join(' > ');
  };

  const take = (q, fn) => [...document.querySelectorAll(q)].filter(vis).map(fn);

  return {
    title: document.title,
    metaDescription: document.querySelector('meta[name=description]')?.content || null,
    docHeight: document.documentElement.scrollHeight,
    headings: take('h1,h2,h3', (el) => ({
      tag: el.tagName.toLowerCase(),
      text: el.innerText.trim().slice(0, 200),
      selector: sel(el),
      box: box(el),
    })).filter((h) => h.text),
    links: [...document.querySelectorAll('a[href]')].map((a) => ({
      text: a.innerText.trim().slice(0, 80),
      href: a.href,
      nav: !!a.closest('nav,header'),
      footer: !!a.closest('footer'),
    })),
    buttons: take('button,[role=button],a.btn,a[class*="button"]', (el) => ({
      text: el.innerText.trim().slice(0, 60),
      selector: sel(el),
      box: box(el),
    })).filter((b) => b.text),
    images: take('img', (el) => ({
      alt: el.alt || null,
      src: el.currentSrc || el.src,
      selector: sel(el),
      box: box(el),
    })).filter((i) => i.box.w > 80 && i.box.h > 80),
    // Candidate "shot targets": chunky top-level blocks = natural scenes.
    sections: take('section,main > div,[class*="section"]', (el) => ({
      selector: sel(el),
      box: box(el),
      text: el.innerText.trim().slice(0, 300),
    })).filter((s) => s.box.h > 200 && s.box.w > 400),
  };
}

const browser = await chromium.launch({ headless: true, channel: undefined });
const ctx = await browser.newContext({
  userAgent: UA,
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  locale: 'en-US',
});
const page = await ctx.newPage();

await mkdir(`${OUT}/shots`, { recursive: true });

const seen = new Set();
const queue = [ROOT];
const map = [];
const origin = new URL(ROOT).origin;

while (queue.length && map.length < MAX_PAGES) {
  const url = queue.shift();
  const key = url.replace(/#.*$/, '').replace(/\/$/, '');
  if (seen.has(key)) continue;
  seen.add(key);

  let resp;
  try {
    resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (e) {
    map.push({ url, error: String(e).slice(0, 200) });
    continue;
  }
  await page.waitForTimeout(2500);
  // Scroll the whole page so lazy content and reveal-on-scroll blocks render.
  await page.evaluate(async () => {
    const step = innerHeight * 0.8;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 220));
    }
    scrollTo(0, 0);
  });
  await page.waitForTimeout(1200);

  const data = await page.evaluate(extract);
  const slug = (new URL(url).pathname.replace(/\W+/g, '_') || 'index').replace(/^_|_$/g, '') || 'index';
  await page.screenshot({ path: `${OUT}/shots/${slug}.png`, fullPage: true });

  map.push({ url, status: resp?.status() ?? null, slug, ...data });
  console.log(`[ok] ${url}  (${data.headings.length} headings, ${data.sections.length} sections)`);

  for (const l of data.links) {
    if (!l.href.startsWith(origin)) continue;
    if (/\.(pdf|zip|png|jpg|svg)$/i.test(l.href)) continue;
    const k = l.href.replace(/#.*$/, '').replace(/\/$/, '');
    if (!seen.has(k)) queue.push(l.href);
  }
}

await writeFile(`${OUT}/sitemap.json`, JSON.stringify(map, null, 2));
console.log(`\nCrawled ${map.length} page(s) -> ${OUT}/sitemap.json`);
await browser.close();
