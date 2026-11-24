'use strict';
process.env.DATABASE_URL||='postgresql://test:test@localhost/test';
const test=require('node:test');
const assert=require('node:assert/strict');
const {pool}=require('../config/database');
const {hashToken}=require('../utils');
const router=require('../routes/responsable');
const authRouter=require('../routes/auth');
const {responsable}=require('../middleware/responsable');
const {auth}=require('../middleware/auth');

const handler=(method,path)=>router.stack.find(layer=>layer.route?.path===path&&layer.route.methods[method]).route.stack.at(-1).handle;
function response(){
 const state={status:200,result:null,cookie:null};
 const res={status(code){state.status=code;return this;},set(){return this;},cookie(name,value){state.cookie={name,value};return this;},
  json(value){state.result=value;return this;}};
 return {state,res};
}

test('el responsable usa el código en ambos campos y recibe una sesión limitada',async()=>{
 const original=pool.query,queries=[];
 pool.query=async(sql,params)=>{
  queries.push({sql,params});
  if(sql.includes('FROM invitaciones'))return {rows:[{id:42,invitador_nombre:'Responsable Uno',destinatario_nombre:'Equipo Uno',vence_en:new Date('2027-01-01')}]};
  return {rows:[]};
 };
 const enter=handler('post','/entrar'),codigo='ABCD-1234-ABCD-1234';
 try{
  const bad=response();await enter({body:{usuario:codigo,llave:'AAAA-AAAA-AAAA-AAAA'}},bad.res,()=>{});
  assert.equal(bad.state.status,400);
  assert.equal(queries.length,0);
  const ok=response();let error;
  await enter({body:{usuario:codigo.toLowerCase(),llave:codigo}},ok.res,e=>{error=e;});
  assert.ifError(error);
  assert.equal(ok.state.status,200);
  assert.equal(ok.state.cookie.name,'cots_sid');
  assert.equal(ok.state.result.responsable.invitador_nombre,'Responsable Uno');
  assert.deepEqual(queries[0].params,[hashToken(codigo)]);
  assert.equal(queries[1].params[1],42);
 }finally{pool.query=original;}
});

test('la consulta se restringe a la invitación de la sesión y solo expone datos limitados',async()=>{
 const original=pool.query,queries=[];
 pool.query=async(sql,params)=>{
  queries.push({sql,params});
  if(sql.includes('FROM sesiones_responsables'))return {rows:[{id:42,invitador_nombre:'Responsable Uno',destinatario_nombre:'Equipo Uno'}]};
  if(sql.includes('count(*)'))return {rows:[{total:1}]};
  return {rows:[{nombre_completo:'Ana López',creado_en:new Date('2026-11-17T12:00:00Z'),distrito_numero:1,cabecera:'Jilotepec'}]};
 };
 try{
  const req={cookies:{cots_sid:'a'.repeat(64)},query:{pagina:'1',invitacion_id:'99'}};
  const out=response();let error;
  await responsable(req,out.res,e=>{error=e;});assert.ifError(error);
  await handler('get','/inscripciones')(req,out.res,e=>{error=e;});assert.ifError(error);
  assert.equal(out.state.result.total,1);
  assert.equal(out.state.result.registros[0].nombre_completo,'Ana López');
  assert.equal(JSON.stringify(out.state.result).includes('telefono'),false);
  assert.equal(JSON.stringify(out.state.result).includes('curp'),false);
  assert.deepEqual(queries.slice(1).map(x=>x.params[0]),[42,42]);
  pool.query=async()=>({rows:[]});
  const denied=response();await responsable({cookies:{cots_sid:'a'.repeat(64)}},denied.res,()=>{});
  assert.equal(denied.state.status,401);
 }finally{pool.query=original;}
});

test('al recargar se recupera el panel limitado y no se habilita el acceso administrativo',async()=>{
 const original=pool.query,consultas=[];
 pool.query=async(sql,params)=>{
  consultas.push({sql,params});
  if(sql.includes('FROM sesiones_responsables'))return {rows:[{invitador_nombre:'Responsable Uno',destinatario_nombre:'Equipo Uno'}]};
  return {rows:[]};
 };
 try{
  const estado=authRouter.stack.find(layer=>layer.route?.path==='/estado').route.stack[0].handle;
  const req={cookies:{cots_sid:'b'.repeat(64)}};
  const out=response();let error;
  await estado(req,out.res,e=>{error=e;});assert.ifError(error);
  assert.equal(out.state.result.tipo,'responsable');
  assert.equal(out.state.result.responsable.invitador_nombre,'Responsable Uno');
  const denied=response();await auth(req,denied.res,()=>{});
  assert.equal(denied.state.status,401);
  assert.equal(consultas.some(x=>x.sql.includes('sesiones_responsables')),true);
 }finally{pool.query=original;}
});
