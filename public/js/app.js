'use strict';
const $=id=>document.getElementById(id);
const tokenInvitacion=new URLSearchParams(location.search).get('invite');
const esConfirmacion=new URLSearchParams(location.search).get('confirmar')==='registro';
const esUrlPublicaFija=tokenInvitacion==='registro';
let pendiente=null,enviando=false,revisando=false,entrando=false,entrandoResponsable=false,generandoInvitacion=false;
let sesionActiva=null,saliendo=false,cargandoResponsable=false,fichaAdminCargando=false,paginaResponsable=1,totalPaginasResponsable=1;
let inscripciones=[],ordenInscritos={col:'creado_en',dir:'desc'},filtroInscritos={id:null,etiqueta:''};
let responsables=[];
function view(id,show){$(id).classList.toggle('hidden',!show);}
function limitarVisibles(contenedor,elementos,limite){
 const mostrarScroll=elementos.length>limite&&contenedor.getClientRects().length>0;
 contenedor.classList.toggle('is-scrollable',mostrarScroll);
 contenedor.style.maxHeight='';
 if(mostrarScroll){
  const alto=elementos[limite-1].getBoundingClientRect().bottom-contenedor.getBoundingClientRect().top+contenedor.scrollTop;
  contenedor.style.maxHeight=`${Math.ceil(alto)}px`;
 }
}
function ajustarPaneles(){
 limitarVisibles($('contenedorInvitaciones'),$('tablaInvitaciones').rows,7);
 limitarVisibles($('metricasResponsables'),$('metricasResponsables').children,6);
 limitarVisibles($('contenedorRegistrosResponsable'),$('tablaResponsable').rows,15);
}
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
function botonAccion(text,clase,callback){
 const clases={view:'invitation-action-view',edit:'invitation-action-edit',revoke:'invitation-action-revoke',delete:'invitation-action-delete'};
 const b=boton(text,callback);b.className=clases[clase];return b;
}
const estiloDialogo={width:'32rem',buttonsStyling:false,showCancelButton:true,cancelButtonText:'Cancelar',
 customClass:{popup:'cots-dialog',confirmButton:'cots-dialog-confirm',cancelButton:'cots-dialog-cancel'},
 allowOutsideClick:()=>!Swal.isLoading(),allowEscapeKey:()=>!Swal.isLoading()};
