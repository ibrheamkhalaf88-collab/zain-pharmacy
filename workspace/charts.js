/* Zain admin: charts. Dependency-free SVG/HTML charts.
   Rules: one axis, thin marks, rounded data ends, recessive grid,
   values in text ink (never series colour), hover tooltip on every chart. */
'use strict';
(function (Z) {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('ar-EG');
  const num = (v) => nf.format(v);
  function niceMax(v) {
    if (!(v > 0)) return 4;
    const p = 10 ** Math.floor(Math.log10(v));
    for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }
  const shortDay = (key) => { const [, m, d] = key.split('-'); return num(+d) + '/' + num(+m); };
  const longDay = (key) => new Date(key + 'T12:00:00').toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });

  /* Line + soft area over days. points: [{x:'YYYY-MM-DD', y:number}] */
  function line(points, { name = '', format = num, height = 220 } = {}) {
    const W = 640, H = height, L = 46, R = 14, T = 14, B = 30;
    const max = niceMax(Math.max(...points.map((p) => p.y), 0));
    const X = (i) => L + (points.length < 2 ? 0 : i * (W - L - R) / (points.length - 1));
    const Y = (v) => T + (H - T - B) * (1 - v / max);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => max * t);
    const grid = ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}" class="${t === 0 ? 'axis' : 'grid'}"/>` +
      `<text x="${L - 8}" y="${Y(t) + 4}" class="tick" text-anchor="end">${esc(format(t, true))}</text>`).join('');
    const every = Math.max(1, Math.ceil(points.length / 7));
    const xl = points.map((p, i) => (i % every === 0 || i === points.length - 1) && (i === points.length - 1 || points.length - 1 - i >= every / 2)
      ? `<text x="${X(i)}" y="${H - 8}" class="tick" text-anchor="middle">${shortDay(p.x)}</text>` : '').join('');
    const path = points.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ');
    const area = path + ` L${X(points.length - 1)} ${Y(0)} L${X(0)} ${Y(0)} Z`;
    const last = points[points.length - 1];
    const payload = esc(JSON.stringify({ pts: points.map((p) => [p.x, p.y]), L, R, T, B, W, H, max, name }));
    return `<figure class="chart chart-line" data-line="${payload}" dir="ltr">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(name)}: آخر قيمة ${esc(format(last?.y ?? 0))}">
        ${grid}${xl}
        <path d="${area}" class="area"/><path d="${path}" class="stroke"/>
        <circle cx="${X(points.length - 1)}" cy="${Y(last?.y ?? 0)}" r="4.5" class="end"/>
        <g class="hover" hidden><line class="cross" y1="${T}" y2="${H - B}"/><circle r="5" class="dot"/></g>
        <rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}"/>
      </svg><div class="tip" hidden></div></figure>`;
  }

  /* Horizontal bars, one measure. items: [{label, value, color?, hint?}] */
  function bars(items, { format = num, empty = 'لا توجد بيانات بعد.' } = {}) {
    if (!items.length || items.every((i) => !i.value)) return `<p class="chart-empty">${esc(empty)}</p>`;
    const max = Math.max(...items.map((i) => i.value));
    return `<div class="chart bars" role="list">` + items.map((i) =>
      `<div class="bar-row" role="listitem" data-tip="${esc(i.label + ': ' + format(i.value) + (i.hint ? ' · ' + i.hint : ''))}">
        <span class="bar-label">${i.color ? `<i class="key" style="--c:${i.color}"></i>` : ''}${esc(i.label)}</span>
        <span class="bar-track"><span class="bar-fill" style="--w:${max ? (i.value / max * 100).toFixed(1) : 0}%;${i.color ? '--c:' + i.color : ''}"></span></span>
        <strong class="bar-value">${esc(format(i.value))}</strong></div>`).join('') + `</div>`;
  }

  /* Part-to-whole as one segmented bar + legend with values. */
  function segmented(items, { format = num, empty = 'لا توجد بيانات بعد.' } = {}) {
    const total = items.reduce((s, i) => s + i.value, 0);
    if (!total) return `<p class="chart-empty">${esc(empty)}</p>`;
    const segs = items.filter((i) => i.value).map((i) =>
      `<span class="seg" style="--w:${(i.value / total * 100).toFixed(2)}%;--c:${i.color}" data-tip="${esc(i.label + ': ' + format(i.value) + ' (' + Math.round(i.value / total * 100) + '٪)')}"></span>`).join('');
    const legend = items.map((i) => `<li><i class="key" style="--c:${i.color}"></i><span>${esc(i.label)}</span><strong>${esc(format(i.value))}</strong><small>${Math.round(i.value / total * 100)}٪</small></li>`).join('');
    return `<div class="chart segmented"><div class="seg-bar" role="img" aria-label="${esc(items.map((i) => i.label + ' ' + i.value).join('، '))}">${segs}</div><ul class="legend">${legend}</ul></div>`;
  }

  /* Day timeline (shift coverage). rows: [{label, segments:[{from:'HH:MM', to:'HH:MM', title, color}]}] */
  function timeline(rows, { from = 7, to = 24, empty = 'لا توجد مناوبات اليوم.' } = {}) {
    if (!rows.some((r) => r.segments.length)) return `<p class="chart-empty">${esc(empty)}</p>`;
    const span = to - from;
    const pos = (t) => { const [h, m] = t.split(':').map(Number); return Math.min(100, Math.max(0, ((h + m / 60) - from) / span * 100)); };
    const hours = []; for (let h = from; h <= to; h += 3) hours.push(`<span style="--x:${(h - from) / span * 100}%">${num(h % 24)}:٠٠</span>`);
    const now = new Date(); const nowPos = pos(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Gaza', hour: '2-digit', minute: '2-digit', hour12: false }).format(now));
    // Overlapping segments get their own lane so none is hidden.
    const laned = (segs) => {
      const ends = [];
      return [...segs].sort((a, b) => a.from.localeCompare(b.from)).map((s) => {
        let lane = ends.findIndex((e) => e <= s.from);
        if (lane < 0) lane = ends.length;
        ends[lane] = s.to;
        return { ...s, lane };
      });
    };
    return `<div class="chart timeline" dir="ltr"><div class="tl-hours">${hours.join('')}</div>` + rows.map((r) => {
      const segs = laned(r.segments); const lanes = Math.max(1, ...segs.map((s) => s.lane + 1));
      return `<div class="tl-row"><span class="tl-label" dir="rtl">${esc(r.label)}</span><span class="tl-track" style="height:${lanes * 26 + 4}px">${segs.map((s) =>
        `<span class="tl-seg" style="--a:${pos(s.from)}%;--b:${pos(s.to)}%;--c:${s.color};top:${s.lane * 26 + 3}px;height:24px" data-tip="${esc(s.title + ' · ' + s.from + '–' + s.to)}">${esc(s.short || '')}</span>`).join('')}
        ${nowPos > 0 && nowPos < 100 ? `<span class="tl-now" style="--x:${nowPos}%"></span>` : ''}</span></div>`;
    }).join('') + `</div>`;
  }

  /* Vertical columns with the value printed on top: the easiest chart to read.
     items: [{label, value, note?, hot?}] — hot marks today / the highlighted column. */
  function columns(items, { format = num, empty = 'لا توجد بيانات بعد.' } = {}) {
    if (!items.length || items.every((i) => !i.value)) return `<p class="chart-empty">${esc(empty)}</p>`;
    const max = Math.max(...items.map((i) => i.value));
    return `<div class="chart cols" role="list">${items.map((i) =>
      `<div class="col${i.hot ? ' hot' : ''}" role="listitem" aria-label="${esc(i.label + ': ' + format(i.value))}">
        <strong class="col-value">${esc(format(i.value))}</strong>
        <span class="col-track"><span class="col-fill" style="--h:${max ? Math.max(3, i.value / max * 100) : 0}%"></span></span>
        <span class="col-label">${esc(i.label)}</span>${i.note ? `<small class="col-note">${esc(i.note)}</small>` : ''}</div>`).join('')}</div>`;
  }

  /* Small meter for a single ratio (e.g. stock vs threshold). */
  const meter = (value, max, tone = '') => `<span class="meter ${tone}" role="img" aria-label="${num(value)} من ${num(max)}"><span style="--w:${Math.min(100, max ? value / max * 100 : 0)}%"></span></span>`;

  /* ---------- interaction: one shared tooltip ---------- */
  let tip;
  function showTip(text, x, y) {
    tip = tip || Object.assign(document.createElement('div'), { className: 'float-tip', role: 'tooltip' });
    if (!tip.isConnected) document.body.append(tip);
    tip.textContent = text; tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.min(innerWidth - r.width - 8, Math.max(8, x - r.width / 2)) + 'px';
    tip.style.top = Math.max(8, y - r.height - 12) + 'px';
  }
  const hideTip = () => { if (tip) tip.hidden = true; };
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (t) { const r = t.getBoundingClientRect(); showTip(t.dataset.tip, r.left + r.width / 2, r.top); } else hideTip();
  });
  document.addEventListener('scroll', hideTip, true);

  function mount(root) {
    root.querySelectorAll('[data-line]').forEach((fig) => {
      const d = JSON.parse(fig.dataset.line);
      const svg = fig.querySelector('svg'); const g = fig.querySelector('.hover'); const box = fig.querySelector('.tip');
      const fmt = fig.closest('[data-format="money"]') ? Z.ui.money : num;
      const n = d.pts.length;
      const at = (i) => [d.L + (n < 2 ? 0 : i * (d.W - d.L - d.R) / (n - 1)), d.T + (d.H - d.T - d.B) * (1 - d.pts[i][1] / d.max)];
      fig.querySelector('.hit').addEventListener('pointermove', (e) => {
        const r = svg.getBoundingClientRect();
        const vx = (e.clientX - r.left) / r.width * d.W;
        const i = Math.max(0, Math.min(n - 1, Math.round((vx - d.L) / ((d.W - d.L - d.R) / Math.max(1, n - 1)))));
        const [x, y] = at(i);
        g.hidden = false;
        g.querySelector('.cross').setAttribute('x1', x); g.querySelector('.cross').setAttribute('x2', x);
        g.querySelector('.dot').setAttribute('cx', x); g.querySelector('.dot').setAttribute('cy', y);
        box.hidden = false; box.dir = 'rtl';
        box.innerHTML = `<small>${esc(longDay(d.pts[i][0]))}</small><strong>${esc(fmt(d.pts[i][1]))}</strong>`;
        const px = x / d.W * r.width;
        box.style.left = Math.min(r.width - box.offsetWidth, Math.max(0, px - box.offsetWidth / 2)) + 'px';
        box.style.top = Math.max(0, y / d.H * r.height - box.offsetHeight - 14) + 'px';
      });
      fig.querySelector('.hit').addEventListener('pointerleave', () => { g.hidden = true; box.hidden = true; });
    });
  }

  /* Palette: categorical slots in fixed order (validated reference palette), status reserved. */
  const series = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)'];
  const status = { good: 'var(--good)', warning: 'var(--warning)', critical: 'var(--critical)', neutral: 'var(--neutral)', info: 'var(--info)' };

  Z.charts = { line, bars, columns, segmented, timeline, meter, mount, series, status, niceMax, shortDay, longDay };
})(window.Zain);
