'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
const apiSource=source.slice(source.indexOf('async function api('),source.indexOf('function obj('));
const crearApi=fetch=>new Function('fetch',`${apiSource}; return api;`)(fetch);

test('la API rechaza HTML de un service worker ajeno antes de usar los datos',async()=>{
 const api=crearApi(async()=>({ok:true,headers:{get:()=> 'text/html'},json:async()=>({})}));
 await assert.rejects(api('/api/admin/reportes/fichas/previa'),/página en lugar de datos/);
});

test('la API distingue una respuesta JSON válida de una respuesta incompleta',async()=>{
 const api=crearApi(async()=>({ok:true,headers:{get:()=> 'application/json; charset=utf-8'},json:async()=>({fichas:1})}));
 assert.deepEqual(await api('/api/admin/reportes/fichas/previa'),{fichas:1});
 const incompleta=crearApi(async()=>({ok:true,headers:{get:()=> 'application/json'},json:async()=>{throw Error('JSON cortado');}}));
 await assert.rejects(incompleta('/api/admin/reportes/fichas/previa'),/respuesta del servidor llegó incompleta/);
});
