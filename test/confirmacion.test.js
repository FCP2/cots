'use strict';
process.env.DATABASE_URL||='postgresql://test:test@localhost/test';
const test=require('node:test');
const assert=require('node:assert/strict');
const {pool}=require('../config/database');
const {hashToken}=require('../utils');
const router=require('../routes/confirmacion');
const handler=(method,path)=>router.stack.find(x=>x.route?.path===path&&x.route.methods[method]).route.stack.at(-1).handle;
function response(){const state={status:200,body:null,cookie:null};return {state,res:{status(n){state.status=n;return this;},set(){return this;},cookie(name,value){state.cookie={name,value};return this;},json(v){state.body=v;return this;}}};}

test('identificar usa código, sección y una coincidencia única sin insertar inscripciones',async()=>{
 const original=pool.query,queries=[];
 pool.query=async(sql,params)=>{
  queries.push({sql,params});
  if(sql.includes('FROM invitaciones'))return {rows:[{id:13}]};
  if(sql.includes('FROM inscripciones'))return {rows:[
   {id:50,nombre:'Ma. José',apellido_paterno:'García',apellido_materno:'López',seccion_electoral:'1234'},
   {id:51,nombre:'Otro',apellido_paterno:'García',apellido_materno:'López',seccion_electoral:'1234'}]};
  return {rows:[]};
 };
 try{
  const out=response();let error;
  await handler('post','/identificar')({body:{codigo_invitacion:'abcd-1234-abcd-1234',nombre:'Ma. Jose',apellido_paterno:'Garcia',apellido_materno:'Lopez',seccion_electoral:'1234',telefono:''}},out.res,e=>{error=e;});
  assert.ifError(error);assert.equal(out.state.status,200);assert.equal(out.state.cookie.name,'cots_confirm');
  assert.deepEqual(queries[0].params,[hashToken('ABCD-1234-ABCD-1234')]);
  assert.deepEqual(queries[1].params,[13,'1234','']);
  assert.equal(queries[2].params[1],50);
  assert.equal(queries.some(q=>q.sql.includes('INSERT INTO inscripciones')),false);
  pool.query=async(sql)=>sql.includes('FROM invitaciones')?{rows:[{id:13}]}:{rows:[{id:50,nombre:'Ma. José',apellido_paterno:'García',apellido_materno:'López',seccion_electoral:'1234'},{id:52,nombre:'Ma. José',apellido_paterno:'García',apellido_materno:'López',seccion_electoral:'1234'}]};
  const ambiguous=response();await handler('post','/identificar')({body:{codigo_invitacion:'ABCD-1234-ABCD-1234',nombre:'Ma. Jose',apellido_paterno:'Garcia',apellido_materno:'Lopez',seccion_electoral:'1234'}},ambiguous.res,e=>{error=e;});
  assert.ifError(error);assert.equal(ambiguous.state.status,409);
 }finally{pool.query=original;}
});

test('teléfono solo puede identificar registros históricos sin sección',async()=>{
 const original=pool.query,queries=[];
 pool.query=async(sql,params)=>{queries.push({sql,params});if(sql.includes('FROM invitaciones'))return {rows:[{id:13}]};if(sql.includes('FROM inscripciones'))return {rows:[{id:60,nombre:'Ana',apellido_paterno:'López',apellido_materno:'',seccion_electoral:null}]};return {rows:[]};};
 try{const out=response();let error;
  await handler('post','/identificar')({body:{codigo_invitacion:'ABCD-1234-ABCD-1234',nombre:'Ana',apellido_paterno:'López',apellido_materno:'',seccion_electoral:'',telefono:'5512345678'}},out.res,e=>{error=e;});
  assert.ifError(error);assert.equal(out.state.status,200);
  assert.deepEqual(queries[1].params,[13,'','5512345678']);
  assert.match(queries[1].sql,/seccion_electoral IS NULL AND telefono=\$3/);
 }finally{pool.query=original;}
});

