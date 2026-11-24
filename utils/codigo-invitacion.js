'use strict';
const crypto=require('node:crypto');

function claveConfigurada(){return /^[a-f0-9]{64}$/i.test(process.env.INVITATION_CODE_KEY||'');}
function clave(){
 if(!claveConfigurada())throw new Error('Falta INVITATION_CODE_KEY de 32 bytes en hexadecimal');
 return Buffer.from(process.env.INVITATION_CODE_KEY,'hex');
}
function cifrarCodigo(codigo,invitacionId){
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',clave(),iv);
 cipher.setAAD(Buffer.from(`invitacion:${invitacionId}`));
 const data=Buffer.concat([cipher.update(codigo,'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),data.toString('base64url')].join('.');
}
function descifrarCodigo(valor,invitacionId){
 const partes=String(valor).split('.');
 if(partes.length!==4||partes[0]!=='v1')throw new Error('Código cifrado no válido');
 const [,iv,tag,data]=partes;
 const decipher=crypto.createDecipheriv('aes-256-gcm',clave(),Buffer.from(iv,'base64url'),{authTagLength:16});
 decipher.setAAD(Buffer.from(`invitacion:${invitacionId}`));
 decipher.setAuthTag(Buffer.from(tag,'base64url'));
 return Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8');
}
module.exports={claveConfigurada,cifrarCodigo,descifrarCodigo};
