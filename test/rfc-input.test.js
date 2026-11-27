'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {formato,ajustar}=require('../public/js/rfc-input');
function campo(valor=''){
 return {value:valor,selectionStart:valor.length,selectionEnd:valor.length,listeners:{},
  addEventListener(evento,callback){this.listeners[evento]=callback;},
  setSelectionRange(inicio,fin){this.selectionStart=inicio;this.selectionEnd=fin;}};
}

test('el archivo cargado registra los eventos y agrega el guion al escribir el RFC de la captura',()=>{
 const input=campo();
 const script=fs.readFileSync(path.join(__dirname,'../public/js/rfc-input.js'),'utf8');
 // Ejecuta el arranque completo del archivo como en la página, sin otros scripts.
 vm.runInNewContext(script,{document:{getElementById:id=>id==='confirmRfc'?input:null}});
 for(const letra of 'VIGF941127LU7'){
  input.value+=letra;input.selectionStart=input.selectionEnd=input.value.length;
  input.listeners.input({isComposing:false});
 }
 assert.equal(input.value,'VIGF941127-LU7');
 assert.equal(input.selectionStart,14);
 input.value='VIGF941127-LU78';input.selectionStart=input.selectionEnd=input.value.length;
 input.listeners.input({isComposing:false});
 assert.equal(input.value,'VIGF941127-LU7');
 input.value='vigf941127lu78';input.listeners.change();
 assert.equal(input.value,'VIGF941127-LU7');
});

test('el RFC permite pegar con o sin guion y limita a 13 caracteres reales',()=>{
 for(const valor of ['vigf941127lu7','VIGF941127-LU7','VIGF941127LU78','VIGF941127--LU7',' VIGF941127 LU7 ']){
  assert.equal(formato(valor),'VIGF941127-LU7');
 }
 assert.equal(formato('VIGF941127'),'VIGF941127');
 assert.equal(formato(''),'');
 const input=campo('VIGF941127-LU7');input.selectionStart=input.selectionEnd=11;
 ajustar(input);assert.equal(input.selectionStart,11);
 input.value='vigf941127-LU7';ajustar(input);assert.equal(input.selectionStart,11);
});

test('el HTML carga el formateador antes del formulario y valida la homoclave completa',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 assert.ok(html.indexOf('src="/js/rfc-input.js?v=')<html.indexOf('src="/js/confirmacion.js?v='));
 const tag=html.match(/<input[^>]*id="confirmRfc"[^>]*>/)[0];
 const pattern=new RegExp(`^(?:${tag.match(/pattern="([^"]+)"/)[1].replaceAll('&amp;','&')})$`,'v');
 assert.equal(pattern.test(formato('VIGF941127LU7')),true);
 assert.equal(pattern.test('VIGF941127-LU78'),false);
 assert.equal(pattern.test('VIGF941127-LU'),false);
 assert.equal(pattern.test('VIGF941127'),true);
 assert.doesNotMatch(tag,/\srequired(?:\s|>)/);
});
