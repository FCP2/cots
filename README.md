# PROPUESTA COTS · Registro individual por invitación

Proyecto **Node.js + Express + PostgreSQL + HTML5 + Tailwind CSS**. Codificación UTF-8 de extremo a extremo.

## Flujo vigente

1. **Solamente el administrador** entra con correo y llave personal.
2. Desde administración crea una invitación con responsable, equipo y días de vigencia.
3. Comparte **URL + código de invitación**. El responsable puede compartirlos entre los integrantes de su equipo, sin límite de participantes (hasta vencer o revocar el enlace).
4. Cada participante registra **solo sus propios datos**: nombre(s), apellidos, edad, teléfono, correo, distrito federal, sección electoral, referente (nombre y apellidos). La CURP es opcional.
5. Presiona **Revisar mis datos**, revisa un resumen (CURP enmascarada si la capturó) y selecciona **Confirmar y enviar**.
6. El servidor comprueba nuevamente la invitación, sus fechas, el código y, si se capturó, el formato de la CURP; guarda la inscripción atómicamente en PostgreSQL. Una misma CURP puede aparecer con distintos responsables.
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
npm run db:migrate:curp-no-unica
npm run db:migrate:curp-opcional
npm run db:migrate:eliminacion-invitaciones
npm run css:build
npm start
```

**No ejecutes `db:init`, `db:migrate:unlimited` ni `crear-admin` nuevamente.** La migración 04 crea `inscripciones` y permite invitaciones nuevas de uso ilimitado. La migración 05 elimina la unicidad de CURP y la 06 permite dejarla vacía; ninguna borra inscripciones. La migración 07 agrega la marca para retirar invitaciones del seguimiento. Si la tabla `inscripciones` ya existe, ejecuta solo las migraciones pendientes. Las invitaciones antiguas mantienen sus límites y reglas anteriores; respalda antes de aplicar cambios.

Si `npm run db:migrate:inscripciones` falla, **no inicies la versión nueva** hasta resolverlo. El script lee `.env` y comprueba `server_encoding=UTF8`.

## Desarrollo local

En Git Bash, desde la carpeta del proyecto:

```bash
npm ci
npm run dev
```

Si acabas de clonar el repositorio y aún no tienes `.env`, copia `.env.example` a `.env` y configura tu `DATABASE_URL` antes de arrancar. En `http://localhost:3000`, utiliza `APP_URL=http://localhost:3000` y `COOKIE_SECURE=false`. El comando `dev` reinicia Node automáticamente al cambiar los archivos JavaScript del servidor. Detén el proceso con `Ctrl+C`.

## ngrok

En una ventana ejecuta `npm start`. En otra, `ngrok http 3000`. Cambia en `.env`:

```env
APP_URL=https://TU_DOMINIO.ngrok-free.app
COOKIE_SECURE=true
```

Reinicia Node después de cambiar el `.env`. En Render utiliza `NODE_ENV=production`, `APP_URL` HTTPS y `COOKIE_SECURE=true`.

**Nunca compartas la URL de conexión a PostgreSQL, la llave admin ni la contraseña**. La URL y el código de invitación deben distribuirse solo a su equipo destinatario. Cualquier persona con ambos puede inscribirse, de modo que el registro no verifica por sí solo la identidad.

## Seguridad y privacidad

## Panel administrativo

El panel administrativo tiene tres secciones: generar invitación, seguimiento de invitaciones y registros, y métricas y reportes. En métricas se agrupan las inscripciones por nombre del responsable; el anillo muestra su proporción del total. Los reportes Excel incluyen un resumen y el detalle de registros (sin el límite visual de 5000 filas), con CURP completa cuando se proporcionó. Se puede descargar un reporte general o filtrar por responsable. Guarda los archivos descargados de forma segura.

En seguimiento, **Editar** cambia el nombre del responsable solo para el código elegido. **Eliminar** revoca y retira ese código del panel. El diálogo permite conservar sus inscripciones, que siguen visibles en consultas y Excel, o borrarlas definitivamente de la base de datos y de los reportes. Los demás códigos del mismo responsable no se modifican.

## Seguridad y privacidad

- La CURP es opcional. Si se captura, se normaliza en mayúsculas y se valida su estructura. Puede repetirse entre inscripciones; cada registro conserva su responsable e invitación. **No se consulta RENAPO**, por lo que no se certifica su autenticidad.
- El listado administrativo muestra CURP parcialmente oculta o «No proporcionada». Las API públicas nunca retornan datos de otros participantes.
- Los datos se validan nuevamente en el backend y se insertan usando consultas parametrizadas.
- La invitación y el código se guardan como hashes; los enlaces se muestran solo una vez al administrador.
- **Revocar** una invitación impide nuevas inscripciones; no borra las anteriores. **Vencer** hace lo mismo automáticamente.
- Las invitaciones nuevas admiten registros ilimitados, no perpetuos: requieren vigencia vigente.
- El limitador por IP opera en memoria del proceso; para alta concurrencia y múltiples instancias, requiere implementación distribuida.
- **Antes del uso con datos reales**, completa y publica un aviso de privacidad con responsable, finalidades, contacto y mecanismo de derechos correspondiente. Define retención, acceso y borrado de CURP y otra información personal.
- La consulta administrativa actualmente devuelve hasta 5000 inscripciones; para mayor volumen se recomienda paginación de servidor.

## Comandos

```cmd
npm run db:migrate:inscripciones
npm run db:migrate:curp-no-unica
npm run db:migrate:curp-opcional
npm run db:migrate:eliminacion-invitaciones
npm run css:build
npm start
```

Los archivos del flujo anterior (`routes/registros.js`, `middleware/validation.js`, scripts históricos y tablas históricas) permanecen para referencia y conservación de datos, **pero las rutas anteriores de capturistas ya no se publican en `server.js`**.
