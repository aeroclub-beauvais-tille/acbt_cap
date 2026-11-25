// Noms affichés pour une réservation Aerogest (TV du club et espace membre) :
// « BALIN J. (FI) - Vol d'initiation », « PETIT M. + BINET J. (FI/FE) - Vol d'instruction », « BLAIS J. ».
// Aerogest donne parfois le trigramme de l'instructeur (« BAL ») au lieu de son nom : on le traduit.
export interface InstructeurNom { nom: string; code?: string | null; fe?: boolean }

// Table de secours donnée par le club (tous FI ; BINET J. est aussi examinateur FE)
const TRIGRAMMES: Record<string, string> = { BAL: 'BALIN Jean', JBT: 'BINET Justin', PVH: 'VAN HEES Pierre', GEN: 'GENIN Thomas', YVO: 'YVON Auguste' };
const FE_CLUB = ['BINET Justin'];

// « DALBART Baptiste » → « DALBART B. »
export function court(nom: string | null | undefined) {
  const m = String(nom || '').trim().split(/\s+/);
  if (m.length < 2) return m[0] || '';
  const maj = m.filter((w) => w === w.toUpperCase() && /[A-ZÀ-Ý]/.test(w));
  const pre = m.filter((w) => !maj.includes(w));
  return pre.length && maj.length ? `${maj.join(' ')} ${pre[0][0]}.` : m.join(' ');
}

export function nomComplet(n: string | null | undefined, instructeurs: InstructeurNom[] = []) {
  const t = String(n || '').replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
  if (!/^[A-Z]{2,4}$/.test(t)) return t || null;
  return instructeurs.find((x) => x.code === t)?.nom || TRIGRAMMES[t] || t;
}

// (FI), ou (FI/FE) pour un examinateur ; rien pour un pilote qui n'est pas instructeur
function qualif(nom: string, instructeurs: InstructeurNom[]) {
  const i = instructeurs.find((x) => x.nom === nom);
  if (!i && !Object.values(TRIGRAMMES).includes(nom)) return '';
  return i?.fe || FE_CLUB.includes(nom) ? ' (FI/FE)' : ' (FI)';
}

export function nomCourt(n: string | null | undefined, instructeurs: InstructeurNom[] = []) {
  const c = nomComplet(n, instructeurs);
  return c ? court(c) + qualif(c, instructeurs) : '';
}

// Type de vol affiché, sauf le cas courant « Vol standard »
export const typeVol = (t: string | null | undefined) => (t && !/^vol standard$/i.test(t) ? t : '');

// Pilote et instructeur (jamais deux fois le même nom), puis le type de vol
export function quiResa(r: { pilote?: string | null; instructeur?: string | null; type?: string | null }, instructeurs: InstructeurNom[] = []) {
  const noms = [...new Set([nomCourt(r.pilote, instructeurs), nomCourt(r.instructeur, instructeurs)].filter(Boolean))].join(' + ');
  return [noms, typeVol(r.type)].filter(Boolean).join(' - ');
}
