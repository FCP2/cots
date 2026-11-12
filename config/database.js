'use strict';
const { Pool } = require('pg');
if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en .env');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: true } : false,
  max: 10,
  application_name: 'propuesta-cots',
  options: '-c client_encoding=UTF8 -c timezone=UTC'
});
module.exports = { pool };
