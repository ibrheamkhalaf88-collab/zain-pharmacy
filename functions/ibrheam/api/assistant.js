const topics = {overview:'ملخص الفروع', appointments:'ضغط المواعيد', inventory:'تنبيهات المخزون'};
const branches = {remal:'الرمال',jundi:'الجندي المجهول','deir-hospital':'مستشفى شهداء الأقصى','deir-madfa':'دوار المدفع'};
const reply = (status, data) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});
const bytes = (part) => Uint8Array.from(atob(part.replace(/-/g,'+').replace(/_/g,'/')), (character) => character.charCodeAt(0));

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
    if (header.alg !== 'RS256' || claims.iss !== issuer ||
        !Array.isArray(claims.aud) || !claims.aud.includes(env.ACCESS_AUD) ||
        !Number.isFinite(claims.exp) || claims.exp <= now ||
        (claims.nbf != null && (!Number.isFinite(claims.nbf) || claims.nbf > now))) return false;
    const response = await fetch(issuer + '/cdn-cgi/access/certs', {redirect:'error', signal:AbortSignal.timeout(5000)});
    if (!response.ok) return false;
    const {keys} = await response.json();
    const jwk = keys.find((key) => key.kid === header.kid);
    if (!jwk) return false;
    const algorithm = {name:'RSASSA-PKCS1-v1_5', hash:'SHA-256'};
    const key = await crypto.subtle.importKey('jwk', jwk, algorithm, false, ['verify']);
    return await crypto.subtle.verify(algorithm, key, bytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  } catch { return false; }
}

async function readSummary(request) {
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) return JSON.parse(text + decoder.decode());
      size += value.byteLength;
      if (size > 4096) throw Error();
      text += decoder.decode(value,{stream:true});
    }
  } finally {
    if (size > 4096) await reader.cancel();
    reader.releaseLock();
  }
}

export async function onRequestPost({request,env}) {
  if (request.headers.get('Origin') !== new URL(request.url).origin ||
      request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') return reply(403,{error:'الطلب غير مسموح.'});
  if (!/^[a-z0-9-]+$/.test(env.ACCESS_TEAM || '') || !env.ACCESS_AUD) {
    return reply(503,{error:'إعداد دخول المدير على Cloudflare مطلوب.'});
  }
  if (!await verifyAccess(request,env)) return reply(401,{error:'سجّل الدخول بحساب المدير أولًا.'});
  const apiKey = request.headers.get('X-Manager-Gemini-Key') || env.GEMINI_API_KEY;
  const model = request.headers.get('X-Manager-Gemini-Model') || env.GEMINI_MODEL;
  if (!/^[A-Za-z0-9._-]{16,200}$/.test(apiKey || '') || !/^gemini-[a-z0-9.-]{1,92}$/.test(model || '')) {
    return reply(400,{error:'أدخل مفتاح Gemini ومعرّف النموذج الصحيحين في إعدادات المحادثة.'});
  }
  const count = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 10000;
  let data;
  try { data = await readSummary(request); } catch { return reply(400,{error:'ملخص غير صالح.'}); }
  if (!data || !Object.hasOwn(topics,data.topic) || !count(data.lowStock) || !data.branches ||
      !Object.keys(branches).every((id) => count(data.branches[id]?.orders) && count(data.branches[id]?.appointments))) {
    return reply(400,{error:'ملخص غير صالح.'});
  }
  const summary = Object.entries(branches).map(([id,name]) => ({
    name, orders:data.branches[id].orders, appointments:data.branches[id].appointments
  }));
  const conversation = data.conversation ?? [];
  if (!Array.isArray(conversation) || conversation.length > 5 || (conversation.length && conversation.length % 2 === 0) ||
      conversation.some((message,index) => !message || message.role !== (index % 2 === 0 ? 'user' : 'model') ||
        typeof message.text !== 'string' || !message.text.trim() || message.text.length > (message.role === 'user' ? 350 : 500))) {
    return reply(400,{error:'المحادثة غير صالحة.'});
  }
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
      headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},
      body:JSON.stringify({
        systemInstruction:{parts:[{text:'أنت مساعد تشغيل لفروع صيدلية. أجب بالعربية وفق الأعداد المتاحة. تجنّب النصائح الطبية. سجلات اللوحة للقراءة فقط. ' +
          JSON.stringify({topic:topics[data.topic],branches:summary,lowStock:data.lowStock})}]},
        contents:conversation.length ? conversation.map((message) => ({role:message.role,parts:[{text:message.text}]})) :
          [{role:'user',parts:[{text:'أعطني التحليل التشغيلي المطلوب.'}]}],
        generationConfig:{maxOutputTokens:800}
      })
    });
    if (!response.ok) return reply(response.status === 429 ? 429 : 502,{error:'تعذّر الحصول على رد من Gemini الآن.'});
    const body = await response.json();
    const answer = body.candidates?.[0]?.content?.parts?.filter((part) => !part.thought).map((part) => part.text || '').join('\n').trim();
    return answer ? reply(200,{answer}) : reply(502,{error:'لم يرجع Gemini تحليلًا.'});
  } catch { return reply(502,{error:'تعذّر الاتصال بـ Gemini.'}); }
}
