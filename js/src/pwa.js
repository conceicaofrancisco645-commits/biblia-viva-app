export class PWAManager {
  constructor() {
    this.deferred = null;
    this.installed = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      this.deferred = event;
      document.querySelectorAll('[data-install-hint]').forEach(el => (el.hidden = false));
    });
    window.addEventListener('appinstalled', () => { this.installed = true; this.deferred = null; });
  }
  get isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
  async install() {
    if (!this.deferred) return false;
    this.deferred.prompt();
    const choice = await this.deferred.userChoice;
    this.deferred = null;
    return choice?.outcome === 'accepted';
  }
  register(onUpdate) {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('service-worker.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) onUpdate?.();
        });
      });
    }).catch(() => {});
  }
  // Baixa todos os livros para o cache, para leitura e busca 100% offline.
  async downloadAll(provider, onProgress) {
    await provider.loadAll(onProgress);
    if ('caches' in window && location.protocol.startsWith('http')) {
      const cache = await caches.open('biblia-viva-books-v2');
      const missing = [];
      for (const b of provider.books) if (!(await cache.match(`data/books/${b.id}.js`))) missing.push(`data/books/${b.id}.js`);
      if (missing.length) await cache.addAll(missing);
    }
  }
}
