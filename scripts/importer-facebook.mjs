// Copie les publications de la page Facebook du club en actualités du site.
//
// Chaque publication avec au moins une photo devient un fichier
// src/content/actualites/AAAA-MM-JJ-titre.md, et ses photos sont enregistrées
// dans public/uploads/actualites/AAAA/titre/01.jpg, 02.jpg…
// Une publication déjà copiée n'est jamais recopiée : son identifiant Facebook est noté
// dans src/data/facebook-copiees.json. Si le club modifie ou supprime l'actu dans le
// back-office, le script n'y touche plus.
//
// Lancé par .github/workflows/facebook.yml toutes les 3 heures.
// Réglages (secrets GitHub) :
//   FACEBOOK_PAGE_ID    identifiant de la page ACBT60
//   FACEBOOK_PAGE_TOKEN clé d'accès à la page (sans date d'expiration)
// Facultatif : FACEBOOK_DEPUIS (AAAA-MM-JJ, par défaut 2023-04-01) et
// FACEBOOK_API (adresse de l'API, utilisée seulement pour les essais).

import fs from 'node:fs';
import path from 'node:path';

const PAGE = process.env.FACEBOOK_PAGE_ID;
const CLE = process.env.FACEBOOK_PAGE_TOKEN;
const API = (process.env.FACEBOOK_API || 'https://graph.facebook.com/v21.0').replace(/\/$/, '');
const DEPUIS = process.env.FACEBOOK_DEPUIS || '2023-04-01';
const RACINE = process.cwd();
const DOSSIER_ACTUS = path.join(RACINE, 'src/content/actualites');
const DOSSIER_PHOTOS = path.join(RACINE, 'public/uploads/actualites');
const REGISTRE = path.join(RACINE, 'src/data/facebook-copiees.json');

if ((!PAGE || !CLE) && !process.argv.includes('--nettoyer')) {
  console.log('FACEBOOK_PAGE_ID ou FACEBOOK_PAGE_TOKEN absent : rien à faire.');
  process.exit(0);
}

async function appel(chemin, params = {}) {
  const u = chemin.startsWith('http') ? new URL(chemin) : new URL(`${API}/${chemin.replace(/^\//, '')}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  if (!u.searchParams.has('access_token')) u.searchParams.set('access_token', CLE);
  const r = await fetch(u);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = j.error || {};
    // 190 : clé expirée ou révoquée (mot de passe changé, administrateur retiré…)
    if (e.code === 190) throw new Error(`La clé Facebook ne fonctionne plus (${e.message}). Refaire la clé d'accès à la page et la recoller dans le secret FACEBOOK_PAGE_TOKEN.`);
    throw new Error(`Erreur Facebook ${r.status} : ${e.message || JSON.stringify(j).slice(0, 300)}`);
  }
  return j;
}

// Publications déjà copiées (ou volontairement écartées) : identifiant Facebook → fichier de l'actu.
const registre = fs.existsSync(REGISTRE) ? JSON.parse(fs.readFileSync(REGISTRE, 'utf8')) : {};
const dejaCopiees = new Set(Object.keys(registre));

const sansAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const slug = (s) => {
  const x = sansAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return (x.length > 50 ? x.slice(0, 50).replace(/-[^-]*$/, '') : x) || 'publication';
};
const yaml = (s) => JSON.stringify(s);

// Émojis, pictogrammes et mots-dièses retirés : le site n'utilise pas d'émojis.
const sansEmojis = (t) => t
  .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\u{1F3FB}-\u{1F3FF}‍️⃣]/gu, '')
  .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, '$1');

