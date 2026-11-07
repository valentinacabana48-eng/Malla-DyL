-- Extras: cada extra guarda el área a la que va (Cajas, Sala, Bodega…), elegida al agregarlo.
-- Solo agrega una columna: no cambia ni borra datos. Se puede volver a ejecutar sin error.
ALTER TABLE public.extras ADD COLUMN IF NOT EXISTS area TEXT NOT NULL DEFAULT '';