test('ficha pública excluye cargo partidista y usa la inscripción de la sesión',async()=>{
 const original=pool.query,queries=[];
  pool.query=async(sql,params)=>{queries.push({sql,params});if(sql.includes('FROM inscripciones r'))return {rows:[{nombre:'Ana',nivel_estudios:'licenciatura',tiene_foto:false}]};return {rows:[]};};
 try{const out=response();let error;await handler('get','/ficha')({inscripcionId:50},out.res,e=>{error=e;});assert.ifError(error);
  assert.equal(out.state.body.registro.nombre,'Ana');assert.equal(JSON.stringify(out.state.body).includes('cargo_partido'),false);
  assert.doesNotMatch(queries[0].sql,/r\.(?:curp|edad|telefono|correo_electronico|referente_nombre|referente_apellido_paterno|referente_apellido_materno)|i\.invitador_nombre/);
  assert.equal(queries.every(q=>q.params[0]===50),true);
 }finally{pool.query=original;}
});

test('guardado de ficha no cambia inscripción ni campos reservados del partido',async()=>{
 const original=pool.connect,queries=[];
 pool.connect=async()=>({query:async(sql,params)=>{queries.push({sql,params});return {rows:[]};},release(){}});
 try{const out=response();let error;
  await handler('put','/ficha')({inscripcionId:50,body:{nivel_estudios:'licenciatura',otro_nivel:'',estatus_estudios:'titulado',cursos:'Diplomado',experiencias:[{puesto:'Analista',institucion:'Instituto',periodo_inicio:'2020-01',periodo_fin:'2022-06'}]}},out.res,e=>{error=e;});
  assert.ifError(error);assert.equal(out.state.body.ok,true);
  assert.equal(queries.some(q=>/INSERT INTO inscripciones|UPDATE inscripciones|cargo_partido|area_adscripcion|fecha_ingreso/.test(q.sql)),false);
  assert.equal(queries.some(q=>q.sql.includes('INSERT INTO experiencias_laborales')),true);
 }finally{pool.connect=original;}
});

const nuevoBody={codigo_invitacion:'ABCD-1234-ABCD-1234',registro:{nombre:'Ma. José',apellido_paterno:'García',apellido_materno:'López',curp:'',edad:'34',telefono:'5512345678',correo_electronico:'persona@example.com',distrito_numero:'1',seccion_electoral:'1234',referente_nombre:'Ana',referente_apellido_paterno:'Pérez',referente_apellido_materno:''},ficha:{nivel_estudios:'licenciatura',otro_nivel:'',estatus_estudios:'titulado',cursos:'Taller',experiencias:[{puesto:'Coordinadora',institucion:'Instituto',periodo_inicio:'2020-01',periodo_fin:null}]}};
const activa={id:13,estado:'pendiente',vence_en:new Date('2030-01-01'),max_usos:null,usos:2,correo_autorizado:null,eliminado_en:null};

test('el nombre del nuevo registro admite apóstrofes y rechaza números',async()=>{
 const {datosInscripcionSchema}=require('../validation/inscripcion');
 const registro={...nuevoBody.registro,nombre:"Ma. D’Ávila",apellido_paterno:"O'García",apellido_materno:'De la Cruz'};
 assert.equal(datosInscripcionSchema.safeParse(registro).success,true);
 for(const campo of ['nombre','apellido_paterno','apellido_materno']){
  assert.equal(datosInscripcionSchema.safeParse({...registro,[campo]:'Ana2'}).success,false);
 }
});

test('nuevo registro exige cuatro dígitos numéricos en sección electoral',async()=>{
 const original=pool.connect;
 pool.connect=async()=>{throw Error('La validación debe ocurrir antes de acceder a la base de datos');};
 try{
  for(const seccion_electoral of ['123','12A4']){
   const out=response();let error;
   await handler('post','/nuevo')({body:{...nuevoBody,registro:{...nuevoBody.registro,seccion_electoral}}},out.res,e=>{error=e;});
   assert.ifError(error);
   assert.equal(out.state.status,400);
  }
 }finally{pool.connect=original;}
});

test('el código vencido permite completar fichas, pero no ofrece registro nuevo',async()=>{
 const original=pool.query;
 pool.query=async()=>({rows:[{...activa,invitador_nombre:'Ana',destinatario_nombre:'Equipo',vence_en:new Date('2020-01-01')} ]});
 try{const out=response();let error;await handler('post','/codigo')({body:{codigo_invitacion:nuevoBody.codigo_invitacion}},out.res,e=>{error=e;});
  assert.ifError(error);assert.equal(out.state.body.permite_nuevo,false);assert.equal(out.state.body.responsable,'Ana');
 }finally{pool.query=original;}
});

