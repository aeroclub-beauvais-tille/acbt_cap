// Programme e-mail de l'aéroclub (Cloudflare Email Worker « acbt-maa-mail »).
// Quand un mail arrive sur meteo@acbt60.fr :
//   1. une copie part dans la boîte du club (acbt60@gmail.com) ;
//   2. le mail entier est transmis au site (https://acbt60.fr/api/maa), qui lit chaque PDF MAA joint
//      et l'affiche dans l'espace membre et sur la TV.
// Réglage nécessaire dans le Worker : variable secrète MAA_CLE (la même que dans le projet Pages acbt60).
// Ce fichier se colle tel quel dans Cloudflare > Workers > acbt-maa-mail > Modifier le code.

const SITE = 'https://acbt60.fr/api/maa';
const COPIE = 'acbt60@gmail.com';

export default {
  async email(message, env, ctx) {
    const brut = await new Response(message.raw).arrayBuffer();
    try { await message.forward(COPIE); } catch (e) { console.log('Copie Gmail impossible :', e.message); }
    const rep = await fetch(SITE, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.MAA_CLE}`, 'Content-Type': 'message/rfc822' },
      body: brut,
    });
    console.log(`MAA de ${message.from} : ${rep.status} ${await rep.text()}`);
  },
};
