-- Sesiones de consulta para el código de invitación compartido.
BEGIN;
CREATE TABLE IF NOT EXISTS sesiones_responsables (
 token_hash CHAR(64) PRIMARY KEY,
 invitacion_id BIGINT NOT NULL REFERENCES invitaciones(id) ON DELETE CASCADE,
 creada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
 vence_en TIMESTAMPTZ NOT NULL,
 revocada_en TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sesiones_responsables_invitacion ON sesiones_responsables(invitacion_id);
COMMIT;
