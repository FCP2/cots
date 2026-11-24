'use strict';
process.env.DATABASE_URL||='postgresql://test:test@localhost/test';
const test=require('node:test');
const assert=require('node:assert/strict');
const {pool}=require('../config/database');
const {hashToken}=require('../utils');
const {cifrarCodigo,descifrarCodigo}=require('../utils/codigo-invitacion');
const router=require('../routes/admin');

const handler=(method,path)=>router.stack.find(x=>x.route?.path===path&&x.route.methods[method]).route.stack.at(-1).handle;

test('el código cifrado se recupera solo para su invitación',()=>{
 const original=process.env.INVITATION_CODE_KEY;
 process.env.INVITATION_CODE_KEY='11'.repeat(32);
 try{
  const encrypted=cifrarCodigo('ABCD-1234-ABCD-1234',42);
  assert.notEqual(encrypted,'ABCD-1234-ABCD-1234');
  assert.equal(descifrarCodigo(encrypted,42),'ABCD-1234-ABCD-1234');
  assert.throws(()=>descifrarCodigo(encrypted,43));
 }finally{
  if(original===undefined)delete process.env.INVITATION_CODE_KEY;
  else process.env.INVITATION_CODE_KEY=original;
 }
});

test('las invitaciones nuevas conservan el código cifrado sin cambiar la validación por hash',async()=>{
 const originalKey=process.env.INVITATION_CODE_KEY,originalConnect=pool.connect;
 process.env.INVITATION_CODE_KEY='33'.repeat(32);
 const queries=[];
 pool.connect=async()=>({query:async(sql,params)=>{
  queries.push({sql,params});
  if(sql.includes('INSERT INTO invitaciones'))return {rows:[{id:72,vence_en:new Date('2026-12-01')}]};
  return {rows:[]};
 },release:()=>{}});
 let status=200,result,error;
 try{
  await handler('post','/invitaciones')({body:{invitador_nombre:'Responsable Uno',destinatario_nombre:'Equipo Uno',dias_vigencia:14},usuario:{id:1}},
   {status(code){status=code;return this;},json(v){result=v;return this;}},e=>{error=e;});
  assert.ifError(error);
  assert.equal(status,201);
  assert.match(result.url,/\?confirmar=registro$/);
  const inserted=queries.find(x=>x.sql.includes('INSERT INTO invitaciones'));
  const encrypted=queries.find(x=>x.sql.startsWith('UPDATE invitaciones SET codigo_cifrado'));
  assert.equal(inserted.params[1],hashToken(result.codigo_invitacion));
  assert.equal(descifrarCodigo(encrypted.params[1],72),result.codigo_invitacion);
  assert.equal(queries.at(-1).sql,'COMMIT');
 }finally{
  pool.connect=originalConnect;
  if(originalKey===undefined)delete process.env.INVITATION_CODE_KEY;
  else process.env.INVITATION_CODE_KEY=originalKey;
 }
});

test('un código histórico conocido puede vincularse sin regenerarlo',async()=>{
 const originalKey=process.env.INVITATION_CODE_KEY,originalConnect=pool.connect;
 process.env.INVITATION_CODE_KEY='44'.repeat(32);
 const codigo='ABCD-1234-ABCD-1234',queries=[];
 pool.connect=async()=>({query:async(sql,params)=>{
  queries.push({sql,params});
  if(sql.startsWith('SELECT id,codigo_hash'))return {rows:[{id:42,codigo_hash:hashToken(codigo),codigo_cifrado:null}]};
  return {rows:[]};
 },release:()=>{}});
 let result,error;
 try{
  await handler('post','/invitaciones/:id/vincular-codigo')({params:{id:'42'},body:{codigo_invitacion:codigo.toLowerCase()},usuario:{id:1}},
   {status(){return this;},json(v){result=v;return this;}},e=>{error=e;});
  assert.ifError(error);
  assert.deepEqual(result,{ok:true});
  const update=queries.find(x=>x.sql.startsWith('UPDATE invitaciones SET codigo_cifrado'));
  assert.equal(descifrarCodigo(update.params[1],42),codigo);
  assert.equal(queries.at(-1).sql,'COMMIT');
 }finally{
  pool.connect=originalConnect;
  if(originalKey===undefined)delete process.env.INVITATION_CODE_KEY;
  else process.env.INVITATION_CODE_KEY=originalKey;
 }
});

test('la consulta administrativa muestra códigos nuevos y marca los históricos sin revelar el cifrado',async()=>{
 const originalKey=process.env.INVITATION_CODE_KEY,originalQuery=pool.query;
 process.env.INVITATION_CODE_KEY='22'.repeat(32);
 const encrypted=cifrarCodigo('ABCD-1234-ABCD-1234',42);
 pool.query=async(_sql,params)=>{
  assert.deepEqual(params,['Responsable Uno']);
  return {rows:[
   {id:42,destinatario_nombre:'Equipo A',estado:'pendiente',creada_en:new Date('2026-11-17'),vence_en:null,codigo_cifrado:encrypted},
   {id:41,destinatario_nombre:'Equipo B',estado:'revocada',creada_en:new Date('2026-11-16'),vence_en:null,codigo_cifrado:null}
  ]};
 };
 let result,error,headers;
 try{
  await handler('get','/responsables/invitaciones')({query:{nombre:'Responsable Uno'}},
   {set(name,value){headers={[name]:value};return this;},json(v){result=v;return this;}},e=>{error=e;});
  assert.ifError(error);
  assert.equal(result.length,2);
  assert.equal(result[0].codigo_invitacion,'ABCD-1234-ABCD-1234');
  assert.equal(result[1].codigo_invitacion,null);
  assert.equal(JSON.stringify(result).includes('codigo_cifrado'),false);
  assert.equal(headers['Cache-Control'],'no-store');
 }finally{
  pool.query=originalQuery;
  if(originalKey===undefined)delete process.env.INVITATION_CODE_KEY;
  else process.env.INVITATION_CODE_KEY=originalKey;
 }
});
