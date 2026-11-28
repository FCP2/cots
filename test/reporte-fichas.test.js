'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const sharp=require('sharp');
const {preparar,resolver,renderPDF}=require('../services/reporte-fichas');

const base={nombre:'MARÍA',apellido_paterno:'PÉREZ',apellido_materno:'LÓPEZ',curp:null,rfc:null,homoclave:null,telefono:'5512345678',distrito_numero:17,seccion_electoral:'1234',creado_en:'2026-11-27T12:00:00Z',nivel_estudios:'LICENCIATURA',estatus_estudios:'TITULADO',cursos:'CURSO DE ÉTICA',sin_experiencia_laboral:false,experiencias:[{puesto:'ANALISTA',institucion:'INSTITUTO',periodo_inicio:'2020-01',periodo_fin:'2021-06'}]};
test('omite duplicados verificables y conserva el registro con ficha más completa',()=>{
 const p=preparar([{...base,id:1,rfc:'VIGF941127',homoclave:'LU7',cursos:'',experiencias:[]},{...base,id:2,rfc:'VIGF941127',homoclave:'LU7'}]);
 assert.equal(p.items.length,1);assert.equal(p.items[0].id,2);
 assert.deepEqual(p.duplicates,[{conservado_id:2,omitidos_ids:[1]}]);
 assert.equal(p.items[0].nombre_completo,'María Pérez López');
});
test('nombres idénticos sin RFC ni CURP se revisan antes de unificar',()=>{
 const p=preparar([{...base,id:1},{...base,id:2}]);
 assert.equal(p.items.length,2);assert.equal(p.duplicates.length,0);assert.equal(p.groups.length,1);
});
test('señala variantes de escritura y exige una decisión explícita',()=>{
 const p=preparar([{...base,id:1,telefono:'5512345678'},{...base,id:2,nombre:'MARIAH',telefono:'5512345679'}]);
 assert.equal(p.items.length,2);assert.equal(p.groups.length,1);
 assert.throws(()=>resolver(p,{}),/Revisa las coincidencias/);
 assert.equal(resolver(p,{[p.groups[0].id]:'todos'}).length,2);
 assert.deepEqual(resolver(p,{[p.groups[0].id]:'1'}).map(x=>x.id),[1]);
});
test('un RFC completo repetido se exporta una sola vez incluso en otra sección',()=>{
 const p=preparar([{...base,id:1,rfc:'VIGF941127',homoclave:'LU7'},{...base,id:2,rfc:'VIGF941127',homoclave:'LU7',seccion_electoral:'5678'}]);
 assert.equal(p.items.length,1);assert.equal(p.duplicates.length,1);
});
test('personas con RFC completos distintos no se fusionan por nombre y teléfono',()=>{
 const p=preparar([{...base,id:1,rfc:'VIGF941127',homoclave:'LU7'},{...base,id:2,rfc:'VIGF941127',homoclave:'LU8'}]);
 assert.equal(p.items.length,2);assert.equal(p.duplicates.length,0);
});
test('produce un PDF carta con acentos y fotografía de sustitución',async()=>{
 const r=preparar([{...base,id:1,cabecera:'CD. NEZAHUALCÓYOTL'}]).items[0];
 const pdf=await renderPDF(r);
 assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
 assert.ok(pdf.length>5000);
});
test('inserta la fotografía real en el PDF cuando el archivo está disponible',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cots-foto-pdf-'));
 const name='00000000-0000-4000-8000-000000000001.jpg',file=path.join(dir,name);
 const original=process.env.PHOTO_STORAGE_DIR;
 try{
  await sharp({create:{width:120,height:180,channels:3,background:'#16a34a'}}).jpeg().toFile(file);
  process.env.PHOTO_STORAGE_DIR=dir;
  const r=preparar([{...base,id:71,cabecera:'CD. NEZAHUALCÓYOTL',foto_archivo:name}]).items[0];
  const pdf=await renderPDF(r);
  const embedded=await sharp(file).rotate().resize(352,352,{fit:'contain',background:'#f4f4f4'}).jpeg({quality:85}).toBuffer();
  assert.ok(pdf.indexOf(embedded)>=0,'el PDF debe contener los bytes JPEG de la fotografía real');
 }finally{
  if(original===undefined)delete process.env.PHOTO_STORAGE_DIR;else process.env.PHOTO_STORAGE_DIR=original;
  await fs.unlink(file).catch(()=>{});await fs.rmdir(dir).catch(()=>{});
 }
});
test('rechaza una fotografía registrada cuyo archivo no existe',async()=>{
 const r=preparar([{...base,id:72,cabecera:'CD. NEZAHUALCÓYOTL',foto_archivo:'00000000-0000-4000-8000-000000000002.jpg'}]).items[0];
 await assert.rejects(renderPDF(r),/fotografía registrada no está disponible/);
});
