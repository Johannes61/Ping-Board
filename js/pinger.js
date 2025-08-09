// pinger.js — image-based ping with strict absolute target
const Pinger = (() => {
  const TIMEOUT_MS = 6000;

  function ensureProtocol(url) {
    // If user typed "example.com", assume https
    if (!/^https?:\/\//i.test(url)) return `https://${url}`;
    return url;
  }

  function targetFrom(url) {
    try {
      const u = new URL(ensureProtocol(url));
      // We ping the ORIGIN (not your hosting domain) and use favicon for light weight
      return `${u.origin}/favicon.ico?cb=${Date.now()}`;
    } catch {
      return null;
    }
  }

  // For UI: show what we’re pinging
  function describeTarget(url) {
    const t = targetFrom(url);
    if (!t) return { origin: '—', url: '—' };
    const u = new URL(t);
    return { origin: u.origin, url: t };
  }

  function pingOnce(url) {
    return new Promise((resolve) => {
      const t = targetFrom(url);
      if (!t) return resolve({ ok: false, ms: null, error: 'bad url', target: null });

      const img = new Image();
      const t0 = performance.now();
      let done = false;

      const finish = (ok) => {
        if (done) return;
        done = true;
        const ms = ok ? Math.round(performance.now() - t0) : null;
        resolve({ ok, ms, target: t });
      };

      const timer = setTimeout(() => finish(false), TIMEOUT_MS);

      img.onload = () => { clearTimeout(timer); finish(true); };
      // onerror still means host reached (CORS/404); treat as UP
      img.onerror = () => { clearTimeout(timer); finish(true); };
      img.src = t;
    });
  }

  return { pingOnce, describeTarget, ensureProtocol };
})();
