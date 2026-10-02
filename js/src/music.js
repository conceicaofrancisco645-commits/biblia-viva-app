// Música de fundo original, gerada em tempo real com a Web Audio API.
// Acordes suaves (pad) com reverberação e sininhos ocasionais — sem arquivos e sem direitos de terceiros.
const NOTE = n => 440 * Math.pow(2, (n - 69) / 12); // MIDI -> Hz
// Progressão calma em Dó maior: C – Am – F – G (e variações)
const CHORDS = [
  [48, 55, 60, 64], // C
  [45, 52, 57, 60], // Am
  [41, 48, 57, 60], // F
  [43, 50, 55, 59], // G
  [48, 55, 60, 67], // C (aberto)
  [45, 52, 60, 64], // Am7
  [41, 48, 53, 57], // F
  [43, 50, 53, 59]  // G7
];
const BELLS = [72, 74, 76, 79, 81, 84]; // pentatônica aguda
const CHORD_SECONDS = 9;
// Estilo cinematográfico (trilha de filme bíblico): cordas graves, coral suave e nota pedal.
// Progressão em Ré menor: Dm – B♭ – F – C – Dm – Gm – B♭ – A
const CINE = [
  [38, 50, 57, 62, 65], [34, 46, 53, 58, 62], [41, 48, 57, 60, 65], [36, 48, 55, 60, 64],
  [38, 50, 57, 62, 69], [43, 50, 55, 62, 67], [34, 46, 53, 62, 65], [33, 45, 52, 61, 64]
];
const CINE_SECONDS = 10;

export class AmbientMusic {
  constructor() { this.ctx = null; this.playing = false; this.volume = 0.35; this.ducked = false; this.step = 0; this.style = 'cinematico'; }
  setStyle(style) { if (style === this.style) return; const was = this.playing; if (was) this.stopNow(); this.style = style; if (was) this.start(); }
  get supported() { return !!(window.AudioContext || window.webkitAudioContext); }

