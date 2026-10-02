// Camada de dados bíblicos. Para trocar de tradução, gere novos arquivos em
// data/index.js e data/books/<id>.js no mesmo formato (veja README).
const normalize = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Versículos do dia: lista curada de referências (o texto vem da tradução carregada).
const DAILY = [
  ['salmos', 119, 105], ['joao', 3, 16], ['salmos', 23, 1], ['filipenses', 4, 13], ['romanos', 8, 28],
  ['proverbios', 3, 5], ['isaias', 41, 10], ['jeremias', 29, 11], ['mateus', 11, 28], ['josue', 1, 9],
  ['salmos', 46, 1], ['romanos', 12, 2], ['2corintios', 5, 17], ['galatas', 2, 20], ['efesios', 2, 8],
  ['hebreus', 11, 1], ['1joao', 4, 8], ['joao', 14, 6], ['salmos', 37, 5], ['mateus', 6, 33],
  ['lamentacoes', 3, 22], ['isaias', 40, 31], ['salmos', 91, 1], ['romanos', 10, 17], ['joao', 8, 32],
  ['1corintios', 13, 4], ['tiago', 1, 5], ['salmos', 121, 1], ['mateus', 5, 9], ['colossenses', 3, 23],
  ['joao', 1, 1], ['salmos', 27, 1], ['proverbios', 16, 3], ['1pedro', 5, 7], ['miqueias', 6, 8],
  ['salmos', 139, 14], ['2timoteo', 1, 7], ['joao', 16, 33], ['romanos', 5, 8], ['filipenses', 4, 6],
  ['salmos', 34, 8], ['isaias', 26, 3], ['mateus', 28, 20], ['genesis', 1, 1], ['apocalipse', 21, 4]
];

// Os dados ficam em arquivos .js carregados por <script>, o que funciona tanto em
// http://localhost quanto abrindo o index.html direto (file://), onde fetch() é bloqueado.
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => { s.remove(); resolve(); };
    s.onerror = () => { s.remove(); reject(new Error(`Não foi possível carregar ${src}`)); };
    document.head.append(s);
  });
}

export class BibleDataProvider {
  constructor() { this.index = null; this.cache = new Map(); this.loading = new Map(); }

  async loadIndex() {
    if (!window.BV_INDEX) await loadScript('data/index.js');
    this.index = window.BV_INDEX;
    this.books = this.index.books;
    return this.index;
  }
  get credit() { return this.index?.credit || ''; }
  get translation() { return this.index?.translation || ''; }

  getBooks(testament) { return this.books.filter(b => !testament || b.testament === testament); }
  getBook(id) { return this.books.find(b => b.id === id); }
  getChapters(bookId) { const b = this.getBook(bookId); return b ? Array.from({ length: b.chapters }, (_, i) => i + 1) : []; }
  totalChapters(testament) { return this.getBooks(testament).reduce((s, b) => s + b.chapters, 0); }
  nextChapter(bookId, chapter) {
    const i = this.books.findIndex(b => b.id === bookId);
    if (chapter < this.books[i].chapters) return { bookId, chapter: chapter + 1 };
    return this.books[i + 1] ? { bookId: this.books[i + 1].id, chapter: 1 } : null;
  }
  previousChapter(bookId, chapter) {
    const i = this.books.findIndex(b => b.id === bookId);
    if (chapter > 1) return { bookId, chapter: chapter - 1 };
    return this.books[i - 1] ? { bookId: this.books[i - 1].id, chapter: this.books[i - 1].chapters } : null;
  }

  async loadBook(bookId) {
    if (this.cache.has(bookId)) return this.cache.get(bookId);
    if (!this.loading.has(bookId)) {
      this.loading.set(bookId, (window.BV_BOOKS?.[bookId] ? Promise.resolve() : loadScript(`data/books/${bookId}.js`)).then(() => {
        const data = window.BV_BOOKS?.[bookId];
        if (!data) throw new Error(`Livro não encontrado: ${bookId}`); this.cache.set(bookId, data); this.loading.delete(bookId); return data; })
        .catch(err => { this.loading.delete(bookId); throw err; }));
    }
    return this.loading.get(bookId);
  }

