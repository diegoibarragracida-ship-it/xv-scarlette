'use strict';
/**
 * Almacenamiento externo (Supabase Storage, plan gratuito).
 * Guarda db.json y las fotos/videos fuera de Render, para que no se pierdan
 * con los deploys ni con los reinicios del plan gratuito.
 *
 * Se activa solo si existen SUPABASE_URL y SUPABASE_KEY. Si no, la app sigue
 * usando el disco local (DATA_DIR) como antes.
 */
const fs = require('fs');

const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_KEY || '';
const BUCKET = process.env.SUPABASE_BUCKET || 'xv-scarlette';
const enabled = Boolean(URL_BASE && KEY);

const api = (p) => `${URL_BASE}/storage/v1/${p}`;
const enc = (name) => name.split('/').map(encodeURIComponent).join('/');
function headers(extra = {}) {
  const h = { apikey: KEY, ...extra };
  if (!KEY.startsWith('sb_')) h.Authorization = `Bearer ${KEY}`; // llave JWT clásica
  return h;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function retry(fn, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (e.fatal) break;
      await sleep(600 * (i + 1));
    }
  }
  throw last;
}

// Supabase a veces responde 400 con {"statusCode":"404"} cuando el objeto no existe
async function isMissing(res) {
  if (res.status === 404) return true;
  if (res.status === 400) {
    const t = await res.clone().text().catch(() => '');
    return /not[_ ]found|"statusCode":\s*"?404/i.test(t);
  }
  return false;
}
async function fail(res, what) {
  const t = await res.text().catch(() => '');
  const e = new Error(`${what}: HTTP ${res.status} ${t.slice(0, 200)}`);
  if (res.status === 401 || res.status === 403) e.fatal = true;
  return e;
}

async function ensureBucket() {
  const res = await fetch(api('bucket'), {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });
  if (res.ok) return;
  const t = await res.text().catch(() => '');
  if (res.status === 409 || /already exists|Duplicate/i.test(t)) return;
  if (res.status === 401 || res.status === 403) {
    const e = new Error('Supabase rechazó la llave (SUPABASE_KEY). Usa la llave service_role / secret.');
    e.fatal = true; throw e;
  }
  // otros errores: el bucket quizá ya existe; la lectura/escritura lo confirmará
}

/** Devuelve un Buffer, o null si el objeto no existe. */
async function get(name) {
  return retry(async () => {
    const res = await fetch(api(`object/authenticated/${BUCKET}/${enc(name)}`), { headers: headers() });
    if (await isMissing(res)) return null;
    if (!res.ok) throw await fail(res, `leer ${name}`);
    return Buffer.from(await res.arrayBuffer());
  });
}

async function put(name, body, contentType = 'application/octet-stream') {
  return retry(async () => {
    const res = await fetch(api(`object/${BUCKET}/${enc(name)}`), {
      method: 'POST',
      headers: headers({ 'Content-Type': contentType, 'x-upsert': 'true', 'Cache-Control': 'max-age=604800' }),
      body,
    });
    if (!res.ok) throw await fail(res, `guardar ${name}`);
  });
}

async function del(name) {
  try {
    await fetch(api(`object/${BUCKET}/${enc(name)}`), { method: 'DELETE', headers: headers() });
  } catch { /* no es crítico */ }
}

/** Respuesta cruda (para pasarla al navegador, con soporte de Range). null si no existe. */
async function fetchRaw(name, range) {
  const res = await fetch(api(`object/authenticated/${BUCKET}/${enc(name)}`), {
    headers: headers(range ? { Range: range } : {}),
  });
  if (await isMissing(res)) return null;
  if (!res.ok && res.status !== 206) throw await fail(res, `leer ${name}`);
  return res;
}

/* ---------- db.json: se sube con un pequeño retraso y en orden ---------- */
let pending = null, inflight = false, timer = null;

function queueDb(json) {
  pending = json;
  if (!timer) timer = setTimeout(flush, 700);
}
async function flush() {
  timer = null;
  if (inflight) { timer = setTimeout(flush, 300); return; }
  if (pending == null) return;
  const body = pending; pending = null; inflight = true;
  try {
    await put('db.json', body, 'application/json');
  } catch (e) {
    console.error('No se pudo guardar db.json en Supabase:', e.message);
    if (pending == null) pending = body;
    if (!timer) timer = setTimeout(flush, 4000);
  } finally { inflight = false; }
}
async function flushNow() {
  if (timer) { clearTimeout(timer); timer = null; }
  for (let i = 0; i < 40 && inflight; i++) await sleep(100);
  if (pending != null) {
    const body = pending; pending = null;
    try { await put('db.json', body, 'application/json'); } catch (e) { console.error('flush final:', e.message); }
  }
}

/**
 * Se ejecuta antes de arrancar la app:
 *  - crea el bucket privado si no existe
 *  - baja db.json a la carpeta local (la app lo lee de ahí)
 *  - si es la primera vez y ya hay un db.json local, lo sube
 * Si no puede hablar con Supabase NO arranca (para no empezar vacío y pisar los datos).
 */
async function init(dbFile) {
  if (!enabled) return;
  await retry(ensureBucket, 3);
  const buf = await get('db.json');
  if (buf) {
    JSON.parse(buf.toString('utf8')); // valida
    fs.writeFileSync(dbFile, buf);
    console.log('  Datos cargados desde Supabase.');
  } else if (fs.existsSync(dbFile)) {
    await put('db.json', fs.readFileSync(dbFile), 'application/json');
    console.log('  Primera vez: datos locales subidos a Supabase.');
  } else {
    console.log('  Supabase conectado (sin datos todavía).');
  }
}

module.exports = { enabled, init, get, put, del, fetchRaw, queueDb, flushNow, BUCKET };
