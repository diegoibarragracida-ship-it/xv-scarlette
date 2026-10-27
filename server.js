'use strict';
/**
 * XV años Scarlette Sahori — servidor
 *  - Invitaciones personalizadas por invitado  (/i/:token)
 *  - Muro de fotos con comentarios y likes     (/muro/:codigo)
 *  - Panel de la festejada                     (/panel)
 *
 * Datos: un archivo JSON + carpeta de fotos dentro de DATA_DIR.
 * En Render/Railway apunta DATA_DIR a un disco persistente.
 */
const express = require('express');
const multer = require('multer');
const { ZipArchive } = require('archiver');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ------------------------------------------------------------------ */
/* Base de datos (JSON)                                                */
/* ------------------------------------------------------------------ */
const rid = (n = 9) => crypto.randomBytes(n).toString('base64url');

function loadDb() {
  let d = {};
  try { d = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { /* primera vez */ }
  d.config = d.config || {};
  d.guests = Array.isArray(d.guests) ? d.guests : [];
  d.posts = Array.isArray(d.posts) ? d.posts : [];
  if (!d.config.secret) d.config.secret = crypto.randomBytes(32).toString('hex');
  if (!d.config.wallCode) d.config.wallCode = crypto.randomBytes(5).toString('hex');
  if (d.config.wallOpen === undefined) d.config.wallOpen = true;
  return d;
}
const db = loadDb();

function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}

// Código del muro (se puede fijar con WALL_CODE)
if (process.env.WALL_CODE) {
  const c = process.env.WALL_CODE.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  if (c) db.config.wallCode = c;
}

// Contraseña del panel: ADMIN_PASSWORD, o una generada y guardada la primera vez
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
let generatedPassword = false;
if (!ADMIN_PASSWORD) {
  if (!db.config.adminPassword) {
    db.config.adminPassword = crypto.randomBytes(6).toString('base64url');
    generatedPassword = true;
  }
  ADMIN_PASSWORD = db.config.adminPassword;
}
save();

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */
const str = (v, max) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim().slice(0, max);
const int = (v, min, max, def) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const safeEq = (a, b) => {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};
const slug = (s) =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'invitado';

function limiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, arr] of hits) if (!arr.some((t) => now - t < windowMs)) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    const now = Date.now();
    const arr = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
    arr.push(now);
    hits.set(req.ip, arr);
    next();
  };
}

/* Sesión del panel: token firmado con expiración */
const sign = (exp) => exp + '.' + crypto.createHmac('sha256', db.config.secret).update(String(exp)).digest('base64url');
function validAdminToken(t) {
  if (!t || typeof t !== 'string') return false;
  const exp = t.split('.')[0];
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  return safeEq(sign(exp), t);
}
function requireAdmin(req, res, next) {
  const t = req.get('x-admin-token') || req.query.t;
  if (!validAdminToken(t)) return res.status(401).json({ error: 'Sesión inválida. Inicia sesión de nuevo.' });
  next();
}

/* Detecta el tipo real del archivo por sus primeros bytes */
function sniff(file) {
  const fd = fs.openSync(file, 'r');
  const b = Buffer.alloc(16);
  fs.readSync(fd, b, 0, 16, 0);
  fs.closeSync(fd);
  const a = (s, e) => b.subarray(s, e).toString('latin1');
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: '.jpg', kind: 'image' };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: '.png', kind: 'image' };
  if (a(0, 4) === 'GIF8') return { ext: '.gif', kind: 'image' };
  if (a(0, 4) === 'RIFF' && a(8, 12) === 'WEBP') return { ext: '.webp', kind: 'image' };
  if (a(4, 8) === 'ftyp') {
    const brand = a(8, 12);
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return { ext: '.heic', kind: 'image' };
    if (brand === 'avif') return { ext: '.avif', kind: 'image' };
    if (brand === 'qt  ') return { ext: '.mov', kind: 'video' };
    return { ext: '.mp4', kind: 'video' };
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { ext: '.webm', kind: 'video' };
  return null;
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  if (req.path === '/panel' || req.path.startsWith('/muro/')) res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});
app.use(express.json({ limit: '200kb' }));

