'use strict';
const express=require('express');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {z}=require('zod');
const {pool}=require('../config/database');
const {limit}=require('../middleware/limiter');
const {token,hashToken,keyName}=require('../utils');
const {registroCurricularSchema,VERSION_CAPTURA}=require('../validation/captura-curricular');
const router=express.Router();
const COOKIE='cots_confirm';
const COOKIE_OPTIONS={httpOnly:true,secure:process.env.COOKIE_SECURE==='true',sameSite:'strict',path:'/api/confirmacion'};
const CODIGO=z.string().trim().regex(/^[0-9A-F]{4}(?:-[0-9A-F]{4}){3}$/i).transform(s=>s.toUpperCase());
const TEXT=z.string().trim().min(1).max(100);
const IDENTIFICAR=z.object({codigo_invitacion:CODIGO,nombre:TEXT,apellido_paterno:TEXT,apellido_materno:z.string().trim().max(100).default(''),seccion_electoral:z.string().trim().regex(/^(?:\d{1,4})?$/).default(''),telefono:z.string().trim().regex(/^(?:\d{10})?$/).default('')}).strict().refine(v=>Boolean(v.seccion_electoral||v.telefono));
const MES=z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/);
const EXPERIENCIA=z.object({puesto:z.string().trim().min(1).max(150),institucion:z.string().trim().min(1).max(150),periodo_inicio:MES,periodo_fin:MES.nullable()}).strict().refine(v=>!v.periodo_fin||v.periodo_fin>=v.periodo_inicio);
const FICHA=z.object({nivel_estudios:z.enum(['primaria','secundaria','preparatoria','bachillerato','licenciatura','maestría','doctorado','otro']),otro_nivel:z.string().trim().max(100).default(''),estatus_estudios:z.enum(['inconcluso','concluido','titulado']),cursos:z.string().trim().max(5000).default(''),sin_experiencia_laboral:z.boolean().default(false),experiencias:z.array(EXPERIENCIA).max(5)}).strict()
 .refine(v=>v.nivel_estudios!=='otro'||v.otro_nivel.length>0)
 .refine(v=>v.sin_experiencia_laboral?v.experiencias.length===0:v.experiencias.length>0);
