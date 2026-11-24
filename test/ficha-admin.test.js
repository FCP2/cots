'use strict';
process.env.DATABASE_URL||='postgresql://test:test@localhost/test';
const test=require('node:test');
const assert=require('node:assert/strict');
const {pool}=require('../config/database');
const router=require('../routes/admin');
const handler=path=>router.stack.find(x=>x.route?.path===path&&x.route.methods.get).route.stack.at(-1).handle;
function response(){const state={status:200,body:null};return {state,res:{status(value){state.status=value;return this;},sendStatus(value){state.status=value;return this;},set(){return this;},json(value){state.body=value;return this;}}};}

test('la vista administrativa consulta solo la ficha de una inscripción activa',async()=>{
 const original=pool.query,queries=[];
 pool.query=async(sql,params)=>{
  queries.push({sql,params});
  if(sql.includes('FROM inscripciones s'))return {rows:[{nombre:'Ana',apellido_paterno:'Pérez',apellido_materno:'',nivel_estudios:'licenciatura',estatus_estudios:'titulado',cursos:'Taller',tiene_ficha:true,tiene_foto:true}]};
  return {rows:[{puesto:'Analista',institucion:'Instituto',periodo_inicio:'2020-01',periodo_fin:'2022-06'}]};
 };
 try{
  const out=response();let error;
  await handler('/inscripciones/:id/ficha')({params:{id:'42'}},out.res,e=>{error=e;});
  assert.ifError(error);assert.equal(out.state.status,200);
  assert.equal(out.state.body.registro.nombre,'Ana');assert.equal(out.state.body.experiencias.length,1);
  assert.deepEqual(queries.map(q=>q.params),[['42'],['42']]);
  assert.match(queries[0].sql,/s\.id=\$1 AND s\.eliminado_en IS NULL/);
  assert.doesNotMatch(queries[0].sql,/s\.(?:curp|telefono|correo_electronico)|f\.(?:cargo_partido|area_adscripcion)/);
 }finally{pool.query=original;}
});

test('la ficha no muestra inscripciones inexistentes ni fotografías sin nombre válido',async()=>{
 const original=pool.query;
 try{
  pool.query=async()=>({rows:[]});
  const missing=response();let error;
  await handler('/inscripciones/:id/ficha')({params:{id:'42'}},missing.res,e=>{error=e;});
  assert.ifError(error);assert.equal(missing.state.status,404);
  pool.query=async()=>({rows:[{foto_archivo:'../foto.jpg'}]});
  const photo=response();await handler('/inscripciones/:id/foto')({params:{id:'42'}},photo.res,e=>{error=e;});
  assert.ifError(error);assert.equal(photo.state.status,404);
 }finally{pool.query=original;}
});
