'use strict';
const { pool } = require('../config/database');
const { hashToken } = require('../utils');
async function auth(req, res, next) {
 try {
  const token = req.cookies.cots_sid;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return res.status(401).json({error:'Acceso requerido'});
  const { rows } = await pool.query(`SELECT u.id,u.nombre,u.apellido_paterno,u.apellido_materno,u.correo_electronico,u.rol,u.estado
    FROM sesiones s JOIN usuarios u ON u.id=s.usuario_id
    WHERE s.token_hash=$1 AND s.revocada_en IS NULL AND s.vence_en>now() AND u.estado='activo'`, [hashToken(token)]);
  if (!rows.length) return res.status(401).json({error:'Sesión inválida o vencida'});
  req.usuario = rows[0]; next();
 } catch (e) { next(e); }
}
function admin(req,res,next) { if(req.usuario.rol!=='admin') return res.status(403).json({error:'Permiso denegado'}); next(); }
module.exports={auth,admin};
