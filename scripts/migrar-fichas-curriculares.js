'use strict';
require('dotenv').config();
const fs=require('node:fs/promises'),path=require('node:path');
const {pool}=require('../config/database');
(async()=>{
 const c=await pool.connect();
 try{
  const {rows}=await c.query(`SELECT current_database() AS base,
   to_regclass('fichas_curriculares') IS NOT NULL AS instalada,
   EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='fichas_curriculares' AND column_name='sin_experiencia_laboral') AS sin_experiencia_instalada,
   (SELECT count(*)::int FROM inscripciones WHERE eliminado_en IS NULL) AS inscripciones,
   (SELECT count(*)::int FROM inscripciones WHERE eliminado_en IS NULL AND seccion_electoral IS NULL) AS sin_seccion,
   (SELECT count(*)::int FROM inscripciones WHERE eliminado_en IS NULL AND seccion_electoral IS NULL AND telefono ~ '^[0-9]{10}$') AS sin_seccion_con_telefono`);
  console.log('Base:',rows[0].base,'| Inscripciones activas:',rows[0].inscripciones,
   '| Sin sección:',rows[0].sin_seccion,'| Con teléfono verificable:',rows[0].sin_seccion_con_telefono,
   '| Fichas instaladas:',rows[0].instalada,'| Indicador sin experiencia:',rows[0].sin_experiencia_instalada);
  if(process.argv.includes('--check'))return;
  await c.query(await fs.readFile(path.join(__dirname,'../database/11_fichas_curriculares.sql'),'utf8'));
  console.log('Migración 11 aplicada sin modificar inscripciones existentes.');
 }finally{c.release();await pool.end();}
})().catch(e=>{console.error('Error al migrar:',e.message);process.exitCode=1;});
