'use strict';
const {z}=require('zod');
const correo=z.string().trim().email().max(254).transform(v=>v.toLowerCase());
const txt=z.string().trim().min(1).max(100);
const opc=z.string().trim().max(100).default('');
const nombrePersona=txt.regex(/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ.'’ ]*$/);
const apellidoPersona=txt.regex(/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’ ]*$/);
const apellidoOpcional=z.string().trim().max(100).regex(/^(?:[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’ ]*)?$/).default('');
const form=z.object({
 token:z.string().regex(/^[a-f0-9]{64}$/).optional(),
 codigo_invitacion:z.string().trim().regex(/^[0-9A-F]{4}(?:-[0-9A-F]{4}){3}$/i).transform(s=>s.toUpperCase()),
 nombre:nombrePersona,apellido_paterno:apellidoPersona,apellido_materno:apellidoOpcional,
 curp:z.preprocess(v=>v===undefined||(typeof v==='string'&&!v.trim())?null:v,
  z.string().trim().toUpperCase().regex(/^[A-Z][AEIOUX][A-Z]{2}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[HM][A-Z]{5}[A-Z0-9]\d$/,'CURP no válida (18 caracteres)').nullable()),
 edad:z.preprocess(v=>typeof v==='number'?String(v):v,z.string().trim().regex(/^\d{2}$/).transform(Number)),
 telefono:z.string().regex(/^[0-9]{10}$/),
 correo_electronico:correo,
 distrito_numero:z.coerce.number().int().min(1).max(40),
 seccion_electoral:z.string().regex(/^\d{4}$/),
 referente_nombre:txt,referente_apellido_paterno:txt,referente_apellido_materno:opc
}).strict();
module.exports={inscripcionSchema:form,datosInscripcionSchema:form.omit({token:true,codigo_invitacion:true})};
