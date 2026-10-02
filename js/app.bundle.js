(() => {
  // app/js/src/store.js
  var KEY = "biblia-viva-data";
  var emptyData = () => ({
    favoritos: [],
    // [{key, bookId, book, chapter, verse, text, at}]
    anotacoes: [],
    // [{key, reference, item, text, updatedAt}]
    progresso: {},
    // {"joao:3": timestamp}
    configuracoes: {},
    // {theme, fontSize, audioSpeed, ..., updatedAt}
    historico: [],
    // [{bookId, chapter, verse, at}]  (mais recente primeiro)
    planoLeitura: {},
    // {active, activeAt, done: {planId: [dia,...]}}
    diasLeitura: [],
    // ["2026-10-01", ...] datas locais com leitura
    tempoOuvindo: 0,
    // segundos
    lixeira: {}
    // {"fav:joao:3:16": timestamp} remoções, para a sincronização
  });
  var Store = class {
    constructor() {
      let saved = {};
      try {
        saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
      } catch {
        saved = {};
      }
      this.data = Object.assign(emptyData(), saved);
      this.listeners = /* @__PURE__ */ new Set();
    }
    save({ silent = false } = {}) {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.data));
      } catch {
      }
      if (!silent) this.listeners.forEach((fn) => fn(this.data));
    }
    replace(data) {
      this.data = Object.assign(emptyData(), data);
      this.save({ silent: true });
    }
    onChange(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }
    settings() {
      return this.data.configuracoes;
    }
    setSetting(name, value) {
      this.data.configuracoes[name] = value;
      this.data.configuracoes.updatedAt = Date.now();
      this.save();
    }
  };
  var verseKey = (item) => `${item.bookId}:${item.chapter}:${item.verse}`;
  var localDate = (date = /* @__PURE__ */ new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  // app/js/src/bible.js
  var normalize = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  var DAILY = [
    ["salmos", 119, 105],
    ["joao", 3, 16],
    ["salmos", 23, 1],
    ["filipenses", 4, 13],
    ["romanos", 8, 28],
    ["proverbios", 3, 5],
    ["isaias", 41, 10],
    ["jeremias", 29, 11],
    ["mateus", 11, 28],
    ["josue", 1, 9],
    ["salmos", 46, 1],
    ["romanos", 12, 2],
    ["2corintios", 5, 17],
    ["galatas", 2, 20],
    ["efesios", 2, 8],
    ["hebreus", 11, 1],
    ["1joao", 4, 8],
    ["joao", 14, 6],
    ["salmos", 37, 5],
    ["mateus", 6, 33],
    ["lamentacoes", 3, 22],
    ["isaias", 40, 31],
    ["salmos", 91, 1],
    ["romanos", 10, 17],
    ["joao", 8, 32],
    ["1corintios", 13, 4],
    ["tiago", 1, 5],
    ["salmos", 121, 1],
    ["mateus", 5, 9],
    ["colossenses", 3, 23],
    ["joao", 1, 1],
    ["salmos", 27, 1],
    ["proverbios", 16, 3],
    ["1pedro", 5, 7],
    ["miqueias", 6, 8],
    ["salmos", 139, 14],
    ["2timoteo", 1, 7],
    ["joao", 16, 33],
    ["romanos", 5, 8],
    ["filipenses", 4, 6],
    ["salmos", 34, 8],
    ["isaias", 26, 3],
    ["mateus", 28, 20],
    ["genesis", 1, 1],
    ["apocalipse", 21, 4]
  ];
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => {
        s.remove();
        resolve();
      };
      s.onerror = () => {
        s.remove();
        reject(new Error(`N\xE3o foi poss\xEDvel carregar ${src}`));
      };
      document.head.append(s);
    });
  }
  var BibleDataProvider = class {
    constructor() {
      this.index = null;
      this.cache = /* @__PURE__ */ new Map();
      this.loading = /* @__PURE__ */ new Map();
    }
    async loadIndex() {
      if (!window.BV_INDEX) await loadScript("data/index.js");
      this.index = window.BV_INDEX;
      this.books = this.index.books;
      return this.index;
    }
    get credit() {
      var _a;
      return ((_a = this.index) == null ? void 0 : _a.credit) || "";
    }
    get translation() {
      var _a;
      return ((_a = this.index) == null ? void 0 : _a.translation) || "";
    }
    getBooks(testament) {
      return this.books.filter((b) => !testament || b.testament === testament);
    }
    getBook(id) {
      return this.books.find((b) => b.id === id);
    }
    getChapters(bookId) {
      const b = this.getBook(bookId);
      return b ? Array.from({ length: b.chapters }, (_, i) => i + 1) : [];
    }
    totalChapters(testament) {
      return this.getBooks(testament).reduce((s, b) => s + b.chapters, 0);
    }
    nextChapter(bookId, chapter) {
      const i = this.books.findIndex((b) => b.id === bookId);
      if (chapter < this.books[i].chapters) return { bookId, chapter: chapter + 1 };
      return this.books[i + 1] ? { bookId: this.books[i + 1].id, chapter: 1 } : null;
    }
    previousChapter(bookId, chapter) {
      const i = this.books.findIndex((b) => b.id === bookId);
      if (chapter > 1) return { bookId, chapter: chapter - 1 };
      return this.books[i - 1] ? { bookId: this.books[i - 1].id, chapter: this.books[i - 1].chapters } : null;
    }
    async loadBook(bookId) {
      var _a;
      if (this.cache.has(bookId)) return this.cache.get(bookId);
      if (!this.loading.has(bookId)) {
        this.loading.set(bookId, (((_a = window.BV_BOOKS) == null ? void 0 : _a[bookId]) ? Promise.resolve() : loadScript(`data/books/${bookId}.js`)).then(() => {
          var _a2;
          const data = (_a2 = window.BV_BOOKS) == null ? void 0 : _a2[bookId];
          if (!data) throw new Error(`Livro n\xE3o encontrado: ${bookId}`);
          this.cache.set(bookId, data);
          this.loading.delete(bookId);
          return data;
        }).catch((err) => {
          this.loading.delete(bookId);
          throw err;
        }));
      }
      return this.loading.get(bookId);
    }
    makeItem(book, chapter, verse, text) {
      return { bookId: book.id, book: book.name, chapter: Number(chapter), verse: Number(verse), text, testament: book.testament };
    }
    async getChapter(bookId, chapter) {
      var _a;
      const data = await this.loadBook(bookId);
      const book = this.getBook(bookId);
      const verses = (data.chapters[String(chapter)] || []).map(([n, t]) => this.makeItem(book, chapter, n, t));
      return { book, chapter: Number(chapter), title: ((_a = data.titles) == null ? void 0 : _a[String(chapter)]) || "", verses };
    }
    async getVerse(bookId, chapter, verse) {
      const { verses } = await this.getChapter(bookId, chapter);
      return verses.find((v) => v.verse === Number(verse)) || null;
    }
    async getVerseOfTheDay(date = /* @__PURE__ */ new Date()) {
      const start = new Date(date.getFullYear(), 0, 0);
      const dayOfYear = Math.floor((date - start) / 864e5);
      const [b, c, v] = DAILY[(dayOfYear + date.getFullYear()) % DAILY.length];
      return this.getVerse(b, c, v);
    }
    // Interpreta "João 3:16", "jo 3 16", "Sl 23", "1 Co 13:4-7"
    parseReference(query) {
      const m = normalize(query).trim().match(/^((?:[1-3]\s*)?[a-z]+)\.?\s*(\d+)?(?:\s*[:.,\s]\s*(\d+))?(?:\s*-\s*(\d+))?$/);
      if (!m) return null;
      const name = m[1].replace(/\s+/g, "");
      const book = this.books.find((b) => normalize(b.name).replace(/\s+/g, "") === name) || this.books.find((b) => normalize(b.abbrev).replace(/\s+/g, "") === name) || (name.length >= 3 ? this.books.find((b) => normalize(b.name).replace(/\s+/g, "").startsWith(name)) : null);
      if (!book) return null;
      const chapter = m[2] ? Number(m[2]) : 1;
      if (chapter < 1 || chapter > book.chapters) return null;
      return { book, chapter, verse: m[3] ? Number(m[3]) : null, verseEnd: m[4] ? Number(m[4]) : null };
    }
    async loadAll(onProgress) {
      let done = 0;
      await Promise.all(this.books.map((b) => this.loadBook(b.id).then(() => onProgress == null ? void 0 : onProgress(++done, this.books.length))));
    }
    // Busca por palavra(s) inteira(s) em toda a Bíblia, sem diferenciar acentos.
    async search(query, { limit = 200, testament = "", onProgress } = {}) {
      const q = normalize(query).trim();
      if (!q) return { reference: null, results: [], total: 0 };
      const reference = this.parseReference(query);
      if (reference && /\d/.test(query)) {
        const { verses } = await this.getChapter(reference.book.id, reference.chapter);
        const from = reference.verse || 1, to = reference.verseEnd || reference.verse || verses.length;
        const results2 = verses.filter((v) => v.verse >= from && v.verse <= to);
        return { reference: null, results: results2, total: results2.length };
      }
      await this.loadAll(onProgress);
      const words = q.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const pattern = new RegExp(`(^|[^a-z0-9])${words.join("[^a-z0-9]+")}(?=$|[^a-z0-9])`);
      const results = [];
      let total = 0;
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
      return { reference: reference && !/\d/.test(query) ? reference : null, results, total };
    }
  };

  // app/js/src/favorites.js
  var FavoritesManager = class {
    constructor(store2) {
      this.store = store2;
    }
    getAll() {
      return this.store.data.favoritos;
    }
    isFavorite(item) {
      const key = verseKey(item);
      return this.getAll().some((f) => f.key === key);
    }
    toggle(item) {
      const key = verseKey(item);
      const list = this.store.data.favoritos;
      const index = list.findIndex((f) => f.key === key);
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
  };

  // app/js/src/notes.js
  var NotesManager = class {
    constructor(store2) {
      this.store = store2;
    }
    all() {
      return this.store.data.anotacoes;
    }
    get(item) {
      const key = verseKey(item);
      return this.all().find((n) => n.key === key);
    }
    getByKey(key) {
      return this.all().find((n) => n.key === key);
    }
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
      this.store.data.anotacoes = this.all().filter((n) => n.key !== key);
      this.store.data.lixeira[`note:${key}`] = Date.now();
      this.store.save();
    }
  };

  // app/js/src/progress.js
  var ProgressManager = class {
    constructor(store2) {
      this.store = store2;
    }
    key(bookId, chapter) {
      return `${bookId}:${chapter}`;
    }
    markChapter(bookId, chapter) {
      this.store.data.progresso[this.key(bookId, chapter)] = Date.now();
      this.registerDay();
      this.store.save();
    }
    isRead(bookId, chapter) {
      return !!this.store.data.progresso[this.key(bookId, chapter)];
    }
    registerDay() {
      const today = localDate();
      if (!this.store.data.diasLeitura.includes(today)) this.store.data.diasLeitura.push(today);
    }
    setLast(bookId, chapter, verse = 1) {
      const h = this.store.data.historico;
      h.unshift({ bookId, chapter: Number(chapter), verse: Number(verse), at: Date.now() });
      this.store.data.historico = h.filter((x, i, a) => a.findIndex((y) => y.bookId === x.bookId && y.chapter === x.chapter) === i).slice(0, 20);
      this.registerDay();
      this.store.save();
    }
    last() {
      return this.store.data.historico[0] || null;
    }
    addListening(seconds) {
      if (seconds > 0 && seconds < 3600) {
        this.store.data.tempoOuvindo += seconds;
        this.store.save({ silent: true });
      }
    }
    streak() {
      const days = new Set(this.store.data.diasLeitura);
      const d = /* @__PURE__ */ new Date();
      if (!days.has(localDate(d))) d.setDate(d.getDate() - 1);
      let count = 0;
      while (days.has(localDate(d))) {
        count++;
        d.setDate(d.getDate() - 1);
      }
      return count;
    }
    stats(provider2) {
      const keys = Object.keys(this.store.data.progresso);
      const readSet = new Set(keys);
      const total = provider2.totalChapters();
      const oldTotal = provider2.totalChapters("Antigo Testamento");
      const oldRead = keys.filter((k) => {
        var _a;
        return ((_a = provider2.getBook(k.split(":")[0])) == null ? void 0 : _a.testament) === "Antigo Testamento";
      }).length;
      const booksDone = provider2.books.filter((b) => provider2.getChapters(b.id).every((c) => readSet.has(this.key(b.id, c)))).length;
      const pct = (v, t) => t ? Math.round(v / t * 1e3) / 10 : 0;
      return {
        read: keys.length,
        total,
        percent: pct(keys.length, total),
        oldTotal,
        oldRead,
        oldPercent: pct(oldRead, oldTotal),
        newTotal: total - oldTotal,
        newRead: keys.length - oldRead,
        newPercent: pct(keys.length - oldRead, total - oldTotal),
        booksDone,
        days: this.store.data.diasLeitura.length,
        streak: this.streak(),
        listening: this.store.data.tempoOuvindo
      };
    }
    bookPercent(provider2, bookId) {
      const chapters = provider2.getChapters(bookId);
      return chapters.length ? Math.round(chapters.filter((c) => this.isRead(bookId, c)).length / chapters.length * 100) : 0;
    }
  };

  // app/js/src/plans.js
  var range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  var PLAN_DEFS = [
    { id: "30-dias", name: "Plano 30 dias", description: "G\xEAnesis e \xCAxodo: o come\xE7o da hist\xF3ria de Deus com seu povo.", days: 30, books: ["genesis", "exodo"] },
    { id: "90-dias", name: "Plano 90 dias", description: "Todo o Novo Testamento em um ritmo constante.", days: 90, testament: "Novo Testamento" },
    { id: "1-ano", name: "B\xEDblia em 1 ano", description: "Uma por\xE7\xE3o di\xE1ria, de G\xEAnesis a Apocalipse.", days: 365, all: true },
    { id: "evangelhos", name: "Evangelhos", description: "Mateus, Marcos, Lucas e Jo\xE3o em 45 dias.", days: 45, books: ["mateus", "marcos", "lucas", "joao"] },
    { id: "vida-de-jesus", name: "Vida de Jesus", description: "Do nascimento \xE0 ressurrei\xE7\xE3o, por Lucas e Jo\xE3o, um cap\xEDtulo por dia.", days: 45, books: ["lucas", "joao"] }
  ];
  var PlanManager = class {
    constructor(store2, provider2) {
      this.store = store2;
      this.provider = provider2;
      this.cache = /* @__PURE__ */ new Map();
    }
    get state() {
      const p = this.store.data.planoLeitura;
      p.done || (p.done = {});
      return p;
    }
    activeId() {
      return this.state.active || "evangelhos";
    }
    def(id) {
      return PLAN_DEFS.find((p) => p.id === id) || PLAN_DEFS[3];
    }
    chapters(def) {
      const books = def.all ? this.provider.books : def.testament ? this.provider.getBooks(def.testament) : def.books.map((id) => this.provider.getBook(id));
      return books.flatMap((b) => range(1, b.chapters).map((c) => ({ bookId: b.id, book: b.name, chapter: c })));
    }
    // Divide os capítulos em N dias, o mais uniforme possível.
    schedule(id) {
      if (this.cache.has(id)) return this.cache.get(id);
      const def = this.def(id), list = this.chapters(def), days = [];
      for (let d = 0; d < def.days; d++) {
        const start = Math.floor(d * list.length / def.days), end = Math.floor((d + 1) * list.length / def.days);
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
      return groups.map((g) => g.from === g.to ? `${g.book} ${g.from}` : `${g.book} ${g.from}\u2013${g.to}`).join("; ");
    }
    isDayDone(id, index, progress2) {
      const done = this.state.done[id] || [];
      if (done.includes(index)) return true;
      const day = this.schedule(id)[index];
      return day.length > 0 && day.every((c) => progress2.isRead(c.bookId, c.chapter));
    }
    today(progress2, id = this.activeId()) {
      const days = this.schedule(id);
      let index = days.findIndex((_, i) => !this.isDayDone(id, i, progress2));
      const finished = index === -1;
      if (finished) index = days.length - 1;
      const doneCount = days.filter((_, i) => this.isDayDone(id, i, progress2)).length;
      return { def: this.def(id), index, day: days[index], label: this.label(days[index]), finished, doneCount, total: days.length };
    }
    setActive(id) {
      this.state.active = id;
      this.state.activeAt = Date.now();
      this.store.save();
    }
    markDay(id, index, progress2) {
      var _a;
      const done = (_a = this.state.done)[id] || (_a[id] = []);
      if (!done.includes(index)) done.push(index);
      this.schedule(id)[index].forEach((c) => {
        if (!progress2.isRead(c.bookId, c.chapter)) this.store.data.progresso[progress2.key(c.bookId, c.chapter)] = Date.now();
      });
      progress2.registerDay();
      this.store.save();
    }
  };

  // app/js/src/search.js
  var SearchManager = class {
    constructor(provider2) {
      this.provider = provider2;
      this.seq = 0;
      this.timer = null;
    }
    search(query, options) {
      return this.provider.search(query, options);
    }
    debounced(query, callback, options = {}, delay = 250) {
      clearTimeout(this.timer);
      const id = ++this.seq;
      this.timer = setTimeout(async () => {
        try {
          const result = await this.provider.search(query, options);
          if (id === this.seq) callback(null, result);
        } catch (err) {
          if (id === this.seq) callback(err);
        }
      }, delay);
    }
  };

  // app/js/src/audio.js
  var CHARS_PER_SECOND = 14;
  var AudioManager = class {
    constructor({ onState, onVerse, onChapterEnd, onListen } = {}) {
      var _a;
      Object.assign(this, { onState, onVerse, onChapterEnd, onListen });
      this.verses = [];
      this.index = 0;
      this.meta = {};
      this.rate = 1;
      this.volume = 1;
      this.pitch = 0.85;
      this.gap = 0;
      this.status = "stopped";
      this.token = 0;
      this.voice = null;
      this.voiceName = "";
      this.supported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
      this.licensed = null;
      this.element = null;
      if (this.supported) {
        const pick = () => this.pickVoice();
        pick();
        (_a = speechSynthesis.addEventListener) == null ? void 0 : _a.call(speechSynthesis, "voiceschanged", pick);
      }
      fetch("audio/manifest.json").then((r) => r.ok ? r.json() : null).then((m) => {
        this.licensed = m;
      }).catch(() => {
      });
      setInterval(() => this.tick(), 1e3);
    }
    // ---------- Vozes ----------
    voices() {
      return this.supported ? speechSynthesis.getVoices().filter((v) => {
        var _a;
        return (_a = v.lang) == null ? void 0 : _a.toLowerCase().startsWith("pt");
      }) : [];
    }
    pickVoice() {
      const all = this.voices();
      const br = all.filter((v) => v.lang.toLowerCase().replace("_", "-") === "pt-br");
      const MALE = /antonio|ant[oô]nio|daniel|ricardo|thiago|donato|fabio|f[aá]bio|julio|j[uú]lio|humberto|nicolau|valerio|val[eé]rio|leonardo|felipe|male|mascul/i;
      const NATURAL = /natural|online|neural|premium|enhanced/i;
      this.voice = all.find((v) => v.name === this.voiceName) || br.find((v) => MALE.test(v.name) && NATURAL.test(v.name)) || br.find((v) => MALE.test(v.name)) || br.find((v) => NATURAL.test(v.name)) || br[0] || all[0] || null;
    }
    isMaleVoice() {
      var _a;
      return /antonio|ant[oô]nio|daniel|ricardo|thiago|donato|f[aá]bio|j[uú]lio|humberto|nicolau|val[eé]rio|leonardo|felipe|male|mascul/i.test(((_a = this.voice) == null ? void 0 : _a.name) || "");
    }
    setPitch(p) {
      this.pitch = Number(p) || 1;
      this.restartIfPlaying();
    }
    setVoice(name) {
      this.voiceName = name;
      this.pickVoice();
      this.restartIfPlaying();
    }
    // ---------- API pública ----------
    speakVerse(text, meta = { title: "Leitura" }) {
      this.playChapter([{ text }], meta, 0, { single: true });
    }
    playChapter(verses, meta, start = 0, { single = false } = {}) {
      var _a;
      this.stopEngines();
      this.verses = verses;
      this.meta = meta;
      this.index = Math.max(0, Math.min(start, verses.length - 1));
      this.single = single;
      const file = !single && ((_a = this.licensed) == null ? void 0 : _a[`${meta.bookId}/${meta.chapter}`]);
      if (file) return this.playFile(file);
      if (!this.supported) {
        this.emit("error", "A leitura em voz alta n\xE3o \xE9 suportada neste navegador.");
        return;
      }
      this.speakCurrent();
    }
    pauseSpeech() {
      if (this.status !== "playing") return;
      if (this.element) this.element.pause();
      else {
        this.token++;
        speechSynthesis.cancel();
      }
      this.status = "paused";
      this.emit();
    }
    resumeSpeech() {
      if (this.status !== "paused") return;
      if (this.element) {
        this.element.play();
        this.status = "playing";
        this.emit();
      } else this.speakCurrent();
    }
    stopSpeech() {
      this.stopEngines();
      this.status = "stopped";
      this.emit();
    }
    toggle() {
      if (this.status === "playing") this.pauseSpeech();
      else if (this.status === "paused") this.resumeSpeech();
      else if (this.verses.length) {
        this.element ? this.element.play() : this.speakCurrent();
      }
    }
    next() {
      if (this.element) {
        this.element.currentTime += 15;
        return;
      }
      if (this.index < this.verses.length - 1) this.seek(this.index + 1);
    }
    previous() {
      if (this.element) {
        this.element.currentTime -= 15;
        return;
      }
      if (this.index > 0) this.seek(this.index - 1);
    }
    seek(index) {
      if (this.element) return;
      this.index = Math.max(0, Math.min(index, this.verses.length - 1));
      this.speakCurrent();
    }
    seekPercent(percent) {
      if (this.element) {
        if (this.element.duration) this.element.currentTime = this.element.duration * percent / 100;
        return;
      }
      const target = this.duration() * percent / 100;
      let acc = 0;
      for (let i = 0; i < this.verses.length; i++) {
        acc += this.verseDuration(i);
        if (acc >= target) return this.seek(i);
      }
    }
    setRate(rate) {
      this.rate = Number(rate) || 1;
      if (this.element) this.element.playbackRate = this.rate;
      else this.restartIfPlaying();
    }
    setVolume(volume) {
      this.volume = Number(volume);
      if (this.element) this.element.volume = this.volume;
      else this.restartIfPlaying();
    }
    // ---------- Interno ----------
    restartIfPlaying() {
      if (this.status === "playing" && !this.element) this.speakCurrent();
    }
    stopEngines() {
      this.token++;
      if (this.supported) speechSynthesis.cancel();
      if (this.element) {
        this.element.pause();
        this.element.src = "";
        this.element = null;
      }
    }
    speakCurrent() {
      var _a, _b;
      const token = ++this.token;
      if (this.supported) speechSynthesis.cancel();
      const verse = this.verses[this.index];
      if (!verse) return;
      const text = verse.text || "";
      const u = new SpeechSynthesisUtterance(text);
      u.lang = ((_a = this.voice) == null ? void 0 : _a.lang) || "pt-BR";
      if (this.voice) u.voice = this.voice;
      u.rate = this.rate * (this.rateFactor || 1);
      u.volume = this.volume;
      u.pitch = this.pitch;
      u.onstart = () => {
        if (token !== this.token) return;
        this.verseStarted = Date.now();
        this.status = "playing";
        this.emit();
      };
      u.onend = () => {
        var _a2, _b2;
        if (token !== this.token) return;
        if (!this.single && this.index < this.verses.length - 1) {
          this.index++;
          (_a2 = this.onVerse) == null ? void 0 : _a2.call(this, this.index);
          if (this.gap) setTimeout(() => {
            if (token === this.token) this.speakCurrent();
          }, this.gap);
          else this.speakCurrent();
        } else {
          this.status = "stopped";
          this.emit();
          if (!this.single) (_b2 = this.onChapterEnd) == null ? void 0 : _b2.call(this, this.meta);
        }
      };
      u.onerror = (e) => {
        if (token !== this.token || e.error === "interrupted" || e.error === "canceled") return;
        this.status = "stopped";
        this.emit("error", "N\xE3o foi poss\xEDvel reproduzir a voz neste dispositivo.");
      };
      this.status = "playing";
      this.verseStarted = Date.now();
      (_b = this.onVerse) == null ? void 0 : _b.call(this, this.index);
      this.emit();
      setTimeout(() => {
        if (token === this.token) speechSynthesis.speak(u);
      }, 60);
    }
    playFile(src) {
      const el = new Audio(src);
      el.playbackRate = this.rate;
      el.volume = this.volume;
      el.onplay = () => {
        this.status = "playing";
        this.emit();
      };
      el.onpause = () => {
        if (this.status === "playing") {
          this.status = "paused";
          this.emit();
        }
      };
      el.onended = () => {
        var _a;
        this.status = "stopped";
        this.emit();
        (_a = this.onChapterEnd) == null ? void 0 : _a.call(this, this.meta);
      };
      el.ontimeupdate = () => this.emit();
      el.onerror = () => this.emit("error", "Arquivo de narra\xE7\xE3o n\xE3o encontrado.");
      this.element = el;
      this.status = "playing";
      el.play().catch(() => {
      });
      this.emit();
    }
    verseDuration(i) {
      var _a, _b;
      return Math.max(1.5, (((_b = (_a = this.verses[i]) == null ? void 0 : _a.text) == null ? void 0 : _b.length) || 0) / (CHARS_PER_SECOND * this.rate));
    }
    duration() {
      return this.element ? this.element.duration || 0 : this.verses.reduce((s, _, i) => s + this.verseDuration(i), 0);
    }
    elapsed() {
      if (this.element) return this.element.currentTime || 0;
      let acc = 0;
      for (let i = 0; i < this.index; i++) acc += this.verseDuration(i);
      if (this.status === "playing" && this.verseStarted) acc += Math.min((Date.now() - this.verseStarted) / 1e3, this.verseDuration(this.index));
      return acc;
    }
    tick() {
      var _a;
      if (this.status !== "playing") return;
      (_a = this.onListen) == null ? void 0 : _a.call(this, 1);
      this.emit();
    }
    emit(type, message) {
      var _a;
      (_a = this.onState) == null ? void 0 : _a.call(this, {
        type,
        message,
        status: this.status,
        index: this.index,
        total: this.verses.length,
        meta: this.meta,
        licensed: !!this.element,
        elapsed: this.elapsed(),
        duration: this.duration()
      });
    }
  };

  // app/js/src/pwa.js
  var PWAManager = class {
    constructor() {
      var _a;
      this.deferred = null;
      this.installed = ((_a = window.matchMedia) == null ? void 0 : _a.call(window, "(display-mode: standalone)").matches) || navigator.standalone === true;
      window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        this.deferred = event;
        document.querySelectorAll("[data-install-hint]").forEach((el) => el.hidden = false);
      });
      window.addEventListener("appinstalled", () => {
        this.installed = true;
        this.deferred = null;
      });
    }
    get isIOS() {
      return /iphone|ipad|ipod/i.test(navigator.userAgent);
    }
    async install() {
      if (!this.deferred) return false;
      this.deferred.prompt();
      const choice = await this.deferred.userChoice;
      this.deferred = null;
      return (choice == null ? void 0 : choice.outcome) === "accepted";
    }
    register(onUpdate) {
      if (!("serviceWorker" in navigator)) return;
      navigator.serviceWorker.register("service-worker.js").then((reg) => {
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          worker == null ? void 0 : worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) onUpdate == null ? void 0 : onUpdate();
          });
        });
      }).catch(() => {
      });
    }
    // Baixa todos os livros para o cache, para leitura e busca 100% offline.
    async downloadAll(provider2, onProgress) {
      await provider2.loadAll(onProgress);
      if ("caches" in window && location.protocol.startsWith("http")) {
        const cache = await caches.open("biblia-viva-books-v2");
        const missing = [];
        for (const b of provider2.books) if (!await cache.match(`data/books/${b.id}.js`)) missing.push(`data/books/${b.id}.js`);
        if (missing.length) await cache.addAll(missing);
      }
    }
  };

  // app/js/src/sync.js
  var firebaseConfig = window.BV_FIREBASE_CONFIG || {};
  var SDK = "https://www.gstatic.com/firebasejs/10.12.2";
  var clean = (obj) => JSON.parse(JSON.stringify(obj));
  function mergeData(a = {}, b = {}) {
    var _a, _b;
    const lixeira = { ...a.lixeira || {} };
    for (const [k, v] of Object.entries(b.lixeira || {})) lixeira[k] = Math.max(lixeira[k] || 0, v);
    const cutoff = Date.now() - 180 * 864e5;
    for (const [k, v] of Object.entries(lixeira)) if (v < cutoff) delete lixeira[k];
    const byKey = (listA = [], listB = [], stamp, prefix) => {
      const map = /* @__PURE__ */ new Map();
      for (const item of [...listA, ...listB]) {
        const current = map.get(item.key);
        if (!current || (item[stamp] || 0) > (current[stamp] || 0)) map.set(item.key, item);
      }
      return [...map.values()].filter((i) => !((lixeira[`${prefix}:${i.key}`] || 0) >= (i[stamp] || 0))).sort((x, y) => (y[stamp] || 0) - (x[stamp] || 0));
    };
    const progresso = { ...b.progresso || {}, ...a.progresso || {} };
    const configuracoes = (((_a = a.configuracoes) == null ? void 0 : _a.updatedAt) || 0) >= (((_b = b.configuracoes) == null ? void 0 : _b.updatedAt) || 0) ? a.configuracoes || {} : b.configuracoes || {};
    const historico = [...a.historico || [], ...b.historico || []].sort((x, y) => y.at - x.at).filter((x, i, arr) => arr.findIndex((y) => y.bookId === x.bookId && y.chapter === x.chapter) === i).slice(0, 20);
    const pa = a.planoLeitura || {}, pb = b.planoLeitura || {};
    const newer = (pa.activeAt || 0) >= (pb.activeAt || 0) ? pa : pb;
    const done = {};
    for (const src of [pa.done || {}, pb.done || {}]) for (const [id, days] of Object.entries(src)) done[id] = [.../* @__PURE__ */ new Set([...done[id] || [], ...days])];
    const planoLeitura = { ...newer.active ? { active: newer.active, activeAt: newer.activeAt || 0 } : {}, done };
    const diasLeitura = [.../* @__PURE__ */ new Set([...a.diasLeitura || [], ...b.diasLeitura || []])].sort();
    return {
      favoritos: byKey(a.favoritos, b.favoritos, "at", "fav"),
      anotacoes: byKey(a.anotacoes, b.anotacoes, "updatedAt", "note"),
      progresso,
      configuracoes,
      historico,
      planoLeitura,
      diasLeitura,
      tempoOuvindo: Math.max(a.tempoOuvindo || 0, b.tempoOuvindo || 0),
      lixeira
    };
  }
  var SyncManager = class {
    constructor(store2, { onStatus, onRemoteChange } = {}) {
      this.store = store2;
      this.onStatus = onStatus;
      this.onRemoteChange = onRemoteChange;
      this.user = null;
      this.timer = null;
      this.applyingRemote = false;
    }
    get configured() {
      return !!(firebaseConfig == null ? void 0 : firebaseConfig.apiKey) && !!(firebaseConfig == null ? void 0 : firebaseConfig.projectId);
    }
    status(state2, extra = {}) {
      var _a;
      this.state = state2;
      (_a = this.onStatus) == null ? void 0 : _a.call(this, { state: state2, user: this.user, ...extra });
    }
    async init() {
      if (!this.configured) return this.status("off");
      if (!location.protocol.startsWith("http")) return this.status("file");
      try {
        const [{ initializeApp }, authMod, fs] = await Promise.all([
          import(`${SDK}/firebase-app.js`),
          import(`${SDK}/firebase-auth.js`),
          import(`${SDK}/firebase-firestore.js`)
        ]);
        this.authMod = authMod;
        this.fs = fs;
        const app = initializeApp(firebaseConfig);
        this.auth = authMod.getAuth(app);
        this.auth.languageCode = "pt";
        this.db = fs.getFirestore(app);
        authMod.getRedirectResult(this.auth).catch(() => {
        });
        authMod.onAuthStateChanged(this.auth, (user) => this.handleUser(user));
        this.store.onChange(() => this.schedulePush());
        window.addEventListener("online", () => this.user && this.push());
      } catch (err) {
        console.warn("[sync] Firebase indispon\xEDvel", err);
        this.status("unavailable");
      }
    }
    async signIn() {
      if (!this.auth) return;
      const provider2 = new this.authMod.GoogleAuthProvider();
      try {
        await this.authMod.signInWithPopup(this.auth, provider2);
      } catch (err) {
        if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"].includes(err.code)) return this.authMod.signInWithRedirect(this.auth, provider2);
        if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") throw err;
      }
    }
    async signOut() {
      var _a, _b;
      (_a = this.unsubscribe) == null ? void 0 : _a.call(this);
      this.unsubscribe = null;
      await ((_b = this.authMod) == null ? void 0 : _b.signOut(this.auth));
    }
    async handleUser(user) {
      var _a;
      this.user = user;
      (_a = this.unsubscribe) == null ? void 0 : _a.call(this);
      this.unsubscribe = null;
      if (!user) return this.status("signed-out");
      this.status("syncing");
      const { doc, getDoc, setDoc, onSnapshot, serverTimestamp } = this.fs;
      this.ref = doc(this.db, "users", user.uid);
      try {
        const snap = await getDoc(this.ref);
        const merged = mergeData(this.store.data, snap.exists() ? snap.data().data : {});
        this.applyRemote(merged);
        await setDoc(this.ref, { data: clean(merged), updatedAt: serverTimestamp() });
        this.unsubscribe = onSnapshot(this.ref, (s) => {
          if (s.metadata.hasPendingWrites || !s.exists()) return;
          const merged2 = mergeData(this.store.data, s.data().data);
          if (JSON.stringify(merged2) !== JSON.stringify(mergeData(this.store.data, {}))) this.applyRemote(merged2);
        });
        this.status("synced", { at: Date.now() });
      } catch (err) {
        console.warn("[sync]", err);
        this.status("error", { message: err.code === "permission-denied" ? "Permiss\xE3o negada no Firestore (verifique as regras)." : "Sem conex\xE3o com a nuvem. Seus dados continuam salvos no aparelho." });
      }
    }
    applyRemote(data) {
      var _a;
      this.applyingRemote = true;
      this.store.replace(data);
      this.applyingRemote = false;
      (_a = this.onRemoteChange) == null ? void 0 : _a.call(this);
    }
    schedulePush() {
      if (!this.user || this.applyingRemote) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.push(), 1500);
    }
    async push() {
      if (!this.user || !this.ref) return;
      const { setDoc, serverTimestamp } = this.fs;
      try {
        this.status("syncing");
        await setDoc(this.ref, { data: clean(this.store.data), updatedAt: serverTimestamp() });
        this.status("synced", { at: Date.now() });
      } catch (err) {
        this.status("error", { message: "N\xE3o foi poss\xEDvel sincronizar agora. Tentaremos de novo." });
      }
    }
  };

  // app/js/src/music.js
  var NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
  var CHORDS = [
    [48, 55, 60, 64],
    // C
    [45, 52, 57, 60],
    // Am
    [41, 48, 57, 60],
    // F
    [43, 50, 55, 59],
    // G
    [48, 55, 60, 67],
    // C (aberto)
    [45, 52, 60, 64],
    // Am7
    [41, 48, 53, 57],
    // F
    [43, 50, 53, 59]
    // G7
  ];
  var BELLS = [72, 74, 76, 79, 81, 84];
  var CHORD_SECONDS = 9;
  var CINE = [
    [38, 50, 57, 62, 65],
    [34, 46, 53, 58, 62],
    [41, 48, 57, 60, 65],
    [36, 48, 55, 60, 64],
    [38, 50, 57, 62, 69],
    [43, 50, 55, 62, 67],
    [34, 46, 53, 62, 65],
    [33, 45, 52, 61, 64]
  ];
  var CINE_SECONDS = 10;
  var AmbientMusic = class {
    constructor() {
      this.ctx = null;
      this.playing = false;
      this.volume = 0.35;
      this.ducked = false;
      this.step = 0;
      this.style = "cinematico";
    }
    setStyle(style) {
      if (style === this.style) return;
      const was = this.playing;
      if (was) this.stopNow();
      this.style = style;
      if (was) this.start();
    }
    get supported() {
      return !!(window.AudioContext || window.webkitAudioContext);
    }
    setup() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(ctx.destination);
      const len = ctx.sampleRate * 4.5, impulse = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = impulse.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = impulse;
      const wet = ctx.createGain();
      wet.gain.value = 0.55;
      const dry = ctx.createGain();
      dry.gain.value = 0.45;
      this.bus = ctx.createBiquadFilter();
      this.bus.type = "lowpass";
      this.bus.frequency.value = 1400;
      this.bus.Q.value = 0.3;
      this.bus.connect(dry).connect(this.master);
      this.bus.connect(this.reverb).connect(wet).connect(this.master);
    }
    level() {
      return this.volume * (this.ducked ? 0.55 : 1) * 1.5;
    }
    ramp(value, seconds = 1.5) {
      if (!this.ctx) return;
      const g = this.master.gain, t = this.ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(value, t + seconds);
    }
    start() {
      var _a, _b;
      if (!this.supported) return false;
      this.setup();
      (_b = (_a = this.ctx).resume) == null ? void 0 : _b.call(_a);
      if (this.playing) return true;
      this.playing = true;
      this.nextChordAt = this.ctx.currentTime + 0.1;
      this.nextBellAt = this.ctx.currentTime + 4;
      this.ramp(this.level(), 3);
      if (this.style === "cinematico") this.startDrone();
      this.timer = setInterval(() => this.schedule(), 400);
      this.schedule();
      return true;
    }
    stopNow() {
      this.playing = false;
      clearInterval(this.timer);
      this.stopDrone(0.3);
      if (this.master) this.master.gain.value = 0;
    }
    stop() {
      if (!this.playing) return;
      this.playing = false;
      this.ramp(0, 2);
      clearInterval(this.timer);
      this.stopDrone(2.5);
      setTimeout(() => {
        var _a, _b;
        if (!this.playing) (_b = (_a = this.ctx) == null ? void 0 : _a.suspend) == null ? void 0 : _b.call(_a);
      }, 2500);
    }
    toggle() {
      return this.playing ? (this.stop(), false) : this.start();
    }
    setVolume(v) {
      this.volume = Math.max(0, Math.min(1, Number(v)));
      if (this.playing) this.ramp(this.level(), 0.4);
    }
    duck(on) {
      if (this.ducked === on) return;
      this.ducked = on;
      if (this.playing) this.ramp(this.level(), 1.2);
    }
    schedule() {
      const now = this.ctx.currentTime;
      if (this.style === "cinematico") {
        while (this.nextChordAt < now + 2) {
          const chord = CINE[this.step % CINE.length];
          this.strings(chord, this.nextChordAt, CINE_SECONDS + 5);
          if (this.step % 2 === 1) this.choir(chord.slice(2), this.nextChordAt + 1.5, CINE_SECONDS + 2);
          this.step++;
          this.nextChordAt += CINE_SECONDS;
        }
        return;
      }
      while (this.nextChordAt < now + 2) {
        this.chord(CHORDS[this.step % CHORDS.length], this.nextChordAt);
        this.step++;
        this.nextChordAt += CHORD_SECONDS;
      }
      while (this.nextBellAt < now + 2) {
        const notes2 = CHORDS[(this.step + CHORDS.length - 1) % CHORDS.length].map((n) => n + 24).filter((n) => BELLS.includes(n) || n % 12 === 0 || n % 12 === 7);
        const pick = notes2.length && Math.random() < 0.6 ? notes2[Math.floor(Math.random() * notes2.length)] : BELLS[Math.floor(Math.random() * BELLS.length)];
        this.bell(pick, this.nextBellAt);
        this.nextBellAt += 3 + Math.random() * 5;
      }
    }
    chord(notes2, t) {
      const dur = CHORD_SECONDS + 4;
      notes2.forEach((n, i) => {
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.11 / (1 + i * 0.25), t + 3.5);
        g.gain.setValueAtTime(0.11 / (1 + i * 0.25), t + dur - 4.5);
        g.gain.linearRampToValueAtTime(0, t + dur);
        g.connect(this.bus);
        [[-4, "sine"], [4, "sine"], [0, "triangle"]].forEach(([detune, type]) => {
          const o = this.ctx.createOscillator();
          o.type = type;
          o.frequency.value = NOTE(n);
          o.detune.value = detune;
          const og = this.ctx.createGain();
          og.gain.value = type === "triangle" ? 0.35 : 0.5;
          o.connect(og).connect(g);
          o.start(t);
          o.stop(t + dur + 0.1);
        });
      });
    }
    bell(n, t) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = "sine";
      o.frequency.value = NOTE(n);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.045, t + 0.02);
      g.gain.exponentialRampToValueAtTime(1e-4, t + 4);
      o.connect(g).connect(this.bus);
      o.start(t);
      o.stop(t + 4.1);
    }
    // Cordas: serras desafinadas filtradas, ataque lento e "respiração" no filtro
    strings(notes2, t, dur) {
      const ctx = this.ctx;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.Q.value = 0.7;
      f.frequency.setValueAtTime(500, t);
      f.frequency.linearRampToValueAtTime(1300, t + dur * 0.5);
      f.frequency.linearRampToValueAtTime(600, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 4.5);
      g.gain.setValueAtTime(0.05, t + dur - 5);
      g.gain.linearRampToValueAtTime(0, t + dur);
      f.connect(g).connect(this.bus);
      notes2.forEach((n, i) => [-9, 0, 8].forEach((det) => {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = NOTE(n);
        o.detune.value = det + (Math.random() * 4 - 2);
        const og = ctx.createGain();
        og.gain.value = i === 0 ? 0.55 : 0.32;
        o.connect(og).connect(f);
        o.start(t);
        o.stop(t + dur + 0.1);
      }));
    }
    // Coral "ah": serra passando por filtros de formantes (vogal A)
    choir(notes2, t, dur) {
      const ctx = this.ctx;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.03, t + 3.5);
      g.gain.setValueAtTime(0.03, t + dur - 4);
      g.gain.linearRampToValueAtTime(0, t + dur);
      g.connect(this.bus);
      [[730, 6, 1], [1090, 8, 0.5], [2440, 10, 0.2]].forEach(([freq, q, amp]) => {
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = freq;
        bp.Q.value = q;
        const a = ctx.createGain();
        a.gain.value = amp * 2.2;
        bp.connect(a).connect(g);
        notes2.forEach((n) => {
          const o = ctx.createOscillator();
          o.type = "sawtooth";
          o.frequency.value = NOTE(n + 12);
          const vib = ctx.createOscillator(), vg = ctx.createGain();
          vib.frequency.value = 5 + Math.random();
          vg.gain.value = 6;
          vib.connect(vg).connect(o.detune);
          o.connect(bp);
          o.start(t);
          vib.start(t);
          o.stop(t + dur + 0.1);
          vib.stop(t + dur + 0.1);
        });
      });
    }
    // Nota pedal grave (Ré) contínua, típica de trilhas épicas
    startDrone() {
      const ctx = this.ctx, t = ctx.currentTime;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.09, t + 6);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 220;
      g.connect(lp).connect(this.bus);
      this.drone = { g, oscs: [26, 38].map((n, i) => {
        const o = ctx.createOscillator();
        o.type = i ? "triangle" : "sine";
        o.frequency.value = NOTE(n);
        o.connect(g);
        o.start(t);
        return o;
      }) };
    }
    stopDrone(fade) {
      if (!this.drone || !this.ctx) return;
      const { g, oscs } = this.drone, t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + fade);
      oscs.forEach((o) => o.stop(t + fade + 0.1));
      this.drone = null;
    }
  };

  // app/js/src/app.js
  var store = new Store();
  var provider = new BibleDataProvider();
  var favorites = new FavoritesManager(store);
  var notes = new NotesManager(store);
  var progress = new ProgressManager(store);
  var plans = new PlanManager(store, provider);
  var search = new SearchManager(provider);
  var pwa = new PWAManager();
  var music = new AmbientMusic();
  var audio;
  var sync;
  var FONT_SIZES = ["16px", "18px", "21px", "24px"];
  var DEFAULTS = { theme: "light", fontIndex: 1, audioSpeed: "1", wholeChapter: true, autoScroll: true, autoContinue: false, autoPlay: false, voice: "", voiceStyle: "cinematico", music: true, musicVolume: 0.4, musicStyle: "cinematico" };
  var TITLES = { home: "Vamos aprender a Palavra de Deus hoje?", bible: "B\xEDblia", reader: "Leitura", search: "Buscar", favorites: "Meus favoritos", notes: "Minhas anota\xE7\xF5es", plans: "Planos de leitura", progress: "Meu progresso", more: "Mais", settings: "Configura\xE7\xF5es", about: "Sobre o aplicativo", jesus: "A hist\xF3ria de Jesus" };
  var state = { view: "home", bookId: "joao", chapter: 1, verse: 1, chapterData: null, testament: "Novo Testamento", pickerBook: null, syncInfo: { state: "off" } };
  var $ = (s) => document.querySelector(s);
  var $$ = (s) => [...document.querySelectorAll(s)];
  var esc = (v) => String(v != null ? v : "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]);
  var setting = (name) => {
    var _a;
    return (_a = store.settings()[name]) != null ? _a : DEFAULTS[name];
  };
  var ref = (item) => `${item.book} ${item.chapter}:${item.verse}`;
  var fmtTime = (s) => {
    s = Math.max(0, Math.round(s || 0));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };
  var fmtDuration = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    return h ? `${h}h ${m}min` : `${m} min`;
  };
  var pad2 = (n) => String(n).padStart(2, "0");
  var normalize2 = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  var toastTimer;
  function toast(message) {
    const node = $("#toast");
    node.textContent = message;
    node.classList.add("show-toast");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("show-toast"), 2800);
  }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = Object.assign(document.createElement("textarea"), { value: text });
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    }
  }
  var copyVerse = async (item) => toast(await copyText(`\u201C${item.text}\u201D \u2014 ${ref(item)} (BLIVRE)`) ? "\u{1F4CB} Vers\xEDculo copiado." : "N\xE3o foi poss\xEDvel copiar.");
  function modal(html, { onClose } = {}) {
    const root = $("#modal-root");
    const previous = document.activeElement;
    root.innerHTML = `<div class="modal-backdrop" data-modal-backdrop><section class="modal" role="dialog" aria-modal="true">${html}</section></div>`;
    const close = () => {
      var _a;
      root.innerHTML = "";
      onClose == null ? void 0 : onClose();
      (_a = previous == null ? void 0 : previous.focus) == null ? void 0 : _a.call(previous);
      document.removeEventListener("keydown", onKey);
    };
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    root.querySelector("[data-modal-backdrop]").addEventListener("click", (e) => {
      if (e.target.matches("[data-modal-backdrop]")) close();
    });
    root.querySelectorAll("[data-modal-close]").forEach((b) => b.addEventListener("click", close));
    (root.querySelector("textarea, [autofocus], button") || root).focus();
    return { root, close };
  }
  function applyTheme() {
    const pref = setting("theme");
    const dark = pref === "dark" || pref === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.querySelector("meta[name=theme-color]").content = dark ? "#15201b" : "#20533d";
  }
  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    store.setSetting("theme", next);
    applyTheme();
    syncSettingsForm();
    toast(next === "dark" ? "\u{1F319} Tema escuro" : "\u2600\uFE0F Tema claro");
  }
  function applyFont() {
    document.documentElement.style.setProperty("--font-size", FONT_SIZES[setting("fontIndex")] || FONT_SIZES[1]);
  }
  function changeFont(delta) {
    const index = delta === "reset" ? 1 : Math.max(0, Math.min(3, Number(setting("fontIndex")) + delta));
    store.setSetting("fontIndex", index);
    applyFont();
    syncSettingsForm();
    toast(["Texto pequeno", "Texto m\xE9dio", "Texto grande", "Texto extra grande"][index]);
  }
  function go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }
  function route() {
    const parts = decodeURIComponent(location.hash.replace(/^#\/?/, "")).split("/").filter(Boolean);
    const [view = "home", a, b, c] = parts;
    if (view === "ler" && provider.getBook(a)) return showReader(a, Number(b) || 1, Number(c) || 1);
    showView(TITLES[view] && view !== "reader" ? view : "home");
  }
  function showView(view) {
    var _a;
    state.view = view;
    const renderers = { home: renderHome, bible: renderBible, plans: renderPlans, progress: renderProgress, favorites: renderFavorites, notes: renderNotes, more: renderAccount, settings: syncSettingsForm, about: renderAbout, jesus: renderJesus };
    (_a = renderers[view]) == null ? void 0 : _a.call(renderers);
    $$(".view").forEach((n) => n.classList.toggle("active", n.id === `${view}-view`));
    const navView = ["plans", "progress", "notes", "settings", "about", "jesus"].includes(view) ? "more" : view === "reader" ? "bible" : view;
    $$(".nav-link, .mobile-nav button").forEach((b) => {
      const on = b.dataset.view === navView;
      b.classList.toggle("active", on);
      b.setAttribute("aria-current", on ? "page" : "false");
    });
    $("#page-title").textContent = TITLES[view] || "";
    $("#greeting").textContent = view === "home" ? greeting() : "B\xCDBLIA VIVA";
    if (view !== "reader") window.scrollTo({ top: 0 });
    $("#main-content").focus({ preventScroll: true });
  }
  function greeting() {
    const h = (/* @__PURE__ */ new Date()).getHours();
    return h < 12 ? "BOM DIA!" : h < 18 ? "BOA TARDE!" : "BOA NOITE!";
  }
  async function renderHome() {
    renderStats();
    renderContinue();
    renderTodayPlan();
    try {
      const item = await provider.getVerseOfTheDay();
      state.daily = item;
      $("#daily-verse-text").textContent = `\u201C${item.text}\u201D`;
      $("#daily-verse-ref").textContent = ref(item);
      $("#favorite-daily").textContent = favorites.isFavorite(item) ? "\u2764\uFE0F Favoritado" : "\u2661 Favoritar";
    } catch {
      $("#daily-verse-text").textContent = "N\xE3o foi poss\xEDvel carregar o vers\xEDculo do dia.";
    }
  }
  function renderStats() {
    const s = progress.stats(provider);
    const cards = [["\u{1F525}", s.streak, s.streak === 1 ? "dia consecutivo" : "dias consecutivos"], ["\u{1F4D6}", s.read, "cap\xEDtulos lidos"], ["\u2764\uFE0F", favorites.getAll().length, "vers\xEDculos favoritos"], ["\u{1F4DD}", notes.all().length, "anota\xE7\xF5es"], ["\u{1F4CA}", `${s.percent}%`, "da B\xEDblia conclu\xEDda"]];
    $("#journey-stats").innerHTML = cards.map(([i, v, l]) => `<article class="stat-card"><span class="stat-icon" aria-hidden="true">${i}</span><strong>${v}</strong><small>${l}</small></article>`).join("");
  }
  function renderContinue() {
    const last = progress.last();
    const book = last && provider.getBook(last.bookId);
    if (!book) {
      $("#continue-testament").textContent = "Novo Testamento";
      $("#continue-chapter").textContent = "Jo\xE3o 1";
      $("#continue-progress").style.width = "0%";
      $("#continue-percent").textContent = "Comece sua jornada pelo Evangelho de Jo\xE3o";
      return;
    }
    const count = book.verses[last.chapter - 1] || 1;
    const percent = Math.min(100, Math.round(last.verse / count * 100));
    $("#continue-testament").textContent = book.testament;
    $("#continue-chapter").textContent = `${book.name} ${last.chapter}:${last.verse}`;
    $("#continue-progress").style.width = `${percent}%`;
    $("#continue-bar").setAttribute("aria-valuenow", percent);
    $("#continue-percent").textContent = progress.isRead(book.id, last.chapter) ? "\u2713 Cap\xEDtulo conclu\xEDdo" : `${percent}% do cap\xEDtulo`;
  }
  function renderTodayPlan() {
    const t = plans.today(progress);
    const days = t.day;
    $("#today-plan").innerHTML = t.finished ? `<div><p class="eyebrow">${esc(t.def.name)}</p><h3>\u2705 Plano conclu\xEDdo!</h3><p class="muted">Parab\xE9ns pela const\xE2ncia. Escolha um novo plano para continuar.</p></div><button class="btn primary" data-view="plans">Escolher plano \u2192</button>` : `<div><p class="eyebrow">DIA ${pad2(t.index + 1)} DE ${t.total} \xB7 ${esc(t.def.name)}</p><h3>\u{1F4D6} ${esc(t.label)}</h3>
        <div class="plan-day-chapters">${days.map((c) => `<button class="chip ${progress.isRead(c.bookId, c.chapter) ? "done" : ""}" data-open="${c.bookId}/${c.chapter}">${progress.isRead(c.bookId, c.chapter) ? "\u2713 " : ""}${esc(c.book)} ${c.chapter}</button>`).join("")}</div></div>
       <div class="plan-actions"><button class="btn primary" data-action="today-read">Come\xE7ar leitura \u2192</button><button class="btn secondary" data-action="today-done">\u2705 Marcar como conclu\xEDdo</button></div>`;
  }
  function renderBible() {
    $$("#testament-tabs button").forEach((b) => {
      const on = b.dataset.testament === state.testament;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on);
    });
    $("#book-grid").innerHTML = provider.getBooks(state.testament).map((b) => {
      const pct = progress.bookPercent(provider, b.id);
      return `<button class="book-card" data-pick-book="${b.id}"><strong>${esc(b.name)}</strong><small>${b.chapters} ${b.chapters === 1 ? "cap\xEDtulo" : "cap\xEDtulos"}${pct ? ` \xB7 ${pct}%` : ""}</small>${pct ? `<span class="mini-track"><span style="width:${pct}%"></span></span>` : ""}</button>`;
    }).join("");
    if (state.pickerBook) openPicker(state.pickerBook, false);
  }
  function openPicker(bookId, scroll = true) {
    const book = provider.getBook(bookId);
    state.pickerBook = bookId;
    $("#chapter-picker").hidden = false;
    $("#chapter-picker-title").textContent = `${book.name} \u2014 escolha o cap\xEDtulo`;
    $("#chapter-grid").innerHTML = provider.getChapters(bookId).map((c) => `<button data-open="${bookId}/${c}" class="${progress.isRead(bookId, c) ? "done" : ""}" aria-label="${esc(book.name)} cap\xEDtulo ${c}${progress.isRead(bookId, c) ? ", lido" : ""}">${c}</button>`).join("");
    $$(".book-card").forEach((b) => b.classList.toggle("active", b.dataset.pickBook === bookId));
    if (scroll) $("#chapter-picker").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function openChapter(bookId, chapter, verse = 1) {
    go(`#ler/${bookId}/${chapter}/${verse}`);
  }
  async function showReader(bookId, chapter, verse = 1) {
    const book = provider.getBook(bookId);
    chapter = Math.max(1, Math.min(chapter, book.chapters));
    const sameChapter = state.chapterData && state.bookId === bookId && state.chapter === chapter;
    Object.assign(state, { bookId, chapter, verse });
    if (!sameChapter) {
      $("#reader-verses").innerHTML = '<p class="muted loading">Carregando cap\xEDtulo\u2026</p>';
      showView("reader");
      try {
        state.chapterData = await provider.getChapter(bookId, chapter);
      } catch {
        $("#reader-verses").innerHTML = '<p class="empty">N\xE3o foi poss\xEDvel carregar este cap\xEDtulo. Verifique sua conex\xE3o \u2014 cap\xEDtulos j\xE1 abertos funcionam offline.</p>';
        return;
      }
    } else showView("reader");
    state.testament = book.testament;
    state.pickerBook = bookId;
    progress.setLast(bookId, chapter, verse);
    renderReader();
    const target = $(`.verse[data-verse="${verse}"]`);
    if (target && verse > 1) target.scrollIntoView({ block: "center" });
    else window.scrollTo({ top: 0 });
    if (!sameChapter && setting("autoPlay") && !state.suppressAutoPlay) playChapter();
    state.suppressAutoPlay = false;
  }
  function renderReader() {
    var _a, _b;
    const data = state.chapterData;
    if (!data) return;
    const { book, chapter, verses, title } = data;
    $("#reader-testament").textContent = book.testament.toUpperCase();
    $("#reader-title").textContent = `${book.name} ${chapter}`;
    $("#reader-subtitle").hidden = !title;
    $("#reader-subtitle").textContent = title;
    const read = progress.isRead(book.id, chapter);
    const done = $("#complete-chapter");
    done.textContent = read ? "\u2713 Cap\xEDtulo conclu\xEDdo" : "\u2713 Marcar cap\xEDtulo como conclu\xEDdo";
    done.classList.toggle("is-done", read);
    $("#prev-chapter").disabled = !provider.previousChapter(book.id, chapter);
    $("#next-chapter").disabled = !provider.nextChapter(book.id, chapter);
    $("#reader-credit").textContent = "Texto: B\xEDblia Livre (BLIVRE), CC BY 3.0 BR.";
    const playing = (audio == null ? void 0 : audio.status) !== "stopped" && ((_a = audio == null ? void 0 : audio.meta) == null ? void 0 : _a.bookId) === book.id && ((_b = audio == null ? void 0 : audio.meta) == null ? void 0 : _b.chapter) === chapter;
    $("#reader-verses").innerHTML = verses.map((v) => {
      var _a2;
      const fav = favorites.isFavorite(v), note = notes.get(v);
      const speaking = playing && ((_a2 = audio.verses[audio.index]) == null ? void 0 : _a2.verse) === v.verse;
      return `<article class="verse ${v.verse === state.verse ? "selected" : ""} ${speaking ? "speaking" : ""}" data-verse="${v.verse}" tabindex="0" aria-label="Vers\xEDculo ${v.verse}">
      <span class="verse-number">${v.verse}</span><span class="verse-text">${v.text ? esc(v.text) : '<em class="muted">(este vers\xEDculo n\xE3o consta no texto-base desta tradu\xE7\xE3o)</em>'}</span>${fav ? '<span class="verse-badge" title="Favorito">\u2764\uFE0F</span>' : ""}${note ? '<span class="verse-badge" title="Tem anota\xE7\xE3o">\u{1F4DD}</span>' : ""}
      <div class="verse-actions" role="group" aria-label="A\xE7\xF5es do vers\xEDculo ${v.verse}">
        <button data-verse-action="listen" aria-label="Ouvir vers\xEDculo ${v.verse}">\u{1F50A}</button>
        <button class="${fav ? "is-favorite" : ""}" data-verse-action="favorite" aria-label="${fav ? "Remover dos favoritos" : "Favoritar"} vers\xEDculo ${v.verse}" aria-pressed="${fav}">${fav ? "\u2764\uFE0F" : "\u2661"}</button>
        <button data-verse-action="note" aria-label="Anotar vers\xEDculo ${v.verse}">\u{1F4DD}</button>
        <button data-verse-action="copy" aria-label="Copiar vers\xEDculo ${v.verse}">\u{1F4CB}</button>
      </div></article>`;
    }).join("");
  }
  function selectVerse(n, { scroll = false } = {}) {
    var _a;
    state.verse = n;
    $$(".verse").forEach((v) => v.classList.toggle("selected", Number(v.dataset.verse) === n));
    progress.setLast(state.bookId, state.chapter, n);
    history.replaceState(null, "", `#ler/${state.bookId}/${state.chapter}/${n}`);
    if (scroll) (_a = $(`.verse[data-verse="${n}"]`)) == null ? void 0 : _a.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function completeChapter() {
    if (progress.isRead(state.bookId, state.chapter)) {
      toast("Este cap\xEDtulo j\xE1 est\xE1 conclu\xEDdo.");
      return;
    }
    progress.markChapter(state.bookId, state.chapter);
    renderReader();
    celebrate();
  }
  function celebrate() {
    const node = document.createElement("div");
    node.className = "celebrate";
    node.setAttribute("role", "status");
    node.innerHTML = '<span aria-hidden="true">\u2705</span><strong>Cap\xEDtulo conclu\xEDdo!</strong><small>Continue sua jornada amanh\xE3.</small>';
    document.body.append(node);
    setTimeout(() => node.classList.add("out"), 2200);
    setTimeout(() => node.remove(), 2700);
  }
  function setupAudio() {
    audio = new AudioManager({
      onState: renderPlayer,
      onVerse: (index) => {
        const v = audio.verses[index];
        if (!(v == null ? void 0 : v.verse) || audio.meta.bookId !== state.bookId || audio.meta.chapter !== state.chapter || state.view !== "reader") return;
        $$(".verse").forEach((n) => n.classList.toggle("speaking", Number(n.dataset.verse) === v.verse));
        if (setting("autoScroll")) selectVerse(v.verse, { scroll: true });
      },
      onChapterEnd: (meta) => {
        if (!setting("autoContinue") || !meta.bookId) return;
        const next = provider.nextChapter(meta.bookId, meta.chapter);
        if (!next) return;
        state.suppressAutoPlay = true;
        openChapter(next.bookId, next.chapter);
        setTimeout(() => playChapter(1), 400);
      },
      onListen: (s) => progress.addListening(s)
    });
    audio.setRate(setting("audioSpeed"));
    applyVoiceStyle();
    audio.voiceName = setting("voice");
    audio.pickVoice();
    $("#audio-speed").value = String(setting("audioSpeed"));
  }
  var seeking = false;
  function renderPlayer(s) {
    var _a, _b, _c;
    if (s.type === "error") toast(s.message);
    const player = $("#audio-player");
    if (s.status !== "stopped" || s.total) player.hidden = false;
    $("#audio-title").textContent = ((_a = s.meta) == null ? void 0 : _a.title) || "Leitura";
    $("#audio-subtitle").textContent = s.licensed ? "Narra\xE7\xE3o licenciada" : s.total > 1 ? `Vers\xEDculo ${(_c = (_b = s.meta.verses) == null ? void 0 : _b[s.index]) != null ? _c : s.index + 1} de ${s.total}` : "Leitura em portugu\xEAs";
    const playing = s.status === "playing";
    $("#audio-play").textContent = playing ? "\u23F8" : "\u25B6";
    $("#audio-play").setAttribute("aria-label", playing ? "Pausar" : "Reproduzir");
    player.classList.toggle("is-playing", playing);
    syncMusic(playing);
    if (!seeking) $("#audio-progress").value = s.duration ? s.elapsed / s.duration * 100 : 0;
    $("#audio-current").textContent = fmtTime(s.elapsed);
    $("#audio-duration").textContent = fmtTime(s.duration);
    $$(".play-chapter span").forEach((n) => {
      var _a2, _b2;
      return n.textContent = playing && ((_a2 = s.meta) == null ? void 0 : _a2.bookId) === state.bookId && ((_b2 = s.meta) == null ? void 0 : _b2.chapter) === state.chapter ? "Ouvindo" : "Ouvir";
    });
    if (s.status === "stopped") $$(".verse.speaking").forEach((n) => n.classList.remove("speaking"));
  }
  function playChapter(fromVerse = state.verse) {
    const data = state.chapterData;
    if (!data) return;
    const verses = data.verses.filter((v) => v.text);
    const meta = { title: `${data.book.name} ${data.chapter}`, bookId: data.book.id, chapter: data.chapter, verses: verses.map((v) => v.verse) };
    if (!setting("wholeChapter")) {
      const v = verses.find((x) => x.verse === fromVerse) || verses[0];
      return audio.playChapter([v], { ...meta, title: ref(v), verses: [v.verse] });
    }
    const start = Math.max(0, verses.findIndex((v) => v.verse === fromVerse));
    audio.playChapter(verses, meta, start);
  }
  var musicPreview = false;
  function syncMusic(narrating) {
    const on = !!setting("music");
    $("#music-toggle").setAttribute("aria-pressed", on);
    $("#music-toggle").classList.toggle("off", !on);
    if (narrating && on) {
      music.setStyle(setting("musicStyle"));
      music.setVolume(setting("musicVolume"));
      music.start();
    } else if (!musicPreview) music.stop();
  }
  var VOICE_STYLES = { cinematico: { pitch: 0.72, gap: 700, rate: 1 }, solene: { pitch: 0.85, gap: 250, rate: 1 }, natural: { pitch: 1, gap: 0, rate: 1 } };
  function applyVoiceStyle() {
    const st = VOICE_STYLES[setting("voiceStyle")] || VOICE_STYLES.cinematico;
    audio.gap = st.gap;
    audio.rateFactor = st.rate;
    audio.setRate(setting("audioSpeed"));
    audio.setPitch(st.pitch);
  }
  var speak = (item) => audio.speakVerse(item.text, { title: ref(item) });
  function handleItem(type, item) {
    var _a, _b;
    if (!item) return;
    if (type === "listen") speak(item);
    if (type === "copy") copyVerse(item);
    if (type === "note") noteModal(item);
    if (type === "open") openChapter(item.bookId, item.chapter, item.verse);
    if (type === "favorite") {
      const added = favorites.toggle(item);
      toast(added ? "\u2764\uFE0F Adicionado aos favoritos." : "Removido dos favoritos.");
      (_b = (_a = document.activeElement) == null ? void 0 : _a.classList) == null ? void 0 : _b.add("pop");
      refreshAfterChange();
    }
  }
  function refreshAfterChange() {
    var _a, _b, _c;
    if (state.view === "reader") {
      const focusedAction = (_b = (_a = document.activeElement) == null ? void 0 : _a.dataset) == null ? void 0 : _b.verseAction;
      renderReader();
      if (focusedAction) (_c = $(`.verse[data-verse="${state.verse}"] [data-verse-action="${focusedAction}"]`)) == null ? void 0 : _c.focus({ preventScroll: true });
    }
    if (state.view === "favorites") renderFavorites();
    if (state.view === "notes") renderNotes();
    if (state.view === "home") renderHome();
    if (state.view === "search") $$('#search-results [data-item-action="favorite"]').forEach((b) => {
      const it = itemCache.get(b.dataset.item);
      if (it) {
        const f = favorites.isFavorite(it);
        b.textContent = f ? "\u2764\uFE0F" : "\u2661";
        b.setAttribute("aria-pressed", f);
      }
    });
    renderStats();
  }
  function noteModal(item) {
    var _a;
    const existing = notes.get(item);
    let timer;
    const { root, close } = modal(`<p class="eyebrow">${esc(ref(item))}</p><h2>\u{1F4DD} Minha anota\xE7\xE3o</h2>
    <blockquote class="modal-verse">\u201C${esc(item.text)}\u201D</blockquote>
    <label class="sr-only" for="note-input">Anota\xE7\xE3o</label>
    <textarea id="note-input" placeholder="Este vers\xEDculo me lembra\u2026">${esc((existing == null ? void 0 : existing.text) || "")}</textarea>
    <p class="muted save-state" id="note-state">${existing ? "Salvo automaticamente" : "Comece a escrever \u2014 salvamos automaticamente."}</p>
    <div class="modal-footer">${existing ? '<button class="btn secondary danger" data-delete-note>Excluir</button>' : ""}<button class="btn primary" data-modal-close>Concluir</button></div>`, { onClose: () => {
      clearTimeout(timer);
      saveNow();
      refreshAfterChange();
    } });
    const input = root.querySelector("#note-input");
    const saveNow = () => {
      const text = input.value.trim();
      if (text) notes.save(item, text);
      else if (notes.get(item)) notes.remove(verseKey(item));
    };
    input.addEventListener("input", () => {
      $("#note-state").textContent = "Salvando\u2026";
      clearTimeout(timer);
      timer = setTimeout(() => {
        saveNow();
        $("#note-state").textContent = "\u2713 Salvo automaticamente";
      }, 600);
    });
    (_a = root.querySelector("[data-delete-note]")) == null ? void 0 : _a.addEventListener("click", () => {
      input.value = "";
      close();
      toast("Anota\xE7\xE3o exclu\xEDda.");
    });
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
  var itemCache = /* @__PURE__ */ new Map();
  function itemCard(item, { highlight = "", showRemove = false } = {}) {
    const key = verseKey(item);
    itemCache.set(key, item);
    const fav = favorites.isFavorite(item);
    let text = esc(item.text);
    if (highlight) {
      const words = normalize2(highlight).trim().split(/\s+/).filter((w) => w.length > 1);
      if (words.length) text = markWords(item.text, words);
    }
    const note = notes.get(item);
    return `<article class="result-card"><p class="eyebrow">${esc(ref(item))}</p><blockquote>\u201C${text}\u201D</blockquote>
    ${note ? `<p class="note-preview">\u{1F4DD} ${esc(note.text)}</p>` : ""}
    <div class="result-footer"><button class="link-btn" data-item-action="open" data-item="${key}">Ler no contexto \u2192</button>
    <div class="tiny-actions">
      <button data-item-action="listen" data-item="${key}" aria-label="Ouvir ${esc(ref(item))}">\u{1F50A}</button>
      <button data-item-action="copy" data-item="${key}" aria-label="Copiar ${esc(ref(item))}">\u{1F4CB}</button>
      <button data-item-action="note" data-item="${key}" aria-label="${note ? "Editar anota\xE7\xE3o" : "Adicionar anota\xE7\xE3o"}">\u{1F4DD}</button>
      ${showRemove ? `<button data-item-action="favorite" data-item="${key}" class="remove" aria-label="Remover dos favoritos">Remover \u2764\uFE0F</button>` : `<button data-item-action="favorite" data-item="${key}" aria-pressed="${fav}" aria-label="Favoritar ${esc(ref(item))}">${fav ? "\u2764\uFE0F" : "\u2661"}</button>`}
    </div></div></article>`;
  }
  function markWords(text, words) {
    const norm = normalize2(text);
    const marks = [];
    for (const w of words) {
      let i = -1;
      const re = new RegExp(`(^|[^a-z0-9])(${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?=$|[^a-z0-9])`, "g");
      let m;
      while (m = re.exec(norm)) {
        i = m.index + m[1].length;
        marks.push([i, i + m[2].length]);
      }
    }
    marks.sort((a, b) => a[0] - b[0]);
    let out = "", pos = 0;
    for (const [s, e] of marks) {
      if (s < pos) continue;
      out += esc(text.slice(pos, s)) + `<mark>${esc(text.slice(s, e))}</mark>`;
      pos = e;
    }
    return out + esc(text.slice(pos));
  }
  function runSearch() {
    const query = $("#search-input").value;
    const testament = $("input[name=search-testament]:checked").value;
    if (!query.trim()) {
      $("#search-results").innerHTML = "";
      $("#search-count").textContent = "";
      return;
    }
    $("#search-count").textContent = "Buscando\u2026";
    search.debounced(query, (err, res) => {
      if (err) {
        $("#search-count").textContent = "N\xE3o foi poss\xEDvel buscar agora. Verifique sua conex\xE3o.";
        return;
      }
      const { results, total, reference } = res;
      const refBlock = reference ? `<article class="result-card goto"><p class="eyebrow">LIVRO</p><h3>${esc(reference.book.name)}</h3><p class="muted">${reference.book.chapters} cap\xEDtulos \xB7 ${esc(reference.book.testament)}</p><button class="btn primary" data-open="${reference.book.id}/1">Abrir ${esc(reference.book.name)} 1 \u2192</button></article>` : "";
      $("#search-count").textContent = total ? `${total.toLocaleString("pt-BR")} vers\xEDculo(s) encontrado(s)${total > results.length ? ` \u2014 mostrando os ${results.length} primeiros` : ""}` : reference ? "" : "Nenhum vers\xEDculo encontrado.";
      const isRef = /\d/.test(query) && results.length;
      $("#search-results").innerHTML = refBlock + results.map((r) => itemCard(r, { highlight: isRef ? "" : query })).join("");
    }, { testament, onProgress: (d, t) => {
      if (d < t) $("#search-count").textContent = `Preparando a busca na B\xEDblia toda\u2026 ${Math.round(d / t * 100)}%`;
    } });
  }
  function renderFavorites() {
    const items = favorites.getAll();
    $("#favorites-list").innerHTML = items.length ? items.map((i) => itemCard(i, { showRemove: true })).join("") : '<p class="empty">Ainda n\xE3o h\xE1 favoritos. Toque no \u2661 ao encontrar um vers\xEDculo especial.</p>';
  }
  function renderNotes() {
    const all = notes.all();
    $("#notes-list").innerHTML = all.length ? all.map((n) => `<article class="note-card">
      <div class="note-header"><button class="link-btn" data-open="${n.item.bookId}/${n.item.chapter}/${n.item.verse}">${esc(n.reference)} \u2192</button>
      <span class="muted small" data-note-state="${n.key}">${new Date(n.updatedAt).toLocaleDateString("pt-BR")}</span></div>
      <blockquote>\u201C${esc(n.item.text || "")}\u201D</blockquote>
      <label class="sr-only" for="note-${n.key}">Anota\xE7\xE3o para ${esc(n.reference)}</label>
      <textarea id="note-${n.key}" data-note-key="${n.key}">${esc(n.text)}</textarea>
      <div class="note-actions"><button class="link-btn danger" data-remove-note="${n.key}">Excluir</button></div></article>`).join("") : '<p class="empty">Suas reflex\xF5es aparecer\xE3o aqui. Toque em \u{1F4DD} em qualquer vers\xEDculo para anotar.</p>';
  }
  function renderPlans() {
    const active = plans.activeId();
    $("#plans-list").innerHTML = PLAN_DEFS.map((def) => {
      const t = plans.today(progress, def.id);
      const pct = Math.round(t.doneCount / t.total * 100);
      const on = def.id === active;
      return `<article class="plan-card ${on ? "active" : ""}"><p class="eyebrow">${def.days} DIAS${on ? " \xB7 PLANO ATUAL" : ""}</p><h2>${esc(def.name)}</h2><p>${esc(def.description)}</p>
      <div class="progress-track"><span style="width:${pct}%"></span></div><p class="muted small">${t.doneCount} de ${t.total} dias \xB7 ${t.finished ? "conclu\xEDdo \u2705" : `pr\xF3ximo: ${esc(t.label)}`}</p>
      <button class="btn ${on ? "primary" : "secondary"}" data-plan="${def.id}">${on ? "Continuar plano \u2192" : "Escolher plano"}</button></article>`;
    }).join("");
  }
  function renderProgress() {
    const s = progress.stats(provider);
    const bar = (label, pct, extra) => `<div class="progress-line"><header><span>${label}</span><span>${extra}</span></header><div class="progress-track" role="progressbar" aria-label="${label}" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div></div>`;
    const books = provider.books.map((b) => ({ b, pct: progress.bookPercent(provider, b.id) })).filter((x) => x.pct > 0);
    $("#progress-dashboard").innerHTML = `<article class="progress-main"><p class="eyebrow">MINHA JORNADA</p><h2>${s.percent}% da B\xEDblia conclu\xEDda</h2>
    ${bar("B\xEDblia completa", s.percent, `${s.read}/${s.total} cap\xEDtulos`)}
    ${bar("Antigo Testamento", s.oldPercent, `${s.oldPercent}%`)}
    ${bar("Novo Testamento", s.newPercent, `${s.newPercent}%`)}
    <div class="progress-stats">
      <div class="stat-card"><strong>${s.read}</strong><small>cap\xEDtulos lidos</small></div>
      <div class="stat-card"><strong>${s.booksDone}</strong><small>livros conclu\xEDdos</small></div>
      <div class="stat-card"><strong>${s.days}</strong><small>dias de leitura</small></div>
      <div class="stat-card"><strong>\u{1F525} ${s.streak}</strong><small>sequ\xEAncia atual</small></div>
      <div class="stat-card"><strong>${fmtDuration(s.listening)}</strong><small>tempo ouvindo</small></div>
      <div class="stat-card"><strong>${favorites.getAll().length}</strong><small>vers\xEDculos favoritos</small></div>
    </div></article>
    ${books.length ? `<article class="progress-main"><p class="eyebrow">POR LIVRO</p>${books.map(({ b, pct }) => bar(esc(b.name), pct, `${pct}%`)).join("")}</article>` : ""}`;
  }
  function renderJesus() {
    const gospels = ["mateus", "marcos", "lucas", "joao"].map((id) => provider.getBook(id));
    $("#gospels").innerHTML = gospels.map((b) => `<article class="plan-card"><p class="eyebrow">EVANGELHO \xB7 ${b.chapters} CAP\xCDTULOS</p><h2>${esc(b.name)}</h2>
    <div class="progress-track"><span style="width:${progress.bookPercent(provider, b.id)}%"></span></div>
    <div class="plan-actions"><button class="btn primary" data-listen-book="${b.id}">\u{1F50A} Ouvir desde o in\xEDcio</button><button class="btn secondary" data-open="${b.id}/1">\u{1F4D6} Ler</button></div></article>`).join("") + `<article class="plan-card active"><p class="eyebrow">PLANO \xB7 45 DIAS</p><h2>Vida de Jesus</h2><p>Lucas e Jo\xE3o, um cap\xEDtulo por dia.</p><button class="btn primary" data-plan="vida-de-jesus">Come\xE7ar este plano \u2192</button></article>`;
  }
  function renderAccount() {
    const info = state.syncInfo, card = $("#account-card");
    const user = info.user;
    const avatar = $("#avatar");
    avatar.innerHTML = (user == null ? void 0 : user.photoURL) ? `<img src="${esc(user.photoURL)}" alt="" referrerpolicy="no-referrer">` : esc(((user == null ? void 0 : user.displayName) || "B\xEDblia Viva").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase());
    if (!card) return;
    if (info.state === "off") {
      card.innerHTML = `<div><p class="eyebrow">\u2601\uFE0F SINCRONIZA\xC7\xC3O</p><h2>Seus dados est\xE3o neste aparelho</h2><p class="muted">A sincroniza\xE7\xE3o na nuvem ainda n\xE3o foi configurada (js/firebase-config.js).</p></div>`;
      return;
    }
    if (info.state === "file") {
      card.innerHTML = `<div><p class="eyebrow">\u2601\uFE0F SINCRONIZA\xC7\xC3O</p><h2>Seus dados est\xE3o neste aparelho</h2><p class="muted">Para entrar com Google, instalar o app e usar offline, abra pelo atalho <strong>Abrir B\xEDblia Viva</strong> que est\xE1 na pasta do projeto.</p></div>`;
      return;
    }
    if (info.state === "unavailable") {
      card.innerHTML = `<div><p class="eyebrow">\u2601\uFE0F SINCRONIZA\xC7\xC3O</p><h2>Sem conex\xE3o com a nuvem</h2><p class="muted">Seus dados continuam salvos neste aparelho. Conecte-se \xE0 internet para entrar na sua conta.</p></div>`;
      return;
    }
    if (!user) {
      card.innerHTML = `<div><p class="eyebrow">\u2601\uFE0F SINCRONIZA\xC7\xC3O</p><h2>Guarde sua jornada na nuvem</h2><p class="muted">Entre com sua conta Google para sincronizar favoritos, anota\xE7\xF5es e progresso entre celular e computador.</p></div><button class="btn primary" data-action="sign-in">Entrar com Google</button>`;
      return;
    }
    const status = { syncing: "\u23F3 Sincronizando\u2026", synced: `\u2713 Sincronizado${info.at ? ` \xE0s ${new Date(info.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}`, error: `\u26A0\uFE0F ${info.message || "Erro ao sincronizar"}` }[info.state] || "";
    card.innerHTML = `<div class="account-user">${user.photoURL ? `<img src="${esc(user.photoURL)}" alt="" referrerpolicy="no-referrer">` : ""}<div><p class="eyebrow">\u2601\uFE0F CONTA</p><h2>${esc(user.displayName || user.email)}</h2><p class="muted">${esc(user.email || "")} \xB7 ${status}</p></div></div><button class="btn secondary" data-action="sign-out">Sair</button>`;
  }
  function syncSettingsForm() {
    const s = { ...DEFAULTS, ...store.settings() };
    $$("input[name=theme]").forEach((r) => r.checked = r.value === s.theme);
    $$("input[name=fontSize]").forEach((r) => r.checked = Number(r.value) === Number(s.fontIndex));
    $("#setting-speed").value = String(s.audioSpeed);
    ["autoContinue", "wholeChapter", "autoScroll", "autoPlay", "music"].forEach((k) => $(`#setting-${k}`).checked = !!s[k]);
    $$("input[name=voiceStyle]").forEach((r) => r.checked = r.value === s.voiceStyle);
    $$("input[name=musicStyle]").forEach((r) => r.checked = r.value === s.musicStyle);
    $("#setting-musicVolume").value = s.musicVolume;
    const voices = (audio == null ? void 0 : audio.voices()) || [];
    $("#setting-voice").innerHTML = '<option value="">Autom\xE1tica (voz masculina, se houver)</option>' + voices.map((v) => `<option value="${esc(v.name)}">${esc(v.name)} (${esc(v.lang)})</option>`).join("");
    $("#setting-voice").value = s.voice || "";
    $("#voice-help").textContent = !(audio == null ? void 0 : audio.supported) ? "Seu navegador n\xE3o oferece leitura em voz alta." : voices.length ? `${voices.length} voz(es) em portugu\xEAs dispon\xEDvel(is) neste dispositivo.` : "Nenhuma voz em portugu\xEAs encontrada. No Windows, instale em Configura\xE7\xF5es \u203A Hora e idioma \u203A Fala. No Android, em Configura\xE7\xF5es \u203A Convers\xE3o de texto em voz.";
  }
  function renderAbout() {
    $("#about-credit").textContent = provider.credit;
  }
  async function install() {
    if (pwa.installed) return toast("O aplicativo j\xE1 est\xE1 instalado neste aparelho.");
    if (await pwa.install()) return toast("\u{1F4F2} Instalando o B\xEDblia Viva\u2026");
    const steps = pwa.isIOS ? "<li>Abra este site no <strong>Safari</strong>.</li><li>Toque em <strong>Compartilhar</strong> (quadrado com seta).</li><li>Escolha <strong>Adicionar \xE0 Tela de In\xEDcio</strong>.</li>" : "<li>No Chrome ou Edge, clique no \xEDcone <strong>Instalar</strong> (\u2295) na barra de endere\xE7o,</li><li>ou abra o menu <strong>\u22EE</strong> \u203A <strong>Instalar B\xEDblia Viva</strong> / <strong>Adicionar \xE0 tela inicial</strong>.</li>";
    modal(`<h2>\u{1F4F2} Instalar aplicativo</h2><ol class="steps">${steps}</ol><div class="modal-footer"><button class="btn primary" data-modal-close>Entendi</button></div>`);
  }
  function toggleFocus(force) {
    const on = force != null ? force : !document.body.classList.contains("focus-mode");
    document.body.classList.toggle("focus-mode", on);
    $(".exit-focus").hidden = !on;
    $$("[data-action=focus]").forEach((b) => b.setAttribute("aria-pressed", on));
    if (on && state.view !== "reader") {
      const last = progress.last();
      openChapter((last == null ? void 0 : last.bookId) || "joao", (last == null ? void 0 : last.chapter) || 1, (last == null ? void 0 : last.verse) || 1);
    }
    toast(on ? "\u{1F9D8} Modo foco ativado" : "Modo foco encerrado");
  }
  async function onClick(event) {
    var _a;
    const el = event.target.closest("button, [data-view]");
    const verseEl = event.target.closest(".verse");
    if (verseEl && !event.target.closest("button")) {
      selectVerse(Number(verseEl.dataset.verse));
      return;
    }
    if (!el) return;
    const d = el.dataset;
    if (d.view) {
      if (d.view === "reader") return;
      go(`#${d.view}`);
      if (d.section) setTimeout(() => {
        var _a2;
        return (_a2 = $(`#settings-${d.section}`)) == null ? void 0 : _a2.scrollIntoView({ behavior: "smooth" });
      }, 50);
      return;
    }
    if (d.testament) {
      state.testament = d.testament;
      state.pickerBook = null;
      $("#chapter-picker").hidden = true;
      renderBible();
      return;
    }
    if (d.pickBook) return openPicker(d.pickBook);
    if (d.open) {
      const [b, c, v] = d.open.split("/");
      return openChapter(b, Number(c), Number(v) || 1);
    }
    if (d.listenBook) {
      state.suppressAutoPlay = true;
      openChapter(d.listenBook, 1);
      setTimeout(() => playChapter(1), 300);
      return;
    }
    if (d.plan) {
      if (plans.activeId() !== d.plan || !store.data.planoLeitura.active) {
        plans.setActive(d.plan);
        toast("\u{1F4C5} Plano atualizado.");
      }
      const t = plans.today(progress);
      const next = t.day.find((c) => !progress.isRead(c.bookId, c.chapter)) || t.day[0];
      return openChapter(next.bookId, next.chapter);
    }
    if (d.removeNote) {
      if (el.dataset.confirm) {
        notes.remove(d.removeNote);
        renderNotes();
        renderStats();
        toast("Anota\xE7\xE3o exclu\xEDda.");
      } else {
        el.dataset.confirm = "1";
        el.textContent = "Toque de novo para excluir";
        setTimeout(() => {
          if (el.isConnected) {
            delete el.dataset.confirm;
            el.textContent = "Excluir";
          }
        }, 3e3);
      }
      return;
    }
    if (d.verseAction) {
      const n = Number(el.closest(".verse").dataset.verse);
      const item = state.chapterData.verses.find((v) => v.verse === n);
      if (d.verseAction === "listen") {
        selectVerse(n);
        audio.playChapter([item], { title: ref(item), bookId: item.bookId, chapter: item.chapter, verses: [n] }, 0, { single: true });
        return;
      }
      return handleItem(d.verseAction, item);
    }
    if (d.itemAction) return handleItem(d.itemAction, itemCache.get(d.item) || favorites.getAll().find((f) => f.key === d.item));
    const actions = {
      "start-onboarding": () => {
        $("#onboarding").hidden = true;
        $("#preference-dialog").hidden = false;
        $("#preference-dialog button").focus();
      },
      "listen-daily": () => state.daily && speak(state.daily),
      "favorite-daily": () => state.daily && handleItem("favorite", state.daily),
      "copy-daily": () => state.daily && copyVerse(state.daily),
      "note-daily": () => state.daily && noteModal(state.daily),
      "continue-reading": () => {
        const l = progress.last();
        openChapter((l == null ? void 0 : l.bookId) || "joao", (l == null ? void 0 : l.chapter) || 1, (l == null ? void 0 : l.verse) || 1);
      },
      "today-read": () => {
        const t = plans.today(progress);
        const c = t.day.find((x) => !progress.isRead(x.bookId, x.chapter)) || t.day[0];
        openChapter(c.bookId, c.chapter);
      },
      "today-done": () => {
        const t = plans.today(progress);
        plans.markDay(plans.activeId(), t.index, progress);
        celebrate();
        renderHome();
      },
      "close-chapters": () => {
        state.pickerBook = null;
        $("#chapter-picker").hidden = true;
        $$(".book-card").forEach((b) => b.classList.remove("active"));
      },
      "play-chapter": () => {
        if (audio.status === "playing" && audio.meta.bookId === state.bookId && audio.meta.chapter === state.chapter) audio.pauseSpeech();
        else playChapter();
      },
      "complete-chapter": completeChapter,
      "prev-chapter": () => {
        const p = provider.previousChapter(state.bookId, state.chapter);
        if (p) openChapter(p.bookId, p.chapter);
      },
      "next-chapter": () => {
        const n = provider.nextChapter(state.bookId, state.chapter);
        if (n) openChapter(n.bookId, n.chapter);
      },
      "toggle-theme": toggleTheme,
      focus: () => toggleFocus(),
      "font-down": () => changeFont(-1),
      "font-reset": () => changeFont("reset"),
      "font-up": () => changeFont(1),
      "toggle-audio": () => audio.toggle(),
      "toggle-music": () => {
        const on = !setting("music");
        store.setSetting("music", on);
        syncMusic(audio.status === "playing");
        syncSettingsForm();
        toast(on ? "\u{1F3B5} M\xFAsica de fundo ligada" : "M\xFAsica de fundo desligada");
      },
      "test-music": () => {
        const btn = $("[data-action=test-music]");
        if (musicPreview) {
          musicPreview = false;
          music.stop();
          btn.textContent = "\u25B6 Ouvir a m\xFAsica";
          return;
        }
        musicPreview = true;
        music.setStyle(setting("musicStyle"));
        music.setVolume(setting("musicVolume"));
        music.start();
        btn.textContent = "\u25A0 Parar a m\xFAsica";
      },
      "previous-verse": () => audio.previous(),
      "next-verse": () => audio.next(),
      "stop-audio": () => {
        audio.stopSpeech();
        $("#audio-player").hidden = true;
      },
      install,
      account: () => go("#more"),
      "sign-in": async () => {
        try {
          await sync.signIn();
        } catch (e) {
          toast(e.code === "auth/unauthorized-domain" ? "Este endere\xE7o n\xE3o est\xE1 autorizado no Firebase." : "N\xE3o foi poss\xEDvel entrar agora.");
          console.warn(e);
        }
      },
      "sign-out": async () => {
        await sync.signOut();
        toast("Voc\xEA saiu da conta. Seus dados continuam neste aparelho.");
      },
      "test-voice": () => audio.speakVerse("A tua palavra \xE9 l\xE2mpada para os meus p\xE9s e luz para o meu caminho.", { title: "Teste de voz" }),
      "download-all": async () => {
        const btn = $("#download-all");
        btn.disabled = true;
        try {
          await pwa.downloadAll(provider, (d2, t) => btn.textContent = `Baixando\u2026 ${Math.round(d2 / t * 100)}%`);
          btn.textContent = "\u2713 B\xEDblia completa dispon\xEDvel offline";
          toast("\u{1F4F6} B\xEDblia completa salva para uso offline.");
        } catch {
          btn.disabled = false;
          btn.textContent = "\u21E9 Tentar novamente";
          toast("Falha no download. Verifique sua conex\xE3o.");
        }
      }
    };
    (_a = actions[d.action]) == null ? void 0 : _a.call(actions);
  }
  function bindEvents() {
    var _a, _b, _c;
    document.addEventListener("click", onClick);
    window.addEventListener("hashchange", route);
    document.addEventListener("keydown", (e) => {
      var _a2, _b2, _c2;
      if (e.key === "Escape" && document.body.classList.contains("focus-mode") && !$("#modal-root").children.length) toggleFocus(false);
      const verse = (_b2 = (_a2 = e.target).closest) == null ? void 0 : _b2.call(_a2, ".verse");
      if (verse && e.target === verse && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        selectVerse(Number(verse.dataset.verse));
        (_c2 = verse.querySelector(".verse-actions button")) == null ? void 0 : _c2.focus();
      }
      if (state.view === "reader" && !e.target.closest("input, textarea, select") && !$("#modal-root").children.length) {
        if (e.key === "ArrowRight" && e.altKey) $("#next-chapter").click();
        if (e.key === "ArrowLeft" && e.altKey) $("#prev-chapter").click();
      }
    });
    $("#search-input").addEventListener("input", runSearch);
    $$("input[name=search-testament]").forEach((r) => r.addEventListener("change", runSearch));
    $("#search-clear").addEventListener("click", () => {
      $("#search-input").value = "";
      runSearch();
      $("#search-input").focus();
    });
    $$("[data-preference]").forEach((b) => b.addEventListener("click", () => {
      const pref = b.dataset.preference;
      store.data.configuracoes = { ...store.settings(), studyPreference: pref, onboarded: true, autoPlay: pref !== "read" };
      store.setSetting("updatedAt", Date.now());
      $("#preference-dialog").hidden = true;
      toast({ read: "\u{1F4D6} \xD3timo! Boa leitura.", listen: "\u{1F50A} Os cap\xEDtulos come\xE7ar\xE3o a tocar ao abrir.", both: "\u{1F4D6}\u{1F50A} Voc\xEA vai ler e ouvir ao mesmo tempo." }[pref]);
    }));
    const prog = $("#audio-progress");
    prog.addEventListener("input", () => seeking = true);
    prog.addEventListener("change", () => {
      seeking = false;
      audio.seekPercent(Number(prog.value));
    });
    $("#audio-speed").addEventListener("change", (e) => {
      audio.setRate(e.target.value);
      store.setSetting("audioSpeed", e.target.value);
    });
    $("#audio-volume").addEventListener("change", (e) => audio.setVolume(e.target.value));
    const noteTimers = {};
    document.addEventListener("input", (e) => {
      var _a2;
      const key = (_a2 = e.target.dataset) == null ? void 0 : _a2.noteKey;
      if (!key) return;
      const label = $(`[data-note-state="${CSS.escape(key)}"]`);
      if (label) label.textContent = "Salvando\u2026";
      clearTimeout(noteTimers[key]);
      noteTimers[key] = setTimeout(() => {
        notes.update(key, e.target.value);
        if (label) label.textContent = "\u2713 Salvo";
      }, 600);
    });
    $$("input[name=theme]").forEach((r) => r.addEventListener("change", () => {
      store.setSetting("theme", r.value);
      applyTheme();
    }));
    $$("input[name=fontSize]").forEach((r) => r.addEventListener("change", () => {
      store.setSetting("fontIndex", Number(r.value));
      applyFont();
    }));
    $("#setting-speed").addEventListener("change", (e) => {
      store.setSetting("audioSpeed", e.target.value);
      audio.setRate(e.target.value);
      $("#audio-speed").value = e.target.value;
    });
    $("#setting-voice").addEventListener("change", (e) => {
      store.setSetting("voice", e.target.value);
      audio.setVoice(e.target.value);
    });
    ["autoContinue", "wholeChapter", "autoScroll", "autoPlay"].forEach((k) => $(`#setting-${k}`).addEventListener("change", (e) => store.setSetting(k, e.target.checked)));
    $("#setting-music").addEventListener("change", (e) => {
      store.setSetting("music", e.target.checked);
      syncMusic(audio.status === "playing");
    });
    $("#setting-musicVolume").addEventListener("input", (e) => {
      music.setVolume(e.target.value);
    });
    $("#setting-musicVolume").addEventListener("change", (e) => store.setSetting("musicVolume", Number(e.target.value)));
    $$("input[name=voiceStyle]").forEach((r) => r.addEventListener("change", () => {
      store.setSetting("voiceStyle", r.value);
      applyVoiceStyle();
    }));
    $$("input[name=musicStyle]").forEach((r) => r.addEventListener("change", () => {
      store.setSetting("musicStyle", r.value);
      music.setStyle(r.value);
    }));
    (_b = (_a = window.matchMedia("(prefers-color-scheme: dark)")).addEventListener) == null ? void 0 : _b.call(_a, "change", applyTheme);
    if ("speechSynthesis" in window) (_c = speechSynthesis.addEventListener) == null ? void 0 : _c.call(speechSynthesis, "voiceschanged", () => state.view === "settings" && syncSettingsForm());
  }
  async function init() {
    const cfg = store.settings();
    if (cfg.fontSize && cfg.fontIndex === void 0) cfg.fontIndex = Math.max(0, FONT_SIZES.indexOf(cfg.fontSize));
    applyTheme();
    applyFont();
    await provider.loadIndex();
    setupAudio();
    bindEvents();
    pwa.register(() => toast("Nova vers\xE3o dispon\xEDvel \u2014 recarregue a p\xE1gina para atualizar."));
    if (!cfg.onboarded) $("#onboarding").hidden = false;
    route();
    sync = new SyncManager(store, {
      onStatus: (info) => {
        state.syncInfo = info;
        renderAccount();
      },
      onRemoteChange: () => {
        applyTheme();
        applyFont();
        if (state.view === "reader") renderReader();
        else showView(state.view);
      }
    });
    sync.init();
  }
  init().catch((err) => {
    console.error(err);
    $("#main-content").insertAdjacentHTML("afterbegin", '<p class="empty">N\xE3o foi poss\xEDvel carregar a B\xEDblia. Abra o app pelo endere\xE7o http://localhost (veja o README) e verifique sua conex\xE3o na primeira vez.</p>');
  });
  window.bibliaViva = { store, provider, progress, plans, music, audio: () => audio, sync: () => sync };
})();
