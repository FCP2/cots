'use strict';
require('dotenv').config();
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const {pool}=require('../config/database');
const {hashToken}=require('../utils');
const router=require('../routes/confirmacion');
const guardar=router.stack.find(x=>x.route?.path==='/nuevo'&&x.route.methods.post).route.stack.at(-1).handle;

// Copia únicamente la estructura a tablas de sesión: nunca escribe registros reales.
(async()=>{
 const original=pool.connect;let client;
 try{
  client=await pool.connect();
  for(const table of ['invitaciones','inscripciones','fichas_curriculares','experiencias_laborales','auditoria','sesiones_confirmacion']){
   await client.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL)`);
   const {rows}=await client.query('SELECT relnamespace=pg_my_temp_schema() AS temporal FROM pg_class WHERE oid=$1::regclass',[table]);
   assert.equal(rows[0].temporal,true);
  }
  const codigo='ABCD-1234-ABCD-1234';
  const invitacion=await client.query(`INSERT INTO invitaciones
   (token_hash,codigo_hash,destinatario_nombre,creado_por,invitador_nombre,max_usos,vence_en)
   VALUES($1,$2,'Prueba temporal',1,'Prueba temporal',NULL,now()+interval '1 day') RETURNING id`,
   [hashToken('prueba temporal'),hashToken(codigo)]);
  const body={codigo_invitacion:codigo,
   registro:{nombre:'Ana',apellido_paterno:'Pérez',apellido_materno:'López',curp:'SABK990101HMCBRR08',rfc:'GALA900101',homoclave:'0A1',edad:'34',telefono:'5512345678',correo_electronico:'prueba@example.com',distrito_numero:'1',seccion_electoral:'1234',referente_nombre:'Eva',referente_apellido_paterno:'Pérez',referente_apellido_materno:''},
   ficha:{nivel_estudios:'licenciatura',estatus_estudios:'concluido',cursos:'Primera ficha',sin_experiencia_laboral:false,experiencias:[{puesto:'Analista',institucion:'Instituto',periodo_inicio:'2020-01',periodo_fin:null}]}};
  const r=body.registro;
  const anterior=await client.query(`INSERT INTO inscripciones
   (invitacion_id,nombre,apellido_paterno,apellido_materno,curp,edad,telefono,correo_electronico,distrito_numero,seccion_electoral,referente_nombre,referente_apellido_paterno,referente_apellido_materno)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
   [invitacion.rows[0].id,r.nombre,r.apellido_paterno,r.apellido_materno,r.curp,r.edad,r.telefono,r.correo_electronico,r.distrito_numero,r.seccion_electoral,r.referente_nombre,r.referente_apellido_paterno,r.referente_apellido_materno]);
  const snapshot=()=>client.query("SELECT to_jsonb(s)-'rfc'-'homoclave'-'version_captura' AS datos FROM inscripciones s WHERE id=$1",[anterior.rows[0].id]);
  const antes=(await snapshot()).rows[0].datos;
  const migracion=await fs.readFile(path.join(__dirname,'../database/12_identificador_rfc.sql'),'utf8');
  await client.query(migracion);
  await client.query(migracion); // Verifica que sea seguro repetirla.
  assert.deepEqual((await snapshot()).rows[0].datos,antes);
  pool.connect=async()=>({query:client.query.bind(client),release(){}});
  for(let intento=0;intento<2;intento++){
   const estado={status:200};
   const res={status(n){estado.status=n;return this;},set(){return this;},cookie(){return this;},json(data){estado.body=data;return this;}};
   const datos={...body,ficha:{...body.ficha,cursos:intento?'Segunda ficha':'Primera ficha'}};
   let error;
   await guardar({body:datos},res,e=>{error=e;});
   assert.ifError(error);
   assert.equal(estado.status,201,JSON.stringify(estado.body));
   assert.equal(estado.body.ok,true);
  }
  const {rows}=await client.query(`SELECT s.id,s.nombre,s.apellido_paterno,s.apellido_materno,s.curp,s.rfc,s.homoclave,s.version_captura,s.telefono,s.seccion_electoral,f.cursos,
   (SELECT count(*)::int FROM experiencias_laborales e WHERE e.inscripcion_id=s.id) AS experiencias
   FROM inscripciones s JOIN fichas_curriculares f ON f.inscripcion_id=s.id ORDER BY s.id`);
  assert.equal(rows.length,2);
  assert.notEqual(rows[0].id,rows[1].id);
  for(const campo of ['nombre','apellido_paterno','apellido_materno','curp','telefono','seccion_electoral'])assert.equal(rows[0][campo],rows[1][campo]);
  assert.deepEqual(rows.map(r=>r.cursos),['Primera ficha','Segunda ficha']);
  assert.deepEqual(rows.map(r=>r.experiencias),[1,1]);
  assert.deepEqual(rows.map(r=>[r.rfc,r.homoclave,r.version_captura]),[
   ['GALA900101','0A1','ficha_rfc_v1'],['GALA900101','0A1','ficha_rfc_v1']]);
  const legado=await client.query('SELECT rfc,homoclave,version_captura FROM inscripciones WHERE id=$1',[anterior.rows[0].id]);
  assert.deepEqual(legado.rows[0],{rfc:null,homoclave:null,version_captura:null});
  assert.deepEqual((await snapshot()).rows[0].datos,antes);
  const usos=await client.query('SELECT usos FROM invitaciones WHERE id=$1',[invitacion.rows[0].id]);
  assert.equal(usos.rows[0].usos,2);
  const sesiones=await client.query('SELECT count(DISTINCT inscripcion_id)::int AS total FROM sesiones_confirmacion');
  assert.equal(sesiones.rows[0].total,2);
  console.log('OK: dos altas idénticas devuelven 201 y conservan inscripciones, fichas, experiencias y sesiones independientes.');
  console.log('OK: RFC y homoclave repetidos permitidos; bandera automática solo en altas nuevas. Migración repetible y registro anterior intacto.');
  console.log('La prueba utiliza exclusivamente tablas temporales; no modifica registros ni contadores reales.');
 }finally{
  pool.connect=original;
  // Destruir esta conexión también descarta todas las tablas y secuencias temporales.
  client?.release(true);
  await pool.end();
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
