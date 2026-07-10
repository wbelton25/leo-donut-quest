// scripts/find-loop.js
// Searches a song for the most musically seamless loop: a [start,end) whose audio
// AROUND the two points matches (same point in the phrase one loop-period apart),
// so wrapping end -> start sounds like the natural progression into start.
//
// Renders the top candidates as ready-to-loop WAVs (with a short seam crossfade)
// so you can A/B them by ear, then run finalize-loop.js on the winner.
//
// Usage: node scripts/find-loop.js [source.wav]
// Output: public/assets/audio/music/_cand_1.wav .. _cand_N.wav  + a printed table.

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MUSIC = join(__dirname, '..', 'public', 'assets', 'audio', 'music');
const SRC = process.argv[2] || join(MUSIC, 'music_level.wav');

// ── Parse WAV (16-bit) ────────────────────────────────────────────────────────
const buf = readFileSync(SRC);
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
const dur = N / SR;

// ── Decimated mono for the correlation search ─────────────────────────────────
const DEC = 8;
const dSR = SR / DEC;
const M = Math.floor(N / DEC);
const mono = new Float64Array(M);
for (let j = 0; j < M; j++) {
  const i = j * DEC;
  mono[j] = CH === 1 ? rd(i, 0) : (rd(i, 0) + rd(i, 1)) / 2;
}

// ── Search ────────────────────────────────────────────────────────────────────
const S_MIN = 4.0, S_MAX = 12.0;      // where the loop may start (after the intro)
const L_MIN = 6.0, L_MAX = 14.0;      // loop length bounds
const STEP  = 0.03;                    // search granularity (s)
const W      = Math.floor(0.20 * dSR); // ± comparison window (s)

const sStep = Math.floor(STEP * dSR);
const results = [];
for (let s = Math.floor(S_MIN * dSR); s <= Math.floor(S_MAX * dSR); s += sStep) {
  if (s - W < 0) continue;
  const eLo = s + Math.floor(L_MIN * dSR);
  const eHi = Math.min(s + Math.floor(L_MAX * dSR), M - W - 1, Math.floor((dur - 0.1) * dSR));
  for (let e = eLo; e <= eHi; e += sStep) {
    let diff = 0, energy = 0;
    for (let i = -W; i <= W; i += 2) {   // stride 2 for speed
      const a = mono[s + i], b = mono[e + i];
      diff += (a - b) * (a - b);
      energy += a * a + b * b;
    }
    if (energy < 1e-4) continue;         // skip near-silent overlaps
    results.push({ s: s / dSR, e: e / dSR, score: diff / energy });
  }
}
results.sort((a, b) => a.score - b.score);

// De-duplicate near-identical candidates (within 0.25s of a better one)
const top = [];
for (const r of results) {
  if (top.some(t => Math.abs(t.s - r.s) < 0.25 && Math.abs(t.e - r.e) < 0.25)) continue;
  top.push(r);
  if (top.length >= 6) break;
}

// ── Snap a time to the nearest upward zero-crossing (full res) ────────────────
function snapZero(t) {
  const c = Math.round(t * SR);
  for (let d = 0; d < SR * 0.02; d++) {
    for (const i of [c + d, c - d]) {
      if (i > 0 && i < N - 1 && rd(i - 1, 0) <= 0 && rd(i, 0) > 0) return i;
    }
  }
  return c;
}

// ── Write a ready-to-loop WAV for a candidate (with a 60ms seam crossfade) ────
function writeLoop(file, s0, e0, crossMs = 60) {
  const s = snapZero(s0), e = snapZero(e0);
  const len = e - s;
  let T = Math.floor(SR * crossMs / 1000);
  if (T > Math.floor(len / 3)) T = Math.floor(len / 3);
  const outN = len - T;
  const out = new Int16Array(outN * CH);
  const clamp = v => Math.max(-32768, Math.min(32767, Math.round(v * 32768)));
  for (let i = 0; i < outN; i++) {
    for (let c = 0; c < CH; c++) {
      let v;
      if (i < T) {
        const x = i / T, fin = Math.sin(x * Math.PI / 2), fout = Math.cos(x * Math.PI / 2);
        v = rd(s + i, c) * fin + rd(s + len - T + i, c) * fout;
      } else v = rd(s + i, c);
      out[i * CH + c] = clamp(v);
    }
  }
  const bytes = out.length * 2, h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + bytes, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(CH, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * CH * 2, 28); h.writeUInt16LE(CH * 2, 32);
  h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(bytes, 40);
  writeFileSync(file, Buffer.concat([h, Buffer.from(out.buffer)]));
  return { s: s / SR, e: e / SR, len: outN / SR };
}

console.log(`\nSource: ${SR}Hz ${CH}ch, ${dur.toFixed(2)}s\n`);
console.log('#  loopStart  loopEnd   length   match(lower=better)');
top.forEach((r, k) => {
  const info = writeLoop(join(MUSIC, `_cand_${k + 1}.wav`), r.s, r.e);
  console.log(`${k + 1}  ${info.s.toFixed(3)}s   ${info.e.toFixed(3)}s   ${info.len.toFixed(3)}s   ${r.score.toFixed(4)}`);
});
console.log('\nListen to _cand_N.wav, then: node scripts/finalize-loop.js <loopStart> <loopEnd>');
