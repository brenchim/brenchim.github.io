// Тюнер: микрофон → автокорреляция → ближайшая нота и отклонение в центах.

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const STRINGS = [
  { name: 'E', label: '6', freq: 82.41 },
  { name: 'A', label: '5', freq: 110.0 },
  { name: 'D', label: '4', freq: 146.83 },
  { name: 'G', label: '3', freq: 196.0 },
  { name: 'B', label: '2', freq: 246.94 },
  { name: 'E', label: '1', freq: 329.63 },
];

// Алгоритм ACF2+ (автокорреляция с параболической интерполяцией)
function detectPitch(buf, sampleRate) {
  let size = buf.length;
  let rms = 0;
  for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.008) return -1; // тишина

  // обрезаем тихие края
  let r1 = 0, r2 = size - 1;
  const thr = 0.2;
  for (let i = 0; i < size / 2; i++) if (Math.abs(buf[i]) < thr) { r1 = i; break; }
  for (let i = 1; i < size / 2; i++) if (Math.abs(buf[size - i]) < thr) { r2 = size - i; break; }
  buf = buf.slice(r1, r2);
  size = buf.length;

  // лаги только до ~60 Гц — дальше гитаре не нужно, а считать в разы быстрее
  const maxLag = Math.min(size - 1, Math.ceil(sampleRate / 60) + 2);
  const n = Math.min(size, 2048);
  const c = new Float32Array(maxLag + 1);
  for (let i = 0; i <= maxLag; i++) {
    let sum = 0;
    for (let j = 0; j < n - i; j++) sum += buf[j] * buf[j + i];
    c[i] = sum;
  }
  let d = 0;
  while (d < maxLag && c[d] > c[d + 1]) d++;
  let maxVal = -1, maxPos = -1;
  for (let i = d; i <= maxLag; i++) if (c[i] > maxVal) { maxVal = c[i]; maxPos = i; }
  if (maxPos <= 0) return -1;
  let T0 = maxPos;
  const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1] ?? x2;
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) T0 -= b / (2 * a);
  const f = sampleRate / T0;
  return f > 60 && f < 1200 ? f : -1;
}

export function describe(freq) {
  const n = 12 * Math.log2(freq / 440) + 69;
  const midi = Math.round(n);
  const cents = Math.round((n - midi) * 100);
  return { note: NOTES[((midi % 12) + 12) % 12], octave: Math.floor(midi / 12) - 1, cents };
}

export function nearestString(freq) {
  let best = 0, bestDist = Infinity;
  STRINGS.forEach((s, i) => {
    const dist = Math.abs(1200 * Math.log2(freq / s.freq));
    if (dist < bestDist) { bestDist = dist; best = i; }
  });
  return { index: best, cents: Math.round(1200 * Math.log2(freq / STRINGS[best].freq)) };
}

export class Tuner {
  constructor(onReading) { this.onReading = onReading; this.running = false; this.history = []; }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    src.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
    this.running = true;
    this.loop();
  }

  loop() {
    if (!this.running) return;
    this.analyser.getFloatTimeDomainData(this.buf);
    const f = detectPitch(this.buf, this.ctx.sampleRate);
    if (f > 0) {
      this.history.push(f);
      if (this.history.length > 5) this.history.shift();
      const sorted = [...this.history].sort((a, b) => a - b);
      this.onReading(sorted[Math.floor(sorted.length / 2)]);
    } else {
      this.silent = (this.silent || 0) + 1;
      if (this.silent > 30) { this.history = []; this.silent = 0; this.onReading(null); }
    }
    this.timer = setTimeout(() => this.loop(), 50);
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.stream = this.ctx = null;
  }
}
