-- Fichas vinculadas a inscripciones existentes; no modifica registros previos.
BEGIN;
CREATE TABLE IF NOT EXISTS fichas_curriculares (
 inscripcion_id BIGINT PRIMARY KEY REFERENCES inscripciones(id) ON DELETE CASCADE,
 nivel_estudios VARCHAR(100) NOT NULL,
 estatus_estudios VARCHAR(12) NOT NULL CHECK (estatus_estudios IN ('inconcluso','concluido','titulado')),
 cursos TEXT NOT NULL DEFAULT '',
 foto_archivo VARCHAR(80),
 cargo_partido VARCHAR(150),
 area_adscripcion VARCHAR(150),
 fecha_ingreso DATE,
 actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS experiencias_laborales (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 inscripcion_id BIGINT NOT NULL REFERENCES inscripciones(id) ON DELETE CASCADE,
 orden SMALLINT NOT NULL CHECK (orden BETWEEN 1 AND 5),
 puesto VARCHAR(150) NOT NULL,
 institucion VARCHAR(150) NOT NULL,
 periodo_inicio CHAR(7) NOT NULL CHECK (periodo_inicio ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 periodo_fin CHAR(7) CHECK (periodo_fin IS NULL OR periodo_fin ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 CHECK (periodo_fin IS NULL OR periodo_fin >= periodo_inicio),
 UNIQUE (inscripcion_id,orden)
);
CREATE TABLE IF NOT EXISTS sesiones_confirmacion (
 token_hash CHAR(64) PRIMARY KEY,
 inscripcion_id BIGINT NOT NULL REFERENCES inscripciones(id) ON DELETE CASCADE,
 creada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
 vence_en TIMESTAMPTZ NOT NULL,
 revocada_en TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sesiones_confirmacion_inscripcion ON sesiones_confirmacion(inscripcion_id);
COMMIT;
