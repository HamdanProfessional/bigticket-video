/* eslint-env browser */
/**
 * Injected into the live page. Provides a virtual camera over the real DOM plus
 * an overlay layer (cursor, captions, spotlight, letterbox, wipes).
 *
 * Two rules make this work:
 *  - The camera is scroll + a transform on <body>. Scroll keeps the site's own
 *    reveal-on-view animations honest; the transform adds zoom, X-pan, rotation
 *    and sub-pixel Y so motion is smooth instead of stair-stepping.
 *  - The overlay is appended to <html>, NOT <body>, so the camera transform
 *    never scales the cursor or captions.
 */
(() => {
  if (window.__BT) return;

  const NS = 'bt-overlay-root';
  const doc = document;
  const root = doc.documentElement;

  // ---------------------------------------------------------------- overlay
  const layer = doc.createElement('div');
  layer.id = NS;
  layer.style.cssText = [
    'position:fixed', 'inset:0', 'pointer-events:none', 'z-index:2147483647',
    'overflow:hidden', 'contain:strict',
  ].join(';');
  root.appendChild(layer);

  const mk = (css, parent = layer) => {
    const el = doc.createElement('div');
    el.style.cssText = css;
    parent.appendChild(el);
    return el;
  };

  const barTop = mk('position:absolute;left:0;right:0;top:0;height:0;background:#0b0b12;opacity:0');
  const barBot = mk('position:absolute;left:0;right:0;bottom:0;height:0;background:#0b0b12;opacity:0');
  const vignette = mk('position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 45%,rgba(0,0,0,0.55) 100%)');
  const spot = mk('position:absolute;left:0;top:0;width:0;height:0;opacity:0');
  // Focus border. An SVG rect rather than a CSS border so the stroke can be
  // *drawn* around the element with dash-offset instead of just fading in —
  // the line travelling around the component is what reads as "look here".
  const SVGNS = 'http://www.w3.org/2000/svg';
  const ringSvg = doc.createElementNS(SVGNS, 'svg');
  ringSvg.setAttribute('fill', 'none');
  ringSvg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;opacity:0';
  const ringRect = doc.createElementNS(SVGNS, 'rect');
  ringRect.setAttribute('fill', 'none');
  ringRect.setAttribute('stroke-linecap', 'round');
  ringSvg.appendChild(ringRect);
  layer.appendChild(ringSvg);
  const wipe = mk('position:absolute;inset:0;opacity:0;background:#ffffff');

  // Caption card: the "this is the feature" beat.
  const cap = mk('position:absolute;left:0;right:0;opacity:0;display:flex;flex-direction:column;gap:10px;padding:0 92px;box-sizing:border-box');
  const capKicker = doc.createElement('div');
  const capTitle = doc.createElement('div');
  const capSub = doc.createElement('div');
  // Type matched to the site itself. An ad set in a different typeface to the
  // product it is advertising reads as a third-party edit; borrowing the site's
  // own stack makes the captions look like part of the brand.
  const siteFont = (() => {
    try {
      const h = doc.querySelector('h1, h2, h3') || doc.body;
      const f = getComputedStyle(h).fontFamily;
      return f && f.trim().length > 2 ? f : null;
    } catch { return null; }
  })();
  const FONT = siteFont || '"Inter","Segoe UI",-apple-system,system-ui,sans-serif';
  capKicker.style.cssText = `font:600 13px/1.2 ${FONT};letter-spacing:.18em;text-transform:uppercase;opacity:.72;overflow:hidden`;
  capTitle.style.cssText = `font:700 46px/1.12 ${FONT};letter-spacing:-.025em`;
  capSub.style.cssText = `font:400 20px/1.45 ${FONT};opacity:.78;max-width:640px`;
  const capRule = doc.createElement('div');
  capRule.style.cssText = 'height:2px;width:0;background:currentColor;opacity:.5;transform-origin:left center';
  cap.append(capKicker, capTitle, capRule, capSub);

  // --- kinetic type -------------------------------------------------------
  // A caption that just fades is the clearest "screen recording with text on
  // it" tell. Splitting the title into words inside overflow:hidden boxes lets
  // each word rise out from behind its own mask on a stagger, which is what
  // actual motion design looks like. Rebuilt only when the string changes.
  let titleWords = [];
  let titleCacheKey = '';
  function buildTitle(text) {
    if (titleCacheKey === text) return;
    titleCacheKey = text;
    capTitle.textContent = '';
    titleWords = [];
    for (const word of String(text).split(/\s+/).filter(Boolean)) {
      // Outer box clips; inner span is what actually translates.
      const box = doc.createElement('span');
      box.style.cssText = 'display:inline-block;overflow:hidden;vertical-align:bottom;padding:0 .06em .12em 0';
      const inner = doc.createElement('span');
      inner.style.cssText = 'display:inline-block;will-change:transform';
      inner.textContent = word;
      box.appendChild(inner);
      capTitle.appendChild(box);
      capTitle.appendChild(doc.createTextNode(' '));
      titleWords.push(inner);
    }
  }

  const easeOutQuint = (t) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 5);

  // Cursor: a real pointer silhouette + a click ripple.
  const cursorWrap = mk('position:absolute;left:0;top:0;opacity:0;will-change:transform');
  cursorWrap.innerHTML =
    '<svg width="26" height="34" viewBox="0 0 26 34" style="display:block;filter:drop-shadow(0 5px 12px rgba(16,10,40,.45))">' +
    '<path d="M3 2 L3 26 L9.2 20.2 L13.4 30.4 L17.6 28.6 L13.5 18.7 L21.5 18.4 Z" fill="#fff" stroke="#1b1230" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const ripple = mk('position:absolute;left:0;top:0;width:0;height:0;border-radius:50%;opacity:0;border:2px solid rgba(124,58,237,.85);transform:translate(-50%,-50%)');

  // Full-frame brand panel. Title cards are the main thing that separates an
  // ad from a screen recording: they segment the film into beats and give the
  // copy somewhere to live that isn't on top of the UI. Inserted BEFORE the
  // caption so the caption reads on top of it.
  const panel = doc.createElement('div');
  panel.style.cssText =
    'position:absolute;inset:0;opacity:0;' +
    // Deep ink rather than the site's own violet gradient. A panel in the
    // brand's exact hero colours sits flush against the hero and the two read
    // as one purple wall; this stays in the family but clearly separates.
    'background:linear-gradient(152deg,#0c0921 0%,#1a1046 52%,#33208a 100%)';
  // First child: the panel must sit UNDER the letterbox bars and the caption,
  // otherwise a title card paints over its own bars and they blink out.
  layer.insertBefore(panel, layer.firstChild);

  const brand = mk('position:absolute;opacity:0;display:flex;align-items:center;gap:10px');
  brand.innerHTML =
    `<span style="font:700 18px/1 ${FONT};letter-spacing:-.02em;color:#fff">big ticket.</span>`;

  // ------------------------------------------------------------ resolution
  const cache = new Map();
  const registry = new Map();

  /**
   * Binds a component name to a real element once, up front. Shots then refer
   * to "@boards" and never re-query. `climb` walks up to the enclosing card so
   * a heading selector can address the whole component it titles.
   */
  function register(name, spec) {
    let el = null;
    for (const s of [spec.sel, spec.fallback]) {
      if (!s) continue;
      el = resolve(s);
      if (el) break;
    }
    if (!el) { registry.delete(name); return null; }
    // A element can exist in the DOM but be collapsed to 0x0 by a responsive
    // utility class (this site hides its feature blocks below the xl
    // breakpoint). Framing that would point the camera at nothing, so treat it
    // as unresolved and let the caller drop the shot.
    {
      const r0 = el.getBoundingClientRect();
      if (r0.width < 40 || r0.height < 20) { registry.delete(name); return null; }
    }
    for (let i = 0; i < (spec.climb || 0) && el.parentElement && el.parentElement !== doc.body; i++) {
      el = el.parentElement;
    }
    // Or climb until the element is substantial enough to frame a shot on —
    // but stop before swallowing a page-length wrapper. On narrow viewports the
    // next parent up is often the entire scroll container, which is useless to
    // point a camera at.
    if (spec.minArea) {
      let guard = 0;
      const maxH = innerHeight * 1.6;
      while (el.parentElement && el.parentElement !== doc.body && guard++ < 8) {
        const r = el.getBoundingClientRect();
        if (r.width * r.height >= spec.minArea) break;
        const pr = el.parentElement.getBoundingClientRect();
        if (pr.height > maxH) break;
        el = el.parentElement;
      }
    }
    registry.set(name, el);
    return name;
  }

  function resolve(sel) {
    if (!sel) return null;
    if (sel.startsWith('@')) return registry.get(sel.slice(1)) || null;
    if (cache.has(sel)) {
      const c = cache.get(sel);
      if (c && c.isConnected) return c;
      cache.delete(sel);
    }
    let el = null;
    try {
      if (sel.startsWith('text=')) {
        const needle = sel.slice(5).toLowerCase();
        // Take the SMALLEST element whose text starts with the needle. Document
        // order would hand back some outer wrapper and the camera would then
        // frame a whole row instead of the one card we asked for; `climb`/
        // `minArea` widen the target deliberately from there.
        const hits = [...doc.querySelectorAll('h1,h2,h3,h4,p,button,a,span,div')].filter((n) => {
          if (!n.innerText || !n.innerText.trim().toLowerCase().startsWith(needle)) return false;
          const r = n.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        el = hits.sort((a, b) => {
          const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
          return ra.width * ra.height - rb.width * rb.height;
        })[0] || null;
      } else {
        // Prefer a VISIBLE match. Responsive sites ship both a desktop and a
        // mobile copy of the same block and hide one with display:none —
        // querySelector would hand back whichever comes first in the DOM,
        // which on mobile is the collapsed 0x0 desktop version.
        const all = [...doc.querySelectorAll(sel)];
        el = all.find((n) => {
          const r = n.getBoundingClientRect();
          return r.width > 1 && r.height > 1;
        }) || all[0] || null;
      }
    } catch { el = null; }
    if (el) cache.set(sel, el);
    return el;
  }

  // Page-space rect (independent of current scroll/zoom) — used by the host to
  // plan camera moves before the camera has moved.
  function pageRect(sel) {
    const el = resolve(sel);
    if (!el) return null;
    const prev = body.style.transform;
    body.style.transform = 'none';
    const r = el.getBoundingClientRect();
    const out = { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height };
    body.style.transform = prev;
    return out;
  }

  const body = doc.body;

  /**
   * The sharpness/speed dial.
   *
   * `will-change: transform` promotes body to a composited layer that is
   * rasterised ONCE at scale 1; every zoom then magnifies a stale bitmap and
   * the video looks soft. Without it Chromium re-rasterises text and vectors at
   * the current scale each frame — genuinely sharp, but ~4x slower to capture.
   *
   * Sharp is the default; fast mode is for previewing an edit.
   */
  function setFastRaster(on) {
    body.style.willChange = on ? 'transform' : 'auto';
  }
  setFastRaster(false);
  const maxScroll = () => Math.max(0, root.scrollHeight - innerHeight);

  // Page-space offset of body's border box, measured once while untransformed.
  const bodyOffset = (() => {
    const prev = body.style.transform;
    body.style.transform = 'none';
    const r = body.getBoundingClientRect();
    const o = { x: r.left + scrollX, y: r.top + scrollY };
    body.style.transform = prev;
    return o;
  })();

  // ---------------------------------------------------------------- camera
  function applyCamera(c) {
    const zoom = c.zoom ?? 1;
    const wantY = c.y ?? 0;
    const clamped = Math.max(0, Math.min(wantY, maxScroll()));
    const whole = Math.round(clamped);
    window.scrollTo(0, whole);
    // Whatever scroll couldn't express (clamping + sub-pixel) becomes transform.
    const residual = wantY - whole;

    const ox = c.originX ?? innerWidth / 2;
    const oy = c.originY ?? wantY + innerHeight / 2;
    // Shots express the focal point in page coordinates, but transform-origin
    // is relative to body's own border box — and body starts ~100px down this
    // page. Without this correction every zoom drifts by (zoom-1) * that gap.
    body.style.transformOrigin = `${ox - bodyOffset.x}px ${oy - bodyOffset.y}px`;
    body.style.transform =
      `translate3d(${(c.panX ?? 0).toFixed(3)}px,${(-residual).toFixed(3)}px,0)` +
      ` scale(${zoom.toFixed(5)})` +
      (c.rot ? ` rotate(${c.rot.toFixed(3)}deg)` : '');

    const f = [];
    if (c.blur) f.push(`blur(${c.blur.toFixed(2)}px)`);
    if (c.saturate != null && c.saturate !== 1) f.push(`saturate(${c.saturate.toFixed(3)})`);
    if (c.brightness != null && c.brightness !== 1) f.push(`brightness(${c.brightness.toFixed(3)})`);
    body.style.filter = f.length ? f.join(' ') : '';
  }

  // Live viewport rect (camera transform included) — for aiming overlays.
  function viewRect(sel) {
    const el = resolve(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  }

  // --------------------------------------------------------------- overlays
  function applyOverlay(o) {
    const W = innerWidth, H = innerHeight;

    const lb = o.letterbox || 0;
    const lbH = Math.round(H * 0.062 * lb);
    barTop.style.height = barBot.style.height = `${lbH}px`;
    barTop.style.opacity = barBot.style.opacity = lb > 0 ? '1' : '0';

    vignette.style.opacity = String(o.vignette || 0);
    // Panel geometry, shared with the caption block below so the copy sits
    // inside the panel and rides its entrance.
    let panelSide = null, panelPx = 0, panelDx = 0, panelDy = 0;
    if (o.panel && o.panel.opacity > 0.001) {
      panelSide = o.panel.side || null;
      panelDx = o.panel.dx || 0;
      panelDy = o.panel.dy || 0;
      // A side panel beats a full-frame card: the product stays on screen next
      // to the claim instead of being replaced by a slide for three seconds.
      if (panelSide) {
        panelPx = Math.round(W * (o.panel.width ?? 0.42));
        panel.style.left = panelSide === 'right' ? `${W - panelPx}px` : '0px';
        panel.style.right = 'auto';
        panel.style.width = `${panelPx}px`;
        // Cast shadow onto the page, plus a hairline of brand accent on the
        // inner edge so the join is a deliberate line and not a soft mush.
        // The drop shadow falls away from the panel; the accent line sits on the
        // opposite side — the panel's INNER edge, where it meets the page.
        const away = panelSide === 'right' ? -1 : 1;
        panel.style.boxShadow =
          `${44 * away}px 0 110px rgba(12,9,28,.38), inset ${-2 * away}px 0 0 rgba(124,58,237,.9)`;
      } else {
        panel.style.left = panel.style.right = '0px';
        panel.style.width = 'auto';
        panel.style.boxShadow = 'none';
      }
      panel.style.opacity = String(o.panel.opacity);
      panel.style.transform =
        (panelDx || panelDy) ? `translate(${panelDx.toFixed(2)}%,${panelDy.toFixed(2)}%)` : 'none';
      panel.style.clipPath = o.panel.clip || 'none';
    } else {
      panel.style.opacity = '0';
      panel.style.transform = 'none';
      panel.style.clipPath = 'none';
    }

    // Spotlight: a rounded-rect CUTOUT, not a radial gradient.
    //
    // An ellipse over a rectangular card darkens its corners unevenly and reads
    // as a dirty smudge rather than a lighting effect. A box-shadow with a huge
    // spread fills the entire frame outside a rounded rectangle that matches the
    // component, so the edge is clean and follows the component's own shape;
    // the blur radius is what softens it.
    if (o.spotlight && o.spotlight.opacity > 0.001) {
      const r = viewRect(o.spotlight.sel);
      if (r) {
        const pad = o.spotlight.pad ?? 22;
        const strength = (o.spotlight.strength ?? 0.5) * o.spotlight.opacity;
        spot.style.left = `${(r.x - pad).toFixed(1)}px`;
        spot.style.top = `${(r.y - pad).toFixed(1)}px`;
        spot.style.width = `${(r.w + pad * 2).toFixed(1)}px`;
        spot.style.height = `${(r.h + pad * 2).toFixed(1)}px`;
        spot.style.borderRadius = `${o.spotlight.radius ?? 22}px`;
        spot.style.boxShadow = `0 0 90px 9999px rgba(12,9,28,${strength.toFixed(3)})`;
        spot.style.opacity = '1';
      } else spot.style.opacity = '0';
    } else spot.style.opacity = '0';

    // Focus border, drawn around the component rather than faded in.
    if (o.highlight && o.highlight.opacity > 0.001) {
      const r = viewRect(o.highlight.sel);
      if (r) {
        const p = o.highlight.pad ?? 10;
        const w = r.w + p * 2, h = r.h + p * 2;
        const rad = o.highlight.radius ?? 16;
        ringSvg.style.left = `${(r.x - p).toFixed(1)}px`;
        ringSvg.style.top = `${(r.y - p).toFixed(1)}px`;
        ringSvg.setAttribute('width', Math.max(0, w).toFixed(1));
        ringSvg.setAttribute('height', Math.max(0, h).toFixed(1));
        ringRect.setAttribute('x', '1.25');
        ringRect.setAttribute('y', '1.25');
        ringRect.setAttribute('width', Math.max(0, w - 2.5).toFixed(1));
        ringRect.setAttribute('height', Math.max(0, h - 2.5).toFixed(1));
        ringRect.setAttribute('rx', String(rad));
        ringRect.setAttribute('stroke', o.highlight.color || '#7c3aed');
        ringRect.setAttribute('stroke-width', String(o.highlight.width ?? 2.5));
        // Perimeter of a rounded rect, near enough for a dash pattern.
        const perim = 2 * (w + h) - 8 * rad + 2 * Math.PI * rad;
        const draw = o.highlight.draw ?? 1;
        ringRect.setAttribute('stroke-dasharray', perim.toFixed(1));
        ringRect.setAttribute('stroke-dashoffset', (perim * (1 - draw)).toFixed(1));
        ringSvg.style.opacity = String(o.highlight.opacity);
      } else ringSvg.style.opacity = '0';
    } else ringSvg.style.opacity = '0';

    // Caption card. Type scales with the frame so the same copy works in a
    // 1440-wide landscape ad and a 540-wide vertical one.
    if (o.caption && o.caption.opacity > 0.001) {
      const c = o.caption;
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
      // Inside a side panel the copy has ~40% of the frame to live in, so it is
      // measured against the panel rather than the viewport.
      const colW = panelSide ? panelPx : W;
      const titleSize = clamp(colW * (panelSide ? 0.088 : 0.032), 22, 48);
      const subSize = clamp(colW * (panelSide ? 0.038 : 0.0145), 13, 21);
      const kickSize = clamp(colW * (panelSide ? 0.024 : 0.009), 10, 13);
      const padX = panelSide ? clamp(colW * 0.115, 22, 68) : clamp(W * 0.064, 30, 92);
      cap.style.padding = `0 ${Math.round(padX)}px`;
      capTitle.style.fontSize = `${titleSize.toFixed(1)}px`;
      capSub.style.fontSize = `${subSize.toFixed(1)}px`;
      capSub.style.maxWidth = `${Math.round(panelSide ? colW - padX * 2 : W * 0.62)}px`;
      capKicker.style.fontSize = `${kickSize.toFixed(1)}px`;
      if (panelSide) {
        cap.style.left = panelSide === 'right' ? `${W - panelPx}px` : '0px';
        cap.style.right = 'auto';
        cap.style.width = `${panelPx}px`;
      } else {
        cap.style.left = cap.style.right = '0px';
        cap.style.width = 'auto';
      }
      const dark = c.theme !== 'light';
      const fg = dark ? '#ffffff' : '#141026';
      capKicker.textContent = c.kicker || '';
      buildTitle(c.title || '');
      capSub.textContent = c.subtitle || '';

      // Per-element choreography off the caption's own in/out progress.
      const inP = c.inP ?? 1;
      const outP = c.outP ?? 0;
      const n = titleWords.length || 1;
      const stagger = Math.min(0.5 / n, 0.075);
      for (let i = 0; i < titleWords.length; i++) {
        // Each word gets the same length of runway, offset by its index.
        const wt = easeOutQuint((inP - i * stagger) / Math.max(0.15, 1 - (n - 1) * stagger));
        // Leaving: the whole line drifts up together rather than un-staggering.
        const off = (1 - wt) * 112 - outP * 26;
        titleWords[i].style.transform = `translateY(${off.toFixed(2)}%)`;
        titleWords[i].style.opacity = String(Math.min(wt, 1 - outP).toFixed(3));
      }
      // Kicker wipes up under its own mask, ahead of the title.
      const kt = easeOutQuint(inP / 0.55);
      capKicker.style.transform = `translateY(${((1 - kt) * 100).toFixed(1)}%)`;
      // Rule draws out left-to-right once the title has landed.
      const rt = easeOutQuint((inP - 0.35) / 0.5);
      capRule.style.width = `${(rt * (c.subtitle ? 54 : 88)).toFixed(1)}px`;
      capRule.style.opacity = String((0.5 * rt * (1 - outP)).toFixed(3));
      // Subtitle trails the title.
      const st = easeOutQuint((inP - 0.28) / 0.6);
      capSub.style.transform = `translateY(${((1 - st) * 14).toFixed(2)}px)`;
      capSub.style.opacity = String((0.78 * st * (1 - outP)).toFixed(3));
      capKicker.style.display = c.kicker ? 'block' : 'none';
      capSub.style.display = c.subtitle ? 'block' : 'none';
      capKicker.style.color = capTitle.style.color = capSub.style.color = fg;
      capKicker.style.color = dark ? 'rgba(255,255,255,.8)' : 'rgba(20,16,38,.6)';
      if (c.accent) capKicker.style.color = c.accent;
      // A side panel is a column, so its copy always ranges left however the
      // shot asked for it to be aligned.
      const alignCentre = !panelSide && c.align === 'center';
      cap.style.alignItems = alignCentre ? 'center' : 'flex-start';
      cap.style.textAlign = alignCentre ? 'center' : 'left';
      const anchor = panelSide ? 'center' : (c.anchor ?? 'bottom');
      cap.style.top = anchor === 'center' ? '50%' : anchor === 'top' ? '13%' : 'auto';
      // Sits clear of the brand mark in the bottom-left corner.
      cap.style.bottom = anchor === 'bottom' ? `${Math.round(H * 0.17)}px` : 'auto';
      // The container no longer fades or rises — each element animates itself
      // above. Fading the whole block as well would flatten the stagger back
      // into the single dissolve this replaced.
      // The copy rides the panel's entrance: cap and panel are the same width,
      // so the panel's percentage translate applies unchanged.
      // dx is a percentage of the panel's width, which cap now matches, so it
      // carries across directly; dy is a percentage of the frame HEIGHT, which
      // cap does not match, so it is converted to pixels first.
      const capTy = anchor === 'center' ? -50 : 0;
      cap.style.transform =
        `translate(${panelDx.toFixed(2)}%, ${capTy}%) translateY(${(panelDy * H / 100).toFixed(1)}px)`;
      cap.style.clipPath = o.panel && o.panel.clip ? o.panel.clip : 'none';
      cap.style.opacity = String(Math.min(1, c.opacity * 4));
      cap.style.textShadow = dark ? '0 2px 30px rgba(10,6,30,.45)' : 'none';
    } else cap.style.opacity = '0';

    // Cursor + click ripple.
    if (o.cursor && o.cursor.opacity > 0.001) {
      const cu = o.cursor;
      let x = cu.x, y = cu.y;
      if (cu.sel) {
        const r = viewRect(cu.sel);
        if (r) { x = r.cx + (cu.dx || 0); y = r.cy + (cu.dy || 0); }
      }
      const press = cu.press || 0; // 0..1, dips the cursor on click
      cursorWrap.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) scale(${(1 - press * 0.16).toFixed(3)})`;
      cursorWrap.style.opacity = String(cu.opacity);
      if (cu.ripple > 0.001) {
        const s = 14 + cu.ripple * 78;
        ripple.style.left = `${x + 2}px`;
        ripple.style.top = `${y + 2}px`;
        ripple.style.width = ripple.style.height = `${s}px`;
        ripple.style.opacity = String(Math.max(0, 1 - cu.ripple) * 0.85);
      } else ripple.style.opacity = '0';
    } else {
      cursorWrap.style.opacity = '0';
      ripple.style.opacity = '0';
    }

    // Transition wipe / flash.
    if (o.wipe && o.wipe.opacity > 0.001) {
      const w = o.wipe;
      wipe.style.background = w.color || '#ffffff';
      wipe.style.opacity = String(w.opacity);
      if (w.dir === 'left') wipe.style.clipPath = `inset(0 0 0 ${((1 - w.cover) * 100).toFixed(2)}%)`;
      else if (w.dir === 'right') wipe.style.clipPath = `inset(0 ${((1 - w.cover) * 100).toFixed(2)}% 0 0)`;
      else if (w.dir === 'up') wipe.style.clipPath = `inset(${((1 - w.cover) * 100).toFixed(2)}% 0 0 0)`;
      else wipe.style.clipPath = 'inset(0)';
    } else {
      wipe.style.opacity = '0';
      wipe.style.clipPath = 'inset(0)';
    }

    // Persistent brand mark.
    if (o.brand && o.brand.opacity > 0.001) {
      brand.style.opacity = String(o.brand.opacity);
      brand.style.left = '52px';
      // Bottom-left: the top-left corner is where the site puts its own logo,
      // and the two marks stacked on each other read as a rendering fault.
      brand.style.top = 'auto';
      brand.style.bottom = `${Math.round(H * 0.062 * (o.letterbox || 0)) + 26}px`;
      brand.firstChild.style.color = o.brand.dark ? '#141026' : '#fff';
    } else brand.style.opacity = '0';
  }

  function frame(state) {
    applyCamera(state.cam || {});
    applyOverlay(state.ov || {});
  }

  /**
   * Neutralises the site's own easing so reveal-on-view content snaps to its
   * final state the instant it enters frame, instead of fading in over real
   * time that our deterministic frame stepping doesn't advance.
   *
   * Deliberately scoped to `body` and deliberately NOT touching opacity: an
   * earlier version force-set `opacity:1` on everything under `main`, which
   * unhid a full-bleed white overlay and painted the whole page blank. The
   * priming scroll pass is what actually reveals the content; this only stops
   * it animating.
   */
  function freezeSiteMotion() {
    const s = doc.createElement('style');
    s.textContent = `body *,body *::before,body *::after{
      transition-duration:0s !important;
      transition-delay:0s !important;
      animation-duration:0.001s !important;
      animation-delay:0s !important;
    }
    html{scroll-behavior:auto !important;}`;
    doc.head.appendChild(s);
  }

  window.__BT = {
    frame, pageRect, viewRect, resolve, register, setFastRaster,
    freezeSiteMotion, maxScroll,
    docHeight: () => root.scrollHeight,
  };
})();
