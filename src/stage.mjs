// Builds a STAGE: a local page assembled from an exported component library,
// which the existing recorder then films exactly as if it were the live site.
//
// This is the other half of "make the video from the shot library rather than
// from the site". Filming the site in place means every frame inherits the
// page's own background, margins and colour — a pale marketing page yields a
// pale 9:16 cut no matter what the camera does. On a stage the background is
// designed, so a frame can be dark, or brand violet, or nothing but a price at
// 200px.
//
// The whole trick is that a stage is just a webpage. The camera, the shot
// library, the caption system, the grade and the score all work unchanged;
// nothing downstream knows the difference. What changes is only what is being
// pointed at.
//
// Three kinds of material cross over differently, and the distinction matters:
//
//   photographs  exported as PNG at 3x. A product shot cannot be rebuilt and
//                does not need to be.
//   numbers      re-typeset from the extracted facts. Screenshotting a price
//                gives 14px of grey site UI; the fact gives type at any size.
//   the chart    REDRAWN as SVG from the extracted series. A screenshot of the
//                chart is the site's own pale rendering at a different size.
//
// Scenes are stacked in one tall document, because that is what the camera
// already knows how to move around.

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const BRAND = {
  ink: '#0b0820',
  ink2: '#160f3d',
  violet: '#7c3aed',
  violetLo: '#5b46e5',
  cyan: '#1cc8ee',
  paper: '#f7f5ff',
};

const FONT =
  '"Inter","Segoe UI",-apple-system,system-ui,sans-serif';

