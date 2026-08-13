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
// Two things separate them, and both are needed:
//
//   Damage is LOCAL. A region goes flat while the rest of the frame stays
//   pixel-identical to its neighbour. A dissolve is global — every block
//   changes together. So work in blocks: damage shows most blocks identical
//   and a minority that have lost their texture.
//
//   Damage OSCILLATES. The detail curve reverses direction again and again
//   across a strobe. A dissolve moves one way and stays there.
//
// Measured on the cut this was built against, the two conditions together
// flagged 18 frames of 1455, every one of them inside the two bursts that were
// actually reported, with no dissolve touched. Detail alone flagged 111, of
// which the majority were the film's own transitions.

import { readFile, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { run } from './render.mjs';

// Detail is measured on a small greyscale copy. The artefact is a large flat
// region, so it survives the downscale, and 120px keeps a 1500-frame sequence
// to about 35MB of pixels rather than several gigabytes.
const W = 120;
const BLOCK = 15;

// A frame is only a candidate if it carries less detail than its reference.
const DETAIL_RATIO = 0.93;
// Most of the frame must be untouched — that is what makes the loss local.
const MIN_SAME = 0.45;
// …and enough of it must have gone flat to be worth holding a frame over.
const MIN_LOST = 0.10;
// Below this the block is flat anyway and its texture cannot meaningfully drop.
const MIN_REF_TEXTURE = 1.5;
// Reversals in the detail curve that mark a strobe rather than a transition.
const MIN_REVERSALS = 2;
// Ignore detail wobble smaller than this when counting reversals.
const REVERSAL_FLOOR = 0.5;

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

  // Mean absolute horizontal gradient: how much texture a frame carries.
  const detail = (i) => {
    const a = frame(i);
    let s = 0;
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W - 1; x++) s += Math.abs(a[row + x + 1] - a[row + x]);
    }
    return s / (H * (W - 1));
  };
  const E = Array.from({ length: n }, (_, i) => detail(i));

  const blockTexture = (i, bx, by) => {
    const a = frame(i);
    let g = 0, c = 0;
    for (let y = by * BLOCK; y < (by + 1) * BLOCK; y++) {
      for (let x = bx * BLOCK; x < (bx + 1) * BLOCK - 1; x++, c++) {
        g += Math.abs(a[y * W + x + 1] - a[y * W + x]);
      }
    }
    return g / c;
  };
  const blockDiff = (i, j, bx, by) => {
    const a = frame(i), b = frame(j);
    let s = 0, c = 0;
    for (let y = by * BLOCK; y < (by + 1) * BLOCK; y++) {
      for (let x = bx * BLOCK; x < (bx + 1) * BLOCK; x++, c++) {
        s += Math.abs(a[y * W + x] - b[y * W + x]);
      }
    }
    return s / c;
  };

  // A strobe reverses direction again and again; a dissolve never does.
  const reversals = (i) => {
    let r = 0, dir = 0;
    for (let j = Math.max(1, i - 3); j <= Math.min(n - 1, i + 3); j++) {
      const d = E[j] - E[j - 1];
      if (Math.abs(d) < REVERSAL_FLOOR) continue;
      const s = Math.sign(d);
      if (dir && s !== dir) r++;
      dir = s;
    }
    return r;
  };

  const flagged = new Set();
  // The nearest frame not already condemned, preferring the most detailed —
  // needed because damage arrives in adjacent pairs, and an immediate
  // neighbour that is itself damaged makes the pair excuse each other.
  const nearestClean = (i) => {
    let best = -1;
    for (let d = 1; d <= 4; d++) {
      for (const j of [i - d, i + d]) {
        if (j < 0 || j >= n || flagged.has(j)) continue;
        if (best < 0 || E[j] > E[best]) best = j;
      }
    }
    return best;
  };

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < n - 1; i++) {
      if (flagged.has(i)) continue;
      const ref = pass === 0 ? (E[i - 1] >= E[i + 1] ? i - 1 : i + 1) : nearestClean(i);
      if (ref < 0 || E[i] >= E[ref] * DETAIL_RATIO) continue;
      if (reversals(i) < MIN_REVERSALS) continue;

      let same = 0, lost = 0, total = 0;
      for (let by = 0; by < BY; by++) {
        for (let bx = 0; bx < BX; bx++) {
          total++;
          if (blockDiff(i, ref, bx, by) < 2) { same++; continue; }
          const here = blockTexture(i, bx, by);
          const there = blockTexture(ref, bx, by);
          if (there > MIN_REF_TEXTURE && here < there * 0.5) lost++;
        }
      }
      if (same / total > MIN_SAME && lost / total > MIN_LOST) flagged.add(i);
    }
  }

  let lastGood = 0;
  for (let i = 0; i < n; i++) {
    if (flagged.has(i)) await copyFile(frameFile(framesDir, lastGood), frameFile(framesDir, i));
    else lastGood = i;
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
