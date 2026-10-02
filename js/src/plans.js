// Planos de leitura gerados a partir da lista de livros/capítulos.
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

export const PLAN_DEFS = [
  { id: '30-dias', name: 'Plano 30 dias', description: 'Gênesis e Êxodo: o começo da história de Deus com seu povo.', days: 30, books: ['genesis', 'exodo'] },
  { id: '90-dias', name: 'Plano 90 dias', description: 'Todo o Novo Testamento em um ritmo constante.', days: 90, testament: 'Novo Testamento' },
  { id: '1-ano', name: 'Bíblia em 1 ano', description: 'Uma porção diária, de Gênesis a Apocalipse.', days: 365, all: true },
  { id: 'evangelhos', name: 'Evangelhos', description: 'Mateus, Marcos, Lucas e João em 45 dias.', days: 45, books: ['mateus', 'marcos', 'lucas', 'joao'] },
  { id: 'vida-de-jesus', name: 'Vida de Jesus', description: 'Do nascimento à ressurreição, por Lucas e João, um capítulo por dia.', days: 45, books: ['lucas', 'joao'] }
];

export class PlanManager {
  constructor(store, provider) { this.store = store; this.provider = provider; this.cache = new Map(); }
  get state() { const p = this.store.data.planoLeitura; p.done ||= {}; return p; }
  activeId() { return this.state.active || 'evangelhos'; }
  def(id) { return PLAN_DEFS.find(p => p.id === id) || PLAN_DEFS[3]; }

  chapters(def) {
    const books = def.all ? this.provider.books : def.testament ? this.provider.getBooks(def.testament) : def.books.map(id => this.provider.getBook(id));
    return books.flatMap(b => range(1, b.chapters).map(c => ({ bookId: b.id, book: b.name, chapter: c })));
  }
  // Divide os capítulos em N dias, o mais uniforme possível.
  schedule(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    const def = this.def(id), list = this.chapters(def), days = [];
    for (let d = 0; d < def.days; d++) {
      const start = Math.floor((d * list.length) / def.days), end = Math.floor(((d + 1) * list.length) / def.days);
      days.push(list.slice(start, end));
    }
    this.cache.set(id, days);
    return days;
  }
  label(day) {
    const groups = [];
    for (const item of day) {
      const last = groups[groups.length - 1];
      if (last && last.book === item.book && last.to === item.chapter - 1) last.to = item.chapter;
      else groups.push({ book: item.book, from: item.chapter, to: item.chapter });
    }
    return groups.map(g => (g.from === g.to ? `${g.book} ${g.from}` : `${g.book} ${g.from}–${g.to}`)).join('; ');
  }
  isDayDone(id, index, progress) {
    const done = this.state.done[id] || [];
    if (done.includes(index)) return true;
    const day = this.schedule(id)[index];
    return day.length > 0 && day.every(c => progress.isRead(c.bookId, c.chapter));
  }
  today(progress, id = this.activeId()) {
    const days = this.schedule(id);
    let index = days.findIndex((_, i) => !this.isDayDone(id, i, progress));
    const finished = index === -1;
    if (finished) index = days.length - 1;
    const doneCount = days.filter((_, i) => this.isDayDone(id, i, progress)).length;
    return { def: this.def(id), index, day: days[index], label: this.label(days[index]), finished, doneCount, total: days.length };
  }
  setActive(id) { this.state.active = id; this.state.activeAt = Date.now(); this.store.save(); }
  markDay(id, index, progress) {
    const done = (this.state.done[id] ||= []);
    if (!done.includes(index)) done.push(index);
    // Concluir o dia também marca os capítulos como lidos.
    this.schedule(id)[index].forEach(c => { if (!progress.isRead(c.bookId, c.chapter)) this.store.data.progresso[progress.key(c.bookId, c.chapter)] = Date.now(); });
    progress.registerDay();
    this.store.save();
  }
}
