// scripts/make-heads.js
// Extracts a headshot from each character's front-facing (down-0) bike frame for
// use as the dialogue-box portrait. All five atlases share leo's 48x48 layout
// (recolored from him), so one crop region works for all.
//
// Usage: node scripts/make-heads.js
// Output: public/assets/sprites/<id>_head.png  (22x22, transparent bg)

import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, '..', 'public', 'assets', 'sprites');
const IDS = ['leo', 'warren', 'mj', 'carson', 'justin'];

// down-0 frame starts at x=288; head sits at top-center of the 48x48 frame.
const CROP = { left: 288 + 13, top: 3, width: 22, height: 22 };

for (const id of IDS) {
  const src = join(DIR, `${id}.png`);
  const out = join(DIR, `${id}_head.png`);
  await sharp(src).extract(CROP).png().toFile(out);
  console.log('✓', `${id}_head.png`);
}