const NUEVO=z.object({codigo_invitacion:CODIGO,registro:registroCurricularSchema,ficha:FICHA}).strict();
const FALLA='No se pudo identificar un registro único con esos datos. Consulta al administrador si necesitas apoyo.';
const CODIGO_INVALIDO='Código de invitación no disponible.';
const fileDir=()=>process.env.PHOTO_STORAGE_DIR&&path.isAbsolute(process.env.PHOTO_STORAGE_DIR)?process.env.PHOTO_STORAGE_DIR:process.env.NODE_ENV==='production'?null:path.join(__dirname,'../private/fotos');
function tipoImagen(buffer){
 if(buffer.length>=3&&buffer.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff])))return {mime:'image/jpeg',ext:'jpg'};
 if(buffer.length>=8&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {mime:'image/png',ext:'png'};
 if(buffer.length>=12&&buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP')return {mime:'image/webp',ext:'webp'};
 return null;
}
async function invitacion(codigo){
 const {rows}=await pool.query(`SELECT id,invitador_nombre,destinatario_nombre,estado,vence_en,max_usos,usos FROM invitaciones
  WHERE codigo_hash=$1 AND estado<>'revocada' AND eliminado_en IS NULL`,[hashToken(codigo)]);
 return rows[0];
}
function permiteNuevo(inv){return inv.estado==='pendiente'
 &&(!inv.vence_en||new Date(inv.vence_en)>new Date())
 &&(inv.max_usos===null||inv.usos<inv.max_usos);}
async function autenticar(req,res,next){
 try{
  const raw=req.cookies[COOKIE];
  if(!raw||!/^[a-f0-9]{64}$/.test(raw))return res.status(401).json({error:'Identifícate de nuevo para continuar.'});
  const {rows}=await pool.query(`SELECT s.inscripcion_id FROM sesiones_confirmacion s
   JOIN inscripciones r ON r.id=s.inscripcion_id AND r.eliminado_en IS NULL
   JOIN invitaciones i ON i.id=r.invitacion_id AND i.eliminado_en IS NULL AND i.estado<>'revocada'
   WHERE s.token_hash=$1 AND s.revocada_en IS NULL AND s.vence_en>now()`,[hashToken(raw)]);
  if(!rows.length)return res.status(401).json({error:'La sesión terminó. Identifícate nuevamente.'});
  req.inscripcionId=rows[0].inscripcion_id;next();
 }catch(e){next(e);}
}
router.post('/codigo',limit({max:12,windowMs:900000}),async(req,res,next)=>{
 try{
  const p=CODIGO.safeParse(req.body?.codigo_invitacion);
  if(!p.success)return res.status(400).json({error:'Escribe el código de invitación completo.'});
  const inv=await invitacion(p.data);
  if(!inv)return res.status(403).json({error:CODIGO_INVALIDO});
  res.set('Cache-Control','no-store').json({responsable:inv.invitador_nombre,equipo:inv.destinatario_nombre,permite_nuevo:permiteNuevo(inv)});
 }catch(e){next(e);}
});
router.post('/nuevo',limit({max:10,windowMs:900000}),async(req,res,next)=>{
 const parsed=NUEVO.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:'Revisa los datos del registro y la ficha antes de continuar.'});
 const dir=fileDir();
 if(!dir)return res.status(503).json({error:'El almacenamiento de fotos aún no está configurado.'});
 if(process.env.NODE_ENV==='production'){
  try{if(!(await fs.stat(dir)).isDirectory())throw Error();}
  catch{return res.status(503).json({error:'El disco de fotografías aún no está disponible.'});}
 }
 const p=parsed.data,r=p.registro,f=p.ficha;
 let c;
 try{
  c=await pool.connect();
  await c.query('BEGIN');
  const {rows}=await c.query('SELECT * FROM invitaciones WHERE codigo_hash=$1 FOR UPDATE',[hashToken(p.codigo_invitacion)]);
  const inv=rows[0];
  if(!inv||inv.eliminado_en||!permiteNuevo(inv)){
   await c.query('ROLLBACK');return res.status(403).json({error:'Este código ya no admite registros nuevos.'});
  }
  if(inv.correo_autorizado&&inv.correo_autorizado.trim().toLowerCase()!==r.correo_electronico){
   await c.query('ROLLBACK');return res.status(403).json({error:'No se pudo validar la invitación para este correo.'});
  }
  // Cada envío confirmado crea una inscripción independiente, incluso con datos repetidos.
  const added=await c.query(`INSERT INTO inscripciones
   (invitacion_id,nombre,apellido_paterno,apellido_materno,curp,edad,telefono,correo_electronico,distrito_numero,seccion_electoral,
    referente_nombre,referente_apellido_paterno,referente_apellido_materno,rfc,homoclave,version_captura)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
   [inv.id,r.nombre,r.apellido_paterno,r.apellido_materno,r.curp,r.edad,r.telefono,r.correo_electronico,r.distrito_numero,
    r.seccion_electoral,r.referente_nombre,r.referente_apellido_paterno,r.referente_apellido_materno,r.rfc,r.homoclave,VERSION_CAPTURA]);
  const id=added.rows[0].id,nivel=f.nivel_estudios==='otro'?f.otro_nivel:f.nivel_estudios;
  await c.query(`INSERT INTO fichas_curriculares(inscripcion_id,nivel_estudios,estatus_estudios,cursos,sin_experiencia_laboral)
   VALUES($1,$2,$3,$4,$5)`,[id,nivel,f.estatus_estudios,f.cursos,f.sin_experiencia_laboral]);
  for(const [index,ex] of f.experiencias.entries()){
   await c.query(`INSERT INTO experiencias_laborales(inscripcion_id,orden,puesto,institucion,periodo_inicio,periodo_fin)
    VALUES($1,$2,$3,$4,$5,$6)`,[id,index+1,ex.puesto,ex.institucion,ex.periodo_inicio,ex.periodo_fin]);
  }
  await c.query(`UPDATE invitaciones SET usos=usos+1,
   estado=CASE WHEN max_usos IS NOT NULL AND usos+1>=max_usos THEN 'agotada' ELSE 'pendiente' END,
   utilizada_en=now() WHERE id=$1`,[inv.id]);
  await c.query(`INSERT INTO auditoria(usuario_id,accion,entidad,entidad_id,detalle)
   VALUES(NULL,'INSCRIPCION_CURRICULAR','inscripciones',$1,jsonb_build_object('invitacion_id',$2::bigint))`,[id,inv.id]);
  const raw=token();
  await c.query(`INSERT INTO sesiones_confirmacion(token_hash,inscripcion_id,vence_en)
   VALUES($1,$2,now()+interval '2 hours')`,[hashToken(raw),id]);
  await c.query('COMMIT');
  res.cookie(COOKIE,raw,{...COOKIE_OPTIONS,maxAge:7200000});
  res.set('Cache-Control','no-store').status(201).json({ok:true});
 }catch(e){if(c)await c.query('ROLLBACK').catch(()=>{});next(e);}finally{c?.release();}
});
router.post('/identificar',limit({max:8,windowMs:900000}),async(req,res,next)=>{
 try{
  const p=IDENTIFICAR.safeParse(req.body);
  if(!p.success)return res.status(400).json({error:'Revisa nombre y apellidos; escribe sección electoral o teléfono histórico.'});
  const inv=await invitacion(p.data.codigo_invitacion);
  if(!inv)return res.status(403).json({error:CODIGO_INVALIDO});
  // El código acota la búsqueda. Nunca se elige automáticamente entre dos coincidencias.
  const {rows}=await pool.query(`SELECT id,nombre,apellido_paterno,apellido_materno,seccion_electoral
   FROM inscripciones WHERE invitacion_id=$1 AND eliminado_en IS NULL
    AND (seccion_electoral=$2 OR (seccion_electoral IS NULL AND telefono=$3))`,
   [inv.id,p.data.seccion_electoral,p.data.telefono]);
  const match=rows.filter(r=>keyName(r.nombre)===keyName(p.data.nombre)
   &&keyName(r.apellido_paterno)===keyName(p.data.apellido_paterno)
   &&keyName(r.apellido_materno)===keyName(p.data.apellido_materno));
  if(match.length!==1)return res.status(409).json({error:FALLA});
  const raw=token();
  await pool.query(`INSERT INTO sesiones_confirmacion(token_hash,inscripcion_id,vence_en)
   VALUES($1,$2,now()+interval '2 hours')`,[hashToken(raw),match[0].id]);
  res.cookie(COOKIE,raw,{...COOKIE_OPTIONS,maxAge:7200000});
  res.set('Cache-Control','no-store').json({ok:true});
 }catch(e){next(e);}
});
router.get('/ficha',autenticar,async(req,res,next)=>{
 try{
  const {rows}=await pool.query(`SELECT r.nombre,r.apellido_paterno,r.apellido_materno,
   r.distrito_numero,d.cabecera,r.seccion_electoral,
   f.nivel_estudios,f.estatus_estudios,f.cursos,COALESCE(f.sin_experiencia_laboral,false) AS sin_experiencia_laboral,
   (f.foto_archivo IS NOT NULL) AS tiene_foto
   FROM inscripciones r JOIN invitaciones i ON i.id=r.invitacion_id
   JOIN distritos_federales d ON d.numero=r.distrito_numero
   LEFT JOIN fichas_curriculares f ON f.inscripcion_id=r.id
   WHERE r.id=$1 AND r.eliminado_en IS NULL`,[req.inscripcionId]);
  if(!rows.length)return res.sendStatus(404);
  const experiencias=await pool.query(`SELECT puesto,institucion,periodo_inicio,periodo_fin
   FROM experiencias_laborales WHERE inscripcion_id=$1 ORDER BY orden`,[req.inscripcionId]);
  res.set('Cache-Control','no-store').json({registro:rows[0],experiencias:experiencias.rows});
 }catch(e){next(e);}
});
router.put('/ficha',autenticar,async(req,res,next)=>{
 const p=FICHA.safeParse(req.body);
 if(!p.success)return res.status(400).json({error:'Revisa formación, experiencias y cursos.'});
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  const v=p.data,nivel=v.nivel_estudios==='otro'?v.otro_nivel:v.nivel_estudios;
  await c.query(`INSERT INTO fichas_curriculares(inscripcion_id,nivel_estudios,estatus_estudios,cursos,sin_experiencia_laboral)
   VALUES($1,$2,$3,$4,$5) ON CONFLICT(inscripcion_id) DO UPDATE SET
   nivel_estudios=EXCLUDED.nivel_estudios,estatus_estudios=EXCLUDED.estatus_estudios,
   cursos=EXCLUDED.cursos,sin_experiencia_laboral=EXCLUDED.sin_experiencia_laboral,actualizado_en=now()`,[req.inscripcionId,nivel,v.estatus_estudios,v.cursos,v.sin_experiencia_laboral]);
  await c.query('DELETE FROM experiencias_laborales WHERE inscripcion_id=$1',[req.inscripcionId]);
  for(const [index,ex] of v.experiencias.entries()){
   await c.query(`INSERT INTO experiencias_laborales(inscripcion_id,orden,puesto,institucion,periodo_inicio,periodo_fin)
    VALUES($1,$2,$3,$4,$5,$6)`,[req.inscripcionId,index+1,ex.puesto,ex.institucion,ex.periodo_inicio,ex.periodo_fin]);
  }
  await c.query('COMMIT');
  res.set('Cache-Control','no-store').json({ok:true});
 }catch(e){await c.query('ROLLBACK').catch(()=>{});next(e);}finally{c.release();}
});
router.put('/foto',autenticar,express.raw({type:['image/jpeg','image/png','image/webp'],limit:'2mb'}),async(req,res,next)=>{
 const dir=fileDir();
 if(!dir)return res.status(503).json({error:'El almacenamiento de fotos aún no está configurado.'});
 if(process.env.NODE_ENV==='production'){
  try{if(!(await fs.stat(dir)).isDirectory())throw Error();}
  catch{return res.status(503).json({error:'El disco de fotografías aún no está disponible.'});}
 }
 const data=req.body;
 const type=Buffer.isBuffer(data)&&tipoImagen(data);
 if(!type||data.length<100||data.length>2*1024*1024||req.get('content-type')?.split(';')[0]!==type.mime)
  return res.status(400).json({error:'Sube una foto JPG, PNG o WebP de hasta 2 MB.'});
 const filename=`${crypto.randomUUID()}.${type.ext}`;
 let c;
 try{
  await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,filename),data,{flag:'wx',mode:0o600});
  c=await pool.connect();
  let previous=null;
  try{
   await c.query('BEGIN');
   const {rows}=await c.query('SELECT foto_archivo FROM fichas_curriculares WHERE inscripcion_id=$1 FOR UPDATE',[req.inscripcionId]);
   if(!rows.length){await c.query('ROLLBACK');await fs.unlink(path.join(dir,filename));return res.status(409).json({error:'Guarda primero la ficha para subir la foto.'});}
   previous=rows[0].foto_archivo;
   await c.query('UPDATE fichas_curriculares SET foto_archivo=$1,actualizado_en=now() WHERE inscripcion_id=$2',[filename,req.inscripcionId]);
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK').catch(()=>{});await fs.unlink(path.join(dir,filename)).catch(()=>{});throw e;}
  if(previous&&/^[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(previous))await fs.unlink(path.join(dir,previous)).catch(()=>{});
  res.set('Cache-Control','no-store').json({ok:true});
 }catch(e){if(!c)await fs.unlink(path.join(dir,filename)).catch(()=>{});next(e);}finally{c?.release();}
});
router.get('/foto',autenticar,async(req,res,next)=>{
 try{
  const dir=fileDir();if(!dir)return res.sendStatus(503);
  const {rows}=await pool.query('SELECT foto_archivo FROM fichas_curriculares WHERE inscripcion_id=$1',[req.inscripcionId]);
  const name=rows[0]?.foto_archivo;
  if(!name||!/^[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(name))return res.sendStatus(404);
  res.set('Cache-Control','private, no-store');res.type(path.extname(name));res.sendFile(path.join(dir,name));
 }catch(e){next(e);}
});
router.post('/salir',autenticar,async(req,res,next)=>{
 try{
  await pool.query('UPDATE sesiones_confirmacion SET revocada_en=now() WHERE token_hash=$1',[hashToken(req.cookies[COOKIE])]);
  res.clearCookie(COOKIE,COOKIE_OPTIONS).json({ok:true});
 }catch(e){next(e);}
});
module.exports=router;
