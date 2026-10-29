'use strict';
/**
 * Arranque: si hay SUPABASE_URL y SUPABASE_KEY, primero carga los datos
 * guardados en Supabase y luego inicia la app (app.js).
 */
const fs = require('fs');
const path = require('path');
const remote = require('./remote');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

remote.init(path.join(DATA_DIR, 'db.json')).then(
  () => require('./app'),
  (e) => {
    console.error('\n  No se pudo conectar con Supabase:', e.message);
    console.error('  Revisa SUPABASE_URL y SUPABASE_KEY en Environment. La app no inicia para no perder datos.\n');
    process.exit(1);
  }
);
