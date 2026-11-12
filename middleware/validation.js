'use strict';
const {z}=require('zod');
const texto=z.string().trim().min(1).max(100);
const apellido=z.string().trim().max(100).optional().nullable().default('');
const correo=z.string().trim().email().max(254).transform(s=>s.toLowerCase());
const telefono=z.string().trim().regex(/^[0-9+()\s-]{7,20}$/,'Teléfono no válido');
const persona=z.object({nombre:texto,apellido_paterno:texto,apellido_materno:apellido});
const registro=persona.extend({
  edad:z.union([z.coerce.number().int().min(0).max(120),z.literal(''),z.null()]).optional().transform(v=>v===''?null:v),
  telefono, correo_electronico:z.union([correo,z.literal(''),z.null()]).optional().transform(v=>v||null),
  distrito_numero:z.coerce.number().int().min(1).max(40),
  seccion_electoral:z.string().trim().regex(/^\d{1,10}$/,'Sección: solo dígitos'),
  referente_id:z.coerce.number().int().positive()
});
const capturista=persona.extend({telefono,correo_electronico:correo,token:z.string().regex(/^[a-f0-9]{64}$/),codigo_invitacion:z.string().trim().regex(/^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$/i)});
const referente=persona;
function parse(schema) {
 return (req, res, next) => {
  const data = schema.safeParse(req.body);
  if (!data.success) {
   return res.status(400).json({
    error: 'Datos inválidos',
    detalles: data.error.issues.map(x => `${x.path.join('.')}: ${x.message}`)
   });
  }
  req.valid = data.data;
  next();
 };
}
module.exports={z,correo,persona,capturista,registro,referente,parse};
