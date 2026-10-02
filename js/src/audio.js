// Áudio do leitor. Usa a Web Speech API (voz do dispositivo, pt-BR) e, se existir
// uma narração licenciada em audio/manifest.json para o capítulo, usa o arquivo de áudio.
const CHARS_PER_SECOND = 14; // estimativa para mostrar tempo na voz sintética

export class AudioManager {
  constructor({ onState, onVerse, onChapterEnd, onListen } = {}) {
    Object.assign(this, { onState, onVerse, onChapterEnd, onListen });
    this.verses = []; this.index = 0; this.meta = {}; this.rate = 1; this.volume = 1; this.pitch = 1; this.gap = 0;
    this.status = 'stopped'; this.token = 0; this.voice = null; this.voiceName = '';
    this.supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    this.licensed = null; this.element = null;
    if (this.supported) {
      const pick = () => this.pickVoice();
      pick();
      speechSynthesis.addEventListener?.('voiceschanged', pick);
    }
    fetch('audio/manifest.json').then(r => (r.ok ? r.json() : null)).then(m => { this.licensed = m; }).catch(() => {});
    setInterval(() => this.tick(), 1000);
  }

  // ---------- Vozes ----------
  voices() { return this.supported ? speechSynthesis.getVoices().filter(v => v.lang?.toLowerCase().startsWith('pt')) : []; }
  // Nota de qualidade: vozes neurais/online soam humanas; as antigas do Windows (SAPI) soam robóticas.
  static quality(v) {
    const n = v.name || '';
    if (/natural|neural|online|premium|enhanced|wavenet|studio/i.test(n)) return 3;      // Edge, iOS/macOS premium
    if (/google/i.test(n) || v.localService === false) return 2;                       // vozes do Google (Chrome/Android)
    if (/^microsoft .* - portuguese/i.test(n) || /desktop/i.test(n)) return 0;          // vozes antigas do Windows
    return 1;
  }
  static isMale(v) { return /antonio|ant[oô]nio|daniel|ricardo|thiago|donato|f[aá]bio|j[uú]lio|humberto|nicolau|val[eé]rio|leonardo|felipe|male|mascul/i.test(v?.name || ''); }
  pickVoice() {
    const all = this.voices();
    const score = v => AudioManager.quality(v) * 10 + (v.lang.toLowerCase().replace('_', '-') === 'pt-br' ? 3 : 0) + (AudioManager.isMale(v) ? 1 : 0);
    const best = [...all].sort((a, b) => score(b) - score(a))[0] || null;
    this.voice = all.find(v => v.name === this.voiceName) || best;
    this.bestQuality = best ? AudioManager.quality(best) : -1;
  }
  isMaleVoice() { return AudioManager.isMale(this.voice); }
  setPitch(p) { this.pitch = Number(p) || 1; this.restartIfPlaying(); }
  setVoice(name) { this.voiceName = name; this.pickVoice(); this.restartIfPlaying(); }

  // ---------- API pública ----------
  speakVerse(text, meta = { title: 'Leitura' }) { this.playChapter([{ text }], meta, 0, { single: true }); }
  playChapter(verses, meta, start = 0, { single = false } = {}) {
    this.stopEngines();
    this.verses = verses; this.meta = meta; this.index = Math.max(0, Math.min(start, verses.length - 1)); this.single = single;
    const file = !single && this.licensed?.[`${meta.bookId}/${meta.chapter}`];
    if (file) return this.playFile(file);
    if (!this.supported) { this.emit('error', 'A leitura em voz alta não é suportada neste navegador.'); return; }
    this.speakCurrent();
  }
  pauseSpeech() {
    if (this.status !== 'playing') return;
    if (this.element) this.element.pause();
    else { this.token++; speechSynthesis.cancel(); } // pause() não funciona no Android: reinicia o versículo ao retomar
    this.status = 'paused'; this.emit();
  }
  resumeSpeech() {
    if (this.status !== 'paused') return;
    if (this.element) { this.element.play(); this.status = 'playing'; this.emit(); }
    else this.speakCurrent();
  }
  stopSpeech() { this.stopEngines(); this.status = 'stopped'; this.emit(); }
  toggle() {
    if (this.status === 'playing') this.pauseSpeech();
    else if (this.status === 'paused') this.resumeSpeech();
    else if (this.verses.length) { this.element ? this.element.play() : this.speakCurrent(); }
  }
  next() { if (this.element) { this.element.currentTime += 15; return; } if (this.index < this.verses.length - 1) this.seek(this.index + 1); }
  previous() { if (this.element) { this.element.currentTime -= 15; return; } if (this.index > 0) this.seek(this.index - 1); }
  seek(index) {
    if (this.element) return;
    this.index = Math.max(0, Math.min(index, this.verses.length - 1));
    this.speakCurrent();
  }
  seekPercent(percent) {
    if (this.element) { if (this.element.duration) this.element.currentTime = this.element.duration * percent / 100; return; }
    const target = (this.duration() * percent) / 100; let acc = 0;
    for (let i = 0; i < this.verses.length; i++) { acc += this.verseDuration(i); if (acc >= target) return this.seek(i); }
  }
  setRate(rate) { this.rate = Number(rate) || 1; if (this.element) this.element.playbackRate = this.rate; else this.restartIfPlaying(); }
  setVolume(volume) { this.volume = Number(volume); if (this.element) this.element.volume = this.volume; else this.restartIfPlaying(); }

