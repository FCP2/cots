'use strict';
process.env.DATABASE_URL||='postgresql://test:test@localhost/test';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PassThrough}=require('node:stream');
const {pool}=require('../config/database');
const servicio=require('../services/reporte-fichas');
const renderOriginal=servicio.renderPDF;
servicio.renderPDF=async()=>Buffer.from('%PDF-1.4\n');
const router=require('../routes/admin');
const handler=(method,path)=>router.stack.find(x=>x.route?.path===path&&x.route.methods[method]).route.stack[0].handle;

test('más de 500 fichas se consultan por bloques y llegan a un solo ZIP por distrito y sección',async()=>{
 const original=pool.query,fecha='2026-11-27T12:00:00.000Z';
 const rows=Array.from({length:501},(_,index)=>({
  id:String(index+1),nombre:`PERSONA ${index+1}`,apellido_paterno:'PÉREZ',apellido_materno:'LÓPEZ',
  curp:index===0||index===500?'AAAA000101HMCABC01':null,rfc:null,homoclave:null,telefono:null,
  distrito_numero:index<250?17:18,cabecera:index<250?'NEZAHUALCÓYOTL':'ZUMPANGO',
  seccion_electoral:String(index+1).padStart(4,'0'),creado_en:fecha,
  nivel_estudios:'LICENCIATURA',estatus_estudios:'TITULADO',cursos:'',sin_experiencia_laboral:true,
  foto_archivo:null,actualizado_en:fecha,experiencias:[]
 })).reverse();
 const calls=[];
 pool.query=async(sql,params)=>{
  calls.push(params);
  const cursor=params[3]?Number(params[3]):Infinity;
  return {rows:rows.filter(row=>Number(row.id)<cursor).slice(0,250)};
 };
 const rango={desde:'2026-11-27T00:00:00.000Z',hasta:'2026-11-27T23:59:00.000Z'};
 let previa,error;
 try{
  await handler('get','/reportes/fichas/previa')({query:rango},{set(){return this;},json(value){previa=value;}},e=>{error=e;});
  assert.ifError(error);
  assert.equal(previa.encontrados,501);
  assert.equal(previa.fichas,500);
  assert.equal(previa.duplicados.length,1);
  assert.equal(calls.length,3);
  assert.deepEqual(calls.map(params=>params[3]),[null,'252','2']);

  const response=new PassThrough(),chunks=[];
  let headers;
  response.set=value=>{headers=value;return response;};
  response.on('data',chunk=>chunks.push(chunk));
  await handler('post','/reportes/fichas/descargar')({body:{...rango,firma:previa.firma,decisiones:{}}},response,e=>{error=e;});
  assert.ifError(error);
  assert.equal(headers['X-Fichas-Total'],'500');
  const zip=Buffer.concat(chunks);
  assert.equal(zip.subarray(0,2).toString(),'PK');
  assert.ok(zip.includes(Buffer.from('Distrito_17_NEZAHUALCÓYOTL/Seccion_0002/')));
  assert.ok(zip.includes(Buffer.from('Distrito_18_ZUMPANGO/Seccion_0501/')));
  assert.equal((zip.toString().match(/Ficha curricular - /g)||[]).length,1000);
 }finally{pool.query=original;servicio.renderPDF=renderOriginal;}
});
