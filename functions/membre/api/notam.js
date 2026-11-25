// NOTAM de LFOB pour l'onglet Météo de l'appli membres (protégée par le mot de passe du club, comme tout /membre/).
// Mêmes données que le tableau de bord TV : API NMS de la FAA, sans obstacles, 10 min en cache (lireNotam).
import { lireNotam } from '../../dashboard/api/donnees.js';
import { json } from '../../_maa.js';

export async function onRequestGet({ env, waitUntil }) {
  const cache = globalThis.caches?.default;
  try {
    const n = await lireNotam(env, cache, waitUntil, false);
    return json(n, n.ok ? 200 : 503);
  } catch (e) {
    return json({ ok: false, raison: 'erreur' }, 502);
  }
}
