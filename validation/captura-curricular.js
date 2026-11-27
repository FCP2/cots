'use strict';
const {z}=require('zod');
const {datosInscripcionSchema}=require('./inscripcion');
const opcional=regex=>z.preprocess(v=>v===undefined||v===null||(typeof v==='string'&&!v.trim())?null:v,
 z.string().trim().toUpperCase().regex(regex).nullable());
const registroCurricularSchema=datosInscripcionSchema.extend({
 rfc:opcional(/^[A-ZÑ&]{4}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/),
 homoclave:opcional(/^[A-Z0-9]{3}$/)
}).refine(v=>!v.homoclave||Boolean(v.rfc),{path:['rfc'],message:'Captura el RFC para agregar la homoclave.'});
const VERSION_CAPTURA='ficha_rfc_v1';
module.exports={registroCurricularSchema,VERSION_CAPTURA};
