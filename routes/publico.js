'use strict';
const express=require('express');
const {z}=require('zod');
const {pool}=require('../config/database');
const {limit}=require('../middleware/limiter');
const {hashToken}=require('../utils');
const router=express.Router();
const correo=z.string().trim().email().max(254).transform(v=>v.toLowerCase());
const txt=z.string().trim().min(1).max(100);
const opc=z.string().trim().max(100).default('');
const nombrePersona=txt.regex(/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ. ]*$/);
const apellidoPersona=txt.regex(/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]*$/);
const apellidoOpcional=z.string().trim().max(100).regex(/^(?:[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]*)?$/).default('');
const form=z.object({
 token:z.string().regex(/^[a-f0-9]{64}$/).optional(),
 codigo_invitacion:z.string().trim().regex(/^[0-9A-F]{4}(?:-[0-9A-F]{4}){3}$/i).transform(s=>s.toUpperCase()),
 nombre:nombrePersona,apellido_paterno:apellidoPersona,apellido_materno:apellidoOpcional,
 curp:z.preprocess(v=>v===undefined||(typeof v==='string'&&!v.trim())?null:v,
  z.string().trim().toUpperCase().regex(/^[A-Z][AEIOUX][A-Z]{2}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[HM][A-Z]{5}[A-Z0-9]\d$/,'CURP no válida (18 caracteres)').nullable()),
 edad:z.coerce.number().int().min(0).max(120),
 telefono:z.string().regex(/^[0-9]{10}$/),
 correo_electronico:correo,
 distrito_numero:z.coerce.number().int().min(1).max(40),
 seccion_electoral:z.string().regex(/^\d{1,4}$/),
 referente_nombre:txt,referente_apellido_paterno:txt,referente_apellido_materno:opc
}).strict();
router.get('/distritos',async(req,res,next)=>{
 try{const {rows}=await pool.query('SELECT numero,cabecera FROM distritos_federales ORDER BY numero');res.json(rows);}catch(e){next(e);}
});
router.get('/invitacion/:token',limit({max:60}),async(req,res,next)=>{
 try{
  if(!/^[a-f0-9]{64}$/.test(req.params.token))return res.status(404).json({error:'Invitación no disponible'});
  const {rows}=await pool.query(`UPDATE invitaciones SET primer_acceso_en=COALESCE(primer_acceso_en,now())
    WHERE token_hash=$1 AND estado='pendiente' AND (max_usos IS NULL OR usos<max_usos)
      AND (vence_en IS NULL OR vence_en>now())
    RETURNING invitador_nombre,destinatario_nombre,vence_en`,[hashToken(req.params.token)]);
  if(!rows.length)return res.status(404).json({error:'Esta invitación ya no está disponible'});
  res.set('Cache-Control','no-store').json(rows[0]);
 }catch(e){next(e);}
});
router.post('/inscripciones',limit({max:20,windowMs:900000}),async(req,res,next)=>{
 const parsed=form.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:'Revisa los campos del formulario antes de continuar'});
 const p=parsed.data,c=await pool.connect();
 try{
  await c.query('BEGIN');
  const inv=p.token
   ? await c.query('SELECT * FROM invitaciones WHERE token_hash=$1 FOR UPDATE',[hashToken(p.token)])
   : await c.query('SELECT * FROM invitaciones WHERE codigo_hash=$1 FOR UPDATE',[hashToken(p.codigo_invitacion)]);
  const i=inv.rows[0];
  if(!i||i.codigo_hash!==hashToken(p.codigo_invitacion)||i.estado!=='pendiente'||(i.max_usos!==null && i.usos>=i.max_usos)||(i.vence_en&&new Date(i.vence_en)<=new Date())){
   await c.query('ROLLBACK');return res.status(403).json({error:'Enlace o código incorrecto, vencido o revocado'});
  }
  if(i.correo_autorizado&&i.correo_autorizado.trim().toLowerCase()!==p.correo_electronico){
   await c.query('ROLLBACK');return res.status(403).json({error:'No se pudo validar la invitación'});
  }
  const added=await c.query(`INSERT INTO inscripciones
   (invitacion_id,nombre,apellido_paterno,apellido_materno,curp,edad,telefono,correo_electronico,distrito_numero,seccion_electoral,
    referente_nombre,referente_apellido_paterno,referente_apellido_materno)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
   [i.id,p.nombre,p.apellido_paterno,p.apellido_materno,p.curp,p.edad,p.telefono,p.correo_electronico,p.distrito_numero,
    p.seccion_electoral,p.referente_nombre,p.referente_apellido_paterno,p.referente_apellido_materno]);
  await c.query(`UPDATE invitaciones SET usos=usos+1,
    estado=CASE WHEN max_usos IS NOT NULL AND usos+1>=max_usos THEN 'agotada' ELSE 'pendiente' END,
    utilizada_en=now() WHERE id=$1`,[i.id]);
  // Auditar sin copiar CURP, correo o teléfono a los eventos.
  await c.query(`INSERT INTO auditoria(usuario_id,accion,entidad,entidad_id,detalle)
   VALUES(NULL,'INSCRIPCION_PUBLICA','inscripciones',$1,jsonb_build_object('invitacion_id',$2::bigint))`,[added.rows[0].id,i.id]);
  await c.query('COMMIT');
  res.set('Cache-Control','no-store').status(201).json({ok:true});
 }catch(e){await c.query('ROLLBACK').catch(()=>{});
  if(e.code==='23505')return res.status(409).json({error:'No se pudo completar el registro. Contacta al responsable de tu invitación.'});
  next(e);
 }finally{c.release();}
});
module.exports=router;