const PUB = path.join(__dirname, 'public');
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', immutable: true, index: false, dotfiles: 'deny' }));
app.use('/i/fotos', express.static(path.join(PUB, 'fotos'), { maxAge: '7d', index: false }));
app.get('/i/:token', (req, res) => res.sendFile(path.join(PUB, 'index.html')));
app.get('/muro/:code', (req, res) => res.sendFile(path.join(PUB, 'muro.html')));
app.get('/panel', (req, res) => res.sendFile(path.join(PUB, 'panel.html')));

/* ------------------------------------------------------------------ */
/* API pública: invitación                                             */
/* ------------------------------------------------------------------ */
const findByToken = (t) => db.guests.find((g) => safeEq(g.token, String(t)));
const pubGuest = (g) => ({
  nombre: g.nombre,
  pases: g.pases,
  mesa: g.mesa || '',
  rsvp: g.rsvp || null,
  rsvpPases: g.rsvpPases || null,
  wallUrl: `/muro/${db.config.wallCode}?i=${g.token}`,
});

app.get('/api/invitation/:token', limiter(120, 10 * 60 * 1000), (req, res) => {
  const g = findByToken(req.params.token);
  if (!g) return res.status(404).json({ error: 'Invitación no encontrada' });
  res.json(pubGuest(g));
});

app.post('/api/invitation/:token/rsvp', limiter(60, 10 * 60 * 1000), (req, res) => {
  const g = findByToken(req.params.token);
  if (!g) return res.status(404).json({ error: 'Invitación no encontrada' });
  const asiste = req.body && req.body.asiste === true;
  g.rsvp = asiste ? 'yes' : 'no';
  g.rsvpPases = asiste ? int(req.body.personas, 1, g.pases, g.pases) : 0;
  g.rsvpAt = Date.now();
  save();
  res.json(pubGuest(g));
});

/* ------------------------------------------------------------------ */
/* API pública: muro                                                   */
/* ------------------------------------------------------------------ */
const wallGuard = (req, res, next) => {
  if (!safeEq(req.params.code, db.config.wallCode)) return res.status(404).json({ error: 'Muro no encontrado' });
  next();
};
const wallOpenGuard = (req, res, next) => {
  if (!db.config.wallOpen) return res.status(403).json({ error: 'El muro está cerrado por ahora.' });
  next();
};
const pubPost = (p, cid) => ({
  id: p.id,
  author: p.author,
  caption: p.caption,
  url: p.file ? '/uploads/' + p.file : null,
  kind: p.kind,
  createdAt: p.createdAt,
  likes: p.likes.length,
  liked: cid ? p.likes.includes(cid) : false,
  comments: p.comments.map((c) => ({ id: c.id, author: c.author, text: c.text, createdAt: c.createdAt })),
});

app.get('/api/wall/:code', wallGuard, (req, res) => {
  const cid = str(req.query.cid, 40);
  const posts = [...db.posts].sort((a, b) => b.createdAt - a.createdAt).slice(0, 300);
  res.json({ open: db.config.wallOpen, posts: posts.map((p) => pubPost(p, cid)) });
});

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, rid(12) + '.tmp'),
  }),
  limits: { fileSize: 80 * 1024 * 1024, files: 1, fields: 8 },
});

