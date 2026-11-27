/* Zain admin: photo library in IndexedDB (far larger than localStorage).
   Records only keep photo ids; the image bytes live here. A server adapter
   (e.g. Supabase Storage) can later implement the same add/url/remove API. */
'use strict';
(function (Z) {
  const DB = 'zain-photos', STORE = 'photos';
  let dbp;
  const db = () => dbp || (dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
  const tx = async (mode, fn) => {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode); const s = t.objectStore(STORE);
      const out = fn(s);
      t.oncomplete = () => resolve(out?.result ?? out);
      t.onerror = () => reject(t.error || Error('تعذّر حفظ الصورة.'));
      t.onabort = () => reject(t.error?.name === 'QuotaExceededError' ? Error('امتلأت مساحة الصور في هذا المتصفح.') : (t.error || Error('أُلغي الحفظ.')));
    });
  };

  // Resize to a web-friendly JPEG blob (max 1600px, ~200-400KB).
  async function prepare(file, max = 1600) {
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) || file.size > 25e6) throw Error('«' + file.name + '»: اختر صورة JPG أو PNG أو WebP أقل من 25 ميغابايت.');
    const bmp = await createImageBitmap(file);
    try {
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
      const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
      const x = c.getContext('2d', { alpha: false }); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(bmp, 0, 0, w, h);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
      if (!blob) throw Error('تعذّر تجهيز الصورة.');
      return { blob, w, h };
    } finally { bmp.close(); }
  }

  const urls = new Map();
  const Photos = {
    async add(file) {
      const { blob, w, h } = await prepare(file);
      const id = crypto.randomUUID();
      await tx('readwrite', (s) => s.put({ id, blob, w, h, name: file.name.slice(0, 120), created: new Date().toISOString() }));
      return id;
    },
    async url(id) {
      if (urls.has(id)) return urls.get(id);
      const rec = await tx('readonly', (s) => s.get(id));
      if (!rec) return null;
      const u = URL.createObjectURL(rec.blob); urls.set(id, u); return u;
    },
    async remove(id) {
      await tx('readwrite', (s) => s.delete(id));
      if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
    },
    async usage() {
      const est = await navigator.storage?.estimate?.();
      return est ? { used: est.usage || 0, quota: est.quota || 0 } : null;
    },
    /* Fill every <img data-photo="id"> inside root. */
    hydrate(root) {
      root.querySelectorAll('img[data-photo]').forEach(async (img) => {
        const u = await Photos.url(img.dataset.photo).catch(() => null);
        if (u) img.src = u; else img.closest('[data-photo-wrap]')?.classList.add('missing');
      });
    }
  };
  // Ask the browser not to evict the library when space is low.
  navigator.storage?.persist?.().catch(() => {});
  Z.photos = Photos;
})(window.Zain);
