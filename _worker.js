/* Server side of the dashboard assistant (Cloudflare Pages Function).
   The Gemini key lives only in the GEMINI_API_KEY secret. The browser sends
   aggregate numbers and chat text; this function checks the Cloudflare Access
   login, validates everything, and calls Gemini. */
const MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
const TONES = { short: 'مختصر ومباشر', detailed: 'مفصّل مع خطوات', friendly: 'ودّي بلهجة بسيطة' };
const LIMIT = 16384;
const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const bytes = (part) => Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), (character) => character.charCodeAt(0));

async function verifyAccess(request, env) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 8192) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const decoder = new TextDecoder();
    const header = JSON.parse(decoder.decode(bytes(parts[0])));
    const claims = JSON.parse(decoder.decode(bytes(parts[1])));
    const issuer = 'https://' + env.ACCESS_TEAM + '.cloudflareaccess.com';
    const now = Date.now() / 1000;
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (header.alg !== 'RS256' || claims.iss !== issuer || !audience.includes(env.ACCESS_AUD) ||
        !Number.isFinite(claims.exp) || claims.exp <= now ||
        (claims.nbf != null && (!Number.isFinite(claims.nbf) || claims.nbf > now))) return false;
    const response = await fetch(issuer + '/cdn-cgi/access/certs', { redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (!response.ok) return false;
    const { keys } = await response.json();
    const jwk = keys.find((key) => key.kid === header.kid);
    if (!jwk) return false;
    const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    const key = await crypto.subtle.importKey('jwk', jwk, algorithm, false, ['verify']);
    return await crypto.subtle.verify(algorithm, key, bytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  } catch { return false; }
}

async function readJSON(request) {
  if (!request.body) throw Error();
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(text + decoder.decode());
      size += value.byteLength;
      if (size > LIMIT) { await reader.cancel(); throw Error(); }
      text += decoder.decode(value, { stream: true });
    }
  } finally { reader.releaseLock(); }
}

const count = (value) => value == null || (Number.isFinite(value) && value >= 0 && value <= 1e9);

/* Rebuild the context from known fields only, so nothing else reaches Gemini. */
function cleanContext(raw) {
  if (raw?.test === true) return { test: true };
  if (!raw || !Array.isArray(raw.branches) || raw.branches.length > 30 || !count(raw.lowStockCount)) return null;
  const branches = [];
  for (const [index, b] of raw.branches.entries()) {
    if (!b || !['staff', 'onDuty', 'openOrders', 'salesToday'].every((k) => count(b[k]))) return null;
    branches.push({ branch: index + 1, staff: b.staff ?? 0, onDuty: b.onDuty ?? 0, openOrders: b.openOrders ?? 0, salesToday: b.salesToday ?? 0 });
  }
  let calendar;
  if (raw.calendar != null) {
    const { day, counts } = raw.calendar;
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !Array.isArray(counts) ||
        counts.length !== branches.length || !counts.every(n => Number.isInteger(n) && count(n))) return null;
    calendar = { day, scheduledShiftCountsByBranch: counts };
  }
  return { branches, calendar, lowStockCount: raw.lowStockCount ?? 0, currency: 'ILS' };
}

function cleanHistory(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > 8 || raw.length % 2) return null;
  const ok = raw.every((m, i) => m && m.role === (i % 2 ? 'model' : 'user') && typeof m.text === 'string' &&
    m.text.trim() && m.text.length <= (m.role === 'user' ? 600 : 2000));
  return ok ? raw.map((m) => ({ role: m.role, text: m.text })) : null;
}

