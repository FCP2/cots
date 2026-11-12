'use strict';
const express=require('express');
const {z}=require('zod');
const crypto=require('crypto');
const {pool}=require('../config/database');
const {auth,admin}=require('../middleware/auth');
const {token,hashToken,audit}=require('../utils');
const {limit}=require('../middleware/limiter');
const router=express.Router();
router.use(auth,admin);
router.get('/resumen',async(req,res,next)=>{
 try{
  const [a,b,c]=await Promise.all([
   pool.query('SELECT count(*)::int AS total FROM inscripciones WHERE eliminado_en IS NULL'),
   pool.query('SELECT count(DISTINCT distrito_numero)::int AS total FROM inscripciones WHERE eliminado_en IS NULL'),
   pool.query(`SELECT count(*)::int AS total FROM invitaciones`)
  ]);
  res.json({registros:a.rows[0].total,distritos:b.rows[0].total,invitaciones:c.rows[0].total});
 }catch(e){next(e);}
});
router.get('/invitaciones',async(req,res,next)=>{
 try{
  const {rows}=await pool.query(`SELECT i.id,i.destinatario_nombre,i.invitador_nombre,i.usos,i.max_usos,
   i.estado,i.creada_en,i.vence_en,
   (SELECT count(*)::int FROM inscripciones r WHERE r.invitacion_id=i.id AND r.eliminado_en IS NULL) AS inscritos
   FROM invitaciones i ORDER BY i.creada_en DESC`);
  res.json(rows);
 }catch(e){next(e);}
});
router.post('/invitaciones',limit({max:30}),async(req,res,next)=>{
 const schema=z.object({
  destinatario_nombre:z.string().trim().min(3).max(250),
  invitador_nombre:z.string().trim().min(3).max(250),
  dias_vigencia:z.coerce.number().int().min(1).max(365)
 });
 const parsed=schema.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:'Verifica los datos de la invitación'});
 const p=parsed.data,raw=token();
 const codigo=crypto.randomBytes(8).toString('hex').toUpperCase().match(/.{1,4}/g).join('-');
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  const {rows}=await c.query(`INSERT INTO invitaciones
   (token_hash,codigo_hash,destinatario_nombre,invitador_nombre,max_usos,creado_por,vence_en)
   VALUES($1,$2,$3,$4,NULL,$5,now()+($6::int*interval '1 day')) RETURNING id,vence_en`,
   [hashToken(raw),hashToken(codigo),p.destinatario_nombre,p.invitador_nombre,req.usuario.id,p.dias_vigencia]);
  await audit(c,req.usuario.id,'CREAR','invitaciones',rows[0].id,{invitador:p.invitador_nombre,grupo:p.destinatario_nombre});
  await c.query('COMMIT');
  const appUrl=(process.env.APP_URL||'').replace(/\/$/,'');
  res.status(201).json({id:rows[0].id,vence_en:rows[0].vence_en,
   url:`${appUrl}/?invite=registro`,codigo_invitacion:codigo});
 }catch(e){await c.query('ROLLBACK').catch(()=>{});next(e);}finally{c.release();}
});
router.post('/invitaciones/:id/revocar',async(req,res,next)=>{
 if(!/^\d+$/.test(req.params.id))return res.status(400).json({error:'Invitación no válida'});
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  const {rows}=await c.query(`UPDATE invitaciones SET estado='revocada'
    WHERE id=$1 AND estado<>'revocada' RETURNING id`,[req.params.id]);
  if(!rows.length){await c.query('ROLLBACK');return res.status(409).json({error:'Invitación revocada o inexistente'});}
  await audit(c,req.usuario.id,'REVOCAR','invitaciones',rows[0].id);
  await c.query('COMMIT');res.json({ok:true});
 }catch(e){await c.query('ROLLBACK').catch(()=>{});next(e);}finally{c.release();}
});
router.get('/inscripciones',async(req,res,next)=>{
 try{
  const id=req.query.invitacion_id;
  if(id!==undefined&&!/^\d+$/.test(String(id)))return res.status(400).json({error:'Filtro de invitación inválido'});
  const {rows}=await pool.query(`SELECT s.id,s.nombre,s.apellido_paterno,s.apellido_materno,s.edad,
    s.telefono,s.correo_electronico,s.distrito_numero,s.seccion_electoral,
    s.referente_nombre,s.referente_apellido_paterno,s.referente_apellido_materno,
    s.creado_en,s.invitacion_id,i.invitador_nombre,
    substring(s.curp,1,4)||'**********'||right(s.curp,4) AS curp_mascarada,
    d.cabecera
    FROM inscripciones s JOIN invitaciones i ON i.id=s.invitacion_id
    JOIN distritos_federales d ON d.numero=s.distrito_numero
    WHERE s.eliminado_en IS NULL AND ($1::bigint IS NULL OR s.invitacion_id=$1)
    ORDER BY s.creado_en DESC LIMIT 5000`,[id||null]);
  res.set('Cache-Control','no-store').json(rows);
 }catch(e){next(e);}
});
module.exports=router;
