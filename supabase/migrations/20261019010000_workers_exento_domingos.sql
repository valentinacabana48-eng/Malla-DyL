-- Trabajadores que trabajan todos los domingos: no aplica la regla de domingos libres.
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS exento_domingos BOOLEAN NOT NULL DEFAULT false;

-- Punto de partida: los contratos de 10 horas trabajan todos los domingos.
-- (Los de 20 y 30 horas se marcan a mano en Personal.)
UPDATE public.workers SET exento_domingos = true WHERE horas_contratadas = 10 AND exento_domingos = false;
