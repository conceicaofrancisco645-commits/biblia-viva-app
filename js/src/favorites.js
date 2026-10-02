import { verseKey } from './store.js';

export class FavoritesManager {
  constructor(store) { this.store = store; }
  getAll() { return this.store.data.favoritos; }
  isFavorite(item) { const key = verseKey(item); return this.getAll().some(f => f.key === key); }
  toggle(item) {
    const key = verseKey(item);
    const list = this.store.data.favoritos;
    const index = list.findIndex(f => f.key === key);
    if (index >= 0) {
      list.splice(index, 1);
      this.store.data.lixeira[`fav:${key}`] = Date.now();
    } else {
      const { bookId, book, chapter, verse, text, testament } = item;
      list.unshift({ key, bookId, book, chapter, verse, text, testament, at: Date.now() });
    }
    this.store.save();
    return index < 0;
  }
}