// Mots à remettre en forme quand un titre était écrit tout en majuscules.
const NOMS = { acbt: 'ACBT', bia: 'BIA', ppl: 'PPL', lapl: 'LAPL', beauvais: 'Beauvais', 'tillé': 'Tillé', tille: 'Tillé', ffa: 'FFA', unilasalle: 'UniLaSalle', 'f-gcal': 'F-GCAL', 'f-bxek': 'F-BXEK', 'f-btbs': 'F-BTBS', 'f-btbj': 'F-BTBJ', 'f-bixa': 'F-BIXA', 'beauvais-tille': 'Beauvais-Tillé', 'beauvais-tillé': 'Beauvais-Tillé' };
function formeTitre(t) {
  t = t.replace(/\s+/g, ' ').replace(/\s+([,.;:!?…])/g, (m, p) => (/[;:!?]/.test(p) ? ' ' + p : p)).trim();
  t = t.replace(/[\s:;,.!-]+$/, '').trim();
  const lettres = t.replace(/[^\p{L}]/gu, '');
  const maj = lettres.replace(/[^\p{Lu}]/gu, '');
  if (lettres.length > 6 && maj.length / lettres.length > 0.6) {
    t = t.toLowerCase().replace(/[\p{L}\-]+/gu, (m) => NOMS[m] || m);
    t = t.charAt(0).toUpperCase() + t.slice(1);
  }
  // Un mot en majuscules dans un titre normal (ASSEMBLÉE GÉNÉRALE du club) : même traitement, mot par mot.
  t = t.replace(/(?<![\p{L}\p{N}-])[\p{Lu}]{4,}(?:[\s'-]+[\p{Lu}]{2,})*(?![\p{L}\p{N}-])/gu, (m) => {
    const bas = m.toLowerCase().replace(/[\p{L}\-]+/gu, (w) => NOMS[w] || w);
    return m === t.slice(0, m.length) ? bas.charAt(0).toUpperCase() + bas.slice(1) : bas;
  });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Titre : la première phrase ou la première ligne, raccourcie proprement.
// Les étiquettes entre crochets ([Congrats!], [PORTES OUVERTES]…) ne restent pas dans le titre.
function decouper(message) {
  const texte = sansEmojis(message.replace(/\r/g, ''))
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  let lignes = texte.split(/\n+/).filter((l) => /[\p{L}\p{N}]/u.test(l));
  // Étiquette seule en tête ([ÉVÉNEMENTS]) : on la garde comme repli si rien de mieux.
  let etiquette = '';
  const tete = (lignes[0] || '').match(/^\[\s*([^\]]+?)\s*\]\s*(.*)$/);
  if (tete) {
    etiquette = tete[1].replace(/[!?.]+$/, '');
    lignes[0] = tete[2];
    if (!lignes[0]) lignes.shift();
  }
  let titre = (lignes[0] || '').trim();
  let suite = lignes.slice(1).join('\n\n').trim();
  const phrase = titre.match(/^(.{12,90}?[.!?…])(\s|$)/);
  if (phrase && phrase[1].length < titre.length) {
    suite = (titre.slice(phrase[1].length).trim() + (suite ? '\n\n' + suite : '')).trim();
    titre = phrase[1];
  }
  if (titre.length > 90) {
    // Trop long : on coupe à une virgule ou entre deux mots, et l'actu reprend tout le texte.
    const virgule = titre.slice(0, 80).lastIndexOf(', ');
    titre = virgule > 25 ? titre.slice(0, virgule) : titre.slice(0, 75).replace(/\s+\S*$/, '') + '…';
    suite = lignes.join('\n\n');
  }
  if (!titre && etiquette) titre = etiquette;
  titre = formeTitre(titre.replace(/[.!]+$/, ''));
  // Une ligne qui commence par # ne doit pas devenir un intertitre dans l'actu.
  const corps = (suite || '').replace(/^(\s*)#/gm, '$1\\#');
  return { titre: titre || 'Nouvelles du club', corps };
}

// Remise au propre des actus déjà copiées (node scripts/importer-facebook.mjs --nettoyer) :
// le titre et le texte sont refaits à partir de ce qui est dans le fichier.
if (process.argv.includes('--nettoyer')) {
  let n = 0;
  for (const nom of Object.values(registre)) {
    const f = path.join(DOSSIER_ACTUS, nom + '.md');
    if (!fs.existsSync(f)) continue;
    const brut = fs.readFileSync(f, 'utf8');
    const m = brut.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!m) continue;
    const ancienTitre = JSON.parse(m[1].match(/^titre: (.*)$/m)[1]);
    const corps = m[2].replace(/\\#/g, '#').trim();
    const message = ancienTitre.endsWith('…') ? corps : `${ancienTitre}\n${corps}`;
    const { titre, corps: nouveau } = decouper(message);
    const entete = m[1].replace(/^titre: .*$/m, `titre: ${yaml(titre)}`);
    const sortie = `---\n${entete}\n---\n${nouveau}\n`;
    if (sortie !== brut) { fs.writeFileSync(f, sortie); n++; }
  }
  console.log(`${n} actu(s) remise(s) au propre.`);
  process.exit(0);
}

// Photos de la publication, dans la meilleure taille disponible.
async function photos(post) {
  const liste = [];
  for (const a of post.attachments?.data || []) {
    const elems = a.subattachments?.data?.length ? a.subattachments.data : [a];
    for (const s of elems) {
      if (s.media_type !== 'photo' && s.type !== 'photo') continue;
      let src = s.media?.image?.src;
      if (s.target?.id) {
        try {
          const p = await appel(s.target.id, { fields: 'images' });
          const grande = (p.images || []).sort((x, y) => y.width - x.width)[0];
          if (grande?.source) src = grande.source;
        } catch (e) {
          if (/ne fonctionne plus/.test(e.message)) throw e;
        }
      }
      if (src) liste.push(src);
    }
  }
  return [...new Set(liste)].slice(0, 12);
}

async function telecharger(url, fichier) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`photo ${r.status}`);
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  fs.writeFileSync(fichier, Buffer.from(await r.arrayBuffer()));
}

