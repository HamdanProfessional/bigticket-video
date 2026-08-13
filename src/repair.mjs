// Repairing half-painted frames, after the fact.
//
// Chromium's rasteriser sometimes hands back a surface it has only partly
// drawn: a heading missing, a photograph sliced off at a hard vertical edge,
// the neighbouring card simply absent. The recorder tries to catch these as it
// goes by comparing each JPEG against the previous one's size, but that test is
// weak in the case that actually hurts. The failure is usually not one bad
// frame among good ones — it is a sustained alternation, good/bad/good/bad, a
// strobe at half the frame rate. When every other frame is damaged, "compare to
// the previous frame" is comparing two damaged frames as often as not.
//
// This pass runs once the sequence is complete, which buys the one thing the
// recorder cannot have: both neighbours. A damaged frame is darker in detail
// than the frames on either side of it, because flat fill has replaced texture.
// Measure that directly and the strobe separates cleanly — on the cut this was
// built against, damaged frames sat at ~2.7 and intact ones at ~6.2.
//
// The repair is to hold the last intact frame. A frame held for an extra 33ms
// is not visible; a photograph flashing in and out at 15Hz is the thing being
// complained about.

import { readFile, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { run } from './render.mjs';

// Detail is measured on a small greyscale copy. The artefact is a large flat
// region, so it survives the downscale intact, and 120px keeps a 1500-frame
// sequence to about 35MB of pixels rather than several gigabytes.
const W = 120;

// A frame is damaged when it carries clearly less detail than the better of its
// two neighbours. The ratio catches the drop; the absolute floor stops a
// genuinely flat frame — a fade, a plain card — from being called damaged
// because its neighbours are a shade less flat.
const DETAIL_RATIO = 0.93;
const DETAIL_FLOOR = 0.35;
// Two, and no more. A repaired frame donates its donor's detail forward, so a
// third pass starts flagging the honest frame *after* each repair, then a
// fourth flags the one after that — measured on the cut this was built
// against, passes three and four added eleven frames each, every one of them
// exactly one frame past the previous pass's addition. That is a cascade
// walking through the film, not detection. Pass two only ever picks up frames
// adjacent to a pass-one cluster, which is the run of three the neighbour test
// genuinely cannot see.
const MAX_PASSES = 2;
const MAX_REPAIR_FRACTION = 0.15;

const frameFile = (dir, i) => path.join(dir, `f${String(i).padStart(5, '0')}.jpg`);

/**
 * Find half-painted frames in a rendered sequence and hold the previous intact
 * frame over each. Mutates the directory in place.
 *
 * @param {string} framesDir  Directory of f00000.jpg…
 * @param {number} frameCount
 * @param {object} [o]
 * @param {number} [o.height]  Frame height, to size the greyscale copy.
 * @returns {Promise<{checked:number, repaired:number, clusters:Array}>}
 */
export async function repairFrames(framesDir, frameCount, o = {}) {
  if (frameCount < 3) return { checked: frameCount, repaired: 0, clusters: [] };

  // Even height keeps ffmpeg's scaler happy on the odd aspect ratios.
  const aspect = (o.height || 1920) / (o.width || 1080);
  const H = Math.max(2, Math.round(W * aspect / 2) * 2);
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

  // Mean absolute horizontal gradient: how much texture the frame carries.
  const detail = (i) => {
    const a = buf.subarray(i * stride, (i + 1) * stride);
    let s = 0;
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W - 1; x++) s += Math.abs(a[row + x + 1] - a[row + x]);
    }
    return s / (H * (W - 1));
  };
  const E = Array.from({ length: n }, (_, i) => detail(i));

  // Comparing against immediate neighbours misses a run of three or more, where
  // both neighbours are damaged too and the pair excuse each other. Rather than
  // widen the window — which would start flagging honest motion — repeat the
  // test against the detail levels as repaired so far. Each pass pushes the
  // reference outwards by one frame until the run is eaten from both ends.
  const damaged = new Set();
  const D = E.slice();
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let found = 0;
    for (let i = 1; i < n - 1; i++) {
      if (damaged.has(i)) continue;
      // The better neighbour, not the average: in a strobe one neighbour is
      // intact and one is not, and averaging splits the difference.
      const ref = Math.max(D[i - 1], D[i + 1]);
      if (D[i] < ref * DETAIL_RATIO && ref - D[i] > DETAIL_FLOOR) { damaged.add(i); found++; }
    }
    if (!found) break;
    // A repaired frame carries its donor's detail, which is what the next pass
    // must compare against.
    for (let i = 1; i < n; i++) if (damaged.has(i)) D[i] = D[i - 1];
    // Runaway guard: past this the sequence is not strobing, it is just soft,
    // and holding more of it would do more harm than the artefact.
    if (damaged.size > n * MAX_REPAIR_FRACTION) break;
  }

  let lastGood = 0;
  for (let i = 0; i < n; i++) {
    if (damaged.has(i)) await copyFile(frameFile(framesDir, lastGood), frameFile(framesDir, i));
    else lastGood = i;
  }

  // Grouped for the log — one line per burst is readable, 111 lines is not.
  const idx = [...damaged].sort((a, b) => a - b);
  const clusters = [];
  for (const i of idx) {
    const last = clusters[clusters.length - 1];
    if (last && i - last.end <= 6) { last.end = i; last.count++; }
    else clusters.push({ start: i, end: i, count: 1 });
  }

  await rm(rawPath, { force: true });
  return { checked: n, repaired: damaged.size, clusters };
}
