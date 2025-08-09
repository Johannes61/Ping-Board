// app.js - wraps in IIFE to avoid globals
(function () {
  const { Storage, Pinger, DragDrop } = window.PingBoard;

  const state = Storage.load();
  const runtime = {};         // id -> { history, up, total, status, ms, last, paused, timer }
  const DEFAULT_SITE_INT = 0; // 0 = follow global

  const $ = (q) => document.querySelector(q);
  const $$ = (q) => Array.from(document.querySelectorAll(q));
  const uid = () => Math.random().toString(36).slice(2, 10);

  function init() {
    // Tabs
    $$('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
      $$('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      $$('.tab').forEach(s => s.classList.remove('active'));
      $('#' + tab).classList.add('active');
    }));

    // Global interval
    const intervalSelect = $('#intervalSelect');
    intervalSelect.value = String(state.intervalMs);
    intervalSelect.addEventListener('change', () => {
      state.intervalMs = Number(intervalSelect.value);
      Storage.save(state);
      restartAllTimers();
    });

    // Notifications
    const notifBtn = $('#notifBtn');
    updateNotifBtn();
    notifBtn.addEventListener('click', async () => {
      if (!('Notification' in window)) { alert('Notifications not supported.'); return; }
      const perm = await Notification.requestPermission();
      state.notifications = (perm === 'granted');
      Storage.save(state);
      updateNotifBtn();
    });

    // Controls
    $('#wipeBtn').addEventListener('click', () => {
      if (!confirm('Wipe all data?')) return;
      Storage.wipe();
      Object.assign(state, { intervalMs: 10000, sites: [], activeIds: [], notifications: false });
      Object.values(runtime).forEach(r => r.timer && clearInterval(r.timer));
      for (const k in runtime) delete runtime[k];
      renderLists(); renderCards();
    });

    $('#exportBtn').addEventListener('click', () => {
      const blob = new Blob([Storage.export()], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'pingboard-export.json'; a.click(); URL.revokeObjectURL(a.href);
    });

    $('#importFile').addEventListener('change', async (e) => {
      const file = e.target.files?.[0]; if (!file) return;
      try {
        await Storage.import(file);
        Object.assign(state, Storage.load());
        stopAllTimers(); renderLists(); renderCards(); restartAllTimers();
        alert('Imported.');
      } catch (err) { alert('Import failed: ' + err); }
      e.target.value = '';
    });

    $('#refreshBtn').addEventListener('click', async () => {
      await Promise.all(state.activeIds.map(singleTick));
    });

    // Add site
    $('#addSiteForm').addEventListener('submit', (e) => {
      e.preventDefault();
      let name = $('#siteName').value.trim();
      let url  = $('#siteUrl').value.trim();
      if (!name || !url) return;

      url = Pinger.ensureProtocol(url); // normalize

      const id = uid();
      state.sites.push({ id, name, url, intervalMs: DEFAULT_SITE_INT });
      Storage.save(state);
      $('#siteName').value = ''; $('#siteUrl').value = '';
      renderLists();
    });

    // DnD targets
    DragDrop.makeDroppable($('#availableList'), onDropList);
    DragDrop.makeDroppable($('#activeList'), onDropList);

    // Initial UI + timers
    renderLists();
    renderCards();
    restartAllTimers();

    // Load GitHub profile card
    loadGitHubProfile('Johannes61');
  }

  function updateNotifBtn() {
    $('#notifBtn').textContent = state.notifications ? 'Notifications: ON' : 'Enable notifications';
  }

  function onDropList(id, target) {
    if (!state.sites.some(s => s.id === id)) return;
    const isActive = state.activeIds.includes(id);
    if (target === 'active' && !isActive) state.activeIds.push(id);
    if (target === 'available' && isActive) state.activeIds = state.activeIds.filter(x => x !== id);
    Storage.save(state);
    renderLists(); renderCards(); restartAllTimers();
  }

  function renderLists() {
    const available = $('#availableList');
    const active = $('#activeList');
    available.innerHTML = ''; active.innerHTML = '';

    const activeSet = new Set(state.activeIds);
    for (const site of state.sites) {
      const li = document.createElement('li');
      li.className = 'site-item'; li.dataset.id = site.id;
      li.innerHTML = `
        <div>
          <div>${site.name}</div>
          <div class="url">${site.url}</div>
        </div>
        <div>
          <button class="remove">Remove</button>
        </div>
      `;
      DragDrop.makeDraggable(li);
      li.querySelector('.remove').addEventListener('click', () => {
        state.sites = state.sites.filter(s => s.id !== site.id);
        state.activeIds = state.activeIds.filter(x => x !== site.id);
        const r = runtime[site.id]; if (r?.timer) clearInterval(r.timer);
        delete runtime[site.id];
        Storage.save(state);
        renderLists(); renderCards();
      });

      activeSet.has(site.id) ? active.appendChild(li) : available.appendChild(li);
    }
  }

  function renderCards() {
    const cards = $('#cards');
    cards.innerHTML = '';
    cards.classList.toggle('empty', state.activeIds.length === 0);

    for (const id of state.activeIds) {
      const site = state.sites.find(s => s.id === id); if (!site) continue;
      const r = runtime[id] || (runtime[id] = { history: [], up: 0, total: 0, status: '—', ms: null, last: null, paused: false });

      const { origin, url } = Pinger.describeTarget(site.url);
      const statusClass = r.status === 'UP' ? 'up' : (r.status === 'DOWN' ? 'down' : '');
      const uptime = r.total ? Math.round((r.up / r.total) * 100) : 100;
      const lastChecked = r.last ? new Date(r.last).toLocaleTimeString() : '—';
      const effectiveInt = site.intervalMs && site.intervalMs > 0 ? site.intervalMs : state.intervalMs;

      const card = document.createElement('div');
      card.className = 'card'; card.dataset.id = id;
      card.innerHTML = `
        <div class="row">
          <div class="name">${site.name}</div>
          <div class="badge ${statusClass}">${r.status}</div>
        </div>

        <div class="row meta">
          <span title="Ping target origin">${origin}</span>
          <a class="tiny" href="${url}" target="_blank" rel="noreferrer">verify target ↗</a>
        </div>

        <div class="row stats">
          <span>Latency: <strong>${r.ms ?? '—'}</strong> ms</span>
          <span>Uptime: <strong>${uptime}</strong>%</span>
          <span>Last: <strong>${lastChecked}</strong></span>
        </div>

        <div class="spark"><canvas></canvas></div>

        <div class="actions">
          <button class="ghost" data-act="open">Open</button>
          <button class="ghost" data-act="edit">Edit</button>
          <button class="ghost" data-act="retest">Retest</button>
          <button class="ghost" data-act="pause">${r.paused ? 'Resume' : 'Pause'}</button>
          <button class="danger" data-act="deactivate">Deactivate</button>
        </div>
      `;

      // Wire buttons
      card.querySelector('[data-act="open"]').addEventListener('click', () => {
        window.open(site.url, '_blank', 'noopener,noreferrer');
      });
      card.querySelector('[data-act="edit"]').addEventListener('click', () => {
        const newName = prompt('Name', site.name); if (newName === null) return;
        const newUrl  = prompt('URL', site.url);  if (newUrl === null) return;
        const newInt  = prompt('Interval ms (0 = use global)', String(site.intervalMs ?? 0));
        site.name = (newName.trim() || site.name);
        site.url  = Pinger.ensureProtocol(newUrl.trim() || site.url);
        const parsed = Number(newInt);
        site.intervalMs = Number.isFinite(parsed) && parsed >= 0 ? parsed : site.intervalMs || 0;
        Storage.save(state);
        renderLists(); renderCards(); restartTimerFor(id);
      });
      card.querySelector('[data-act="retest"]').addEventListener('click', async () => {
        await singleTick(id);
      });
      card.querySelector('[data-act="pause"]').addEventListener('click', () => {
        r.paused = !r.paused;
        if (r.paused && r.timer) { clearInterval(r.timer); r.timer = null; }
        else if (!r.paused) { startTimerFor(id); }
        renderCards();
      });
      card.querySelector('[data-act="deactivate"]').addEventListener('click', () => {
        state.activeIds = state.activeIds.filter(x => x !== id);
        Storage.save(state);
        const rt = runtime[id]; if (rt?.timer) clearInterval(rt.timer);
        delete runtime[id];
        renderLists(); renderCards();
      });

      drawSparkline(card.querySelector('canvas'), r.history);

      const hint = document.createElement('div');
      hint.className = 'meta';
      hint.style.marginTop = '6px';
      hint.textContent = `Interval: ${effectiveInt}ms ${site.intervalMs ? '(site)' : '(global)'}`;
      card.appendChild(hint);

      cards.appendChild(card);
    }
  }

  function drawSparkline(canvas, history) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth;
    const h = canvas.height = canvas.clientHeight;
    ctx.clearRect(0,0,w,h);
    if (!history.length) return;
    const max = Math.max(...history.map(v => (v ?? 0))) || 1;
    const min = 0;
    ctx.lineWidth = 2; ctx.beginPath();
    history.forEach((val, i) => {
      const x = (i / Math.max(1, history.length - 1)) * (w - 6) + 3;
      const y = val == null ? h - 3 : h - 3 - ((val - min) / (max - min)) * (h - 6);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#6ea8fe'; ctx.stroke();
  }

  /* ---------------- Timers (per-site) ---------------- */
  function startTimerFor(id) {
    const site = state.sites.find(s => s.id === id);
    const r = runtime[id] || (runtime[id] = {});
    if (r.timer) clearInterval(r.timer);
    if (!state.activeIds.includes(id) || r.paused) return;
    const int = (site?.intervalMs && site.intervalMs > 0) ? site.intervalMs : state.intervalMs;
    singleTick(id);
    r.timer = setInterval(() => singleTick(id), int);
  }
  function restartTimerFor(id) { const r = runtime[id]; if (r?.timer) { clearInterval(r.timer); r.timer = null; } startTimerFor(id); }
  function restartAllTimers() { stopAllTimers(); for (const id of state.activeIds) startTimerFor(id); }
  function stopAllTimers() { for (const id in runtime) { const r = runtime[id]; if (r?.timer) { clearInterval(r.timer); r.timer = null; } } }

  /* -------------- Ping + notifications -------------- */
  async function singleTick(id) {
    const site = state.sites.find(s => s.id === id); if (!site) return;
    const r = runtime[id] || (runtime[id] = { history: [], up: 0, total: 0, status: '—' });
    const prevStatus = r.status;

    const res = await window.PingBoard.Pinger.pingOnce(site.url);
    r.total++; r.last = Date.now();
    if (res.ok) { r.up++; r.status = 'UP'; r.ms = res.ms; } else { r.status = 'DOWN'; r.ms = null; }
    r.history.push(res.ok ? res.ms : null);
    if (r.history.length > 40) r.history.shift();

    const card = document.querySelector(`.card[data-id="${id}"]`);
    if (card) {
      const badge = card.querySelector('.badge');
      badge.textContent = r.status;
      badge.classList.toggle('up', r.status === 'UP');
      badge.classList.toggle('down', r.status === 'DOWN');
      const statsStrong = card.querySelectorAll('.stats strong');
      const uptime = r.total ? Math.round((r.up / r.total) * 100) : 100;
      statsStrong[0].textContent = r.ms ?? '—';
      statsStrong[1].textContent = uptime;
      statsStrong[2].textContent = new Date(r.last).toLocaleTimeString();
      drawSparkline(card.querySelector('canvas'), r.history);
    }

    if (state.notifications && prevStatus && prevStatus !== r.status && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(`${site.name} is ${r.status}`, { body: site.url });
    }
  }

  /* ---------- GitHub profile card ---------- */
  async function loadGitHubProfile(username) {
    const el = document.getElementById('ghCard');
    try {
      const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
        headers: { 'Accept': 'application/vnd.github+json' }
      });
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      const u = await res.json();

      const name = u.name || u.login;
      const bio = u.bio || '';
      const avatar = u.avatar_url;
      const followers = u.followers ?? 0;
      const following = u.following ?? 0;
      const repos = u.public_repos ?? 0;
      const loc = u.location || '';
      const blog = u.blog ? (u.blog.startsWith('http') ? u.blog : `https://${u.blog}`) : '';

      el.innerHTML = `
        <img src="${avatar}" alt="${name} avatar" />
        <div class="profile-info">
          <div class="profile-name">${name} <span class="url" style="color:var(--muted)">@${u.login}</span></div>
          <div class="profile-badges">
            <span>Repos: <strong>${repos}</strong></span>
            <span>Followers: <strong>${followers}</strong></span>
            <span>Following: <strong>${following}</strong></span>
            ${loc ? `<span>📍 ${loc}</span>` : ''}
            ${blog ? `<a href="${blog}" target="_blank" rel="noreferrer">🔗 ${new URL(blog).hostname}</a>` : ''}
          </div>
          ${bio ? `<div style="color:var(--muted)">${bio}</div>` : ''}
        </div>
        <div class="profile-actions">
          <a href="${u.html_url}" target="_blank" rel="noreferrer">View Profile</a>
          <a href="${u.html_url}?tab=repositories" target="_blank" rel="noreferrer">Repositories</a>
        </div>
      `;
    } catch (e) {
      el.innerHTML = `
        <div class="profile-info">
          <div class="profile-name">@${username}</div>
          <div class="profile-badges" style="color:var(--muted)">Could not load GitHub profile (${String(e).replace('Error:','').trim()}).</div>
        </div>
        <div class="profile-actions">
          <a href="https://github.com/${username}" target="_blank" rel="noreferrer">Open on GitHub</a>
        </div>
      `;
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
