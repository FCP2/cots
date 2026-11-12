'use strict';
// Solo el administrador accede con correo y llave personal.
const express=require('express');
const {z}=require('zod');
const crypto=require('crypto');
const {pool}=require('../config/database');
const {auth,admin}=require('../middleware/auth');
const {limit}=require('../middleware/limiter');
const {token,hashToken}=require('../utils');
const router=express.Router();
const cookieConfig=()=>({httpOnly:true,secure:process.env.COOKIE_SECURE==='true',sameSite:'strict',path:'/'});
router.post('/entrar',limit({max:8}),async(req,res,next)=>{
 const parsed=z.object({correo_electronico:z.string().trim().email().transform(s=>s.toLowerCase()),llave:z.string().regex(/^[a-f0-9]{64}$/)}).safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:'Credenciales inválidas'});
 const c=await pool.connect();
 try{
  const {rows}=await c.query(`SELECT id,nombre,apellido_paterno,rol,estado,llave_hash FROM usuarios
    WHERE lower(btrim(correo_electronico))=$1 AND rol='admin'`,[parsed.data.correo_electronico]);
  const u=rows[0], a=Buffer.from(hashToken(parsed.data.llave),'hex');
  const b=Buffer.from(u?.llave_hash||'0'.repeat(64),'hex');
  if(!u||u.estado!=='activo'||!crypto.timingSafeEqual(a,b))return res.status(401).json({error:'Correo o llave incorrectos'});
  const raw=token(),days=Math.min(7,Math.max(1,Number(process.env.SESSION_DAYS)||7));
  await c.query(`INSERT INTO sesiones(token_hash,usuario_id,vence_en) VALUES($1,$2,now()+($3::int*interval '1 day'))`,[hashToken(raw),u.id,days]);
  await c.query('UPDATE usuarios SET ultimo_acceso=now() WHERE id=$1',[u.id]);
  res.cookie('cots_sid',raw,{...cookieConfig(),maxAge:days*86400000});
  res.json({usuario:{id:u.id,nombre:u.nombre,apellido_paterno:u.apellido_paterno,rol:u.rol}});
 }catch(e){next(e);}finally{c.release();}
});
router.get('/yo',auth,admin,(req,res)=>res.json({usuario:req.usuario}));
router.post('/salir',auth,admin,async(req,res,next)=>{
 try{await pool.query('UPDATE sesiones SET revocada_en=now() WHERE token_hash=$1',[hashToken(req.cookies.cots_sid)]);
  res.clearCookie('cots_sid',cookieConfig());res.json({ok:true});}catch(e){next(e);}
});
module.exports=router;
