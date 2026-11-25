// Liste des NOTAM : même rendu sur le tableau de bord TV et dans l'espace membre.
// Données : API /dashboard/api/donnees (TV) ou /membre/api/notam (appli), toutes deux via lireNotam() (FAA NMS).

export interface Notam { numero: string; snow?: boolean; sujet: string | null; debut: string | null; fin: string | null; texte: string }

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const p2 = (n: number) => String(n).padStart(2, '0');
const utc = (iso: string | null) => (iso ? new Date(iso) : null);
const hUtc = (d: Date) => `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
const jmUtc = (d: Date) => `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}`;

// Badge carré par catégorie (2 premières lettres du code Q) : lettre + nom, façon ForeFlight
const ANTENNE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 11v10"/><circle cx="12" cy="9" r="1.6" fill="currentColor"/><path d="M8.5 5.5a5 5 0 0 0 0 7M15.5 5.5a5 5 0 0 1 0 7M5.5 3a9 9 0 0 0 0 12.5M18.5 3a9 9 0 0 1 0 12.5"/></svg>';
const CATS: [RegExp, string, string, string][] = [
  [/^M[XY]/, 'TWY', 'Taxiway', 'jaune'], [/^M[KNP]/, 'APN', 'Aire de trafic', 'jaune'], [/^M/, 'RWY', 'Piste', 'rouge'],
  [/^L/, 'LGT', 'Balisage', 'jaune'], [/^[NI]/, ANTENNE, 'Radionav', 'gris'], [/^G/, 'GNSS', 'GNSS', 'bleu'],
  [/^C/, 'COM', 'Comm', 'bleu'], [/^[AR]/, 'AIR', 'Espace', 'violet'], [/^P/, 'PROC', 'Procédure', 'violet'],
  [/^W/, 'ACT', 'Activité', 'violet'], [/^S/, 'SVC', 'Service', 'gris'], [/^F/, 'AD', 'Aérodrome', 'gris'],
];
// Ordre d'affichage des NOTAM par badge (après « en cours / à venir ») : pistes d'abord
const ORDRE = ['RWY', 'TWY', 'APN', 'LGT', ANTENNE, 'GNSS', 'COM', 'AIR', 'PROC', 'ACT', 'SVC', 'AD', 'INFO'];
const cat = (q: string | null) => CATS.find(([re]) => re.test(q || '')) ?? [null, 'INFO', 'Divers', 'gris'] as const;
// Mots d'indisponibilité en rouge (abréviations développées comme ForeFlight)
const ROUGES = /\b(CLSD|CLOSED|U\/S|UNSERVICEABLE|OUT OF ORDER|OUT OF SERVICE|NOT AVBL|NOT AVAILABLE|SUSPENDED|PROHIBITED|FORBIDDEN|UNUSABLE|INUTILISABLE|HORS SERVICE|FERME|FERMEE|INTERDIT|INTERDITE|WITHDRAWN)\b/g;
const texteNotam = (t: string) => esc(t).replace(ROUGES, (m) => `<em>${m === 'CLSD' ? 'CLOSED' : m === 'U/S' ? 'UNSERVICEABLE' : m === 'NOT AVBL' ? 'NOT AVAILABLE' : m}</em>`);
export const actif = (debut: string | null) => { const d = utc(debut); return !!d && d.getTime() <= Date.now(); };
function validite(debut: string | null, fin: string | null) {
  const d = utc(debut), f = fin && /^\d{4}-/.test(fin) ? new Date(fin) : null;
  const t = (x: Date) => `${jmUtc(x)} · ${hUtc(x)}`;
  if (!d) return '';
  if (fin === 'PERM') return `Depuis le ${t(d)} · permanent`;
  return d.getTime() <= Date.now() ? (f ? `Jusqu’au ${t(f)} UTC` : '') : `${t(d)} → ${f ? t(f) : '…'} UTC`;
}

// Procédures (SID, STAR, approches) masquées pour l'instant : elles concernent surtout les vols IFR.
// La source renvoie parfois le même NOTAM deux fois : un seul par numéro.
// Tri : SNOWTAM, puis actifs, puis par catégorie (pistes d'abord), puis les plus récents.
export function trierNotam(liste: Notam[] = []) {
  const vus = new Set<string>();
  return [...liste].filter((x) => { const k = x.numero || x.texte; if (vus.has(k)) return false; vus.add(k); return true; })
    .filter((x) => x.snow || cat(x.sujet)[1] !== 'PROC')
    .sort((a, b) => Number(b.snow) - Number(a.snow) || Number(actif(b.debut)) - Number(actif(a.debut)) || ORDRE.indexOf(cat(a.sujet)[1]) - ORDRE.indexOf(cat(b.sujet)[1]) || String(b.debut).localeCompare(String(a.debut)));
}

export function ligneNotam(x: Notam, sup = false) {
  const [, l, nom, coul] = sup ? [null, 'SUP', 'SUP AIP', 'gris'] : x.snow ? [null, 'SNOW', 'SNOWTAM · état des pistes', 'neige'] : cat(x.sujet);
  return `<div class="n"><span class="ic ${coul}${l.length > 2 && !l.startsWith('<') ? ' l' + l.length : ''}" title="${nom}">${l}</span><div><b>${texteNotam(x.texte)} <span class="no">${esc(x.numero || '')}</span></b><small>${actif(x.debut) ? '<span class="actif">ACTIF</span>' : ''}${esc(validite(x.debut, x.fin))}</small></div></div>`;
}

export const NOTAM_INFO = 'hors obstacles et procédures IFR';
export const NOTAM_VIDE = 'Aucun NOTAM en vigueur (hors obstacles et procédures IFR).';
export const notamIndispo = (raison?: string) => raison === 'cle' ? 'En attente de la clé de l’API NOTAM (FAA) dans Cloudflare.' : 'NOTAM indisponibles pour le moment.';
