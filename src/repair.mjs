// Repairing half-painted frames, after the fact.
//
// Chromium's rasteriser sometimes hands back a surface it has only partly
// drawn: a heading missing, a photograph sliced off at a hard vertical edge,
// the neighbouring card simply absent. Pulled apart frame by frame, it is
// rarely one bad frame among good ones — it is good/bad/good/bad, a strobe at
// half the frame rate, which is why it reads as flicker rather than a glitch.
//
// Detecting it is the whole problem, and the trap is that a half-painted frame
// and a cross-dissolve look identical to any measure of "how much detail is in
// this frame": both are frames with less in them than their neighbours. Holding
// a frame over a dissolve replaces a smooth transition with a hard stutter, so
// a detector that cannot tell them apart does more damage than it repairs.
//
// What separates them is that damage collapses against BOTH neighbours at once.
// A block that carries texture in the frame before AND the frame after, but not
// in this one, has lost content that existed on either side of it — no camera
// move and no transition can produce that. A dissolve cannot: it is monotonic,
// so each of its frames sits between its neighbours, darker than one and
// brighter than the other. The rule excludes transitions by construction rather
// than by a threshold, which is what the earlier versions of this got wrong.
//
// It also survives camera motion, which matters because the camera is moving in
// almost every shot. Tests that ask whether the rest of the frame is unchanged
// go blind the moment anything pans or zooms.
//
// Measured against the cut this was built for: 42 damaged frames of 1455 in the
// original render, 13 in the render after the focus ring was given its own
// layer, no dissolve touched in either.

