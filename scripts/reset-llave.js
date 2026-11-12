'use strict';
require('dotenv').config();
const {pool}=require('../config/database');const {token,hashToken}=require('../utils');
(async()=>{
 const [,,correo]=process.argv;
 if(!correo)throw new Error('Uso: npm run reset-llave -- "correo@dominio.mx"');
 const c=await pool.connect();try{
  await c.query('BEGIN');const llave=token();
  const {rows}=await c.query(`UPDATE usuarios SET llave_hash=$1 WHERE lower(btrim(correo_electronico))=lower(btrim($2)) RETURNING id`,[hashToken(llave),correo]);
  if(!rows.length)throw new Error('Usuario no encontrado');
  await c.query('UPDATE sesiones SET revocada_en=now() WHERE usuario_id=$1',[rows[0].id]);
  await c.query('INSERT INTO auditoria(usuario_id,accion,entidad,entidad_id) VALUES($1,$2,$3,$4)',[rows[0].id,'RESET_LLAVE','usuarios',rows[0].id]);
  await c.query('COMMIT');console.log(`NUEVA LLAVE PARA ${correo}: ${llave}\nLa llave anterior y las sesiones quedaron revocadas.`);
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
