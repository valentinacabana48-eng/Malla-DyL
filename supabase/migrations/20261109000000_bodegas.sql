-- Bodegas: igual que los pasillos, cada sucursal tiene su lista de bodegas (con número o nombre)
-- y algunas trabajadoras (p. ej. bodegueras) tienen una bodega fija. Es opcional: '' = sin bodega.
ALTER TABLE public.sucursales ADD COLUMN IF NOT EXISTS bodegas JSONB NOT NULL DEFAULT '[]';
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS bodega TEXT NOT NULL DEFAULT '';
