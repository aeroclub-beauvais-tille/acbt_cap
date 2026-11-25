// Dépôt d'un bulletin MAA (ou d'un mail LVP / Pré-LVP de l'aéroport, voir _lvp.js), de deux façons :
//  - le PDF seul :          POST /api/maa   corps = le PDF (application/pdf)
//  - le mail entier (MIME) : POST /api/maa   corps = le mail brut (message/rfc822). C'est ce qu'envoie le petit
//    programme e-mail Cloudflare (workers/maa-mail) quand un mail arrive sur meteo@acbt60.fr : chaque PDF joint
//    est lu, et seuls les vrais MAA (ligne « VALID ») sont gardés.
// Dans les deux cas : en-tête Authorization: Bearer <MAA_CLE> (variable secrète du projet Cloudflare acbt60).
import { tableMaa, lireMaa, empreinte, json, appliquerMaa } from '../_maa.js';
import { lireMail } from '../_mail.js';
import { lireLvp, appliquerLvp } from '../_lvp.js';
import { egal } from '../_session.js';

const MAX = 5 * 1024 * 1024;
const MAX_MAIL = 25 * 1024 * 1024;

async function deposer(env, octets, recu, nom) {
  if (!octets.length || octets.length > MAX) return { ok: false, nom, erreur: 'PDF vide ou trop gros.' };
  const lu = await lireMaa(octets, recu);
  if (!lu) return { ok: false, nom, erreur: "PDF reçu, mais ce n'est pas un MAA (ligne « VALID » introuvable)." };
  const id = await empreinte(octets);
  await tableMaa(env.DB);
  const r = await env.DB.prepare(`INSERT OR IGNORE INTO maa (id, numero, motif, debut, fin, recu, nom, pdf, phen, ref)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`)
    .bind(id, lu.numero, lu.motif, lu.debut, lu.fin, new Date().toISOString(), nom || null, octets, lu.phen, lu.annule || lu.amende)
    .run();
  if (r.meta.changes > 0) await appliquerMaa(env.DB, id, lu);
  return { ok: true, nouveau: r.meta.changes > 0, id, ...lu };
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, erreur: 'Base D1 non reliée (liaison DB manquante).' }, 503);
  if (!env.MAA_CLE) return json({ ok: false, erreur: 'Clé MAA_CLE non réglée dans Cloudflare.' }, 503);
  const auth = request.headers.get('Authorization') || '';
  const cle = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!egal(cle, String(env.MAA_CLE).trim())) {
    await new Promise((r) => setTimeout(r, 800));
    return json({ ok: false, erreur: 'Clé refusée.' }, 401);
  }
  const octets = new Uint8Array(await request.arrayBuffer());
  if (!octets.length || octets.length > MAX_MAIL) return json({ ok: false, erreur: 'Envoi vide ou trop gros.' }, 413);

  const url = new URL(request.url);
  let recu = new Date(url.searchParams.get('recu') || Date.now());
  if (isNaN(recu)) recu = new Date();

  // Un PDF seul (ancienne façon)
  if (String.fromCharCode(...octets.subarray(0, 5)) === '%PDF-') {
    const r = await deposer(env, octets, recu, url.searchParams.get('nom'));
    return json(r, r.ok ? 200 : 422);
  }

  // Un mail entier : on prend chacune de ses pièces jointes PDF
  const mail = lireMail(octets);
  const dateMail = new Date(mail.date);
  if (!url.searchParams.get('recu') && !isNaN(dateMail)) recu = dateMail;
  // Mail du service trafic de l'aéroport : activation ou désactivation des LVP / Pré-LVP
  const lvp = !mail.pdfs.length ? lireLvp(mail.sujet, mail.texte, recu) : null;
  if (lvp) return json({ ok: true, de: mail.de, sujet: mail.sujet, lvp: { ...lvp, nouveau: await appliquerLvp(env.DB, lvp) } });
  if (!mail.pdfs.length) return json({ ok: false, de: mail.de, sujet: mail.sujet, erreur: 'Mail reçu, mais sans PDF joint.' }, 422);
  const resultats = [];
  for (const p of mail.pdfs) resultats.push(await deposer(env, p.octets, recu, p.nom));
  const ok = resultats.some((r) => r.ok);
  return json({ ok, de: mail.de, sujet: mail.sujet, maa: resultats }, ok ? 200 : 422);
}
