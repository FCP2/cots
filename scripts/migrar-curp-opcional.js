'use strict';
require('dotenv').config();
const fs=require('node:fs/promises'),path=require('node:path');
const {pool}=require('../config/database');

(async()=>{
 const c=await pool.connect();
 try{
  const {rows}=await c.query(`SELECT current_database() AS base,
   (SELECT count(*)::int FROM inscripciones) AS inscripciones,
   (SELECT is_nullable FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name='inscripciones' AND column_name='curp') AS curp_nullable`);
  console.log('Base:',rows[0].base,'| Inscripciones:',rows[0].inscripciones,'| CURP opcional:',rows[0].curp_nullable==='YES');
  if(process.argv.includes('--check'))return;
  const sql=await fs.readFile(path.join(__dirname,'../database/06_curp_opcional.sql'),'utf8');
  await c.query(sql);
  console.log('Migración 06 aplicada. CURP opcional.');
 }finally{c.release();await pool.end();}
})().catch(e=>{console.error('Error al migrar:',e.message);process.exitCode=1;});
