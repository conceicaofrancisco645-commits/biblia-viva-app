import { Store, verseKey } from './store.js';
import { BibleDataProvider } from './bible.js';
import { FavoritesManager } from './favorites.js';
import { NotesManager } from './notes.js';
import { ProgressManager } from './progress.js';
import { PlanManager, PLAN_DEFS } from './plans.js';
import { SearchManager } from './search.js';
import { AudioManager } from './audio.js';
import { PWAManager } from './pwa.js';
import { SyncManager } from './sync.js';
import { AmbientMusic } from './music.js';

// ---------------------------------------------------------------- Módulos
const store = new Store();
const provider = new BibleDataProvider();
const favorites = new FavoritesManager(store);
const notes = new NotesManager(store);
const progress = new ProgressManager(store);
const plans = new PlanManager(store, provider);
const search = new SearchManager(provider);
const pwa = new PWAManager();
const music = new AmbientMusic();
let audio, sync;

const FONT_SIZES = ['16px', '18px', '21px', '24px'];
const DEFAULTS = { theme: 'light', fontIndex: 1, audioSpeed: '1', wholeChapter: true, autoScroll: true, autoContinue: false, autoPlay: false, voice: '', voiceStyle: 'cinematico', music: true, musicVolume: 0.4, musicStyle: 'cinematico' };
const TITLES = { home: 'Vamos aprender a Palavra de Deus hoje?', bible: 'Bíblia', reader: 'Leitura', search: 'Buscar', favorites: 'Meus favoritos', notes: 'Minhas anotações', plans: 'Planos de leitura', progress: 'Meu progresso', more: 'Mais', settings: 'Configurações', about: 'Sobre o aplicativo', jesus: 'A história de Jesus' };

const state = { view: 'home', bookId: 'joao', chapter: 1, verse: 1, chapterData: null, testament: 'Novo Testamento', pickerBook: null, syncInfo: { state: 'off' } };