function failure(status, body) {
  const info = Array.isArray(body?.error?.details) ? body.error.details.find((d) => d?.['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo') : undefined;
  const reason = info?.reason || '';
  if (/^API_KEY_|SERVICE_DISABLED/.test(reason) || status === 401 || status === 403 ||
      (status === 400 && /API key/i.test(body?.error?.message || ''))) {
    return reply(502, { error: 'مفتاح Gemini على السيرفر مرفوض أو غير مفعّل. خلي مسؤول الحساب يراجعه.' });
  }
  if (reason === 'USER_LOCATION_UNSUPPORTED') return reply(502, { error: 'Google رفضت الطلب بسبب موقع الاتصال.' });
  if (status === 404) return reply(502, { error: 'النموذج المختار غير متاح. اختر نموذجًا آخر من الإعدادات.' });
  if (status === 429) return reply(429, { error: 'وصلت حد الاستخدام المسموح الآن. جرّب بعد دقيقة.' });
  return reply(502, { error: 'تعذّر الحصول على رد من Gemini الآن.' });
}

export async function onRequestPost({ request, env }) {
  if (request.headers.get('Origin') !== new URL(request.url).origin ||
      request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') return reply(403, { error: 'الطلب غير مسموح.' });
  if (!/^[a-z0-9-]+$/.test(env.ACCESS_TEAM || '') || !env.ACCESS_AUD) return reply(503, { error: 'إعداد دخول المدير على Cloudflare مطلوب.' });
  if (!await verifyAccess(request, env)) return reply(401, { error: 'سجّل الدخول بحساب المدير أولًا.' });
  if (!/^[A-Za-z0-9._-]{20,200}$/.test(env.GEMINI_API_KEY || '')) return reply(503, { error: 'مفتاح Gemini غير مضبوط على السيرفر.' });

  let data;
  try { data = await readJSON(request); } catch { return reply(400, { error: 'الطلب غير صالح.' }); }
  const context = cleanContext(data?.context);
  const history = cleanHistory(data?.history);
  const question = typeof data?.question === 'string' ? data.question.trim() : '';
  const tone = Object.hasOwn(TONES, data?.tone) ? data.tone : 'short';
  const model = MODELS.includes(data?.model) ? data.model : (MODELS.includes(env.GEMINI_MODEL) ? env.GEMINI_MODEL : MODELS[0]);
  if (!context || !history || !question || question.length > 600) return reply(400, { error: 'الطلب غير صالح.' });

  const system = 'أنت مساعد إداري لصيدلية زين في غزة. أجب بالعربية (لهجة فلسطينية بسيطة مقبولة)، ' +
    'أنت تقدم التحليل فقط. عند طلب تغيير سجلات وجّه المدير إلى زر إجراءات اللوحة. لا تدّع تنفيذ أو حفظ أي تغيير. ' +
    'بالاعتماد على بيانات اللوحة المرفقة فقط، وقل بصراحة إذا المعلومة غير موجودة. لا تعطِ نصائح طبية أو جرعات. ' +
    'أسلوب الرد: ' + TONES[tone] + '. استخدم أرقامًا من البيانات عندما تفيد. ' +
    'ملخص الأرقام حسب ترتيب الفروع في اللوحة (JSON):\n' + JSON.stringify(context);
  const contents = [...history, { role: 'user', text: question }].map((m) => ({ role: m.role, parts: [{ text: m.text }] }));

  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(25000),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { maxOutputTokens: 1200, temperature: 0.4 } })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return failure(response.status, body);
    const answer = body.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text || '').join('\n').trim();
    return answer ? reply(200, { answer, model }) : reply(502, { error: 'ما رجع رد. جرّب تعيد صياغة السؤال.' });
  } catch (e) {
    return reply(e?.name === 'TimeoutError' ? 504 : 502, { error: e?.name === 'TimeoutError' ? 'الرد تأخر كثير. جرّب كمان مرة.' : 'تعذّر الاتصال بـ Gemini.' });
  }
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (/^\/(?:ibrheam|omar)\/api\/assistant\/?$/.test(path)) {
      return request.method === 'POST'
        ? onRequestPost({ request, env })
        : new Response(null, { status: 405, headers: { Allow: 'POST' } });
    }
    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    return response;
  }
};
