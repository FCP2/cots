# PROPUESTA COTS · Registro individual por invitación

Proyecto **Node.js + Express + PostgreSQL + HTML5 + Tailwind CSS**. Codificación UTF-8 de extremo a extremo.

## Flujo vigente

1. El administrador entra con correo y llave personal. La pestaña **Mis registros** permanece oculta temporalmente.
2. Desde administración crea una invitación con responsable, equipo y días de vigencia.
3. Comparte la URL común `?confirmar=registro` y el código de invitación. El responsable puede compartirlos entre los integrantes de su equipo mientras el código siga vigente.
4. Cada participante introduce el código y elige localizar su inscripción existente o crear un registro nuevo con ficha curricular y fotografía. La CURP es opcional.
5. El servidor valida el código y guarda el nuevo registro y su ficha en una transacción. La foto se sube a continuación; si falla, puede reintentarse sin crear otra inscripción.
6. Al completar el registro y la foto, aparece **Registro y ficha guardados correctamente.** El formulario queda limpio.
7. La antigua URL fija `?invite=registro` está temporalmente deshabilitada. Los enlaces históricos con token mantienen su flujo anterior.

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
npm run db:migrate:acceso-responsables
npm run db:migrate:codigos-consultables
npm run css:build
npm start
```

**No ejecutes `db:init`, `db:migrate:unlimited` ni `crear-admin` nuevamente.** La migración 04 crea `inscripciones` y permite invitaciones nuevas de uso ilimitado. La migración 05 elimina la unicidad de CURP y la 06 permite dejarla vacía; ninguna borra inscripciones. La migración 07 agrega la marca para retirar invitaciones del seguimiento. La migración 08 crea las sesiones de consulta de responsables. La migración 09 agrega una columna para conservar cifrados los códigos nuevos. Si la tabla `inscripciones` ya existe, ejecuta solo las migraciones pendientes. Las invitaciones antiguas mantienen sus límites y reglas anteriores; respalda antes de aplicar cambios.

Antes de generar invitaciones con esta versión, configura `INVITATION_CODE_KEY` con **64 caracteres hexadecimales** (32 bytes) en `.env` local y en las variables de entorno de Render. Puedes generar el valor con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Usa el mismo valor en cada despliegue y no lo publiques: cambiarlo impide mostrar los códigos cifrados anteriormente. La generación de nuevas invitaciones devuelve un error claro si la clave no está configurada.

Si `npm run db:migrate:inscripciones` falla, **no inicies la versión nueva** hasta resolverlo. El script lee `.env` y comprueba `server_encoding=UTF8`.

## Ficha curricular de registros existentes

Las invitaciones nuevas comparten `?confirmar=registro`, que permite completar fichas o crear un registro nuevo con un código vigente. La antigua liga fija `?invite=registro` está temporalmente deshabilitada; los enlaces históricos con token siguen disponibles.

La URL común `https://TU_DOMINIO/?confirmar=registro` abre la ficha complementaria. El participante escribe su código de invitación y después nombre, apellidos y sección electoral tal como aparecen en su inscripción. Si el registro histórico no tiene sección, puede identificarse con su teléfono registrado de diez dígitos. El servidor busca una coincidencia única dentro de ese código, crea una sesión de dos horas y muestra el registro existente; nunca inserta otra inscripción. Las coincidencias ambiguas requieren atención administrativa. Los códigos vencidos o agotados pueden completar fichas de registros anteriores; los revocados o eliminados quedan bloqueados.

La ficha permite hasta cinco experiencias laborales, nivel y estatus de estudios, cursos y una foto JPG, PNG o WebP de hasta 2 MB. Puede revisarse antes de guardar y actualizarse después. Los campos `cargo_partido`, `area_adscripcion` y `fecha_ingreso` quedan reservados en la base para administración y no se envían a esta vista pública.

