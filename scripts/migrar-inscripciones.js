'use strict';
require('dotenv').config();
const fs=require('node:fs/promises'),path=require('node:path');
const {pool}=require('../config/database');
(async()=>{
 const c=await pool.connect();
 try{
  const {rows}=await c.query("SELECT current_database() AS db, current_setting('server_encoding') AS encoding");
  console.log('BD:',rows[0].db,'| Codificación:',rows[0].encoding);
  if(rows[0].encoding!=='UTF8')throw Error('La base de datos debe usar UTF8');
  const sql=await fs.readFile(path.join(__dirname,'../database/04_inscripciones_individuales.sql'),'utf8');
  await c.query(sql);
  console.log('Migración 04 aplicada. Cuentas, invitaciones y registros anteriores conservados.');
 }finally{c.release();await pool.end();}
})().catch(e=>{console.error('Error al migrar:',e.message);process.exitCode=1;});
