# Ping Board

A lightweight, no‑backend status dashboard that “pings” your sites from the browser by timing a fetch to their `favicon.ico`. Works only while the tab is open.

## Features
- Drag & drop between **Available Sites** and **Active Monitors**
- Clean dark UI with cards, status (UP/DOWN), latency, uptime %, and sparkline
- Adjustable global interval (5/10/15/30s)
- Export/Import configuration (JSON)
- 100% frontend (HTML/CSS/JS) — no servers

## How “ping” works (browser limits)
Browsers can’t do ICMP. Ping Board measures **HTTP fetch latency**:
- Requests `https://site.tld/favicon.ico` with `mode: no-cors` and `cache: no-cache`
- If the fetch resolves → **UP** (even if opaque)
- Network error/timeout → **DOWN**

> Note: Mixed content rules block `http://` targets on an `https://` page.

## Hosting on GitHub Pages
1. Push this folder to your repo (e.g., `pingboard`).
2. Enable **Settings → Pages → Deploy from branch** (root).
3. Open your Pages URL and start adding sites.

## Privacy
All configuration/state is stored in `localStorage` in your browser.

## License
MIT
