// WebAudio-synthesized sound effects. No asset files.
class AudioSys {
  constructor() {
    this.ctx = null;
    this.noiseBuf = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const len = this.ctx.sampleRate * 0.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  noise(dur, freq, q, gainV, when = 0) {
    if (!this.ctx) return;
    const t = this.now() + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gainV, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt).connect(g).connect(this.ctx.destination);
    src.start(t);
    src.stop(t + dur);
  }

  tone(freq, dur, gainV, type = 'sine', when = 0) {
    if (!this.ctx) return;
    const t = this.now() + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gainV, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur);
  }

  thud(mag = 1) {
    const m = Math.min(1.6, 0.6 + mag * 0.08);
    this.noise(0.12, 180, 1.2, 0.5 * m);
    this.tone(90, 0.12, 0.35 * m, 'sine');
  }

  blockThud() {
    this.noise(0.08, 400, 2, 0.2);
  }

  whoosh() {
    this.noise(0.15, 900, 1.5, 0.12);
  }

  bellStrike(when = 0) {
    this.tone(1180, 1.1, 0.28, 'sine', when);
    this.tone(1770, 0.7, 0.12, 'sine', when);
    this.tone(590, 1.3, 0.10, 'sine', when);
  }

  bellRound() { this.bellStrike(0); this.bellStrike(0.35); }
  bellEnd() { this.bellStrike(0); this.bellStrike(0.3); this.bellStrike(0.6); }

  countTick() { this.tone(660, 0.1, 0.15, 'square'); }

  knockdown() {
    this.noise(0.4, 120, 0.8, 0.7);
    this.tone(60, 0.4, 0.5, 'sine');
  }

  crowdRoar(dur = 1.2) {
    this.noise(dur, 500, 0.4, 0.15);
  }
}