En el paso **02 · Identificación**, «Crear nuevo registro y ficha» aparece solo si el código todavía admite inscripciones. El código del paso 01 se reutiliza automáticamente; no se pide de nuevo. Los datos del registro individual y la ficha curricular se guardan en una sola transacción, y la fotografía se sube a continuación con la sesión del registro recién creado. Si falla la foto, el registro y la ficha quedan guardados para poder reintentar la subida; no se crea otra inscripción. El servidor rechaza una nueva captura con el mismo código, nombre, apellidos, sección y teléfono de una inscripción existente. Los códigos vencidos continúan sirviendo para completar fichas anteriores, pero no para abrir registros nuevos.

Antes de publicar este flujo, haz respaldo y ejecuta **solo** `npm run db:migrate:fichas-curriculares`. La migración 11 agrega tablas vinculadas a `inscripciones` y no modifica registros reales ni cuentas admin. En Render crea el disco persistente y monta, por ejemplo, `/var/data/cots-fotos`; configura `PHOTO_STORAGE_DIR=/var/data/cots-fotos` como ruta absoluta. En producción la subida devuelve un error claro hasta que el disco esté configurado. En desarrollo las fotos se guardan en `private/fotos/`, ignorada por Git. Las fotos se sirven únicamente tras identificar la inscripción.

La confirmación por código, nombre y sección no constituye verificación fuerte de identidad: quienes conozcan esos datos pueden intentar acceder. El flujo limita intentos por IP y rechaza coincidencias ambiguas. Antes de compartir esta URL de forma amplia, considera añadir un factor privado adicional.

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

## Panel administrativo

El panel administrativo tiene tres secciones: generar invitación, seguimiento de invitaciones y registros, y métricas y reportes. En métricas se agrupan las inscripciones por nombre del responsable; el anillo muestra su proporción del total. Los reportes Excel incluyen un resumen y el detalle de registros (sin el límite visual de 5000 filas), con CURP completa cuando se proporcionó. Se puede descargar un reporte general o filtrar por responsable. Guarda los archivos descargados de forma segura.

En seguimiento, **Editar** cambia el nombre del responsable solo para el código elegido. **Eliminar** revoca y retira ese código del panel. El diálogo permite conservar sus inscripciones, que siguen visibles en consultas y Excel, o borrarlas definitivamente de la base de datos y de los reportes. Los demás códigos del mismo responsable no se modifican.

En **Métricas y reportes**, el nombre del responsable abre un diálogo con sus invitaciones. Los códigos nuevos se guardan cifrados y se pueden consultar o copiar desde el panel administrativo. Los códigos creados antes de la migración 09 siguen funcionando, pero su valor original no puede recuperarse del hash. Si el administrador conserva uno de esos códigos, puede escribirlo en el diálogo para verificarlo y habilitar su consulta sin cambiarlo.

## Seguridad y privacidad

- La CURP es opcional. Si se captura, se normaliza en mayúsculas y se valida su estructura. Puede repetirse entre inscripciones; cada registro conserva su responsable e invitación. **No se consulta RENAPO**, por lo que no se certifica su autenticidad.
- El listado administrativo muestra CURP parcialmente oculta o «No proporcionada». La consulta **Mis registros** devuelve solo total, nombre completo, fecha y distrito del código autenticado; no entrega CURP, teléfono ni correo.
- Los datos se validan nuevamente en el backend y se insertan usando consultas parametrizadas.
- El código se valida mediante su hash. Los códigos nuevos también se guardan cifrados para consulta administrativa; la clave de cifrado permanece fuera de Git. La URL general de registro es la misma para todos.
- **Revocar**, **vencer** o **eliminar** una invitación impide nuevas inscripciones y nuevas consultas con ese código. Las sesiones de consulta también dejan de funcionar. Revocar o vencer no borra inscripciones anteriores.
- El código de invitación se comparte con los aliados. **Cualquier persona que lo conozca puede entrar a Mis registros mientras esté vigente**; repetirlo en Usuario y Llave no añade un segundo factor de seguridad. Limita su distribución y revócalo si se difunde fuera del equipo.
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
npm run db:migrate:acceso-responsables
npm run db:migrate:codigos-consultables
npm run css:build
npm start
```

Los archivos del flujo anterior (`routes/registros.js`, `middleware/validation.js`, scripts históricos y tablas históricas) permanecen para referencia y conservación de datos, **pero las rutas anteriores de capturistas ya no se publican en `server.js`**.
