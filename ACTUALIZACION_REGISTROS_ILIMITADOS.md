# Actualización COTS — registros ilimitados

Se elimina el campo manual **N.º (1–40)** del formulario, la validación del backend, el límite por capturista y la columna `registros.numero` de PostgreSQL. Se conserva `registros.id` como identificador único automático; los **distritos federales 1–40 siguen igual** y una invitación todavía puede tener su propio límite de usos (cantidad de capturistas, no de registros).

## Actualizar instalación existente (Windows CMD)

1. Haz una copia de seguridad de tu proyecto y base de datos antes de migrar.
2. Sustituye los archivos de tu proyecto con los del ZIP actualizado. **No reemplaces el archivo `.env` existente**, ni la carpeta `node_modules`.
3. Desde la carpeta `propuesta-cots`:

```cmd
chcp 65001
npm run db:migrate:unlimited
npm start
```

La migración usa `DATABASE_URL` en `.env` para conectarse a Render y conserva todas las filas existentes. **No ejecutes `npm run db:init` para este cambio**, ni vuelvas a crear tu administrador. Si el servidor sigue abierto, detenlo con Ctrl+C antes de reiniciarlo.

## Nuevas instalaciones

Ejecuta `npm run db:init` normalmente: `01_schema.sql` ya no tiene límite de 40 registros. El distrito federal continúa limitado al catálogo de 40 distritos, correctamente.

## SQL manual alternativo

El mismo cambio está en `database/03_registros_sin_limite.sql`. Puede aplicarse con `psql` si lo prefieres, sin repetir la migración por Node.

## Seguridad

No se incluye `.env` dentro del ZIP: conserva tus credenciales locales. La edición y eliminación mantienen el filtro `capturista_id` en el backend.
