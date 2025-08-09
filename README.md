# PingBoard (Frontend-only)

A no-backend status dashboard that “pings” your sites from the browser by timing an image request to their `favicon.ico`. Works only while the tab is open.

## Features
- Drag & drop between **Available Sites** and **Active Monitors**
- Clean dark UI with cards (status, latency, uptime %, last checked)
- Adjustable global interval (5/10/15/30s)
- Export/Import config (JSON)
- 100% frontend (HTML/CSS/JS) — no servers

## How it works
Browsers can’t do ICMP. PingBoard measures **HTTP reachability**:
- Requests `https://site.tld/favicon.ico?cb=...` (or adds `https://` if you typed `site.tld`)
- If the request resolves (even with CORS/404) → **UP** (reachable)
- Network error/timeout → **DOWN**

> Note: From an HTTPS origin (e.g., GitHub Pages), mixed content blocks HTTP targets. For HTTP-only devices, test locally or put behind HTTPS.

## Run locally
Open `index.html` directly, or serve with any static server.

## License
MIT
