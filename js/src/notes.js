import { verseKey } from './store.js';

export class NotesManager {
  constructor(store) { this.store = store; }
  all() { return this.store.data.anotacoes; }
  get(item) { const key = verseKey(item); return this.all().find(n => n.key === key); }
  getByKey(key) { return this.all().find(n => n.key === key); }
  save(item, text) {
    const existing = this.get(item);
    if (existing) {
      existing.text = text;
      existing.updatedAt = Date.now();
    } else {
      const { bookId, book, chapter, verse, text: verseText } = item;
      this.store.data.anotacoes.unshift({
        key: verseKey(item),
        reference: `${book} ${chapter}:${verse}`,
        item: { bookId, book, chapter, verse, text: verseText },
        text,
        updatedAt: Date.now()
      });
    }
    this.store.save();
  }
  update(key, text) {
    const note = this.getByKey(key);
    if (!note) return;
    note.text = text;
    note.updatedAt = Date.now();
    this.store.save();
  }
  remove(key) {
    this.store.data.anotacoes = this.all().filter(n => n.key !== key);
    this.store.data.lixeira[`note:${key}`] = Date.now();
    this.store.save();
  }
}
