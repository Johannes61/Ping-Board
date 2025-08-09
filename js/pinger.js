// pinger.js — fetch-based ping (no-cors) with timeout; no console spam on dead DNS
const Pinger = (() => {
  const TIMEOUT_MS = 6000;

  function ensureProtocol(url) {
    if (!/^https?:\/\//i.test(url)) return `https://${url}`;
    return url;
  }

  function targetFrom(url) {
    try {
      const u = new URL(ensureProtocol(url));
      return `${u.origin}/favicon.ico?cb=${Date.now()}`;
    } catch {
      return null;
    }
  }

  function describeTarget(url) {
    const t = targetFrom(url);
    if (!t) return { origin: '—', url: '—' };
    const u = new URL(t);
    return { origin: u.origin, url: t };
  }

  async function pingOnce(url) {
    const target = targetFrom(url);
    if (!target) return { ok: false, ms: null, target: null, error: 'bad url' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const t0 = performance.now();
    try {
      await fetch(target, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-cache',
        signal: controller.signal,
      });
      clearTimeout(timer);
      const ms = Math.round(performance.now() - t0);
      return { ok: true, ms, target };
    } catch {
      clearTimeout(timer);
      return { ok: false, ms: null, target, error: 'unreachable' };
    }
  }

  return { pingOnce, describeTarget, ensureProtocol };
})();