  setup() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    // Reverberação: resposta ao impulso gerada (ruído com decaimento)
    const len = ctx.sampleRate * 4.5, impulse = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = impulse.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    this.reverb = ctx.createConvolver(); this.reverb.buffer = impulse;
    const wet = ctx.createGain(); wet.gain.value = 0.55;
    const dry = ctx.createGain(); dry.gain.value = 0.45;
    this.bus = ctx.createBiquadFilter(); this.bus.type = 'lowpass'; this.bus.frequency.value = 1400; this.bus.Q.value = 0.3;
    this.bus.connect(dry).connect(this.master);
    this.bus.connect(this.reverb).connect(wet).connect(this.master);
  }

  level() { return this.volume * (this.ducked ? 0.55 : 1) * 1.5; }
  ramp(value, seconds = 1.5) {
    if (!this.ctx) return;
    const g = this.master.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(value, t + seconds);
  }

  start() {
    if (!this.supported) return false;
    this.setup();
    this.ctx.resume?.();
    if (this.playing) return true;
    this.playing = true;
    this.nextChordAt = this.ctx.currentTime + 0.1;
    this.nextBellAt = this.ctx.currentTime + 4;
    this.ramp(this.level(), 3);
    if (this.style === 'cinematico') this.startDrone();
    this.timer = setInterval(() => this.schedule(), 400);
    this.schedule();
    return true;
  }
  stopNow() { this.playing = false; clearInterval(this.timer); this.stopDrone(0.3); if (this.master) this.master.gain.value = 0; }
  stop() {
    if (!this.playing) return;
    this.playing = false;
    this.ramp(0, 2);
    clearInterval(this.timer);
    this.stopDrone(2.5);
    setTimeout(() => { if (!this.playing) this.ctx?.suspend?.(); }, 2500);
  }
  toggle() { return this.playing ? (this.stop(), false) : this.start(); }
  setVolume(v) { this.volume = Math.max(0, Math.min(1, Number(v))); if (this.playing) this.ramp(this.level(), 0.4); }
  duck(on) { if (this.ducked === on) return; this.ducked = on; if (this.playing) this.ramp(this.level(), 1.2); }

  schedule() {
    const now = this.ctx.currentTime;
    if (this.style === 'cinematico') {
      while (this.nextChordAt < now + 2) {
        const chord = CINE[this.step % CINE.length];
        this.strings(chord, this.nextChordAt, CINE_SECONDS + 5);
        if (this.step % 2 === 1) this.choir(chord.slice(2), this.nextChordAt + 1.5, CINE_SECONDS + 2);
        this.step++; this.nextChordAt += CINE_SECONDS;
      }
      return;
    }
    while (this.nextChordAt < now + 2) {
      this.chord(CHORDS[this.step % CHORDS.length], this.nextChordAt);
      this.step++; this.nextChordAt += CHORD_SECONDS;
    }
    while (this.nextBellAt < now + 2) {
      const notes = CHORDS[(this.step + CHORDS.length - 1) % CHORDS.length].map(n => n + 24).filter(n => BELLS.includes(n) || n % 12 === 0 || n % 12 === 7);
      const pick = notes.length && Math.random() < 0.6 ? notes[Math.floor(Math.random() * notes.length)] : BELLS[Math.floor(Math.random() * BELLS.length)];
      this.bell(pick, this.nextBellAt);
      this.nextBellAt += 3 + Math.random() * 5;
    }
  }
  chord(notes, t) {
    const dur = CHORD_SECONDS + 4; // sobreposição para transições suaves
    notes.forEach((n, i) => {
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.11 / (1 + i * 0.25), t + 3.5);
      g.gain.setValueAtTime(0.11 / (1 + i * 0.25), t + dur - 4.5);
      g.gain.linearRampToValueAtTime(0, t + dur);
      g.connect(this.bus);
      [[-4, 'sine'], [4, 'sine'], [0, 'triangle']].forEach(([detune, type]) => {
        const o = this.ctx.createOscillator();
        o.type = type; o.frequency.value = NOTE(n); o.detune.value = detune;
        const og = this.ctx.createGain(); og.gain.value = type === 'triangle' ? 0.35 : 0.5;
        o.connect(og).connect(g); o.start(t); o.stop(t + dur + 0.1);
      });
    });
  }
  bell(n, t) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.value = NOTE(n);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.045, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
    o.connect(g).connect(this.bus); o.start(t); o.stop(t + 4.1);
  }

  // Cordas: serras desafinadas filtradas, ataque lento e "respiração" no filtro
  strings(notes, t, dur) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.7;
    f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(1300, t + dur * 0.5); f.frequency.linearRampToValueAtTime(600, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 4.5);
    g.gain.setValueAtTime(0.05, t + dur - 5); g.gain.linearRampToValueAtTime(0, t + dur);
    f.connect(g).connect(this.bus);
    notes.forEach((n, i) => [-9, 0, 8].forEach(det => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = det + (Math.random() * 4 - 2);
      const og = ctx.createGain(); og.gain.value = i === 0 ? 0.55 : 0.32;
      o.connect(og).connect(f); o.start(t); o.stop(t + dur + 0.1);
    }));
  }
  // Coral "ah": serra passando por filtros de formantes (vogal A)
  choir(notes, t, dur) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 3.5);
    g.gain.setValueAtTime(0.03, t + dur - 4); g.gain.linearRampToValueAtTime(0, t + dur);
    g.connect(this.bus);
    [[730, 6, 1], [1090, 8, 0.5], [2440, 10, 0.2]].forEach(([freq, q, amp]) => {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
      const a = ctx.createGain(); a.gain.value = amp * 2.2;
      bp.connect(a).connect(g);
      notes.forEach(n => {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n + 12);
        const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5 + Math.random(); vg.gain.value = 6;
        vib.connect(vg).connect(o.detune);
        o.connect(bp); o.start(t); vib.start(t); o.stop(t + dur + 0.1); vib.stop(t + dur + 0.1);
      });
    });
  }
  // Nota pedal grave (Ré) contínua, típica de trilhas épicas
  startDrone() {
    const ctx = this.ctx, t = ctx.currentTime;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 6);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    g.connect(lp).connect(this.bus);
    this.drone = { g, oscs: [26, 38].map((n, i) => { const o = ctx.createOscillator(); o.type = i ? 'triangle' : 'sine'; o.frequency.value = NOTE(n); o.connect(g); o.start(t); return o; }) };
  }
  stopDrone(fade) {
    if (!this.drone || !this.ctx) return;
    const { g, oscs } = this.drone, t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + fade);
    oscs.forEach(o => o.stop(t + fade + 0.1)); this.drone = null;
  }
}
