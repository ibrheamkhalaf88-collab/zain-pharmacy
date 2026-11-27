/* Zain admin: UI kit and app shell.
   A dashboard is a config: pages (render functions), actions, links.
   The shell owns layout, routing, theme, dialogs, toasts and delegation. */
'use strict';
(function (Z) {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('ar-EG');
  const cur = new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });
  const money = (v) => v == null ? '—' : cur.format(v);
  const compactMoney = (v) => v >= 1000 ? nf.format(Math.round(v / 100) / 10) + ' ألف' : nf.format(v);
  const num = (v) => v == null ? '—' : nf.format(v);
  const dateTime = (v) => Number.isNaN(Date.parse(v)) ? '—' : new Date(v).toLocaleString('ar-EG', { timeZone: 'Asia/Gaza', dateStyle: 'medium', timeStyle: 'short' });
  const slot = (v) => v ? new Date(v + ':00').toLocaleString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';

  /* Icons: 24px stroke paths. */
  const P = {
    home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
    layers: 'M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 18l10 5 10-5',
    tag: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
    receipt: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6M9 16h3',
    chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
    store: 'M3 9h18l-1.5-5h-15zM4 9v11h16V9M9 20v-6h6v6',
    calendar: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
    sparkles: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
    history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
    moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
    plus: 'M12 5v14M5 12h14', edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
    trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6', search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
    download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3', upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
    alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
    check: 'M20 6 9 17l-5-5', arrow: 'M15 18l-6-6 6-6', cross: 'M12 4v16M4 12h16', external: 'M14 3h7v7M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5',
    menu: 'M4 6h16M4 12h16M4 18h16', image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01', star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
    left: 'M15 18l-6-6 6-6', right: 'M9 18l6-6-6-6', trend: 'M22 7 13.5 15.5l-5-5L2 17M16 7h6v6'
  };
  const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[n] || P.home}"/></svg>`;

  /* ---------- building blocks ---------- */
  const pill = (label, tone = '') => `<span class="pill ${tone}">${esc(label)}</span>`;
  const btn = (act, label, { id = '', tone = '', ic = '', title = '' } = {}) =>
    `<button type="button" class="btn ${tone}" data-act="${act}" data-id="${esc(id)}"${title ? ` title="${esc(title)}" aria-label="${esc(title)}"` : ''}>${ic ? icon(ic) : ''}${label ? `<span>${esc(label)}</span>` : ''}</button>`;
  const iconBtn = (act, ic, title, id = '') => btn(act, '', { id, ic, title, tone: 'ghost icon-only' });
  const card = (title, body, { sub = '', actions = '', cls = '', format = '' } = {}) =>
    `<section class="card ${cls}"${format ? ` data-format="${format}"` : ''}>${title ? `<header class="card-head"><div><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${actions ? `<div class="card-actions">${actions}</div>` : ''}</header>` : ''}${body}</section>`;
  /* KPI tile: label, value, optional delta {value, good:boolean, text} and link. */
  function kpi({ label, value, ic = 'trend', hint = '', delta, href, tone = '' }) {
    const d = delta ? `<span class="delta ${delta.good ? 'up' : 'down'}">${icon(delta.good ? 'trend' : 'alert')}${esc(delta.text)}</span>` : '';
    const tag = href ? 'a' : 'div';
    return `<${tag} class="kpi ${tone}"${href ? ` href="${href}"` : ''}><span class="kpi-icon">${icon(ic)}</span><span class="kpi-label">${esc(label)}</span><strong class="kpi-value">${esc(value)}</strong>${d || (hint ? `<span class="kpi-hint">${esc(hint)}</span>` : '')}</${tag}>`;
  }
  function table({ columns, rows, empty = 'لا توجد بيانات.', emptyAction = '' }) {
    if (!rows.length) return `<div class="empty">${icon('layers')}<p>${esc(empty)}</p>${emptyAction}</div>`;
    return `<div class="table-wrap"><table><thead><tr>${columns.map((c) => `<th scope="col" class="${c.cls || ''}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>` +
      rows.map((r) => `<tr>${columns.map((c) => `<td class="${c.cls || ''}" data-label="${esc(c.label)}">${c.cell(r)}</td>`).join('')}</tr>`).join('') + `</tbody></table></div>`;
  }
  const toolbar = (left, right = '') => `<div class="toolbar"><div class="toolbar-start">${left}</div><div class="toolbar-end">${right}</div></div>`;
  const search = (id, placeholder, value = '') => `<label class="search">${icon('search')}<input id="${id}" type="search" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" value="${esc(value)}"></label>`;
  const selectBox = (id, items, value, all = '') => `<select id="${id}" class="select" aria-label="${esc(all || id)}">${all ? `<option value="">${esc(all)}</option>` : ''}${Object.entries(items).map(([k, l]) => `<option value="${esc(k)}"${k === value ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const tabs = (id, items, value) => `<div class="seg-tabs" role="tablist" data-tabs="${id}">${Object.entries(items).map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === value}" data-tab="${esc(k)}">${esc(l)}</button>`).join('')}</div>`;

  /* ---------- dialogs ---------- */
  function ensureDialog() {
    let d = $('#z-dialog');
    if (d) return d;
    d = document.createElement('dialog'); d.id = 'z-dialog'; d.className = 'sheet';
    d.innerHTML = `<form method="dialog" class="sheet-form" novalidate><header class="sheet-head"><h2></h2><button type="button" class="btn ghost icon-only" data-close aria-label="إغلاق">${icon('cross', 'rot')}</button></header><div class="sheet-body"></div><p class="form-error" role="alert" hidden></p><footer class="sheet-foot"></footer></form>`;
    document.body.append(d);
    d.querySelector('[data-close]').addEventListener('click', () => d.close());
    return d;
  }
  function field(f) {
    const req = f.required ? ' required' : '';
    const v = f.value ?? '';
    const attrs = f.attrs || '';
    const hint = f.hint ? `<small>${esc(f.hint)}</small>` : '';
    let control;
    if (f.type === 'select') control = `<select name="${f.name}"${req}>${f.placeholder ? `<option value="">${esc(f.placeholder)}</option>` : ''}${Object.entries(f.options).map(([k, l]) => `<option value="${esc(k)}"${String(k) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    else if (f.type === 'textarea') control = `<textarea name="${f.name}" rows="3"${req} ${attrs}>${esc(v)}</textarea>`;
    else if (f.type === 'toggle') return `<label class="toggle ${f.wide ? 'wide' : ''}"><input type="checkbox" name="${f.name}"${v ? ' checked' : ''}><span class="switch"></span><span>${esc(f.label)}</span></label>`;
    else if (f.type === 'html') return `<div class="field ${f.wide ? 'wide' : ''}">${f.html}</div>`;
    else control = `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}"${req} ${attrs}>`;
    return `<label class="field ${f.wide ? 'wide' : ''}"><span>${esc(f.label)}${f.required ? ' <b aria-hidden="true">*</b>' : ''}</span>${control}${hint}</label>`;
  }
  /* form({title, fields, submit(values, raw) => message, remove?: {label, run}}) */
  function form({ title, fields, submit, remove, submitLabel = 'حفظ' }) {
    const d = ensureDialog();
    const f = d.querySelector('form');
    d.querySelector('h2').textContent = title;
    d.querySelector('.sheet-body').innerHTML = fields.map(field).join('');
    d.querySelector('.sheet-foot').innerHTML = `<button type="submit" class="btn primary">${icon('check')}<span>${esc(submitLabel)}</span></button><button type="button" class="btn ghost" data-cancel>إلغاء</button>` +
      (remove ? `<button type="button" class="btn danger-ghost" data-remove>${icon('trash')}<span>${esc(remove.label || 'حذف')}</span></button>` : '');
    const err = d.querySelector('.form-error'); err.hidden = true;
    d.querySelector('[data-cancel]').onclick = () => d.close();
    if (remove) d.querySelector('[data-remove]').onclick = async () => { if (await confirm(remove.confirm || 'هل تريد الحذف نهائيًا؟')) { remove.run(); d.close(); } };
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (!f.reportValidity()) return;
      const raw = new FormData(f);
      const values = {};
      for (const x of fields) if (x.name) values[x.name] = x.type === 'toggle' ? raw.has(x.name) : x.type === 'number' ? (raw.get(x.name) === '' ? null : Number(raw.get(x.name))) : x.type === 'file' ? raw.get(x.name) : String(raw.get(x.name) ?? '').trim();
      const submitBtn = f.querySelector('[type=submit]'); submitBtn.disabled = true;
      try { await submit(values, raw); d.close(); }
      catch (ex) { err.textContent = ex.message || 'تعذّر الحفظ.'; err.hidden = false; }
      finally { submitBtn.disabled = false; }
    };
    d.showModal();
    f.querySelector('input:not([type=hidden]),select,textarea')?.focus();
    return d;
  }
  function confirm(message) {
    return new Promise((resolve) => {
      const d = document.createElement('dialog'); d.className = 'sheet sheet-sm';
      d.innerHTML = `<div class="sheet-form"><div class="confirm-ic">${icon('alert')}</div><p class="confirm-text">${esc(message)}</p><footer class="sheet-foot"><button class="btn danger" data-y>نعم، تأكيد</button><button class="btn ghost" data-n>تراجع</button></footer></div>`;
      document.body.append(d);
      const done = (v) => { d.close(); d.remove(); resolve(v); };
      d.querySelector('[data-y]').onclick = () => done(true);
      d.querySelector('[data-n]').onclick = () => done(false);
      d.addEventListener('cancel', () => done(false));
      d.showModal();
    });
  }
  function toast(message, tone = '') {
    if (!message) return;
    let box = $('#z-toasts');
    if (!box) { box = Object.assign(document.createElement('div'), { id: 'z-toasts' }); box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.append(box); }
    const t = document.createElement('div'); t.className = 'toast ' + tone;
    t.innerHTML = icon(tone === 'error' ? 'alert' : 'check') + `<span>${esc(message)}</span>`;
    box.append(t);
    setTimeout(() => t.classList.add('out'), 3200); setTimeout(() => t.remove(), 3700);
  }
  /* Resize an uploaded image to a square-ish JPEG data URL (keeps storage small). */
  async function compressPhoto(file, size = 320, crop = false) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8e6) throw Error('اختر صورة JPG أو PNG أو WebP أقل من 8 ميغابايت.');
    const bmp = await createImageBitmap(file);
    try {
      const side = crop ? Math.min(bmp.width, bmp.height) : 0;
      const k = Math.min(1, size / (crop ? side : Math.max(bmp.width, bmp.height)));
      const w = Math.max(1, Math.round((crop ? side : bmp.width) * k)), h = Math.max(1, Math.round((crop ? side : bmp.height) * k));
      const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
      const x = c.getContext('2d', { alpha: false }); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
      if (crop) x.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, w, h); else x.drawImage(bmp, 0, 0, w, h);
      const out = c.toDataURL('image/jpeg', 0.78);
      if (out.length > 120000) throw Error('الصورة كبيرة، جرّب صورة أصغر.');
      return out;
    } finally { bmp.close(); }
  }
  function download(content, name, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- theme ---------- */
  const THEME = 'zain-admin-theme';
  function applyTheme(t) { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
  applyTheme(localStorage.getItem(THEME));
  const isDark = () => (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';

  /* ---------- shell ---------- */
  function start(app) {
    const { store } = app;
    document.body.innerHTML = `<a class="skip" href="#main">انتقل إلى المحتوى</a>
      <div class="shell">
        <aside class="side" id="side">
          <div class="brand"><span class="brand-mark">${icon('cross')}</span><div><strong id="brand-name"></strong><small>${esc(app.subtitle)}</small></div></div>
          <nav id="nav" aria-label="أقسام اللوحة"></nav>
          <div class="side-foot">${app.links.map((l) => `<a class="side-link" href="${l.href}">${icon(l.icon || 'external')}<span>${esc(l.label)}</span></a>`).join('')}
            <p class="storage-note">${icon('alert')}<span>${esc(store.adapterLabel)}. صدّر نسخة احتياطية بانتظام.</span></p></div>
        </aside>
        <div class="main-col">
          <header class="topbar">
            <button type="button" class="btn ghost icon-only menu-btn" id="menu" aria-label="القائمة" aria-controls="side" aria-expanded="false">${icon('menu')}</button>
            <div class="title-wrap"><p class="eyebrow" id="eyebrow"></p><h1 id="title"></h1></div>
            <div class="top-actions"><span class="today" id="today"></span><button type="button" class="btn ghost icon-only" id="theme" aria-label="تبديل الوضع الليلي"></button></div>
          </header>
          <main id="main" tabindex="-1"></main>
        </div>
      </div>`;
    const keys = Object.keys(app.pages);
    const current = () => { const k = location.hash.slice(1).split('/')[0]; return keys.includes(k) ? k : keys[0]; };
    const view = { query: '', filters: {} };
    function render(message) {
      const k = current(); const p = app.pages[k];
      $('#brand-name').textContent = store.state.settings.name;
      $('#title').textContent = p.title?.(store.state) || p.label;
      $('#eyebrow').textContent = p.eyebrow || app.subtitle;
      $('#today').textContent = new Date().toLocaleDateString('ar-EG', { timeZone: 'Asia/Gaza', weekday: 'long', day: 'numeric', month: 'long' });
      $('#theme').innerHTML = icon(isDark() ? 'sun' : 'moon');
      $('#nav').innerHTML = keys.filter((key) => !app.pages[key].hidden).map((key) => {
        const pg = app.pages[key]; const badge = pg.badge?.(store.state);
        return (pg.group ? `<p class="nav-group">${esc(pg.group)}</p>` : '') + `<a href="#${key}"${key === k || key === p.parent ? ' aria-current="page"' : ''}>${icon(pg.icon)}<span>${esc(pg.label)}</span>${badge ? `<b class="nav-badge">${esc(badge)}</b>` : ''}</a>`;
      }).join('');
      const main = $('#main');
      const focused = document.activeElement?.id; const caret = document.activeElement?.selectionStart;
      main.innerHTML = p.render(store.state, view);
      Z.charts.mount(main);
      p.after?.(main, store.state, view);
      if (focused && main.querySelector('#' + focused)) { const el = $('#' + focused); el.focus(); if (caret != null && el.setSelectionRange) el.setSelectionRange(caret, caret); }
      if (message) toast(message);
    }
    app.render = render;
    store.subscribe((_, msg) => render(msg));
    window.addEventListener('hashchange', () => { view.query = ''; view.filters = {}; render(); $('#side').classList.remove('open'); $('#main').focus({ preventScroll: true }); scrollTo(0, 0); });
    $('#theme').addEventListener('click', () => { const t = isDark() ? 'light' : 'dark'; localStorage.setItem(THEME, t); applyTheme(t); render(); });
    const closeMenu = () => { $('#side').classList.remove('open'); $('#menu').setAttribute('aria-expanded', 'false'); };
    $('#menu').addEventListener('click', (e) => { e.stopPropagation(); const o = $('#side').classList.toggle('open'); $('#menu').setAttribute('aria-expanded', o); });
    document.addEventListener('click', (e) => { if ($('#side').classList.contains('open') && !e.target.closest('#side')) closeMenu(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
    const main = $('#main');
    main.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('[data-tab]');
      if (tabBtn) { view.filters[tabBtn.parentElement.dataset.tabs] = tabBtn.dataset.tab; render(); return; }
      const t = e.target.closest('[data-act]'); if (!t) return;
      const fn = app.actions[t.dataset.act];
      if (fn) Promise.resolve(fn(t.dataset.id, t)).catch((ex) => toast(ex.message, 'error'));
    });
    main.addEventListener('input', (e) => {
      if (e.target.matches('input[type=search]')) { view.query = e.target.value; render(); }
      else if (e.target.matches('select.select')) { view.filters[e.target.id] = e.target.value; render(); }
    });
    main.addEventListener('change', (e) => { const fn = app.onChange?.[e.target.id]; if (fn) Promise.resolve(fn(e.target)).catch((ex) => toast(ex.message, 'error')); });
    render();
    if (app.assistant && Z.assistant) Z.assistant.mount({ ...app.assistant, context: () => app.assistant.context(store.state) });
    if (store.loadError) toast(store.loadError, 'error');
    return view;
  }

  Z.ui = { $, esc, icon, pill, btn, iconBtn, card, kpi, table, toolbar, search, selectBox, tabs, form, confirm, toast, download, compressPhoto, start, money, compactMoney, num, dateTime, slot };
})(window.Zain);
