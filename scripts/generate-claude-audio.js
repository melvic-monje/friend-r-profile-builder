// Generates a short ambient WAV file for Claude's profile song.
// No external deps — writes raw PCM directly.
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 22050;
const DURATION_S = 14;
const CHANNELS = 1;
const BITS = 16;
const numSamples = SAMPLE_RATE * DURATION_S;

// A minor chord-ish ambient wash: A2 (110), C4 (261.63), E4 (329.63), A4 (440)
const tones = [
  { freq: 110.0,  amp: 0.18 },
  { freq: 164.81, amp: 0.12 }, // E3
  { freq: 261.63, amp: 0.14 }, // C4
  { freq: 329.63, amp: 0.10 }, // E4
  { freq: 440.0,  amp: 0.06 }  // A4
];

const buf = Buffer.alloc(44 + numSamples * 2);
// RIFF header
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + numSamples * 2, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(CHANNELS, 22);
buf.writeUInt32LE(SAMPLE_RATE, 24);
buf.writeUInt32LE(SAMPLE_RATE * CHANNELS * BITS / 8, 28);
buf.writeUInt16LE(CHANNELS * BITS / 8, 32);
buf.writeUInt16LE(BITS, 34);
buf.write('data', 36);
buf.writeUInt32LE(numSamples * 2, 40);

for (let i = 0; i < numSamples; i++) {
  const t = i / SAMPLE_RATE;
  // Slow swell envelope (loops cleanly: fade in/out)
  const envelope = 0.5 - 0.5 * Math.cos(2 * Math.PI * t / DURATION_S);
  let s = 0;
  for (const tone of tones) {
    // Add subtle vibrato so it doesn't sound static
    const vib = 1 + 0.002 * Math.sin(2 * Math.PI * 0.3 * t);
    s += tone.amp * Math.sin(2 * Math.PI * tone.freq * vib * t);
  }
  s *= envelope;
  // Soft clipping
  s = Math.tanh(s * 1.2);
  const v = Math.max(-1, Math.min(1, s));
  buf.writeInt16LE(Math.round(v * 32700), 44 + i * 2);
}

const outDir = path.join(__dirname, '..', 'public', 'audio');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'claude-theme.wav');
fs.writeFileSync(outPath, buf);
console.log(`Wrote ${outPath} (${(buf.length / 1024).toFixed(1)} KB)`);
