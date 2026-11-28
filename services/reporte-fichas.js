'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const PDFDocument=require('pdfkit');
const sharp=require('sharp');

const assets=path.join(__dirname,'../public/assests');
const fontRegular=require.resolve('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff');
const fontBold=require.resolve('@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff');
const clean=value=>String(value??'').normalize('NFC').replace(/\s+/gu,' ').trim();
const key=value=>clean(value).normalize('NFD').replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim().toLocaleUpperCase('es-MX');
function title(value){
 return clean(value).toLocaleLowerCase('es-MX').replace(/(^|[\s.'’\-])\p{L}/gu,part=>part.toLocaleUpperCase('es-MX'));
}
function normalizar(r){
 const result={...r};
 for(const field of ['nombre','apellido_paterno','apellido_materno','nivel_estudios','estatus_estudios'])result[field]=title(r[field]);
 result.cursos=clean(r.cursos).toLocaleLowerCase('es-MX').replace(/(^|[.!?]\s+)\p{L}/gu,part=>part.toLocaleUpperCase('es-MX'));
 result.experiencias=(r.experiencias||[]).map(e=>({...e,puesto:title(e.puesto),institucion:title(e.institucion)}));
 result.nombre_completo=[result.nombre,result.apellido_paterno,result.apellido_materno].filter(Boolean).join(' ');
 return result;
}
function distancia(a,b,max=2){
 if(Math.abs(a.length-b.length)>max)return max+1;
 let prev=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(prev[j]+1,next[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
  if(Math.min(...next)>max)return max+1;prev=next;
 }return prev[b.length];
}
function preparar(rows){
 const items=rows.map(normalizar),parent=items.map((_,i)=>i),identificadores=new Map();
 const root=i=>parent[i]===i?i:(parent[i]=root(parent[i]));
 const unite=(a,b)=>{parent[root(b)]=root(a);};
 for(let i=0;i<items.length;i++){
  const r=items[i],rfc=key(`${r.rfc||''}${r.homoclave||''}`),curp=key(r.curp);
  const keys=[];
  if(rfc.length===13)keys.push(`rfc:${rfc}`);
  if(curp.length===18)keys.push(`curp:${curp}`);
  for(const id of keys){if(identificadores.has(id))unite(i,identificadores.get(id));else identificadores.set(id,i);}
 }
 const buckets=new Map();items.forEach((r,i)=>{const k=root(i);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(r);});
 const score=r=>Number(Boolean(r.foto_archivo))*5+Number(Boolean(r.nivel_estudios))*2+(r.experiencias?.length||0)+Number(Boolean(r.cursos));
 const acentos=r=>(r.nombre_completo.match(/[áéíóúüñ]/giu)||[]).length;
 const compareId=(a,b)=>BigInt(a.id)>BigInt(b.id)?-1:BigInt(a.id)<BigInt(b.id)?1:0;
 const chosen=[...buckets.values()].map(group=>group.sort((a,b)=>score(b)-score(a)||acentos(b)-acentos(a)||new Date(b.creado_en)-new Date(a.creado_en)||compareId(a,b))[0]);
 const duplicates=[...buckets.values()].filter(g=>g.length>1).map(g=>({conservado_id:g[0].id,omitidos_ids:g.slice(1).map(r=>r.id)}));
 const candidates=[];
 for(let i=0;i<chosen.length;i++)for(let j=i+1;j<chosen.length;j++){
  const a=chosen[i],b=chosen[j];
  if(key(`${a.rfc||''}${a.homoclave||''}`).length===13&&key(`${b.rfc||''}${b.homoclave||''}`).length===13&&key(a.rfc+a.homoclave)!==key(b.rfc+b.homoclave))continue;
  if(key(a.curp).length===18&&key(b.curp).length===18&&key(a.curp)!==key(b.curp))continue;
  const mismoTelefono=clean(a.telefono)&&clean(a.telefono)===clean(b.telefono);
  const mismaSeccion=a.distrito_numero===b.distrito_numero&&a.seccion_electoral===b.seccion_electoral;
  if(!mismoTelefono&&!mismaSeccion)continue;
  if(distancia(key(a.apellido_paterno),key(b.apellido_paterno),1)>1)continue;
  if(distancia(key(a.nombre_completo),key(b.nombre_completo))<=2)candidates.push([i,j]);
 }
 const reviewParent=chosen.map((_,i)=>i),reviewRoot=i=>reviewParent[i]===i?i:(reviewParent[i]=reviewRoot(reviewParent[i]));
 for(const [a,b] of candidates)reviewParent[reviewRoot(b)]=reviewRoot(a);
 const reviewBuckets=new Map();
 for(const pair of candidates)for(const i of pair){const root=reviewRoot(i);if(!reviewBuckets.has(root))reviewBuckets.set(root,new Set());reviewBuckets.get(root).add(i);}
 const groups=[...reviewBuckets.values()].map(members=>{
  const ids=[...members].map(i=>String(chosen[i].id)).sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0);
  return {id:ids.join('-'),registros:[...members].map(i=>({id:chosen[i].id,nombre:chosen[i].nombre_completo,fecha:chosen[i].creado_en,distrito:chosen[i].distrito_numero,seccion:chosen[i].seccion_electoral}))};
 });
 return {items:chosen,duplicates,groups};
}
function resolver(prepared,decisions={}){
 const excluded=new Set();
 for(const group of prepared.groups){
  const selected=decisions[group.id];
  if(selected===undefined)throw Object.assign(new Error('Revisa las coincidencias antes de descargar.'),{status:409});
  if(selected==='todos')continue;
  if(!group.registros.some(r=>String(r.id)===String(selected)))throw Object.assign(new Error('La selección de coincidencias ya no es válida. Vuelve a consultar el rango.'),{status:409});
  for(const r of group.registros)if(String(r.id)!==String(selected))excluded.add(String(r.id));
 }
 return prepared.items.filter(r=>!excluded.has(String(r.id)));
}
function filename(value){return clean(value).replace(/[<>:"/\\|?*\u0000-\u001F]/g,'').replace(/[. ]+$/,'').slice(0,100)||'Sin nombre';}
const mmYY=value=>value?`${String(value).slice(5,7)}/${String(value).slice(0,4)}`:'';
const photoDir=()=>process.env.PHOTO_STORAGE_DIR&&path.isAbsolute(process.env.PHOTO_STORAGE_DIR)?process.env.PHOTO_STORAGE_DIR:process.env.NODE_ENV==='production'?null:path.join(__dirname,'../private/fotos');
async function fotoDisponible(r){
 const dir=photoDir();if(!dir||!/^[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(r.foto_archivo||''))return false;
 try{await sharp(path.join(dir,r.foto_archivo)).metadata();return true;}catch{return false;}
}
async function photoBuffer(r){
 const dir=photoDir();
 const conFoto=Boolean(r.foto_archivo);
 if(conFoto&&(!dir||!/^[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(r.foto_archivo)))
  throw Object.assign(new Error('Una fotografía registrada no está disponible en este servidor.'),{status:409});
 const source=conFoto?await fs.readFile(path.join(dir,r.foto_archivo)).catch(()=>null):await fs.readFile(path.join(assets,'ficha-foto-placeholder.png'));
 if(!source)throw Object.assign(new Error('Una fotografía registrada no está disponible en este servidor.'),{status:409});
 try{return await sharp(source).rotate().resize(352,352,{fit:'contain',background:'#f4f4f4'}).jpeg({quality:85}).toBuffer();}
 catch(error){if(conFoto)throw Object.assign(new Error('Una fotografía registrada no se pudo procesar en este servidor.'),{status:409});throw error;}
}
function drawTable(doc,y,titleText,headers,rows,widths){
 const x=36,w=540;
 function heading(continued=false){
  doc.rect(x,y,w,22).fill('#f1efed');doc.rect(x,y,w,22).stroke('#555555');
  doc.fillColor('#303030').font('NotoBold').fontSize(10).text(continued?`${titleText} (continuación)`:titleText,x,y+6,{width:w,align:'center'});y+=22;
  cells(headers,22,true);
 }
 function cells(values,h,header=false){
  let cx=x;
  values.forEach((value,ci)=>{const cw=widths[ci];doc.rect(cx,y,cw,h).lineWidth(.6).stroke('#555555');
   doc.fillColor(header?'#691C32':'#202020').font(header?'NotoBold':'Noto').fontSize(header?8:9)
    .text(clean(value),cx+4,y+5,{width:cw-8,align:'center'});cx+=cw;
  });y+=h;
 }
 if(y+83>720){doc.addPage();y=36;}heading();
 for(const row of rows){
  doc.font('Noto').fontSize(9);
  const h=Math.max(39,...row.map((value,ci)=>doc.heightOfString(clean(value),{width:widths[ci]-8,align:'center'})+12));
  if(y+h>720){doc.addPage();y=36;heading(true);}
  cells(row,h);
 }
 return y+17;
}
function drawCourses(doc,y,value){
 const words=(value||' ').split(/\s+/u);let index=0,first=true;
 do{
  if(!first){doc.addPage();y=36;}
  const heading=first?'CURSOS, TALLERES O DIPLOMADOS':'CURSOS, TALLERES O DIPLOMADOS (continuación)';
  doc.rect(36,y,540,22).fill('#f1efed');doc.rect(36,y,540,22).stroke('#555555');
  doc.fillColor('#303030').font('NotoBold').fontSize(10).text(heading,36,y+6,{width:540,align:'center'});y+=22;
  doc.font('Noto').fontSize(9);
  const available=720-y-20;let low=1,high=words.length-index,take=1;
  while(low<=high){const mid=(low+high)>>1,chunk=words.slice(index,index+mid).join(' ');
   if(doc.heightOfString(chunk,{width:524,align:'center'})<=available){take=mid;low=mid+1;}else high=mid-1;
  }
  const chunk=words.slice(index,index+take).join(' ');index+=take;
  const h=Math.max(first?80:0,doc.heightOfString(chunk,{width:524,align:'center'})+20);
  doc.rect(36,y,540,h).stroke('#555555');doc.fillColor('#202020').font('Noto').fontSize(9).text(chunk,44,y+10,{width:524,align:'center'});
  first=false;
 }while(index<words.length);
}
async function renderPDF(r){
 const [logo,lema,photo]=await Promise.all([
  fs.readFile(path.join(assets,'ficha-morena.jpeg')),
  fs.readFile(path.join(assets,'ficha-morena-lema.png')),
  photoBuffer(r)
 ]);
 const doc=new PDFDocument({size:'LETTER',margin:36,autoFirstPage:true,info:{Title:`Ficha curricular - ${r.nombre_completo}`,Author:'Registro individual'}});
 doc.registerFont('Noto',fontRegular);doc.registerFont('NotoBold',fontBold);
 const chunks=[];doc.on('data',chunk=>chunks.push(chunk));const finished=new Promise((resolve,reject)=>{doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 doc.image(logo,48,44,{fit:[200,45]});doc.image(lema,48,80,{fit:[200,25]});
 doc.moveTo(280,43).lineTo(280,112).lineWidth(.8).stroke('#df9b96');
 doc.fillColor('#858585').font('NotoBold').fontSize(18).text('FICHA CURRICULAR',305,68,{width:260});
 doc.moveTo(36,117).lineTo(576,117).stroke('#df9b96');
 doc.rect(42,135,96,96).fill('#f4f4f4');doc.image(photo,46,139,{width:88,height:88});doc.rect(42,135,96,96).stroke('#777777');
 const x=150,w=426;doc.rect(x,135,w,22).fill('#f1efed').stroke('#555555');doc.fillColor('#303030').font('NotoBold').fontSize(10).text('NOMBRE COMPLETO',x,141,{width:w,align:'center'});
 [ ['NOMBRE','APELLIDO 1','APELLIDO 2'],[r.nombre,r.apellido_paterno,r.apellido_materno] ].forEach((row,ri)=>{let cx=x;row.forEach(v=>{doc.rect(cx,157+ri*36,142,36).stroke('#555555');doc.fillColor(ri?'#202020':'#691C32').font(ri?'Noto':'NotoBold').fontSize(ri?9:8).text(clean(v),cx+4,169+ri*36,{width:134,height:25,align:'center',ellipsis:true});cx+=142;});});
 let y=255;
 const experiencias=r.sin_experiencia_laboral?[['Sin experiencia laboral','','']]:r.experiencias.map(e=>[e.puesto,e.institucion,`${mmYY(e.periodo_inicio)}${e.periodo_fin?` — ${mmYY(e.periodo_fin)}`:''}`]);
 y=drawTable(doc,y,'EXPERIENCIA LABORAL',['PUESTO','INSTITUCIÓN','PERIODO (mes/año)'],experiencias.length?experiencias:[['','','']],[180,180,180]);
 y=drawTable(doc,y,'FORMACIÓN ACADÉMICA',['NIVEL MÁXIMO DE ESTUDIOS','ESTATUS'],[[r.nivel_estudios,r.estatus_estudios]],[345,195]);
 if(y>680){doc.addPage();y=45;}
 drawCourses(doc,y,r.cursos);
 doc.end();return finished;
}
module.exports={preparar,resolver,renderPDF,filename,key,title,fotoDisponible};
