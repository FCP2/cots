-- Permite inscripciones sin CURP; la restricción de formato sigue aplicando si se captura.
BEGIN;
ALTER TABLE inscripciones ALTER COLUMN curp DROP NOT NULL;
COMMIT;
