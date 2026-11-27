'use strict';
(()=>{
 const caracteres=valor=>String(valor??'').toUpperCase().replace(/[^A-ZÑ&0-9]/g,'').slice(0,13);
 function formato(valor){const rfc=caracteres(valor);return rfc.length>10?`${rfc.slice(0,10)}-${rfc.slice(10)}`:rfc;}
 function ajustar(campo){
  const anterior=campo.value,inicio=campo.selectionStart,fin=campo.selectionEnd,nuevo=formato(anterior);
  if(anterior===nuevo)return;
  const posicion=indice=>{
   const prefijo=anterior.slice(0,indice),cantidad=caracteres(prefijo).length;
   const trasSeparador=cantidad===10&&prefijo.includes('-');
   return Math.min(nuevo.length,cantidad+(cantidad>10||trasSeparador?1:0));
  };
  campo.value=nuevo;
  if(inicio!==null&&fin!==null)campo.setSelectionRange(posicion(inicio),posicion(fin));
 }
 function iniciar(documento){
  const campo=documento.getElementById('confirmRfc');if(!campo)return;
  // El formato se registra independientemente del resto del formulario.
  campo.addEventListener('input',e=>{if(!e.isComposing)ajustar(campo);});
  for(const evento of ['change','blur','compositionend'])campo.addEventListener(evento,()=>ajustar(campo));
  ajustar(campo);
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={formato,ajustar,iniciar};
 if(typeof document!=='undefined')iniciar(document);
})();
