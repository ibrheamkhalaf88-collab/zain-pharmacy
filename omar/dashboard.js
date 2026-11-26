'use strict';
const $ = (selector) => document.querySelector(selector);
const defaultWhatsApp = '970599682008';
const storageKey = 'zain-omar-dashboard-v1';
const categories = { medicines:'الأدوية', 'mother-child':'الأم والطفل', devices:'أجهزة طبية', skincare:'العناية بالبشرة' };
const appointmentStates = { booked:'محجوز', complete:'مكتمل', cancelled:'ملغى' };
const orderStates = { new:'جديد', preparing:'قيد التجهيز', complete:'مكتمل', cancelled:'ملغى' };
const branchDashboard = document.body.dataset.dashboard === 'branches';
const pages = { home:'نظرة عامة', products:'المنتجات', inventory:'المخزون', offers:'العروض', orders:'الطلبات', whatsapp:'طلبات واتساب', branches:'الفروع', activity:'سجل التغييرات', settings:'الإعدادات والنسخ الاحتياطي' };
const managerPages = {home:'نظرة عامة', branches:'الفروع', appointments:'المواعيد', shifts:'مناوبات الصيادلة', orders:'الطلبات', assistant:'الذكاء الاصطناعي'};
const navigationIcons = {home:'▦',products:'▤',inventory:'▥',offers:'٪',orders:'≡',whatsapp:'◉',branches:'⌂',appointments:'◷',shifts:'▣',assistant:'✦',activity:'↻',settings:'⚙'};
const navigation = branchDashboard ? managerPages : pages;
const money = (value) => value == null ? '—' : new Intl.NumberFormat('ar',{style:'currency',currency:'ILS'}).format(value);
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const identifier = () => crypto.randomUUID();
let state = structuredClone(window.dashboardSeed);
state.appointments = [];
state.shifts = [];
let query = '';
let category = '';
let saveEditor;
try {
  const saved = localStorage.getItem(storageKey);
  if (saved) state = readBackup(JSON.parse(saved));
} catch { $('#status').textContent = 'تعذّر قراءة النسخة المحلية. تم تحميل بيانات البداية.'; }

function readBackup(data) {
  if (!data || !['products','orders','branches','activity'].every((key) => Array.isArray(data[key]) && data[key].length <= 5000 && data[key].every((item) => item && typeof item === 'object')) ||
      !data.settings || typeof data.settings.name !== 'string' || !Number.isInteger(data.settings.threshold) || data.settings.threshold < 0) throw Error('ملف النسخة الاحتياطية غير صالح.');
  if (data.settings.whatsapp != null && (typeof data.settings.whatsapp !== 'string' || !/^[1-9][0-9]{7,14}$/.test(data.settings.whatsapp))) throw Error('رقم واتساب في النسخة غير صالح.');
  for (const key of ['products','orders','branches']) {
    const ids = data[key].map((item) => item.id);
    if (ids.some((id) => typeof id !== 'string' || !/^[a-z0-9-]{1,80}$/i.test(id)) || new Set(ids).size !== ids.length) throw Error('معرّفات السجلات غير صالحة.');
  }
  const nonnegative = (value) => Number.isFinite(value) && value >= 0;
  if (data.products.some((p) => typeof p.name !== 'string' || !Object.hasOwn(categories,p.category) || !nonnegative(p.price) ||
      (p.offer != null && (!nonnegative(p.offer) || p.offer >= p.price)) || (p.stock != null && (!Number.isInteger(p.stock) || p.stock < 0))) ||
      data.orders.some((o) => !Object.hasOwn(orderStates,o.status) || !nonnegative(o.total) || typeof o.ref !== 'string')) throw Error('تأكد من قيم المنتجات والطلبات في الملف.');
  const appointments = data.appointments ?? [];
  if (!Array.isArray(appointments) || appointments.length > 5000 ||
      appointments.some((item) => !item || typeof item.id !== 'string' ||
        !Object.hasOwn(appointmentStates,item.status) || typeof item.ref !== 'string' ||
        !data.branches.some((branch) => branch.id === item.branch) ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(item.slot)) ||
      new Set(appointments.map((item) => item.id)).size !== appointments.length) throw Error('بيانات المواعيد غير صالحة.');
  const shifts = data.shifts ?? [];
  if (!Array.isArray(shifts) || shifts.length > 5000 || shifts.some((shift) => !shift ||
      typeof shift.id !== 'string' || typeof shift.name !== 'string' ||
      !data.branches.some((branch) => branch.id === shift.branch) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(shift.start) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(shift.end) || shift.end <= shift.start)) throw Error('بيانات المناوبات غير صالحة.');
  return {...data,appointments,shifts};
}

