-- Migración 003: quitar límite de 40 registros por capturista.
-- No elimina registros existentes; solamente elimina la columna manual "numero".
-- Ejecutar una vez sobre la BD existente. Seguro para repetirse.
BEGIN;
SET LOCAL client_encoding = 'UTF8';
DROP INDEX IF EXISTS registros_numero_activo_por_usuario;
ALTER TABLE registros DROP COLUMN IF EXISTS numero;
COMMIT;
