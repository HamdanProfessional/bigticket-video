// Muxes the frame sequence and the generated score into a delivery file.
import { spawn } from 'node:child_process';
import path from 'node:path';

export function run(cmd, args, { quiet = true } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit', shell: false });
    let err = '';
    if (quiet) {
      p.stderr.on('data', (d) => (err += d.toString()));
      p.stdout.on('data', () => {});
    }
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}\n${err.slice(-2500)}`))
    );
  });
}

export async function renderVideo({ framesDir, audioPath, outPath, fps, duration, outWidth, outHeight, grade = 1 }) {
  // Capture happens above the site's responsive breakpoint; the downscale to
  // delivery size also cleans up any residual aliasing from the CSS zoom.
  const scale = outWidth && outHeight ? `scale=${outWidth}:${outHeight}:flags=lanczos,` : '';
  const args = [
    '-y', '-v', 'error',
    '-framerate', String(fps),
    '-i', path.join(framesDir, 'f%05d.jpg'),
  ];
  if (audioPath) args.push('-i', audioPath);

  args.push(
    '-map', '0:v:0',
    ...(audioPath ? ['-map', '1:a:0'] : []),
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    // Fade the picture up from and down to white to match the score's fades.
    '-vf', [
      scale.replace(/,$/, ''),
      // --- grade -------------------------------------------------------
      // A raw screenshot is flat sRGB and reads as a screenshot. A gentle
      // S-curve with the blacks lifted slightly toward the brand's blue-purple
      // gives it a graded look without tinting the white UI.
      `curves=r='0/0.012 0.5/0.5 1/0.995':g='0/0.014 0.5/0.502 1/0.997':b='0/0.030 0.5/0.516 1/1'`,
      `eq=saturation=${(1 + 0.08 * grade).toFixed(3)}:contrast=${(1 + 0.05 * grade).toFixed(3)}:gamma=0.99`,
      // Recover the micro-contrast lost in the downscale.
      `unsharp=3:3:${(0.45 * grade).toFixed(2)}:3:3:0`,
      `vignette=PI/${(6.5 - grade).toFixed(2)}`,
      // Grain is what stops flat brand gradients from banding, and it is the
      // single strongest "this is film, not a capture" cue.
      `noise=alls=${Math.round(4 * grade)}:allf=t+u`,
      // --- programme fades ---------------------------------------------
      `fade=t=in:st=0:d=0.5:color=white`,
      // Short, and late. A 0.9s fade-out ate the last 27 frames of the sign-off
      // card, so every ad threw away its own call to action — the last thing on
      // screen was blank white, not the CTA. The score still fades over ~2s, so
      // the ending stays soft without the picture erasing itself.
      `fade=t=out:st=${Math.max(0, duration - 0.32).toFixed(2)}:d=0.32:color=white`,
      'format=yuv420p',
    ].filter(Boolean).join(','),
    '-movflags', '+faststart',
  );
  if (audioPath) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
  args.push(outPath);

  await run('ffmpeg', args);
  return outPath;
}

// A looping poster GIF/thumbnail is handy for previewing a batch at a glance.
export async function renderPoster({ framesDir, outPath, frameIndex = 0 }) {
  await run('ffmpeg', [
    '-y', '-v', 'error',
    '-i', path.join(framesDir, `f${String(frameIndex).padStart(5, '0')}.jpg`),
    '-vf', 'scale=640:-1',
    outPath,
  ]);
  return outPath;
}