function persist(next, description) {
  next.activity = [{ text:description, date:new Date().toISOString() }, ...next.activity].slice(0, 250);
  localStorage.setItem(storageKey, JSON.stringify(next));
  state = next;
  render();
  $('#status').textContent = description;
}

function update(key, record, label) {
  const next = structuredClone(state);
  const index = next[key].findIndex((item) => item.id === record.id);
  if (index < 0) next[key].push(record);
  else next[key][index] = record;
  persist(next,label);
}

function page() {
  const name = location.hash.slice(1);
  return Object.hasOwn(navigation,name) ? name : 'home';
}
const activeOffers = () => state.products.filter((p) => p.active && p.offer != null);
const lowStock = () => state.products.filter((p) => p.active && p.stock != null && p.stock <= state.settings.threshold);
const row = (cells) => '<tr>' + cells.map((value) => '<td>' + value + '</td>').join('') + '</tr>';
function table(headers, rows, empty = 'لا توجد نتائج.') {
  if (!rows.length) return '<p class="empty">' + empty + '</p>';
  return '<div class="table-wrap"><table><thead><tr>' + headers.map((label) => '<th scope="col">' + label + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
}
const button = (action, label, id = '', style = '') => '<button type="button" class="' + style + '" data-action="' + action + '" data-id="' + escape(id) + '">' + label + '</button>';
const pill = (label, warning = false) => '<span class="pill ' + (warning ? 'warning' : '') + '">' + escape(label) + '</span>';
const panel = (title, body) => '<section class="panel"><h2>' + title + '</h2>' + body + '</section>';
const date = (value) => Number.isNaN(Date.parse(value)) ? '—' : new Date(value).toLocaleString('ar-PS');
const uploadedPhoto = (path) => typeof path === 'string' && path.length <= 150000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(path);
const image = (path) => uploadedPhoto(path) ? '<img src="' + escape(path) + '" alt="">' : typeof path === 'string' && /^assets\/img\/[\w/-]+\.[a-z0-9]+$/i.test(path) ? '<img src="../' + path + '" alt="">' : '';

function overview() {
  const metrics = [
    ['المنتجات النشطة',state.products.filter((p) => p.active).length],
    ['المخزون المنخفض',lowStock().length], ['العروض النشطة',activeOffers().length],
    ['الطلبات المفتوحة',state.orders.filter((o) => ['new','preparing'].includes(o.status)).length],
    ['قيمة الطلبات المكتملة',money(state.orders.filter((o) => o.status === 'complete').reduce((sum,o) => sum + o.total,0))]
  ];
  const cards = metrics.map(([label,value]) => '<div class="metric"><span class="muted">' + label + '</span><strong>' + value + '</strong></div>').join('');
  const warnings = lowStock().slice(0,6).map((p) => '<div class="line"><span>' + escape(p.name) + '</span>' + pill(p.stock,true) + '</div>').join('');
  const counts = Object.entries(orderStates).map(([key,label]) => '<div class="line"><span>' + label + '</span>' + state.orders.filter((o) => o.status === key).length + '</div>').join('');
  return '<div class="metrics">' + cards + '</div><div class="panels">' +
    panel('تنبيهات المخزون', warnings || '<p class="muted">لا توجد تنبيهات في الكميات المسجّلة.</p>') +
    panel('حالات الطلبات',counts) + panel('آخر التعديلات',activity(state.activity.slice(0,5))) + '</div>';
}

function branchOverview() {
  const totals = state.branches.map((branch) => ({
    name:branch.name,
    orders:state.orders.filter((order) => order.branch === branch.id && ['new','preparing'].includes(order.status)).length,
    appointments:state.appointments.filter((item) => item.branch === branch.id && item.status === 'booked').length
  }));
  const maximum = Math.max(1,...totals.flatMap((branch) => [branch.orders,branch.appointments]));
  const bars = totals.map((branch) => '<div class="chart-branch"><h3>' + escape(branch.name) + '</h3>' +
    [['الطلبات المفتوحة',branch.orders,'orders'],['المواعيد المحجوزة',branch.appointments,'appointments']].map(([label,value,key]) =>
      '<div class="chart-line"><span class="chart-label">' + label + '</span><div class="chart-track" aria-hidden="true"><div class="chart-bar chart-' +
      key + '" style="--bar-width:' + (value / maximum * 100) + '%"></div></div><strong>' + value + '</strong></div>').join('') + '</div>').join('');
  const metrics = [
    ['الفروع',totals.length,'branches'],['الطلبات المفتوحة',totals.reduce((sum,branch) => sum + branch.orders,0),'orders'],
    ['المواعيد المحجوزة',totals.reduce((sum,branch) => sum + branch.appointments,0),'appointments'],
    ['مناوبات مسجّلة',state.shifts.length,'shifts']
  ];
  return '<div class="metrics manager-metrics">' + metrics.map(([label,value,section]) => '<a class="metric" href="#' + section +
    '"><span class="muted">' + label + '</span><strong>' + value + '</strong></a>').join('') + '</div><div class="panels manager-panels">' +
    panel('مقارنة النشاط بين الفروع',bars || '<p class="empty">أضف فرعًا لعرض النشاط.</p>') +
    panel('متابعة العمل','<div class="manager-actions"><a href="#appointments">إدارة المواعيد</a><a href="#shifts">تنظيم المناوبات</a><a href="#assistant">الذكاء الاصطناعي</a></div>' +
      '<div class="line">' + button('daily-report','تنزيل تقرير اليوم') + '</div>') + '</div>';
}

function catalog(view) {
  const filtered = state.products.filter((p) => (!category || p.category === category) &&
    (!query || p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())) && (view !== 'offers' || p.offer != null));
  const rows = filtered.map((p) => {
    const product = '<span class="product">' + image(p.image) + escape(p.name) + '</span>';
    const stock = p.stock == null ? 'غير محدد' : pill(p.stock, p.stock <= state.settings.threshold);
    if (view === 'inventory') return row([product, stock, button('stock','تعديل الكمية',p.id)]);
    if (view === 'offers') return row([product,money(p.price),money(p.offer),pill(p.active ? 'نشط' : 'موقوف'),button('product','تعديل العرض',p.id)]);
    return row([product,escape(categories[p.category]),money(p.price),pill(p.active ? 'نشط' : 'موقوف'),p.rx ? 'نعم' : '—',button('product','تعديل',p.id)]);
  });
  return table(view === 'inventory' ? ['المنتج','الكمية','الإجراء'] : view === 'offers' ? ['المنتج','السعر','العرض','الحالة','الإجراء'] : ['المنتج','القسم','السعر','الحالة','وصفة','الإجراء'],rows);
}

