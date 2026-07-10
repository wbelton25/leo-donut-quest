// scripts/crossfade-loop.js
// Makes a WAV loop seamlessly by overlap-add crossfading its tail into its head.
//
// A file played with loop:true clicks at the seam whenever its last sample does
// not continue smoothly into its first. This bakes an equal-power crossfade so the
// new loop point falls between two originally-ADJACENT samples (zero discontinuity)
// and the tail's energy blends into the head (no lurch).
//
// Usage: node scripts/crossfade-loop.js <in.wav> <out.wav> [crossfadeMs=250]
// Note: run on the RAW split loop (the committed one). Re-running on its own
// output would double-process — restore from git first if you need to redo.

import { readFileSync, writeFileSync } from 'fs';

const [inFile, outFile, msArg] = process.argv.slice(2);
if (!inFile || !outFile) {
  console.error('Usage: node scripts/crossfade-loop.js <in.wav> <out.wav> [crossfadeMs]');
  process.exit(1);
}
const crossMs = Number(msArg ?? 250);

// ── Parse WAV ────────────────────────────────────────────────────────────────
const buf = readFileSync(inFile);
if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
  console.error('Not a WAV'); process.exit(1);
}
let pos = 12, sampleRate, numCh, bits, dataOff, dataSize;
while (pos < buf.length - 8) {
  const id = buf.toString('ascii', pos, pos + 4);
  const sz = buf.readUInt32LE(pos + 4);
  if (id === 'fmt ')      { numCh = buf.readUInt16LE(pos + 10); sampleRate = buf.readUInt32LE(pos + 12); bits = buf.readUInt16LE(pos + 22); }
  else if (id === 'data') { dataOff = pos + 8; dataSize = sz; break; }
  pos += 8 + sz + (sz % 2);
}
if (bits !== 16) { console.error('Only 16-bit WAV supported'); process.exit(1); }

const N = dataSize / (2 * numCh);
const rd = (i, c) => buf.readInt16LE(dataOff + (i * numCh + c) * 2) / 32768;

let T = Math.floor(sampleRate * crossMs / 1000);
if (T > Math.floor(N / 3)) T = Math.floor(N / 3);   // keep crossfade sane
const outN = N - T;

// ── Overlap-add equal-power crossfade ────────────────────────────────────────
const out = new Int16Array(outN * numCh);
const clamp = v => Math.max(-32768, Math.min(32767, Math.round(v * 32768)));
for (let i = 0; i < outN; i++) {
  for (let c = 0; c < numCh; c++) {
    let v;
    if (i < T) {
      const x    = i / T;
      const fin  = Math.sin(x * Math.PI / 2);   // head fades in
      const fout = Math.cos(x * Math.PI / 2);   // tail fades out
      v = rd(i, c) * fin + rd(N - T + i, c) * fout;
    } else {
      v = rd(i, c);
    }
    out[i * numCh + c] = clamp(v);
  }
}

// ── Write WAV ────────────────────────────────────────────────────────────────
const bytes = out.length * 2;
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + bytes, 4); header.write('WAVE', 8);
header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
header.writeUInt16LE(numCh, 22); header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * numCh * 2, 28); header.writeUInt16LE(numCh * 2, 32);
header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(bytes, 40);
writeFileSync(outFile, Buffer.concat([header, Buffer.from(out.buffer)]));

console.log(`✓ ${outFile}: ${(outN / sampleRate).toFixed(3)}s, ${crossMs}ms crossfade (was ${(N / sampleRate).toFixed(3)}s)`);
