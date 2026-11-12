-- La CURP sigue siendo obligatoria y validada, pero puede aparecer en varias inscripciones.
BEGIN;
DROP INDEX IF EXISTS inscripciones_curp_unica;
CREATE INDEX IF NOT EXISTS inscripciones_curp ON inscripciones(curp) WHERE eliminado_en IS NULL;
COMMIT;
