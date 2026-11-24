'use strict';
const {pool}=require('../config/database');
const {hashToken}=require('../utils');

async function responsable(req,res,next){
 const raw=req.cookies?.cots_sid;
 if(!raw||!/^[a-f0-9]{64}$/.test(raw))return res.status(401).json({error:'Acceso requerido'});
 try{
  const {rows}=await pool.query(`SELECT i.id,i.invitador_nombre,i.destinatario_nombre
   FROM sesiones_responsables s JOIN invitaciones i ON i.id=s.invitacion_id
   WHERE s.token_hash=$1 AND s.revocada_en IS NULL AND s.vence_en>now()
    AND i.estado='pendiente' AND i.eliminado_en IS NULL
    AND (i.vence_en IS NULL OR i.vence_en>now())`,[hashToken(raw)]);
  if(!rows.length)return res.status(401).json({error:'Acceso vencido o revocado'});
  req.invitacion=rows[0];next();
 }catch(e){next(e);}
}
module.exports={responsable};
