'use strict';
process.env.DATABASE_URL||='postgresql://test:test@localhost/test';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PassThrough}=require('node:stream');
const {pool}=require('../config/database');
const router=require('../routes/admin');
const handler=(method,path)=>router.stack.find(x=>x.route?.path===path&&x.route.methods[method]).route.stack[0].handle;
const row={id:'1',nombre:'MARÍA',apellido_paterno:'PÉREZ',apellido_materno:'LÓPEZ',curp:null,rfc:null,homoclave:null,telefono:'5512345678',distrito_numero:17,cabecera:'NEZAHUALCÓYOTL',seccion_electoral:'1234',creado_en:'2026-11-27T12:00:00Z',nivel_estudios:'LICENCIATURA',estatus_estudios:'TITULADO',cursos:'ÉTICA',sin_experiencia_laboral:true,foto_archivo:null,experiencias:[]};
test('la vista previa usa el rango exacto, solo fichas activas y avisa de fotos faltantes',async()=>{
 const original=pool.query;let called,body,error;
 pool.query=async(sql,params)=>{called={sql,params};return {rows:[row]};};
 try{await handler('get','/reportes/fichas/previa')({query:{desde:'2026-11-27T00:00:00.000Z',hasta:'2026-11-27T23:59:00.000Z'}},{set:()=>({json:v=>{body=v;}})},e=>{error=e;});}
 finally{pool.query=original;}
 assert.ifError(error);assert.match(called.sql,/JOIN fichas_curriculares/);assert.match(called.sql,/s\.eliminado_en IS NULL/);
 assert.match(called.sql,/s\.creado_en >= \$1::timestamptz AND s\.creado_en <= \$2::timestamptz/);
 assert.deepEqual(called.params,['2026-11-27T00:00:00.000Z','2026-11-27T23:59:00.000Z',null,null]);
 assert.equal(body.fichas,1);assert.equal(body.sin_foto,1);
});
test('descarga un ZIP con PDF individual dentro del distrito y la sección',async()=>{
 const original=pool.query;pool.query=async()=>({rows:[row]});
 const res=new PassThrough(),chunks=[];let headers,error;
 res.set=v=>{headers=v;return res;};res.on('data',v=>chunks.push(v));
 let previa;
 const query={desde:'2026-11-27T00:00:00.000Z',hasta:'2026-11-27T23:59:00.000Z'};
 try{
  await handler('get','/reportes/fichas/previa')({query},{set:()=>({json:v=>{previa=v;}})},e=>{error=e;});
  await handler('post','/reportes/fichas/descargar')({body:{...query,firma:previa.firma,decisiones:{}}},res,e=>{error=e;});
 }
 finally{pool.query=original;}
 assert.ifError(error);assert.equal(headers['Content-Type'],'application/zip');
 const zip=Buffer.concat(chunks);assert.equal(zip.subarray(0,2).toString(),'PK');
 assert.ok(zip.includes(Buffer.from('Distrito_17_NEZAHUALCÓYOTL/Seccion_1234/Ficha curricular - María Pérez López - 1.pdf')));
});
test('avisa y bloquea el ZIP si la base referencia una fotografía ausente',async()=>{
 const original=pool.query;
 pool.query=async()=>({rows:[{...row,foto_archivo:'00000000-0000-4000-8000-000000000099.jpg'}]});
 const query={desde:'2026-11-27T00:00:00.000Z',hasta:'2026-11-27T23:59:00.000Z'};
 let previa,error,code=200,body;
 const response={status(value){code=value;return this;},json(value){body=value;return this;}};
 try{
  await handler('get','/reportes/fichas/previa')({query},{set(){return this;},json(value){previa=value;}},e=>{error=e;});
  assert.ifError(error);
  assert.equal(previa.sin_foto,0);
  assert.equal(previa.fotos_no_disponibles,1);
  await handler('post','/reportes/fichas/descargar')({body:{...query,firma:previa.firma,decisiones:{}}},response,e=>{error=e;});
  assert.ifError(error);
  assert.equal(code,409);
  assert.match(body.error,/fotografía\(s\) registradas cuyos archivos no están disponibles/);
 }finally{pool.query=original;}
});
