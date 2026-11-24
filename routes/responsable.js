'use strict';
const express=require('express');
const {z}=require('zod');
const {pool}=require('../config/database');
const {responsable}=require('../middleware/responsable');
const {limit}=require('../middleware/limiter');
const {token,hashToken}=require('../utils');
const router=express.Router();
const cookieConfig=()=>({httpOnly:true,secure:process.env.COOKIE_SECURE==='true',sameSite:'strict',path:'/'});
const codigo=z.string().trim().regex(/^[0-9A-F]{4}(?:-[0-9A-F]{4}){3}$/i).transform(v=>v.toUpperCase());

router.post('/entrar',limit({max:8}),async(req,res,next)=>{
 const parsed=z.object({usuario:codigo,llave:codigo}).strict().safeParse(req.body);
 if(!parsed.success||parsed.data.usuario!==parsed.data.llave)
  return res.status(400).json({error:'Escribe el mismo código de invitación en Usuario y Llave'});
 try{
  const {rows}=await pool.query(`SELECT id,invitador_nombre,destinatario_nombre,vence_en FROM invitaciones
   WHERE codigo_hash=$1 AND estado='pendiente' AND eliminado_en IS NULL
    AND (vence_en IS NULL OR vence_en>now()) LIMIT 2`,[hashToken(parsed.data.usuario)]);
  if(rows.length!==1)return res.status(401).json({error:'Código de invitación inválido o vencido'});
  const i=rows[0],raw=token();
  await pool.query(`INSERT INTO sesiones_responsables(token_hash,invitacion_id,vence_en)
   VALUES($1,$2,LEAST(now()+interval '12 hours',COALESCE($3::timestamptz,now()+interval '12 hours')))`,
   [hashToken(raw),i.id,i.vence_en]);
  res.cookie('cots_sid',raw,{...cookieConfig(),maxAge:12*3600000});
  res.set('Cache-Control','no-store').json({responsable:{invitador_nombre:i.invitador_nombre,destinatario_nombre:i.destinatario_nombre}});
 }catch(e){next(e);}
});
router.get('/inscripciones',responsable,async(req,res,next)=>{
 const rawPage=req.query.pagina===undefined?'1':req.query.pagina;
 if(typeof rawPage!=='string'||!/^[1-9]\d{0,5}$/.test(rawPage))
  return res.status(400).json({error:'Página no válida'});
 const pagina=Number(rawPage),tamano=20;
 try{
  const [count,detail]=await Promise.all([
   pool.query('SELECT count(*)::int AS total FROM inscripciones WHERE invitacion_id=$1 AND eliminado_en IS NULL',[req.invitacion.id]),
   pool.query(`SELECT concat_ws(' ',btrim(s.nombre),btrim(s.apellido_paterno),nullif(btrim(s.apellido_materno),'')) AS nombre_completo,
    s.creado_en,s.distrito_numero,d.cabecera
    FROM inscripciones s JOIN distritos_federales d ON d.numero=s.distrito_numero
    WHERE s.invitacion_id=$1 AND s.eliminado_en IS NULL
    ORDER BY s.creado_en DESC,s.id DESC LIMIT $2 OFFSET $3`,[req.invitacion.id,tamano,(pagina-1)*tamano])
  ]);
  res.set('Cache-Control','no-store').json({total:count.rows[0].total,pagina,tamano,registros:detail.rows});
 }catch(e){next(e);}
});
router.post('/salir',async(req,res,next)=>{
 const raw=req.cookies?.cots_sid;
 try{
  if(raw&&/^[a-f0-9]{64}$/.test(raw))
   await pool.query('UPDATE sesiones_responsables SET revocada_en=now() WHERE token_hash=$1',[hashToken(raw)]);
  res.clearCookie('cots_sid',cookieConfig());res.json({ok:true});
 }catch(e){next(e);}
});
module.exports=router;
