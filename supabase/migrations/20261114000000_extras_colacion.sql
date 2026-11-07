-- Extras: minutos de colación del extra (se llena al elegir el turno y sale en la hoja impresa).
-- Solo agrega una columna: no cambia ni borra datos. Se puede volver a ejecutar sin error.
ALTER TABLE public.extras ADD COLUMN IF NOT EXISTS colacion INTEGER NOT NULL DEFAULT 0 CHECK (colacion >= 0);