const champs = 'id,message,created_time,permalink_url,attachments{media_type,type,media,target,subattachments{media_type,type,media,target}}';
let suivante = null;
let premier = true;
let ajoutees = 0;
const depuis = Math.floor(new Date(DEPUIS + 'T00:00:00Z').getTime() / 1000);

while (premier || suivante) {
  const page = premier ? await appel(`${PAGE}/posts`, { fields: champs, since: String(depuis), limit: '25' }) : await appel(suivante);
  premier = false;
  suivante = page.paging?.next || null;
  for (const post of page.data || []) {
    if (dejaCopiees.has(post.id) || !post.message?.trim()) continue;
    const urls = await photos(post);
    if (!urls.length) continue; // seules les publications avec photos deviennent des actus
    const date = post.created_time.slice(0, 10);
    const annee = date.slice(0, 4);
    const { titre, corps } = decouper(post.message);
    let nom = `${date}-${slug(titre)}`;
    let n = 2;
    while (fs.existsSync(path.join(DOSSIER_ACTUS, nom + '.md'))) nom = `${date}-${slug(titre)}-${n++}`;
    const dossier = path.join(DOSSIER_PHOTOS, annee, nom.slice(11));
    const chemins = [];
    for (const [i, u] of urls.entries()) {
      const f = `${String(i + 1).padStart(2, '0')}.jpg`;
      try {
        await telecharger(u, path.join(dossier, f));
        chemins.push(`/uploads/actualites/${annee}/${nom.slice(11)}/${f}`);
      } catch (e) {
        console.warn(`Photo ignorée pour ${post.id} : ${e.message}`);
      }
    }
    if (!chemins.length) continue;
    const entete = [
      '---',
      `titre: ${yaml(titre)}`,
      `date: ${date}`,
      `image: ${chemins[0]}`,
      'galerie:',
      ...chemins.map((c) => `  - ${c}`),
      '---',
    ].join('\n');
    fs.writeFileSync(path.join(DOSSIER_ACTUS, nom + '.md'), `${entete}\n${corps}\n`);
    dejaCopiees.add(post.id);
    registre[post.id] = nom;
    fs.writeFileSync(REGISTRE, JSON.stringify(registre, null, 2) + '\n');
    ajoutees++;
    console.log(`Nouvelle actu : ${nom} (${chemins.length} photo${chemins.length > 1 ? 's' : ''})`);
  }
}

console.log(ajoutees ? `${ajoutees} actu(s) ajoutée(s).` : 'Aucune nouvelle publication avec photos.');
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `ajoutees=${ajoutees}\n`);