// ---------------------------------------------------------------- Utilidades
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const setting = name => (store.settings()[name] ?? DEFAULTS[name]);
const ref = item => `${item.book} ${item.chapter}:${item.verse}`;
const fmtTime = s => { s = Math.max(0, Math.round(s || 0)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const fmtDuration = s => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}min` : `${m} min`; };
const pad2 = n => String(n).padStart(2, '0');
const normalize = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

let toastTimer;
function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show-toast');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show-toast'), 2800);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const area = Object.assign(document.createElement('textarea'), { value: text });
    area.style.position = 'fixed'; area.style.opacity = '0';
    document.body.append(area); area.select();
    const ok = document.execCommand('copy'); area.remove(); return ok;
  }
}
const copyVerse = async item => toast((await copyText(`“${item.text}” — ${ref(item)} (BLIVRE)`)) ? '📋 Versículo copiado.' : 'Não foi possível copiar.');

function modal(html, { onClose } = {}) {
  const root = $('#modal-root');
  const previous = document.activeElement;
  root.innerHTML = `<div class="modal-backdrop" data-modal-backdrop><section class="modal" role="dialog" aria-modal="true">${html}</section></div>`;
  const close = () => { root.innerHTML = ''; onClose?.(); previous?.focus?.(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  root.querySelector('[data-modal-backdrop]').addEventListener('click', e => { if (e.target.matches('[data-modal-backdrop]')) close(); });
  root.querySelectorAll('[data-modal-close]').forEach(b => b.addEventListener('click', close));
  (root.querySelector('textarea, [autofocus], button') || root).focus();
  return { root, close };
}

// ---------------------------------------------------------------- Tema e fonte
function applyTheme() {
  const pref = setting('theme');
  const dark = pref === 'dark' || (pref === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]').content = dark ? '#15201b' : '#20533d';
}
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  store.setSetting('theme', next); applyTheme(); syncSettingsForm();
  toast(next === 'dark' ? '🌙 Tema escuro' : '☀️ Tema claro');
}
function applyFont() { document.documentElement.style.setProperty('--font-size', FONT_SIZES[setting('fontIndex')] || FONT_SIZES[1]); }
function changeFont(delta) {
  const index = delta === 'reset' ? 1 : Math.max(0, Math.min(3, Number(setting('fontIndex')) + delta));
  store.setSetting('fontIndex', index); applyFont(); syncSettingsForm();
  toast(['Texto pequeno', 'Texto médio', 'Texto grande', 'Texto extra grande'][index]);
}

// ---------------------------------------------------------------- Navegação (hash)
function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
function route() {
  const parts = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/').filter(Boolean);
  const [view = 'home', a, b, c] = parts;
  if (view === 'ler' && provider.getBook(a)) return showReader(a, Number(b) || 1, Number(c) || 1);
  showView(TITLES[view] && view !== 'reader' ? view : 'home');
}
function showView(view) {
  state.view = view;
  const renderers = { home: renderHome, bible: renderBible, plans: renderPlans, progress: renderProgress, favorites: renderFavorites, notes: renderNotes, more: renderAccount, settings: syncSettingsForm, about: renderAbout, jesus: renderJesus };
  renderers[view]?.();
  $$('.view').forEach(n => n.classList.toggle('active', n.id === `${view}-view`));
  const navView = ['plans', 'progress', 'notes', 'settings', 'about', 'jesus'].includes(view) ? 'more' : view === 'reader' ? 'bible' : view;
  $$('.nav-link, .mobile-nav button').forEach(b => { const on = b.dataset.view === navView; b.classList.toggle('active', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
  $('#page-title').textContent = TITLES[view] || '';
  $('#greeting').textContent = view === 'home' ? greeting() : 'BÍBLIA VIVA';
  if (view !== 'reader') window.scrollTo({ top: 0 });
  $('#main-content').focus({ preventScroll: true });
}
function greeting() { const h = new Date().getHours(); return h < 12 ? 'BOM DIA!' : h < 18 ? 'BOA TARDE!' : 'BOA NOITE!'; }

// ---------------------------------------------------------------- Início
async function renderHome() {
  renderStats(); renderContinue(); renderTodayPlan();
  try {
    const item = await provider.getVerseOfTheDay();
    state.daily = item;
    $('#daily-verse-text').textContent = `“${item.text}”`;
    $('#daily-verse-ref').textContent = ref(item);
    $('#favorite-daily').textContent = favorites.isFavorite(item) ? '❤️ Favoritado' : '♡ Favoritar';
  } catch { $('#daily-verse-text').textContent = 'Não foi possível carregar o versículo do dia.'; }
}
function renderStats() {
  const s = progress.stats(provider);
  const cards = [['🔥', s.streak, s.streak === 1 ? 'dia consecutivo' : 'dias consecutivos'], ['📖', s.read, 'capítulos lidos'], ['❤️', favorites.getAll().length, 'versículos favoritos'], ['📝', notes.all().length, 'anotações'], ['📊', `${s.percent}%`, 'da Bíblia concluída']];
  $('#journey-stats').innerHTML = cards.map(([i, v, l]) => `<article class="stat-card"><span class="stat-icon" aria-hidden="true">${i}</span><strong>${v}</strong><small>${l}</small></article>`).join('');
}
function renderContinue() {
  const last = progress.last();
  const book = last && provider.getBook(last.bookId);
  if (!book) {
    $('#continue-testament').textContent = 'Novo Testamento';
    $('#continue-chapter').textContent = 'João 1';
    $('#continue-progress').style.width = '0%';
    $('#continue-percent').textContent = 'Comece sua jornada pelo Evangelho de João';
    return;
  }
  const count = book.verses[last.chapter - 1] || 1;
  const percent = Math.min(100, Math.round((last.verse / count) * 100));
  $('#continue-testament').textContent = book.testament;
  $('#continue-chapter').textContent = `${book.name} ${last.chapter}:${last.verse}`;
  $('#continue-progress').style.width = `${percent}%`;
  $('#continue-bar').setAttribute('aria-valuenow', percent);
  $('#continue-percent').textContent = progress.isRead(book.id, last.chapter) ? '✓ Capítulo concluído' : `${percent}% do capítulo`;
}
function renderTodayPlan() {
  const t = plans.today(progress);
  const days = t.day;
  $('#today-plan').innerHTML = t.finished
    ? `<div><p class="eyebrow">${esc(t.def.name)}</p><h3>✅ Plano concluído!</h3><p class="muted">Parabéns pela constância. Escolha um novo plano para continuar.</p></div><button class="btn primary" data-view="plans">Escolher plano →</button>`
    : `<div><p class="eyebrow">DIA ${pad2(t.index + 1)} DE ${t.total} · ${esc(t.def.name)}</p><h3>📖 ${esc(t.label)}</h3>
        <div class="plan-day-chapters">${days.map(c => `<button class="chip ${progress.isRead(c.bookId, c.chapter) ? 'done' : ''}" data-open="${c.bookId}/${c.chapter}">${progress.isRead(c.bookId, c.chapter) ? '✓ ' : ''}${esc(c.book)} ${c.chapter}</button>`).join('')}</div></div>
       <div class="plan-actions"><button class="btn primary" data-action="today-read">Começar leitura →</button><button class="btn secondary" data-action="today-done">✅ Marcar como concluído</button></div>`;
}

// ---------------------------------------------------------------- Bíblia (livros e capítulos)
function renderBible() {
  $$('#testament-tabs button').forEach(b => { const on = b.dataset.testament === state.testament; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
  $('#book-grid').innerHTML = provider.getBooks(state.testament).map(b => {
    const pct = progress.bookPercent(provider, b.id);
    return `<button class="book-card" data-pick-book="${b.id}"><strong>${esc(b.name)}</strong><small>${b.chapters} ${b.chapters === 1 ? 'capítulo' : 'capítulos'}${pct ? ` · ${pct}%` : ''}</small>${pct ? `<span class="mini-track"><span style="width:${pct}%"></span></span>` : ''}</button>`;
  }).join('');
  if (state.pickerBook) openPicker(state.pickerBook, false);
}
function openPicker(bookId, scroll = true) {
  const book = provider.getBook(bookId);
  state.pickerBook = bookId;
  $('#chapter-picker').hidden = false;
  $('#chapter-picker-title').textContent = `${book.name} — escolha o capítulo`;
  $('#chapter-grid').innerHTML = provider.getChapters(bookId).map(c => `<button data-open="${bookId}/${c}" class="${progress.isRead(bookId, c) ? 'done' : ''}" aria-label="${esc(book.name)} capítulo ${c}${progress.isRead(bookId, c) ? ', lido' : ''}">${c}</button>`).join('');
  $$('.book-card').forEach(b => b.classList.toggle('active', b.dataset.pickBook === bookId));
  if (scroll) $('#chapter-picker').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------------------------------------------------------- Leitor
function openChapter(bookId, chapter, verse = 1) { go(`#ler/${bookId}/${chapter}/${verse}`); }
async function showReader(bookId, chapter, verse = 1) {
  const book = provider.getBook(bookId);
  chapter = Math.max(1, Math.min(chapter, book.chapters));
  const sameChapter = state.chapterData && state.bookId === bookId && state.chapter === chapter;
  Object.assign(state, { bookId, chapter, verse });
  if (!sameChapter) {
    $('#reader-verses').innerHTML = '<p class="muted loading">Carregando capítulo…</p>';
    showView('reader');
    try { state.chapterData = await provider.getChapter(bookId, chapter); }
    catch { $('#reader-verses').innerHTML = '<p class="empty">Não foi possível carregar este capítulo. Verifique sua conexão — capítulos já abertos funcionam offline.</p>'; return; }
  } else showView('reader');
  state.testament = book.testament; state.pickerBook = bookId;
  progress.setLast(bookId, chapter, verse);
  renderReader();
  const target = $(`.verse[data-verse="${verse}"]`);
  if (target && verse > 1) target.scrollIntoView({ block: 'center' }); else window.scrollTo({ top: 0 });
  if (!sameChapter && setting('autoPlay') && !state.suppressAutoPlay) playChapter();
  state.suppressAutoPlay = false;
}
function renderReader() {
  const data = state.chapterData; if (!data) return;
  const { book, chapter, verses, title } = data;
  $('#reader-testament').textContent = book.testament.toUpperCase();
  $('#reader-title').textContent = `${book.name} ${chapter}`;
  $('#reader-subtitle').hidden = !title; $('#reader-subtitle').textContent = title;
  const read = progress.isRead(book.id, chapter);
  const done = $('#complete-chapter');
  done.textContent = read ? '✓ Capítulo concluído' : '✓ Marcar capítulo como concluído';
  done.classList.toggle('is-done', read);
  $('#prev-chapter').disabled = !provider.previousChapter(book.id, chapter);
  $('#next-chapter').disabled = !provider.nextChapter(book.id, chapter);
  $('#reader-credit').textContent = 'Texto: Bíblia Livre (BLIVRE), CC BY 3.0 BR.';
  const playing = audio?.status !== 'stopped' && audio?.meta?.bookId === book.id && audio?.meta?.chapter === chapter;
  $('#reader-verses').innerHTML = verses.map(v => {
    const fav = favorites.isFavorite(v), note = notes.get(v);
    const speaking = playing && audio.verses[audio.index]?.verse === v.verse;
    return `<article class="verse ${v.verse === state.verse ? 'selected' : ''} ${speaking ? 'speaking' : ''}" data-verse="${v.verse}" tabindex="0" aria-label="Versículo ${v.verse}">
      <span class="verse-number">${v.verse}</span><span class="verse-text">${v.text ? esc(v.text) : '<em class="muted">(este versículo não consta no texto-base desta tradução)</em>'}</span>${fav ? '<span class="verse-badge" title="Favorito">❤️</span>' : ''}${note ? '<span class="verse-badge" title="Tem anotação">📝</span>' : ''}
      <div class="verse-actions" role="group" aria-label="Ações do versículo ${v.verse}">
        <button data-verse-action="listen" aria-label="Ouvir versículo ${v.verse}">🔊</button>
        <button class="${fav ? 'is-favorite' : ''}" data-verse-action="favorite" aria-label="${fav ? 'Remover dos favoritos' : 'Favoritar'} versículo ${v.verse}" aria-pressed="${fav}">${fav ? '❤️' : '♡'}</button>
        <button data-verse-action="note" aria-label="Anotar versículo ${v.verse}">📝</button>
        <button data-verse-action="copy" aria-label="Copiar versículo ${v.verse}">📋</button>
      </div></article>`;
  }).join('');
}
function selectVerse(n, { scroll = false } = {}) {
  state.verse = n;
  $$('.verse').forEach(v => v.classList.toggle('selected', Number(v.dataset.verse) === n));
  progress.setLast(state.bookId, state.chapter, n);
  history.replaceState(null, '', `#ler/${state.bookId}/${state.chapter}/${n}`);
  if (scroll) $(`.verse[data-verse="${n}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function completeChapter() {
  if (progress.isRead(state.bookId, state.chapter)) { toast('Este capítulo já está concluído.'); return; }
  progress.markChapter(state.bookId, state.chapter);
  renderReader();
  celebrate();
}
function celebrate() {
  const node = document.createElement('div');
  node.className = 'celebrate'; node.setAttribute('role', 'status');
  node.innerHTML = '<span aria-hidden="true">✅</span><strong>Capítulo concluído!</strong><small>Continue sua jornada amanhã.</small>';
  document.body.append(node);
  setTimeout(() => node.classList.add('out'), 2200);
  setTimeout(() => node.remove(), 2700);
}

// ---------------------------------------------------------------- Áudio
function setupAudio() {
  audio = new AudioManager({
    onState: renderPlayer,
    onVerse: index => {
      const v = audio.verses[index];
      if (!v?.verse || audio.meta.bookId !== state.bookId || audio.meta.chapter !== state.chapter || state.view !== 'reader') return;
      $$('.verse').forEach(n => n.classList.toggle('speaking', Number(n.dataset.verse) === v.verse));
      if (setting('autoScroll')) selectVerse(v.verse, { scroll: true });
    },
    onChapterEnd: meta => {
      if (!setting('autoContinue') || !meta.bookId) return;
      const next = provider.nextChapter(meta.bookId, meta.chapter);
      if (!next) return;
      state.suppressAutoPlay = true;
      openChapter(next.bookId, next.chapter);
      setTimeout(() => playChapter(1), 400);
    },
    onListen: s => progress.addListening(s)
  });
  audio.setRate(setting('audioSpeed'));
  applyVoiceStyle();
  audio.voiceName = setting('voice'); audio.pickVoice();
  $('#audio-speed').value = String(setting('audioSpeed'));
}
let seeking = false;
function renderPlayer(s) {
  if (s.type === 'error') toast(s.message);
  const player = $('#audio-player');
  if (s.status !== 'stopped' || s.total) player.hidden = false;
  $('#audio-title').textContent = s.meta?.title || 'Leitura';
  $('#audio-subtitle').textContent = s.licensed ? 'Narração licenciada' : s.total > 1 ? `Versículo ${s.meta.verses?.[s.index] ?? s.index + 1} de ${s.total}` : 'Leitura em português';
  const playing = s.status === 'playing';
  $('#audio-play').textContent = playing ? '⏸' : '▶';
  $('#audio-play').setAttribute('aria-label', playing ? 'Pausar' : 'Reproduzir');
  player.classList.toggle('is-playing', playing);
  syncMusic(playing);
  if (!seeking) $('#audio-progress').value = s.duration ? (s.elapsed / s.duration) * 100 : 0;
  $('#audio-current').textContent = fmtTime(s.elapsed);
  $('#audio-duration').textContent = fmtTime(s.duration);
  $$('.play-chapter span').forEach(n => (n.textContent = playing && s.meta?.bookId === state.bookId && s.meta?.chapter === state.chapter ? 'Ouvindo' : 'Ouvir'));
  if (s.status === 'stopped') $$('.verse.speaking').forEach(n => n.classList.remove('speaking'));
}
function playChapter(fromVerse = state.verse) {
  const data = state.chapterData; if (!data) return;
  const verses = data.verses.filter(v => v.text);
  const meta = { title: `${data.book.name} ${data.chapter}`, bookId: data.book.id, chapter: data.chapter, verses: verses.map(v => v.verse) };
  if (!setting('wholeChapter')) {
    const v = verses.find(x => x.verse === fromVerse) || verses[0];
    return audio.playChapter([v], { ...meta, title: ref(v), verses: [v.verse] });
  }
  const start = Math.max(0, verses.findIndex(v => v.verse === fromVerse));
  audio.playChapter(verses, meta, start);
}
// Música de fundo acompanha a narração (começa ao tocar, para ao pausar/parar).
let musicPreview = false;
function syncMusic(narrating) {
  const on = !!setting('music');
  $('#music-toggle').setAttribute('aria-pressed', on);
  $('#music-toggle').classList.toggle('off', !on);
  if (narrating && on) { music.setStyle(setting('musicStyle')); music.setVolume(setting('musicVolume')); music.start(); }
  else if (!musicPreview) music.stop();
}
// Estilos de narração: cinematográfico (grave, pausado), solene, natural
const VOICE_STYLES = { cinematico: { pitch: 0.72, gap: 700, rate: 1 }, solene: { pitch: 0.85, gap: 250, rate: 1 }, natural: { pitch: 1, gap: 0, rate: 1 } };
function applyVoiceStyle() {
  const st = VOICE_STYLES[setting('voiceStyle')] || VOICE_STYLES.cinematico;
  audio.gap = st.gap; audio.rateFactor = st.rate;
  audio.setRate(setting('audioSpeed'));
  audio.setPitch(st.pitch);
}
const speak = item => audio.speakVerse(item.text, { title: ref(item) });

// ---------------------------------------------------------------- Itens (favoritar, anotar...)
function handleItem(type, item) {
  if (!item) return;
  if (type === 'listen') speak(item);
  if (type === 'copy') copyVerse(item);
  if (type === 'note') noteModal(item);
  if (type === 'open') openChapter(item.bookId, item.chapter, item.verse);
  if (type === 'favorite') {
    const added = favorites.toggle(item);
    toast(added ? '❤️ Adicionado aos favoritos.' : 'Removido dos favoritos.');
    document.activeElement?.classList?.add('pop');
    refreshAfterChange();
  }
}
function refreshAfterChange() {
  if (state.view === 'reader') {
    const focusedAction = document.activeElement?.dataset?.verseAction;
    renderReader();
    if (focusedAction) $(`.verse[data-verse="${state.verse}"] [data-verse-action="${focusedAction}"]`)?.focus({ preventScroll: true });
  }
  if (state.view === 'favorites') renderFavorites();
  if (state.view === 'notes') renderNotes();
  if (state.view === 'home') renderHome();
  if (state.view === 'search') $$('#search-results [data-item-action="favorite"]').forEach(b => { const it = itemCache.get(b.dataset.item); if (it) { const f = favorites.isFavorite(it); b.textContent = f ? '❤️' : '♡'; b.setAttribute('aria-pressed', f); } });
  renderStats();
}
function noteModal(item) {
  const existing = notes.get(item);
  let timer;
  const { root, close } = modal(`<p class="eyebrow">${esc(ref(item))}</p><h2>📝 Minha anotação</h2>
    <blockquote class="modal-verse">“${esc(item.text)}”</blockquote>
    <label class="sr-only" for="note-input">Anotação</label>
    <textarea id="note-input" placeholder="Este versículo me lembra…">${esc(existing?.text || '')}</textarea>
    <p class="muted save-state" id="note-state">${existing ? 'Salvo automaticamente' : 'Comece a escrever — salvamos automaticamente.'}</p>
    <div class="modal-footer">${existing ? '<button class="btn secondary danger" data-delete-note>Excluir</button>' : ''}<button class="btn primary" data-modal-close>Concluir</button></div>`, { onClose: () => { clearTimeout(timer); saveNow(); refreshAfterChange(); } });
  const input = root.querySelector('#note-input');
  const saveNow = () => {
    const text = input.value.trim();
    if (text) notes.save(item, text);
    else if (notes.get(item)) notes.remove(verseKey(item));
  };
  input.addEventListener('input', () => { $('#note-state').textContent = 'Salvando…'; clearTimeout(timer); timer = setTimeout(() => { saveNow(); $('#note-state').textContent = '✓ Salvo automaticamente'; }, 600); });
  root.querySelector('[data-delete-note]')?.addEventListener('click', () => { input.value = ''; close(); toast('Anotação excluída.'); });
  input.focus(); input.setSelectionRange(input.value.length, input.value.length);
}

// ---------------------------------------------------------------- Busca
const itemCache = new Map();
function itemCard(item, { highlight = '', showRemove = false } = {}) {
  const key = verseKey(item); itemCache.set(key, item);
  const fav = favorites.isFavorite(item);
  let text = esc(item.text);
  if (highlight) {
    const words = normalize(highlight).trim().split(/\s+/).filter(w => w.length > 1);
    if (words.length) text = markWords(item.text, words);
  }
  const note = notes.get(item);
  return `<article class="result-card"><p class="eyebrow">${esc(ref(item))}</p><blockquote>“${text}”</blockquote>
    ${note ? `<p class="note-preview">📝 ${esc(note.text)}</p>` : ''}
    <div class="result-footer"><button class="link-btn" data-item-action="open" data-item="${key}">Ler no contexto →</button>
    <div class="tiny-actions">
      <button data-item-action="listen" data-item="${key}" aria-label="Ouvir ${esc(ref(item))}">🔊</button>
      <button data-item-action="copy" data-item="${key}" aria-label="Copiar ${esc(ref(item))}">📋</button>
      <button data-item-action="note" data-item="${key}" aria-label="${note ? 'Editar anotação' : 'Adicionar anotação'}">📝</button>
      ${showRemove ? `<button data-item-action="favorite" data-item="${key}" class="remove" aria-label="Remover dos favoritos">Remover ❤️</button>` : `<button data-item-action="favorite" data-item="${key}" aria-pressed="${fav}" aria-label="Favoritar ${esc(ref(item))}">${fav ? '❤️' : '♡'}</button>`}
    </div></div></article>`;
}
function markWords(text, words) {
  // destaca as palavras buscadas ignorando acentos, preservando o texto original
  const norm = normalize(text); const marks = [];
  for (const w of words) { let i = -1; const re = new RegExp(`(^|[^a-z0-9])(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=$|[^a-z0-9])`, 'g'); let m; while ((m = re.exec(norm))) { i = m.index + m[1].length; marks.push([i, i + m[2].length]); } }
  marks.sort((a, b) => a[0] - b[0]);
  let out = '', pos = 0;
  for (const [s, e] of marks) { if (s < pos) continue; out += esc(text.slice(pos, s)) + `<mark>${esc(text.slice(s, e))}</mark>`; pos = e; }
  return out + esc(text.slice(pos));
}
function runSearch() {
  const query = $('#search-input').value;
  const testament = $('input[name=search-testament]:checked').value;
  if (!query.trim()) { $('#search-results').innerHTML = ''; $('#search-count').textContent = ''; return; }
  $('#search-count').textContent = 'Buscando…';
  search.debounced(query, (err, res) => {
    if (err) { $('#search-count').textContent = 'Não foi possível buscar agora. Verifique sua conexão.'; return; }
    const { results, total, reference } = res;
    const refBlock = reference ? `<article class="result-card goto"><p class="eyebrow">LIVRO</p><h3>${esc(reference.book.name)}</h3><p class="muted">${reference.book.chapters} capítulos · ${esc(reference.book.testament)}</p><button class="btn primary" data-open="${reference.book.id}/1">Abrir ${esc(reference.book.name)} 1 →</button></article>` : '';
    $('#search-count').textContent = total ? `${total.toLocaleString('pt-BR')} versículo(s) encontrado(s)${total > results.length ? ` — mostrando os ${results.length} primeiros` : ''}` : reference ? '' : 'Nenhum versículo encontrado.';
    const isRef = /\d/.test(query) && results.length;
    $('#search-results').innerHTML = refBlock + results.map(r => itemCard(r, { highlight: isRef ? '' : query })).join('');
  }, { testament, onProgress: (d, t) => { if (d < t) $('#search-count').textContent = `Preparando a busca na Bíblia toda… ${Math.round(d / t * 100)}%`; } });
}

// ---------------------------------------------------------------- Favoritos e anotações
function renderFavorites() {
  const items = favorites.getAll();
  $('#favorites-list').innerHTML = items.length ? items.map(i => itemCard(i, { showRemove: true })).join('')
    : '<p class="empty">Ainda não há favoritos. Toque no ♡ ao encontrar um versículo especial.</p>';
}
function renderNotes() {
  const all = notes.all();
  $('#notes-list').innerHTML = all.length ? all.map(n => `<article class="note-card">
      <div class="note-header"><button class="link-btn" data-open="${n.item.bookId}/${n.item.chapter}/${n.item.verse}">${esc(n.reference)} →</button>
      <span class="muted small" data-note-state="${n.key}">${new Date(n.updatedAt).toLocaleDateString('pt-BR')}</span></div>
      <blockquote>“${esc(n.item.text || '')}”</blockquote>
      <label class="sr-only" for="note-${n.key}">Anotação para ${esc(n.reference)}</label>
      <textarea id="note-${n.key}" data-note-key="${n.key}">${esc(n.text)}</textarea>
      <div class="note-actions"><button class="link-btn danger" data-remove-note="${n.key}">Excluir</button></div></article>`).join('')
    : '<p class="empty">Suas reflexões aparecerão aqui. Toque em 📝 em qualquer versículo para anotar.</p>';
}

// ---------------------------------------------------------------- Planos e progresso
function renderPlans() {
  const active = plans.activeId();
  $('#plans-list').innerHTML = PLAN_DEFS.map(def => {
    const t = plans.today(progress, def.id);
    const pct = Math.round(t.doneCount / t.total * 100);
    const on = def.id === active;
    return `<article class="plan-card ${on ? 'active' : ''}"><p class="eyebrow">${def.days} DIAS${on ? ' · PLANO ATUAL' : ''}</p><h2>${esc(def.name)}</h2><p>${esc(def.description)}</p>
      <div class="progress-track"><span style="width:${pct}%"></span></div><p class="muted small">${t.doneCount} de ${t.total} dias · ${t.finished ? 'concluído ✅' : `próximo: ${esc(t.label)}`}</p>
      <button class="btn ${on ? 'primary' : 'secondary'}" data-plan="${def.id}">${on ? 'Continuar plano →' : 'Escolher plano'}</button></article>`;
  }).join('');
}
function renderProgress() {
  const s = progress.stats(provider);
  const bar = (label, pct, extra) => `<div class="progress-line"><header><span>${label}</span><span>${extra}</span></header><div class="progress-track" role="progressbar" aria-label="${label}" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div></div>`;
  const books = provider.books.map(b => ({ b, pct: progress.bookPercent(provider, b.id) })).filter(x => x.pct > 0);
  $('#progress-dashboard').innerHTML = `<article class="progress-main"><p class="eyebrow">MINHA JORNADA</p><h2>${s.percent}% da Bíblia concluída</h2>
    ${bar('Bíblia completa', s.percent, `${s.read}/${s.total} capítulos`)}
    ${bar('Antigo Testamento', s.oldPercent, `${s.oldPercent}%`)}
    ${bar('Novo Testamento', s.newPercent, `${s.newPercent}%`)}
    <div class="progress-stats">
      <div class="stat-card"><strong>${s.read}</strong><small>capítulos lidos</small></div>
      <div class="stat-card"><strong>${s.booksDone}</strong><small>livros concluídos</small></div>
      <div class="stat-card"><strong>${s.days}</strong><small>dias de leitura</small></div>
      <div class="stat-card"><strong>🔥 ${s.streak}</strong><small>sequência atual</small></div>
      <div class="stat-card"><strong>${fmtDuration(s.listening)}</strong><small>tempo ouvindo</small></div>
      <div class="stat-card"><strong>${favorites.getAll().length}</strong><small>versículos favoritos</small></div>
    </div></article>
    ${books.length ? `<article class="progress-main"><p class="eyebrow">POR LIVRO</p>${books.map(({ b, pct }) => bar(esc(b.name), pct, `${pct}%`)).join('')}</article>` : ''}`;
}
function renderJesus() {
  const gospels = ['mateus', 'marcos', 'lucas', 'joao'].map(id => provider.getBook(id));
  $('#gospels').innerHTML = gospels.map(b => `<article class="plan-card"><p class="eyebrow">EVANGELHO · ${b.chapters} CAPÍTULOS</p><h2>${esc(b.name)}</h2>
    <div class="progress-track"><span style="width:${progress.bookPercent(provider, b.id)}%"></span></div>
    <div class="plan-actions"><button class="btn primary" data-listen-book="${b.id}">🔊 Ouvir desde o início</button><button class="btn secondary" data-open="${b.id}/1">📖 Ler</button></div></article>`).join('')
    + `<article class="plan-card active"><p class="eyebrow">PLANO · 45 DIAS</p><h2>Vida de Jesus</h2><p>Lucas e João, um capítulo por dia.</p><button class="btn primary" data-plan="vida-de-jesus">Começar este plano →</button></article>`;
}

// ---------------------------------------------------------------- Mais / conta / configurações
function renderAccount() {
  const info = state.syncInfo, card = $('#account-card');
  const user = info.user;
  const avatar = $('#avatar');
  avatar.innerHTML = user?.photoURL ? `<img src="${esc(user.photoURL)}" alt="" referrerpolicy="no-referrer">` : esc((user?.displayName || 'Bíblia Viva').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase());
  if (!card) return;
  if (info.state === 'off') { card.innerHTML = `<div><p class="eyebrow">☁️ SINCRONIZAÇÃO</p><h2>Seus dados estão neste aparelho</h2><p class="muted">A sincronização na nuvem ainda não foi configurada (js/firebase-config.js).</p></div>`; return; }
  if (info.state === 'file') { card.innerHTML = `<div><p class="eyebrow">☁️ SINCRONIZAÇÃO</p><h2>Seus dados estão neste aparelho</h2><p class="muted">Para entrar com Google, instalar o app e usar offline, abra pelo atalho <strong>Abrir Bíblia Viva</strong> que está na pasta do projeto.</p></div>`; return; }
  if (info.state === 'unavailable') { card.innerHTML = `<div><p class="eyebrow">☁️ SINCRONIZAÇÃO</p><h2>Sem conexão com a nuvem</h2><p class="muted">Seus dados continuam salvos neste aparelho. Conecte-se à internet para entrar na sua conta.</p></div>`; return; }
  if (!user) { card.innerHTML = `<div><p class="eyebrow">☁️ SINCRONIZAÇÃO</p><h2>Guarde sua jornada na nuvem</h2><p class="muted">Entre com sua conta Google para sincronizar favoritos, anotações e progresso entre celular e computador.</p></div><button class="btn primary" data-action="sign-in">Entrar com Google</button>`; return; }
  const status = { syncing: '⏳ Sincronizando…', synced: `✓ Sincronizado${info.at ? ` às ${new Date(info.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}`, error: `⚠️ ${info.message || 'Erro ao sincronizar'}` }[info.state] || '';
  card.innerHTML = `<div class="account-user">${user.photoURL ? `<img src="${esc(user.photoURL)}" alt="" referrerpolicy="no-referrer">` : ''}<div><p class="eyebrow">☁️ CONTA</p><h2>${esc(user.displayName || user.email)}</h2><p class="muted">${esc(user.email || '')} · ${status}</p></div></div><button class="btn secondary" data-action="sign-out">Sair</button>`;
}
function syncSettingsForm() {
  const s = { ...DEFAULTS, ...store.settings() };
  $$('input[name=theme]').forEach(r => (r.checked = r.value === s.theme));
  $$('input[name=fontSize]').forEach(r => (r.checked = Number(r.value) === Number(s.fontIndex)));
  $('#setting-speed').value = String(s.audioSpeed);
  ['autoContinue', 'wholeChapter', 'autoScroll', 'autoPlay', 'music'].forEach(k => ($(`#setting-${k}`).checked = !!s[k]));
  $$('input[name=voiceStyle]').forEach(r => (r.checked = r.value === s.voiceStyle));
  $$('input[name=musicStyle]').forEach(r => (r.checked = r.value === s.musicStyle));
  $('#setting-musicVolume').value = s.musicVolume;
  const voices = audio?.voices() || [];
  $('#setting-voice').innerHTML = '<option value="">Automática (voz masculina, se houver)</option>' + voices.map(v => `<option value="${esc(v.name)}">${esc(v.name)} (${esc(v.lang)})</option>`).join('');
  $('#setting-voice').value = s.voice || '';
  $('#voice-help').textContent = !audio?.supported ? 'Seu navegador não oferece leitura em voz alta.' : voices.length ? `${voices.length} voz(es) em português disponível(is) neste dispositivo.` : 'Nenhuma voz em português encontrada. No Windows, instale em Configurações › Hora e idioma › Fala. No Android, em Configurações › Conversão de texto em voz.';
}
function renderAbout() { $('#about-credit').textContent = provider.credit; }

async function install() {
  if (pwa.installed) return toast('O aplicativo já está instalado neste aparelho.');
  if (await pwa.install()) return toast('📲 Instalando o Bíblia Viva…');
  const steps = pwa.isIOS
    ? '<li>Abra este site no <strong>Safari</strong>.</li><li>Toque em <strong>Compartilhar</strong> (quadrado com seta).</li><li>Escolha <strong>Adicionar à Tela de Início</strong>.</li>'
    : '<li>No Chrome ou Edge, clique no ícone <strong>Instalar</strong> (⊕) na barra de endereço,</li><li>ou abra o menu <strong>⋮</strong> › <strong>Instalar Bíblia Viva</strong> / <strong>Adicionar à tela inicial</strong>.</li>';
  modal(`<h2>📲 Instalar aplicativo</h2><ol class="steps">${steps}</ol><div class="modal-footer"><button class="btn primary" data-modal-close>Entendi</button></div>`);
}

// ---------------------------------------------------------------- Modo foco
function toggleFocus(force) {
  const on = force ?? !document.body.classList.contains('focus-mode');
  document.body.classList.toggle('focus-mode', on);
  $('.exit-focus').hidden = !on;
  $$('[data-action=focus]').forEach(b => b.setAttribute('aria-pressed', on));
  if (on && state.view !== 'reader') { const last = progress.last(); openChapter(last?.bookId || 'joao', last?.chapter || 1, last?.verse || 1); }
  toast(on ? '🧘 Modo foco ativado' : 'Modo foco encerrado');
}

// ---------------------------------------------------------------- Ações (clique)
async function onClick(event) {
  const el = event.target.closest('button, [data-view]');
  const verseEl = event.target.closest('.verse');
  if (verseEl && !event.target.closest('button')) { selectVerse(Number(verseEl.dataset.verse)); return; }
  if (!el) return;
  const d = el.dataset;
  if (d.view) {
    if (d.view === 'reader') return;
    go(`#${d.view}`);
    if (d.section) setTimeout(() => $(`#settings-${d.section}`)?.scrollIntoView({ behavior: 'smooth' }), 50);
    return;
  }
  if (d.testament) { state.testament = d.testament; state.pickerBook = null; $('#chapter-picker').hidden = true; renderBible(); return; }
  if (d.pickBook) return openPicker(d.pickBook);
  if (d.open) { const [b, c, v] = d.open.split('/'); return openChapter(b, Number(c), Number(v) || 1); }
  if (d.listenBook) { state.suppressAutoPlay = true; openChapter(d.listenBook, 1); setTimeout(() => playChapter(1), 300); return; }
  if (d.plan) {
    if (plans.activeId() !== d.plan || !store.data.planoLeitura.active) { plans.setActive(d.plan); toast('📅 Plano atualizado.'); }
    const t = plans.today(progress);
    const next = t.day.find(c => !progress.isRead(c.bookId, c.chapter)) || t.day[0];
    return openChapter(next.bookId, next.chapter);
  }
  if (d.removeNote) {
    if (el.dataset.confirm) { notes.remove(d.removeNote); renderNotes(); renderStats(); toast('Anotação excluída.'); }
    else { el.dataset.confirm = '1'; el.textContent = 'Toque de novo para excluir'; setTimeout(() => { if (el.isConnected) { delete el.dataset.confirm; el.textContent = 'Excluir'; } }, 3000); }
    return;
  }
  if (d.verseAction) {
    const n = Number(el.closest('.verse').dataset.verse);
    const item = state.chapterData.verses.find(v => v.verse === n);
    if (d.verseAction === 'listen') { selectVerse(n); audio.playChapter([item], { title: ref(item), bookId: item.bookId, chapter: item.chapter, verses: [n] }, 0, { single: true }); return; }
    return handleItem(d.verseAction, item);
  }
  if (d.itemAction) return handleItem(d.itemAction, itemCache.get(d.item) || favorites.getAll().find(f => f.key === d.item));

  const actions = {
    'start-onboarding': () => { $('#onboarding').hidden = true; $('#preference-dialog').hidden = false; $('#preference-dialog button').focus(); },
    'listen-daily': () => state.daily && speak(state.daily),
    'favorite-daily': () => state.daily && handleItem('favorite', state.daily),
    'copy-daily': () => state.daily && copyVerse(state.daily),
    'note-daily': () => state.daily && noteModal(state.daily),
    'continue-reading': () => { const l = progress.last(); openChapter(l?.bookId || 'joao', l?.chapter || 1, l?.verse || 1); },
    'today-read': () => { const t = plans.today(progress); const c = t.day.find(x => !progress.isRead(x.bookId, x.chapter)) || t.day[0]; openChapter(c.bookId, c.chapter); },
    'today-done': () => { const t = plans.today(progress); plans.markDay(plans.activeId(), t.index, progress); celebrate(); renderHome(); },
    'close-chapters': () => { state.pickerBook = null; $('#chapter-picker').hidden = true; $$('.book-card').forEach(b => b.classList.remove('active')); },
    'play-chapter': () => { if (audio.status === 'playing' && audio.meta.bookId === state.bookId && audio.meta.chapter === state.chapter) audio.pauseSpeech(); else playChapter(); },
    'complete-chapter': completeChapter,
    'prev-chapter': () => { const p = provider.previousChapter(state.bookId, state.chapter); if (p) openChapter(p.bookId, p.chapter); },
    'next-chapter': () => { const n = provider.nextChapter(state.bookId, state.chapter); if (n) openChapter(n.bookId, n.chapter); },
    'toggle-theme': toggleTheme,
    focus: () => toggleFocus(),
    'font-down': () => changeFont(-1), 'font-reset': () => changeFont('reset'), 'font-up': () => changeFont(1),
    'toggle-audio': () => audio.toggle(),
    'toggle-music': () => { const on = !setting('music'); store.setSetting('music', on); syncMusic(audio.status === 'playing'); syncSettingsForm(); toast(on ? '🎵 Música de fundo ligada' : 'Música de fundo desligada'); },
    'test-music': () => {
      const btn = $('[data-action=test-music]');
      if (musicPreview) { musicPreview = false; music.stop(); btn.textContent = '▶ Ouvir a música'; return; }
      musicPreview = true; music.setStyle(setting('musicStyle')); music.setVolume(setting('musicVolume')); music.start(); btn.textContent = '■ Parar a música';
    },
    'previous-verse': () => audio.previous(), 'next-verse': () => audio.next(),
    'stop-audio': () => { audio.stopSpeech(); $('#audio-player').hidden = true; },
    install,
    account: () => go('#more'),
    'sign-in': async () => { try { await sync.signIn(); } catch (e) { toast(e.code === 'auth/unauthorized-domain' ? 'Este endereço não está autorizado no Firebase.' : 'Não foi possível entrar agora.'); console.warn(e); } },
    'sign-out': async () => { await sync.signOut(); toast('Você saiu da conta. Seus dados continuam neste aparelho.'); },
    'test-voice': () => audio.speakVerse('A tua palavra é lâmpada para os meus pés e luz para o meu caminho.', { title: 'Teste de voz' }),
    'download-all': async () => {
      const btn = $('#download-all'); btn.disabled = true;
      try { await pwa.downloadAll(provider, (d, t) => (btn.textContent = `Baixando… ${Math.round(d / t * 100)}%`)); btn.textContent = '✓ Bíblia completa disponível offline'; toast('📶 Bíblia completa salva para uso offline.'); }
      catch { btn.disabled = false; btn.textContent = '⇩ Tentar novamente'; toast('Falha no download. Verifique sua conexão.'); }
    }
  };
  actions[d.action]?.();
}

// ---------------------------------------------------------------- Eventos
function bindEvents() {
  document.addEventListener('click', onClick);
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('focus-mode') && !$('#modal-root').children.length) toggleFocus(false);
    const verse = e.target.closest?.('.verse');
    if (verse && e.target === verse && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectVerse(Number(verse.dataset.verse)); verse.querySelector('.verse-actions button')?.focus(); }
    if (state.view === 'reader' && !e.target.closest('input, textarea, select') && !$('#modal-root').children.length) {
      if (e.key === 'ArrowRight' && e.altKey) $('#next-chapter').click();
      if (e.key === 'ArrowLeft' && e.altKey) $('#prev-chapter').click();
    }
  });
  $('#search-input').addEventListener('input', runSearch);
  $$('input[name=search-testament]').forEach(r => r.addEventListener('change', runSearch));
  $('#search-clear').addEventListener('click', () => { $('#search-input').value = ''; runSearch(); $('#search-input').focus(); });

  $$('[data-preference]').forEach(b => b.addEventListener('click', () => {
    const pref = b.dataset.preference;
    store.data.configuracoes = { ...store.settings(), studyPreference: pref, onboarded: true, autoPlay: pref !== 'read' };
    store.setSetting('updatedAt', Date.now());
    $('#preference-dialog').hidden = true;
    toast({ read: '📖 Ótimo! Boa leitura.', listen: '🔊 Os capítulos começarão a tocar ao abrir.', both: '📖🔊 Você vai ler e ouvir ao mesmo tempo.' }[pref]);
  }));

  // Player
  const prog = $('#audio-progress');
  prog.addEventListener('input', () => (seeking = true));
  prog.addEventListener('change', () => { seeking = false; audio.seekPercent(Number(prog.value)); });
  $('#audio-speed').addEventListener('change', e => { audio.setRate(e.target.value); store.setSetting('audioSpeed', e.target.value); });
  $('#audio-volume').addEventListener('change', e => audio.setVolume(e.target.value));

  // Anotações (salvamento automático)
  const noteTimers = {};
  document.addEventListener('input', e => {
    const key = e.target.dataset?.noteKey; if (!key) return;
    const label = $(`[data-note-state="${CSS.escape(key)}"]`); if (label) label.textContent = 'Salvando…';
    clearTimeout(noteTimers[key]);
    noteTimers[key] = setTimeout(() => { notes.update(key, e.target.value); if (label) label.textContent = '✓ Salvo'; }, 600);
  });

  // Configurações
  $$('input[name=theme]').forEach(r => r.addEventListener('change', () => { store.setSetting('theme', r.value); applyTheme(); }));
  $$('input[name=fontSize]').forEach(r => r.addEventListener('change', () => { store.setSetting('fontIndex', Number(r.value)); applyFont(); }));
  $('#setting-speed').addEventListener('change', e => { store.setSetting('audioSpeed', e.target.value); audio.setRate(e.target.value); $('#audio-speed').value = e.target.value; });
  $('#setting-voice').addEventListener('change', e => { store.setSetting('voice', e.target.value); audio.setVoice(e.target.value); });
  ['autoContinue', 'wholeChapter', 'autoScroll', 'autoPlay'].forEach(k => $(`#setting-${k}`).addEventListener('change', e => store.setSetting(k, e.target.checked)));
  $('#setting-music').addEventListener('change', e => { store.setSetting('music', e.target.checked); syncMusic(audio.status === 'playing'); });
  $('#setting-musicVolume').addEventListener('input', e => { music.setVolume(e.target.value); });
  $('#setting-musicVolume').addEventListener('change', e => store.setSetting('musicVolume', Number(e.target.value)));
  $$('input[name=voiceStyle]').forEach(r => r.addEventListener('change', () => { store.setSetting('voiceStyle', r.value); applyVoiceStyle(); }));
  $$('input[name=musicStyle]').forEach(r => r.addEventListener('change', () => { store.setSetting('musicStyle', r.value); music.setStyle(r.value); }));
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  if ('speechSynthesis' in window) speechSynthesis.addEventListener?.('voiceschanged', () => state.view === 'settings' && syncSettingsForm());
}

// ---------------------------------------------------------------- Início do app
async function init() {
  const cfg = store.settings();
  if (cfg.fontSize && cfg.fontIndex === undefined) cfg.fontIndex = Math.max(0, FONT_SIZES.indexOf(cfg.fontSize)); // migração da versão anterior
  applyTheme(); applyFont();
  await provider.loadIndex();
  setupAudio();
  bindEvents();
  pwa.register(() => toast('Nova versão disponível — recarregue a página para atualizar.'));
  if (!cfg.onboarded) $('#onboarding').hidden = false;
  route();
  sync = new SyncManager(store, {
    onStatus: info => { state.syncInfo = info; renderAccount(); },
    onRemoteChange: () => { applyTheme(); applyFont(); if (state.view === 'reader') renderReader(); else showView(state.view); }
  });
  sync.init();
}

init().catch(err => {
  console.error(err);
  $('#main-content').insertAdjacentHTML('afterbegin', '<p class="empty">Não foi possível carregar a Bíblia. Abra o app pelo endereço http://localhost (veja o README) e verifique sua conexão na primeira vez.</p>');
});

// Expor para testes/depuração no console.
window.bibliaViva = { store, provider, progress, plans, music, audio: () => audio, sync: () => sync };
