'use strict';
// Limitador sencillo por proceso. Para múltiples instancias sustituir por limitador compartido.
const bucket=new Map();
function limit({max=10,windowMs=900000}={}) {
 return (req,res,next)=>{
  const now=Date.now(), ip=req.ip||'unknown';
  const key=ip+':'+req.path;
  const entry=bucket.get(key);
  if(!entry || now-entry.since>windowMs) {bucket.set(key,{since:now,count:1});return next();}
  if(++entry.count>max) return res.status(429).json({error:'Demasiados intentos. Intenta más tarde.'});
  next();
 };
}
setInterval(()=>{const now=Date.now();for(const [k,v] of bucket)if(now-v.since>3600000)bucket.delete(k);},3600000).unref();
module.exports={limit};