/** Chart redrawn from the extracted series, in the ad's palette. */
function chartSvg(series, w, h) {
  if (!series || series.length < 2) return '';
  const vs = series.map((p) => p.v);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const pad = 16;
  const span = Math.max(1e-6, hi - lo);
  const x = (i) => pad + (i * (w - pad * 2)) / (series.length - 1);
  // Inverted: a higher price is a higher point.
  const y = (v) => h - pad - ((v - lo) / span) * (h - pad * 2);
  const pts = series.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`);
  const line = `M${pts.join(' L')}`;
  const area = `${line} L${x(series.length - 1).toFixed(1)},${h - pad} L${x(0).toFixed(1)},${h - pad} Z`;
  const loI = vs.indexOf(lo), hiI = vs.indexOf(hi);
  return `
<svg class="chart" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" fill="none">
  <defs>
    <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${BRAND.cyan}" stop-opacity=".34"/>
      <stop offset="100%" stop-color="${BRAND.cyan}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <path d="${area}" fill="url(#fill)"/>
  <path d="${line}" stroke="${BRAND.cyan}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="${x(loI).toFixed(1)}" cy="${y(lo).toFixed(1)}" r="7" fill="${BRAND.cyan}"/>
  <circle cx="${x(hiI).toFixed(1)}" cy="${y(hi).toFixed(1)}" r="7" fill="#fff"/>
</svg>`;
}

/**
 * @param {object} lib   The library index written by library.mjs.
 * @param {object} o
 * @param {string} o.dir Library directory — images are referenced from here.
 * @param {number} [o.width]  Scene width; must match the capture width.
 * @param {number} [o.height] Scene height.
 */
export async function buildStage(lib, o = {}) {
  const dir = o.dir || 'library/reels';
  const W = o.width || 540;
  const H = o.height || 960;
  const f = lib.facts || {};
  const img = (name) => (lib.components?.[name] ? `${lib.components[name].file}` : null);

  const product = img('productShot') || img('tileToaster');
  const retailers = f.retailers || [];

  // Each scene is exactly one frame tall, so the camera's own framing maths —
  // which fits a component to the viewport — lands on a whole scene.
  const scene = (id, cls, inner) =>
    `<section class="scene ${cls}" id="${id}"><div class="inner">${inner}</div></section>`;

  const scenes = [
    // Product, full bleed on ink. The one frame the live page can never give:
    // no chrome, no margins, no white.
    scene('sceneProduct', 'dark', `
      ${product ? `<img class="hero" id="stageProduct" src="${product}" alt="">` : ''}
      <div class="eyebrow">${f.product ? esc(f.product.split(' - ')[0]) : 'This product'}</div>`),

    // The price, as the image rather than as a caption over one.
    scene('scenePrice', 'violet', `
      <div class="label">Every retailer wants</div>
      <div class="mega" id="stagePrice">${esc(f.price || '')}</div>`),

    // Retailers re-typeset: the site's rows are 14px grey; these are the point
    // of the ad, so they are set like it.
    scene('sceneRetailers', 'dark', `
      <div class="label">${retailers.length} retailers</div>
      <ul class="rows" id="stageRetailers">
        ${retailers.map((r) => `<li><span>${esc(r.name)}</span><b>${esc(r.price || '')}</b></li>`).join('')}
      </ul>`),

    // Chart redrawn in the ad's palette, with the low called out.
    scene('sceneChart', 'dark', `
      <div class="label">Price history</div>
      <div class="chartwrap" id="stageChart">${chartSvg(f.series, W - 72, 300)}</div>
      ${f.low ? `<div class="callout"><b>${esc(f.low)}</b><span>${esc(f.lowDate || '')}</span></div>` : ''}`),

    // The number the whole ad exists to show.
    scene('sceneDelta', 'violet', `
      <div class="label">You'd overpay by</div>
      <div class="mega" id="stageDelta">${esc(f.overLow || '')}</div>`),

    scene('sceneSignoff', 'ink', `
      <div class="wordmark">big ticket.</div>
      <div class="signoff" id="stageSignoff">Know the real price.</div>`),
  ].join('\n');

  const html = `<!doctype html>
<meta charset="utf-8">
<title>stage</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: ${BRAND.ink}; }
  body { font-family: ${FONT}; -webkit-font-smoothing: antialiased; }
  .scene {
    width: ${W}px; height: ${H}px; position: relative; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
  }
  .inner { width: 100%; height: 100%; position: relative;
           display: flex; flex-direction: column; align-items: flex-start;
           justify-content: center; gap: 18px; padding: 0 46px; }
  .dark   { background: radial-gradient(120% 90% at 50% 0%, ${BRAND.ink2} 0%, ${BRAND.ink} 70%); }
  .ink    { background: ${BRAND.ink}; }
  .violet { background: linear-gradient(150deg, ${BRAND.violetLo} 0%, ${BRAND.violet} 58%, ${BRAND.cyan} 165%); }

  .label    { font: 600 20px/1.2 ${FONT}; letter-spacing: .14em; text-transform: uppercase;
              color: rgba(255,255,255,.62); }
  .eyebrow  { position: absolute; left: 46px; bottom: 96px;
              font: 800 34px/1 ${FONT}; letter-spacing: -.03em; color: #fff; }
  /* Tabular figures: a price that changes on screen must not reflow. */
  .mega     { font: 900 132px/0.88 ${FONT}; letter-spacing: -.05em; color: #fff;
              font-variant-numeric: tabular-nums; }
  .hero     { position: absolute; inset: 0; width: 100%; height: 100%;
              object-fit: contain; padding: 12% 8% 22%;
              /* The product photo is shot on white. Screen blending would grey
                 it out on ink; a soft shadow and a slight lift keep it reading
                 as an object on a dark ground rather than a pasted rectangle. */
              filter: drop-shadow(0 40px 70px rgba(0,0,0,.55)) saturate(1.05); }
  .rows     { list-style: none; margin: 0; padding: 0; width: 100%; }
  .rows li  { display: flex; align-items: center; justify-content: space-between;
              padding: 22px 0; border-bottom: 1px solid rgba(255,255,255,.14);
              font: 700 30px/1 ${FONT}; color: #fff; letter-spacing: -.02em; }
  .rows b   { font-variant-numeric: tabular-nums; color: ${BRAND.cyan}; }
  .chartwrap{ width: 100%; }
  .callout  { display: flex; align-items: baseline; gap: 14px; }
  .callout b{ font: 900 76px/1 ${FONT}; letter-spacing: -.04em; color: ${BRAND.cyan};
              font-variant-numeric: tabular-nums; }
  .callout span { font: 600 22px/1 ${FONT}; color: rgba(255,255,255,.66); }
  .wordmark { font: 800 30px/1 ${FONT}; letter-spacing: -.02em; color: rgba(255,255,255,.72); }
  .signoff  { font: 900 68px/0.94 ${FONT}; letter-spacing: -.045em; color: #fff; }
</style>
${scenes}
`;

  await mkdir(dir, { recursive: true });
  const file = path.join(dir, 'stage.html');
  await writeFile(file, html);
  return file;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** Convenience: read a library index off disk and build its stage. */
export async function stageFromLibrary(dir = 'library/reels', o = {}) {
  const lib = JSON.parse(await readFile(path.join(dir, 'index.json'), 'utf8'));
  return buildStage(lib, { ...o, dir, width: o.width || lib.width, height: o.height || lib.height });
}
