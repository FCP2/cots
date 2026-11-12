'use strict';
const crypto = require('crypto');
function token() {return crypto.randomBytes(32).toString('hex');}
function hashToken(t) {return crypto.createHash('sha256').update(t, 'utf8').digest('hex');}
function normalize(t) {return String(t||'').normalize('NFKC').trim().replace(/\s+/g,' ');}
function keyName(t) {return normalize(t).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleUpperCase('es-MX');}
function audit(client,user,action,entity,id,detail={}) {
 return client.query('INSERT INTO auditoria(usuario_id,accion,entidad,entidad_id,detalle) VALUES($1,$2,$3,$4,$5)',[user,action,entity,id,JSON.stringify(detail)]);
}
const clean = v => Object.fromEntries(Object.entries(v).map(([k,x])=>[k,typeof x==='string'?normalize(x):x]));
module.exports={token,hashToken,normalize,keyName,audit,clean};
