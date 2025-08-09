// pinger.js - timing fetches; session stats & charts
const Pinger = (() => {
  const TIMEOUT_MS = 6000;

  function normalizeUrl(url) {
    try {
      const u = new URL(url);
      // Prefer favicon route to avoid heavy pages; ensure trailing slash coverage
      if (!u.pathname || u.pathname === '/') u.pathname = '/favicon.ico';
      return u.toString();
    } catch {
      return url;
    }
  }

  async function pingOnce(url) {
    const target = normalizeUrl(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const t0 = performance.now();
    try {
      // 'no-cache' to avoid cache skew; 'no-cors' yields opaque but still times
      const res = await fetch(target, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-cache',
        signal: controller.signal,
      });
      const ms = Math.max(0, Math.round(performance.now() - t0));
      clearTimeout(timer);
      // In 'no-cors' opaque, network success still resolves. Treat as UP.
      return { ok: true, ms };
    } catch (e) {
      clearTimeout(timer);
      return { ok: false, ms: null, error: String(e) };
    }
  }

  return { pingOnce };
})();
