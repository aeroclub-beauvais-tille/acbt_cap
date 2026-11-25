// Lecture d'un e-mail brut (format MIME) pour en sortir les pièces jointes PDF, sans bibliothèque.
// Sert à l'arrivée des MAA sur meteo@acbt60.fr : le petit programme e-mail de Cloudflare (workers/maa-mail)
// transmet le mail tel quel à /api/maa, qui le découpe ici.

const dec = new TextDecoder('latin1');

/** Sépare les en-têtes (dépliés, clés en minuscules) du corps d'une partie. */
function decouper(octets) {
  const txt = dec.decode(octets);
  let fin = txt.indexOf('\r\n\r\n');
  let saut = 4;
  if (fin < 0 || (txt.indexOf('\n\n') >= 0 && txt.indexOf('\n\n') < fin)) { fin = txt.indexOf('\n\n'); saut = 2; }
  if (fin < 0) return { entetes: {}, corps: new Uint8Array(0) };
  const entetes = {};
  for (const ligne of txt.slice(0, fin).replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const i = ligne.indexOf(':');
    if (i > 0) entetes[ligne.slice(0, i).trim().toLowerCase()] = ligne.slice(i + 1).trim();
  }
  return { entetes, corps: octets.subarray(fin + saut) };
}

/** Valeur d'un paramètre d'en-tête : boundary="…", filename=…, name*=UTF-8''… */
function parametre(entete = '', nom) {
  const m = entete.match(new RegExp(`(?:^|;)\\s*${nom}\\*?\\s*=\\s*("([^"]*)"|[^;]+)`, 'i'));
  if (!m) return '';
  let v = (m[2] ?? m[1]).trim();
  const etoile = v.match(/^[\w-]+'[^']*'(.*)$/);
  if (etoile) { try { v = decodeURIComponent(etoile[1]); } catch { v = etoile[1]; } }
  return v;
}

function base64(octets) {
  const propre = dec.decode(octets).replace(/[^A-Za-z0-9+/]/g, '');
  const n = propre.length % 4 === 1 ? propre.slice(0, -1) : propre;
  const bin = atob(n + '='.repeat((4 - (n.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function quotedPrintable(octets) {
  const txt = dec.decode(octets).replace(/=\r?\n/g, '');
  const out = [];
  for (let i = 0; i < txt.length; i++) {
    if (txt[i] === '=' && /^[0-9A-F]{2}$/i.test(txt.slice(i + 1, i + 3))) { out.push(parseInt(txt.slice(i + 1, i + 3), 16)); i += 2; }
    else out.push(txt.charCodeAt(i) & 255);
  }
  return new Uint8Array(out);
}

function chercher(octets, motif, depuis) {
  outer: for (let i = depuis; i <= octets.length - motif.length; i++) {
    for (let j = 0; j < motif.length; j++) if (octets[i + j] !== motif[j]) continue outer;
    return i;
  }
  return -1;
}

/** Découpe un corps multipart selon sa frontière. */
function sousParties(corps, frontiere) {
  const marque = new TextEncoder().encode(`--${frontiere}`);
  const parts = [];
  let i = chercher(corps, marque, 0);
  while (i >= 0) {
    let debut = i + marque.length;
    if (corps[debut] === 45 && corps[debut + 1] === 45) break; // « --frontière-- » : fin
    while (corps[debut] === 13 || corps[debut] === 10 || corps[debut] === 32 || corps[debut] === 9) debut++;
    const suivant = chercher(corps, marque, debut);
    let fin = suivant < 0 ? corps.length : suivant;
    if (corps[fin - 1] === 10) fin--;
    if (corps[fin - 1] === 13) fin--;
    parts.push(corps.subarray(debut, fin));
    if (suivant < 0) break;
    i = suivant;
  }
  return parts;
}

/** Texte avec le bon jeu de caractères (utf-8, iso-8859-1, windows-1252…). */
function texte(octets, charset) {
  try { return new TextDecoder(charset || 'utf-8').decode(octets); } catch { return new TextDecoder('utf-8').decode(octets); }
}

/** En-tête encodé « =?utf-8?Q?D=C3=A9sactivation?= » ou « =?utf-8?B?…?= » remis en clair. */
function enClair(valeur = '') {
  return valeur.replace(/\?=\s+=\?/g, '?==?').replace(/=\?([^?]+)\?([QB])\?([^?]*)\?=/gi, (_, cs, enc, v) => {
    const oct = enc.toUpperCase() === 'B'
      ? base64(new TextEncoder().encode(v))
      : quotedPrintable(new TextEncoder().encode(v.replace(/_/g, ' ')));
    return texte(oct, cs);
  });
}

/** En-têtes utiles du mail (expéditeur, sujet, date), son texte brut et toutes ses pièces jointes PDF. */
export function lireMail(octets, profondeur = 0) {
  const { entetes, corps } = decouper(octets);
  const pdfs = [];
  const textes = [];
  const visiter = (oct, niveau) => {
    if (niveau > 6) return;
    const { entetes: e, corps: c } = decouper(oct);
    const type = (e['content-type'] || 'text/plain').toLowerCase();
    if (type.startsWith('multipart/')) {
      const f = parametre(e['content-type'], 'boundary');
      if (f) for (const p of sousParties(c, f)) visiter(p, niveau + 1);
      return;
    }
    if (type.startsWith('message/rfc822')) { visiter(c, niveau + 1); return; }
    const nom = enClair(parametre(e['content-disposition'], 'filename') || parametre(e['content-type'], 'name'));
    const enc = (e['content-transfer-encoding'] || '').toLowerCase();
    const decode = () => (enc === 'base64' ? base64(c) : enc === 'quoted-printable' ? quotedPrintable(c) : c);
    if (type.startsWith('text/') && !nom) {
      const t = texte(decode(), parametre(e['content-type'], 'charset'));
      textes.push(type.startsWith('text/html') ? t.replace(/<br\s*\/?>|<\/(p|div|tr)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ') : t);
      return;
    }
    if (!type.startsWith('application/pdf') && !/\.pdf$/i.test(nom)) return;
    const brut = decode();
    const debut = chercher(brut, [37, 80, 68, 70, 45], 0); // « %PDF- »
    if (debut >= 0 && debut < 1024) pdfs.push({ nom: nom || 'maa.pdf', octets: brut.subarray(debut) });
  };
  visiter(octets, profondeur);
  return { de: enClair(entetes.from || ''), sujet: enClair(entetes.subject || ''), date: entetes.date || '', texte: textes.join('\n'), pdfs };
}
