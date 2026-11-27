-- Nuevas capturas: columnas opcionales, sin reclasificar registros históricos.
BEGIN;
ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS rfc VARCHAR(10)
 CHECK (rfc IS NULL OR rfc ~ '^[A-ZÑ&]{4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$');
ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS homoclave VARCHAR(3)
 CHECK (homoclave IS NULL OR (rfc IS NOT NULL AND homoclave ~ '^[A-Z0-9]{3}$'));
ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS version_captura VARCHAR(32);
COMMIT;
