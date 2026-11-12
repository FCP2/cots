'use strict';
require('dotenv').config();
const {pool}=require('../config/database');const {token,hashToken}=require('../utils');
(async()=>{
 const [,,nombre,ap,correo,telefono='0000000000']=process.argv;
 if(!nombre||!ap||!correo)throw new Error('Uso: npm run crear-admin -- "Nombre" "Apellido" "correo@dominio.mx" "5512345678"');
 const clave=token();
 const r=await pool.query(`INSERT INTO usuarios(nombre,apellido_paterno,telefono,correo_electronico,llave_hash,rol)
  VALUES($1,$2,$3,lower($4),$5,'admin') RETURNING id`,[nombre,ap,telefono,correo,hashToken(clave)]);
 console.log(`ADMIN CREADO | ID ${r.rows[0].id}\nCORREO: ${correo.toLowerCase()}\nLLAVE (mostrar una vez): ${clave}\nGuárdala fuera del proyecto.`);
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
