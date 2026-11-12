'use strict';
// Ejecuta los archivos SQL contra la base existente indicada en .env.
// No necesita psql instalado: utiliza el cliente pg incluido en el proyecto.
require('dotenv').config();
const fs = require('node:fs/promises');
const path = require('node:path');
const { pool } = require('../config/database');

const archivos = [
  'database/01_schema.sql',
  'database/02_distritos_federales.sql'
];

(async () => {
  const client = await pool.connect();
  try {
    const config = await client.query("SELECT current_database() AS nombre, current_setting('server_encoding') AS encoding");
    const { nombre, encoding } = config.rows[0];
    console.log(`Conectado a PostgreSQL | BD: ${nombre} | Codificación: ${encoding}`);
    if (encoding.toUpperCase() !== 'UTF8') {
      throw new Error('La base remota no está en UTF8; se detuvo la instalación.');
    }
    await client.query("SET client_encoding = 'UTF8'");
    for (const archivo of archivos) {
      console.log(`Ejecutando ${archivo}...`);
      const sql = await fs.readFile(path.join(__dirname, '..', archivo), 'utf8');
      await client.query(sql);
      console.log(`OK: ${archivo}`);
    }
    const distritos = await client.query('SELECT count(*)::integer AS total FROM distritos_federales');
    const municipios = await client.query('SELECT count(*)::integer AS total FROM distritos_municipios');
    console.log(`Inicialización completada: ${distritos.rows[0].total} distritos y ${municipios.rows[0].total} relaciones distrito-municipio.`);
  } finally {
    client.release();
    await pool.end();
  }
})().catch(error => {
  console.error('Falló la inicialización:', error.message);
  process.exitCode = 1;
});
