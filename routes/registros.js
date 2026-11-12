'use strict';
const express=require('express'),router=express.Router();
const {pool}=require('../config/database');
const {auth}=require('../middleware/auth');
const {parse,registro,referente}=require('../middleware/validation');
const {keyName,audit}=require('../utils');
router.use(auth);
router.get('/catalogos/distritos',async(req,res,next)=>{
 try{const {rows}=await pool.query('SELECT numero,cabecera FROM distritos_federales ORDER BY numero');res.json(rows);}catch(e){next(e);}
});
router.get('/catalogos/municipios',async(req,res,next)=>{
 try{const {rows}=await pool.query('SELECT distrito_numero,municipio FROM distritos_municipios ORDER BY distrito_numero,municipio');res.json(rows);}catch(e){next(e);}
});
router.get('/referentes',async(req,res,next)=>{
 try{const {rows}=await pool.query('SELECT id,nombre,apellido_paterno,apellido_materno FROM referentes WHERE capturista_id=$1 ORDER BY nombre,apellido_paterno',[req.usuario.id]);res.json(rows);}catch(e){next(e);}
});
router.post('/referentes',parse(referente),async(req,res,next)=>{
 const p=req.valid,uid=req.usuario.id;
 const clave=[p.nombre,p.apellido_paterno,p.apellido_materno||''].map(keyName).join('|');
 try{
  const {rows}=await pool.query(`INSERT INTO referentes(capturista_id,nombre,apellido_paterno,apellido_materno,clave_normalizada)
   VALUES($1,$2,$3,$4,$5) ON CONFLICT(capturista_id,clave_normalizada) DO UPDATE SET nombre=referentes.nombre
   RETURNING id,nombre,apellido_paterno,apellido_materno`,[uid,p.nombre,p.apellido_paterno,p.apellido_materno,clave]);
  res.status(201).json(rows[0]);
 }catch(e){next(e);}
});
router.get('/registros',async(req,res,next)=>{
 try{
  const {rows}=await pool.query(`SELECT r.*,f.nombre AS referente_nombre,f.apellido_paterno AS referente_ap,f.apellido_materno AS referente_am,d.cabecera
   FROM registros r JOIN referentes f ON f.id=r.referente_id JOIN distritos_federales d ON d.numero=r.distrito_numero
   WHERE r.capturista_id=$1 AND r.eliminado_en IS NULL ORDER BY r.creado_en DESC, r.id DESC`,[req.usuario.id]);res.json(rows);
 }catch(e){next(e);}
});
router.post('/registros',parse(registro),async(req,res,next)=>{
 const p=req.valid,c=await pool.connect();
 try{
  await c.query('BEGIN');
  const {rows}=await c.query(`INSERT INTO registros(capturista_id,nombre,apellido_paterno,apellido_materno,edad,telefono,correo_electronico,distrito_numero,seccion_electoral,referente_id)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[req.usuario.id,p.nombre,p.apellido_paterno,p.apellido_materno,p.edad??null,p.telefono,p.correo_electronico,p.distrito_numero,p.seccion_electoral,p.referente_id]);
  await audit(c,req.usuario.id,'CREAR','registros',rows[0].id);await c.query('COMMIT');res.status(201).json(rows[0]);
 }catch(e){await c.query('ROLLBACK');next(e);}finally{c.release();}
});
router.put('/registros/:id',parse(registro),async(req,res,next)=>{
 const p=req.valid,c=await pool.connect();
 try{
  await c.query('BEGIN');
  const {rows}=await c.query(`UPDATE registros SET nombre=$3,apellido_paterno=$4,apellido_materno=$5,edad=$6,telefono=$7,correo_electronico=$8,
   distrito_numero=$9,seccion_electoral=$10,referente_id=$11,actualizado_en=now()
   WHERE id=$1 AND capturista_id=$2 AND eliminado_en IS NULL RETURNING *`,
   [req.params.id,req.usuario.id,p.nombre,p.apellido_paterno,p.apellido_materno,p.edad??null,p.telefono,p.correo_electronico,p.distrito_numero,p.seccion_electoral,p.referente_id]);
  if(!rows.length){await c.query('ROLLBACK');return res.status(404).json({error:'Registro no encontrado'});}
  await audit(c,req.usuario.id,'EDITAR','registros',rows[0].id);await c.query('COMMIT');res.json(rows[0]);
 }catch(e){await c.query('ROLLBACK');next(e);}finally{c.release();}
});
router.delete('/registros/:id',async(req,res,next)=>{
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  const {rows}=await c.query(`UPDATE registros SET eliminado_en=now(),actualizado_en=now()
   WHERE id=$1 AND capturista_id=$2 AND eliminado_en IS NULL RETURNING id`,[req.params.id,req.usuario.id]);
  if(!rows.length){await c.query('ROLLBACK');return res.status(404).json({error:'Registro no encontrado'});}
  await audit(c,req.usuario.id,'ELIMINAR','registros',rows[0].id);await c.query('COMMIT');res.json({ok:true});
 }catch(e){await c.query('ROLLBACK');next(e);}finally{c.release();}
});
module.exports=router;
