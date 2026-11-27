/* Store dashboard (products, stock, offers, orders). Built on admin/ core. */
'use strict';
(function (Z) {
  const { ui, q, enums, charts } = Z;
  const { esc, icon, pill, btn, iconBtn, card, kpi, table, toolbar, search, selectBox, tabs, money, num, dateTime } = ui;
  const store = Z.data.createStore(Z.data.LocalAdapter, window.dashboardSeed);
  const id = () => crypto.randomUUID();
  const orderTone = { new: 'info', preparing: 'warn', complete: 'good', cancelled: '' };
  const orderColor = { new: charts.status.info, preparing: charts.status.warning, complete: charts.status.good, cancelled: charts.status.neutral };
  const branchColor = (s, bid) => charts.series[Math.max(0, s.branches.findIndex((b) => b.id === bid)) % charts.series.length];

  const photoOk = (p) => typeof p === 'string' && p.length <= 150000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(p);
  const img = (p) => photoOk(p) ? `<img src="${esc(p)}" alt="">` : typeof p === 'string' && /^assets\/img\/[\w/-]+\.[a-z0-9]+$/i.test(p) ? `<img src="../${esc(p)}" alt="" loading="lazy">` : `<span class="avatar">${icon('box')}</span>`;
  const stockPill = (s, p) => p.stock == null ? pill('غير محدد', 'plain') : p.stock === 0 ? pill('نفد', 'bad') : p.stock <= s.settings.threshold ? pill(num(p.stock) + ' قطعة', 'warn') : pill(num(p.stock) + ' قطعة', 'good');
  const matches = (text, query) => !query || text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());

  function sumRange(s, from, to) {
    const t0 = Date.now() - from * 864e5, t1 = Date.now() - to * 864e5;
    return s.orders.filter((o) => o.status === 'complete' && Date.parse(o.date) > t0 && Date.parse(o.date) <= t1).reduce((a, o) => a + o.total, 0);
  }

  /* ---------- pages ---------- */
  const pages = {
    home: { label: 'نظرة عامة', icon: 'home', eyebrow: 'أداء الصيدلية', render(s) {
      const days = q.lastDays(7);
      const today = days[6], yesterday = days[5];
      const byDay = q.revenueByDay(s, days);
      const sales = (d) => byDay.find((x) => x.x === d)?.y || 0;
      const week = byDay.reduce((a, x) => a + x.y, 0);
      const lastWeek = sumRange(s, 14, 7);
      const change = lastWeek ? Math.round((week - lastWeek) / lastWeek * 100) : null;
      const open = s.orders.filter(q.isOpen);
      const low = q.lowStock(s);
      const inWeek = s.orders.filter((o) => o.status === 'complete' && days.includes(q.orderDay(o)));
      const byBranch = s.branches.map((b) => ({ label: b.name, color: branchColor(s, b.id), value: inWeek.filter((o) => o.branch === b.id).reduce((a, o) => a + o.total, 0) }))
        .sort((a, b) => b.value - a.value);
      const dayName = (d) => d === today ? 'اليوم' : new Date(d + 'T12:00:00').toLocaleDateString('ar-EG', { weekday: 'short' });
      const short = (v) => v >= 10000 ? ui.compactMoney(v) : money(v);
      const lines = [
        { ic: 'trend', html: `مبيعات اليوم <b>${money(sales(today))}</b>، وأمس كانت ${money(sales(yesterday))}.` },
        byBranch[0]?.value ? { ic: 'store', html: `أكثر فرع بيبيع هالأسبوع: <b>${esc(byBranch[0].label)}</b> بـ ${money(byBranch[0].value)}.` } : null,
        { ic: 'receipt', tone: open.length ? 'warn' : '', html: open.length ? `في <b>${num(open.length)}</b> طلبات بتستنى تجهيز أو تسليم.` : 'ما في طلبات معلّقة، كله مخلّص.' },
        { ic: 'alert', tone: low.length ? 'bad' : '', html: low.length ? `<b>${num(low.length)}</b> منتجات قربت تخلص من المخزون.` : 'المخزون تمام، ما في نقص.' }
      ].filter(Boolean);
      const lowList = low.slice(0, 5).map((p) => `<div class="list-row"><span class="who">${img(p.image)}<span class="grow">${esc(p.name)}<small>${esc(enums.categories[p.category])}</small></span></span>${stockPill(s, p)}</div>`).join('');
      const boxes = Object.entries(enums.orderStates).map(([k, l]) => `<a class="status-box" href="#orders">${pill(l, orderTone[k])}<strong>${num(s.orders.filter((o) => o.status === k && (q.isOpen(o) || q.orderDay(o) === today)).length)}</strong><small class="muted">${q.isOpen({ status: k }) ? 'الآن' : 'اليوم'}</small></a>`).join('');
      return `<div class="kpis">
        ${kpi({ label: 'مبيعات آخر ٧ أيام', value: money(week), ic: 'trend', delta: change == null ? null : { good: change >= 0, text: (change >= 0 ? 'أعلى ' : 'أقل ') + num(Math.abs(change)) + '٪ من الأسبوع الماضي' }, hint: 'الطلبات المكتملة' })}
        ${kpi({ label: 'طلبات مفتوحة', value: num(open.length), ic: 'receipt', href: '#orders', hint: 'جديدة أو قيد التجهيز', tone: open.length > 10 ? 'warn' : '' })}
        ${kpi({ label: 'منتجات قربت تخلص', value: num(low.length), ic: 'alert', href: '#inventory', hint: num(s.settings.threshold) + ' قطع أو أقل', tone: low.length ? 'bad' : '' })}
        ${kpi({ label: 'عروض شغّالة', value: num(q.offers(s).length), ic: 'tag', href: '#offers', hint: 'من ' + num(s.products.filter((p) => p.active).length) + ' منتج' })}
      </div>
      <div class="grid cols-2">
        ${card('كم بعنا كل يوم؟', charts.columns(byDay.map((x) => ({ label: dayName(x.x), value: x.y, hot: x.x === today })), { format: short, empty: 'ما في مبيعات مسجّلة هالأسبوع.' }), { sub: 'آخر ٧ أيام بالشيكل · العمود الغامق هو اليوم' })}
        ${card('الخلاصة', `<div class="insights">${lines.map((l) => `<p class="insight ${l.tone || ''}"><span class="kpi-icon">${icon(l.ic)}</span><span>${l.html}</span></p>`).join('')}</div>`, { sub: 'أهم ما يلزمك تعرفه الآن' })}
        ${card('أي فرع بيبيع أكثر؟', charts.bars(byBranch, { format: money, empty: 'ما في مبيعات هالأسبوع.' }), { sub: 'آخر ٧ أيام، من الأعلى للأقل' })}
        ${card('وين وصلت الطلبات؟', `<div class="status-boxes">${boxes}</div>`, { actions: `<a class="btn sm ghost" href="#orders">كل الطلبات</a>` })}
        ${card('منتجات لازم تنطلب', lowList || `<div class="empty">${icon('check')}<p>كل الكميات فوق الحد.</p></div>`, { cls: 'span-2', actions: `<a class="btn sm ghost" href="#inventory">المخزون</a>` })}
      </div>`;
    } },

    products: { label: 'المنتجات', icon: 'box', group: 'الكتالوج', eyebrow: 'إدارة الكتالوج', render(s, v) {
      const cat = v.filters.cat || '';
      const rows = s.products.filter((p) => (!cat || p.category === cat) && matches(p.name, v.query));
      return card('', toolbar(search('q-products', 'ابحث باسم المنتج', v.query) + selectBox('cat', enums.categories, cat, 'كل الأقسام'),
        btn('product', 'إضافة منتج', { tone: 'primary', ic: 'plus' })) + table({
        columns: [
          { label: 'المنتج', cell: (p) => `<span class="who">${img(p.image)}<span>${esc(p.name)}<small>${esc(enums.categories[p.category])}${p.rx ? ' · يحتاج وصفة' : ''}</small></span></span>` },
          { label: 'السعر', cls: 'num', cell: (p) => p.offer != null ? `<strong>${money(p.offer)}</strong> <s class="muted">${money(p.price)}</s>` : money(p.price) },
          { label: 'المخزون', cell: (p) => stockPill(s, p) },
          { label: 'الحالة', cell: (p) => p.active ? pill('ظاهر', 'brand') : pill('موقوف') },
          { label: '', cls: 'end', cell: (p) => iconBtn('product', 'edit', 'تعديل ' + p.name, p.id) }
        ], rows, empty: 'لا توجد منتجات مطابقة.' }));
    } },

    inventory: { label: 'المخزون', icon: 'layers', eyebrow: 'الكميات وحد التنبيه', badge: (s) => q.lowStock(s).length || '', render(s, v) {
      const tab = v.filters.stock || 'all';
      const t = s.settings.threshold;
      const rows = s.products.filter((p) => matches(p.name, v.query) && (tab === 'all' || (tab === 'low' ? p.stock != null && p.stock <= t && p.stock > 0 : tab === 'out' ? p.stock === 0 : p.stock == null)));
      const count = (fn) => s.products.filter(fn).length;
      return `<div class="kpis">
        ${kpi({ label: 'منتجات بكميات مسجّلة', value: num(count((p) => p.stock != null)), ic: 'layers' })}
        ${kpi({ label: 'قريبة من النفاد', value: num(count((p) => p.stock != null && p.stock > 0 && p.stock <= t)), ic: 'alert', tone: 'warn' })}
        ${kpi({ label: 'نفدت', value: num(count((p) => p.stock === 0)), ic: 'alert', tone: 'bad' })}
        ${kpi({ label: 'بلا كمية مسجّلة', value: num(count((p) => p.stock == null)), ic: 'box' })}
      </div>` + card('', toolbar(search('q-stock', 'ابحث باسم المنتج', v.query) + tabs('stock', { all: 'الكل', low: 'منخفض', out: 'نفد', none: 'غير محدد' }, tab)) + table({
        columns: [
          { label: 'المنتج', cell: (p) => `<span class="who">${img(p.image)}<span>${esc(p.name)}<small>${esc(enums.categories[p.category])}</small></span></span>` },
          { label: 'المستوى', cell: (p) => p.stock == null ? '—' : charts.meter(p.stock, Math.max(1, t * 4), p.stock === 0 ? 'bad' : p.stock <= t ? 'warn' : '') },
          { label: 'الكمية', cell: (p) => stockPill(s, p) },
          { label: '', cls: 'end', cell: (p) => btn('dec', '−١', { id: p.id, tone: 'sm ghost', title: 'إنقاص قطعة' }) +btn('stock', 'تعديل', { id: p.id, tone: 'sm' }) }
        ], rows, empty: 'لا توجد منتجات في هذا التصنيف.' }));
    } },

    offers: { label: 'العروض', icon: 'tag', eyebrow: 'الخصومات الفعّالة', render(s) {
      const rows = s.products.filter((p) => p.offer != null);
      return card('', toolbar(`<p class="muted">${num(rows.length)} عرض · أضف العرض من صفحة المنتج</p>`, `<a class="btn" href="#products">${icon('box')}<span>المنتجات</span></a>`) + table({
        columns: [
          { label: 'المنتج', cell: (p) => `<span class="who">${img(p.image)}<span>${esc(p.name)}</span></span>` },
          { label: 'السعر الأصلي', cls: 'num', cell: (p) => money(p.price) },
          { label: 'سعر العرض', cls: 'num', cell: (p) => `<strong>${money(p.offer)}</strong>` },
          { label: 'الخصم', cell: (p) => pill('−' + num(Math.round((1 - p.offer / p.price) * 100)) + '٪', 'brand') },
          { label: 'الحالة', cell: (p) => p.active ? pill('نشط', 'good') : pill('موقوف') },
          { label: '', cls: 'end', cell: (p) => iconBtn('product', 'edit', 'تعديل', p.id) }
        ], rows, empty: 'لا توجد عروض حاليًا. افتح منتجًا وأضف له سعر عرض.' }));
    } },

    orders: { label: 'الطلبات', icon: 'receipt', group: 'المبيعات', eyebrow: 'تسجيل ومتابعة الطلبات', badge: (s) => s.orders.filter((o) => o.status === 'new').length || '', render(s, v) {
      const st = v.filters.ostate || 'open';
      const br = v.filters.obranch || '';
      const rows = s.orders.filter((o) => (st === 'all' || (st === 'open' ? q.isOpen(o) : o.status === st)) && (!br || o.branch === br) && matches(o.ref, v.query))
        .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 300);
      return card('', toolbar(search('q-orders', 'ابحث برقم الطلب', v.query) + tabs('ostate', { open: 'المفتوحة', complete: 'المكتملة', cancelled: 'الملغاة', all: 'الكل' }, st) +
        selectBox('obranch', Object.fromEntries(s.branches.map((b) => [b.id, b.name])), br, 'كل الفروع'), btn('order', 'تسجيل طلب', { tone: 'primary', ic: 'plus' })) + table({
        columns: [
          { label: 'رقم الطلب', cell: (o) => `<strong dir="ltr">${esc(o.ref)}</strong>` },
          { label: 'التاريخ', cell: (o) => dateTime(o.date) },
          { label: 'الفرع', cell: (o) => `<span class="bar-label"><i class="key" style="--c:${branchColor(s, o.branch)}"></i>${esc(q.branchName(s, o.branch))}</span>` },
          { label: 'القناة', cell: (o) => esc(enums.channels[o.channel] || '—') },
          { label: 'الإجمالي', cls: 'num', cell: (o) => money(o.total) },
          { label: 'الحالة', cell: (o) => pill(enums.orderStates[o.status], orderTone[o.status]) },
          { label: '', cls: 'end', cell: (o) => (o.status === 'new' ? btn('advance', 'تجهيز', { id: o.id, tone: 'sm' }) : o.status === 'preparing' ? btn('advance', 'إكمال', { id: o.id, tone: 'sm' }) : '') + iconBtn('order', 'edit', 'تعديل', o.id) }
        ], rows, empty: 'لا توجد طلبات في هذا العرض.' }));
    } },

    activity: { label: 'سجل التغييرات', icon: 'history', group: 'النظام', render: (s) => card('آخر ' + num(s.activity.length) + ' تعديل', activity(s.activity)) },

    settings: { label: 'الإعدادات', icon: 'settings', eyebrow: 'الإعدادات والنسخ الاحتياطي', render(s) {
      const phone = s.settings.whatsapp || '970599682008';
      const demo = s.orders.some((o) => o.demo);
      return `<div class="grid cols-2">
        ${card('بيانات اللوحة', `<div class="list"><div class="list-row"><span class="grow">الاسم الظاهر<small>${esc(s.settings.name)}</small></span></div>
          <div class="list-row"><span class="grow">حد تنبيه المخزون<small>${num(s.settings.threshold)} قطع</small></span></div>
          <div class="list-row"><span class="grow">رقم واتساب الطلبات<small dir="ltr">+${esc(phone)}</small></span><a class="btn sm ghost" target="_blank" rel="noopener noreferrer" href="https://wa.me/${esc(phone)}">تجربة ${icon('external')}</a></div></div>`,
          { actions: btn('settings', 'تعديل', { ic: 'edit', tone: 'sm' }) })}
        ${card('النسخ الاحتياطي', `<p class="muted" style="margin-bottom:14px">البيانات محفوظة في هذا المتصفح فقط. نزّل نسخة أسبوعيًا، واستعدها على أي جهاز.</p>
          <div class="toolbar-start">${btn('export', 'تنزيل نسخة', { ic: 'download' })}${btn('import', 'استعادة نسخة', { ic: 'upload' })}<input type="file" id="backup" accept=".json,application/json" hidden></div>`)}
        ${card('بيانات تجريبية', `<p class="muted" style="margin-bottom:14px">لتجربة الرسوم البيانية: تضيف طلبات ومواعيد وموظفين وهميين مع علامة «تجريبي»، ويمكن حذفها كلها بضغطة.</p>
          <div class="toolbar-start">${demo ? btn('clear-demo', 'حذف البيانات التجريبية', { ic: 'trash' }) : btn('demo', 'تحميل بيانات تجريبية', { ic: 'sparkles' })}</div>`)}
      </div>`;
    } }
  };

  function activity(items) {
    if (!items.length) return `<div class="empty">${icon('history')}<p>لا توجد تعديلات بعد.</p></div>`;
    return `<div class="list">${items.map((a) => `<div class="list-row"><span class="kpi-icon">${icon('history')}</span><span class="grow">${esc(a.text)}<small>${dateTime(a.date)}</small></span></div>`).join('')}</div>`;
  }

  /* ---------- actions ---------- */
  async function compress(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8e6) throw Error('اختر صورة JPG أو PNG أو WebP أقل من 8 ميغابايت.');
    const bmp = await createImageBitmap(file);
    try {
      const k = Math.min(1, 400 / Math.max(bmp.width, bmp.height));
      const c = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(bmp.width * k)), height: Math.max(1, Math.round(bmp.height * k)) });
      const x = c.getContext('2d', { alpha: false }); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
      const out = c.toDataURL('image/jpeg', 0.72);
      if (!photoOk(out)) throw Error('الصورة كبيرة، جرّب صورة أصغر.');
      return out;
    } finally { bmp.close(); }
  }
  const s = () => store.state;
  const actions = {
    product(pid) {
      const p = s().products.find((x) => x.id === pid) || { id: id(), active: true, category: 'medicines' };
      ui.form({ title: pid ? 'تعديل المنتج' : 'منتج جديد', fields: [
        { name: 'name', label: 'اسم المنتج', value: p.name, required: true, wide: true, attrs: 'maxlength="150"' },
        { name: 'category', label: 'القسم', type: 'select', options: enums.categories, value: p.category },
        { name: 'stock', label: 'الكمية المتوفرة', type: 'number', value: p.stock, attrs: 'min="0" step="1"', hint: 'اتركها فارغة إن لم تُعدّ' },
        { name: 'price', label: 'السعر (₪)', type: 'number', value: p.price, required: true, attrs: 'min="0" step="0.5"' },
        { name: 'offer', label: 'سعر العرض (₪)', type: 'number', value: p.offer, attrs: 'min="0" step="0.5"', hint: 'اختياري، أقل من السعر' },
        { type: 'html', wide: true, html: `<div id="product-photo">${p.image ? img(p.image) : ''}</div>` },
        { name: 'photo', label: 'صورة المنتج', type: 'file', wide: true, attrs: 'accept="image/jpeg,image/png,image/webp"' },
        { name: 'active', label: 'ظاهر للزبائن', type: 'toggle', value: p.active },
        { name: 'rx', label: 'يحتاج وصفة طبية', type: 'toggle', value: p.rx }
      ], remove: pid ? { label: 'حذف المنتج', confirm: 'حذف «' + p.name + '» نهائيًا؟', run: () => store.remove('products', p.id, 'حُذف المنتج ' + p.name) } : null,
      async submit(v) {
        if (v.offer != null && v.offer >= v.price) throw Error('سعر العرض لازم يكون أقل من السعر الأصلي.');
        const image = v.photo?.size ? await compress(v.photo) : p.image;
        const { photo, ...rest } = v;
        store.upsert('products', { ...p, ...rest, image }, 'حُفظ المنتج ' + v.name);
      } });
    },
    stock(pid) {
      const p = s().products.find((x) => x.id === pid);
      ui.form({ title: 'كمية ' + p.name, fields: [{ name: 'stock', label: 'الكمية', type: 'number', value: p.stock, attrs: 'min="0" step="1"', wide: true }],
        submit: (v) => store.upsert('products', { ...p, stock: v.stock }, 'عُدّلت كمية ' + p.name) });
    },
    dec(pid) {
      const p = s().products.find((x) => x.id === pid);
      if (!p.stock) throw Error('لا توجد كمية لإنقاصها.');
      store.upsert('products', { ...p, stock: p.stock - 1 }, 'نقصت كمية ' + p.name + ' إلى ' + num(p.stock - 1));
    },
    order(oid) {
      const o = s().orders.find((x) => x.id === oid) || { id: id(), date: new Date().toISOString(), status: 'new', channel: 'store', branch: s().branches[0]?.id };
      ui.form({ title: oid ? 'تعديل الطلب' : 'تسجيل طلب', fields: [
        { name: 'ref', label: 'رقم الطلب', value: o.ref || 'Z' + Date.now().toString(36).toUpperCase().slice(-6), required: true, attrs: 'maxlength="40" pattern="[A-Za-z0-9_-]+" dir="ltr"' },
        { name: 'total', label: 'الإجمالي (₪)', type: 'number', value: o.total, required: true, attrs: 'min="0" step="0.5"' },
        { name: 'branch', label: 'الفرع', type: 'select', options: Object.fromEntries(s().branches.map((b) => [b.id, b.name])), value: o.branch },
        { name: 'channel', label: 'القناة', type: 'select', options: enums.channels, value: o.channel },
        { name: 'status', label: 'الحالة', type: 'select', options: enums.orderStates, value: o.status, wide: true }
      ], remove: oid ? { label: 'حذف الطلب', run: () => store.remove('orders', o.id, 'حُذف الطلب ' + o.ref) } : null,
      submit(v) {
        if (s().orders.some((x) => x.id !== o.id && x.ref === v.ref)) throw Error('رقم الطلب مستخدم مسبقًا.');
        store.upsert('orders', { ...o, ...v }, 'حُفظ الطلب ' + v.ref);
      } });
    },
    advance(oid) {
      const o = s().orders.find((x) => x.id === oid);
      const next = o.status === 'new' ? 'preparing' : 'complete';
      store.upsert('orders', { ...o, status: next }, 'الطلب ' + o.ref + ': ' + enums.orderStates[next]);
    },
    settings() {
      const st = s().settings;
      ui.form({ title: 'إعدادات اللوحة', fields: [
        { name: 'name', label: 'اسم الصيدلية', value: st.name, required: true, wide: true, attrs: 'maxlength="80"' },
        { name: 'threshold', label: 'حد تنبيه المخزون', type: 'number', value: st.threshold, required: true, attrs: 'min="0" step="1"' },
        { name: 'whatsapp', label: 'رقم واتساب مع رمز الدولة', type: 'tel', value: '+' + (st.whatsapp || '970599682008'), required: true, attrs: 'dir="ltr" maxlength="30"' }
      ], submit(v) {
        const phone = v.whatsapp.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[\s()-]/g, '').replace(/^(\+|00)/, '');
        if (!/^[1-9][0-9]{7,14}$/.test(phone)) throw Error('أدخل رقمًا دوليًا صحيحًا، مثل ‎+970599682008');
        store.settings({ name: v.name, threshold: v.threshold, whatsapp: phone }, 'حُفظت الإعدادات');
      } });
    },
    export() { ui.download(store.exportJSON(), 'zain-backup-' + q.today() + '.json', 'application/json'); ui.toast('نُزّلت النسخة الاحتياطية'); },
    import() { ui.$('#backup').click(); },
    async demo() { store.replace(Z.data.demo(s()), 'حُمّلت البيانات التجريبية'); },
    async 'clear-demo'() { if (await ui.confirm('حذف كل البيانات التجريبية؟ بياناتك الحقيقية لن تتأثر.')) store.replace(Z.data.clearDemo(s()), 'حُذفت البيانات التجريبية'); }
  };
  const onChange = {
    async backup(input) {
      const file = input.files[0]; input.value = '';
      if (!file) return;
      if (file.size > 2e6) throw Error('الحد الأقصى لملف النسخة ٢ ميغابايت.');
      const data = JSON.parse(await file.text());
      if (await ui.confirm('استبدال كل البيانات الحالية بالنسخة المستوردة؟')) store.replace(data, 'استُعيدت النسخة الاحتياطية');
    }
  };
  document.addEventListener('change', async (e) => {
    if (e.target.name !== 'photo') return;
    const f = e.target.files[0]; const box = ui.$('#product-photo');
    if (!f) return;
    try { box.innerHTML = img(await compress(f)); } catch (ex) { box.textContent = ex.message; e.target.value = ''; }
  });

  ui.start({ store, pages, actions, onChange, subtitle: 'إدارة المتجر',
    assistant: { commands: [
      {label:'المنتجات',create:/^اضف منتج$/,records:()=>s().products.map(p=>({id:p.id,label:p.name})),edit:actions.product},
      {label:'الطلبات',create:/^(اضف|سجل) طلب$/,records:()=>s().orders.map(o=>({id:o.id,label:o.ref+' · '+enums.orderStates[o.status]})),edit:actions.order}
    ], context: q.aiContext, title: 'مساعد المتجر', suggestions: ['لخّصلي مبيعات الأسبوع', 'شو المنتجات اللي لازم نطلبها؟', 'أي فرع أضعف بالمبيعات وليش؟', 'اقترح عروض للأسبوع الجاي'] },
    links: [{ href: '../ibrheam/index.html', label: 'لوحة الفروع والموظفين', icon: 'users' }, { href: '../index.html', label: 'فتح الموقع', icon: 'external' }] });
})(window.Zain);