function activity(items) {
  return items.map((item) => '<div class="line"><span>' + escape(item.text) + '</span><small>' + date(item.date) + '</small></div>').join('') || '<p class="muted">لا توجد تعديلات مسجّلة.</p>';
}

function render() {
  const current = page();
  $('#brand-name').textContent = state.settings.name;
  $('#title').textContent = navigation[current];
  $('#nav').innerHTML = Object.entries(navigation).map(([key,label]) => '<a href="#' + key + '"' + (key === current ? ' aria-current="page"' : '') +
    '><span class="nav-icon" aria-hidden="true">' + navigationIcons[key] + '</span>' + label + '</a>').join('');
  const content = $('#content');
  if (current === 'home') content.innerHTML = branchDashboard ? branchOverview() : overview();
  else if (['products','inventory','offers'].includes(current)) {
    content.innerHTML = '<section class="panel"><div class="toolbar"><div class="group"><input id="query" type="search" placeholder="ابحث عن منتج" aria-label="ابحث عن منتج"><select id="category" aria-label="القسم"><option value="">كل الأقسام</option>' + options(categories,category) + '</select></div>' + (current === 'products' ? button('product','إضافة منتج','','primary') : current === 'offers' ? '<a href="#products">إضافة عرض من المنتجات</a>' : '') + '</div><div id="catalog"></div></section>';
    $('#query').value = query;
    $('#catalog').innerHTML = catalog(current);
  } else if (current === 'orders') {
    const rows = state.orders.map((o) => row([escape(o.ref),escape(state.branches.find((b) => b.id === o.branch)?.name || '—'),money(o.total),pill(orderStates[o.status]),date(o.date),button('order','تعديل',o.id)]));
    content.innerHTML = '<section class="panel"><div class="toolbar"><h2>الطلبات المسجّلة يدويًا</h2>' + button('order','تسجيل طلب','','primary') + '</div>' + table(['المرجع','الفرع','الإجمالي','الحالة','التاريخ','الإجراء'],rows,'لا توجد طلبات مسجّلة.') + '</section>';
  } else if (current === 'whatsapp') {
    const phone = state.settings.whatsapp || defaultWhatsApp;
    const url = 'https://wa.me/' + phone;
    content.innerHTML = panel('رقم استقبال طلبات واتساب',
      '<p class="muted">أدخل الرقم بصيغة دولية. الرابط يفتح مسودة رسالة في واتساب.</p>' +
      '<div class="line"><bdi>+' + phone + '</bdi>' + button('whatsapp','تغيير الرقم','','primary') + '</div>' +
      '<div class="line"><a target="_blank" rel="noopener noreferrer" href="' + url + '?text=' +
      encodeURIComponent('مرحبًا صيدلية زين، أريد الاستفسار عن طلب.') + '">فتح رسالة طلب في واتساب ↗</a></div>' +
      '<div class="line"><a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a></div>');
  } else if (current === 'branches') {
    content.innerHTML = '<div class="toolbar"><p class="muted">' + state.branches.length + ' فروع مسجّلة</p>' + button('branch','إضافة فرع','','primary') +
      '</div><div class="panels branch-grid">' + state.branches.map((b) => panel(escape(b.name), '<p>' + escape(b.city) + ' · ' + escape(b.address) +
      '</p><div class="line"><bdi>' + escape(b.hours) + '</bdi><bdi>' + escape(b.phone) + '</bdi></div><div class="line">' +
      button('branch','تعديل الفرع',b.id) + '</div>')).join('') + '</div>';
  } else if (current === 'appointments') {
    const items = [...state.appointments].sort((a,b) => a.slot.localeCompare(b.slot));
    const rows = items.map((item) => row([escape(item.ref),escape(state.branches.find((branch) => branch.id === item.branch)?.name),escape(item.slot.replace('T',' · ')),pill(appointmentStates[item.status]),button('appointment','تعديل',item.id)]));
    content.innerHTML = '<section class="panel"><div class="toolbar"><h2>مواعيد الفروع · توقيت غزة</h2>' +
      button('appointment','حجز موعد','','primary') + '</div>' +
      table(['المرجع الداخلي','الفرع','الموعد','الحالة','الإجراء'],rows,'لا توجد مواعيد بعد.') + '</section>';
  } else if (current === 'shifts') {
    const shifts = [...state.shifts].sort((a,b) => a.start.localeCompare(b.start));
    const rows = shifts.map((shift) => row([escape(shift.name),escape(state.branches.find((branch) => branch.id === shift.branch)?.name),
      escape(shift.start.replace('T',' · ')),escape(shift.end.replace('T',' · ')),button('shift','تعديل',shift.id)]));
    content.innerHTML = '<section class="panel"><div class="toolbar"><h2>مناوبات الفروع · توقيت غزة</h2>' +
      button('shift','إضافة مناوبة','','primary') + '</div>' +
      table(['الصيدلي','الفرع','البداية','النهاية','الإجراء'],rows,'لا توجد مناوبات مسجّلة.') + '</section>';
  } else if (current === 'assistant') {
    const rows = state.branches.map((branch) => {
      const open = state.orders.filter((order) => order.branch === branch.id && ['new','preparing'].includes(order.status)).length;
      const booked = state.appointments.filter((item) => item.branch === branch.id && item.status === 'booked').length;
      return row([escape(branch.name),open,booked]);
    });
    content.innerHTML = '<section class="ai-card"><div class="ai-heading"><span class="ai-icon" aria-hidden="true">✦</span><div><h2>مساعد المدير</h2>' +
      '<p>اختر تحليلًا لأعداد الطلبات والمواعيد وتنبيهات المخزون باستخدام Gemini.</p></div></div>' +
      '<div class="ai-controls"><label for="ai-topic">نوع التحليل</label><select id="ai-topic"><option value="overview">ملخص الفروع</option>' +
      '<option value="appointments">ضغط المواعيد</option><option value="inventory">تنبيهات المخزون</option></select>' +
      button('analyze','اطلب تحليلًا','','primary') + '</div><div id="ai-answer" role="status" aria-live="polite"></div></section>' +
      '<div class="panels ai-details">' + panel('موجز تشغيل الفروع',table(['الفرع','الطلبات المفتوحة','المواعيد المحجوزة'],rows) +
      '<div class="line">' + button('daily-report','تنزيل تقرير اليوم') + '</div>') +
      panel('تنبيهات المخزون','<p>منتجات تحت حد التنبيه: ' + lowStock().length + '</p><div class="line"><a href="../omar/index.html#inventory">فتح المخزون</a></div>') + '</div>';
  } else if (current === 'activity') content.innerHTML = panel('سجل التغييرات المحلية',activity(state.activity));
  else content.innerHTML = '<div class="panels">' + panel('إعدادات اللوحة','<p>حد تنبيه المخزون: ' + state.settings.threshold + '</p><div class="line">' + button('settings','تعديل الإعدادات') + '</div>') +
    panel('نسخة احتياطية','<p class="muted">استيراد نسخة يستبدل بيانات هذه المعاينة.</p><div class="line">' + button('export','تصدير JSON') + button('import','استيراد JSON') + '<input type="file" id="backup" accept=".json,application/json" hidden></div>') + '</div>';
}