import { readFile, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { run } from './render.mjs';

// Detail is measured on a small greyscale copy. The artefact is a large flat
// region, so it survives the downscale, and 120px keeps a 1500-frame sequence
// to about 35MB of pixels rather than several gigabytes.
// 240, not 120. At 120 each pixel averages nine of the original, which is
// enough to hide a small tile completely — a pass that reported the film clean
// still had visible damage at cuts. 240 finds it; 360 finds exactly the same
// frames for four times the memory, so there is nothing above this worth
// paying for.
const W = 240;
// Fourteen: the artefact is often a single raster tile, and on a coarser grid
// its loss was diluted across blocks that were mostly fine.
const BLOCK = 14;

// A neighbouring block must carry real texture before its loss means anything.
const TEXTURE_FLOOR = 2;
// How far texture has to fall to count as collapsed rather than merely softer.
const COLLAPSE = 0.45;
// Blocks that must collapse before a frame is worth holding another over. Two
// can happen where a highlight crosses an edge; three does not.
const MIN_LOST_BLOCKS = 3;

const frameFile = (dir, i) => path.join(dir, `f${String(i).padStart(5, '0')}.jpg`);

/**
 * Find half-painted frames in a rendered sequence and hold the previous intact
 * frame over each. Mutates the directory in place.
 *
 * @param {string} framesDir  Directory of f00000.jpg…
 * @param {number} frameCount
 * @param {object} [o]
 * @param {number} [o.width]
 * @param {number} [o.height]
 * @returns {Promise<{checked:number, repaired:number, clusters:Array}>}
 */
export async function repairFrames(framesDir, frameCount, o = {}) {
  if (frameCount < 3) return { checked: frameCount, repaired: 0, clusters: [] };

  // Even height keeps ffmpeg's scaler happy on the odd aspect ratios.
  const aspect = (o.height || 1920) / (o.width || 1080);
  const H = Math.max(BLOCK * 2, Math.round((W * aspect) / 2) * 2);
  const rawPath = path.join(framesDir, '_detail.gray');

  await run('ffmpeg', [
    '-v', 'error',
    '-start_number', '0',
    '-i', path.join(framesDir, 'f%05d.jpg'),
    '-vf', `scale=${W}:${H},format=gray`,
    '-f', 'rawvideo', '-pix_fmt', 'gray',
    rawPath, '-y',
  ]);

  const buf = await readFile(rawPath);
  const stride = W * H;
  const n = Math.min(frameCount, Math.floor(buf.length / stride));
  const frame = (i) => buf.subarray(i * stride, (i + 1) * stride);
  const BX = Math.floor(W / BLOCK);
  const BY = Math.floor(H / BLOCK);

  // Texture per block per frame, computed once. Every test below is a
  // comparison between three frames' worth of these numbers.
  const blocks = BX * BY;
  const T = new Float32Array(n * blocks);
  for (let i = 0; i < n; i++) {
    const a = frame(i);
    for (let by = 0; by < BY; by++) {
      for (let bx = 0; bx < BX; bx++) {
        let g = 0, c = 0;
        for (let y = by * BLOCK; y < (by + 1) * BLOCK; y++) {
          for (let x = bx * BLOCK; x < (bx + 1) * BLOCK - 1; x++, c++) {
            g += Math.abs(a[y * W + x + 1] - a[y * W + x]);
          }
        }
        T[i * blocks + by * BX + bx] = g / c;
      }
    }
  }

  // Blocks that carry texture in both the frame before and the frame after, but
  // not in this one. Content that exists on either side and not in the middle
  // was not removed by the camera or by a transition.
  const collapsed = (i, before, after) => {
    let lost = 0;
    for (let b = 0; b < blocks; b++) {
      const h = T[i * blocks + b], p = T[before * blocks + b], q = T[after * blocks + b];
      if (p > TEXTURE_FLOOR && q > TEXTURE_FLOOR && h < p * COLLAPSE && h < q * COLLAPSE) lost++;
    }
    return lost;
  };

  const flagged = new Set();
  // Two passes. Damage arrives in short runs, and a run of two hides itself:
  // each frame's neighbour is the other damaged frame, which carries no texture
  // to lose against. The second pass reaches past anything already condemned.
  for (let pass = 0; pass < 2; pass++) {
    const reach = (i, dir) => {
      for (let d = 1; d <= 4; d++) {
        const j = i + dir * d;
        if (j < 0 || j >= n) return -1;
        if (pass === 0 || !flagged.has(j)) return j;
      }
      return -1;
    };
    for (let i = 1; i < n - 1; i++) {
      if (flagged.has(i)) continue;
      const before = reach(i, -1), after = reach(i, 1);
      if (before < 0 || after < 0) continue;
      if (collapsed(i, before, after) >= MIN_LOST_BLOCKS) flagged.add(i);
    }
  }

  // Which neighbour to hold. Reaching backwards is the obvious choice and the
  // wrong one: most of what survives lands in the first frames AFTER a cut,
  // where the camera has jumped and the tiles have not caught up, and the
  // previous good frame belongs to the outgoing shot. Holding it would splice a
  // frame of the old shot into the new one, which is worse than the artefact.
  //
  // Rather than thread shot boundaries through, pick whichever clean neighbour
  // looks more like the frame being replaced. Within a shot both are close and
  // either will do; across a cut the outgoing shot is wildly different and this
  // reaches forward on its own.
  const distance = (i, j) => {
    const a = frame(i), b = frame(j);
    let s = 0;
    for (let k = 0; k < stride; k += 7) s += Math.abs(a[k] - b[k]);
    return s;
  };
  const clean = (i, dir) => {
    for (let j = i + dir; j >= 0 && j < n; j += dir) if (!flagged.has(j)) return j;
    return -1;
  };
  for (let i = 0; i < n; i++) {
    if (!flagged.has(i)) continue;
    const back = clean(i, -1), fwd = clean(i, 1);
    let donor = back;
    if (back < 0) donor = fwd;
    else if (fwd >= 0 && distance(i, fwd) < distance(i, back)) donor = fwd;
    if (donor >= 0) await copyFile(frameFile(framesDir, donor), frameFile(framesDir, i));
  }

  // Grouped for the log — one line per burst is readable, twenty is not.
  const clusters = [];
  for (const i of [...flagged].sort((a, b) => a - b)) {
    const last = clusters[clusters.length - 1];
    if (last && i - last.end <= 6) { last.end = i; last.count++; }
    else clusters.push({ start: i, end: i, count: 1 });
  }

  await rm(rawPath, { force: true });
  return { checked: n, repaired: flagged.size, clusters };
}
