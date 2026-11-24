-- Los códigos nuevos se conservan cifrados para consulta administrativa.
-- Los códigos anteriores continúan válidos, pero no se pueden reconstruir desde su hash.
BEGIN;
ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS codigo_cifrado TEXT;
COMMIT;
