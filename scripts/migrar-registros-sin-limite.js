'use strict';
// Ejecutar desde CMD: npm run db:migrate:unlimited
// Usa DATABASE_URL y PG_SSL del .env. No recrea tablas ni usuarios.
require('dotenv').config();
const fs = require('node:fs/promises');
const path = require('node:path');
const {pool} = require('../config/database');
(async () => {
  const client = await pool.connect();
  try {
    const {rows} = await client.query("SELECT current_database() AS db, current_setting('server_encoding') AS encoding");
    console.log(`Conectado a ${rows[0].db} | ${rows[0].encoding}`);
    if (rows[0].encoding !== 'UTF8') throw new Error('La BD debe tener codificación UTF8.');
    const before = await client.query('SELECT count(*)::int AS total FROM registros');
    console.log(`Registros existentes antes: ${before.rows[0].total}`);
    const sql = await fs.readFile(path.join(__dirname,'../database/03_registros_sin_limite.sql'),'utf8');
    await client.query(sql);
    const after = await client.query('SELECT count(*)::int AS total FROM registros');
    console.log(`Migración realizada. Registros conservados: ${after.rows[0].total}.`);
  } finally { client.release(); await pool.end(); }
})().catch(e => {console.error('Error de migración:',e.message);process.exitCode=1;});