function options(items, selected) {
  return Object.entries(items).map(([key,label]) => '<option value="' + escape(key) + '"' + (key === selected ? ' selected' : '') + '>' + escape(label) + '</option>').join('');
}
function input(name,label,value = '',attributes = 'required maxlength="150"') {
  return '<label>' + label + '<input name="' + name + '" value="' + escape(value) + '" ' + attributes + '></label>';
}
function select(name,label,items,value) {
  return '<label>' + label + '<select name="' + name + '" required>' + options(items,value) + '</select></label>';
}
function editor(title, fields, handle) {
  $('#editor-title').textContent = title;
  $('#fields').innerHTML = fields;
  saveEditor = handle;
  $('#editor').showModal();
}
const amount = 'type="number" min="0" step="0.01"';
const quantity = 'type="number" min="0" step="1"';
const number = (form,key) => form.get(key) === '' ? null : Number(form.get(key));
async function productPhoto(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 8_000_000) {
    throw Error('اختر صورة JPG أو PNG أو WebP بحجم أقل من 8 ميغابايت.');
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1,400 / Math.max(bitmap.width,bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1,Math.round(bitmap.width * scale));
    canvas.height = Math.max(1,Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d',{alpha:false});
    context.fillStyle = '#fff';
    context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const result = canvas.toDataURL('image/jpeg',0.72);
    if (!uploadedPhoto(result)) throw Error('تعذّر تجهيز الصورة. جرّب صورة أصغر.');
    return result;
  } finally { bitmap.close(); }
}

