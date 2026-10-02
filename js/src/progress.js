import { localDate } from './store.js';

export class ProgressManager {
  constructor(store) { this.store = store; }
  key(bookId, chapter) { return `${bookId}:${chapter}`; }

  markChapter(bookId, chapter) {
    this.store.data.progresso[this.key(bookId, chapter)] = Date.now();
    this.registerDay();
    this.store.save();
  }
  isRead(bookId, chapter) { return !!this.store.data.progresso[this.key(bookId, chapter)]; }

  registerDay() {
    const today = localDate();
    if (!this.store.data.diasLeitura.includes(today)) this.store.data.diasLeitura.push(today);
  }
  setLast(bookId, chapter, verse = 1) {
    const h = this.store.data.historico;
    h.unshift({ bookId, chapter: Number(chapter), verse: Number(verse), at: Date.now() });
    this.store.data.historico = h.filter((x, i, a) => a.findIndex(y => y.bookId === x.bookId && y.chapter === x.chapter) === i).slice(0, 20);
    this.registerDay();
    this.store.save();
  }
  last() { return this.store.data.historico[0] || null; }
  addListening(seconds) {
    if (seconds > 0 && seconds < 3600) { this.store.data.tempoOuvindo += seconds; this.store.save({ silent: true }); }
  }

  streak() {
    const days = new Set(this.store.data.diasLeitura);
    const d = new Date();
    if (!days.has(localDate(d))) d.setDate(d.getDate() - 1); // ainda dá tempo de ler hoje
    let count = 0;
    while (days.has(localDate(d))) { count++; d.setDate(d.getDate() - 1); }
    return count;
  }

  stats(provider) {
    const keys = Object.keys(this.store.data.progresso);
    const readSet = new Set(keys);
    const total = provider.totalChapters();
    const oldTotal = provider.totalChapters('Antigo Testamento');
    const oldRead = keys.filter(k => provider.getBook(k.split(':')[0])?.testament === 'Antigo Testamento').length;
    const booksDone = provider.books.filter(b => provider.getChapters(b.id).every(c => readSet.has(this.key(b.id, c)))).length;
    const pct = (v, t) => (t ? Math.round((v / t) * 1000) / 10 : 0);
    return {
      read: keys.length, total, percent: pct(keys.length, total),
      oldTotal, oldRead, oldPercent: pct(oldRead, oldTotal),
      newTotal: total - oldTotal, newRead: keys.length - oldRead, newPercent: pct(keys.length - oldRead, total - oldTotal),
      booksDone, days: this.store.data.diasLeitura.length, streak: this.streak(),
      listening: this.store.data.tempoOuvindo
    };
  }
  bookPercent(provider, bookId) {
    const chapters = provider.getChapters(bookId);
    return chapters.length ? Math.round(chapters.filter(c => this.isRead(bookId, c)).length / chapters.length * 100) : 0;
  }
}
