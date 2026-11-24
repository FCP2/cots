'use strict';
require('dotenv').config();
const fs=require('node:fs/promises'),path=require('node:path');
const {pool}=require('../config/database');

(async()=>{
 const c=await pool.connect();
 try{
  const {rows}=await c.query(`SELECT current_database() AS base,
   (SELECT count(*)::int FROM invitaciones) AS invitaciones,
   EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema()
    AND table_name='invitaciones' AND column_name='codigo_cifrado') AS columna_cifrado`);
  console.log('Base:',rows[0].base,'| Invitaciones:',rows[0].invitaciones,
   '| Códigos cifrados habilitados:',rows[0].columna_cifrado);
  if(process.argv.includes('--check'))return;
  const sql=await fs.readFile(path.join(__dirname,'../database/09_codigos_consultables.sql'),'utf8');
  await c.query(sql);
  console.log('Migración 09 aplicada.');
 }finally{c.release();await pool.end();}
})().catch(e=>{console.error('Error al migrar:',e.message);process.exitCode=1;});
