-- Permite conservar vacíos legítimos de una importación histórica sin relajar la captura web.
ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS origen VARCHAR(16) NOT NULL DEFAULT 'web';
ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS importacion_clave CHAR(64);
ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS importacion_archivo CHAR(64);
ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS importacion_fila INTEGER;
ALTER TABLE inscripciones ALTER COLUMN edad DROP NOT NULL;
ALTER TABLE inscripciones ALTER COLUMN telefono DROP NOT NULL;
ALTER TABLE inscripciones ALTER COLUMN correo_electronico DROP NOT NULL;
ALTER TABLE inscripciones ALTER COLUMN seccion_electoral DROP NOT NULL;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='inscripciones'::regclass AND conname='inscripciones_origen_valido') THEN
  ALTER TABLE inscripciones ADD CONSTRAINT inscripciones_origen_valido CHECK (origen IN ('web','importacion'));
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='inscripciones'::regclass AND conname='inscripciones_web_completo') THEN
  ALTER TABLE inscripciones ADD CONSTRAINT inscripciones_web_completo CHECK
   (origen='importacion' OR (edad IS NOT NULL AND telefono IS NOT NULL AND correo_electronico IS NOT NULL AND seccion_electoral IS NOT NULL));
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS inscripciones_importacion_clave_unica
 ON inscripciones(importacion_clave) WHERE importacion_clave IS NOT NULL;
