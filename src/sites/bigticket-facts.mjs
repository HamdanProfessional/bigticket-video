/**
 * Reads the numbers off a Big Ticket product page so copy can quote them.
 *
 * Runs in page context via `page.evaluate`, so it must be self-contained — no
 * imports, no closure over anything in this module.
 *
 * The one piece of real domain knowledge here: prices render with the cents in
 * a superscript span, so `innerText` concatenates them and "$229.95" arrives as
 * the string "$22995". Everything downstream depends on splitting the last two
 * digits back off, and the same page also contains "(31 reviews)" and bare
 * axis numbers, so the parse has to be anchored rather than greedy.
 */
export function extractFacts() {
  const money = (raw) => {
    // "22995" -> 229.95. Cents are always two digits because they come from a
    // separate element that is never abbreviated.
    const digits = String(raw).replace(/[^\d]/g, '');
    if (digits.length < 3) return null;
    return Number(digits.slice(0, -2)) + Number(digits.slice(-2)) / 100;
  };
  const fmt = (n) => (n == null ? null : `$${n.toFixed(2)}`);
  const nodes = [...document.querySelectorAll('body *')]
    .filter((e) => typeof e.innerText === 'string')
    .map((e) => ({ e, t: e.innerText.replace(/\s+/g, ' ').trim(), kids: e.children.length }));

  // --- sellers and the price they are all quoting ------------------------
  // The retailer rows read "Best Buy $22995". Taking the price from the row
  // rather than from a global sweep keeps chart labels and struck-through
  // "was" prices out of it.
  const rows = nodes.filter((n) => /^[A-Z][\w' &.-]{2,24} \$\d{3,}$/.test(n.t) && n.kids <= 4);
  const seen = new Map();
  for (const r of rows) {
    const m = r.t.match(/^(.+?) \$(\d+)$/);
    if (m && !seen.has(m[1])) seen.set(m[1], money(m[2]));
  }
  const sellers = [...seen.keys()];
  const prices = [...seen.values()].filter((v) => v != null);
  const price = prices.length ? Math.min(...prices) : null;

  // --- price history -----------------------------------------------------
  // Chart labels read "$19995(Oct 2025)" or "$19995 Oct 2025".
  const hist = [];
  for (const n of nodes) {
    if (n.kids > 3) continue;
    const m = n.t.match(/^\$(\d{3,})\s*\(?([A-Z][a-z]{2} \d{4})\)?$/);
    if (m) hist.push({ value: money(m[1]), when: m[2] });
  }
  const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
  const stamp = (when) => {
    const [mo, yr] = String(when).split(' ');
    const i = MONTHS.indexOf(mo);
    return i < 0 ? -1 : Number(yr) * 12 + i;
  };
  const valued = hist.filter((h) => h.value != null);
  const byValue = [...valued].sort((a, b) => a.value - b.value);
  // Among equal lows, quote the MOST RECENT one. This price sat at $199.95 in
  // both Mar and Oct 2025; "it was $199.95 in October" is both the stronger
  // line and the more honest one, because the older date implies the low is
  // further in the past than it is.
  const low = byValue.length
    ? valued.filter((h) => h.value === byValue[0].value).sort((a, b) => stamp(b.when) - stamp(a.when))[0]
    : null;
  const high = byValue.length ? byValue[byValue.length - 1] : null;

  // --- reviews -----------------------------------------------------------
  // "4.4 (31 reviews)" once per retailer. Swept over the page's whole innerText
  // rather than per element: the rating sits beside a row of star glyphs, so
  // the enclosing node's child count varies by retailer and an element filter
  // silently found only the first of the three.
  const rev = [];
  const bodyText = (document.body.innerText || '').replace(/\s+/g, ' ');
  for (const m of bodyText.matchAll(/(\d(?:\.\d)?) \((\d+) reviews?\)/g)) {
    rev.push({ rating: Number(m[1]), count: Number(m[2]) });
  }
  const uniqRev = rev.filter((r, i) => rev.findIndex((o) => o.count === r.count && o.rating === r.rating) === i);
  const reviewCount = uniqRev.reduce((a, r) => a + r.count, 0) || null;
  // Weighted by how many reviews each retailer contributes, not a mean of means.
  const rating = reviewCount
    ? +(uniqRev.reduce((a, r) => a + r.rating * r.count, 0) / reviewCount).toFixed(1)
    : null;

  const overLow = price != null && low ? price - low.value : null;

  // The product name is not always an h1 on the mobile layout, so take the
  // first heading of any level that looks like a product title rather than a
  // section label.
  const heading = [...document.querySelectorAll('h1,h2,h3')]
    .map((h) => (h.innerText || '').replace(/\s+/g, ' ').trim())
    .find((t) => t.length > 12 && /[-–—]|\d/.test(t)) || null;

  return {
    product: heading,
    // The site's titles carry the retailer's full SKU string; a short brand
    // name reads better in 900-weight caps across a phone.
    brand: heading ? heading.split(/[\s-]+/)[0] : null,
    price: fmt(price),
    sellers: sellers.length || null,
    sellerNames: sellers.length ? sellers : null,
    low: fmt(low?.value ?? null),
    lowDate: low?.when || null,
    high: fmt(high?.value ?? null),
    // Whole dollars: "$30 over" is a headline, "$30.00 over" is an invoice.
    overLow: overLow != null && overLow > 0 ? `$${Math.round(overLow)}` : null,
    reviewCount: reviewCount ? String(reviewCount) : null,
    rating: rating != null ? String(rating) : null,
  };
}
