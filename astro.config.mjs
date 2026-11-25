import { defineConfig } from 'astro/config';

// En ligne sur Cloudflare Pages (projet « acbt60 », https://acbt60.fr) : le site est à la racine.
// Publié par .github/workflows/cloudflare.yml (build avec CF_PAGES=1, puis envoi par Wrangler).
// SITE_URL et BASE_PATH, dans l'environnement de build, remplacent ces valeurs.
const cloudflare = !!process.env.CF_PAGES;
const base = process.env.BASE_PATH ?? (cloudflare ? '/' : '/acbt_cap');

/** Préfixe le sous-dossier de déploiement aux liens et images « /uploads/... » écrits dans le texte des actualités. */
function rehypeBase() {
  const prefix = base.replace(/\/$/, '');
  const walk = (node) => {
    if (node.type === 'element') {
      for (const attr of ['href', 'src']) {
        const v = node.properties?.[attr];
        if (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && prefix && !v.startsWith(prefix + '/')) {
          node.properties[attr] = prefix + v;
        }
      }
    }
    node.children?.forEach(walk);
  };
  return walk;
}

export default defineConfig({
  site: process.env.SITE_URL ?? (cloudflare ? 'https://acbt60.fr' : 'https://aeroclub-beauvais-tille.github.io'),
  base,
  trailingSlash: 'ignore',
  markdown: { rehypePlugins: [rehypeBase] },
  // Les feuilles de style (quelques Ko) sont écrites dans la page : un aller-retour réseau de moins avant l'affichage.
  build: { inlineStylesheets: 'always' },
});