  // ---------- Interno ----------
  restartIfPlaying() { if (this.status === 'playing' && !this.element) this.speakCurrent(); }
  stopEngines() {
    this.token++;
    if (this.supported) speechSynthesis.cancel();
    if (this.element) { this.element.pause(); this.element.src = ''; this.element = null; }
  }
  // Texto preparado para a fala: "SENHOR" → "Senhor" (algumas vozes soletram palavras em maiúsculas)
  static speechText(t) {
    return (t || '').replace(/\b([A-ZÁÉÍÓÚÂÊÔÃÕÇ]{2,})\b/g, w => w[0] + w.slice(1).toLowerCase()).replace(/\s+/g, ' ').trim();
  }
  // Divide versículos longos em frases (as vozes do Google no Chrome param sozinhas em falas longas)
  static chunks(t, max = 180) {
    const parts = t.match(/[^.!?;:]+[.!?;:]*["”’)]*\s*/g) || [t];
    const out = []; let cur = '';
    for (const p of parts) {
      if ((cur + p).length > max && cur) { out.push(cur.trim()); cur = ''; }
      if (p.length > max) { p.split(/,\s+/).map((q, k, arr) => (k < arr.length - 1 ? q + ',' : q)).forEach(q => { if ((cur + q).length > max && cur) { out.push(cur.trim()); cur = ''; } cur += q + ' '; }); }
      else cur += p;
    }
    if (cur.trim()) out.push(cur.trim());
    return out.length ? out : [t];
  }
  speakCurrent() {
    const token = ++this.token;
    if (this.supported) speechSynthesis.cancel();
    const verse = this.verses[this.index];
    if (!verse) return;
    const parts = AudioManager.chunks(AudioManager.speechText(verse.text));
    const speakPart = i => {
      const u = new SpeechSynthesisUtterance(parts[i]);
      u.lang = this.voice?.lang || 'pt-BR';
      if (this.voice) u.voice = this.voice;
      u.rate = this.rate * (this.rateFactor || 1); u.volume = this.volume; u.pitch = this.pitch;
      if (i === 0) u.onstart = () => { if (token !== this.token) return; this.verseStarted = Date.now(); this.status = 'playing'; this.emit(); };
      u.onend = () => {
        if (token !== this.token) return; // evento de uma fala cancelada
        if (i < parts.length - 1) return speakPart(i + 1);
        if (!this.single && this.index < this.verses.length - 1) { this.index++; this.onVerse?.(this.index); if (this.gap) setTimeout(() => { if (token === this.token) this.speakCurrent(); }, this.gap); else this.speakCurrent(); }
        else { this.status = 'stopped'; this.emit(); if (!this.single) this.onChapterEnd?.(this.meta); }
      };
      u.onerror = e => {
        if (token !== this.token || e.error === 'interrupted' || e.error === 'canceled') return;
        this.status = 'stopped'; this.emit('error', 'Não foi possível reproduzir a voz neste dispositivo.');
      };
      speechSynthesis.speak(u);
    };
    this.status = 'playing'; this.verseStarted = Date.now();
    this.onVerse?.(this.index);
    this.emit();
    // Pequeno atraso: o Chrome às vezes ignora speak() logo após cancel().
    setTimeout(() => { if (token === this.token) speakPart(0); }, 60);
  }
  playFile(src) {
    const el = new Audio(src);
    el.playbackRate = this.rate; el.volume = this.volume;
    el.onplay = () => { this.status = 'playing'; this.emit(); };
    el.onpause = () => { if (this.status === 'playing') { this.status = 'paused'; this.emit(); } };
    el.onended = () => { this.status = 'stopped'; this.emit(); this.onChapterEnd?.(this.meta); };
    el.ontimeupdate = () => this.emit();
    el.onerror = () => this.emit('error', 'Arquivo de narração não encontrado.');
    this.element = el; this.status = 'playing'; el.play().catch(() => {}); this.emit();
  }
  verseDuration(i) { return Math.max(1.5, (this.verses[i]?.text?.length || 0) / (CHARS_PER_SECOND * this.rate)); }
  duration() { return this.element ? (this.element.duration || 0) : this.verses.reduce((s, _, i) => s + this.verseDuration(i), 0); }
  elapsed() {
    if (this.element) return this.element.currentTime || 0;
    let acc = 0; for (let i = 0; i < this.index; i++) acc += this.verseDuration(i);
    if (this.status === 'playing' && this.verseStarted) acc += Math.min((Date.now() - this.verseStarted) / 1000, this.verseDuration(this.index));
    return acc;
  }
  tick() {
    if (this.status !== 'playing') return;
    this.onListen?.(1);
    this.emit();
  }
  emit(type, message) {
    this.onState?.({
      type, message, status: this.status, index: this.index, total: this.verses.length, meta: this.meta,
      licensed: !!this.element, elapsed: this.elapsed(), duration: this.duration()
    });
  }
}
