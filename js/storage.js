// storage.js - local persistence
const STORE_KEY = 'pingboard:v1';

const Storage = {
  load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return { intervalMs: 10000, sites: [], activeIds: [] };
      const data = JSON.parse(raw);
      // Data shape guard
      return {
        intervalMs: Number(data.intervalMs) || 10000,
        sites: Array.isArray(data.sites) ? data.sites : [],
        activeIds: Array.isArray(data.activeIds) ? data.activeIds : [],
      };
    } catch {
      return { intervalMs: 10000, sites: [], activeIds: [] };
    }
  },

  save(state) {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  },

  export() {
    return JSON.stringify(Storage.load(), null, 2);
  },

  async import(file) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.sites)) throw new Error('Invalid file');
    localStorage.setItem(STORE_KEY, JSON.stringify(parsed));
  },

  wipe() {
    localStorage.removeItem(STORE_KEY);
  }
};
