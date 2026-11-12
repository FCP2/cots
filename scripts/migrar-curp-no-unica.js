'use strict';
require('dotenv').config();
const fs=require('node:fs/promises'),path=require('node:path');
const {pool}=require('../config/database');

(async()=>{
 const c=await pool.connect();
 try{
  const {rows}=await c.query(`SELECT current_database() AS base,
   (SELECT count(*)::int FROM inscripciones) AS inscripciones,
   EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname=current_schema() AND indexname='inscripciones_curp_unica') AS indice_unico`);
  console.log('Base:',rows[0].base,'| Inscripciones:',rows[0].inscripciones,'| Índice único:',rows[0].indice_unico);
  if(process.argv.includes('--check'))return;
  const sql=await fs.readFile(path.join(__dirname,'../database/05_curp_no_unica.sql'),'utf8');
  await c.query(sql);
  console.log('Migración 05 aplicada. La CURP permite múltiples inscripciones.');
 }finally{c.release();await pool.end();}
})().catch(e=>{console.error('Error al migrar:',e.message);process.exitCode=1;});
