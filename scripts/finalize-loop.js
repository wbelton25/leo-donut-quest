// scripts/finalize-loop.js
// Commits a chosen loop: splits the original song into an intro clip [0,start)
// that plays once and a loop clip [start,end) that repeats. The intro ends exactly
// where the loop begins (continuous), and the loop gets a short seam crossfade so
// it wraps without a click — matching what find-loop.js previewed.
//
// Usage: node scripts/finalize-loop.js <loopStart> <loopEnd> [crossMs=60]

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MUSIC = join(__dirname, '..', 'public', 'assets', 'audio', 'music');

const [startArg, endArg, msArg] = process.argv.slice(2);
if (startArg === undefined || endArg === undefined) {
  console.error('Usage: node scripts/finalize-loop.js <loopStart> <loopEnd> [crossMs]');
  process.exit(1);
}
const loopStart = Number(startArg), loopEnd = Number(endArg), crossMs = Number(msArg ?? 60);

// ── Parse original ────────────────────────────────────────────────────────────
const buf = readFileSync(join(MUSIC, 'music_level.wav'));
let pos = 12, SR, CH, BITS, dataOff, dataSize;
while (pos < buf.length - 8) {
  const id = buf.toString('ascii', pos, pos + 4);
  const sz = buf.readUInt32LE(pos + 4);
  if (id === 'fmt ')      { CH = buf.readUInt16LE(pos + 10); SR = buf.readUInt32LE(pos + 12); BITS = buf.readUInt16LE(pos + 22); }
  else if (id === 'data') { dataOff = pos + 8; dataSize = sz; break; }
  pos += 8 + sz + (sz % 2);
}
if (BITS !== 16) { console.error('Only 16-bit WAV supported'); process.exit(1); }
const N = dataSize / (2 * CH);
const rd = (i, c) => buf.readInt16LE(dataOff + (i * CH + Math.min(c, CH - 1)) * 2) / 32768;
const clamp = v => Math.max(-32768, Math.min(32767, Math.round(v * 32768)));

function snapZero(t) {
  const c = Math.round(t * SR);
  for (let d = 0; d < SR * 0.02; d++) {
    for (const i of [c + d, c - d]) {
      if (i > 0 && i < N - 1 && rd(i - 1, 0) <= 0 && rd(i, 0) > 0) return i;
    }
  }
  return c;
}

function writeWav(file, samples /* Int16Array interleaved */) {
  const bytes = samples.length * 2, h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + bytes, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(CH, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * CH * 2, 28); h.writeUInt16LE(CH * 2, 32);
  h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(bytes, 40);
  writeFileSync(file, Buffer.concat([h, Buffer.from(samples.buffer)]));
}

const S = snapZero(loopStart), E = snapZero(loopEnd);

// ── Intro = [0, S) ────────────────────────────────────────────────────────────
const intro = new Int16Array(S * CH);
for (let i = 0; i < S; i++) for (let c = 0; c < CH; c++) intro[i * CH + c] = clamp(rd(i, c));
writeWav(join(MUSIC, 'music_level_intro.wav'), intro);

// ── Loop = [S, E) with seam crossfade ─────────────────────────────────────────
const len = E - S;
let T = Math.floor(SR * crossMs / 1000);
if (T > Math.floor(len / 3)) T = Math.floor(len / 3);
const outN = len - T;
const loop = new Int16Array(outN * CH);
for (let i = 0; i < outN; i++) {
  for (let c = 0; c < CH; c++) {
    let v;
    if (i < T) {
      const x = i / T, fin = Math.sin(x * Math.PI / 2), fout = Math.cos(x * Math.PI / 2);
      v = rd(S + i, c) * fin + rd(S + len - T + i, c) * fout;
    } else v = rd(S + i, c);
    loop[i * CH + c] = clamp(v);
  }
}
writeWav(join(MUSIC, 'music_level_loop.wav'), loop);

console.log(`✓ intro ${(S / SR).toFixed(3)}s  +  loop ${(outN / SR).toFixed(3)}s  (${crossMs}ms seam crossfade)`);
