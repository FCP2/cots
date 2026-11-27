'use strict';
process.env.DATABASE_URL||='postgresql://test:test@localhost/test';
const test=require('node:test');
const assert=require('node:assert/strict');
const ExcelJS=require('exceljs');
const {pool}=require('../config/database');
const router=require('../routes/admin');

test('el reporte Excel contiene resumen y detalle del responsable',async()=>{
 const handler=router.stack.find(layer=>layer.route?.path==='/reportes/inscripciones.xlsx').route.stack[0].handle;
 const originalQuery=pool.query;
 const requested=[];
 pool.query=async(sql,params)=>{
  requested.push(params?.[0]);
  if(sql.includes('SELECT min(btrim(i.invitador_nombre))')){
   assert.match(sql,/i\.eliminado_en IS NULL OR s\.id IS NOT NULL/);
   return {rows:[{nombre:'Responsable Uno',registros:2}]};
  }
  assert.match(sql,/s\.rfc,s\.homoclave,s\.version_captura/);
  const anterior={id:'9007199254740993',nombre:'Ana',apellido_paterno:'López',apellido_materno:'',curp:'SABK990101HMCBRR08',edad:30,telefono:'5512345678',correo_electronico:'ana@example.com',distrito_numero:1,cabecera:'Jilotepec',seccion_electoral:'0123',referente_nombre:'José',referente_apellido_paterno:'Pérez',referente_apellido_materno:'',invitador_nombre:'Responsable Uno',destinatario_nombre:'Equipo',creado_en:new Date('2026-11-12T12:00:00Z')};
  return {rows:[anterior,{...anterior,id:'9007199254740994',rfc:'GALA900101',homoclave:'0A1',version_captura:'ficha_rfc_v1'}]};
 };
 let headers,body,error;
 try{
  await handler({query:{responsable:'Responsable Uno'}},{set:v=>{headers=v;return this;},send:v=>{body=v;}},e=>{error=e;});
 }finally{pool.query=originalQuery;}
 assert.ifError(error);
 assert.deepEqual(requested,['Responsable Uno','Responsable Uno']);
 assert.match(headers['Content-Type'],/spreadsheetml/);
 const book=new ExcelJS.Workbook();await book.xlsx.load(body);
 assert.equal(book.getWorksheet('Resumen').getCell('B2').value,2);
 assert.equal(book.getWorksheet('Inscripciones').getCell('A2').value,'Ana');
 assert.equal(book.getWorksheet('Inscripciones').getCell('J2').value,'0123');
 assert.equal(book.getWorksheet('Inscripciones').getCell('D1').value,'CURP');
 assert.equal(book.getWorksheet('Inscripciones').getCell('D2').value,'SABK990101HMCBRR08');
 const detalle=book.getWorksheet('Inscripciones');
 assert.equal(detalle.getCell('Q3').value,'GALA900101');
 assert.equal(detalle.getCell('R3').value,'0A1');
 assert.equal(detalle.getCell('S3').value,'GALA9001010A1');
 assert.equal(detalle.getCell('T2').value,'Sin identificador');
 assert.equal(detalle.getCell('T3').value,'ficha_rfc_v1');
 assert.equal(detalle.getCell('U2').value,'9007199254740993');
 assert.equal(detalle.autoFilter,'A1:U1');
 pool.query=async(_sql,params)=>{
  requested.push(params?.[0]);
  return {rows:[]};
 };
 try{await handler({query:{}},{set:v=>{headers=v;},send:v=>{body=v;}},e=>{error=e;});}
 finally{pool.query=originalQuery;}
 assert.ifError(error);
 assert.deepEqual(requested.slice(2),[null,null]);
 assert.match(headers['Content-Disposition'],/reporte-general\.xlsx/);
 const empty=new ExcelJS.Workbook();await empty.xlsx.load(body);
 assert.equal(empty.getWorksheet('Resumen').getCell('B2').value,0);
 await pool.end();
});
