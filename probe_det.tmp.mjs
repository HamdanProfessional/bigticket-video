import { readFile } from 'node:fs/promises';
import { record } from './src/record.mjs';
import { REELS_PROFILE } from './src/sites/bigticket-reels.mjs';
const sb = JSON.parse(await readFile('out/punchy-reel-about-comparing-every-seller-in-one--vertical-kinetic-1d/storyboard.json','utf8'));
await record({ ...sb, shots: sb.shots.slice(0,3) }, process.argv[2], {
  components: REELS_PROFILE.components, extract: REELS_PROFILE.extract,
  hide: REELS_PROFILE.hide, authRequired: true, onProgress: () => {},
});
console.log('FINISHED', process.argv[2]);
