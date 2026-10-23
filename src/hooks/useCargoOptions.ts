'use client';
import { useEffect, useMemo } from 'react';
import { useAppContext } from '@/context/AppContext';

/**
 * Cargos de las áreas elegidas ([] = todas), según Ajustes y los que tienen las
 * trabajadoras. Si se cambian las áreas, quita de la selección los cargos que ya no están.
 */
export function useCargoOptions(
  selectedAreas: string[],
  selectedCargos: string[],
  setSelectedCargos: (v: string[]) => void
): string[] {
  const { areas, areaCargos, workers } = useAppContext();

  const options = useMemo(() => {
    const areaList = selectedAreas.length === 0 ? areas : selectedAreas;
    const set = new Set<string>();
    areaList.forEach((a) => (areaCargos[a] || []).forEach((c) => set.add(c)));
    workers.forEach((w) => {
      if (w.cargo && areaList.includes(w.area)) set.add(w.cargo);
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [areas, areaCargos, selectedAreas, workers]);

  useEffect(() => {
    const kept = selectedCargos.filter((c) => options.includes(c));
    if (kept.length !== selectedCargos.length) setSelectedCargos(kept);
  }, [options, selectedCargos, setSelectedCargos]);

  return options;
}
