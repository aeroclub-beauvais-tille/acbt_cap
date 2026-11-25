// Données communes aux trois maquettes d'accueil.
import { getCollection } from 'astro:content';
import pages from '../data/pages.json';
import f from '../data/formations.json';
export const pg = pages.accueil;
export const annees = new Date().getFullYear() - 1979;
export const heroImg = pg.diaporama[0].image;
export const avions = async () => (await getCollection('avions', (a) => a.data.actif)).sort((a, b) => a.data.ordre - b.data.ordre);
export const actus = async (k = 3) => (await getCollection('actualites', (a) => a.data.publie && !!(a.data.image ?? a.data.galerie[0]))).sort((a, b) => b.data.date.getTime() - a.data.date.getTime()).slice(0, k);
export const parcours = f.parcours.slice(0, 4);
export const clubHouse = '/uploads/historique/2012-locaux-01.jpg';
export const chiffres = (nb: number) => pg.atouts.map((a) => ({ ...a, chiffre: a.chiffre.replace('{avions}', String(nb)) }));
