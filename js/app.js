// app.js - wiring UI + logic
const state = Storage.load();
// Runtime stats keyed by id: { history: number[], up: n, total: n }
const runtime = {};

const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));

function uid() { return Math.random().toString(36).slice(2, 10); }

function init() {
  // Tabs
  $$('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
    $$('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    $$('.tab').forEach(s => s.classList.remove('active'));
    $('#' + tab).classList.add('active');
  }));

  // Interval select
  const intervalSelect = $('#intervalSelect');
  intervalSelect.value = String(state.intervalMs);
  intervalSelect.addEventListener('change', () => {
    state.intervalMs = Number(intervalSelect.value);
    Storage.save(state);
    restartPinging();
  });

  // Buttons
  $('#wipeBtn').addEventListener('click', () => {
    if (!confirm('Wipe all data?')) return;
    Storage.wipe();
    Object.assign(state, { intervalMs: 10000, sites: [], activeIds: [] });
    Object.keys(runtime).forEach(k => delete runtime[k]);
    renderLists();
    renderCards();
    restartPinging();
  });

  $('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([Storage.export()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pingboard-export.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await Storage.import(file);
      const newState = Storage.load();
      Object.assign(state, newState);
      Object.keys(runtime).forEach(k => delete runtime[k]);
      renderLists();
      renderCards();
      restartPinging();
      alert('Imported.');
    } catch (err) {
      alert('Import failed: ' + err);
    } finally {
      e.target.value = '';
    }
  });

  $('#refreshBtn').addEventListener('click', hardRefresh);

  // Add site
  $('#addSiteForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#siteName').value.trim();
    const url = $('#siteUrl').value.trim();
    if (!name || !url) return;
    const id = uid();
    state.sites.push({ id, name, url });
    Storage.save(state);
    $('#siteName').value = '';
    $('#siteUrl').value = '';
    renderLists();
  });

  // Lists drop targets
  DragDrop.makeDroppable($('#availableList'), onDropList);
  DragDrop.makeDroppable($('#activeList'), onDropList);

  // Initial render
  renderLists();
  renderCards();
  restartPinging();
}

function onDropList(id, targetListName) {
  // Move between available <-> active
  const exists = state.sites.some(s => s.id === id);
  if (!exists) return;

  const isActive = state.activeIds.includes(id);
  if (targetListName === 'active' && !isActive) {
    state.activeIds.push(id);
  } else if (targetListName === 'available' && isActive) {
    state.activeIds = state.activeIds.filter(x => x !== id);
  }
  Storage.save(state);
  renderLists();
  renderCards();
  restartPinging();
}

function renderLists() {
  const available = $('#availableList');
  const active = $('#activeList');
  available.innerHTML = '';
  active.innerHTML = '';

  const activeSet = new Set(state.activeIds);

  for (const site of state.sites) {
    const li = document.createElement('li');
    li.className = 'site-item';
    li.dataset.id = site.id;
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
      // Remove from both lists
      state.sites = state.sites.filter(s => s.id !== site.id);
      state.activeIds = state.activeIds.filter(id => id !== site.id);
      delete runtime[site.id];
      Storage.save(state);
      renderLists();
      renderCards();
      restartPinging();
    });

    if (activeSet.has(site.id)) active.appendChild(li);
    else available.appendChild(li);
  }
}

function renderCards() {
  const cards = $('#cards');
  cards.innerHTML = '';
  cards.classList.toggle('empty', state.activeIds.length === 0);

  for (const id of state.activeIds) {
    const site = state.sites.find(s => s.id === id);
    if (!site) continue;
    const r = runtime[id] || (runtime[id] = { history: [], up: 0, total: 0, status: '—', ms: null });
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = id;
    const statusClass = r.status === 'UP' ? 'up' : (r.status === 'DOWN' ? 'down' : '');
    const uptime = r.total ? Math.round((r.up / r.total) * 100) : 100;

    card.innerHTML = `
      <div class="row">
        <div class="name">${site.name}</div>
        <div class="badge ${statusClass}">${r.status}</div>
      </div>
      <div class="row stats">
        <span>Latency: <strong>${r.ms ?? '—'}</strong> ms</span>
        <span>Uptime: <strong>${uptime}</strong>%</span>
      </div>
      <div class="spark"><canvas></canvas></div>
      <div class="actions">
        <button class="ghost" data-act="open">Open</button>
        <button class="ghost" data-act="edit">Edit</button>
        <button class="danger" data-act="deactivate">Deactivate</button>
      </div>
    `;

    card.querySelector('[data-act="open"]').addEventListener('click', () => {
      window.open(site.url, '_blank', 'noopener,noreferrer');
    });
    card.querySelector('[data-act="edit"]').addEventListener('click', () => {
      // Simple inline edit prompt
      const newName = prompt('Name', site.name);
      if (newName === null) return;
      const newUrl = prompt('URL', site.url);
      if (newUrl === null) return;
      site.name = newName.trim() || site.name;
      site.url = newUrl.trim() || site.url;
      Storage.save(state);
      renderLists();
      renderCards();
    });
    card.querySelector('[data-act="deactivate"]').addEventListener('click', () => {
      state.activeIds = state.activeIds.filter(x => x !== id);
      Storage.save(state);
      renderLists();
      renderCards();
      restartPinging();
    });

    // Draw sparkline
    const canvas = card.querySelector('canvas');
    drawSparkline(canvas, r.history);

    $('#cards').appendChild(card);
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
    const y = val == null
      ? h - 3
      : h - 3 - ((val - min) / (max - min)) * (h - 6);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#6ea8fe';
  ctx.stroke();
}

let timerId = null;
function restartPinging() {
  if (timerId) clearInterval(timerId);
  if (state.activeIds.length === 0) return;
  timerId = setInterval(tick, state.intervalMs);
  // Kick once immediately
  tick();
}

async function tick() {
  // Ping all active
  await Promise.all(state.activeIds.map(async (id) => {
    const site = state.sites.find(s => s.id === id);
    if (!site) return;
    const res = await Pinger.pingOnce(site.url);
    const r = runtime[id] || (runtime[id] = { history: [], up: 0, total: 0 });
    r.total++;
    if (res.ok) { r.up++; r.status = 'UP'; r.ms = res.ms; }
    else { r.status = 'DOWN'; r.ms = null; }
    // Keep last 30 samples (latency or null for down)
    r.history.push(res.ok ? res.ms : null);
    if (r.history.length > 30) r.history.shift();

    // Update card UI if rendered
    const card = document.querySelector(`.card[data-id="${id}"]`);
    if (card) {
      const badge = card.querySelector('.badge');
      badge.textContent = r.status;
      badge.classList.toggle('up', r.status === 'UP');
      badge.classList.toggle('down', r.status === 'DOWN');
      card.querySelector('.stats strong').textContent = r.ms ?? '—';
      const uptime = r.total ? Math.round((r.up / r.total) * 100) : 100;
      card.querySelectorAll('.stats strong')[1].textContent = uptime;
      drawSparkline(card.querySelector('canvas'), r.history);
    }
  }));
}

function hardRefresh() {
  // Clear session stats to see fresh readings
  for (const id of state.activeIds) {
    runtime[id] = { history: [], up: 0, total: 0, status: '—', ms: null };
  }
  renderCards();
  tick();
}

document.addEventListener('DOMContentLoaded', init);
