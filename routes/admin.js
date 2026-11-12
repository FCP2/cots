'use strict';
const express=require('express');
const {z}=require('zod');
const crypto=require('crypto');
const ExcelJS=require('exceljs');
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
   pool.query(`SELECT count(*)::int AS total FROM invitaciones WHERE eliminado_en IS NULL`)
  ]);
  res.json({registros:a.rows[0].total,distritos:b.rows[0].total,invitaciones:c.rows[0].total});
 }catch(e){next(e);}
});
router.get('/invitaciones',async(req,res,next)=>{
 try{
  const {rows}=await pool.query(`SELECT i.id,i.destinatario_nombre,i.invitador_nombre,i.usos,i.max_usos,
   i.estado,i.creada_en,i.vence_en,
   (SELECT count(*)::int FROM inscripciones r WHERE r.invitacion_id=i.id AND r.eliminado_en IS NULL) AS inscritos,
   (SELECT count(*)::int FROM inscripciones r WHERE r.invitacion_id=i.id) AS total_inscritos
   FROM invitaciones i WHERE i.eliminado_en IS NULL ORDER BY i.creada_en DESC`);
  res.json(rows);
 }catch(e){next(e);}
});
router.get('/responsables',async(req,res,next)=>{
 try{
  const {rows}=await pool.query(`SELECT min(btrim(i.invitador_nombre)) AS nombre,
   count(DISTINCT i.id) FILTER (WHERE i.eliminado_en IS NULL)::int AS invitaciones,
   count(s.id)::int AS registros
   FROM invitaciones i LEFT JOIN inscripciones s ON s.invitacion_id=i.id AND s.eliminado_en IS NULL
   WHERE i.eliminado_en IS NULL OR s.id IS NOT NULL
   GROUP BY lower(btrim(i.invitador_nombre)) ORDER BY registros DESC,nombre`);
  res.set('Cache-Control','no-store').json(rows);
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
 let c;
 try{
  c=await pool.connect();
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
 }catch(e){if(c)await c.query('ROLLBACK').catch(()=>{});next(e);}finally{c?.release();}
});
router.post('/invitaciones/:id/revocar',async(req,res,next)=>{
 if(!/^\d+$/.test(req.params.id))return res.status(400).json({error:'Invitación no válida'});
 let c;
 try{
  c=await pool.connect();
  await c.query('BEGIN');
  const {rows}=await c.query(`UPDATE invitaciones SET estado='revocada'
    WHERE id=$1 AND estado<>'revocada' AND eliminado_en IS NULL RETURNING id`,[req.params.id]);
  if(!rows.length){await c.query('ROLLBACK');return res.status(409).json({error:'Invitación revocada o inexistente'});}
  await audit(c,req.usuario.id,'REVOCAR','invitaciones',rows[0].id);
  await c.query('COMMIT');res.json({ok:true});
 }catch(e){if(c)await c.query('ROLLBACK').catch(()=>{});next(e);}finally{c?.release();}
});
router.patch('/invitaciones/:id',async(req,res,next)=>{
 if(!/^\d+$/.test(req.params.id))return res.status(400).json({error:'Invitación no válida'});
 const parsed=z.object({invitador_nombre:z.string().trim().min(3).max(250)}).strict().safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:'Escribe un nombre de responsable entre 3 y 250 caracteres'});
 let c;
 try{
  c=await pool.connect();
  await c.query('BEGIN');
  const {rows}=await c.query('SELECT id,invitador_nombre FROM invitaciones WHERE id=$1 AND eliminado_en IS NULL FOR UPDATE',[req.params.id]);
  if(!rows.length){await c.query('ROLLBACK');return res.status(404).json({error:'Invitación no encontrada'});}
  const anterior=rows[0].invitador_nombre,nuevo=parsed.data.invitador_nombre;
  if(anterior!==nuevo){
   await c.query('UPDATE invitaciones SET invitador_nombre=$2 WHERE id=$1',[req.params.id,nuevo]);
   await audit(c,req.usuario.id,'EDITAR_RESPONSABLE','invitaciones',req.params.id,{anterior,nuevo});
  }
  await c.query('COMMIT');res.json({ok:true,invitador_nombre:nuevo});
 }catch(e){if(c)await c.query('ROLLBACK').catch(()=>{});next(e);}finally{c?.release();}
});
router.delete('/invitaciones/:id',async(req,res,next)=>{
 if(!/^\d+$/.test(req.params.id))return res.status(400).json({error:'Invitación no válida'});
 const parsed=z.object({eliminar_registros:z.boolean()}).strict().safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:'Indica si deseas eliminar sus registros'});
 let c;
 try{
  c=await pool.connect();
  await c.query('BEGIN');
  const {rows}=await c.query('SELECT id FROM invitaciones WHERE id=$1 AND eliminado_en IS NULL FOR UPDATE',[req.params.id]);
  if(!rows.length){await c.query('ROLLBACK');return res.status(404).json({error:'Invitación no encontrada'});}
  let registros_eliminados=0;
  if(parsed.data.eliminar_registros){
   const deleted=await c.query('DELETE FROM inscripciones WHERE invitacion_id=$1',[req.params.id]);
   registros_eliminados=deleted.rowCount;
  }
  await c.query("UPDATE invitaciones SET estado='revocada',eliminado_en=now() WHERE id=$1",[req.params.id]);
  await audit(c,req.usuario.id,'ELIMINAR','invitaciones',req.params.id,{eliminar_registros:parsed.data.eliminar_registros,registros_eliminados});
  await c.query('COMMIT');res.json({ok:true,registros_eliminados});
 }catch(e){if(c)await c.query('ROLLBACK').catch(()=>{});next(e);}finally{c?.release();}
});
router.get('/inscripciones',async(req,res,next)=>{
 try{
  const id=req.query.invitacion_id;
  if(id!==undefined&&!/^\d+$/.test(String(id)))return res.status(400).json({error:'Filtro de invitación inválido'});
  const {rows}=await pool.query(`SELECT s.id,s.nombre,s.apellido_paterno,s.apellido_materno,s.edad,
    s.telefono,s.correo_electronico,s.distrito_numero,s.seccion_electoral,
    s.referente_nombre,s.referente_apellido_paterno,s.referente_apellido_materno,
    s.creado_en,s.invitacion_id,i.invitador_nombre,
    COALESCE(substring(s.curp,1,4)||'**********'||right(s.curp,4),'No proporcionada') AS curp_mascarada,
    d.cabecera
    FROM inscripciones s JOIN invitaciones i ON i.id=s.invitacion_id
    JOIN distritos_federales d ON d.numero=s.distrito_numero
    WHERE s.eliminado_en IS NULL AND ($1::bigint IS NULL OR s.invitacion_id=$1)
    ORDER BY s.creado_en DESC LIMIT 5000`,[id||null]);
  res.set('Cache-Control','no-store').json(rows);
 }catch(e){next(e);}
});
router.get('/reportes/inscripciones.xlsx',async(req,res,next)=>{
 try{
  const responsable=req.query.responsable;
  if(responsable!==undefined&&(typeof responsable!=='string'||!responsable.trim()||responsable.length>250))
   return res.status(400).json({error:'Responsable no válido'});
  const filtro=responsable?.trim()||null;
  const [summary,detail]=await Promise.all([
   pool.query(`SELECT min(btrim(i.invitador_nombre)) AS nombre,count(s.id)::int AS registros
    FROM invitaciones i LEFT JOIN inscripciones s ON s.invitacion_id=i.id AND s.eliminado_en IS NULL
    WHERE ($1::text IS NULL OR lower(btrim(i.invitador_nombre))=lower($1))
    GROUP BY lower(btrim(i.invitador_nombre)) ORDER BY nombre`,[filtro]),
   pool.query(`SELECT s.nombre,s.apellido_paterno,s.apellido_materno,
    s.curp,
    s.edad,s.telefono,s.correo_electronico,s.distrito_numero,d.cabecera,s.seccion_electoral,
    s.referente_nombre,s.referente_apellido_paterno,s.referente_apellido_materno,
    i.invitador_nombre,i.destinatario_nombre,s.creado_en
    FROM inscripciones s JOIN invitaciones i ON i.id=s.invitacion_id
    JOIN distritos_federales d ON d.numero=s.distrito_numero
    WHERE s.eliminado_en IS NULL AND ($1::text IS NULL OR lower(btrim(i.invitador_nombre))=lower($1))
    ORDER BY s.creado_en DESC`,[filtro])
  ]);
  if(filtro&&!summary.rows.length)return res.status(404).json({error:'Responsable no encontrado'});
  const book=new ExcelJS.Workbook();book.creator='PROPUESTA COTS';
  const resumen=book.addWorksheet('Resumen');
  resumen.columns=[{width:38},{width:20}];
  resumen.mergeCells('A1:B1');resumen.getCell('A1').value=filtro?`Inscripciones de ${summary.rows[0].nombre}`:'Reporte general de inscripciones';
  resumen.getCell('A1').font={bold:true,size:16,color:{argb:'FF6A1C32'}};
  resumen.getCell('A2').value='Total de registros';resumen.getCell('B2').value=detail.rows.length;
  resumen.addRow([]);resumen.addRow(['Responsable','Registros']);
  for(const x of summary.rows)resumen.addRow([x.nombre,x.registros]);
  const detalle=book.addWorksheet('Inscripciones',{views:[{state:'frozen',ySplit:1}]});
  detalle.columns=[
   ['Nombre(s)',24],['Apellido paterno',24],['Apellido materno',24],['CURP',22],
   ['Edad',10],['Teléfono',18],['Correo electrónico',34],['Distrito',12],['Cabecera',34],
   ['Sección',12],['Referente nombre(s)',24],['Referente apellido paterno',28],
   ['Referente apellido materno',28],['Responsable',30],['Equipo',30],['Fecha (UTC)',22]
  ].map(([header,width])=>({header,width}));
  for(const x of detail.rows)detalle.addRow([
   x.nombre,x.apellido_paterno,x.apellido_materno||'',x.curp||'',x.edad,x.telefono,
   x.correo_electronico,x.distrito_numero,x.cabecera,x.seccion_electoral,
   x.referente_nombre,x.referente_apellido_paterno,x.referente_apellido_materno||'',
   x.invitador_nombre,x.destinatario_nombre,new Date(x.creado_en)
  ]);
  detalle.getColumn(16).numFmt='dd/mm/yyyy hh:mm';
  detalle.autoFilter={from:'A1',to:'P1'};
  for(const sheet of [resumen,detalle]){
   const header=sheet.getRow(sheet===resumen?4:1);
   header.font={bold:true,color:{argb:'FFFFFFFF'}};
   header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF6A1C32'}};
   header.alignment={vertical:'middle',wrapText:true};header.height=30;
  }
  res.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   'Content-Disposition':`attachment; filename="${filtro?'reporte-responsable':'reporte-general'}.xlsx"`,
   'Cache-Control':'no-store'});
  res.send(Buffer.from(await book.xlsx.writeBuffer()));
 }catch(e){next(e);}
});
module.exports=router;
