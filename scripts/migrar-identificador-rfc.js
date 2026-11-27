'use strict';
require('dotenv').config();
const fs=require('node:fs/promises'),path=require('node:path');
const {pool}=require('../config/database');
(async()=>{
 let c;
 try{
  c=await pool.connect();
  if(!process.argv.includes('--check')){
   await c.query(await fs.readFile(path.join(__dirname,'../database/12_identificador_rfc.sql'),'utf8'));
   console.log('Migración 12 aplicada: columnas opcionales agregadas sin actualizar registros existentes.');
  }
  const {rows}=await c.query(`SELECT column_name,data_type,is_nullable,column_default
   FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='inscripciones'
   AND column_name IN ('rfc','homoclave','version_captura') ORDER BY column_name`);
  console.table(rows);
  if(rows.length!==3){console.error('Falta aplicar la migración 12.');process.exitCode=1;}
 }finally{c?.release();await pool.end();}
})().catch(e=>{console.error('Error al migrar:',e.message);process.exitCode=1;});
