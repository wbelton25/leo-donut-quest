// scripts/make-bar-loops.js
// Renders loop candidates that are an exact whole number of musical bars starting
// on a downbeat, so the rhythm stays locked across the seam (the melody may still
// restart — the song is through-composed — but on a downbeat, which reads as a
// section repeat rather than a glitch).
//
// Usage: node scripts/make-bar-loops.js
// Edit CANDIDATES below (each is [loopStartSec, numBars]). Bar/phase come from the
// envelope-autocorrelation analysis: bar = 2.720s, downbeats at 1.525 + n*2.720.

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MUSIC = join(__dirname, '..', 'public', 'assets', 'audio', 'music');

const BAR = 2.720;
const CROSS_MS = 60;
// [loopStartSec (a downbeat), numBars]
const CANDIDATES = [
  [6.965, 3],   // 1: 8.16s  — short
  [4.245, 4],   // 2: 10.88s
  [6.965, 4],   // 3: 10.88s
  [4.245, 6],   // 4: 16.32s
  [1.525, 8],   // 5: 21.76s — nearly the whole song (includes the outro)
  [1.525, 7],   // 6: 19.04s — #5 minus the final outro bar (no closing gesture)
  [1.525, 7.5], // 7: 20.40s — groove up to just before the 22.0s drop (half-bar)
];

const buf = readFileSync(join(MUSIC, 'music_level.wav'));
let pos = 12, SR, CH, BITS, dataOff, dataSize;
while (pos < buf.length - 8) {
  const id = buf.toString('ascii', pos, pos + 4);
  const sz = buf.readUInt32LE(pos + 4);
  if (id === 'fmt ')      { CH = buf.readUInt16LE(pos + 10); SR = buf.readUInt32LE(pos + 12); BITS = buf.readUInt16LE(pos + 22); }
  else if (id === 'data') { dataOff = pos + 8; dataSize = sz; break; }
  pos += 8 + sz + (sz % 2);
}
const N = dataSize / (2 * CH);
const rd = (i, c) => buf.readInt16LE(dataOff + (i * CH + Math.min(c, CH - 1)) * 2) / 32768;
const clamp = v => Math.max(-32768, Math.min(32767, Math.round(v * 32768)));

function snapZero(t) {
  const c = Math.round(t * SR);
  for (let d = 0; d < SR * 0.015; d++) for (const i of [c + d, c - d])
    if (i > 0 && i < N - 1 && rd(i - 1, 0) <= 0 && rd(i, 0) > 0) return i;
  return c;
}
function writeLoop(file, s0, e0) {
  const s = snapZero(s0), e = snapZero(e0), len = e - s;
  let T = Math.floor(SR * CROSS_MS / 1000);
  if (T > Math.floor(len / 3)) T = Math.floor(len / 3);
  const outN = len - T, out = new Int16Array(outN * CH);
  for (let i = 0; i < outN; i++) for (let c = 0; c < CH; c++) {
    let v;
    if (i < T) { const x = i / T; v = rd(s + i, c) * Math.sin(x * Math.PI / 2) + rd(s + len - T + i, c) * Math.cos(x * Math.PI / 2); }
    else v = rd(s + i, c);
    out[i * CH + c] = clamp(v);
  }
  const bytes = out.length * 2, h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + bytes, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(CH, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * CH * 2, 28); h.writeUInt16LE(CH * 2, 32);
  h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(bytes, 40);
  writeFileSync(file, Buffer.concat([h, Buffer.from(out.buffer)]));
  return outN / SR;
}

console.log('#  start    bars  end      loopLen');
CANDIDATES.forEach(([start, bars], k) => {
  const end = start + bars * BAR;
  const len = writeLoop(join(MUSIC, `_cand_${k + 1}.wav`), start, end);
  console.log(`${k + 1}  ${start.toFixed(3)}s  ${bars}    ${end.toFixed(3)}s  ${len.toFixed(3)}s`);
});
console.log('\nOnce you pick: node scripts/finalize-loop.js <start> <end>');
