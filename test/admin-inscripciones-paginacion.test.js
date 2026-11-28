'use strict';
process.env.DATABASE_URL||='postgresql://test:test@localhost/test';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {pool}=require('../config/database');
const router=require('../routes/admin');
const handler=router.stack.find(x=>x.route?.path==='/inscripciones'&&x.route.methods.get).route.stack[0].handle;

async function consultar(query){
 let body,code=200,error;
 const res={set(){return this;},status(value){code=value;return this;},json(value){body=value;return this;}};
 await handler({query},res,e=>{error=e;});
 assert.ifError(error);
 return {body,code};
}

test('inscripciones entrega páginas de 20, ordena en SQL y conserva el filtro',async()=>{
 const original=pool.query,calls=[];
 pool.query=async(sql,params)=>{
  calls.push({sql,params});
  return sql.includes('count(*)')?{rows:[{total:45}]}:{rows:[{id:21}]};
 };
 try{
  const {body,code}=await consultar({invitacion_id:'9',pagina:'2',orden:'nombre',direccion:'asc'});
  assert.equal(code,200);
  assert.deepEqual(body,{registros:[{id:21}],total:45,pagina:2,paginas:3});
  assert.deepEqual(calls[0].params,['9']);
  assert.deepEqual(calls[1].params,['9',20]);
  assert.match(calls[1].sql,/ORDER BY concat_ws\(' ',s.nombre,s.apellido_paterno,s.apellido_materno\) ASC NULLS LAST,s.id DESC/);
  assert.match(calls[1].sql,/LIMIT 20 OFFSET \$2/);
 }finally{pool.query=original;}
});

test('inscripciones limita la página solicitada y rechaza orden no permitido',async()=>{
 const original=pool.query;
 pool.query=async sql=>sql.includes('count(*)')?{rows:[{total:21}]}:{rows:[]};
 try{
  const {body}=await consultar({pagina:'999'});
  assert.equal(body.pagina,2);
  assert.equal((await consultar({orden:'s.id; DROP TABLE inscripciones'})).code,400);
  assert.equal((await consultar({pagina:'0'})).code,400);
 }finally{pool.query=original;}
});
