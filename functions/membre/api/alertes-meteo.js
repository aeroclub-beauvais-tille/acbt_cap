// Alertes météo vues par l'admin (/membre/alertes-meteo/) : MAA en cours ou à venir et état LVP,
// avec la possibilité de les arrêter à la main (mot de passe admin).
//   GET                                   → { maa: [...], lvp }
//   POST { action: 'maa', id, motDePasse } → le MAA n'est plus affiché (TV et appli)
//   POST { action: 'lvp', motDePasse }     → LVP / Pré-LVP désactivées
import { estAdmin } from '../../_alertes.js';
import { tableMaa, json, MAA_VISIBLES } from '../../_maa.js';
import { tableLvp, etatLvp } from '../../_lvp.js';

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ ok: false, maa: [], lvp: null }, 503);
  await tableMaa(env.DB);
  const { results } = await env.DB.prepare(
    `SELECT id, numero, motif, debut, fin, recu, phen FROM maa WHERE (fin IS NULL OR fin >= ?1) AND ${MAA_VISIBLES} ORDER BY debut, numero LIMIT 20`,
  ).bind(new Date().toISOString()).all();
  return json({ ok: true, maa: results, lvp: await etatLvp(env.DB) });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, erreur: 'Base non reliée.' }, 503);
  let d = null;
  try { d = await request.json(); } catch { /* illisible */ }
  if (!d) return json({ ok: false, erreur: 'Demande illisible.' }, 400);
  if (!estAdmin(env, d.motDePasse)) return json({ ok: false, erreur: 'Mot de passe admin incorrect.' }, 401);
  const maintenant = new Date().toISOString();
  if (d.action === 'maa') {
    await tableMaa(env.DB);
    await env.DB.prepare("UPDATE maa SET etat = 'retire' WHERE id = ?1").bind(String(d.id || '')).run();
    return json({ ok: true });
  }
  if (d.action === 'lvp') {
    await tableLvp(env.DB);
    // maj = maintenant : un mail plus ancien ne pourra pas la rallumer, une nouvelle activation si.
    await env.DB.prepare('UPDATE lvp SET actif = 0, depuis = ?1, maj = ?1, vu = ?1').bind(maintenant).run();
    return json({ ok: true });
  }
  return json({ ok: false, erreur: 'Action inconnue.' }, 400);
}
