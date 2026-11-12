'use strict';
process.env.DATABASE_URL||='postgresql://test:test@localhost/test';
const test=require('node:test');
const assert=require('node:assert/strict');
const {pool}=require('../config/database');
const {hashToken}=require('../utils');
const router=require('../routes/publico');

test('la inscripción acepta CURP vacía u omitida y valida una CURP capturada',async()=>{
 const handler=router.stack.find(layer=>layer.route?.path==='/inscripciones').route.stack.at(-1).handle;
 const codigo='ABCD-ABCD-ABCD-ABCD';
 const validCurp='SABK990101HMCBRR08';
 const body={codigo_invitacion:codigo,nombre:'Ana',apellido_paterno:'Lopez',apellido_materno:'',edad:30,
  telefono:'5512345678',correo_electronico:'ana@example.com',distrito_numero:1,seccion_electoral:'123',
  referente_nombre:'Jose',referente_apellido_paterno:'Perez',referente_apellido_materno:''};
 const originalConnect=pool.connect;
 const inserted=[];
 pool.connect=async()=>({
  query:async(sql,params)=>{
   if(sql.includes('SELECT * FROM invitaciones'))return {rows:[{id:1,codigo_hash:hashToken(codigo),estado:'pendiente',max_usos:null,usos:0,vence_en:null,correo_autorizado:null}]};
   if(sql.includes('INSERT INTO inscripciones')){inserted.push(params[4]);return {rows:[{id:1}]};}
   return {rows:[]};
  },release:()=>{}
 });
 const submit=async values=>{
  let status=200,result,error;
  await handler({body:{...body,...values}},
   {status(code){status=code;return this;},set(){return this;},json(value){result=value;return this;}},
   err=>{error=err;});
  assert.ifError(error);
  return {status,result};
 };
 try{
  assert.equal((await submit({curp:''})).status,201);
  assert.equal((await submit({curp:'   '})).status,201);
  assert.equal((await submit({})).status,201);
  assert.equal((await submit({curp:validCurp.toLowerCase()})).status,201);
  const malformed=await submit({curp:'CURP-INCOMPLETA'});
  assert.equal(malformed.status,400);
  assert.equal(malformed.result.error,'Revisa los campos del formulario antes de continuar');
  assert.deepEqual(inserted,[null,null,null,validCurp]);
 }finally{pool.connect=originalConnect;}
});
