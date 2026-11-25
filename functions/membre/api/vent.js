// Vent de LFOB pour le bloc « Vent et pistes » de l'appli membres (protégée par le mot de passe du club, comme tout /membre/).
// Mêmes sources que le tableau de bord TV : station Météo-France de Beauvais-Tillé (60639001, une mesure toutes les 6 min)
// et, en secours, le METAR (AVWX). Gardé 2 min en cache chez Cloudflare (quota de l'API Météo-France).
import { relayer } from '../../dashboard/api/mf.js';
import { avwx } from '../../dashboard/api/donnees.js';
import { json } from '../../_maa.js';

const CACHE_CLE = 'https://cache.acbt60.local/membre/api/vent';
const STATION = 'https://public-api.meteofrance.fr/public/DPObs/v2/station/infrahoraire-6m?id_station=60639001&format=json';

export async function onRequestGet({ env, waitUntil }) {
  const cache = globalThis.caches?.default;
  if (cache) {
    const deja = await cache.match(new Request(CACHE_CLE));
    if (deja) return json(await deja.json());
  }
  const [mesures, metar] = await Promise.all([
    env.METEOFRANCE_APIKEY || env.METEOFRANCE_BASIC
      ? relayer(env, cache, waitUntil, new URL(STATION)).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      : null,
    avwx(env, 'metar').catch(() => null),
  ]);
  const corps = {
    ok: true,
    mesures: Array.isArray(mesures) ? mesures : null,
    metar: metar ? { ventDir: metar.ventDir, ventForce: metar.ventForce, rafales: metar.rafales, ventVar: metar.ventVar, heure: metar.heure } : null,
  };
  if (cache) waitUntil?.(cache.put(new Request(CACHE_CLE), new Response(JSON.stringify(corps), { headers: { 'Cache-Control': 'public, max-age=120' } })));
  return json(corps);
}