function fechaVencimiento(valor){
 if(!valor)return '';
 const partes=Object.fromEntries(new Intl.DateTimeFormat('es-MX',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(valor)).map(p=>[p.type,p.value]));
 return `${partes.year}-${partes.month}-${partes.day}`;
}
async function editarResponsable(inv){
 const fechaInicial=fechaVencimiento(inv.vence_en);
 const result=await Swal.fire({...estiloDialogo,title:'Editar invitación',
  html:'<span class="cots-dialog-eyebrow">Solo este código</span><p>Actualiza el responsable o la fecha de vencimiento de la invitación seleccionada.</p><div class="cots-dialog-fields"><label for="editarResponsableNombre">Nombre del responsable</label><input id="editarResponsableNombre" class="cots-dialog-field" type="text" required minlength="3" maxlength="250" autocomplete="off"><label for="editarVencimiento">Fecha de vencimiento</label><input id="editarVencimiento" class="cots-dialog-field" type="date"><small>El código estará vigente durante todo el día seleccionado (hora de Ciudad de México). Si esta invitación no tiene vencimiento, puedes dejar la fecha vacía.</small></div>',
  didOpen:()=>{document.getElementById('editarResponsableNombre').value=inv.invitador_nombre;document.getElementById('editarVencimiento').value=fechaInicial;},
  confirmButtonText:'Guardar cambios',showLoaderOnConfirm:true,
  preConfirm:async()=>{
   const nombre=document.getElementById('editarResponsableNombre').value.trim();
   const fecha=document.getElementById('editarVencimiento');
   if(nombre.length<3){Swal.showValidationMessage('Escribe al menos 3 caracteres.');return false;}
   if(!fecha.checkValidity()||(fechaInicial&&!fecha.value)){Swal.showValidationMessage('Selecciona una fecha de vencimiento válida.');fecha.focus();return false;}
   if(nombre===inv.invitador_nombre&&fecha.value===fechaInicial)return {ok:true,sinCambios:true};
   const cambios={invitador_nombre:nombre};if(fecha.value!==fechaInicial)cambios.vence_fecha=fecha.value;
   try{return await api(`/api/admin/invitaciones/${inv.id}`,{method:'PATCH',body:JSON.stringify(cambios)});}
   catch(e){Swal.showValidationMessage(e.message);return false;}
  }});
 if(result.isConfirmed){await cargarAdmin();aviso(result.value?.sinCambios?'No hubo cambios en la invitación.':'Invitación actualizada.');}
}
async function eliminarInvitacion(inv){
 const result=await Swal.fire({...estiloDialogo,title:'Eliminar invitación',
  html:`<span class="cots-dialog-eyebrow">Solo este código</span>
   <p>Se revocará la invitación de <strong id="dialogoResponsable" class="cots-dialog-name"></strong>.</p>
   <fieldset class="cots-dialog-options" aria-label="Destino de los registros">
    <label class="cots-dialog-option"><input type="radio" name="destinoRegistros" value="conservar" checked>
     <span><strong>Conservar sus registros</strong><small>Seguirán en las inscripciones y reportes.</small></span></label>
    <label class="cots-dialog-option"><input type="radio" name="destinoRegistros" value="eliminar">
     <span><strong>Eliminar también sus registros</strong><small id="dialogoConteo"></small></span></label>
   </fieldset><p class="cots-dialog-warning">La eliminación de registros es permanente. Los otros códigos del responsable no se afectarán.</p>`,
  didOpen:()=>{document.getElementById('dialogoResponsable').textContent=inv.invitador_nombre;
   document.getElementById('dialogoConteo').textContent=`Se borrarán ${inv.total_inscritos} inscripción(es) de este código de la base de datos.`;},
  confirmButtonText:'Eliminar invitación',showLoaderOnConfirm:true,
  customClass:{...estiloDialogo.customClass,confirmButton:'cots-dialog-danger'},
  preConfirm:async()=>{
   const eliminar_registros=document.querySelector('input[name="destinoRegistros"]:checked')?.value==='eliminar';
   try{return {...await api(`/api/admin/invitaciones/${inv.id}`,{method:'DELETE',body:JSON.stringify({eliminar_registros})}),eliminar_registros};}
   catch(e){Swal.showValidationMessage(e.message);return false;}
  }});
 if(result.isConfirmed){await cargarAdmin();
  aviso(result.value.eliminar_registros?`Invitación eliminada. Se borraron ${result.value.registros_eliminados} registro(s).`:'Invitación eliminada. Sus registros se conservaron.');}
}
async function eliminarInscripcion(registro){
 const result=await Swal.fire({...estiloDialogo,title:'Eliminar inscripción',
  html:'<span class="cots-dialog-eyebrow">Inscripción seleccionada</span><strong id="dialogoInscripcionNombre" class="cots-dialog-name"></strong><p class="cots-dialog-warning">Este registro dejará de aparecer en los paneles, conteos y reportes. Los demás registros y el código de invitación se conservarán.</p>',
  didOpen:()=>{$('dialogoInscripcionNombre').textContent=nombre(registro);},
  confirmButtonText:'Eliminar inscripción',showLoaderOnConfirm:true,
  customClass:{...estiloDialogo.customClass,confirmButton:'cots-dialog-danger'},
  preConfirm:async()=>{
   try{return await api(`/api/admin/inscripciones/${registro.id}`,{method:'DELETE'});}
   catch(e){Swal.showValidationMessage(e.message);return false;}
  }});
 if(result.isConfirmed){await cargarAdmin(filtroInscritos);aviso('Inscripción eliminada del seguimiento y los reportes.');}
}
function nombre(p,prefix=''){return [p[prefix+'nombre'],p[prefix+'apellido_paterno'],p[prefix+'apellido_materno']].filter(Boolean).join(' ');}
for(const campo of ['nombre','apellido_paterno','apellido_materno']){
 $('inscripcionForm').elements[campo].addEventListener('input',e=>{
  const noPermitidos=campo==='nombre'?/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ.'’ ]/g:/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’ ]/g;
  e.target.value=e.target.value.replace(noPermitidos,'');
 });
}
$('inscripcionForm').elements.telefono.addEventListener('input',e=>{
 e.target.value=e.target.value.replace(/\D/g,'').slice(0,10);
});
$('inscripcionForm').elements.edad.addEventListener('input',e=>{
 e.target.value=e.target.value.replace(/\D/g,'').slice(0,2);
});
$('inscripcionForm').elements.seccion_electoral.addEventListener('input',e=>{
 e.target.value=e.target.value.replace(/\D/g,'').slice(0,4);
});
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
 if(pendiente.curp&&!/^[A-Z][AEIOUX][A-Z]{2}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[HM][A-Z]{5}[A-Z0-9]\d$/.test(pendiente.curp)){
  revisando=false;botonCargando(revisar,false);return aviso('La CURP debe contener 18 caracteres y tener una estructura válida.',true);
 }
 const fields=[
  ['Nombre completo',nombre(pendiente)],['CURP',pendiente.curp?pendiente.curp.slice(0,4)+'**********'+pendiente.curp.slice(-4):'No proporcionada'],
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
  const p={...pendiente};if(tokenInvitacion&&!esUrlPublicaFija)p.token=tokenInvitacion;
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
function mostrarAcceso(tipo){
 if(tipo==='responsable'&&$('tabResponsable').hidden)return;
 const admin=tipo==='admin';
 if($('loginVista').dataset.accessMode===tipo)return;
 $('loginVista').dataset.accessMode=tipo;
 view('loginForm',admin);view('responsableLoginForm',!admin);
 for(const [id,activo] of [['tabAdmin',admin],['tabResponsable',!admin]]){
  $(id).classList.toggle('active',activo);$(id).setAttribute('aria-selected',String(activo));$(id).tabIndex=activo?0:-1;
 }
 $('accessContextTitle').querySelector('.access-context-admin').setAttribute('aria-hidden',String(!admin));
 $('accessContextTitle').querySelector('.access-context-responsable').setAttribute('aria-hidden',String(admin));
 $('accessEditorialTitle').textContent=admin?'Una entrada clara a tu información.':'El seguimiento de tu equipo, en un lugar.';
 $('accessContextDescription').textContent=admin?'Gestiona invitaciones, consulta inscripciones y da seguimiento a cada registro desde un solo espacio.':'Consulta el total de inscripciones y revisa los registros vinculados con tu código de invitación.';
 document.querySelector('#loginVista .access-foot-index').textContent=admin?'01 / 02':'02 / 02';
}
$('tabAdmin').addEventListener('click',()=>mostrarAcceso('admin'));
$('tabResponsable').addEventListener('click',()=>mostrarAcceso('responsable'));
for(const input of document.querySelectorAll('#loginVista [data-error]')){
 const actualizarError=()=>{
  const invalido=input.matches(':user-invalid');
  if(invalido){input.setAttribute('aria-describedby',input.dataset.error);input.setAttribute('aria-invalid','true');}
  else{input.removeAttribute('aria-describedby');input.removeAttribute('aria-invalid');}
 };
 for(const evento of ['input','change','blur','invalid'])input.addEventListener(evento,()=>requestAnimationFrame(actualizarError));
}
for(const toggle of document.querySelectorAll('#loginVista [data-password-toggle]'))toggle.addEventListener('click',()=>{
 const input=$(toggle.dataset.passwordToggle),visible=input.type==='password';
 input.type=visible?'text':'password';
 toggle.textContent=visible?'Ocultar':'Mostrar';
 toggle.setAttribute('aria-label',`${visible?'Ocultar':'Mostrar'} ${input.id==='adminLlave'?'llave personal':'llave'}`);
 toggle.setAttribute('aria-pressed',String(visible));
 input.focus({preventScroll:true});
});
for(const id of ['tabAdmin','tabResponsable'])$(id).addEventListener('keydown',e=>{
 if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
 if($('tabResponsable').hidden)return;
 e.preventDefault();const next=e.key==='Home'?'tabAdmin':e.key==='End'?'tabResponsable':id==='tabAdmin'?'tabResponsable':'tabAdmin';
 $(next).click();$(next).focus();
});
$('responsableLoginForm').addEventListener('submit',async e=>{
 e.preventDefault();if(entrandoResponsable||!e.target.reportValidity())return;
 const datos=obj(e.target);
 if(datos.usuario.trim().toUpperCase()!==datos.llave.trim().toUpperCase())return aviso('Escribe el mismo código en Usuario y Llave.',true);
 entrandoResponsable=true;botonCargando($('responsableLoginSubmit'),true,'Consultando...');
 try{
  const r=await api('/api/responsable/entrar',{method:'POST',body:JSON.stringify(datos)});
  mostrarResponsable(r.responsable);await cargarMisRegistros();
 }catch(err){aviso(err.message,true);}
 finally{entrandoResponsable=false;botonCargando($('responsableLoginSubmit'),false);}
});
function mostrarAdmin(u){
 sesionActiva='admin';view('loginVista',false);view('publico',false);view('responsableVista',false);view('adminVista',true);view('salir',true);
 $('bienvenida').textContent=`Bienvenido/a, ${u.nombre} ${u.apellido_paterno||''}`;
}
function mostrarResponsable(r){
 sesionActiva='responsable';view('loginVista',false);view('publico',false);view('adminVista',false);view('responsableVista',true);view('salir',true);
 $('responsableNombre').textContent=r.invitador_nombre;
 $('responsableEquipo').textContent=`Equipo: ${r.destinatario_nombre}`;
}
async function cargarMisRegistros(pagina=1,button=null){
 if(cargandoResponsable)return;
 cargandoResponsable=true;
 $('responsableAnterior').disabled=true;$('responsableSiguiente').disabled=true;
 if(button)botonCargando(button,true,'Cargando...');
 try{
  const r=await api(`/api/responsable/inscripciones?pagina=${pagina}`);
  paginaResponsable=r.pagina;totalPaginasResponsable=Math.max(1,Math.ceil(r.total/r.tamano));
  $('responsableTotal').textContent=String(r.total);
  $('responsablePagina').textContent=`Página ${paginaResponsable} de ${totalPaginasResponsable}`;
  const body=$('tablaResponsable');body.replaceChildren();
  for(const x of r.registros){
   const tr=document.createElement('tr');celda(tr,x.nombre_completo);celda(tr,new Date(x.creado_en).toLocaleString('es-MX'));
   celda(tr,`${String(x.distrito_numero).padStart(2,'0')} · ${x.cabecera}`);body.append(tr);
  }
  if(!r.registros.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=3;
   td.className='p-4 text-center text-slate-500';td.textContent='Aún no hay registros en esta página.';tr.append(td);body.append(tr);}
  ajustarPaneles();$('contenedorRegistrosResponsable').scrollTop=0;
 }finally{
  if(button)botonCargando(button,false);
  $('responsableAnterior').disabled=paginaResponsable<=1;
  $('responsableSiguiente').disabled=paginaResponsable>=totalPaginasResponsable;
  cargandoResponsable=false;
 }
}
$('responsableAnterior').addEventListener('click',e=>cargarMisRegistros(paginaResponsable-1,e.currentTarget).catch(err=>aviso(err.message,true)));
$('responsableSiguiente').addEventListener('click',e=>cargarMisRegistros(paginaResponsable+1,e.currentTarget).catch(err=>aviso(err.message,true)));
function mostrarPanel(id){
 for(const panel of ['panelGenerar','panelSeguimiento','panelMetricas'])view(panel,panel===id);
 document.querySelectorAll('.panel-tab').forEach(b=>{
  const active=b.dataset.panel===id;b.classList.toggle('active',active);
  if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
 });
 if(id==='panelSeguimiento')renderInscritos();
 ajustarPaneles();
}
document.querySelectorAll('.panel-tab').forEach(b=>b.addEventListener('click',()=>mostrarPanel(b.dataset.panel)));
$('salir').addEventListener('click',async()=>{
 if(saliendo)return;saliendo=true;botonCargando($('salir'),true,'Saliendo...');
 try{await api(sesionActiva==='responsable'?'/api/responsable/salir':'/api/auth/salir',{method:'POST'});location.href='/';}
 catch(e){aviso(e.message,true);saliendo=false;botonCargando($('salir'),false);}
});
async function cargarAdmin(filtro=null){
 const [stats,inv,totales]=await Promise.all([api('/api/admin/resumen'),api('/api/admin/invitaciones'),api('/api/admin/responsables')]);
 responsables=totales;renderMetricas();
 $('kpis').textContent=`Inscripciones: ${stats.registros} · Distritos con registros: ${stats.distritos} · Invitaciones: ${stats.invitaciones}`;
 const body=$('tablaInvitaciones');body.replaceChildren();
 for(const x of inv){
  let tr=document.createElement('tr');celda(tr,x.invitador_nombre);celda(tr,x.destinatario_nombre);celda(tr,x.inscritos);
  celda(tr,x.vence_en?new Date(x.vence_en).toLocaleDateString('es-MX',{timeZone:'America/Mexico_City'}):'—');
  const status=x.estado==='revocada'?'Revocada':x.estado==='agotada'?'Agotada':x.vence_en&&new Date(x.vence_en)<new Date()?'Vencida':'Activa';celda(tr,status);
  let actions=celda(tr,'');const group=document.createElement('div');group.className='invitation-actions';
  group.append(botonAccion('Ver','view',()=>cargarInscritos(x.id,x.invitador_nombre)),
   botonAccion('Editar','edit',()=>editarResponsable(x).catch(e=>aviso(e.message,true))));
  if(x.estado!=='revocada')group.append(botonAccion('Revocar','revoke',async()=>{
   if(!confirm('¿Revocar esta invitación? No se eliminarán registros existentes.'))return;
   try{await api(`/api/admin/invitaciones/${x.id}/revocar`,{method:'POST'});await cargarAdmin();}catch(e){aviso(e.message,true);}
  }));
  group.append(botonAccion('Eliminar','delete',()=>eliminarInvitacion(x).catch(e=>aviso(e.message,true))));
  actions.append(group);body.append(tr);
 }
 ajustarPaneles();
 await cargarInscritos(filtro?.id??null,filtro?.etiqueta??'');
}
async function cargarInscritos(id=null,etiqueta=''){
 try{
  inscripciones=await api('/api/admin/inscripciones'+(id?'?invitacion_id='+encodeURIComponent(id):''));
  filtroInscritos={id,etiqueta};
  $('tituloInscritos').textContent=id?`Registros · ${etiqueta}`:'Todos los registros';
  if(id)mostrarPanel('panelSeguimiento');
  renderInscritos();
  if(id)$('tablaInscritos').closest('.card').scrollIntoView({behavior:'smooth'});
 }catch(e){aviso(e.message,true);}
}
function renderMetricas(){
 const contenedor=$('metricasResponsables');contenedor.replaceChildren();
 const select=$('responsableReporte'),anterior=select.value;
 select.replaceChildren(new Option('Selecciona un responsable',''));
 const total=responsables.reduce((s,x)=>s+x.registros,0);
 if(!responsables.length){const p=document.createElement('p');p.textContent='Aún no hay responsables con invitaciones.';contenedor.append(p);}
 for(const x of responsables){
  select.add(new Option(x.nombre,x.nombre));
  const card=document.createElement('article');card.className='metrica-card';
  const ring=document.createElement('div');ring.className='metrica-ring';
  const porcentaje=total?Math.round(x.registros/total*100):0;
  ring.style.setProperty('--progress',`${porcentaje}%`);
  const percent=document.createElement('span');percent.textContent=`${porcentaje}%`;ring.append(percent);
  const title=document.createElement('h4');title.className='break-words';
  const abrirCodigos=document.createElement('button');abrirCodigos.type='button';abrirCodigos.className='metric-name-button';
  abrirCodigos.textContent=x.nombre;abrirCodigos.setAttribute('aria-label',`Ver códigos de invitación de ${x.nombre}`);
  abrirCodigos.addEventListener('click',()=>mostrarCodigosResponsable(x.nombre));title.append(abrirCodigos);
  const count=document.createElement('p');count.className='text-2xl font-extrabold';count.textContent=String(x.registros);
  const caption=document.createElement('p');caption.className='text-xs text-slate-500';caption.textContent=`registros · ${x.invitaciones} invitación(es)`;
  card.append(ring,title,count,caption);contenedor.append(card);
 }
 select.value=anterior;$('exportarResponsable').disabled=!select.value;
 ajustarPaneles();
}
async function mostrarCodigosResponsable(nombreResponsable){
 Swal.fire({...estiloDialogo,title:'Consultando invitaciones',
  html:'<p>Buscando los códigos de este responsable…</p>',showCancelButton:false,showConfirmButton:false,
  allowOutsideClick:false,allowEscapeKey:false,didOpen:()=>Swal.showLoading()});
 let invitaciones;
 try{invitaciones=await api('/api/admin/responsables/invitaciones?nombre='+encodeURIComponent(nombreResponsable));}
 catch(e){Swal.close();await Swal.fire({...estiloDialogo,title:'No se pudieron consultar los códigos',text:e.message,showCancelButton:false,confirmButtonText:'Cerrar'});return;}
 Swal.close();
 await Swal.fire({...estiloDialogo,title:'Códigos de invitación',showCancelButton:false,confirmButtonText:'Cerrar',
  html:'<span class="cots-dialog-eyebrow">Responsable</span><strong id="nombreCodigos" class="cots-dialog-name"></strong><div id="listaCodigos" class="codes-list"></div>',
  didOpen:()=>{
   $('nombreCodigos').textContent=nombreResponsable;
   const lista=$('listaCodigos');
   if(!invitaciones.length){const p=document.createElement('p');p.textContent='Este responsable no tiene invitaciones disponibles en el seguimiento.';lista.append(p);return;}
   for(const i of invitaciones){
    const card=document.createElement('article');card.className='codes-item';
    const equipo=document.createElement('strong');equipo.textContent=i.destinatario_nombre;
    const fecha=document.createElement('p');fecha.className='codes-meta';
    const estado=i.estado==='revocada'?'Revocada':i.estado==='agotada'?'Agotada':i.vence_en&&new Date(i.vence_en)<=new Date()?'Vencida':'Activa';
    fecha.textContent=`${estado} · Creada el ${new Date(i.creada_en).toLocaleDateString('es-MX')}`;
    card.append(equipo,fecha);
    if(i.codigo_invitacion){
     const code=document.createElement('code');code.className='codes-value';code.textContent=i.codigo_invitacion;
     const copiar=document.createElement('button');copiar.type='button';copiar.className='codes-copy';copiar.textContent='Copiar código';
     copiar.addEventListener('click',async()=>{
      try{await navigator.clipboard.writeText(i.codigo_invitacion);copiar.textContent='Copiado';}
      catch{copiar.textContent='Selecciona el código para copiarlo';}
     });card.append(code,copiar);
    }else{
     const p=document.createElement('p');p.className='codes-unavailable';p.textContent='Código no disponible: se generó antes de habilitar esta consulta.';
     const vincular=document.createElement('button');vincular.type='button';vincular.className='codes-copy';vincular.textContent='Tengo el código original';
     vincular.addEventListener('click',()=>{Swal.close();vincularCodigoExistente(i,nombreResponsable);});card.append(p,vincular);
    }
    lista.append(card);
   }
  }});
}
async function vincularCodigoExistente(invitacion,nombreResponsable){
 await Swal.fire({...estiloDialogo,title:'Vincular código existente',
  html:'<span class="cots-dialog-eyebrow">Sin cambiar la invitación</span><p>Escribe el código original de este equipo. Se comprobará antes de guardarlo cifrado.</p>',
  input:'text',inputPlaceholder:'XXXX-XXXX-XXXX-XXXX',
  inputAttributes:{maxlength:'19',autocomplete:'off','aria-label':'Código original de invitación'},
  confirmButtonText:'Verificar y guardar',showLoaderOnConfirm:true,
  preConfirm:async value=>{
   const codigo_invitacion=value.trim().toUpperCase();
   if(!/^[0-9A-F]{4}(?:-[0-9A-F]{4}){3}$/.test(codigo_invitacion)){
    Swal.showValidationMessage('Escribe el código completo con guiones.');return false;
   }
   try{return await api(`/api/admin/invitaciones/${invitacion.id}/vincular-codigo`,{method:'POST',body:JSON.stringify({codigo_invitacion})});}
   catch(e){Swal.showValidationMessage(e.message);return false;}
  }});
 await mostrarCodigosResponsable(nombreResponsable);
}
window.addEventListener('resize',ajustarPaneles);
document.fonts?.ready.then(ajustarPaneles);
$('responsableReporte').addEventListener('change',e=>{$('exportarResponsable').disabled=!e.target.value;});
async function descargarExcel(button,responsable){
 botonCargando(button,true,'Preparando Excel...');
 try{
  const query=responsable?'?responsable='+encodeURIComponent(responsable):'';
  const response=await fetch('/api/admin/reportes/inscripciones.xlsx'+query,{credentials:'same-origin'});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.error||'No se pudo generar el reporte');}
  const blob=await response.blob();const url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download=responsable?'reporte-responsable.xlsx':'reporte-general.xlsx';
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 }catch(e){aviso(e.message,true);}finally{botonCargando(button,false);}
}
$('exportarGeneral').addEventListener('click',()=>descargarExcel($('exportarGeneral')));
$('exportarResponsable').addEventListener('click',()=>descargarExcel($('exportarResponsable'),$('responsableReporte').value));
function valorInscrito(x,col){
 if(col==='nombre')return nombre(x);
 if(col==='referente')return nombre(x,'referente_');
 return x[col]??'';
}
function celdaFicha(row,value){const td=document.createElement('td');td.textContent=value==null?'':String(value);row.append(td);}
function mesAnio(value){return value?`${value.slice(5,7)}/${value.slice(0,4)}`:'';}
function nombreArchivoFicha(value){
 const nombreLimpio=String(value||'').replace(/[<>:"/\\|?*\u0000-\u001F]/g,'').replace(/\s+/g,' ').trim().replace(/[. ]+$/,'');
 return `Ficha curricular - ${nombreLimpio||'Registro'}`.slice(0,180);
}
async function verFichaAdmin(x,button){
 if(fichaAdminCargando)return;
 fichaAdminCargando=true;botonCargando(button,true,'Abriendo...');
 try{
  const data=await api(`/api/admin/inscripciones/${x.id}/ficha`),r=data.registro;
  const sheet=document.querySelector('#confirmPreviewPane .curriculum-sheet').cloneNode(true);
  const nombreRow=sheet.querySelector('#confirmPreviewNombre');nombreRow.replaceChildren();
  [r.nombre,r.apellido_paterno,r.apellido_materno].forEach(value=>celdaFicha(nombreRow,value));
  const experiencias=sheet.querySelector('#confirmPreviewExperiencias');experiencias.replaceChildren();
  for(let i=0;i<5;i++){
   const row=document.createElement('tr'),e=data.experiencias[i];
   celdaFicha(row,e?.puesto);celdaFicha(row,e?.institucion);
   celdaFicha(row,e?.periodo_inicio?`${mesAnio(e.periodo_inicio)} — ${e.periodo_fin?mesAnio(e.periodo_fin):'actualidad'}`:'');
   experiencias.append(row);
  }
  const formacion=sheet.querySelector('#confirmPreviewFormacion');formacion.replaceChildren();
  celdaFicha(formacion,r.nivel_estudios);celdaFicha(formacion,r.estatus_estudios);
  const cursos=sheet.querySelector('#confirmPreviewCursos');cursos.replaceChildren();celdaFicha(cursos,r.cursos);
  const photo=sheet.querySelector('#confirmPreviewFoto');
  const fotoPredeterminada='/assests/ficha-foto-placeholder.png';
  photo.width=96;photo.height=96;
  photo.alt=r.tiene_foto?`Fotografía de ${nombre(r)}`:'Espacio para fotografía';
  photo.src=r.tiene_foto?`/api/admin/inscripciones/${x.id}/foto`:fotoPredeterminada;
  try{await photo.decode();}catch{
   photo.src=fotoPredeterminada;photo.alt='Espacio para fotografía';
   await photo.decode().catch(()=>{});
  }
  sheet.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
  $('adminFichaTitulo').textContent=`Ficha curricular · ${nombre(r)}`;
  $('adminFichaEstado').textContent=r.tiene_ficha?'Ficha guardada':'Ficha complementaria pendiente';
  $('adminFichaContenido').replaceChildren(sheet);
  $('adminPrintFicha').replaceChildren(sheet.cloneNode(true));
  $('adminPrintFicha').dataset.nombreArchivo=nombreArchivoFicha(nombre(r));
  $('adminFichaDialog').showModal();
 }catch(e){aviso(e.message,true);}finally{fichaAdminCargando=false;botonCargando(button,false);}
}
$('adminFichaImprimir').addEventListener('click',()=>{
 const printArea=$('adminPrintFicha');if(!printArea.firstElementChild)return;
 const tituloAnterior=document.title;
 let restaurado=false;
 const restaurarTitulo=()=>{
  if(restaurado)return;restaurado=true;document.title=tituloAnterior;
  window.removeEventListener('afterprint',restaurarTitulo);window.removeEventListener('focus',restaurarTitulo);
 };
 document.title=printArea.dataset.nombreArchivo||'Ficha curricular';
 window.addEventListener('afterprint',restaurarTitulo,{once:true});
 window.addEventListener('focus',restaurarTitulo,{once:true});
 try{window.print();}catch(e){restaurarTitulo();aviso('No fue posible abrir la impresión.',true);}
});
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
   celda(tr,new Date(x.creado_en).toLocaleString('es-MX'));
   const acciones=celda(tr,'');const ver=botonAccion('Ver','view',e=>verFichaAdmin(x,e.currentTarget));
   ver.setAttribute('aria-label',`Ver ficha curricular de ${nombre(x)}`);
   const eliminar=botonAccion('Eliminar','delete',()=>eliminarInscripcion(x).catch(e=>aviso(e.message,true)));
   eliminar.setAttribute('aria-label',`Eliminar inscripción de ${nombre(x)}`);acciones.append(ver,eliminar);body.append(tr);}
 if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=8;td.className='p-4 text-center text-slate-500';td.textContent='No hay inscripciones para mostrar.';tr.append(td);body.append(tr);}
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
  const box=$('enlaceCreado');box.replaceChildren();const label=document.createElement('p');label.textContent='Copia el enlace y el código. También puedes consultar el código en Métricas y reportes.';
  const a=document.createElement('a');a.href=j.url;a.textContent=j.url;a.className='block font-semibold text-guinda underline my-3';a.rel='noreferrer';
  const code=document.createElement('div');code.className='font-mono font-extrabold text-lg';code.textContent='Código: '+j.codigo_invitacion;
  box.append(label,a,code);await cargarAdmin();aviso('Invitación generada correctamente.');
 }catch(err){aviso(err.message,true);}finally{generandoInvitacion=false;botonCargando($('generarInvitacion'),false);}
});
(async()=>{
 if(esConfirmacion){view('confirmacionVista',true);return;}
 if(esUrlPublicaFija){view('inviteDisabledVista',true);return;}
 if(tokenInvitacion){await inicioPublico();return;}
 try{
  const r=await api('/api/auth/estado');
  if(r.tipo==='admin'){mostrarAdmin(r.usuario);await cargarAdmin();}
  else if(r.tipo==='responsable'){mostrarResponsable(r.responsable);await cargarMisRegistros();}
  else view('loginVista',true);
 }catch(e){if(sesionActiva)aviso(e.message,true);else view('loginVista',true);}
})();
