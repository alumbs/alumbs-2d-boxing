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
    this.startCrowd();
  }

  // Continuous crowd bed whose volume follows the fight's excitement
  startCrowd() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 420;
    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.value = 0.015;
    src.connect(filt).connect(this.crowdGain).connect(this.ctx.destination);
    src.start();
    this.excitement = 0;
  }

  excite(amount) {
    this.excitement = Math.min(1, (this.excitement || 0) + amount);
  }

  // Call every frame: excitement decays, crowd volume follows
  update(dt) {
    if (!this.crowdGain) return;
    this.excitement = Math.max(0, (this.excitement || 0) - dt * 0.25);
    const target = 0.015 + this.excitement * 0.14;
    const g = this.crowdGain.gain;
    g.value += (target - g.value) * Math.min(1, dt * 3);
  }

  stunWobble() {
    if (!this.ctx) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(820, t);
    o.frequency.exponentialRampToValueAtTime(240, t + 0.6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + 0.6);
  }

  // Corner man / announcer via speech synthesis (best-effort, silent if unsupported)
  say(text) {
    try {
      if (!window.speechSynthesis) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.pitch = 0.75;
      u.volume = 0.9;
      speechSynthesis.speak(u);
    } catch (e) { /* no speech, no problem */ }
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
