// scripts/analyze-loop.js
// Analyzes a WAV file and finds candidate loop points.
// Looks for:
//   1. Trailing silence (for trimming loop end)
//   2. Low-energy valley after the intro that could serve as a clean loop start
//
// Usage: node scripts/analyze-loop.js <file.wav>

import { readFileSync } from 'fs';

const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/analyze-loop.js <file.wav>'); process.exit(1); }

const buf = readFileSync(file);

// ── Parse WAV header ──────────────────────────────────────────────────────────
if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
  console.error('Not a valid WAV file'); process.exit(1);
}

// Walk chunks
let pos = 12;
let sampleRate, numChannels, bitsPerSample, dataOffset, dataSize;

while (pos < buf.length - 8) {
  const id   = buf.toString('ascii', pos, pos + 4);
  const size = buf.readUInt32LE(pos + 4);
  if (id === 'fmt ') {
    numChannels  = buf.readUInt16LE(pos + 10);
    sampleRate   = buf.readUInt32LE(pos + 12);
    bitsPerSample = buf.readUInt16LE(pos + 22);
  } else if (id === 'data') {
    dataOffset = pos + 8;
    dataSize   = size;
    break;
  }
  pos += 8 + size + (size % 2); // pad to even
}

if (!sampleRate) { console.error('Could not parse fmt chunk'); process.exit(1); }

const bytesPerSample = bitsPerSample / 8;
const totalSamples   = dataSize / (bytesPerSample * numChannels);
const duration       = totalSamples / sampleRate;

console.log(`\nFile: ${file}`);
console.log(`Duration:    ${duration.toFixed(3)}s`);
console.log(`Sample rate: ${sampleRate} Hz  |  Channels: ${numChannels}  |  Bit depth: ${bitsPerSample}`);

// ── Read mono RMS energy in 50ms windows ─────────────────────────────────────
const WIN_S   = 0.05;  // 50ms windows
const WIN_SAMP = Math.floor(sampleRate * WIN_S);
const numWins  = Math.floor(totalSamples / WIN_SAMP);
const rms      = new Float64Array(numWins);

for (let w = 0; w < numWins; w++) {
  let sum = 0;
  for (let s = 0; s < WIN_SAMP; s++) {
    const idx  = (w * WIN_SAMP + s) * numChannels * bytesPerSample + dataOffset;
    let sample = 0;
    if (bitsPerSample === 16) sample = buf.readInt16LE(idx) / 32768;
    else if (bitsPerSample === 24) {
      const raw = buf.readUIntLE(idx, 3);
      sample = (raw > 0x7FFFFF ? raw - 0x1000000 : raw) / 8388608;
    } else if (bitsPerSample === 8) sample = (buf.readUInt8(idx) - 128) / 128;
    sum += sample * sample;
  }
  rms[w] = Math.sqrt(sum / WIN_SAMP);
}

// Smooth with a 5-window rolling average
const smooth = new Float64Array(numWins);
for (let w = 0; w < numWins; w++) {
  let s = 0, n = 0;
  for (let d = -2; d <= 2; d++) {
    if (w + d >= 0 && w + d < numWins) { s += rms[w + d]; n++; }
  }
  smooth[w] = s / n;
}

const maxRms = Math.max(...smooth);

// ── 1. Trailing silence ───────────────────────────────────────────────────────
const SILENCE_THRESH = maxRms * 0.02;
let silenceStart = duration;
for (let w = numWins - 1; w >= 0; w--) {
  if (smooth[w] > SILENCE_THRESH) { silenceStart = (w + 1) * WIN_S; break; }
}
const trailingSilence = duration - silenceStart;
console.log(`\nTrailing silence: ${trailingSilence.toFixed(3)}s  (audio ends at ${silenceStart.toFixed(3)}s)`);

// ── 2. Loop-start candidates: low-energy valleys after first 10% ──────────────
const skipWins    = Math.floor(numWins * 0.10); // skip first 10%
const searchEnd   = Math.floor(numWins * 0.55); // search up to 55%
const localMin    = [];

for (let w = skipWins + 2; w < searchEnd - 2; w++) {
  if (smooth[w] < smooth[w - 1] && smooth[w] < smooth[w + 1] &&
      smooth[w] < smooth[w - 2] && smooth[w] < smooth[w + 2]) {
    localMin.push({ w, t: w * WIN_S, e: smooth[w] });
  }
}
// Sort by energy (lowest first), take top 8
localMin.sort((a, b) => a.e - b.e);
const top = localMin.slice(0, 8);
top.sort((a, b) => a.t - b.t); // re-sort by time

console.log('\nLoop-start candidates (low-energy valleys, after intro):');
top.forEach(({ t, e }) => {
  const pct = ((e / maxRms) * 100).toFixed(1);
  console.log(`  ${t.toFixed(3)}s  (energy ${pct}% of peak)`);
});

console.log('\nSuggested next step:');
console.log('  Pick the candidate that aligns with the first full repeat of the main theme.');
console.log('  Then run:  node scripts/set-loop.js <loopStart> [loopEnd]');