function edit(action,id) {
  if (action === 'product' || action === 'stock') {
    const p = state.products.find((item) => item.id === id) || {id:identifier(), active:true};
    const imageField = '<div id="product-photo">' + image(p.image) + '</div>' +
      '<label>صورة المنتج<input type="file" name="photo" accept="image/jpeg,image/png,image/webp"></label>' +
      (p.image ? '<label><span><input type="checkbox" name="removePhoto"> إزالة الصورة الحالية</span></label>' : '');
    const stockField = input('stock','الكمية',p.stock,quantity);
    if (action === 'stock') {
      editor('تعديل كمية ' + p.name,stockField,(form) => update('products',{...p,stock:number(form,'stock')},'تم تعديل كمية ' + p.name));
      return;
    }
    editor(id ? 'تعديل المنتج' : 'إضافة منتج', input('name','اسم المنتج',p.name) + select('category','القسم',categories,p.category) +
      input('price','السعر (₪)',p.price,amount + ' required') + input('offer','سعر العرض (₪)',p.offer,amount) + stockField + imageField +
      select('active','حالة المنتج',{yes:'نشط',no:'موقوف'},p.active ? 'yes' : 'no') + select('rx','يتطلب وصفة',{no:'لا',yes:'نعم'},p.rx ? 'yes' : 'no'),async (form) => {
      const price = number(form,'price');
      const offer = number(form,'offer');
      const name = form.get('name').trim();
      if (!name) throw Error('أدخل اسم المنتج.');
      if (offer != null && offer >= price) throw Error('سعر العرض لازم يكون أقل من السعر الأساسي.');
      const file = form.get('photo');
      const photo = file?.size ? await productPhoto(file) : form.has('removePhoto') ? undefined : p.image;
      update('products',{...p,image:photo,name,price,offer,category:form.get('category'),stock:number(form,'stock'),active:form.get('active') === 'yes',rx:form.get('rx') === 'yes'},'تم حفظ المنتج ' + name);
    });
  } else if (action === 'branch') {
    const b = state.branches.find((item) => item.id === id) || {id:identifier()};
    const labels = {name:'اسم الفرع',city:'المدينة',address:'العنوان',hours:'ساعات الدوام',phone:'الهاتف'};
    editor(id ? 'تعديل الفرع' : 'إضافة فرع',Object.entries(labels).map(([key,label]) => input(key,label,b[key])).join(''),(form) => {
      update('branches',{...b,...Object.fromEntries(form)},'تم حفظ الفرع ' + form.get('name'));
    });
  } else if (action === 'order') {
    const o = state.orders.find((item) => item.id === id) || {id:identifier(),date:new Date().toISOString()};
    const branches = Object.fromEntries(state.branches.map((b) => [b.id,b.name]));
    editor(id ? 'تعديل الطلب' : 'تسجيل طلب',input('ref','رقم الطلب الداخلي',o.ref,'required maxlength="40" pattern="[A-Za-z0-9_-]+"') +
      select('branch','الفرع',branches,o.branch) + input('total','الإجمالي (₪)',o.total,amount + ' required') + select('status','الحالة',orderStates,o.status),(form) => {
      if (state.orders.some((item) => item.id !== o.id && item.ref === form.get('ref'))) throw Error('رقم الطلب مستخدم.');
      update('orders',{...o,...Object.fromEntries(form),total:number(form,'total')},'تم حفظ الطلب ' + form.get('ref'));
    });
  } else if (action === 'shift') {
    const shift = state.shifts.find((item) => item.id === id) || {id:identifier()};
    const branches = Object.fromEntries(state.branches.map((branch) => [branch.id,branch.name]));
    editor(id ? 'تعديل مناوبة' : 'إضافة مناوبة',input('name','اسم الصيدلي',shift.name) +
      select('branch','الفرع',branches,shift.branch) + input('start','بداية المناوبة',shift.start,'type="datetime-local" required') +
      input('end','نهاية المناوبة',shift.end,'type="datetime-local" required'),(form) => {
      const next = {...shift,...Object.fromEntries(form)};
      next.name = next.name.trim();
      if (!next.name || next.end <= next.start) throw Error('أدخل اسم الصيدلي ونهاية بعد وقت البداية.');
      if (state.shifts.some((item) => item.id !== next.id && item.name.toLocaleLowerCase() === next.name.toLocaleLowerCase() &&
          item.start < next.end && next.start < item.end)) throw Error('الصيدلي لديه مناوبة أخرى خلال نفس الفترة.');
      update('shifts',next,'تم حفظ المناوبة.');
    });
  } else if (action === 'appointment') {
    const appointment = state.appointments.find((item) => item.id === id) || {id:identifier()};
    const branches = Object.fromEntries(state.branches.map((branch) => [branch.id,branch.name]));
    editor(id ? 'تعديل موعد' : 'حجز موعد',input('ref','مرجع داخلي للموعد',appointment.ref,'required maxlength="40"') +
      select('branch','الفرع',branches,appointment.branch) + input('slot','التاريخ والساعة بتوقيت غزة',appointment.slot,'type="datetime-local" required') +
      select('status','الحالة',appointmentStates,appointment.status),(form) => {
      const next = {...appointment,...Object.fromEntries(form)};
      next.ref = next.ref.trim();
      if (!next.ref) throw Error('أدخل مرجع الموعد.');
      if (next.status === 'booked' && state.appointments.some((item) => item.id !== next.id &&
          item.status === 'booked' && item.branch === next.branch && item.slot === next.slot)) throw Error('هذا الوقت محجوز في الفرع.');
      update('appointments',next,'تم حفظ الموعد.');
    });
  } else if (action === 'whatsapp') {
    editor('تغيير رقم واتساب',input('whatsapp','الرقم مع رمز الدولة','+' + (state.settings.whatsapp || defaultWhatsApp),'type="tel" dir="ltr" required maxlength="30"'),(form) => {
      const phone = form.get('whatsapp').trim().replace(/[٠-٩]/g,(digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
        .replace(/[۰-۹]/g,(digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[\s()-]/g,'').replace(/^(\+|00)/,'');
      if (!/^[1-9][0-9]{7,14}$/.test(phone)) throw Error('أدخل رقمًا دوليًا صحيحًا مع رمز الدولة.');
      persist({...structuredClone(state),settings:{...state.settings,whatsapp:phone}},'تم حفظ رقم واتساب محليًا.');
    });
  } else {
    editor('إعدادات اللوحة',input('name','اسم الإدارة',state.settings.name) + input('threshold','حد تنبيه المخزون',state.settings.threshold,quantity + ' required'),(form) => {
      persist({...structuredClone(state),settings:{...state.settings,name:form.get('name').trim(),threshold:number(form,'threshold')}},'تم حفظ الإعدادات.');
    });
  }
}

async function requestAnalysis(topic, conversation = []) {
  if (location.protocol !== 'https:') throw Error('Gemini يحتاج نسخة Cloudflare الآمنة وتسجيل دخول المدير.');
  const branches = Object.fromEntries(['remal','jundi','deir-hospital','deir-madfa'].map((id) => [id,{
    orders:state.orders.filter((order) => order.branch === id && ['new','preparing'].includes(order.status)).length,
    appointments:state.appointments.filter((item) => item.branch === id && item.status === 'booked').length
  }]));
  const headers = {'Content-Type':'application/json'};
  const key = $('#chat-key')?.value.trim();
  const model = $('#chat-model')?.value.trim();
  if (key && !/^[A-Za-z0-9._-]{16,200}$/.test(key)) throw Error('تحقق من مفتاح Gemini في الإعدادات.');
  if (model && !/^gemini-[a-z0-9.-]{1,92}$/.test(model)) throw Error('تحقق من معرّف نموذج Gemini في الإعدادات.');
  if (key) headers['X-Manager-Gemini-Key'] = key;
  if (model) headers['X-Manager-Gemini-Model'] = model;
  const response = await fetch('/ibrheam/api/assistant',{
    method:'POST',redirect:'error',headers,
    body:JSON.stringify({topic,branches,lowStock:lowStock().length,conversation})
  });
  if (!response.headers.get('Content-Type')?.includes('application/json')) throw Error('اتصال Gemini غير متاح على هذه النسخة.');
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'تعذّر إعداد التحليل.');
  return data.answer;
}

async function analyze(trigger) {
  const output = $('#ai-answer');
  trigger.disabled = true;
  output.textContent = 'جاري إعداد التحليل…';
  try {
    output.textContent = await requestAnalysis($('#ai-topic').value);
  } catch (error) {
    output.textContent = error instanceof TypeError ? 'تعذّر الاتصال. تحقق من تسجيل الدخول إلى لوحة المدير.' : error.message;
  } finally { trigger.disabled = false; }
}

function setupChat() {
  const dialog = $('#manager-chat');
  const launch = $('#chat-launch');
  const input = $('#chat-question');
  const log = $('#chat-log');
  let history = [];
  function message(text, type) {
    const bubble = document.createElement('p');
    bubble.className = 'chat-message chat-' + type;
    bubble.textContent = text;
    log.append(bubble);
    log.scrollTop = log.scrollHeight;
    return bubble;
  }
  launch.addEventListener('click',() => {
    if (dialog.open) { dialog.close(); return; }
    dialog.show();
    launch.setAttribute('aria-expanded','true');
    input.focus();
  });
  $('#chat-close').addEventListener('click',() => dialog.close());
  $('#chat-forget').addEventListener('click',() => { $('#chat-key').value = ''; $('#chat-key').focus(); });
  dialog.addEventListener('close',() => { launch.setAttribute('aria-expanded','false'); launch.focus(); });
  dialog.addEventListener('keydown',(event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dialog.close(); }
  });
  $('#chat-form').addEventListener('submit',async (event) => {
    event.preventDefault();
    const question = input.value.trim();
    const submit = event.currentTarget.querySelector('[type="submit"]');
    if (!question || submit.disabled) return;
    submit.disabled = true;
    message(question,'user');
    input.value = '';
    const answer = message('جارٍ إعداد الرد…','assistant');
    const conversation = [...history.slice(-2),{role:'user',text:question}];
    try {
      answer.textContent = await requestAnalysis('overview',conversation);
      history = [...conversation,{role:'model',text:answer.textContent.slice(0,500)}];
    } catch (error) {
      answer.textContent = error instanceof TypeError ? 'تعذّر الاتصال. تحقق من تسجيل الدخول إلى لوحة المدير.' : error.message;
      if (!input.value) input.value = question;
    } finally { submit.disabled = false; log.scrollTop = log.scrollHeight; }
  });
}

if (branchDashboard) setupChat();

function downloadReport() {
  const localDate = (date) => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Gaza'}).format(date);
  const day = localDate(new Date());
  const lines = ['تقرير تشغيل الفروع · ' + day, ''];
  for (const branch of state.branches) {
    const orders = state.orders.filter((item) => item.branch === branch.id && Number.isFinite(Date.parse(item.date)) && localDate(new Date(item.date)) === day);
    const appointments = state.appointments.filter((item) => item.branch === branch.id && item.slot.startsWith(day) && item.status !== 'cancelled');
    const shifts = state.shifts.filter((item) => item.branch === branch.id && item.start.slice(0,10) <= day && item.end > day + 'T00:00');
    lines.push(branch.name,'طلبات مسجّلة اليوم: ' + orders.length,'مواعيد اليوم: ' + appointments.length,'مناوبات اليوم: ' + shifts.length,'');
  }
  lines.push('منتجات تحت حد المخزون حاليًا: ' + lowStock().length,'زيارات الموقع: غير مرتبطة باللوحة.');
  download(lines.join('\n'),'zain-report-' + day + '.txt','text/plain;charset=utf-8');
}

function download(content,name,type) {
  const url = URL.createObjectURL(new Blob([content],{type}));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}

$('#content').addEventListener('click',(event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const { action,id } = target.dataset;
  if (action === 'analyze') { analyze(target); return; }
  if (action === 'daily-report') { downloadReport(); return; }
  if (action === 'export') {
    download(JSON.stringify(state,null,2),'zain-dashboard-backup.json','application/json');
  } else if (action === 'import') $('#backup').click();
  else edit(action,id);
});
$('#content').addEventListener('input',(event) => {
  if (event.target.id === 'query') query = event.target.value.trim();
  else if (event.target.id === 'category') category = event.target.value;
  else return;
  $('#catalog').innerHTML = catalog(page());
});
$('#content').addEventListener('change',async (event) => {
  const file = event.target.id === 'backup' && event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw Error('الحد الأقصى لملف النسخة 2 ميغابايت.');
    const next = readBackup(JSON.parse(await file.text()));
    if (window.confirm('استبدال بيانات المعاينة بالنسخة المستوردة؟')) persist(next,'تم استيراد النسخة الاحتياطية.');
  } catch (error) { $('#status').textContent = error.message || 'تعذّر استيراد الملف.'; }
  event.target.value = '';
});
$('#cancel').addEventListener('click',() => $('#editor').close());
$('#form').addEventListener('submit',async (event) => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector('[type="submit"]');
  if (submit.disabled) return;
  const form = new FormData(event.currentTarget);
  submit.disabled = true;
  $('#cancel').disabled = true;
  const previous = $('#fields [role="alert"]');
  if (previous) previous.remove();
  try {
    await saveEditor(form);
    $('#editor').close();
  } catch (error) {
    const message = document.createElement('p');
    message.setAttribute('role','alert');
    message.className = 'danger';
    message.textContent = error.message || 'تعذّر الحفظ.';
    $('#fields').append(message);
  } finally { submit.disabled = false; $('#cancel').disabled = false; }
});
$('#editor').addEventListener('cancel',(event) => {
  if ($('#cancel').disabled) event.preventDefault();
});
$('#fields').addEventListener('change',async (event) => {
  if (event.target.name !== 'photo') return;
  const input = event.target;
  const file = input.files[0];
  const preview = $('#product-photo');
  if (!file) return;
  try {
    const photo = await productPhoto(file);
    if (input.files[0] === file && preview.isConnected) preview.innerHTML = image(photo);
  } catch (error) {
    if (input.files[0] === file && preview.isConnected) {
      preview.textContent = error.message;
      input.value = '';
    }
  }
});
window.addEventListener('hashchange',render);
window.addEventListener('storage',(event) => {
  if (event.key !== storageKey || !event.newValue) return;
  try {
    state = readBackup(JSON.parse(event.newValue));
    render();
  } catch {
    $('#status').textContent = 'تعذّر تحديث بيانات اللوحة من التبويب الآخر.';
  }
});
render();