test('un código vigente habilita el registro nuevo en el paso de identificación',async()=>{
 const original=pool.query;
 pool.query=async()=>({rows:[{...activa,invitador_nombre:'Ana',destinatario_nombre:'Equipo'}]});
 try{const out=response();let error;await handler('post','/codigo')({body:{codigo_invitacion:nuevoBody.codigo_invitacion}},out.res,e=>{error=e;});
  assert.ifError(error);assert.equal(out.state.body.permite_nuevo,true);
 }finally{pool.query=original;}
});

test('nuevo registro y ficha se guardan juntos y abren sesión para la fotografía',async()=>{
 const original=pool.connect,queries=[];
 pool.connect=async()=>({query:async(sql,params)=>{queries.push({sql,params});
  if(sql.includes('SELECT * FROM invitaciones'))return {rows:[activa]};
  if(sql.includes('FROM inscripciones')&&sql.includes('telefono=$3'))return {rows:[]};
  if(sql.includes('INSERT INTO inscripciones'))return {rows:[{id:900}]};
  return {rows:[]};},release(){}});
 try{const out=response();let error;await handler('post','/nuevo')({body:nuevoBody},out.res,e=>{error=e;});
  assert.ifError(error);assert.equal(out.state.status,201);assert.equal(out.state.cookie.name,'cots_confirm');
  assert.equal(queries.filter(q=>q.sql.includes('INSERT INTO inscripciones')).length,1);
  assert.equal(queries.some(q=>q.sql.includes('INSERT INTO fichas_curriculares')),true);
  assert.equal(queries.some(q=>q.sql.includes('INSERT INTO experiencias_laborales')),true);
  assert.equal(queries.some(q=>q.sql.includes('INSERT INTO sesiones_confirmacion')),true);
  assert.equal(queries.at(-1).sql,'COMMIT');
 }finally{pool.connect=original;}
});

test('nuevo registro rechaza código vencido y coincidencia previa sin duplicar',async()=>{
 const original=pool.connect;
 try{
  for(const duplicate of [false,true]){
   const queries=[];
   pool.connect=async()=>({query:async(sql,params)=>{queries.push({sql,params});
    if(sql.includes('SELECT * FROM invitaciones'))return {rows:[{...activa,vence_en:duplicate?activa.vence_en:new Date('2020-01-01')}]};
    if(sql.includes('FROM inscripciones')&&sql.includes('telefono=$3'))return {rows:duplicate?[{nombre:'Ma. Jose',apellido_paterno:'Garcia',apellido_materno:'Lopez'}]:[]};
    return {rows:[]};},release(){}});
   const out=response();let error;await handler('post','/nuevo')({body:nuevoBody},out.res,e=>{error=e;});
   assert.ifError(error);assert.equal(out.state.status,duplicate?409:403);
   assert.equal(queries.some(q=>q.sql.includes('INSERT INTO inscripciones')),false);
   assert.equal(queries.at(-1).sql,'ROLLBACK');
  }
 }finally{pool.connect=original;}
});

test('si falla la ficha se revierte también la inscripción nueva',async()=>{
 const original=pool.connect,queries=[];
 pool.connect=async()=>({query:async(sql)=>{queries.push(sql);
  if(sql.includes('SELECT * FROM invitaciones'))return {rows:[activa]};
  if(sql.includes('FROM inscripciones')&&sql.includes('telefono=$3'))return {rows:[]};
  if(sql.includes('INSERT INTO inscripciones'))return {rows:[{id:901}]};
  if(sql.includes('INSERT INTO fichas_curriculares'))throw Error('fallo simulado');
  return {rows:[]};},release(){}});
 try{const out=response();let error;await handler('post','/nuevo')({body:nuevoBody},out.res,e=>{error=e;});
  assert.equal(error?.message,'fallo simulado');assert.equal(queries.at(-1),'ROLLBACK');assert.equal(queries.includes('COMMIT'),false);
 }finally{pool.connect=original;}
});
