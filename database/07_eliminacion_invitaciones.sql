-- Permite retirar una invitación de seguimiento y conservar opcionalmente sus inscripciones.
BEGIN;
ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS eliminado_en TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS invitaciones_activas_fecha ON invitaciones(creada_en DESC) WHERE eliminado_en IS NULL;
COMMIT;
