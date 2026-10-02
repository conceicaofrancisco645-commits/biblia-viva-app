// Armazenamento local (localStorage) com notificação de mudanças.
// É a fonte da verdade no aparelho; o Firebase (sync.js) apenas sincroniza esta estrutura.
const KEY = 'biblia-viva-data';

export const emptyData = () => ({
  favoritos: [],        // [{key, bookId, book, chapter, verse, text, at}]
  anotacoes: [],        // [{key, reference, item, text, updatedAt}]
  progresso: {},        // {"joao:3": timestamp}
  configuracoes: {},    // {theme, fontSize, audioSpeed, ..., updatedAt}
  historico: [],        // [{bookId, chapter, verse, at}]  (mais recente primeiro)
  planoLeitura: {},     // {active, activeAt, done: {planId: [dia,...]}}
  diasLeitura: [],      // ["2026-10-01", ...] datas locais com leitura
  tempoOuvindo: 0,      // segundos
  lixeira: {}           // {"fav:joao:3:16": timestamp} remoções, para a sincronização
});

export class Store {
  constructor() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { saved = {}; }
    this.data = Object.assign(emptyData(), saved);
    this.listeners = new Set();
  }
  save({ silent = false } = {}) {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* armazenamento cheio ou bloqueado */ }
    if (!silent) this.listeners.forEach(fn => fn(this.data));
  }
  replace(data) {
    this.data = Object.assign(emptyData(), data);
    this.save({ silent: true });
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  settings() { return this.data.configuracoes; }
  setSetting(name, value) {
    this.data.configuracoes[name] = value;
    this.data.configuracoes.updatedAt = Date.now();
    this.save();
  }
}

export const verseKey = item => `${item.bookId}:${item.chapter}:${item.verse}`;
export const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
