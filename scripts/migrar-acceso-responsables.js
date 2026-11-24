'use strict';
require('dotenv').config();
const fs=require('node:fs/promises'),path=require('node:path');
const {pool}=require('../config/database');

(async()=>{
 const c=await pool.connect();
 try{
  const {rows}=await c.query(`SELECT current_database() AS base,
   (SELECT count(*)::int FROM invitaciones) AS invitaciones,
   (SELECT count(*)::int FROM inscripciones) AS inscripciones,
   to_regclass('sesiones_responsables') IS NOT NULL AS sesiones_habilitadas`);
  console.log('Base:',rows[0].base,'| Invitaciones:',rows[0].invitaciones,
   '| Inscripciones:',rows[0].inscripciones,'| Acceso responsables:',rows[0].sesiones_habilitadas);
  if(process.argv.includes('--check'))return;
  const sql=await fs.readFile(path.join(__dirname,'../database/08_acceso_responsables.sql'),'utf8');
  await c.query(sql);
  console.log('Migración 08 aplicada.');
 }finally{c.release();await pool.end();}
})().catch(e=>{console.error('Error al migrar:',e.message);process.exitCode=1;});
