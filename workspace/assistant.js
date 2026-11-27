/* The full dashboard summary stays local. Gemini gets selected aggregates and chat text. */
'use strict';
(function (Z) {
  const { esc, icon, toast } = Z.ui;
  const CFG = 'zain-ai-settings';
  const HIST = 'zain-ai-history';
  const MODELS = { 'gemini-3.8-flash': 'Gemini 3.8 Flash (سريع، مقترح)', 'gemini-3.6-flash': 'Gemini 3.6 Flash', 'gemini-3.5-flash-lite': 'Gemini 3.5 Flash-Lite (الأوفر)' };
  const TONES = { short: 'مختصر ومباشر', detailed: 'مفصّل مع خطوات', friendly: 'ودّي بلهجة بسيطة' };

  // Only preferences live in the browser. The Gemini key is a server secret.
  function load() {
    const base = { model: 'gemini-3.8-flash', tone: 'short' };
    try { const saved = JSON.parse(localStorage.getItem(CFG) || '{}'); if (MODELS[saved.model]) base.model = saved.model; if (TONES[saved.tone]) base.tone = saved.tone; } catch { /* defaults */ }
    localStorage.removeItem(CFG + '-key'); sessionStorage.removeItem(CFG + '-key'); // drop keys saved by older versions
    return base;
  }
  const save = (c) => localStorage.setItem(CFG, JSON.stringify({ model: c.model, tone: c.tone }));

  function localAnswer(question, data) {
    const text = question.replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآ]/g,'ا').trim();
    const branches = data.branches || [];
    if (data.managerAgenda && /مواعيدي|مواعيد المدير/.test(text)) {
      if (!/غد|بكر|امس|اسبوع|شهر|\d/.test(text)) {
        return 'مواعيد المدير ليوم ' + data.calendar.day + '\n' + (data.managerAgenda.map(a=>a.start.slice(11) + ' · ' + a.title).join('\n') || 'لا توجد مواعيد مسجلة.');
      }
    }
    if (/^(مين|من) (.* )?(بالدوام|بالشغل|مداوم|على راس عمله)/.test(text)) {
      return branches.map((branch) => '• ' + branch.name + ': ' +
        (branch.onDutyNow?.length ? branch.onDutyNow.join('، ') : 'ما حدا مسجّل دخول')).join('\n') || 'ما في فروع مسجّلة.';
    }
    if (/^(كم|عدد) (عدد )?(ال)?(موظف|صيدلي)(ين|ون|ة|ات)?[؟?]?$/.test(text)) {
      const staff = branches.reduce((sum,branch) => sum + (branch.staff || 0),0);
      return 'عدد الموظفين النشطين المسجّلين بالفروع: ' + staff + '.';
    }
    if (/^(كم|عدد|شو|ما) (عدد )?(ال)?طلب(ات)? (ال)?مفتوح(ة)?( بكل فرع)?[؟?]?$/.test(text)) {
      return branches.map((branch) => '• ' + branch.name + ': ' + branch.openOrders + ' طلب مفتوح').join('\n') || 'ما في طلبات مسجّلة.';
    }
    if (/^(شو|ما هي|اعرض|ورجيني) (ال)?(نواقص|مخزون منخفض|منتجات ناقصة)( المخزون)?[؟?]?$/.test(text)) {
      return data.lowStock?.length ? data.lowStock.map((item) => '• ' + item.name + ': ' + item.stock).join('\n') :
        'ما في منتجات تحت حد التنبيه ضمن الكميات المسجّلة.';
    }
    return null;
  }

  function remoteContext(data) {
    if (data.test === true) return { test: true };
    return {
      branches: (data.branches || []).map((branch,index) => ({
        branch: index + 1,
        staff: branch.staff,
        onDuty: branch.onDutyNow?.length || 0,
        openOrders: branch.openOrders,
        salesToday: branch.salesToday
      })),
      lowStockCount: data.lowStock?.length || 0,
      currency: data.currency,
      calendar: data.calendar
    };
  }

  // Same-origin endpoint behind the dashboard's Cloudflare Access login.
  const ENDPOINT = new URL(location.pathname.replace(/(?:index\.html|\/$)/, '').replace(/\/$/, '') + '/api/assistant', location.origin).href;
  async function ask(c, context, history, question) {
    const r = await fetch(ENDPOINT, {
      method: 'POST', credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: c.model, tone: c.tone, context: remoteContext(context), history: history.slice(-8), question })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(typeof data.error === 'string' ? data.error : r.status === 404 ? 'خدمة المساعد غير منشورة على السيرفر.' : 'تعذّر الحصول على رد من المساعد (' + r.status + ').');
    if (typeof data.answer !== 'string' || !data.answer.trim()) throw Error('ما رجع رد. جرّب تعيد صياغة السؤال.');
    return data.answer.trim();
  }

  // Minimal, safe formatting: escape first, then **bold** and bullet lines.
  const format = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^\s*[-*•]\s+(.*)$/gm, '<span class="ai-li">$1</span>');

  function mount({ context, suggestions = [], commands = [], operate, title = 'المساعد الذكي' }) {
    let cfg = load();
    let history = [];
    try { history = JSON.parse(sessionStorage.getItem(HIST) || '[]'); } catch { history = []; }

    const fab = Object.assign(document.createElement('button'), { type: 'button', className: 'ai-fab', id: 'ai-fab' });
    fab.setAttribute('aria-label', 'فتح ' + title); fab.setAttribute('aria-expanded', 'false'); fab.setAttribute('aria-controls', 'ai-panel');
    fab.innerHTML = icon('sparkles') + '<span>اسأل المساعد</span>';
    const panel = document.createElement('section');
    panel.className = 'ai-panel'; panel.id = 'ai-panel'; panel.hidden = true; panel.setAttribute('aria-label', title);
    panel.innerHTML = `
      <header class="ai-head"><span class="ai-badge">${icon('sparkles')}</span><div><h2>${esc(title)}</h2><p id="ai-sub"></p></div>
        <button type="button" class="btn ghost icon-only" data-ai="settings" aria-label="إعدادات المساعد" aria-controls="ai-settings" aria-expanded="false">${icon('settings')}</button>
        <button type="button" class="btn ghost icon-only" data-ai="clear" aria-label="محادثة جديدة">${icon('history')}</button>
        <button type="button" class="btn ghost icon-only" data-ai="close" aria-label="إغلاق">${icon('cross', 'rot')}</button></header>
      <div class="ai-settings" id="ai-settings" hidden>
        <div class="ai-settings-heading"><h3>إعدادات المساعد</h3><button type="button" class="btn sm" data-ai="back">العودة للمحادثة</button></div>
        <label class="field"><span>النموذج</span><select id="ai-model">${Object.entries(MODELS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
        <label class="field"><span>طريقة الرد</span><select id="ai-tone">${Object.entries(TONES).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
        <p class="ai-note">${icon('alert')}<span>مفتاح Gemini محفوظ على السيرفر. Gemini يستقبل ملخص أرقام الفروع والنص المكتوب في المحادثة، فتجنّب كتابة أسماء أو معلومات شخصية.</span></p>
        <div class="ai-settings-actions"><button type="button" class="btn primary sm" data-ai="save">${icon('check')}<span>حفظ</span></button>
          <button type="button" class="btn sm" data-ai="test">تجربة الاتصال</button></div>
        <p id="ai-settings-status" class="ai-settings-status" role="status"></p>
      </div>
      <div class="ai-log" id="ai-log" role="log" aria-live="polite"></div>
      <div class="ai-chips" id="ai-chips"></div>
      <form class="ai-form" id="ai-form"><textarea id="ai-q" rows="1" maxlength="600" placeholder="اكتب سؤالك…" aria-label="سؤالك"></textarea>
        <button class="btn primary icon-only" type="submit" aria-label="إرسال">${icon('arrow')}</button></form>`;
    document.body.append(fab, panel);
    const $ = (s) => panel.querySelector(s);
    const log = $('#ai-log');

    function bubble(text, who, cls = '') {
      const p = document.createElement('div'); p.className = 'ai-msg ' + who + ' ' + cls;
      p.innerHTML = who === 'bot' ? format(text) : esc(text);
      log.append(p); log.scrollTop = log.scrollHeight; return p;
    }
    function status() { $('#ai-sub').textContent = MODELS[cfg.model]; }
    function renderLog() {
      log.innerHTML = '';
      bubble('أهلين! اسألني عن الطلبات أو المخزون أو الموظفين، وبجاوبك من بيانات اللوحة.', 'bot');
      history.forEach((m) => bubble(m.text, m.role === 'user' ? 'me' : 'bot'));
      $('#ai-chips').innerHTML = [...(commands.length ? ['إجراءات اللوحة'] : []), ...suggestions].map((t) => `<button type="button" class="chip" data-q="${esc(t)}">${esc(t)}</button>`).join('');
    }
    function fillSettings() {
      $('#ai-model').value = MODELS[cfg.model] ? cfg.model : 'gemini-3.8-flash';
      $('#ai-tone').value = cfg.tone;
    }
    const readSettings = () => ({ model: $('#ai-model').value, tone: $('#ai-tone').value });
    function showSettings(visible, focus = true) {
      if (visible) fillSettings();
      $('#ai-settings-status').textContent = '';
      $('#ai-settings').hidden = !visible;
      $('[data-ai="settings"]').setAttribute('aria-expanded',String(visible));
      panel.toggleAttribute('data-settings-open',visible);
      if (focus) $(visible ? '#ai-model' : '#ai-q').focus();
    }
    const open = (v) => {
      panel.hidden = !v; fab.setAttribute('aria-expanded', String(v)); fab.classList.toggle('on', v);
      if (v) { status(); renderLog(); showSettings(false,matchMedia('(pointer: fine)').matches); }
      else fab.focus();
    };
    function choose(label, choices) {
      const message = bubble(label, 'bot');
      for (const choice of choices) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'chip'; button.textContent = choice.label;
        button.onclick = () => {
          message.querySelectorAll('button').forEach(b => { b.disabled = true; });
          try { choice.run(); } catch (e) { bubble(e.message,'bot','error'); }
        };
        message.append(button);
      }
      log.scrollTop = log.scrollHeight;
    }
    function dashboardCommand(question) {
      const normalize = value => value.replace(/[أإآ]/g,'ا').replace(/[ًٌٍَُِّْ]/g,'').trim();
      const query = normalize(question);
      function select(command, filter = '') {
        const records = command.records().filter(r => normalize(r.label).includes(normalize(filter)));
        const choices = records.slice(0,30).map(r => ({label:r.label, run:()=>command.edit(r.id)}));
        if (!filter) choices.unshift({label:'إضافة سجل',run:()=>command.edit()});
        choose(records.length > 30 ? 'أول ٣٠ نتيجة. لتضييق البحث اكتب «'+command.label+' اسم السجل».' :
          choices.length ? 'اختر السجل، ثم راجع التفاصيل واضغط حفظ.' : 'ما لقيت سجل مطابق.',choices);
      }
      if (query === 'اجراءات اللوحة') {
        choose('شو بدك تدير؟',commands.map(c=>({label:c.label,run:()=>select(c)}))); return true;
      }
      for (const c of commands) {
        if (c.create.test(query)) { c.edit(); return true; }
        const prefix = normalize(c.label);
        if (query === prefix || query.startsWith(prefix+' ')) {select(c,query.slice(prefix.length).trim()); return true;}
      }
      return false;
    }
    async function send(q) {
      q = q.trim(); if (!q) return;
      const btn = $('#ai-form [type=submit]'); if (btn.disabled) return;
      btn.disabled = true; $('#ai-q').value = '';
      bubble(q, 'me'); const wait = bubble('جاري التفكير…', 'bot', 'typing');
      try {
        if (operate?.(q, choose, text => bubble(text,'bot'))) { wait.remove(); return; }
        if (commands.length && dashboardCommand(q)) {wait.remove(); return;}
        const snapshot = context();
        const local = localAnswer(q,snapshot);
        if (local !== null) {
          wait.remove();
          bubble('من بيانات اللوحة:\n' + local,'bot');
          return;
        }
        const answer = await ask(cfg, snapshot, history, q);
        wait.remove(); bubble(answer, 'bot');
        history = [...history, { role: 'user', text: q }, { role: 'model', text: answer.slice(0, 2000) }].slice(-12);
        sessionStorage.setItem(HIST, JSON.stringify(history));
      } catch (e) {
        wait.remove(); bubble(e.name === 'TimeoutError' ? 'الرد تأخر كثير. جرّب كمان مرة.' : e instanceof TypeError ? 'تعذّر الاتصال بالسيرفر. تأكد من الإنترنت.' : e.message, 'bot', 'error');
        $('#ai-q').value = q;
      } finally { btn.disabled = false; }
    }

    fab.addEventListener('click', () => open(panel.hidden));
    panel.addEventListener('click', async (e) => {
      const chip = e.target.closest('[data-q]'); if (chip) { send(chip.dataset.q); return; }
      const a = e.target.closest('[data-ai]')?.dataset.ai; if (!a) return;
      if (a === 'close') open(false);
      else if (a === 'clear') { history = []; sessionStorage.removeItem(HIST); renderLog(); }
      else if (a === 'settings') showSettings($('#ai-settings').hidden);
      else if (a === 'back') showSettings(false);
      else if (a === 'save' || a === 'test') {
        try {
          const next = readSettings();
          if (a === 'test') {
            const b = e.target.closest('button'); b.disabled = true;
            const result = $('#ai-settings-status');
            result.textContent = 'جارٍ اختبار الاتصال…';
            try { await ask(next, { test: true }, [], 'رد بكلمة واحدة: تمام'); result.textContent = 'الاتصال شغّال ✓'; } finally { b.disabled = false; }
            return;
          }
          cfg = next; save(cfg); status(); showSettings(false); renderLog(); toast('حُفظت إعدادات المساعد');
        } catch (ex) { $('#ai-settings-status').textContent = ex.message; }
      }
    });
    $('#ai-form').addEventListener('submit', (e) => { e.preventDefault(); send($('#ai-q').value); });
    $('#ai-q').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e.target.value); } });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) open(false); });
    return { open };
  }

  Z.assistant = { mount };
})(window.Zain);
