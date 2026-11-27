/* Zain Pharmacy - shared behavior for every page */
(function () {
  // Use the same contact number as the storefront.
  var WA = '970599682008';
  var KEY = 'zain-cart-v1';

  function openWhatsApp(text) {
    window.open('https://wa.me/' + WA + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function money(n) { return (Math.round(n * 100) / 100).toString(); }

  function toast(msg) {
    var t = document.querySelector('.z-toast');
    if (!t) { t = document.createElement('div'); t.className = 'z-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove('is-on'); }, 2400);
  }

  // ---------------- Cart (kept in this browser only) ----------------
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  var cart = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) { /* private mode: cart lives for this page only */ } render(); }
  function count() { return cart.reduce(function (n, i) { return n + i.qty; }, 0); }
  function total() { return cart.reduce(function (n, i) { return n + i.qty * i.price; }, 0); }

  function itemFromCard(btn) {
    var card = btn.closest('.product-item, [data-name]');
    if (!card) return null;
    var h3 = card.querySelector('h3');
    var price = parseFloat(card.getAttribute('data-price'));
    if (isNaN(price)) { var m = card.textContent.match(/(\d+(?:\.\d+)?)\s*₪/); price = m ? parseFloat(m[1]) : 0; }
    var img = card.querySelector('img');
    return {
      name: card.getAttribute('data-name') || (h3 ? h3.textContent.trim() : 'منتج'),
      price: price,
      img: card.getAttribute('data-img') || (img ? img.src : ''),
      rx: card.hasAttribute('data-rx') || /يلزم وصفة/.test(card.textContent)
    };
  }

  function add(item) {
    var found = cart.filter(function (i) { return i.name === item.name && i.price === item.price && Boolean(i.rx) === Boolean(item.rx); })[0];
    if (found) found.qty++; else { item.qty = 1; cart.push(item); }
    save();
    toast('أُضيف «' + item.name + '» إلى السلة');
    floatingCart.classList.remove('z-cart-pulse');
    void floatingCart.offsetWidth;
    floatingCart.classList.add('z-cart-pulse');
  }

  // Stitch pages call quickOrder(name) inline; the delegated click below does the real work
  window.quickOrder = function () {};

  function buildCart() {
    var el = document.createElement('div');
    el.id = 'z-cart'; el.className = 'fixed inset-0 z-[80] hidden'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<div class="z-overlay absolute inset-0 bg-black/40" data-close></div>' +
      '<aside aria-labelledby="z-cart-title" aria-modal="true" role="dialog" class="z-panel z-panel--left absolute top-0 bottom-0 left-0 w-full max-w-sm bg-surface shadow-2xl flex flex-col">' +
        '<div class="flex items-center justify-between px-4 h-14 border-b border-line">' +
          '<h2 class="font-extrabold text-primary text-lg" id="z-cart-title">سلة الطلب</h2>' +
          '<button aria-label="إغلاق السلة" class="w-11 h-11 grid place-items-center rounded-full hover:bg-surface-low" data-close type="button"><span class="material-symbols-outlined">close</span></button>' +
        '</div>' +
        '<div class="flex-1 overflow-y-auto p-4 space-y-3" data-cart-list></div>' +
        '<div class="p-4 border-t border-line space-y-3 bg-white" data-cart-foot>' +
          '<p class="text-sm font-bold text-primary">طريقة الاستلام: توصيل للعنوان</p>' +
          '<label for="z-cart-address" class="block text-sm font-bold text-primary">عنوان التوصيل (إجباري)</label>' +
          '<textarea id="z-cart-address" class="w-full rounded-xl border-line bg-surface-low text-sm" rows="2" maxlength="240" required data-cart-address placeholder="المنطقة، الشارع، ورقم المبنى أو أقرب معلم"></textarea>' +
          '<div class="flex items-center justify-between font-extrabold text-primary"><span>إجمالي المنتجات</span><span data-cart-total></span></div>' +
          '<button class="w-full h-12 rounded-full bg-cta hover:bg-cta-hover text-white font-bold flex items-center justify-center gap-2" data-cart-send type="button"><span class="material-symbols-outlined">chat</span>مراجعة الطلب وفتح واتساب</button>' +
          '<p class="text-[11px] text-muted text-center">راجع الأصناف والمبلغ قبل المتابعة. أرسل الرسالة من واتساب لإتمام الطلب.</p>' +
        '</div>' +
      '</aside>';
    document.body.appendChild(el);
    return el;
  }
  var cartEl = buildCart();
  var floatingCart = document.createElement('button');
  floatingCart.type = 'button';
  floatingCart.className = 'z-cart-float';
  floatingCart.setAttribute('data-cart-open','');
  floatingCart.setAttribute('aria-controls','z-cart');
  floatingCart.innerHTML = '<span aria-hidden="true" class="material-symbols-outlined">shopping_cart</span><span>السلة</span><span class="z-cart-badge" data-cart-count></span>';
  document.body.appendChild(floatingCart);

  function render() {
    var n = count();
    floatingCart.setAttribute('aria-label','سلة الطلب، عدد القطع: ' + n);
    document.querySelectorAll('[data-cart-count]').forEach(function (b) { b.textContent = n; b.classList.toggle('hidden', n === 0); });
    document.querySelectorAll('[data-cart-count-inline]').forEach(function (b) { b.textContent = '(' + n + ')'; });
    var list = cartEl.querySelector('[data-cart-list]');
    var foot = cartEl.querySelector('[data-cart-foot]');
    if (!cart.length) {
      list.innerHTML = '<div class="text-center py-16"><span class="material-symbols-outlined text-6xl text-outline-variant">shopping_cart</span>' +
        '<p class="font-bold text-primary mt-3">سلتك فارغة</p><p class="text-sm text-muted mt-1">أضف المنتجات التي تحتاجها، ثم أرسل الطلب عبر واتساب.</p>' +
        '<a class="inline-flex items-center mt-5 h-11 px-6 rounded-full bg-primary text-white font-bold" href="products.html">تصفح المنتجات</a></div>';
      foot.classList.add('hidden');
      return;
    }
    foot.classList.remove('hidden');
    list.innerHTML = cart.map(function (i, k) {
      return '<div class="flex gap-3 bg-white border border-line rounded-2xl p-2.5">' +
        (i.img ? '<img alt="" class="w-16 h-16 rounded-xl object-cover bg-surface-low shrink-0" src="' + esc(i.img) + '"/>' : '') +
        '<div class="flex-1 min-w-0"><p class="font-bold text-sm text-primary leading-snug">' + esc(i.name) + '</p>' +
        (i.rx ? '<p class="text-[11px] font-bold text-cta mt-0.5">يلزم وصفة طبية</p>' : '') +
        '<p class="text-sm font-extrabold mt-1">' + money(i.price * i.qty) + ' ₪</p></div>' +
        '<div class="flex flex-col items-end justify-between">' +
          '<button aria-label="حذف ' + esc(i.name) + '" class="w-8 h-8 grid place-items-center rounded-full text-muted hover:text-error" data-remove="' + k + '" type="button"><span class="material-symbols-outlined text-lg">delete</span></button>' +
          '<div class="flex items-center bg-surface-low rounded-full">' +
            '<button aria-label="إنقاص" class="w-8 h-8 grid place-items-center font-bold text-primary" data-dec="' + k + '" type="button">−</button>' +
            '<span class="w-6 text-center text-sm font-bold">' + i.qty + '</span>' +
            '<button aria-label="زيادة" class="w-8 h-8 grid place-items-center font-bold text-primary" data-inc="' + k + '" type="button">+</button>' +
          '</div></div></div>';
    }).join('');
    cartEl.querySelector('[data-cart-total]').textContent = money(total()) + ' ₪';
  }

  // ---------------- Drawers (menu + cart) ----------------
  var lastFocus = null;
  function openLayer(el) {
    lastFocus = document.activeElement;
    el.classList.remove('hidden'); el.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(function () { el.classList.add('is-open'); });
    document.documentElement.style.overflow = 'hidden';
    var c = el.querySelector('[data-close]:not(.z-overlay)'); if (c) c.focus();
  }
  function closeLayer(el) {
    el.classList.remove('is-open'); el.setAttribute('aria-hidden', 'true');
    setTimeout(function () { el.classList.add('hidden'); }, 260);
    document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    var addBtn = t.closest('[data-add], #productsGrid .product-item button');
    if (addBtn) { var it = itemFromCard(addBtn); if (it) add(it); return; }
    if (t.closest('[data-cart-open]')) { render(); openLayer(cartEl); return; }
    var layer = t.closest('#z-cart');
    if (layer && t.closest('[data-close]')) { closeLayer(layer); return; }
    var b;
    if ((b = t.closest('[data-inc]'))) { cart[+b.getAttribute('data-inc')].qty++; save(); return; }
    if ((b = t.closest('[data-dec]'))) { var i = +b.getAttribute('data-dec'); if (--cart[i].qty < 1) cart.splice(i, 1); save(); return; }
    if ((b = t.closest('[data-remove]'))) { cart.splice(+b.getAttribute('data-remove'), 1); save(); return; }
    if (t.closest('[data-cart-send]')) {
      if (!cart.length) return;
      var addressField = cartEl.querySelector('[data-cart-address]');
      var address = addressField.value.trim();
      addressField.setCustomValidity(address ? '' : 'أدخل عنوان التوصيل أولًا.');
      if (!addressField.reportValidity()) return;
      var lines = ['مرحبًا صيدلية زين، أريد طلب:'];
      cart.forEach(function (i) { lines.push('• ' + i.name + ' × ' + i.qty + ' × ' + money(i.price) + ' ₪ = ' + money(i.price * i.qty) + ' ₪'); });
      lines.push('إجمالي المنتجات: ' + money(total()) + ' ₪');
      lines.push('طريقة الاستلام: توصيل للعنوان');
      lines.push('عنوان التوصيل: ' + address.replace(/\s+/g,' '));
      if (cart.some(function (i) { return i.rx; })) lines.push('بعض الأصناف تحتاج روشتة، سأرسل صورتها هنا.');
      lines.push('يرجى تأكيد التوفر والمبلغ النهائي وأي رسوم توصيل.');
      openWhatsApp(lines.join('\n'));
    }
  });
  cartEl.addEventListener('input', function (event) {
    if (event.target.matches('[data-cart-address]')) event.target.setCustomValidity('');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    ['z-cart'].forEach(function (id) { var el = document.getElementById(id); if (el && el.classList.contains('is-open')) closeLayer(el); });
  });
  render();


  // ---------------- Offer countdown to the real end date in data-countdown ----------------
  document.querySelectorAll('[data-countdown]').forEach(function (el) {
    var end = Date.parse(el.getAttribute('data-countdown'));
    var txt = el.querySelector('[data-countdown-text]');
    if (isNaN(end) || !txt) return;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    function tick() {
      var ms = end - Date.now();
      if (ms <= 0) { txt.textContent = 'انتهى العرض'; el.classList.add('opacity-70'); clearInterval(h); return; }
      var s = Math.floor(ms / 1000), d = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60;
      var dl = d === 1 ? 'يوم' : d === 2 ? 'يومين' : d <= 10 ? d + ' أيام' : d + ' يومًا';
      txt.innerHTML = 'ينتهي خلال ' + (d ? dl + ' و ' : '') + '<span dir="ltr">' + pad(hh) + ':' + pad(mm) + ':' + pad(ss) + '</span>';
    }
    var h = setInterval(tick, 1000); tick();
  });

  // ---------------- Products page: category chips + search (?cat=, ?q=, #search) ----------------
  var pGrid = document.getElementById('productsGrid');
  var pSearch = document.getElementById('z-search');
  if (pGrid && pSearch) {
    var norm = function (t) {
      return String(t).toLowerCase().replace(/[ً-ْ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim();
    };
    var params = new URLSearchParams(location.search);
    var cards = Array.prototype.slice.call(pGrid.querySelectorAll('.product-item'));
    var chips = Array.prototype.slice.call(document.querySelectorAll('.z-chip'));
    var requestedCategory = params.get('cat');
    var state = {
      cat: chips.some(function (chip) { return chip.getAttribute('data-cat') === requestedCategory; }) ? requestedCategory : 'all',
      q: params.get('q') || ''
    };
    pSearch.value = state.q;
    var searchIndex = cards.map(function (card) {
      return { element: card, category: card.getAttribute('data-category'), text: norm(card.textContent) };
    });
    var countEl = document.getElementById('z-count'), emptyEl = document.getElementById('z-empty');
    var applyFilter = function () {
      var words = norm(state.q).split(/\s+/).filter(Boolean), shown = 0;
      searchIndex.forEach(function (entry) {
        var ok = (state.cat === 'all' || entry.category === state.cat) &&
          words.every(function (word) { return entry.text.indexOf(word) !== -1; });
        entry.element.classList.toggle('hidden', !ok); if (ok) shown++;
      });
      chips.forEach(function (ch) {
        var on = ch.getAttribute('data-cat') === state.cat;
        ch.setAttribute('aria-pressed', on ? 'true' : 'false');
        ch.classList.toggle('bg-primary', on); ch.classList.toggle('text-white', on); ch.classList.toggle('border-primary', on);
        ch.classList.toggle('bg-white', !on); ch.classList.toggle('text-on-surface', !on); ch.classList.toggle('border-line', !on);
      });
      if (countEl) countEl.textContent = shown ? shown + ' منتج' : '';
      if (emptyEl) emptyEl.classList.toggle('hidden', shown > 0);
    };
    chips.forEach(function (ch) { ch.addEventListener('click', function () { state.cat = ch.getAttribute('data-cat'); applyFilter(); }); });
    pSearch.addEventListener('input', function () { state.q = pSearch.value; applyFilter(); });
    applyFilter();
    if (location.hash === '#search') setTimeout(function () { pSearch.focus(); }, 300);
  }

  // ---------------- Branches: live "open now" from data-hours (Gaza time) ----------------
  var BRANCH_HOURS = { 'remal': '00:00-24:00', 'tel-al-hawa': '08:00-24:00', 'al-nasr': '08:00-23:30', 'deir-al-balah': '08:00-23:00' }; // TODO: confirm
  function gazaMinutes() {
    try {
      var parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Gaza', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
      var g = function (t) { return +parts.filter(function (p) { return p.type === t; })[0].value; };
      return g('hour') * 60 + g('minute');
    } catch (e) { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  }
  function isOpen(range) {
    var m = range.match(/(\d\d):(\d\d)-(\d\d):(\d\d)/); if (!m) return null;
    var from = +m[1] * 60 + +m[2], to = +m[3] * 60 + +m[4], now = gazaMinutes();
    return to > from ? (now >= from && now < to) : (now >= from || now < to);
  }
  var OPEN_CLS = ['bg-[#e3f3e6]', 'text-[#1f7a3a]'], SHUT_CLS = ['bg-surface-container', 'text-on-surface-variant'];
  function paintChip(chip, open) {
    chip.textContent = open ? 'مفتوح الآن' : 'مغلق الآن';
    OPEN_CLS.forEach(function (c) { chip.classList.toggle(c, open); });
    SHUT_CLS.forEach(function (c) { chip.classList.toggle(c, !open); });
  }
  function paintBranches() {
    document.querySelectorAll('[data-hours]').forEach(function (row) {
      var chip = row.querySelector('[data-open-chip]'), open = isOpen(row.getAttribute('data-hours'));
      if (chip && open !== null) paintChip(chip, open);
    });
    // branches page (Stitch cards): add a status chip under each branch name
    document.querySelectorAll('.branch-card[data-branch]').forEach(function (card) {
      var range = BRANCH_HOURS[card.getAttribute('data-branch')]; if (!range) return;
      var chip = card.querySelector('[data-open-chip]');
      if (!chip) {
        var h3 = card.querySelector('h2, h3'); if (!h3) return;
        chip = document.createElement('span');
        chip.setAttribute('data-open-chip', '');
        chip.className = 'inline-block mt-1 text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap';
        h3.insertAdjacentElement('afterend', chip);
      }
      paintChip(chip, isOpen(range));
    });
  }
  paintBranches(); setInterval(paintBranches, 60000);

  // ---------------- Prescription form → WhatsApp (nothing is uploaded to a server) ----------------
  window.handleSubmitPrescription = function () {
    var v = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };
    var mode = (document.querySelector('input[name="fulfillment"]:checked') || {}).value;
    var branchSel = document.getElementById('branchSelect');
    var branch = branchSel ? branchSel.options[branchSel.selectedIndex].text.trim() : '';
    var file = document.getElementById('prescriptionFile');
    var lines = [
      'مرحبًا صيدلية زين، أريد صرف روشتة.',
      'الاسم: ' + v('patientName'),
      'الهاتف: ' + v('patientPhone'),
      mode === 'delivery' ? 'التوصيل إلى: ' + v('deliveryAddress') : 'الاستلام من: ' + branch
    ];
    if (v('notes')) lines.push('ملاحظات: ' + v('notes'));
    if (file && file.files && file.files[0]) lines.push('سأرسل صورة الروشتة (' + file.files[0].name + ') في هذه المحادثة الآن.');
    openWhatsApp(lines.join('\n'));
    var banner = document.getElementById('submissionSuccessBanner');
    if (banner) {
      banner.innerHTML = '<div class="flex items-start gap-3"><span class="material-symbols-outlined text-primary">chat</span>' +
        '<div><p class="font-bold text-primary">فتحنا واتساب برسالتك جاهزة</p>' +
        '<p class="text-sm text-on-surface-variant mt-1">أرسل الرسالة، ثم أرفق صورة الروشتة في نفس المحادثة ليبدأ الصيدلي تجهيز طلبك.</p></div></div>';
      banner.classList.remove('hidden');
      banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  // ---------------- Prescription page: pickup/delivery switch, file name, validation ----------------
  var rxForm = document.getElementById('prescriptionForm');
  if (rxForm) {
    var addrBox = document.getElementById('addressInputBox'), branchBox = document.getElementById('branchSelectorBox');
    var errEl = document.getElementById('formError');
    rxForm.addEventListener('change', function (ev) {
      if (ev.target.name === 'fulfillment') {
        var del = ev.target.value === 'delivery';
        addrBox.classList.toggle('hidden', !del); branchBox.classList.toggle('hidden', del);
      }
      if (ev.target.id === 'prescriptionFile') {
        var f = ev.target.files && ev.target.files[0];
        document.getElementById('fileNameDisplay').textContent = f ? '✓ ' + f.name : 'اضغط لتصوير الروشتة أو اختيار صورة';
      }
    });
    rxForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var val = function (id) { return (document.getElementById(id).value || '').trim(); };
      var mode = (rxForm.querySelector('input[name="fulfillment"]:checked') || {}).value;
      var problem = !val('patientName') ? ['patientName', 'اكتب اسم المريض'] :
        val('patientPhone').replace(/\D/g, '').length < 9 ? ['patientPhone', 'اكتب رقم جوال صحيح'] :
        (mode === 'delivery' && !val('deliveryAddress')) ? ['deliveryAddress', 'اكتب عنوان التوصيل'] : null;
      if (problem) {
        errEl.textContent = problem[1]; errEl.classList.remove('hidden');
        document.getElementById(problem[0]).focus();
        return;
      }
      errEl.classList.add('hidden');
      window.handleSubmitPrescription();
    });
  }

  // ---------------- Reveal sections as they enter the screen ----------------
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    var tops = Array.prototype.filter.call(document.querySelectorAll('main section'), function (s) {
      return !s.parentElement.closest('section');
    });
    tops.forEach(function (s, i) {
      if (i < 2) return; // hero + first strip show immediately
      s.classList.add('z-reveal'); io.observe(s);
    });
  }
})();


