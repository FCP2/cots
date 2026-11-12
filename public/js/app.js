'use strict';
const $=id=>document.getElementById(id);
const tokenInvitacion=new URLSearchParams(location.search).get('invite');
const esUrlPublicaFija=tokenInvitacion==='registro';
let pendiente=null,enviando=false,revisando=false,entrando=false,generandoInvitacion=false;
let inscripciones=[],ordenInscritos={col:'creado_en',dir:'desc'};
function view(id,show){$(id).classList.toggle('hidden',!show);}
function aviso(text,error=false){let el=$('mensaje');el.textContent=text;el.className=`mb-4 rounded-lg p-3 ${error?'bg-red-100 text-red-900':'bg-emerald-100 text-emerald-900'}`;el.scrollIntoView({block:'nearest'});}
function botonCargando(button,loading,text='Cargando...'){
 if(!button)return;
 if(loading){
  if(button.dataset.textoOriginal===undefined)button.dataset.textoOriginal=button.textContent;
  button.disabled=true;button.classList.add('btn-loading');button.setAttribute('aria-busy','true');
  const spinner=document.createElement('span');spinner.className='loader';spinner.setAttribute('aria-hidden','true');
  const label=document.createElement('span');label.textContent=text;button.replaceChildren(spinner,label);
 }else{
  button.disabled=false;button.classList.remove('btn-loading');button.removeAttribute('aria-busy');button.textContent=button.dataset.textoOriginal||text;delete button.dataset.textoOriginal;
 }
}
async function api(path,opts={}){
 const res=await fetch(path,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...opts});
 const j=await res.json().catch(()=>({}));if(!res.ok)throw Error(j.error||'Error de conexión');return j;
}
function obj(form){return Object.fromEntries(new FormData(form).entries());}
function celda(row,text){const e=document.createElement('td');e.className='p-2 border-b border-slate-100';e.textContent=text==null?'':String(text);row.append(e);return e;}
function boton(text,callback){const b=document.createElement('button');b.type='button';b.className='font-bold text-guinda underline mx-1';b.textContent=text;b.addEventListener('click',callback);return b;}
function nombre(p,prefix=''){return [p[prefix+'nombre'],p[prefix+'apellido_paterno'],p[prefix+'apellido_materno']].filter(Boolean).join(' ');}
async function inicioPublico(){
 view('publico',true);view('loginVista',false);
 try{
  const [inv,dist]=await Promise.all([esUrlPublicaFija?Promise.resolve({invitador_nombre:'el administrador'}):api('/api/public/invitacion/'+encodeURIComponent(tokenInvitacion)),api('/api/public/distritos')]);
  $('invitador').textContent=inv.invitador_nombre;
  const select=$('inscripcionForm').elements.distrito_numero;
  const selectedDistrict=$('distritoSeleccionado');
  const updateSelectedDistrict=()=>{selectedDistrict.textContent=select.value?`Distrito seleccionado: ${select.selectedOptions[0].textContent}`:'';};
  select.addEventListener('change',updateSelectedDistrict);
  for(const d of dist){const op=document.createElement('option');op.value=d.numero;op.textContent=`${String(d.numero).padStart(2,'0')} · ${d.cabecera}`;select.append(op);}
  updateSelectedDistrict();
 }catch(e){view('formVista',false);aviso(e.message,true);}
}
$('inscripcionForm').addEventListener('submit',e=>{
 e.preventDefault();if(revisando)return;
 const revisar=$('revisar');revisando=true;botonCargando(revisar,true,'Validando...');
 if(!e.target.reportValidity()){revisando=false;botonCargando(revisar,false);return;}
 pendiente=obj(e.target);
 pendiente.curp=pendiente.curp.toUpperCase().trim();
 pendiente.codigo_invitacion=pendiente.codigo_invitacion.toUpperCase().trim();
 if(!/^[A-Z][AEIOUX][A-Z]{2}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[HM][A-Z]{5}[A-Z0-9]\d$/.test(pendiente.curp)){
  revisando=false;botonCargando(revisar,false);return aviso('La CURP debe contener 18 caracteres y tener una estructura válida.',true);
 }
 const fields=[
  ['Nombre completo',nombre(pendiente)],['CURP',pendiente.curp.slice(0,4)+'**********'+pendiente.curp.slice(-4)],
  ['Edad',pendiente.edad],['Teléfono',pendiente.telefono],['Correo electrónico',pendiente.correo_electronico],
  ['Distrito federal',$('inscripcionForm').elements.distrito_numero.selectedOptions[0].textContent],
  ['Sección electoral',pendiente.seccion_electoral],['Referente',nombre(pendiente,'referente_')]
 ];
 $('resumenRevision').replaceChildren();for(const [label,value] of fields){let div=document.createElement('div');div.className='rounded-lg border border-slate-200 p-3';
  let h=document.createElement('div');h.className='font-bold text-guinda text-xs';h.textContent=label;
  let v=document.createElement('div');v.className='mt-1 break-words';v.textContent=value;div.append(h,v);$('resumenRevision').append(div);}
 view('formVista',false);view('revisionVista',true);$('revisionVista').scrollIntoView({behavior:'smooth'});revisando=false;botonCargando(revisar,false);
});
$('corregir').addEventListener('click',()=>{view('revisionVista',false);view('formVista',true);$('formVista').scrollIntoView({behavior:'smooth'});});
$('confirmar').addEventListener('click',async()=>{
 if(enviando||!pendiente)return;
 enviando=true;botonCargando($('confirmar'),true,'Enviando...');
 try{
  const p={...pendiente};if(tokenInvitacion&&!esUrlPublicaFija)p.token=tokenInvitacion;delete p.acepta;
  await api('/api/public/inscripciones',{method:'POST',body:JSON.stringify(p)});
  pendiente=null;$('inscripcionForm').reset();
  view('revisionVista',false);view('exitoVista',true);
  view('mensaje',false);history.replaceState(null,'',location.pathname);
  $('exitoVista').scrollIntoView({behavior:'smooth'});
 }catch(e){aviso(e.message,true);}
 finally{enviando=false;botonCargando($('confirmar'),false);}
});
$('loginForm').addEventListener('submit',async e=>{
 e.preventDefault();if(entrando||!e.target.reportValidity())return;entrando=true;botonCargando($('loginSubmit'),true,'Ingresando...');
 try{const r=await api('/api/auth/entrar',{method:'POST',body:JSON.stringify(obj(e.target))});mostrarAdmin(r.usuario);await cargarAdmin();}catch(err){aviso(err.message,true);}finally{entrando=false;botonCargando($('loginSubmit'),false);}
});
function mostrarAdmin(u){view('loginVista',false);view('publico',false);view('adminVista',true);view('salir',true);$('bienvenida').textContent=`Bienvenido/a, ${u.nombre} ${u.apellido_paterno||''}`;}
$('salir').addEventListener('click',async()=>{try{await api('/api/auth/salir',{method:'POST'});location.href='/';}catch(e){aviso(e.message,true);}});
async function cargarAdmin(){
 const [stats,inv]=await Promise.all([api('/api/admin/resumen'),api('/api/admin/invitaciones')]);
 $('kpis').textContent=`Inscripciones: ${stats.registros} · Distritos con registros: ${stats.distritos} · Invitaciones: ${stats.invitaciones}`;
 const body=$('tablaInvitaciones');body.replaceChildren();
 for(const x of inv){
  let tr=document.createElement('tr');celda(tr,x.invitador_nombre);celda(tr,x.destinatario_nombre);celda(tr,x.inscritos);
  celda(tr,x.vence_en?new Date(x.vence_en).toLocaleDateString('es-MX'):'—');
  const status=x.estado==='revocada'?'Revocada':x.estado==='agotada'?'Agotada':x.vence_en&&new Date(x.vence_en)<new Date()?'Vencida':'Activa';celda(tr,status);
  let actions=celda(tr,'');actions.append(boton('Ver',()=>cargarInscritos(x.id,x.invitador_nombre)));
  if(x.estado!=='revocada')actions.append(boton('Revocar',async()=>{
   if(!confirm('¿Revocar esta invitación? No se eliminarán registros existentes.'))return;
   try{await api(`/api/admin/invitaciones/${x.id}/revocar`,{method:'POST'});await cargarAdmin();}catch(e){aviso(e.message,true);}
  }));body.append(tr);
 }
 await cargarInscritos();
}
async function cargarInscritos(id=null,etiqueta=''){
 try{
  inscripciones=await api('/api/admin/inscripciones'+(id?'?invitacion_id='+encodeURIComponent(id):''));
  $('tituloInscritos').textContent=id?`Registros · ${etiqueta}`:'Todos los registros';
  renderInscritos();
  if(id)$('tablaInscritos').closest('.card').scrollIntoView({behavior:'smooth'});
 }catch(e){aviso(e.message,true);}
}
function valorInscrito(x,col){
 if(col==='nombre')return nombre(x);
 if(col==='referente')return nombre(x,'referente_');
 return x[col]??'';
}
function renderInscritos(){
 const {col,dir}=ordenInscritos;
 const rows=[...inscripciones].sort((a,b)=>{
  const av=valorInscrito(a,col),bv=valorInscrito(b,col);
  const result=col==='creado_en'?new Date(av)-new Date(bv):col==='distrito_numero'?Number(av)-Number(bv):String(av).localeCompare(String(bv),'es',{numeric:true,sensitivity:'base'});
  return dir==='asc'?result:-result;
 });
 const body=$('tablaInscritos');body.replaceChildren();
 for(const x of rows){let tr=document.createElement('tr');celda(tr,nombre(x));celda(tr,x.curp_mascarada);celda(tr,String(x.distrito_numero).padStart(2,'0'));
   celda(tr,x.seccion_electoral);celda(tr,nombre(x,'referente_'));celda(tr,x.invitador_nombre);
   celda(tr,new Date(x.creado_en).toLocaleString('es-MX'));body.append(tr);}
 document.querySelectorAll('#contenedorInscritos th[data-col]').forEach(th=>{
  const active=th.dataset.col===col;
  th.setAttribute('aria-sort',active?(dir==='asc'?'ascending':'descending'):'none');
  th.querySelector('span').textContent=active?(dir==='asc'?'↑':'↓'):'↕';
 });
 const contenedor=$('contenedorInscritos');
 contenedor.classList.toggle('is-scrollable',rows.length>20);
 contenedor.style.maxHeight=rows.length>20?`${Math.ceil(body.rows[19].getBoundingClientRect().bottom-contenedor.getBoundingClientRect().top)}px`:'';
 contenedor.scrollTop=0;
}
document.querySelectorAll('#contenedorInscritos th[data-col] button').forEach(button=>button.addEventListener('click',()=>{
 const col=button.closest('th').dataset.col;
 ordenInscritos={col,dir:ordenInscritos.col===col&&ordenInscritos.dir==='asc'?'desc':'asc'};
 renderInscritos();
}));
$('verTodas').addEventListener('click',()=>cargarInscritos());
$('invitarForm').addEventListener('submit',async e=>{
 e.preventDefault();if(generandoInvitacion||!e.target.reportValidity())return;generandoInvitacion=true;botonCargando($('generarInvitacion'),true,'Generando...');try{
  const j=await api('/api/admin/invitaciones',{method:'POST',body:JSON.stringify(obj(e.target))});
  const box=$('enlaceCreado');box.replaceChildren();const label=document.createElement('p');label.textContent='Copia el enlace y el código ahora; solo se muestran una vez.';
  const a=document.createElement('a');a.href=j.url;a.textContent=j.url;a.className='block font-semibold text-guinda underline my-3';a.rel='noreferrer';
  const code=document.createElement('div');code.className='font-mono font-extrabold text-lg';code.textContent='Código: '+j.codigo_invitacion;
  box.append(label,a,code);await cargarAdmin();aviso('Invitación generada correctamente.');
 }catch(err){aviso(err.message,true);}finally{generandoInvitacion=false;botonCargando($('generarInvitacion'),false);}
});
(async()=>{
 if(tokenInvitacion){await inicioPublico();return;}
 try{const r=await api('/api/auth/yo');mostrarAdmin(r.usuario);await cargarAdmin();}
 catch(e){view('loginVista',true);}
})();
