// Sincronização opcional com o Firebase (login Google + Firestore).
// O aparelho continua sendo a fonte principal (funciona offline); ao entrar na conta,
// os dados locais e os da nuvem são mesclados e passam a ser sincronizados.
// Configuração em js/firebase-config.js (script comum, editável sem recompilar).
const firebaseConfig = window.BV_FIREBASE_CONFIG || {};

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const clean = obj => JSON.parse(JSON.stringify(obj)); // Firestore não aceita undefined

export function mergeData(a = {}, b = {}) {
  const lixeira = { ...(a.lixeira || {}) };
  for (const [k, v] of Object.entries(b.lixeira || {})) lixeira[k] = Math.max(lixeira[k] || 0, v);
  const cutoff = Date.now() - 180 * 86400000;
  for (const [k, v] of Object.entries(lixeira)) if (v < cutoff) delete lixeira[k];

  const byKey = (listA = [], listB = [], stamp, prefix) => {
    const map = new Map();
    for (const item of [...listA, ...listB]) {
      const current = map.get(item.key);
      if (!current || (item[stamp] || 0) > (current[stamp] || 0)) map.set(item.key, item);
    }
    return [...map.values()].filter(i => !((lixeira[`${prefix}:${i.key}`] || 0) >= (i[stamp] || 0)))
      .sort((x, y) => (y[stamp] || 0) - (x[stamp] || 0));
  };

  const progresso = { ...(b.progresso || {}), ...(a.progresso || {}) };
  const configuracoes = (a.configuracoes?.updatedAt || 0) >= (b.configuracoes?.updatedAt || 0) ? (a.configuracoes || {}) : (b.configuracoes || {});
  const historico = [...(a.historico || []), ...(b.historico || [])].sort((x, y) => y.at - x.at)
    .filter((x, i, arr) => arr.findIndex(y => y.bookId === x.bookId && y.chapter === x.chapter) === i).slice(0, 20);
  const pa = a.planoLeitura || {}, pb = b.planoLeitura || {};
  const newer = (pa.activeAt || 0) >= (pb.activeAt || 0) ? pa : pb;
  const done = {};
  for (const src of [pa.done || {}, pb.done || {}]) for (const [id, days] of Object.entries(src)) done[id] = [...new Set([...(done[id] || []), ...days])];
  const planoLeitura = { ...(newer.active ? { active: newer.active, activeAt: newer.activeAt || 0 } : {}), done };
  const diasLeitura = [...new Set([...(a.diasLeitura || []), ...(b.diasLeitura || [])])].sort();

  return {
    favoritos: byKey(a.favoritos, b.favoritos, 'at', 'fav'),
    anotacoes: byKey(a.anotacoes, b.anotacoes, 'updatedAt', 'note'),
    progresso, configuracoes, historico, planoLeitura, diasLeitura,
    tempoOuvindo: Math.max(a.tempoOuvindo || 0, b.tempoOuvindo || 0),
    lixeira
  };
}

export class SyncManager {
  constructor(store, { onStatus, onRemoteChange } = {}) {
    this.store = store; this.onStatus = onStatus; this.onRemoteChange = onRemoteChange;
    this.user = null; this.timer = null; this.applyingRemote = false;
  }
  get configured() { return !!firebaseConfig?.apiKey && !!firebaseConfig?.projectId; }
  status(state, extra = {}) { this.state = state; this.onStatus?.({ state, user: this.user, ...extra }); }

  async init() {
    if (!this.configured) return this.status('off');
    // O login Google não funciona com o arquivo aberto direto (file://).
    if (!location.protocol.startsWith('http')) return this.status('file');
    try {
      const [{ initializeApp }, authMod, fs] = await Promise.all([
        import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-firestore.js`)
      ]);
      this.authMod = authMod; this.fs = fs;
      const app = initializeApp(firebaseConfig);
      this.auth = authMod.getAuth(app);
      this.auth.languageCode = 'pt';
      this.db = fs.getFirestore(app);
      authMod.getRedirectResult(this.auth).catch(() => {});
      authMod.onAuthStateChanged(this.auth, user => this.handleUser(user));
      this.store.onChange(() => this.schedulePush());
      window.addEventListener('online', () => this.user && this.push());
    } catch (err) {
      console.warn('[sync] Firebase indisponível', err);
      this.status('unavailable');
    }
  }

  async signIn() {
    if (!this.auth) return;
    const provider = new this.authMod.GoogleAuthProvider();
    try { await this.authMod.signInWithPopup(this.auth, provider); }
    catch (err) {
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(err.code)) return this.authMod.signInWithRedirect(this.auth, provider);
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') throw err;
    }
  }
  async signOut() { this.unsubscribe?.(); this.unsubscribe = null; await this.authMod?.signOut(this.auth); }

  async handleUser(user) {
    this.user = user;
    this.unsubscribe?.(); this.unsubscribe = null;
    if (!user) return this.status('signed-out');
    this.status('syncing');
    const { doc, getDoc, setDoc, onSnapshot, serverTimestamp } = this.fs;
    this.ref = doc(this.db, 'users', user.uid);
    try {
      const snap = await getDoc(this.ref);
      const merged = mergeData(this.store.data, snap.exists() ? snap.data().data : {});
      this.applyRemote(merged);
      await setDoc(this.ref, { data: clean(merged), updatedAt: serverTimestamp() });
      this.unsubscribe = onSnapshot(this.ref, s => {
        if (s.metadata.hasPendingWrites || !s.exists()) return;
        const merged2 = mergeData(this.store.data, s.data().data);
        if (JSON.stringify(merged2) !== JSON.stringify(mergeData(this.store.data, {}))) this.applyRemote(merged2);
      });
      this.status('synced', { at: Date.now() });
    } catch (err) {
      console.warn('[sync]', err);
      this.status('error', { message: err.code === 'permission-denied' ? 'Permissão negada no Firestore (verifique as regras).' : 'Sem conexão com a nuvem. Seus dados continuam salvos no aparelho.' });
    }
  }
  applyRemote(data) {
    this.applyingRemote = true;
    this.store.replace(data);
    this.applyingRemote = false;
    this.onRemoteChange?.();
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
      this.status('syncing');
      await setDoc(this.ref, { data: clean(this.store.data), updatedAt: serverTimestamp() });
      this.status('synced', { at: Date.now() });
    } catch (err) {
      this.status('error', { message: 'Não foi possível sincronizar agora. Tentaremos de novo.' });
    }
  }
}
