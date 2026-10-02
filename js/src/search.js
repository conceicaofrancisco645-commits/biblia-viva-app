// Busca com debounce e cancelamento de buscas antigas.
export class SearchManager {
  constructor(provider) { this.provider = provider; this.seq = 0; this.timer = null; }
  search(query, options) { return this.provider.search(query, options); }
  debounced(query, callback, options = {}, delay = 250) {
    clearTimeout(this.timer);
    const id = ++this.seq;
    this.timer = setTimeout(async () => {
      try {
        const result = await this.provider.search(query, options);
        if (id === this.seq) callback(null, result);
      } catch (err) { if (id === this.seq) callback(err); }
    }, delay);
  }
}
