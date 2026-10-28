-- Pasillos: cada sucursal tiene su lista de pasillos (con número o nombre, como se quiera)
-- y algunas trabajadoras (p. ej. reponedoras) tienen un pasillo fijo. Es opcional: '' = sin pasillo.
ALTER TABLE public.sucursales ADD COLUMN IF NOT EXISTS pasillos JSONB NOT NULL DEFAULT '[]';
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS pasillo TEXT NOT NULL DEFAULT '';
