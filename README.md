# PROPUESTA COTS · Registro individual por invitación

Proyecto **Node.js + Express + PostgreSQL + HTML5 + Tailwind CSS**. Codificación UTF-8 de extremo a extremo.

## Flujo vigente

1. **Solamente el administrador** entra con correo y llave personal.
2. Desde administración crea una invitación con responsable, equipo y días de vigencia.
3. Comparte **URL + código de invitación**. El responsable puede compartirlos entre los integrantes de su equipo, sin límite de participantes (hasta vencer o revocar el enlace).
4. Cada participante registra **solo sus propios datos**: nombre(s), apellidos, CURP, edad, teléfono, correo, distrito federal, sección electoral, referente (nombre y apellidos).
5. Presiona **Revisar mis datos**, revisa un resumen (CURP enmascarada) y selecciona **Confirmar y enviar**.
6. El servidor comprueba nuevamente la invitación, sus fechas, el código y la CURP única; guarda la inscripción atómicamente en PostgreSQL.
7. La pantalla muestra **¡REGISTRO EXITOSO! Tu información se ha registrado correctamente.** Sin folios y sin cuentas individuales.

## Actualizar una instalación EXISTENTE en PostgreSQL de Render

**Haz un respaldo de la base de datos antes de migrar.** El proyecto conserva la tabla `usuarios`, la llave del administrador, `invitaciones`, `invitaciones_usos`, `registros` y `referentes` antiguos. Las inscripciones del nuevo formulario se almacenan en una tabla nueva: `inscripciones`. **Los registros históricos no se convierten automáticamente** en inscripciones; permanecen para auditoría o migración posterior.

1. Extrae el ZIP y copia sus archivos a tu carpeta local, **sin sobrescribir `.env`**.
2. Conserva la `DATABASE_URL` externa de Render y los ajustes SSL que ya funcionan. No publiques `.env`.
3. En CMD, abre la carpeta del proyecto y ejecuta:

```cmd
chcp 65001
npm install
npm run db:migrate:inscripciones
npm run css:build
npm start
```

**No ejecutes `db:init`, `db:migrate:unlimited` ni `crear-admin` nuevamente.** La migración 04 crea `inscripciones` y permite invitaciones nuevas de uso ilimitado. Las invitaciones antiguas mantienen sus límites y reglas anteriores. La migración está diseñada para ejecutarse de manera repetible, sin recrear la BD; respalda antes de aplicar cambios.

Si `npm run db:migrate:inscripciones` falla, **no inicies la versión nueva** hasta resolverlo. El script lee `.env` y comprueba `server_encoding=UTF8`.

## ngrok

En una ventana ejecuta `npm start`. En otra, `ngrok http 3000`. Cambia en `.env`:

```env
APP_URL=https://TU_DOMINIO.ngrok-free.app
COOKIE_SECURE=true
```

Reinicia Node después de cambiar el `.env`. En Render utiliza `NODE_ENV=production`, `APP_URL` HTTPS y `COOKIE_SECURE=true`.

**Nunca compartas la URL de conexión a PostgreSQL, la llave admin ni la contraseña**. La URL y el código de invitación deben distribuirse solo a su equipo destinatario. Cualquier persona con ambos puede inscribirse, de modo que el registro no verifica por sí solo la identidad.

## Seguridad y privacidad

- La **CURP es única globalmente** en `inscripciones` activas, mediante índice único en PostgreSQL. Se normaliza en mayúsculas y se valida la estructura, pero **no se consulta RENAPO**, por lo que no se certifica su autenticidad.
- El listado administrativo muestra CURP parcialmente oculta. Las API públicas nunca retornan datos de otros participantes.
- Los datos se validan nuevamente en el backend y se insertan usando consultas parametrizadas.
- La invitación y el código se guardan como hashes; los enlaces se muestran solo una vez al administrador.
- **Revocar** una invitación impide nuevas inscripciones; no borra las anteriores. **Vencer** hace lo mismo automáticamente.
- Las invitaciones nuevas admiten registros ilimitados, no perpetuos: requieren vigencia vigente.
- El limitador por IP opera en memoria del proceso; para alta concurrencia y múltiples instancias, requiere implementación distribuida.
- **Antes del uso con datos reales**, completa y publica un aviso de privacidad con responsable, finalidades, contacto y mecanismo de derechos correspondiente. El texto informativo del formulario no sustituye el aviso legal. Define retención, acceso y borrado de CURP y otra información personal.
- La consulta administrativa actualmente devuelve hasta 5000 inscripciones; para mayor volumen se recomienda paginación de servidor.

## Comandos

```cmd
npm run db:migrate:inscripciones
npm run css:build
npm start
```

Los archivos del flujo anterior (`routes/registros.js`, `middleware/validation.js`, scripts históricos y tablas históricas) permanecen para referencia y conservación de datos, **pero las rutas anteriores de capturistas ya no se publican en `server.js`**.
