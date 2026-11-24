'use strict';
process.env.DATABASE_URL||='postgresql://test:test@localhost/test';
const test=require('node:test');
const assert=require('node:assert/strict');
const {pool}=require('../config/database');
const router=require('../routes/admin');

const route=(method,path)=>router.stack.find(layer=>layer.route?.path===path&&layer.route.methods[method]).route.stack[0].handle;
async function invoke(handler,id,body){
 let status=200,result,error;
 await handler({params:{id},body,usuario:{id:7}},
  {status(code){status=code;return this;},json(value){result=value;return this;}},err=>{error=err;});
 assert.ifError(error);
 return {status,result};
}

test('editar cambia solo el nombre del código elegido y audita el cambio',async()=>{
 const original=pool.connect,queries=[];
 pool.connect=async()=>({query:async(sql,params)=>{
  queries.push({sql,params});
  if(sql.startsWith('SELECT id,invitador_nombre'))return {rows:[{id:15,invitador_nombre:'Nombre anterior'}]};
  return {rows:[]};
 },release:()=>{}});
 try{
  const result=await invoke(route('patch','/invitaciones/:id'),'15',{invitador_nombre:'Nombre nuevo'});
  assert.equal(result.status,200);
  assert.equal(result.result.invitador_nombre,'Nombre nuevo');
  const update=queries.find(x=>x.sql.startsWith('UPDATE invitaciones'));
  assert.deepEqual(update.params,['15','Nombre nuevo']);
  assert.equal(queries.filter(x=>x.sql.includes('INSERT INTO auditoria')).length,1);
  assert.equal(queries.at(-1).sql,'COMMIT');
  assert.equal((await invoke(route('patch','/invitaciones/:id'),'15',{invitador_nombre:'  '})).status,400);
 }finally{pool.connect=original;}
});

test('editar el vencimiento modifica solo la invitación elegida y audita la fecha',async()=>{
 const original=pool.connect,queries=[];
 const anterior=new Date('2026-11-20T18:00:00.000Z');
 const nuevo=new Date('2026-12-01T06:00:00.000Z');
 pool.connect=async()=>({query:async(sql,params)=>{
  queries.push({sql,params});
  if(sql.startsWith('SELECT id,invitador_nombre'))return {rows:[{id:15,invitador_nombre:'Ana Pérez',vence_en:anterior}]};
  if(sql.startsWith('UPDATE invitaciones'))return {rows:[{vence_en:nuevo}]};
  return {rows:[]};
 },release:()=>{}});
 try{
  const result=await invoke(route('patch','/invitaciones/:id'),'15',{invitador_nombre:'Ana Pérez',vence_fecha:'2026-11-30'});
  assert.equal(result.status,200);
  assert.equal(result.result.vence_en,nuevo);
  const update=queries.filter(x=>x.sql.startsWith('UPDATE invitaciones'));
  assert.equal(update.length,1);
  assert.match(update[0].sql,/America\/Mexico_City/);
  assert.deepEqual(update[0].params,['15','2026-11-30']);
  assert.equal(queries.some(x=>/UPDATE inscripciones|codigo_hash|codigo_cifrado/.test(x.sql)),false);
  const auditQuery=queries.find(x=>x.sql.includes('INSERT INTO auditoria'));
  assert.equal(auditQuery.params[1],'EDITAR_VENCIMIENTO');
  assert.equal(queries.at(-1).sql,'COMMIT');
  for(const vence_fecha of ['2026-02-31','30/11/2026']){
   assert.equal((await invoke(route('patch','/invitaciones/:id'),'15',{invitador_nombre:'Ana Pérez',vence_fecha})).status,400);
  }
 }finally{pool.connect=original;}
});

test('eliminar un código conserva o borra solo sus inscripciones según la elección',async()=>{
 const original=pool.connect;
 try{
  for(const eliminar_registros of [false,true]){
   const queries=[];
   pool.connect=async()=>({query:async(sql,params)=>{
    queries.push({sql,params});
    if(sql.startsWith('SELECT id FROM invitaciones'))return {rows:[{id:15}]};
    if(sql.startsWith('DELETE FROM inscripciones'))return {rowCount:2};
    return {rows:[]};
   },release:()=>{}});
   const result=await invoke(route('delete','/invitaciones/:id'),'15',{eliminar_registros});
   assert.equal(result.status,200);
   assert.equal(result.result.registros_eliminados,eliminar_registros?2:0);
   assert.equal(queries.some(x=>x.sql.startsWith('DELETE FROM inscripciones')),eliminar_registros);
   assert.deepEqual(queries.find(x=>x.sql.startsWith('UPDATE invitaciones')).params,['15']);
   assert.equal(queries.at(-1).sql,'COMMIT');
  }
  assert.equal((await invoke(route('delete','/invitaciones/:id'),'15',{})).status,400);
 }finally{pool.connect=original;}
});

test('eliminar una inscripción marca solo la fila seleccionada y registra auditoría',async()=>{
 const original=pool.connect,queries=[];
 pool.connect=async()=>({query:async(sql,params)=>{
  queries.push({sql,params});
  if(sql.startsWith('UPDATE inscripciones'))return {rows:[{id:42,invitacion_id:15}]};
  return {rows:[]};
 },release:()=>{}});
 try{
  const result=await invoke(route('delete','/inscripciones/:id'),'42',{});
  assert.equal(result.status,200);
  assert.deepEqual(result.result,{ok:true,id:42});
  const update=queries.find(x=>x.sql.startsWith('UPDATE inscripciones'));
  assert.deepEqual(update.params,['42']);
  assert.match(update.sql,/SET eliminado_en=now\(\)/);
  assert.match(update.sql,/WHERE id=\$1 AND eliminado_en IS NULL/);
  assert.equal(queries.some(x=>/DELETE FROM inscripciones|UPDATE invitaciones/.test(x.sql)),false);
  const auditQuery=queries.find(x=>x.sql.includes('INSERT INTO auditoria'));
  assert.equal(auditQuery.params[1],'ELIMINAR');
  assert.equal(auditQuery.params[2],'inscripciones');
  assert.equal(queries.at(-1).sql,'COMMIT');
  assert.equal((await invoke(route('delete','/inscripciones/:id'),'abc',{})).status,400);
 }finally{pool.connect=original;}
});

test('eliminar una inscripción inexistente no escribe auditoría',async()=>{
 const original=pool.connect,queries=[];
 pool.connect=async()=>({query:async(sql,params)=>{queries.push({sql,params});return {rows:[]};},release:()=>{}});
 try{
  const result=await invoke(route('delete','/inscripciones/:id'),'42',{});
  assert.equal(result.status,404);
  assert.equal(queries.some(x=>x.sql.includes('INSERT INTO auditoria')),false);
  assert.equal(queries.at(-1).sql,'ROLLBACK');
 }finally{pool.connect=original;}
});
