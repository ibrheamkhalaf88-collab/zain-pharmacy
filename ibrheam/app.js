/* Branches & staff dashboard (branches, employees, attendance, shifts). Built on admin/ core. */
'use strict';
(function (Z) {
  const { ui, q, enums, charts } = Z;
  const { esc, icon, pill, btn, iconBtn, card, kpi, table, toolbar, search, selectBox, tabs, num, money, slot } = ui;
  const store = Z.data.createStore(Z.data.LocalAdapter, window.dashboardSeed);
  const id = () => crypto.randomUUID();
  const s = () => store.state;
  const branchOpts = () => Object.fromEntries(s().branches.map((b) => [b.id, b.name]));
  const roleColor = { pharmacist: charts.series[0], assistant: charts.series[2], cashier: charts.series[3], manager: charts.series[5], delivery: charts.series[1] };
  const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');
  const matches = (t, query) => !query || t.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const dayOffset = (n) => q.dayKey(new Date(Date.now() + n * 864e5));
  const nowSlot = () => { const p = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Gaza', dateStyle: 'short', timeStyle: 'short' }).format(new Date()); return p.replace(' ', 'T'); };
  const onShiftNow = (st) => { const n = nowSlot(); return st.shifts.filter((x) => x.start <= n && x.end > n); };
  const shortName = (n) => n.split(/\s+/)[0];

  /* Shift segments for one day, clipped to that day. */
  function daySegments(st, day, filter = () => true) {
    return q.shiftsOn(st, day).filter(filter).map((x) => {
      const emp = st.employees.find((e) => e.id === x.employee);
      return { from: x.start.slice(0, 10) < day ? '00:00' : x.start.slice(11), to: x.end.slice(0, 10) > day ? '24:00' : x.end.slice(11),
        title: q.employeeName(st, x) + (emp ? ' · ' + enums.roles[emp.role] : ''), short: shortName(q.employeeName(st, x)), color: roleColor[emp?.role] || 'var(--neutral)' };
    });
  }
  const roleLegend = () => `<ul class="legend" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr));display:grid">${Object.entries(enums.roles).map(([k, l]) =>
    `<li style="grid-template-columns:auto 1fr"><i class="key" style="--c:${roleColor[k]}"></i><span>${esc(l)}</span></li>`).join('')}</ul>`;

  const currentBranch = (st) => st.branches.find((b) => b.id === decodeURIComponent(location.hash.split('/')[1] || ''));
  function calendarDay() {
    const day = location.hash.split('/')[1] || '';
    const timestamp = Date.parse(day + 'T00:00:00Z');
    return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(timestamp) &&
      new Date(timestamp).toISOString().startsWith(day) ? day : q.today();
  }
  const scheduled = (st, day) => st.shifts.filter(x => x.start < day + 'T24:00' && x.end > day + 'T00:00');
  const payTypes = { salary: 'راتب مستحق', advance: 'سلفة مدفوعة', payment: 'دفعة راتب' };
  const payrollCurrency = new Intl.NumberFormat('ar-EG', {style:'currency',currency:'ILS',minimumFractionDigits:2});
  const payrollMonth = () => /^#payroll\/\d{4}-(0[1-9]|1[0-2])$/.test(location.hash) ? location.hash.split('/')[1] : q.today().slice(0,7);
  const agendaOn = (st, day) => st.agenda.filter(a => a.start < day + 'T24:00' && a.end > day + 'T00:00').sort((a,b) => a.start.localeCompare(b.start));
  const pages = {
    home: { label: 'نظرة عامة', icon: 'home', eyebrow: 'تشغيل الفروع اليوم', render(st) {
      const today = q.today();
      const activeStaff = st.employees.filter((e) => e.active !== false);
      const openOrders = (b) => st.orders.filter((o) => o.branch === b && q.isOpen(o)).length;
      const present = (b) => st.attendance.filter((a) => !a.out && a.branch === b).map((a) => st.employees.find((e) => e.id === a.employee)).filter(Boolean);
      const chip = (e) => `<span class="face-chip"><span class="mini">${e.photo ? `<img src="${esc(e.photo)}" alt="">` : esc(initials(e.name))}</span>${esc(e.name)} <small class="muted">${esc(enums.roles[e.role])}</small></span>`;
      const rowsNow = st.branches.map((b, i) => { const ps = present(b.id); const n = openOrders(b.id);
        return `<div class="branch-now-row"><h3><i class="key" style="--c:${charts.series[i % 6]}"></i>${esc(b.name)}</h3>${pill(num(n) + ' طلب مفتوح', n ? 'warn' : 'plain')}
          <div class="faces">${ps.length ? ps.map(chip).join('') : '<span class="face-chip none">ما حدا مسجّل دخول</span>'}</div></div>`; }).join('');
      const presentAll = st.attendance.filter((a) => !a.out).length;
      const emptyBranches = st.branches.filter((b) => !present(b.id).length);
      const open = st.orders.filter(q.isOpen).length;
      const days = q.lastDays(7);
      const hoursOn = (d) => { // overlap of each attendance with that Gaza day
        const d0 = Date.parse(d + 'T00:00:00+02:00'), d1 = d0 + 864e5;
        return st.attendance.reduce((s, a) => s + Math.max(0, Math.min(d1, a.out ? Date.parse(a.out) : Date.now()) - Math.max(d0, Date.parse(a.in))) / 36e5, 0); };
      const hourCols = days.map((d) => ({ label: d === today ? 'اليوم' : new Date(d + 'T12:00:00').toLocaleDateString('ar-EG', { weekday: 'short' }), hot: d === today, value: Math.round(hoursOn(d)) }));
      const ordersBy = st.branches.map((b, i) => ({ label: b.name, color: charts.series[i % 6], value: openOrders(b.id) })).sort((a, b) => b.value - a.value);
      const lines = [
        { ic: 'users', html: `في <b>${num(presentAll)}</b> موظفين بالدوام الآن من أصل ${num(activeStaff.length)}.` },
        { ic: 'alert', tone: emptyBranches.length ? 'bad' : '', html: emptyBranches.length ? `فروع ما فيها حدا الآن: <b>${emptyBranches.map((b) => esc(b.name)).join('، ')}</b>.` : 'كل الفروع فيها موظفين الآن.' },
        { ic: 'clock', html: `الفريق اشتغل اليوم <b>${num(Math.round(hoursOn(today)))}</b> ساعة لحد هلّأ.` },
        ordersBy[0]?.value ? { ic: 'receipt', tone: 'warn', html: `أكثر فرع عليه طلبات مفتوحة: <b>${esc(ordersBy[0].label)}</b> (${num(ordersBy[0].value)}).` } : { ic: 'receipt', html: 'ما في طلبات مفتوحة بأي فرع.' }
      ];
      return `<div class="kpis">
        ${kpi({ label: 'بالدوام الآن', value: num(presentAll), ic: 'clock', href: '#employees', hint: 'حسب تسجيل الدخول' })}
        ${kpi({ label: 'ساعات العمل اليوم', value: num(Math.round(hoursOn(today))), ic: 'trend', href: '#employees', hint: 'مجموع ساعات الفريق' })}
        ${kpi({ label: 'فروع بلا موظف الآن', value: num(emptyBranches.length), ic: 'alert', tone: emptyBranches.length ? 'bad' : '', href: '#employees', hint: emptyBranches.length ? 'تحتاج متابعة' : 'كله تمام' })}
        ${kpi({ label: 'طلبات مفتوحة', value: num(open), ic: 'receipt', href: '../omar/index.html#orders', hint: 'في لوحة المتجر' })}
      </div>
      <div class="grid cols-2">
        ${card('مين بالدوام الآن؟', `<div class="branch-now">${rowsNow}</div>`, { sub: 'كل فرع ومين موجود فيه هلّأ', actions: `<a class="btn sm ghost" href="#employees">الموظفين</a>` })}
        ${card('الخلاصة', `<div class="insights">${lines.map((l) => `<p class="insight ${l.tone || ''}"><span class="kpi-icon">${icon(l.ic)}</span><span>${l.html}</span></p>`).join('')}</div>`, { sub: 'أهم ما يلزمك تعرفه الآن' })}
        ${card('كم ساعة اشتغل الفريق كل يوم؟', charts.columns(hourCols, { format: (v) => num(v) + ' س', empty: 'ما في حضور مسجّل هالأسبوع.' }), { sub: 'آخر ٧ أيام · العمود الغامق هو اليوم' })}
        ${card('الطلبات المفتوحة في كل فرع', charts.bars(ordersBy, { empty: 'ما في طلبات مفتوحة.' }), { sub: 'جديدة أو قيد التجهيز', actions: `<a class="btn sm ghost" href="../omar/index.html#orders">الطلبات</a>` })}
      </div>`;
    } },

    branches: { label: 'الفروع', icon: 'store', group: 'الإدارة', eyebrow: 'بيانات الفروع ونشاطها', render(st) {
      const today = q.today();
      return toolbar(`<p class="muted">${num(st.branches.length)} فروع</p>`, btn('branch', 'إضافة فرع', { tone: 'primary', ic: 'plus' })) +
        `<div class="grid cols-2">${st.branches.map((b, i) => card(b.name, `<a class="branch-cover${b.photos?.length ? '' : ' empty-cover'}" href="#branch/${encodeURIComponent(b.id)}" data-photo-wrap>${b.photos?.length ? `<img data-photo="${esc(b.photos[0])}" alt="${esc(b.name)}"><span>${icon('image')}${num(b.photos.length)} صورة</span>` : `${icon('image')}<span>أضف صور للفرع</span>`}</a><div class="facts">
          <div>${icon('store')}<span>${esc(b.city)} · ${esc(b.address)}</span></div>
          <div>${icon('clock')}<bdi>${esc(b.hours)}</bdi></div><div>${icon('chat')}<bdi dir="ltr">${esc(b.phone)}</bdi></div></div>
          <div class="mini-stats"><div><strong>${num(st.employees.filter((e) => e.branch === b.id && e.active !== false).length)}</strong><small>موظف</small></div>
          <div><strong>${num(st.attendance.filter((a) => !a.out && a.branch === b.id).length)}</strong><small>بالدوام الآن</small></div>
          <div><strong>${num(st.orders.filter((o) => o.branch === b.id && q.isOpen(o)).length)}</strong><small>طلب مفتوح</small></div></div><a class="btn wide-btn" style="margin-top:14px" href="#branch/${encodeURIComponent(b.id)}">فتح ملف الفرع ${icon('left')}</a>`,
          { cls: 'branch-card', sub: '', actions: `<i class="key" style="--c:${charts.series[i % 6]};width:12px;height:12px;margin-top:6px"></i>` + iconBtn('branch', 'edit', 'تعديل ' + b.name, b.id) })).join('')}</div>`;
    }, after: (root) => Z.photos.hydrate(root) },

    branch: { label: 'الفرع', icon: 'store', hidden: true, parent: 'branches', eyebrow: 'ملف الفرع',
      title: (st) => currentBranch(st)?.name || 'الفرع',
      render(st) {
      const b = currentBranch(st);
      if (!b) return card('', `<div class="empty">${icon('store')}<p>الفرع غير موجود.</p><a class="btn" href="#branches">رجوع للفروع</a></div>`);
      const photos = b.photos || [];
      const staff = st.employees.filter((e) => e.branch === b.id).sort((x, y) => x.name.localeCompare(y.name, 'ar'));
      const onDuty = new Set(st.attendance.filter((a) => !a.out && a.branch === b.id).map((a) => a.employee));
      const orders = st.orders.filter((o) => o.branch === b.id).sort((x, y) => y.date.localeCompare(x.date));
      const wa = (b.phone || '').replace(/\D/g, '').replace(/^0/, '970');
      const hero = `<div class="branch-hero">
        <div class="branch-hero-media" data-photo-wrap>${photos.length ? `<img data-photo="${esc(photos[0])}" alt="${esc(b.name)}">` : `<div class="hero-empty">${icon('image')}<span>ما في صور بعد · ارفع من قسم الصور تحت</span></div>`}</div>
        <div class="branch-hero-info">
          <div class="facts">
            <div>${icon('store')}<span>${esc(b.city)} · ${esc(b.address)}</span></div>
            <div>${icon('clock')}<bdi>${esc(b.hours || '—')}</bdi></div>
            <div>${icon('chat')}${b.phone ? `<a dir="ltr" href="tel:${esc(b.phone)}">${esc(b.phone)}</a>${wa.length > 8 ? ` · <a target="_blank" rel="noopener noreferrer" href="https://wa.me/${esc(wa)}">واتساب ${icon('external')}</a>` : ''}` : '—'}</div>
          </div>
          <div class="mini-stats four"><div><strong>${num(staff.filter((e) => e.active !== false).length)}</strong><small>موظف</small></div>
            <div><strong>${num(onDuty.size)}</strong><small>بالدوام الآن</small></div>
            <div><strong>${num(orders.filter(q.isOpen).length)}</strong><small>طلب مفتوح</small></div>
            <div><strong>${num(photos.length)}</strong><small>صورة</small></div></div>
          <div class="toolbar-start">${btn('branch', 'تعديل بيانات الفرع', { id: b.id, ic: 'edit', tone: 'sm' })}<a class="btn sm ghost" href="#branches">${icon('right')}<span>كل الفروع</span></a></div>
        </div></div>`;
      const grid = photos.length ? `<div class="gallery">${photos.map((p, i) => `<figure class="ph" data-photo-wrap>
          <img data-photo="${esc(p)}" alt="صورة ${num(i + 1)} لفرع ${esc(b.name)}" loading="lazy">
          ${i === 0 ? `<span class="ph-cover">${icon('star')}الرئيسية</span>` : ''}<span class="ph-num">${num(i + 1)}</span>
          <figcaption class="ph-actions">
            ${i ? iconBtn('ph-cover', 'star', 'اجعلها الرئيسية', b.id + '|' + p) : ''}
            ${i ? iconBtn('ph-move', 'right', 'قدّمها', b.id + '|' + p + '|-1') : ''}
            ${i < photos.length - 1 ? iconBtn('ph-move', 'left', 'أخّرها', b.id + '|' + p + '|1') : ''}
            ${iconBtn('ph-del', 'trash', 'حذف الصورة', b.id + '|' + p)}
          </figcaption></figure>`).join('')}</div>` : '';
      const gallery = `<label class="drop" id="drop" data-branch="${esc(b.id)}">${icon('upload')}<strong>اسحب الصور هون أو اضغط لتختار</strong>
          <span>بتقدر تختار أكثر من صورة مرة وحدة · بتتصغّر تلقائيًا</span>
          <input type="file" id="gallery-files" accept="image/jpeg,image/png,image/webp" multiple hidden></label>
        ${photos.length ? `<p class="muted" style="margin:14px 0 10px">أول صورة هي الغلاف · <span id="ph-usage"></span></p>` : ''}${grid}`;
      const staffHtml = staff.length ? `<div class="faces">${staff.map((e) => `<span class="face-chip${e.active === false ? ' off' : ''}"><span class="mini">${e.photo ? `<img src="${esc(e.photo)}" alt="">` : esc(initials(e.name))}</span>${esc(e.name)} <small class="muted">${esc(enums.roles[e.role])}</small>${onDuty.has(e.id) ? '<i class="dot-on" title="بالدوام الآن"></i>' : ''}</span>`).join('')}</div>`
        : `<div class="empty">${icon('users')}<p>ما في موظفين بهذا الفرع.</p></div>`;
      const orderRows = orders.slice(0, 6).map((o) => `<div class="list-row"><span class="grow"><strong dir="ltr">${esc(o.ref)}</strong><small>${ui.dateTime(o.date)}</small></span><span class="num">${money(o.total)}</span>${pill(enums.orderStates[o.status], { new: 'info', preparing: 'warn', complete: 'good' }[o.status] || '')}</div>`).join('');
      const stockSoon = `<div class="soon">
          <div class="soon-cols"><div><span class="kpi-icon">${icon('download')}</span><strong>الوارد</strong><small>بضاعة دخلت الفرع: من المورّد أو من فرع ثاني</small></div>
          <div><span class="kpi-icon">${icon('upload')}</span><strong>الصادر</strong><small>مبيعات، تحويل لفرع ثاني، تالف أو منتهي</small></div>
          <div><span class="kpi-icon">${icon('layers')}</span><strong>الرصيد</strong><small>الكمية الحالية بالفرع، وتنبيه لما تقل</small></div></div>
          <p class="muted">قيد التجهيز: كل حركة بتنسجّل بتاريخها ومين سجّلها، والرصيد بينحسب تلقائيًا.</p></div>`;
      return hero + `<div class="grid cols-2" style="margin-top:16px">
        ${card('صور الفرع', gallery, { cls: 'span-2', sub: num(photos.length) + ' صورة' })}
        ${card('فريق الفرع', staffHtml, { sub: num(onDuty.size) + ' بالدوام الآن', actions: `<a class="btn sm ghost" href="#employees">إدارة الموظفين</a>` })}
        ${card('آخر الطلبات', orderRows || `<div class="empty">${icon('receipt')}<p>ما في طلبات لهذا الفرع.</p></div>`, { actions: `<a class="btn sm ghost" href="../omar/index.html#orders">كل الطلبات</a>` })}
        ${card('مخزن الفرع: الوارد والصادر', stockSoon, { cls: 'span-2', sub: 'قريبًا' })}
      </div>`;
    }, after(root) {
      Z.photos.hydrate(root);
      Z.photos.usage().then((u) => { const el = root.querySelector('#ph-usage'); if (u && el) el.textContent = 'المساحة المستخدمة ' + num(Math.round(u.used / 1048576)) + ' من ' + num(Math.round(u.quota / 1048576)) + ' ميغا'; });
      const drop = root.querySelector('#drop'); if (!drop) return;
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); uploadPhotos(drop.dataset.branch, [...e.dataTransfer.files]); });
    } },

    employees: { label: 'الموظفون', icon: 'users', eyebrow: 'فريق العمل والأدوار', render(st, v) {
      const br = v.filters.ebranch || ''; const role = v.filters.erole || '';
      const rows = st.employees.filter((e) => (!br || e.branch === br) && (!role || e.role === role) && matches(e.name, v.query)).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
      const week = q.lastDays(7).map((_, i) => dayOffset(i));
      const hours = (e) => st.shifts.filter((x) => x.employee === e.id && week.includes(x.start.slice(0, 10))).reduce((a, x) => a + (Date.parse(x.end) - Date.parse(x.start)) / 36e5, 0);
      const mode = v.filters.eview || 'cards';
      const bar = toolbar(search('q-emp', 'ابحث باسم الموظف', v.query) + selectBox('ebranch', branchOpts(), br, 'كل الفروع') + selectBox('erole', enums.roles, role, 'كل الأدوار') +
        tabs('eview', { cards: 'بطاقات', table: 'جدول' }, mode), btn('employee', 'إضافة موظف', { tone: 'primary', ic: 'plus' }));
      if (mode === 'cards') {
        const inNow = rows.filter((e) => q.openAttendance(st, e.id)).length;
        return `<div class="kpis">${kpi({ label: 'داخل الدوام الآن', value: num(inNow), ic: 'clock', hint: 'حسب تسجيل الدخول' })}
          ${kpi({ label: 'عدد الموظفين', value: num(rows.length), ic: 'users' })}
          ${kpi({ label: 'ساعات الفريق · ٧ أيام', value: num(Math.round(rows.reduce((a, e) => a + q.hoursSince(st, e.id, Date.now() - 7 * 864e5), 0))), ic: 'trend', hint: 'من سجل الحضور' })}</div>` +
          card('', bar + (rows.length ? `<div class="staff-grid">${rows.map((e) => staffCard(st, e)).join('')}</div>`
            : `<div class="empty">${icon('users')}<p>لا يوجد موظفون بعد.</p>${btn('employee', 'أضف أول موظف', { tone: 'primary', ic: 'plus' })}</div>`));
      }
      return card('', bar + table({
        columns: [
          { label: 'الموظف', cell: (e) => `<span class="who"><span class="avatar">${esc(initials(e.name))}</span><span>${esc(e.name)}<small dir="ltr" style="text-align:right">${esc(e.phone || '')}</small></span></span>` },
          { label: 'الدور', cell: (e) => `<span class="bar-label"><i class="key" style="--c:${roleColor[e.role]}"></i>${esc(enums.roles[e.role])}</span>` },
          { label: 'الفرع', cell: (e) => esc(q.branchName(st, e.branch)) },
          { label: 'ساعات الأسبوع القادم', cls: 'num', cell: (e) => num(Math.round(hours(e))) + ' س' },
          { label: 'الحالة', cell: (e) => e.active !== false ? pill('نشط', 'good') : pill('موقوف') },
          { label: '', cls: 'end', cell: (e) => btn('shift', 'مناوبة', { id: 'for:' + e.id, tone: 'sm ghost', ic: 'plus' }) + iconBtn('employee', 'edit', 'تعديل ' + e.name, e.id) }
        ], rows, empty: 'لا يوجد موظفون بعد.', emptyAction: btn('employee', 'أضف أول موظف', { tone: 'primary', ic: 'plus' }) }));
    } },

    payroll: { label: 'مالية الموظفين', icon: 'layers', eyebrow: 'كشف الرواتب والسلفات بالشيكل', render(st) {
      const month = payrollMonth();
      const records = st.payroll.filter(r => r.month === month);
      const summary = st.employees.map(e => {
        const totals = { salary:0, advance:0, payment:0 };
        for (const r of records.filter(r => r.employee === e.id)) totals[r.kind] += r.cents;
        return { name:e.name, ...totals, balance:totals.salary - totals.advance - totals.payment };
      });
      const columns = Object.entries({...payTypes, balance:'الرصيد المتبقي'}).map(([key,label]) => ({label,cell:r=>payrollCurrency.format(r[key]/100)}));
      return card('كشف الشهر',table({columns:[{label:'الموظف',cell:r=>esc(r.name)},...columns],rows:summary,empty:'أضف موظفًا أولًا.'}),{
        actions:'<label>شهر الاستحقاق <input type="month" id="pay-month" value="' + month + '"></label>' + btn('pay','تسجيل حركة',{tone:'primary sm',ic:'plus'})
      }) + card('حركات الشهر',table({columns:[
        {label:'التاريخ',cell:r=>esc(r.date)}, {label:'الموظف',cell:r=>esc(q.employeeName(st,r))},
        {label:'الحركة',cell:r=>payTypes[r.kind]}, {label:'المبلغ',cell:r=>payrollCurrency.format(r.cents/100)},
        {label:'',cell:r=>iconBtn('pay','edit','تعديل الحركة',r.id)}
      ],rows:records.sort((a,b)=>b.date.localeCompare(a.date)),empty:'لا توجد حركات لهذا الشهر.'}));
    },after(main){main.querySelector('#pay-month').onchange = e => { if(e.target.value) location.hash = 'payroll/' + e.target.value; };} },
    agenda: { label:'تقويم المدير', icon:'clock', eyebrow:'مواعيد الإدارة بتوقيت غزة', render(st) {
      const day = calendarDay();
      return card(charts.longDay(day),table({columns:[
        {label:'الموعد',cell:a=>esc(a.title)}, {label:'من',cell:a=>slot(a.start)}, {label:'إلى',cell:a=>slot(a.end)},
        {label:'',cell:a=>iconBtn('meeting','edit','تعديل الموعد',a.id)}
      ],rows:agendaOn(st,day),empty:'ما عندك مواعيد مسجلة في هذا اليوم.'}), {
        actions:'<label>تاريخ العرض <input type="date" id="agenda-day" value="'+day+'"></label>' + btn('meeting','موعد جديد',{tone:'primary sm',ic:'plus'})
      });
    },after(main){main.querySelector('#agenda-day').onchange = e => {if(e.target.value) location.hash = 'agenda/' + e.target.value;};} },
    calendar: { label: 'تقويم الفروع', icon: 'clock', eyebrow: 'مناوبات الفروع بتوقيت غزة', render(st) {
      const day = calendarDay();
      const rows = scheduled(st, day).sort((a,b) => a.start.localeCompare(b.start));
      return card(charts.longDay(day), table({ columns: [
        { label: 'الفرع', cell: x => esc(q.branchName(st, x.branch)) },
        { label: 'الموظف', cell: x => esc(q.employeeName(st, x)) },
        { label: 'البداية', cell: x => slot(x.start) }, { label: 'النهاية', cell: x => slot(x.end) },
        { label: '', cell: x => iconBtn('shift', 'edit', 'تعديل', x.id) }
      ], rows, empty: 'لا توجد مناوبات مسجلة في هذا اليوم.' }), {
        actions: '<label>اختر تاريخًا <input type="date" id="calendar-date" value="' + day + '"></label>' +
          btn('shift', 'إضافة مناوبة', { tone: 'primary sm', ic: 'plus' })
      });
    }, after(main) {
      main.querySelector('#calendar-date').addEventListener('change', e => {
        if (e.target.value) location.hash = 'calendar/' + e.target.value;
      });
    } },
    shifts: { label: 'المناوبات', icon: 'clock', eyebrow: 'جدول الدوام بتوقيت غزة', render(st, v) {
      const d = v.filters.sday || '0';
      const day = dayOffset(+d);
      const labels = { '-1': 'أمس', 0: 'اليوم', 1: 'غدًا', 2: 'بعد غد', 3: charts.longDay(dayOffset(3)).split('،')[0] };
      const rows = q.shiftsOn(st, day).sort((a, b) => a.start.localeCompare(b.start));
      const coverage = st.branches.map((b) => ({ label: b.name, segments: daySegments(st, day, (x) => x.branch === b.id) }));
      return card(charts.longDay(day), charts.timeline(coverage, { empty: 'لا توجد مناوبات في هذا اليوم.' }) + roleLegend(),
        { actions: tabs('sday', labels, d) + btn('shift', 'إضافة مناوبة', { tone: 'primary sm', ic: 'plus' }) }) +
        `<div style="height:16px"></div>` + card('تفاصيل المناوبات', table({
          columns: [
            { label: 'الموظف', cell: (x) => `<span class="who"><span class="avatar">${esc(initials(q.employeeName(st, x)))}</span>${esc(q.employeeName(st, x))}</span>` },
            { label: 'الفرع', cell: (x) => esc(q.branchName(st, x.branch)) },
            { label: 'من', cell: (x) => slot(x.start) }, { label: 'إلى', cell: (x) => slot(x.end) },
            { label: 'المدة', cls: 'num', cell: (x) => num(Math.round((Date.parse(x.end) - Date.parse(x.start)) / 36e5 * 10) / 10) + ' س' },
            { label: '', cls: 'end', cell: (x) => iconBtn('shift', 'edit', 'تعديل', x.id) }
          ], rows, empty: 'لا توجد مناوبات في هذا اليوم.' }));
    } },



    activity: { label: 'سجل التغييرات', icon: 'history', render: (st) => card('آخر ' + num(st.activity.length) + ' تعديل', st.activity.length ? `<div class="list">${st.activity.map((a) =>
      `<div class="list-row"><span class="kpi-icon">${icon('history')}</span><span class="grow">${esc(a.text)}<small>${ui.dateTime(a.date)}</small></span></div>`).join('')}</div>` : `<div class="empty">${icon('history')}<p>لا توجد تعديلات بعد.</p></div>`) }
  };

  /* ---------- staff card: photo ring = share of weekly target worked ---------- */
  const time = (iso) => new Date(iso).toLocaleTimeString('ar-EG', { timeZone: 'Asia/Gaza', hour: 'numeric', minute: '2-digit' });
  const maskId = (v) => v ? '•••••' + v.slice(-4) : '—';
  function staffCard(st, e) {
    const target = e.weeklyTarget || 48;
    const worked = q.hoursSince(st, e.id, Date.now() - 7 * 864e5);
    const pct = Math.min(100, Math.round(worked / target * 100));
    const open = q.openAttendance(st, e.id);
    const today = q.today();
    const todays = st.attendance.filter((a) => a.employee === e.id && q.dayKey(new Date(a.in)) === today).sort((a, b) => a.in.localeCompare(b.in));
    const first = todays[0]; const last = todays[todays.length - 1];
    const face = e.photo ? `<img src="${esc(e.photo)}" alt="">` : `<span>${esc(initials(e.name))}</span>`;
    const state = e.active === false ? pill('موقوف') : open ? pill('داخل الدوام', 'good') : pill('خارج الدوام', 'plain');
    return `<article class="staff-card${e.active === false ? ' off' : ''}">
      <div class="staff-top">${state}${iconBtn('employee', 'edit', 'تعديل ' + e.name, e.id)}</div>
      <div class="staff-ring" style="--p:${pct}" role="img" aria-label="${esc(e.name)}: ${num(Math.round(worked))} من ${num(target)} ساعة هذا الأسبوع">
        <div class="staff-face">${face}</div><span class="presence ${open ? 'on' : ''}"></span></div>
      <h3>${esc(e.name)}</h3>
      <p class="staff-role"><i class="key" style="--c:${roleColor[e.role]}"></i>${esc(enums.roles[e.role])}</p>
      <div class="staff-hours"><strong>${num(Math.round(worked))}</strong><span>/ ${num(target)} ساعة · آخر ٧ أيام</span></div>
      <dl class="staff-facts">
        <div><dt>${icon('store')}الفرع</dt><dd>${esc(q.branchName(st, e.branch))}</dd></div>
        <div><dt>${icon('chat')}الجوال</dt><dd>${e.phone ? `<a dir="ltr" href="tel:${esc(e.phone)}">${esc(e.phone)}</a>` : '—'}</dd></div>
        <div><dt>${icon('layers')}الهوية</dt><dd dir="ltr">${esc(maskId(e.nationalId))}</dd></div>
        <div><dt>${icon('clock')}دخول اليوم</dt><dd>${first ? time(first.in) : '—'}</dd></div>
        <div><dt>${icon('history')}خروج اليوم</dt><dd>${last?.out ? time(last.out) : open ? 'لم يخرج بعد' : '—'}</dd></div>
      </dl>
      ${e.active === false ? '' : open ? btn('check-out', 'تسجيل خروج', { id: e.id, tone: 'wide-btn', ic: 'external' }) : btn('check-in', 'تسجيل دخول', { id: e.id, tone: 'primary wide-btn', ic: 'check' })}
    </article>`;
  }


  /* ---------- photo upload (many at once, one by one to keep memory low) ---------- */
  async function uploadPhotos(bid, files) {
    files = files.filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    const ids = []; let failed = 0;
    for (const [i, f] of files.entries()) {
      ui.toast('جاري رفع ' + num(i + 1) + ' من ' + num(files.length) + '…');
      try { ids.push(await Z.photos.add(f)); } catch (e) { failed++; ui.toast(e.message, 'error'); if (/امتلأت/.test(e.message)) break; }
    }
    if (ids.length) { const b = s().branches.find((x) => x.id === bid); store.upsert('branches', { ...b, photos: [...(b.photos || []), ...ids] }, 'أُضيفت ' + num(ids.length) + ' صورة لـ' + b.name); }
    if (failed) ui.toast(num(failed) + ' صورة ما انرفعت', 'error');
  }

  /* ---------- actions ---------- */
  function overlap(list, rec, sameKey) { return list.some((x) => x.id !== rec.id && sameKey(x) && x.start < rec.end && rec.start < x.end); }
  const actions = {
    pay(ref) {
      if (!s().employees.length) throw Error('أضف موظفًا قبل تسجيل حركة مالية.');
      const row = s().payroll.find(r => r.id === ref) || { id:id(), month:payrollMonth(), date:q.today(), kind:'salary' };
      ui.form({title:ref?'تعديل الحركة المالية':'تسجيل حركة مالية',fields:[
        {name:'employee',label:'الموظف',type:'select',options:Object.fromEntries(s().employees.map(e=>[e.id,e.name])),value:row.employee,required:true},
        {name:'kind',label:'نوع الحركة',type:'select',options:payTypes,value:row.kind},
        {name:'month',label:'تُحسب على راتب شهر',type:'month',value:row.month,required:true},
        {name:'date',label:'تاريخ الحركة',type:'date',value:row.date,required:true},
        {name:'amount',label:'المبلغ بالشيكل',type:'number',value:row.cents ? row.cents/100 : '',attrs:'min="0.01" step="0.01"',required:true}
      ],remove:ref?{label:'حذف الحركة',run:()=>store.remove('payroll',row.id,'حُذفت حركة مالية')}:null,
      submit(v){store.upsert('payroll',{id:row.id,employee:v.employee,month:v.month,date:v.date,kind:v.kind,cents:Math.round(Number(v.amount)*100)},'حُفظت حركة مالية');location.hash='payroll/'+v.month;}});
    },
    meeting(ref) {
      const day = calendarDay();
      const row = s().agenda.find(a=>a.id===ref) || {id:id(),start:day+'T09:00',end:day+'T10:00'};
      ui.form({title:ref?'تعديل موعد المدير':'موعد جديد للمدير',fields:[
        {name:'title',label:'عنوان الموعد',value:row.title,required:true,attrs:'maxlength="120"'},
        {name:'start',label:'بداية الموعد',type:'datetime-local',value:row.start,required:true},
        {name:'end',label:'نهاية الموعد',type:'datetime-local',value:row.end,required:true}
      ],remove:ref?{label:'حذف الموعد',run:()=>store.remove('agenda',row.id,'حُذف موعد إداري')}:null,
      submit(v){const rec = {...row,...v}; if(overlap(s().agenda,rec,()=>true)) throw Error('يتعارض الموعد مع موعد آخر للمدير.');
        store.upsert('agenda',rec,'حُفظ موعد إداري');location.hash='agenda/'+v.start.slice(0,10);}});
    },
    'ph-cover'(ref) { const [bid, pid] = ref.split('|'); const b = s().branches.find((x) => x.id === bid);
      store.upsert('branches', { ...b, photos: [pid, ...b.photos.filter((p) => p !== pid)] }, 'تغيّرت الصورة الرئيسية لـ' + b.name); },
    'ph-move'(ref) { const [bid, pid, dir] = ref.split('|'); const b = s().branches.find((x) => x.id === bid);
      const list = [...b.photos]; const i = list.indexOf(pid); const j = i + Number(dir);
      if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]];
      store.upsert('branches', { ...b, photos: list }, 'رُتّبت صور ' + b.name); },
    async 'ph-del'(ref) { const [bid, pid] = ref.split('|'); const b = s().branches.find((x) => x.id === bid);
      if (!await ui.confirm('حذف هذه الصورة نهائيًا؟')) return;
      store.upsert('branches', { ...b, photos: b.photos.filter((p) => p !== pid) }, 'حُذفت صورة من ' + b.name);
      await Z.photos.remove(pid); },
    branch(bid) {
      const b = s().branches.find((x) => x.id === bid) || { id: id() };
      ui.form({ title: bid ? 'تعديل الفرع' : 'فرع جديد', fields: [
        { name: 'name', label: 'اسم الفرع', value: b.name, required: true, wide: true, attrs: 'maxlength="80"' },
        { name: 'city', label: 'المدينة', value: b.city, required: true, attrs: 'maxlength="60"' },
        { name: 'phone', label: 'الهاتف', type: 'tel', value: b.phone, attrs: 'dir="ltr" maxlength="20"' },
        { name: 'address', label: 'العنوان', value: b.address, required: true, wide: true, attrs: 'maxlength="150"' },
        { name: 'hours', label: 'ساعات الدوام', value: b.hours || '08:00-23:00', attrs: 'dir="ltr" maxlength="30"', wide: true }
      ], submit: (v) => store.upsert('branches', { ...b, ...v }, 'حُفظ الفرع ' + v.name) });
    },
    employee(eid) {
      const e = s().employees.find((x) => x.id === eid) || { id: id(), role: 'pharmacist', active: true, branch: s().branches[0]?.id };
      ui.form({ title: eid ? 'تعديل الموظف' : 'موظف جديد', fields: [
        { name: 'name', label: 'الاسم الكامل', value: e.name, required: true, wide: true, attrs: 'maxlength="80"' },
        { name: 'role', label: 'الدور', type: 'select', options: enums.roles, value: e.role },
        { name: 'branch', label: 'الفرع', type: 'select', options: branchOpts(), value: e.branch },
        { type: 'html', wide: true, html: `<div class="photo-pick"><div class="staff-face sm" id="emp-photo">${e.photo ? `<img src="${esc(e.photo)}" alt="">` : `<span>${esc(initials(e.name || '؟'))}</span>`}</div>
          <label class="btn sm">${icon('upload')}<span>اختيار صورة</span><input type="file" name="photo" accept="image/jpeg,image/png,image/webp" hidden></label>
          ${e.photo ? `<label class="toggle"><input type="checkbox" name="removePhoto"><span class="switch"></span><span>إزالة الصورة</span></label>` : ''}</div>` },
        { name: 'phone', label: 'رقم الجوال', type: 'tel', value: e.phone, attrs: 'dir="ltr" maxlength="20" pattern="[0-9+ ]{7,20}"' },
        { name: 'nationalId', label: 'رقم الهوية', value: e.nationalId, attrs: 'dir="ltr" inputmode="numeric" pattern="[0-9]{9}" maxlength="9"', hint: '٩ أرقام · يظهر مخفيًا في البطاقة' },
        { name: 'weeklyTarget', label: 'ساعات العمل المطلوبة أسبوعيًا', type: 'number', value: e.weeklyTarget ?? 48, attrs: 'min="1" max="84" step="1"' },
        { name: 'notes', label: 'ملاحظات', value: e.notes, attrs: 'maxlength="150"' },
        { name: 'active', label: 'على رأس عمله', type: 'toggle', value: e.active !== false, wide: true }
      ], remove: eid ? { label: 'حذف الموظف', confirm: 'حذف «' + e.name + '» ومناوباته وسجل حضوره؟', run: () => store.remove('employees', e.id, 'حُذف الموظف ' + e.name) } : null,
      async submit(v, raw) {
        const file = raw.get('photo');
        const photo = file?.size ? await ui.compressPhoto(file, 240, true) : raw.has('removePhoto') ? undefined : e.photo;
        const { removePhoto, ...rest } = v;
        store.upsert('employees', { ...e, ...rest, photo, nationalId: v.nationalId || undefined }, 'حُفظ الموظف ' + v.name);
      } });
    },
    shift(sid) {
      const forEmp = sid?.startsWith('for:') ? sid.slice(4) : null;
      const real = forEmp ? null : sid;
      const st = s();
      if (!st.employees.length) { location.hash = 'employees'; throw Error('أضف الموظفين أولًا، ثم جدول مناوباتهم.'); }
      const emp0 = st.employees.find((e) => e.id === forEmp);
      const day = location.hash.startsWith('#calendar') ? calendarDay() : q.today();
      const x = st.shifts.find((y) => y.id === real) || { id: id(), employee: forEmp || st.employees[0].id, branch: emp0?.branch || st.employees[0].branch, start: day + 'T08:00', end: day + 'T15:00' };
      const staff = Object.fromEntries(st.employees.filter((e) => e.active !== false || e.id === x.employee).map((e) => [e.id, e.name + ' · ' + enums.roles[e.role]]));
      ui.form({ title: real ? 'تعديل مناوبة' : 'مناوبة جديدة', fields: [
        { name: 'employee', label: real ? 'الموظف المكلّف (اختر البديل للاستبدال)' : 'الموظف', type: 'select', options: staff, value: x.employee, wide: true },
        { name: 'branch', label: 'الفرع', type: 'select', options: branchOpts(), value: x.branch, wide: true },
        { name: 'start', label: 'البداية', type: 'datetime-local', value: x.start, required: true },
        { name: 'end', label: 'النهاية', type: 'datetime-local', value: x.end, required: true }
      ], remove: real ? { label: 'حذف المناوبة', run: () => store.remove('shifts', x.id, 'حُذفت مناوبة ' + q.employeeName(st, x)) } : null,
      submit(v) {
        const rec = { ...x, ...v }; delete rec.name;
        if (rec.end <= rec.start) throw Error('وقت النهاية لازم يكون بعد البداية.');
        if ((Date.parse(rec.end) - Date.parse(rec.start)) / 36e5 > 16) throw Error('المناوبة أطول من ١٦ ساعة. تأكد من التاريخ.');
        if (overlap(s().shifts, rec, (y) => y.employee === rec.employee)) throw Error('هذا الموظف عنده مناوبة ثانية في نفس الوقت.');
        const name = q.employeeName(s(), rec);
        const message = real && x.employee !== rec.employee ? 'انتقلت المناوبة من ' + q.employeeName(s(), x) + ' إلى ' + name : 'حُفظت مناوبة ' + name;
        store.upsert('shifts', rec, message);
      } });
    },
    'check-in'(eid) {
      const e = s().employees.find((x) => x.id === eid);
      if (q.openAttendance(s(), eid)) throw Error(e.name + ' مسجّل دخوله مسبقًا.');
      store.upsert('attendance', { id: id(), employee: eid, branch: e.branch, in: new Date().toISOString(), out: null }, 'دخول ' + e.name + ' · ' + q.branchName(s(), e.branch));
    },
    'check-out'(eid) {
      const e = s().employees.find((x) => x.id === eid); const a = q.openAttendance(s(), eid);
      if (!a) throw Error('لا يوجد تسجيل دخول مفتوح.');
      store.upsert('attendance', { ...a, out: new Date().toISOString() }, 'خروج ' + e.name);
    },
  };

  document.addEventListener('change', async (e) => {
    if (e.target.name !== 'photo') return;
    const f = e.target.files[0]; const box = ui.$('#emp-photo');
    if (!f || !box) return;
    try { box.innerHTML = `<img src="${await ui.compressPhoto(f, 240, true)}" alt="">`; } catch (ex) { ui.toast(ex.message, 'error'); e.target.value = ''; }
  });

  const onChange = { 'gallery-files'(input) { const files = [...input.files]; input.value = ''; return uploadPhotos(input.closest('#drop').dataset.branch, files); } };
  const commandText = value => value.trim().replace(/[؟?.!]+$/, '').replace(/[ًٌٍَُِّْ]/g,'')
    .replace(/[أإآ]/g,'ا').replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/٫/g,'.').replace(/\s+/g,' ');
  function operate(question, choose, reply) {
    const text = commandText(question);
    const today = q.today();
    const date = new Date(today + 'T12:00:00Z');
    const offsetDay = n => new Date(+date + n * 864e5).toISOString().slice(0,10);
    function employee(name, next) {
      const matches = s().employees.filter(e => e.active !== false &&
        (commandText(e.name) === name || commandText(e.name).startsWith(name + ' ')));
      if (!matches.length) reply('ما لقيت موظف نشط باسم ' + name + '. تأكد من الاسم وأعد الطلب.');
      else if (matches.length === 1) next(matches[0]);
      else choose('أي موظف تقصد؟',matches.map(e=>({label:e.name+' · '+q.branchName(s(),e.branch),run:()=>next(e)})));
    }
    const confirm = (description,run) => choose(description,[{label:'تأكيد',run},{label:'إلغاء',run:()=>reply('أُلغيت العملية.')}]);
    if (/مواعيد/.test(text) && /بكرا|بكرة|غدا/.test(text) && !/اضف|احجز|سجل|الغ|عدل/.test(text)) {
      const day = offsetDay(1);
      const rows = agendaOn(s(),day);
      reply('مواعيد المدير ليوم '+day+'\n'+(rows.map(a=>a.start+' · '+a.title).join('\n') || 'لا توجد مواعيد مسجلة.'));
      return true;
    }
    if (/^(سجل|اضف|اصرف) .*سلفة/.test(text)) {
      const match = text.match(/^(?:سجل|اضف|اصرف) ل(.+?) سلفة (\d+(?:\.\d{1,2})?)(?: شيكل)?(?: على راتب)? (?:شهر )?(?:(\d{4})-)?(\d{1,2})$/);
      if (!match || +match[4]<1 || +match[4]>12 || +match[2]<=0) {
        reply('اكتب الموظف والمبلغ وشهر الاستحقاق، مثل «سجل لسامر سلفة ٢٠٠ شيكل على راتب شهر ١١».'); return true;
      }
      const month = (match[3] || today.slice(0,4))+'-'+match[4].padStart(2,'0');
      const cents = Math.round(Number(match[2])*100);
      employee(match[1], e => confirm('سلفة '+payrollCurrency.format(cents/100)+' للموظف '+e.name+' على راتب '+month+'؟',()=>{
        if (!s().employees.some(row=>row.id===e.id && row.active!==false)) throw Error('الموظف لم يعد متاحًا.');
        store.upsert('payroll',{id:id(),employee:e.id,month,date:today,kind:'advance',cents},'سُجلت سلفة من مساعد المدير');
        const ledger = s().payroll.filter(r=>r.employee===e.id && r.month===month);
        const balance = ledger.reduce((sum,r)=>sum+(r.kind==='salary'?r.cents:-r.cents),0);
        reply('حُفظت السلفة.'+(ledger.some(r=>r.kind==='salary')?' المتبقي من الراتب '+payrollCurrency.format(balance/100):' راتب الشهر غير مسجّل بعد.'));
      }));
      return true;
    }
    if (/^(بدل|استبدل|انقل) مناوبة/.test(text)) {
      const match = text.match(/^(?:بدل|استبدل|انقل) مناوبة (.+?) من (.+?) (?:الى |ل)(.+)$/);
      if (!match) { reply('اكتب مثل «بدّل مناوبة الخميس من أحمد لسارة».'); return true; }
      const weekdays = ['الاحد','الاثنين','الثلاثاء','الاربعاء','الخميس','الجمعة','السبت'];
      const weekday = weekdays.indexOf(match[1]);
      const day = weekday>=0 ? offsetDay((weekday-date.getUTCDay()+7)%7) : match[1]==='اليوم' ? today :
        ['بكرا','بكرة','غدا'].includes(match[1]) ? offsetDay(1) : match[1];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {reply('حدّد يوم الأسبوع أو اكتب التاريخ بصيغة سنة-شهر-يوم.');return true;}
      employee(match[2], from=>employee(match[3], to=>{
        if (from.id===to.id) {reply('اختر موظفًا بديلًا مختلفًا.');return;}
        const shifts = scheduled(s(),day).filter(r=>r.employee===from.id);
        function preview(x) {
          function check() {
            const current = s().shifts.find(r=>r.id===x.id);
            if (!current || ['employee','branch','start','end'].some(k=>current[k]!==x[k]) ||
              !s().employees.some(e=>e.id===to.id && e.active!==false)) throw Error('تغيّرت بيانات المناوبة أو الموظف. أعد الطلب.');
            if (overlap(s().shifts,x,r=>r.employee===to.id)) throw Error('للموظف البديل مناوبة متعارضة.');
          }
          check();
          confirm('نقل مناوبة '+q.branchName(s(),x.branch)+' من '+from.name+' إلى '+to.name+'، '+x.start+' — '+x.end+'؟',()=>{
            check(); store.upsert('shifts',{...x,employee:to.id},'انتقلت المناوبة من '+from.name+' إلى '+to.name);
            reply('حُفظ التبديل. الموظف المكلّف الآن '+q.employeeName(s(),s().shifts.find(r=>r.id===x.id))+'.');
          });
        }
        if (!shifts.length) reply('لا توجد مناوبة لهذا الموظف يوم '+day+'.');
        else if (shifts.length===1) preview(shifts[0]);
        else choose('أي مناوبة؟',shifts.map(x=>({label:x.start+' · '+q.branchName(s(),x.branch),run:()=>preview(x)})));
      }));
      return true;
    }
    return false;
  }
  const app = { store, pages, actions, onChange, subtitle: 'الفروع والموظفين',
    assistant: { operate, commands: [
      {label:'الموظفون',create:/^(اضف|سجل) موظف$/,records:()=>s().employees.map(e=>({id:e.id,label:e.name})),edit:actions.employee},
      {label:'الفروع',create:/^اضف فرع$/,records:()=>s().branches.map(b=>({id:b.id,label:b.name})),edit:actions.branch},
      {label:'المناوبات',create:/^(اضف|سجل) مناوبة$/,records:()=>s().shifts.map(x=>({id:x.id,label:q.employeeName(s(),x)+' · '+x.start})),edit:actions.shift},
      {label:'مواعيد المدير',create:/^(اضف|احجز|سجل) موعد$/,records:()=>s().agenda.map(a=>({id:a.id,label:a.title+' · '+a.start})),edit:actions.meeting},
      {label:'الحركات المالية',create:/^سجل حركة مالية$/,records:()=>s().payroll.map(r=>({id:r.id,label:q.employeeName(s(),r)+' · '+payTypes[r.kind]+' · '+r.month+' · '+payrollCurrency.format(r.cents/100)})),edit:actions.pay}
    ], context(st) {
      const day = /^#(calendar|agenda)(\/|$)/.test(location.hash) ? calendarDay() : q.today();
      const rows = scheduled(st, day);
      return { ...q.aiContext(st), managerAgenda:agendaOn(st,day), calendar: { day, counts: st.branches.map(b => rows.filter(x => x.branch === b.id).length) } };
    }, title: 'مساعد الفروع', suggestions: ['مين بالدوام هلّأ؟', 'مين اشتغل أقل من المطلوب هالأسبوع؟', 'أي فرع ناقصه موظفين؟', 'لخّص مناوبات يوم التقويم المحدد لكل فرع'] },
    links: [{ href: '../omar/index.html', label: 'لوحة المتجر', icon: 'box' }, { href: '../omar/index.html#settings', label: 'النسخ الاحتياطي', icon: 'download' }] };
  const view = ui.start(app);
})(window.Zain);
