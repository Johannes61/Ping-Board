// app.js — cleaner UI, verifies target, shows last-checked
const state = Storage.load();
const runtime = {}; // id -> { history: number[], up, total, status, ms, last, targetOrigin }

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

  // Interval
  const intervalSelect = $('#intervalSelect');
  intervalSelect.value = String(state.intervalMs);
  intervalSelect.addEventListener('change', () => {
    state.intervalMs = Number(intervalSelect.value);
    Storage.save(state);
    restartPinging();
  });

  // Controls
  $('#wipeBtn').addEventListener('click', () => {
    if (!confirm('Wipe all data?')) return;
    Storage.wipe();
    Object.assign(state, { intervalMs: 10000, sites: [], activeIds: [] });
    Object.keys(runtime).forEach(k => delete runtime[k]);
    renderLists(); renderCards(); restartPinging();
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
      Object.keys(runtime).forEach(k => delete runtime[k]);
      renderLists(); renderCards(); restartPinging();
      alert('Imported.');
    } catch (err) { alert('Import failed: ' + err); }
    e.target.value = '';
  });

  $('#refreshBtn').addEventListener('click', hardRefresh);

  // Add site
  $('#addSiteForm').addEventListener('submit', (e) => {
    e.preventDefault();
    let name = $('#siteName').value.trim();
    let url  = $('#siteUrl').value.trim();
    if (!name || !url) return;

    url = Pinger.ensureProtocol(url); // normalize to absolute

    const id = uid();
    state.sites.push({ id, name, url });
    Storage.save(state);
    $('#siteName').value = ''; $('#siteUrl').value = '';
    renderLists();
  });

  // Drag & drop targets
  DragDrop.makeDroppable($('#availableList'), onDropList);
  DragDrop.makeDroppable($('#activeList'), onDropList);

  renderLists();
  renderCards();
  restartPinging();
}

function onDropList(id, target) {
  if (!state.sites.some(s => s.id === id)) return;
  const isActive = state.activeIds.includes(id);
  if (target === 'active' && !isActive) state.activeIds.push(id);
  if (target === 'available' && isActive) state.activeIds = state.activeIds.filter(x => x !== id);
  Storage.save(state);
  renderLists(); renderCards(); restartPinging();
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
      delete runtime[site.id];
      Storage.save(state);
      renderLists(); renderCards(); restartPinging();
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
    const r = runtime[id] || (runtime[id] = { history: [], up: 0, total: 0, status: '—', ms: null, last: null });

    const { origin, url } = Pinger.describeTarget(site.url);
    r.targetOrigin = origin;

    const card = document.createElement('div');
    card.className = 'card'; card.dataset.id = id;

    const statusClass = r.status === 'UP' ? 'up' : (r.status === 'DOWN' ? 'down' : '');
    const uptime = r.total ? Math.round((r.up / r.total) * 100) : 100;
    const lastChecked = r.last ? new Date(r.last).toLocaleTimeString() : '—';

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
        <button class="danger" data-act="deactivate">Deactivate</button>
      </div>
    `;

    card.querySelector('[data-act="open"]').addEventListener('click', () => {
      window.open(site.url, '_blank', 'noopener,noreferrer');
    });
    card.querySelector('[data-act="edit"]').addEventListener('click', () => {
      const newName = prompt('Name', site.name); if (newName === null) return;
      const newUrl  = prompt('URL', site.url);  if (newUrl === null) return;
      site.name = (newName.trim() || site.name);
      site.url  = Pinger.ensureProtocol(newUrl.trim() || site.url);
      Storage.save(state);
      renderLists(); renderCards(); restartPinging();
    });
    card.querySelector('[data-act="retest"]').addEventListener('click', async () => {
      await singleTick(id);
    });
    card.querySelector('[data-act="deactivate"]').addEventListener('click', () => {
      state.activeIds = state.activeIds.filter(x => x !== id);
      Storage.save(state);
      renderLists(); renderCards(); restartPinging();
    });

    drawSparkline(card.querySelector('canvas'), r.history);
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

  ctx.lineWidth = 2;
  ctx.beginPath();
  history.forEach((val, i) => {
    const x = (i / Math.max(1, history.length - 1)) * (w - 6) + 3;
    const y = val == null ? h - 3 : h - 3 - ((val - min) / (max - min)) * (h - 6);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#6ea8fe';
  ctx.stroke();
}

let timerId = null;
function restartPinging() {
  if (timerId) clearInterval(timerId);
  if (state.activeIds.length === 0) return;
  tick(); // immediate
  timerId = setInterval(tick, state.intervalMs);
}

async function singleTick(id) {
  const site = state.sites.find(s => s.id === id);
  if (!site) return;
  const res = await Pinger.pingOnce(site.url);
  const r = runtime[id] || (runtime[id] = { history: [], up: 0, total: 0 });
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
    statsStrong[0].textContent = r.ms ?? '—';
    statsStrong[1].textContent = r.total ? Math.round((r.up / r.total) * 100) : 100;
    statsStrong[2].textContent = new Date(r.last).toLocaleTimeString();
    drawSparkline(card.querySelector('canvas'), r.history);
  }
}

async function tick() {
  await Promise.all(state.activeIds.map(singleTick));
}

function hardRefresh() {
  for (const id of state.activeIds) {
    runtime[id] = { history: [], up: 0, total: 0, status: '—', ms: null, last: null };
  }
  renderCards();
  tick();
}

document.addEventListener('DOMContentLoaded', init);