app.post('/api/wall/:code/posts', limiter(40, 10 * 60 * 1000), wallGuard, wallOpenGuard, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'El archivo es muy grande (máx. 80 MB).' });
      return res.status(400).json({ error: 'No se pudo subir el archivo.' });
    }
    if (!req.file) { // mensaje sin foto
      const caption = str(req.body && req.body.caption, 300);
      if (!caption) return res.status(400).json({ error: 'Escribe un mensaje o elige una foto o video.' });
      const msg = { id: rid(8), author: str(req.body.author, 40) || 'Invitado', caption, file: null, kind: 'text', createdAt: Date.now(), likes: [], comments: [] };
      db.posts.push(msg);
      save();
      return res.status(201).json(pubPost(msg, ''));
    }
    const tmp = req.file.path;
    let type;
    try { type = sniff(tmp); } catch { type = null; }
    if (!type) {
      fs.unlink(tmp, () => {});
      return res.status(415).json({ error: 'Solo se aceptan fotos y videos.' });
    }
    const file = rid(12) + type.ext;
    fs.renameSync(tmp, path.join(UPLOAD_DIR, file));
    const post = {
      id: rid(8),
      author: str(req.body.author, 40) || 'Invitado',
      caption: str(req.body.caption, 300),
      file,
      kind: type.kind,
      createdAt: Date.now(),
      likes: [],
      comments: [],
    };
    db.posts.push(post);
    save();
    res.status(201).json(pubPost(post, ''));
  });
});

const findPost = (id) => db.posts.find((p) => p.id === id);

app.post('/api/wall/:code/posts/:id/comments', limiter(60, 10 * 60 * 1000), wallGuard, wallOpenGuard, (req, res) => {
  const p = findPost(req.params.id);
  if (!p) return res.status(404).json({ error: 'Publicación no encontrada' });
  const text = str(req.body && req.body.text, 400);
  if (!text) return res.status(400).json({ error: 'Escribe un comentario.' });
  if (p.comments.length >= 300) return res.status(400).json({ error: 'Demasiados comentarios.' });
  p.comments.push({ id: rid(6), author: str(req.body.author, 40) || 'Invitado', text, createdAt: Date.now() });
  save();
  res.status(201).json(pubPost(p, str(req.body.cid, 40)));
});

app.post('/api/wall/:code/posts/:id/like', limiter(200, 10 * 60 * 1000), wallGuard, (req, res) => {
  const p = findPost(req.params.id);
  if (!p) return res.status(404).json({ error: 'Publicación no encontrada' });
  const cid = str(req.body && req.body.cid, 40);
  if (!cid) return res.status(400).json({ error: 'Falta identificador.' });
  const i = p.likes.indexOf(cid);
  if (i >= 0) p.likes.splice(i, 1);
  else p.likes.push(cid);
  save();
  res.json(pubPost(p, cid));
});