  makeItem(book, chapter, verse, text) {
    return { bookId: book.id, book: book.name, chapter: Number(chapter), verse: Number(verse), text, testament: book.testament };
  }
  async getChapter(bookId, chapter) {
    const data = await this.loadBook(bookId);
    const book = this.getBook(bookId);
    const verses = (data.chapters[String(chapter)] || []).map(([n, t]) => this.makeItem(book, chapter, n, t));
    return { book, chapter: Number(chapter), title: data.titles?.[String(chapter)] || '', verses };
  }
  async getVerse(bookId, chapter, verse) {
    const { verses } = await this.getChapter(bookId, chapter);
    return verses.find(v => v.verse === Number(verse)) || null;
  }

  async getVerseOfTheDay(date = new Date()) {
    // Mesmo versículo durante todo o dia local do usuário.
    const start = new Date(date.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((date - start) / 86400000);
    const [b, c, v] = DAILY[(dayOfYear + date.getFullYear()) % DAILY.length];
    return this.getVerse(b, c, v);
  }

  // Interpreta "João 3:16", "jo 3 16", "Sl 23", "1 Co 13:4-7"
  parseReference(query) {
    const m = normalize(query).trim().match(/^((?:[1-3]\s*)?[a-z]+)\.?\s*(\d+)?(?:\s*[:.,\s]\s*(\d+))?(?:\s*-\s*(\d+))?$/);
    if (!m) return null;
    const name = m[1].replace(/\s+/g, '');
    const book = this.books.find(b => normalize(b.name).replace(/\s+/g, '') === name)
      || this.books.find(b => normalize(b.abbrev).replace(/\s+/g, '') === name)
      || (name.length >= 3 ? this.books.find(b => normalize(b.name).replace(/\s+/g, '').startsWith(name)) : null);
    if (!book) return null;
    const chapter = m[2] ? Number(m[2]) : 1;
    if (chapter < 1 || chapter > book.chapters) return null;
    return { book, chapter, verse: m[3] ? Number(m[3]) : null, verseEnd: m[4] ? Number(m[4]) : null };
  }

  async loadAll(onProgress) {
    let done = 0;
    await Promise.all(this.books.map(b => this.loadBook(b.id).then(() => onProgress?.(++done, this.books.length))));
  }

  // Busca por palavra(s) inteira(s) em toda a Bíblia, sem diferenciar acentos.
  async search(query, { limit = 200, testament = '', onProgress } = {}) {
    const q = normalize(query).trim();
    if (!q) return { reference: null, results: [], total: 0 };
    const reference = this.parseReference(query);
    if (reference && /\d/.test(query)) {
      const { verses } = await this.getChapter(reference.book.id, reference.chapter);
      const from = reference.verse || 1, to = reference.verseEnd || reference.verse || verses.length;
      const results = verses.filter(v => v.verse >= from && v.verse <= to);
      return { reference: null, results, total: results.length };
    }
    await this.loadAll(onProgress);
    const words = q.split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(^|[^a-z0-9])${words.join('[^a-z0-9]+')}(?=$|[^a-z0-9])`);
    const results = []; let total = 0;
    for (const book of this.getBooks(testament)) {
      const data = this.cache.get(book.id);
      for (const [chapter, verses] of Object.entries(data.chapters)) {
        for (const [n, text] of verses) {
          if (pattern.test(normalize(text))) {
            total++;
            if (results.length < limit) results.push(this.makeItem(book, chapter, n, text));
          }
        }
      }
    }
    // Livro sem número ("Salmos", "João") também é um resultado útil.
    return { reference: reference && !/\d/.test(query) ? reference : null, results, total };
  }
}
