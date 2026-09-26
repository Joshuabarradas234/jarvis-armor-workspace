/*
 * Meeting mode: turns the mixed meeting audio into 16 kHz, 16-bit chunks for the Windows speech engine.
 * A chunk ends at a pause once it is 15 s long (so words are not cut in half), and never runs past 30 s.
 */
const RATE = 16000, MIN = 15, MAX = 30, PAUSE = 0.35, QUIET = 0.01, LOUD = 0.012;
class JarvisChunker extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / RATE; this.pos = 0; this.prev = 0;
    this.buf = new Int16Array(RATE * (MAX + 2)); this.n = 0; this.done = 0; this.silent = 0; this.peak = 0;
    this.port.onmessage = e => { if (e.data === 'flush') { this.emit(); this.port.postMessage({flushed: true}); } };
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch || !ch.length) return true;
    let sum = 0;
    for (let k = 0; k < ch.length; k++) sum += ch[k] * ch[k];
    const rms = Math.sqrt(sum / ch.length);
    this.silent = rms < QUIET ? this.silent + ch.length / sampleRate : 0;
    if (rms > this.peak) this.peak = rms;
    // linear resampling down to 16 kHz; `prev` carries the last sample across blocks
    for (; this.pos < ch.length; this.pos += this.step) {
      const i = Math.floor(this.pos), f = this.pos - i;
      const a = i < 0 ? this.prev : ch[i], b = i + 1 < ch.length ? ch[i + 1] : ch[ch.length - 1];
      const v = Math.max(-1, Math.min(1, a + (b - a) * f));
      if (this.n < this.buf.length) this.buf[this.n++] = v * 32767;
    }
    this.pos -= ch.length; this.prev = ch[ch.length - 1];
    const secs = this.n / RATE;
    if ((secs >= MIN && this.silent >= PAUSE) || secs >= MAX) this.emit();
    return true;
  }
  emit() {
    if (!this.n) return;
    const pcm = this.buf.slice(0, this.n);
    // `loud`: a chunk that is only silence is skipped by the speech engine but still moves the clock on
    this.port.postMessage({start: this.done / RATE, pcm: pcm.buffer, loud: this.peak > LOUD}, [pcm.buffer]);
    this.done += this.n; this.n = 0; this.peak = 0;
  }
}
registerProcessor('jarvis-chunker', JarvisChunker);
