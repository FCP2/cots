'use strict';
require('dotenv').config();
const path=require('path'),express=require('express'),helmet=require('helmet'),cookieParser=require('cookie-parser');
const {pool}=require('./config/database');
const app=express();app.disable('x-powered-by');
// En desarrollo ngrok se conecta desde loopback; permite limitar solicitudes por IP real.
app.set('trust proxy','loopback');
if(process.env.NODE_ENV==='production') {
 if(process.env.COOKIE_SECURE!=='true'||!String(process.env.APP_URL).startsWith('https://')) throw new Error('Producción requiere COOKIE_SECURE=true y APP_URL=https://...');
 app.set('trust proxy',1);
}
app.use(helmet({contentSecurityPolicy:{directives:{
 defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","https://fonts.googleapis.com"],
 fontSrc:["'self'","https://fonts.gstatic.com"],imgSrc:["'self'",'data:'],connectSrc:["'self'"],objectSrc:["'none'"],frameAncestors:["'none'"]
}}}));
app.use(express.json({limit:'48kb'}));app.use(cookieParser());
// Anti-CSRF: origen obligatorio para operaciones de escritura desde navegador.
app.use('/api',(req,res,next)=>{
 if(['POST','PUT','PATCH','DELETE'].includes(req.method)){
  const origin=req.get('origin');
  if(!origin||origin!==process.env.APP_URL?.replace(/\/$/,''))return res.status(403).json({error:'Origen no autorizado'});
 }
 next();
});
app.get('/vendor/sweetalert2.min.css',(_req,res)=>res.sendFile(path.join(__dirname,'node_modules/sweetalert2/dist/sweetalert2.min.css')));
app.get('/vendor/sweetalert2.min.js',(_req,res)=>res.sendFile(path.join(__dirname,'node_modules/sweetalert2/dist/sweetalert2.min.js')));
app.use(express.static(path.join(__dirname,'public'),{index:'index.html',extensions:false}));
app.get('/api/salud',async(req,res,next)=>{try{await pool.query('SELECT 1');res.json({ok:true});}catch(e){next(e);}});
app.use('/api/auth',require('./routes/auth'));
app.use('/api/public',require('./routes/publico'));
app.use('/api/admin',require('./routes/admin'));
app.use((req,res)=>res.status(404).json({error:'Ruta no encontrada'}));
app.use((err,req,res,next)=>{
 if(err.code==='23505')return res.status(409).json({error:'No se pudo completar el registro. Contacta al responsable.'});
 if(err.code==='23503')return res.status(400).json({error:'El distrito seleccionado no está disponible'});
 if(err.code==='23514'||err.code==='22P02')return res.status(400).json({error:'Valores no válidos'});
 console.error(err);
 res.status(500).json({error:'Error interno. Comunica el incidente al administrador.'});
});
const port=Number(process.env.PORT)||3000;
app.listen(port,'0.0.0.0',()=>console.log(`COTS escuchando en puerto ${port} | UTF-8`));
