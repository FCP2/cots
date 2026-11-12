-- PROPUESTA COTS | Migración aditiva UTF-8 | Inscripciones individuales
-- Mantiene intactas las cuentas administrativas y los registros antiguos.
BEGIN;
SET LOCAL client_encoding = 'UTF8';
-- Las invitaciones nuevas pueden aceptar participantes ilimitados.
ALTER TABLE invitaciones ALTER COLUMN max_usos DROP NOT NULL;
DO $$
DECLARE c record;
BEGIN
 FOR c IN SELECT conname FROM pg_constraint
 WHERE conrelid='invitaciones'::regclass AND contype='c'
 AND pg_get_constraintdef(oid) ILIKE '%max_usos%'
 LOOP
  EXECUTE format('ALTER TABLE invitaciones DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE invitaciones ADD CONSTRAINT invitaciones_max_usos_positivo CHECK (max_usos IS NULL OR max_usos BETWEEN 1 AND 1000000);
ALTER TABLE invitaciones ADD CONSTRAINT invitaciones_usos_limite CHECK (max_usos IS NULL OR usos <= max_usos);
ALTER TABLE invitaciones ADD CONSTRAINT invitaciones_correo_solo_individual CHECK (max_usos IS NULL OR max_usos = 1 OR correo_autorizado IS NULL);
CREATE TABLE IF NOT EXISTS inscripciones (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 invitacion_id BIGINT NOT NULL REFERENCES invitaciones(id),
 nombre VARCHAR(100) NOT NULL,
 apellido_paterno VARCHAR(100) NOT NULL,
 apellido_materno VARCHAR(100),
 curp CHAR(18) NOT NULL,
 edad SMALLINT NOT NULL CHECK(edad BETWEEN 0 AND 120),
 telefono VARCHAR(20) NOT NULL,
 correo_electronico VARCHAR(254) NOT NULL,
 distrito_numero SMALLINT NOT NULL REFERENCES distritos_federales(numero),
 seccion_electoral VARCHAR(10) NOT NULL CHECK (seccion_electoral ~ '^[0-9]{1,10}$'),
 referente_nombre VARCHAR(100) NOT NULL,
 referente_apellido_paterno VARCHAR(100) NOT NULL,
 referente_apellido_materno VARCHAR(100),
 creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
 eliminado_en TIMESTAMPTZ,
 CONSTRAINT inscripciones_curp_formato CHECK (curp ~ '^[A-Z][AEIOUX][A-Z]{2}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[HM][A-Z]{5}[A-Z0-9][0-9]$')
);
CREATE UNIQUE INDEX IF NOT EXISTS inscripciones_curp_unica ON inscripciones(curp) WHERE eliminado_en IS NULL;
CREATE INDEX IF NOT EXISTS inscripciones_invitacion_fecha ON inscripciones(invitacion_id,creado_en DESC) WHERE eliminado_en IS NULL;
CREATE INDEX IF NOT EXISTS inscripciones_distrito ON inscripciones(distrito_numero) WHERE eliminado_en IS NULL;
COMMIT;
