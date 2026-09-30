// Tiny WebAudio chiptune synth: sound effects + looping background music.
class Sound {
  constructor() { this.ctx = null; this.muted = false; this.musicTimer = null; this.track = null; }

  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  tone(freq, dur, { type = 'square', vol = 0.06, when = 0, slide = 0 } = {}) {
    if (this.muted || !this.ensure()) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  noise(dur, vol = 0.08) {
    if (this.muted || !this.ensure()) return;
    const n = this.ctx.sampleRate * dur, buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    g.gain.value = vol; s.buffer = buf; s.connect(g).connect(this.ctx.destination); s.start();
  }

  seq(notes, step = 0.1, opts = {}) { notes.forEach((f, i) => f && this.tone(f, step * 0.9, { ...opts, when: i * step })); }

  select() { this.tone(880, 0.05, { vol: 0.04 }); }
  bump() { this.tone(110, 0.08, { vol: 0.05 }); }
  hit(mult) { this.noise(0.18, 0.12); this.tone(mult > 1 ? 300 : 180, 0.15, { slide: -120 }); }
  faint() { this.tone(500, 0.6, { slide: -440, type: 'sawtooth', vol: 0.05 }); }
  status() { this.seq([400, 600, 800], 0.06, { type: 'triangle' }); }
  levelUp() { this.seq([523, 659, 784, 1047], 0.09, { type: 'square' }); }
  victory() { this.seq([784, 784, 784, 1047, 0, 988, 1047], 0.11); }
  heal() { this.seq([523, 659, 784, 659, 784, 1047], 0.12, { type: 'triangle', vol: 0.08 }); }
  pickup() { this.seq([660, 880, 1320], 0.08, { type: 'triangle', vol: 0.08 }); }
  throw() { this.tone(300, 0.3, { slide: 600, type: 'triangle' }); }
  shake() { this.tone(200, 0.08, { vol: 0.05 }); }
  run() { this.seq([600, 500, 400], 0.06, { type: 'triangle' }); }
  evolve() { this.seq([262, 330, 392, 523, 659, 784, 1047], 0.12, { type: 'triangle', vol: 0.08 }); }
  battleStart() { this.seq([880, 0, 880, 0, 880, 988, 1047, 1175], 0.06); }
  spotted() { this.seq([988, 1319], 0.1); }

  music(kind) {
    if (this.track === kind) return;
    this.track = kind;
    clearInterval(this.musicTimer);
    if (!kind) return;
    const tracks = {
      overworld: { step: 0.2, lead: [392, 0, 440, 494, 523, 0, 494, 440, 392, 0, 330, 0, 349, 392, 440, 0, 392, 0, 440, 494, 523, 587, 659, 0, 587, 523, 494, 440, 392, 0, 0, 0],
        bass: [131, 196, 131, 196, 175, 262, 175, 262, 131, 196, 131, 196, 147, 220, 196, 247] },
      battle: { step: 0.13, lead: [659, 659, 0, 659, 0, 523, 659, 0, 784, 0, 0, 0, 392, 0, 0, 0, 523, 0, 392, 0, 330, 0, 440, 494, 466, 440, 392, 659, 784, 880, 698, 784],
        bass: [110, 110, 165, 110, 131, 131, 196, 131, 147, 147, 220, 147, 165, 165, 247, 165] }
    };
    const tr = tracks[kind];
    let i = 0;
    const tick = () => {
      if (this.muted || !this.ctx) { i++; return; }
      const f = tr.lead[i % tr.lead.length];
      if (f) this.tone(f, tr.step * 0.85, { type: 'square', vol: 0.025 });
      if (i % 2 === 0) this.tone(tr.bass[(i / 2) % tr.bass.length], tr.step * 1.8, { type: 'triangle', vol: 0.05 });
      i++;
    };
    this.musicTimer = setInterval(tick, tr.step * 1000);
  }
}
