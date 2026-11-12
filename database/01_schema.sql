-- PROPUESTA COTS | UTF-8 | PostgreSQL 14+
-- Crear base con ENCODING 'UTF8'. Los textos se normalizan en la aplicación.
BEGIN;
SET client_encoding = 'UTF8';
CREATE TABLE IF NOT EXISTS distritos_federales (
  numero SMALLINT PRIMARY KEY CHECK(numero BETWEEN 1 AND 40),
  cabecera VARCHAR(140) NOT NULL
);
CREATE TABLE IF NOT EXISTS distritos_municipios (
  distrito_numero SMALLINT NOT NULL REFERENCES distritos_federales(numero),
  municipio VARCHAR(160) NOT NULL,
  PRIMARY KEY(distrito_numero, municipio)
);
CREATE TABLE IF NOT EXISTS usuarios (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  apellido_paterno VARCHAR(100) NOT NULL,
  apellido_materno VARCHAR(100),
  telefono VARCHAR(20) NOT NULL,
  correo_electronico VARCHAR(254) NOT NULL,
  llave_hash CHAR(64) NOT NULL,
  rol VARCHAR(15) NOT NULL DEFAULT 'capturista' CHECK(rol IN ('admin','capturista')),
  estado VARCHAR(15) NOT NULL DEFAULT 'activo' CHECK(estado IN ('activo','bloqueado')),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_acceso TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_correo_unico ON usuarios (lower(btrim(correo_electronico)));
CREATE TABLE IF NOT EXISTS invitaciones (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  codigo_hash CHAR(64) NOT NULL,
  destinatario_nombre VARCHAR(250) NOT NULL,
  correo_autorizado VARCHAR(254),
  creado_por BIGINT NOT NULL REFERENCES usuarios(id),
  invitador_id BIGINT REFERENCES usuarios(id),
  invitador_nombre VARCHAR(250) NOT NULL,
  max_usos INTEGER NOT NULL DEFAULT 1 CHECK(max_usos BETWEEN 1 AND 1000),
  usos INTEGER NOT NULL DEFAULT 0 CHECK(usos >= 0),
  estado VARCHAR(15) NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','agotada','revocada')),
  creada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  vence_en TIMESTAMPTZ,
  primer_acceso_en TIMESTAMPTZ,
  utilizada_en TIMESTAMPTZ,
  CHECK (usos <= max_usos),
  CHECK (max_usos = 1 OR correo_autorizado IS NULL)
);
CREATE TABLE IF NOT EXISTS invitaciones_usos (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 invitacion_id BIGINT NOT NULL REFERENCES invitaciones(id),
 usuario_id BIGINT NOT NULL UNIQUE REFERENCES usuarios(id),
 fecha TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invitaciones_usos_invitacion ON invitaciones_usos(invitacion_id);
CREATE TABLE IF NOT EXISTS referentes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  capturista_id BIGINT NOT NULL REFERENCES usuarios(id),
  nombre VARCHAR(100) NOT NULL,
  apellido_paterno VARCHAR(100) NOT NULL,
  apellido_materno VARCHAR(100),
  clave_normalizada VARCHAR(310) NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (capturista_id, clave_normalizada),
  UNIQUE (id, capturista_id)
);
CREATE TABLE IF NOT EXISTS registros (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  capturista_id BIGINT NOT NULL REFERENCES usuarios(id),
  nombre VARCHAR(100) NOT NULL,
  apellido_paterno VARCHAR(100) NOT NULL,
  apellido_materno VARCHAR(100),
  edad SMALLINT CHECK (edad BETWEEN 0 AND 120),
  telefono VARCHAR(20) NOT NULL,
  correo_electronico VARCHAR(254),
  distrito_numero SMALLINT NOT NULL REFERENCES distritos_federales(numero),
  seccion_electoral VARCHAR(10) NOT NULL,
  referente_id BIGINT NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  eliminado_en TIMESTAMPTZ,
  CONSTRAINT fk_referente_del_mismo_capturista FOREIGN KEY(referente_id, capturista_id)
     REFERENCES referentes(id, capturista_id)
);
CREATE INDEX IF NOT EXISTS registros_distrito_activos ON registros(distrito_numero) WHERE eliminado_en IS NULL;
CREATE INDEX IF NOT EXISTS registros_referente_activos ON registros(referente_id) WHERE eliminado_en IS NULL;
CREATE TABLE IF NOT EXISTS sesiones (
  token_hash CHAR(64) PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  vence_en TIMESTAMPTZ NOT NULL,
  revocada_en TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sesiones_usuario ON sesiones(usuario_id);
CREATE TABLE IF NOT EXISTS auditoria (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id BIGINT REFERENCES usuarios(id),
  accion VARCHAR(40) NOT NULL,
  entidad VARCHAR(40) NOT NULL,
  entidad_id BIGINT,
  detalle JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auditoria_fecha ON auditoria(creado_en DESC);
COMMIT;