/* ------------------------------------------------------------------ */
/* API del panel (festejada)                                           */
/* ------------------------------------------------------------------ */
app.post('/api/admin/login', limiter(10, 15 * 60 * 1000), (req, res) => {
  if (!safeEq(str(req.body && req.body.password, 200), ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Contraseña incorrecta.' });
  }
  res.json({ token: sign(Date.now() + 12 * 60 * 60 * 1000) });
});

const adminGuest = (g) => ({ ...g });
const adminPost = (p) => pubPost(p, '');

app.get('/api/admin/state', requireAdmin, (req, res) => {
  res.json({
    guests: db.guests.map(adminGuest),
    config: { wallCode: db.config.wallCode, wallOpen: db.config.wallOpen },
    posts: [...db.posts].sort((a, b) => b.createdAt - a.createdAt).map(adminPost),
  });
});

function cleanGuest(input, base = {}) {
  const g = { ...base };
  if ('nombre' in input) g.nombre = str(input.nombre, 80);
  if ('pases' in input) g.pases = int(input.pases, 1, 10, base.pases || 2);
  if ('telefono' in input) g.telefono = str(input.telefono, 24).replace(/[^\d+]/g, '');
  if ('mesa' in input) g.mesa = str(input.mesa, 8);
  if ('notas' in input) g.notas = str(input.notas, 200);
  if ('enviado' in input) g.enviado = input.enviado === true;
  return g;
}
function newGuest(input) {
  const g = cleanGuest(input, { pases: 2, telefono: '', mesa: '', notas: '' });
  if (!g.nombre) return null;
  return {
    id: rid(6),
    token: rid(9),
    ...g,
    enviado: false,
    rsvp: null,
    rsvpPases: null,
    rsvpAt: null,
    checkedIn: false,
    checkedPersonas: 0,
    checkedInAt: null,
    createdAt: Date.now(),
  };
}

app.post('/api/admin/guests', requireAdmin, (req, res) => {
  const g = newGuest(req.body || {});
  if (!g) return res.status(400).json({ error: 'El nombre es obligatorio.' });
  db.guests.push(g);
  save();
  res.status(201).json(adminGuest(g));
});

app.post('/api/admin/guests/bulk', requireAdmin, (req, res) => {
  const list = Array.isArray(req.body && req.body.guests) ? req.body.guests.slice(0, 500) : [];
  const created = [];
  for (const item of list) {
    const g = newGuest(item || {});
    if (g) { db.guests.push(g); created.push(adminGuest(g)); }
  }
  save();
  res.status(201).json({ created: created.length, guests: created });
});

app.put('/api/admin/guests/:id', requireAdmin, (req, res) => {
  const i = db.guests.findIndex((g) => g.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Invitado no encontrado' });
  const g = cleanGuest(req.body || {}, db.guests[i]);
  if (!g.nombre) return res.status(400).json({ error: 'El nombre es obligatorio.' });
  if (g.rsvp === 'yes' && g.rsvpPases > g.pases) g.rsvpPases = g.pases;
  db.guests[i] = g;
  save();
  res.json(adminGuest(g));
});

app.delete('/api/admin/guests/:id', requireAdmin, (req, res) => {
  const i = db.guests.findIndex((g) => g.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Invitado no encontrado' });
  db.guests.splice(i, 1);
  save();
  res.json({ ok: true });
});

app.get('/api/admin/lookup', requireAdmin, (req, res) => {
  let t = str(req.query.token, 300);
  const m = t.match(/\/i\/([\w-]+)/);
  if (m) t = m[1];
  const g = findByToken(t);
  if (!g) return res.status(404).json({ error: 'No se encontró esa invitación.' });
  res.json(adminGuest(g));
});

app.post('/api/admin/guests/:id/checkin', requireAdmin, (req, res) => {
  const g = db.guests.find((x) => x.id === req.params.id);
  if (!g) return res.status(404).json({ error: 'Invitado no encontrado' });
  g.checkedIn = true;
  g.checkedPersonas = int(req.body && req.body.personas, 1, g.pases, g.rsvpPases || g.pases);
  g.checkedInAt = Date.now();
  save();
  res.json(adminGuest(g));
});

app.delete('/api/admin/guests/:id/checkin', requireAdmin, (req, res) => {
  const g = db.guests.find((x) => x.id === req.params.id);
  if (!g) return res.status(404).json({ error: 'Invitado no encontrado' });
  g.checkedIn = false;
  g.checkedPersonas = 0;
  g.checkedInAt = null;
  save();
  res.json(adminGuest(g));
});

app.put('/api/admin/config', requireAdmin, (req, res) => {
  if (req.body && typeof req.body.wallOpen === 'boolean') db.config.wallOpen = req.body.wallOpen;
  save();
  res.json({ wallCode: db.config.wallCode, wallOpen: db.config.wallOpen });
});

app.delete('/api/admin/posts/:id', requireAdmin, (req, res) => {
  const i = db.posts.findIndex((p) => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Publicación no encontrada' });
  const [p] = db.posts.splice(i, 1);
  if (p.file) fs.unlink(path.join(UPLOAD_DIR, p.file), () => {});
  save();
  res.json({ ok: true });
});

app.delete('/api/admin/posts/:id/comments/:cid', requireAdmin, (req, res) => {
  const p = findPost(req.params.id);
  if (!p) return res.status(404).json({ error: 'Publicación no encontrada' });
  p.comments = p.comments.filter((c) => c.id !== req.params.cid);
  save();
  res.json(adminPost(p));
});

/* Descarga de todas las fotos y videos en un ZIP (+ comentarios.txt) */
app.get('/api/admin/photos.zip', requireAdmin, (req, res) => {
  res.set({
    'Content-Type': 'application/zip',
    'Content-Disposition': 'attachment; filename="fotos-xv-scarlette.zip"',
  });
  const archive = new ZipArchive({ zlib: { level: 0 } });
  archive.on('error', (err) => { console.error('zip:', err); res.destroy(err); });
  archive.pipe(res);
  const fmt = (ts) => new Date(ts).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
  const posts = [...db.posts].sort((a, b) => a.createdAt - b.createdAt);
  let txt = 'Muro de recuerdos — XV años de Scarlette Sahori\n\n';
  posts.forEach((p, i) => {
    const num = String(i + 1).padStart(3, '0');
    let name;
    if (p.file) {
      const f = path.join(UPLOAD_DIR, p.file);
      if (!fs.existsSync(f)) return;
      name = `${num}_${slug(p.author)}${path.extname(p.file)}`;
      archive.file(f, { name });
    } else {
      name = `${num}_${slug(p.author)}_mensaje`;
    }
    txt += `[${name}] ${p.author} — ${fmt(p.createdAt)}\n`;
    if (p.caption) txt += `  "${p.caption}"\n`;
    txt += `  Me gusta: ${p.likes.length}\n`;
    p.comments.forEach((c) => { txt += `  - ${c.author}: ${c.text}\n`; });
    txt += '\n';
  });
  archive.append(txt, { name: 'comentarios.txt' });
  archive.finalize();
});

/* Lista de invitados en CSV (Excel) */
app.get('/api/admin/guests.csv', requireAdmin, (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  const cell = (v) => {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const rows = [['Nombre', 'Pases', 'Telefono', 'Mesa', 'Respuesta', 'Personas confirmadas', 'Entrada', 'Personas que entraron', 'Link']];
  for (const g of db.guests) {
    rows.push([
      g.nombre, g.pases, g.telefono, g.mesa,
      g.rsvp === 'yes' ? 'Asiste' : g.rsvp === 'no' ? 'No asiste' : 'Pendiente',
      g.rsvp === 'yes' ? g.rsvpPases : 0,
      g.checkedIn ? 'Si' : 'No', g.checkedPersonas || 0,
      `${base}/i/${g.token}`,
    ]);
  }
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="invitados-xv-scarlette.csv"' });
  res.send('﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n'));
});

/* ------------------------------------------------------------------ */
app.use(express.static(PUB));
app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado' }));
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Error del servidor' });
});

const srv = require('http').createServer(app);
srv.listen(PORT, () => {
  console.log(`\n  XV Scarlette escuchando en http://localhost:${PORT}`);
  console.log(`  Panel:  http://localhost:${PORT}/panel`);
  console.log(`  Muro:   http://localhost:${PORT}/muro/${db.config.wallCode}`);
  if (process.env.ADMIN_PASSWORD) {
    console.log('\n  Contraseña del panel: la definida en ADMIN_PASSWORD\n');
  } else {
    console.log(`\n  Contraseña del panel (generada, se guarda en data/db.json): ${ADMIN_PASSWORD}`);
    console.log('  Para usar otra, define la variable ADMIN_PASSWORD.\n');
  }
});
srv.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  El puerto ${PORT} ya está en uso: hay otro servidor de esta invitación abierto.`);
    console.error('  Cierra la otra ventana negra (o reinicia la computadora) y vuelve a intentarlo.\n');
    process.exit(1);
  }
  throw e;
});
