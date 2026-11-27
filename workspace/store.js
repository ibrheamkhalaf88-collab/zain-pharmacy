/* Zain admin: data layer.
   One source of truth shared by both dashboards. Pages never touch storage
   directly: they call Zain.store, which validates, logs activity and persists
   through an adapter. Today the adapter is the browser (localStorage); a
   server adapter (e.g. Supabase) can replace it without changing the pages. */
'use strict';
window.Zain = window.Zain || {};
(function (Z) {
  const KEY = 'zain-omar-dashboard-v1';           // kept so existing data survives the redesign
  const SLOT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  const ID = /^[a-z0-9-]{1,80}$/i;

  const enums = {
    categories: { medicines: 'الأدوية', 'mother-child': 'الأم والطفل', devices: 'أجهزة طبية', skincare: 'العناية بالبشرة' },
    orderStates: { new: 'جديد', preparing: 'قيد التجهيز', complete: 'مكتمل', cancelled: 'ملغى' },
    appointmentStates: { booked: 'محجوز', complete: 'مكتمل', cancelled: 'ملغى' },
    roles: { manager: 'مدير فرع', pharmacist: 'صيدلي', assistant: 'مساعد صيدلي', cashier: 'كاشير', delivery: 'توصيل' },
    channels: { store: 'في الفرع', whatsapp: 'واتساب', phone: 'هاتف', web: 'الموقع' }
  };
  const collections = ['products', 'orders', 'branches', 'appointments', 'shifts', 'employees', 'attendance', 'payroll', 'agenda'];
  const PHOTO = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

  /* ---------- validation ---------- */
  const fail = (message) => { throw new Error(message); };
  const nonNegative = (v) => Number.isFinite(v) && v >= 0;
  const text = (v, max = 200) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') fail('ملف البيانات غير صالح.');
    const data = { ...raw };
    for (const key of [...collections, 'activity']) {
      data[key] = data[key] ?? [];
      if (!Array.isArray(data[key]) || data[key].length > 5000 || data[key].some((x) => !x || typeof x !== 'object')) fail('قائمة «' + key + '» غير صالحة.');
    }
    data.settings = { name: 'صيدلية زين', threshold: 5, ...(data.settings || {}) };
    data.version = 2;
    // v1 shifts stored a free-text name; keep it, link to an employee when names match.
    data.shifts = data.shifts.map((s) => {
      if (s.employee) return s;
      const match = data.employees.find((e) => e.name === s.name);
      return match ? { ...s, employee: match.id } : s;
    });
    data.orders = data.orders.map((o) => ({ channel: 'store', ...o }));
    return validate(data);
  }

  function validate(d) {
    const s = d.settings;
    if (!text(s.name, 80) || !Number.isInteger(s.threshold) || s.threshold < 0) fail('الإعدادات غير صالحة.');
    if (s.whatsapp != null && !/^[1-9][0-9]{7,14}$/.test(s.whatsapp)) fail('رقم واتساب غير صالح.');
    for (const key of collections) {
      const ids = d[key].map((x) => x.id);
      if (ids.some((id) => typeof id !== 'string' || !ID.test(id)) || new Set(ids).size !== ids.length) fail('معرّفات «' + key + '» غير صالحة.');
    }
    const branchIds = new Set(d.branches.map((b) => b.id));
    const employeeIds = new Set(d.employees.map((e) => e.id));
    const salaries = new Set();
    for (const row of d.payroll) {
      if (!employeeIds.has(row.employee) || !['salary','advance','payment'].includes(row.kind) ||
          !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month) || !Number.isSafeInteger(row.cents) || row.cents <= 0 ||
          !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) fail('راجع الموظف والشهر والمبلغ وتاريخ الحركة.');
      if (row.kind === 'salary') {
        const key = row.employee + '/' + row.month;
        if (salaries.has(key)) fail('راتب هذا الشهر مسجل بالفعل. عدّل السجل الموجود.');
        salaries.add(key);
      }
    }
    if (d.agenda.some(a => !text(a.title,120) || !SLOT.test(a.start) || !SLOT.test(a.end) || a.end <= a.start)) fail('راجع عنوان الموعد وبدايته ونهايته.');
    if (d.branches.some((b) => !text(b.name, 80) || (b.photos != null && (!Array.isArray(b.photos) || b.photos.length > 1000 ||
        b.photos.some((p) => typeof p !== 'string' || !ID.test(p)) || new Set(b.photos).size !== b.photos.length)))) fail('بيانات الفروع غير صالحة.');
    if (d.products.some((p) => !text(p.name, 150) || !Object.hasOwn(enums.categories, p.category) || !nonNegative(p.price) ||
        (p.offer != null && (!nonNegative(p.offer) || p.offer >= p.price)) ||
        (p.stock != null && (!Number.isInteger(p.stock) || p.stock < 0)))) fail('تأكد من أسعار المنتجات وكمياتها.');
    if (d.orders.some((o) => !Object.hasOwn(enums.orderStates, o.status) || !nonNegative(o.total) || typeof o.ref !== 'string' ||
        Number.isNaN(Date.parse(o.date)) || (o.branch && !branchIds.has(o.branch)))) fail('بيانات الطلبات غير صالحة.');
    if (d.appointments.some((a) => !Object.hasOwn(enums.appointmentStates, a.status) || typeof a.ref !== 'string' ||
        !branchIds.has(a.branch) || !SLOT.test(a.slot))) fail('بيانات المواعيد غير صالحة.');
    if (d.employees.some((e) => !text(e.name, 80) || !Object.hasOwn(enums.roles, e.role) || !branchIds.has(e.branch) ||
        (e.nationalId && !/^[0-9]{9}$/.test(e.nationalId)) || (e.photo && (e.photo.length > 120000 || !PHOTO.test(e.photo))) ||
        (e.weeklyTarget != null && (!Number.isInteger(e.weeklyTarget) || e.weeklyTarget < 1 || e.weeklyTarget > 84)))) fail('بيانات الموظفين غير صالحة.');
    if (d.attendance.some((a) => !employeeIds.has(a.employee) || !branchIds.has(a.branch) || Number.isNaN(Date.parse(a.in)) ||
        (a.out != null && !(Date.parse(a.out) > Date.parse(a.in))))) fail('بيانات الحضور غير صالحة.');
    if (d.shifts.some((x) => !branchIds.has(x.branch) || !SLOT.test(x.start) || !SLOT.test(x.end) || x.end <= x.start ||
        (x.employee ? !employeeIds.has(x.employee) : !text(x.name, 80)))) fail('بيانات المناوبات غير صالحة.');
    return d;
  }

  /* ---------- adapters ---------- */
  const LocalAdapter = {
    label: 'محفوظ على هذا الجهاز',
    load() { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; },
    save(data) { localStorage.setItem(KEY, JSON.stringify(data)); },
    watch(onChange) {
      window.addEventListener('storage', (event) => {
        if (event.key !== KEY || !event.newValue) return;
        let data;
        try { data = JSON.parse(event.newValue); } catch { return; }
        onChange(data);
      });
    }
  };

  /* ---------- store ---------- */
  function createStore(adapter, seed) {
    let state;
    const listeners = new Set();
    let loadError = '';
    try { state = normalize(adapter.load() || structuredClone(seed)); }
    catch (e) { loadError = 'تعذّر قراءة البيانات المحفوظة، تم تحميل بيانات البداية.'; state = normalize(structuredClone(seed)); }

    const emit = (message) => listeners.forEach((fn) => fn(state, message));
    function commit(next, message) {
      next.activity = [{ text: message, date: new Date().toISOString() }, ...next.activity].slice(0, 300);
      const validated = validate(next);
      adapter.save(validated);
      state = validated;
      emit(message);
    }
    adapter.watch?.((raw) => { try { state = normalize(raw); emit(''); } catch { /* ignore foreign writes */ } });

    return {
      get state() { return state; },
      loadError,
      adapterLabel: adapter.label,
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      upsert(key, record, message) {
        const next = structuredClone(state);
        const i = next[key].findIndex((x) => x.id === record.id);
        if (i < 0) next[key].push(record); else next[key][i] = record;
        commit(next, message);
      },
      remove(key, id, message) {
        if (key === 'employees' && state.payroll.some(r => r.employee === id)) fail('لهذا الموظف سجل مالي. يمكنك إيقافه مع الاحتفاظ بسجله.');
        const next = structuredClone(state);
        next[key] = next[key].filter((x) => x.id !== id);
        if (key === 'employees') { next.shifts = next.shifts.filter((s) => s.employee !== id); next.attendance = next.attendance.filter((a) => a.employee !== id); }
        commit(next, message);
      },
      settings(patch, message) { commit({ ...structuredClone(state), settings: { ...state.settings, ...patch } }, message); },
      replace(raw, message) { const next = normalize(raw); next.activity = state.activity; commit(next, message); },
      exportJSON() { return JSON.stringify(state, null, 2); }
    };
  }

  /* ---------- queries (pure, reused by every page) ---------- */
  const GAZA = 'Asia/Gaza';
  const dayKey = (date) => new Intl.DateTimeFormat('sv-SE', { timeZone: GAZA }).format(date);
  const q = {
    dayKey,
    today: () => dayKey(new Date()),
    lastDays(n) {
      const out = []; const now = Date.now();
      for (let i = n - 1; i >= 0; i--) out.push(dayKey(new Date(now - i * 864e5)));
      return out;
    },
    isOpen: (o) => o.status === 'new' || o.status === 'preparing',
    lowStock: (s) => s.products.filter((p) => p.active && p.stock != null && p.stock <= s.settings.threshold),
    offers: (s) => s.products.filter((p) => p.active && p.offer != null),
    orderDay: (o) => dayKey(new Date(o.date)),
    revenueByDay(s, days) {
      const map = Object.fromEntries(days.map((d) => [d, 0]));
      for (const o of s.orders) if (o.status === 'complete') { const d = q.orderDay(o); if (d in map) map[d] += o.total; }
      return days.map((d) => ({ x: d, y: Math.round(map[d] * 100) / 100 }));
    },
    countByDay(items, days, getDay) {
      const map = Object.fromEntries(days.map((d) => [d, 0]));
      for (const it of items) { const d = getDay(it); if (d in map) map[d]++; }
      return days.map((d) => ({ x: d, y: map[d] }));
    },
    branchName: (s, id) => s.branches.find((b) => b.id === id)?.name || '—',
    employeeName: (s, shift) => s.employees.find((e) => e.id === shift.employee)?.name || shift.name || '—',
    openAttendance: (s, empId) => s.attendance.find((a) => a.employee === empId && !a.out),
    hoursSince(s, empId, sinceMs) {
      const now = Date.now();
      return s.attendance.filter((a) => a.employee === empId).reduce((sum, a) => {
        const from = Math.max(Date.parse(a.in), sinceMs), to = a.out ? Date.parse(a.out) : now;
        return sum + Math.max(0, to - from) / 36e5;
      }, 0);
    },
    shiftsOn: (s, day) => s.shifts.filter((x) => x.start.slice(0, 10) <= day && x.end.slice(0, 10) >= day)
  };

  /* ---------- AI context: compact summary, no IDs/phones/photos ---------- */
  q.aiContext = (s) => {
    const today = q.today(); const days7 = q.lastDays(7); const now = Date.now();
    const done = (o) => o.status === 'complete';
    const sum = (list) => Math.round(list.reduce((a, o) => a + o.total, 0));
    const time = (iso) => iso ? new Intl.DateTimeFormat('en-GB', { timeZone: GAZA, hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : null;
    const emp = (e) => {
      const att = s.attendance.filter((a) => a.employee === e.id);
      const todays = att.filter((a) => dayKey(new Date(a.in)) === today).sort((a, b) => a.in.localeCompare(b.in));
      return { name: e.name, role: enums.roles[e.role], branch: q.branchName(s, e.branch), active: e.active !== false,
        onDutyNow: !!q.openAttendance(s, e.id), hoursLast7Days: Math.round(q.hoursSince(s, e.id, now - 7 * 864e5)), weeklyTarget: e.weeklyTarget || 48,
        checkInToday: time(todays[0]?.in), checkOutToday: time(todays[todays.length - 1]?.out) };
    };
    return {
      pharmacy: s.settings.name, today, nowGaza: time(new Date().toISOString()), currency: 'ILS', lowStockThreshold: s.settings.threshold,
      branches: s.branches.map((b) => { const os = s.orders.filter((o) => o.branch === b.id);
        return { name: b.name, city: b.city, hours: b.hours, openOrders: os.filter(q.isOpen).length,
          salesToday: sum(os.filter((o) => done(o) && q.orderDay(o) === today)), salesLast7Days: sum(os.filter((o) => done(o) && days7.includes(q.orderDay(o)))),
          staff: s.employees.filter((e) => e.branch === b.id && e.active !== false).length,
          onDutyNow: s.attendance.filter((a) => !a.out && a.branch === b.id).map((a) => s.employees.find((e) => e.id === a.employee)?.name).filter(Boolean) }; }),
      salesByDayLast14: q.revenueByDay(s, q.lastDays(14)).map((d) => ({ day: d.x, total: d.y })),
      ordersLast7Days: { byStatus: Object.fromEntries(Object.entries(enums.orderStates).map(([k, l]) => [l, s.orders.filter((o) => o.status === k && days7.includes(q.orderDay(o))).length])),
        byChannel: Object.fromEntries(Object.entries(enums.channels).map(([k, l]) => [l, s.orders.filter((o) => o.channel === k && days7.includes(q.orderDay(o))).length])) },
      products: s.products.slice(0, 200).map((p) => ({ name: p.name, category: enums.categories[p.category], price: p.price, offer: p.offer ?? null, stock: p.stock ?? 'غير محدد', visible: p.active, needsPrescription: !!p.rx })),
      lowStock: q.lowStock(s).map((p) => ({ name: p.name, stock: p.stock })),
      employees: s.employees.slice(0, 150).map(emp),
      shiftsTodayAndTomorrow: [...q.shiftsOn(s, today), ...q.shiftsOn(s, dayKey(new Date(now + 864e5)))].slice(0, 120)
        .map((x) => ({ employee: q.employeeName(s, x), branch: q.branchName(s, x.branch), from: x.start.replace('T', ' '), to: x.end.replace('T', ' ') }))
    };
  };

  /* ---------- demo data (clearly flagged, removable) ---------- */
  function demo(state) {
    const next = structuredClone(state);
    const rnd = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
    const pick = (arr) => arr[rnd(0, arr.length - 1)];
    const id = () => crypto.randomUUID();
    const branches = next.branches.map((b) => b.id);
    const names = ['أحمد سالم', 'سارة خليل', 'محمد العطار', 'رنا حمدان', 'يوسف شعت', 'لينا أبو سعدة', 'خالد نصار', 'هبة الشوا'];
    const roles = ['pharmacist', 'pharmacist', 'assistant', 'cashier', 'manager', 'pharmacist', 'assistant', 'delivery'];
    names.forEach((name, i) => next.employees.push({ id: id(), demo: true, name, role: roles[i], branch: branches[i % branches.length], phone: '', active: true }));
    next.products = next.products.map((p) => ({ ...p, stock: p.stock ?? rnd(0, 40) }));
    const states = ['complete', 'complete', 'complete', 'complete', 'preparing', 'new', 'cancelled'];
    const channels = Object.keys(enums.channels);
    for (let d = 29; d >= 0; d--) {
      const count = rnd(3, 11);
      for (let k = 0; k < count; k++) {
        const date = new Date(Date.now() - d * 864e5 - rnd(0, 10) * 36e5);
        next.orders.push({ id: id(), demo: true, ref: 'D' + date.getTime().toString(36).toUpperCase() + k, branch: pick(branches),
          total: rnd(15, 260), status: d > 1 ? pick(states.slice(0, 4).concat('cancelled')) : pick(states), channel: pick(channels), date: date.toISOString() });
      }
    }
    const staff = next.employees.filter((e) => e.demo && e.role !== 'delivery');
    for (let d = -1; d <= 6; d++) {
      const day = dayKey(new Date(Date.now() + d * 864e5));
      staff.forEach((e, i) => {
        const morning = (i + d) % 2 === 0;
        next.shifts.push({ id: id(), demo: true, employee: e.id, branch: e.branch,
          start: day + (morning ? 'T08:00' : 'T15:00'), end: day + (morning ? 'T15:00' : 'T23:00') });
      });
    }
    // Demo attendance follows demo shifts, with a few minutes of natural drift.
    next.employees.forEach((e) => { if (e.demo) { e.nationalId = String(rnd(400000000, 499999999)); e.phone = '059' + rnd(1000000, 9999999); e.weeklyTarget = 48; } });
    for (let d = -6; d <= 0; d++) {
      const day = dayKey(new Date(Date.now() + d * 864e5));
      staff.forEach((e, i) => {
        if (d < 0 && (i + d) % 5 === 0) return; // an occasional day off
        const morning = (i + d) % 2 === 0;
        const start = new Date(day + (morning ? 'T08:00:00+02:00' : 'T15:00:00+02:00')).getTime() + rnd(-8, 12) * 6e4;
        const end = new Date(day + (morning ? 'T15:00:00+02:00' : 'T23:00:00+02:00')).getTime() + rnd(-5, 15) * 6e4;
        if (start > Date.now()) return;
        next.attendance.push({ id: id(), demo: true, employee: e.id, branch: e.branch, in: new Date(start).toISOString(), out: end < Date.now() ? new Date(end).toISOString() : null });
      });
    }
    return next;
  }
  function clearDemo(state) {
    const next = structuredClone(state);
    for (const key of collections) next[key] = next[key].filter((x) => !x.demo);
    return next;
  }

  Z.enums = enums;
  Z.q = q;
  Z.data = { createStore, LocalAdapter, demo, clearDemo, normalize };
})(window.Zain);
