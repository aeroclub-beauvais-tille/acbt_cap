// Données communes aux trois maquettes de « Toute notre histoire ».
import h from '../data/historique.json';
export const intro = h.intro;
export const etapes = h.etapes;
const debut = (a: string) => parseInt(a, 10);
const noms: Record<number, string> = { 1970: 'Les débuts', 1980: 'Les années 80', 1990: 'Les années 90', 2000: 'Les années 2000', 2010: 'Les années 2010', 2020: 'Aujourd’hui' };
export const decennies = (() => {
  const m = new Map<number, typeof etapes>();
  for (const e of etapes) { const d = Math.floor(debut(e.annee) / 10) * 10; m.set(d, [...(m.get(d) || []), e]); }
  // 1979 rejoint les années 80 : un seul événement dans les années 70
  if (m.has(1970) && m.has(1980)) { m.set(1980, [...m.get(1970)!, ...m.get(1980)!]); m.delete(1970); }
  return [...m.entries()].map(([d, es]) => ({ id: `d${d}`, nom: d === 1980 ? 'Les débuts' : noms[d] || `${d}`, court: d === 1980 ? '1979' : `${d}`, etapes: es, photo: es.flatMap((e) => e.photos)[0] }));
})();
export const fortes = etapes.filter((e) => e.photos.length > 0);
