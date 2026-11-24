'use strict';
if(new URLSearchParams(location.search).get('confirmar')==='registro'){
 const el=id=>document.getElementById(id);
 let codigo='',registro=null,experiencias=[],fotoUrl=null,busy=false,modo='existente',permiteNuevo=false,nuevoIniciado=false,distritos=[];
 const panes=['confirmCodigoPane','confirmIdentidadPane','confirmFichaPane'];
 function message(value,error=false){const box=el('confirmMessage');box.textContent=value;box.classList.toggle('hidden',!value);box.classList.toggle('is-error',error);if(value)box.scrollIntoView({block:'nearest'});}
 function step(n){panes.forEach((id,i)=>el(id).classList.toggle('hidden',i!==n));[1,2,3].forEach((v)=>el(`confirmStep${v}`).classList.toggle('active',v===n+1));el('confirmSteps').classList.remove('hidden');el('confirmSuccessPane').classList.add('hidden');el('confirmPreviewPane').classList.add('hidden');message('');}
 async function request(url,opts={}){const res=await fetch(url,{credentials:'same-origin',cache:'no-store',...opts});const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||'No se pudo completar la solicitud.');return data;}
 async function json(url,body,method='POST'){return request(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
 function loading(button,on,label='Procesando...'){
  if(on){button.dataset.original=button.textContent;button.disabled=true;button.setAttribute('aria-busy','true');button.replaceChildren();const spinner=document.createElement('span');spinner.className='loader';spinner.setAttribute('aria-hidden','true');button.append(spinner,document.createTextNode(' '+label));}
  else{button.disabled=false;button.removeAttribute('aria-busy');button.textContent=button.dataset.original||button.textContent;delete button.dataset.original;}
 }
 function field(label,value,root){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value===null||value===undefined||value===''?'No proporcionado':String(value);root.append(dt,dd);}
 function displayData(root){root.replaceChildren();const r=registro;
  field('Nombre completo',[r.nombre,r.apellido_paterno,r.apellido_materno].filter(Boolean).join(' '),root);
  field('Distrito federal',r.distrito_numero&&r.cabecera?`${r.distrito_numero} · ${r.cabecera}`:'',root);
  field('Sección electoral',r.seccion_electoral,root);
 }
 function input(label,type,value,required=false){const wrap=document.createElement('label');wrap.textContent=label;const control=document.createElement('input');control.type=type;control.className='field';control.value=value||'';control.required=required;if(type==='text')control.maxLength=150;wrap.append(control);return {wrap,control};}
 function renderExperiences(){const box=el('confirmExperiencias');box.replaceChildren();experiencias.forEach((exp,index)=>{
  const row=document.createElement('div');row.className='confirm-experience';
  const heading=document.createElement('div');heading.className='confirm-heading';const title=document.createElement('h3');title.textContent=`Experiencia ${index+1}`;
  const remove=document.createElement('button');remove.type='button';remove.className='confirm-remove';remove.textContent='Eliminar';remove.addEventListener('click',()=>{experiencias.splice(index,1);renderExperiences();updateVisiblePreview();});heading.append(title,remove);
  const grid=document.createElement('div');grid.className='confirm-grid';
  for(const [key,label,type,required] of [['puesto','Puesto','text',true],['institucion','Institución','text',true],['periodo_inicio','Inicio (mes/año)','month',true],['periodo_fin','Fin (mes/año, opcional)','month',false]]){
   const item=input(label,type,exp[key],required);item.control.addEventListener('input',()=>{exp[key]=item.control.value;});grid.append(item.wrap);
  }
  row.append(heading,grid);box.append(row);
 });el('confirmAgregarExperiencia').disabled=experiencias.length>=5;
 }
 function dataFromForm(){const f=el('confirmFichaForm'),fd=new FormData(f);
  return {nivel_estudios:fd.get('nivel_estudios'),otro_nivel:fd.get('otro_nivel')||'',estatus_estudios:fd.get('estatus_estudios'),cursos:fd.get('cursos')||'',experiencias:experiencias.map(x=>({puesto:x.puesto.trim(),institucion:x.institucion.trim(),periodo_inicio:x.periodo_inicio,periodo_fin:x.periodo_fin||null}))};
 }
 function nuevoRegistro(){const f=el('confirmFichaForm'),fd=new FormData(f),data={};
  for(const key of ['nombre','apellido_paterno','apellido_materno','curp','edad','telefono','correo_electronico','distrito_numero','seccion_electoral','referente_nombre','referente_apellido_paterno','referente_apellido_materno'])data[key]=String(fd.get(key)||'').trim();
  data.curp=data.curp.toUpperCase();return data;
 }
 function actualizarRegistroNuevo(){if(modo!=='nuevo')return;const r=nuevoRegistro(),d=distritos.find(x=>String(x.numero)===r.distrito_numero);
  registro={...r,cabecera:d?.cabecera||'',tiene_foto:false};
  el('confirmNuevoDistritoTexto').textContent=d?`${d.numero} · ${d.cabecera}`:'';
 }
 function configurarModo(nuevo){modo=nuevo?'nuevo':'existente';const fields=el('confirmNuevoFields');
  fields.disabled=!nuevo;fields.classList.toggle('hidden',!nuevo);
  el('confirmDatosCard').classList.toggle('hidden',nuevo);
  el('confirmVolverIdentidad').classList.toggle('hidden',!nuevo);
  el('confirmFichaHeading').textContent=nuevo?'Nuevo registro y ficha curricular':'Información complementaria';
  el('confirmStep3').textContent=nuevo?'03 · Nuevo registro y ficha':'03 · Ficha y vista previa';
  el('confirmGuardar').textContent=nuevo?'Registrar y guardar ficha':'Guardar mi ficha';
 }
 async function cargarDistritos(){if(distritos.length)return;distritos=await request('/api/public/distritos');
  const select=el('confirmNuevoDistrito');select.replaceChildren(new Option('Selecciona un distrito',''));
  distritos.forEach(d=>select.add(new Option(`${d.numero} · ${d.cabecera}`,d.numero)));
 }
 function validForm(){const f=el('confirmFichaForm');if(!f.reportValidity())return false;
  if(modo==='nuevo'){
   const r=nuevoRegistro();
   if(r.curp&&!/^[A-Z][AEIOUX][A-Z]{2}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[HM][A-Z]{5}[A-Z0-9]\d$/.test(r.curp)){
    message('La CURP debe tener 18 caracteres y un formato válido, o dejarse vacía.',true);f.elements.curp.focus();return false;
   }
  }
  const p=dataFromForm();if(p.nivel_estudios==='otro'&&!p.otro_nivel.trim()){el('confirmOtroNivel').focus();message('Especifica el nivel de estudios.',true);return false;}
  if(p.experiencias.some(x=>x.periodo_fin&&x.periodo_fin<x.periodo_inicio)){message('El fin de una experiencia no puede ser anterior al inicio.',true);return false;}
  return true;
 }
 function showPhoto(){const img=el('confirmFotoPreview'),box=el('confirmFotoBox');if(fotoUrl){URL.revokeObjectURL(fotoUrl);fotoUrl=null;}
  const file=el('confirmFoto').files[0];if(file){fotoUrl=URL.createObjectURL(file);img.src=fotoUrl;box.classList.remove('hidden');}
  else if(registro?.tiene_foto){img.src='/api/confirmacion/foto';box.classList.remove('hidden');}
  else{img.removeAttribute('src');box.classList.add('hidden');}
 }
 function previewCell(row,value){const cell=document.createElement('td');cell.textContent=value==null?'':String(value);row.append(cell);}
 function monthYear(value){return value?`${value.slice(5,7)}/${value.slice(0,4)}`:'';}
 function renderPreview(){if(modo==='nuevo')actualizarRegistroNuevo();const p=dataFromForm();
  const nombre=el('confirmPreviewNombre');nombre.replaceChildren();
  [registro.nombre,registro.apellido_paterno,registro.apellido_materno].forEach(value=>previewCell(nombre,value));
  const body=el('confirmPreviewExperiencias');body.replaceChildren();
  for(let i=0;i<5;i++){
   const row=document.createElement('tr'),x=p.experiencias[i];
   previewCell(row,x?.puesto);previewCell(row,x?.institucion);
   previewCell(row,x?.periodo_inicio?`${monthYear(x.periodo_inicio)} — ${x.periodo_fin?monthYear(x.periodo_fin):'actualidad'}`:monthYear(x?.periodo_fin));
   body.append(row);
  }
  const formacion=el('confirmPreviewFormacion');formacion.replaceChildren();
  previewCell(formacion,p.nivel_estudios==='otro'?p.otro_nivel:p.nivel_estudios);previewCell(formacion,p.estatus_estudios);
  const cursos=el('confirmPreviewCursos');cursos.replaceChildren();previewCell(cursos,p.cursos);
  const photo=el('confirmPreviewFoto'),source=el('confirmFotoPreview');
  photo.src=source.hasAttribute('src')?source.src:'/assests/ficha-foto-placeholder.png';
  photo.alt=source.hasAttribute('src')?'Fotografía de la ficha':'Espacio para fotografía';
 }
 function updateVisiblePreview(){if(modo==='nuevo')actualizarRegistroNuevo();if(registro&&!el('confirmPreviewPane').classList.contains('hidden'))renderPreview();}
 function preview(){renderPreview();
  el('confirmPreviewPane').classList.remove('hidden');el('confirmPreviewPane').scrollIntoView({block:'start',behavior:'smooth'});
 }
 async function loadFicha({preservarFoto=false}={}){const data=await request('/api/confirmacion/ficha');if(modo==='nuevo'&&!preservarFoto)el('confirmFoto').value='';nuevoIniciado=false;configurarModo(false);registro=data.registro;experiencias=data.experiencias.map(x=>({...x}));displayData(el('confirmDatos'));
  const niveles=['primaria','secundaria','preparatoria','bachillerato','licenciatura','maestría','doctorado'];
  el('confirmNivel').value=niveles.includes(registro.nivel_estudios)?registro.nivel_estudios:registro.nivel_estudios?'otro':'';
  el('confirmOtroNivel').value=el('confirmNivel').value==='otro'?registro.nivel_estudios:'';
  el('confirmFichaForm').elements.estatus_estudios.value=registro.estatus_estudios||'';
  el('confirmCursos').value=registro.cursos||'';el('confirmNivel').dispatchEvent(new Event('change'));
  renderExperiences();showPhoto();step(2);
 }
 function limpiarRegistroNuevo(){
  el('confirmCodigoForm').reset();el('confirmIdentidadForm').reset();el('confirmFichaForm').reset();
  codigo='';registro=null;experiencias=[];permiteNuevo=false;nuevoIniciado=false;
  configurarModo(false);el('confirmNivel').dispatchEvent(new Event('change'));renderExperiences();showPhoto();
  el('confirmDatos').replaceChildren();el('confirmResponsable').textContent='';el('confirmEquipo').textContent='';
  for(const id of ['confirmPreviewNombre','confirmPreviewExperiencias','confirmPreviewFormacion','confirmPreviewCursos'])el(id).replaceChildren();
  el('confirmPreviewFoto').src='/assests/ficha-foto-placeholder.png';el('confirmNuevoDistritoTexto').textContent='';
  el('confirmPreviewPane').classList.add('hidden');message('');
 }
 function mostrarRegistroGuardado(){
  panes.forEach(id=>el(id).classList.add('hidden'));
  el('confirmSteps').classList.add('hidden');el('confirmSuccessPane').classList.remove('hidden');
  el('confirmSuccessPane').scrollIntoView({block:'start',behavior:'smooth'});
 }
 el('confirmCodigoForm').addEventListener('submit',async e=>{e.preventDefault();if(busy||!e.target.reportValidity())return;
  busy=true;const button=e.target.querySelector('button[type=submit]');loading(button,true);
  try{codigo=el('confirmCodigo').value.trim().toUpperCase();const inv=await json('/api/confirmacion/codigo',{codigo_invitacion:codigo});el('confirmResponsable').textContent=inv.responsable;el('confirmEquipo').textContent=inv.equipo;
   permiteNuevo=inv.permite_nuevo;el('confirmNuevo').classList.toggle('hidden',!permiteNuevo);el('confirmNuevoNoDisponible').classList.toggle('hidden',permiteNuevo);step(1);}
  catch(err){message(err.message,true);}finally{busy=false;loading(button,false);}
 });
 el('confirmCambiarCodigo').addEventListener('click',()=>{codigo='';nuevoIniciado=false;permiteNuevo=false;step(0);});
 el('confirmIdentidadForm').addEventListener('submit',async e=>{e.preventDefault();if(busy||!e.target.reportValidity())return;
  const identidad=Object.fromEntries(new FormData(e.target));if(!identidad.seccion_electoral&&!identidad.telefono){message('Escribe tu sección electoral o, si tu registro no tiene sección, tu teléfono registrado.',true);return;}
  busy=true;const button=e.target.querySelector('button[type=submit]');loading(button,true);
  try{await json('/api/confirmacion/identificar',{codigo_invitacion:codigo,...identidad});await loadFicha();}
  catch(err){message(err.message,true);}finally{busy=false;loading(button,false);}
 });
 el('confirmNuevo').addEventListener('click',async()=>{if(busy||!permiteNuevo)return;busy=true;loading(el('confirmNuevo'),true,'Preparando...');
  try{await cargarDistritos();configurarModo(true);
   if(!nuevoIniciado){el('confirmFichaForm').reset();el('confirmNivel').dispatchEvent(new Event('change'));experiencias=[];renderExperiences();nuevoIniciado=true;}
   actualizarRegistroNuevo();showPhoto();step(2);
  }catch(err){message(err.message,true);}finally{busy=false;loading(el('confirmNuevo'),false);}
 });
 el('confirmVolverIdentidad').addEventListener('click',()=>{if(!busy)step(1);});
 el('confirmNivel').addEventListener('change',()=>{const other=el('confirmNivel').value==='otro';el('confirmOtroNivelLabel').classList.toggle('hidden',!other);el('confirmOtroNivel').required=other;});
 el('confirmAgregarExperiencia').addEventListener('click',()=>{if(experiencias.length>=5)return;experiencias.push({puesto:'',institucion:'',periodo_inicio:'',periodo_fin:null});renderExperiences();updateVisiblePreview();});
 el('confirmFoto').addEventListener('change',()=>{const file=el('confirmFoto').files[0];if(file&&(file.size>2*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))){el('confirmFoto').value='';message('Selecciona una foto JPG, PNG o WebP de hasta 2 MB.',true);}showPhoto();updateVisiblePreview();});
 el('confirmRevisar').addEventListener('click',preview);
 el('confirmCerrarPreview').addEventListener('click',()=>el('confirmPreviewPane').classList.add('hidden'));
 el('confirmOtroRegistro').addEventListener('click',()=>{step(0);el('confirmCodigo').focus();});
 for(const campo of ['nombre','apellido_paterno','apellido_materno']){
  el('confirmFichaForm').elements[campo].addEventListener('input',e=>{
   const noPermitidos=campo==='nombre'?/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ.'’ ]/g:/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’ ]/g;
   e.target.value=e.target.value.replace(noPermitidos,'');
  });
 }
 el('confirmFichaForm').elements.seccion_electoral.addEventListener('input',e=>{e.target.value=e.target.value.replace(/\D/g,'').slice(0,4);});
 el('confirmFichaForm').addEventListener('input',updateVisiblePreview);
 el('confirmFichaForm').addEventListener('change',updateVisiblePreview);
 el('confirmFichaForm').addEventListener('submit',async e=>{e.preventDefault();if(busy||!validForm())return;
  const file=el('confirmFoto').files[0];if(!registro.tiene_foto&&!file){message('Selecciona una fotografía para completar tu ficha.',true);el('confirmFoto').focus();return;}
  busy=true;const button=el('confirmGuardar');loading(button,true,'Guardando...');
  let creado=false,guardadoNuevo=false;
  try{
   if(modo==='nuevo'){
    await json('/api/confirmacion/nuevo',{codigo_invitacion:codigo,registro:nuevoRegistro(),ficha:dataFromForm()});creado=true;
   }else await json('/api/confirmacion/ficha',dataFromForm(),'PUT');
   if(file)await request('/api/confirmacion/foto',{method:'PUT',headers:{'Content-Type':file.type},body:file});
   if(creado){await json('/api/confirmacion/salir',{}).catch(()=>{});guardadoNuevo=true;}
   else{el('confirmFoto').value='';await loadFicha();message('Ficha guardada correctamente. Puedes revisarla o actualizarla desde aquí.');}
  }catch(err){
   if(creado){await loadFicha({preservarFoto:true}).catch(()=>{});message(`El registro y la ficha se guardaron, pero la fotografía sigue pendiente: ${err.message} Intenta guardarla de nuevo.`,true);}
   else message(err.message,true);
  }
  finally{busy=false;loading(button,false);}
  if(guardadoNuevo){limpiarRegistroNuevo();mostrarRegistroGuardado();}
 });
 el('confirmSalir').addEventListener('click',async()=>{if(busy)return;try{await json('/api/confirmacion/salir',{});}catch{}registro=null;codigo='';nuevoIniciado=false;el('confirmCodigoForm').reset();el('confirmIdentidadForm').reset();step(0);});
 request('/api/confirmacion/ficha').then(()=>loadFicha()).catch(()=>step(0));
}
