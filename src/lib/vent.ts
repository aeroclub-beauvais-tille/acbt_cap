// Bloc « Vent et pistes » de LFOB : même rendu sur le tableau de bord TV et dans l'espace membre.
// Couronne façon station météo, les deux pistes à leur orientation réelle (QFU 122°/302° et 040°/220°,
// la petite piste au nord de la grande), cône bleu d'où vient le vent, puis les composantes pour chaque sens de piste.

// Mesure de la station Météo-France de Beauvais-Tillé (60639001), une toutes les 6 min
export interface Obs { dir: number | null; f: number; g: number | null; t: number }
// Vent à afficher (station ou METAR)
export interface Vent { ventDir: number | 'VRB' | string | null; ventForce: number | null; rafales: number | null; ventVar?: [number, number] | null }

// Cap magnétique exact sur 3 chiffres (040°)
const p3 = (c: number) => String(c).padStart(3, '0');
// La 04/22 est posée sur le rayon 040° du cercle, pour qu'elle pointe visuellement vers la bonne graduation
const PISTES = [
  { a: ['12', 122], b: ['30', 302], cap: 122, cx: -2.5, cy: 3, l: 58 },
  { a: ['04', 40], b: ['22', 220], cap: 40, cx: 15, cy: -17.9, l: 24 },
] as const;
export const TRAVERS_MAX = 22; // kt, limite de vent de travers du DR400

// Station → vent affichable (la station ne donne pas de secteur de variation)
export const ventStation = (st: Obs): Vent => ({ ventDir: st.dir ?? (st.f ? 'VRB' : null), ventForce: st.f, rafales: st.g, ventVar: null });

// m : vent à afficher ; station : vrai si la mesure vient de la station (pas de « variable ») ;
// coneAng : angle actuel du cône, pour qu'il pivote en douceur à chaque nouvelle mesure
export function rendreVent(m: Vent | null | undefined, station: boolean, coneAng: number | null) {
  const dir = typeof m?.ventDir === 'number' ? m.ventDir : null;
  const f = m?.ventForce ?? null;
  const g = m?.rafales ?? null;
  const R = 54;
  const pt = (deg: number, r: number, x0 = 0, y0 = 0) => [x0 + r * Math.sin((deg * Math.PI) / 180), y0 - r * Math.cos((deg * Math.PI) / 180)];
  let s = '<svg viewBox="-70 -70 140 140" aria-hidden="true">';
  for (let d = 0; d < 360; d += 10) {
    const [x1, y1] = pt(d, R), [x2, y2] = pt(d, R - 6);
    s += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${d === 0 ? 'var(--bad)' : 'var(--muted)'}" stroke-width="2.6" stroke-linecap="round"/>`;
  }
  for (const [t, d] of [['N', 0], ['E', 90], ['S', 180], ['O', 270]] as const) {
    const [x, y] = pt(d, R + 9);
    s += `<text x="${x.toFixed(1)}" y="${(y + 3.2).toFixed(1)}" fill="var(--muted)" font-size="9" font-weight="800" text-anchor="middle">${t}</text>`;
  }
  if (dir != null && f) {
    const [a, b] = m!.ventVar ?? [dir - 15, dir + 15];
    const ouv = ((b - a) % 360 + 360) % 360;
    const r2 = R - 7;
    // Cône dessiné vers le nord puis tourné : à chaque nouvelle mesure il pivote en douceur (par le plus court chemin)
    const [ax, ay] = pt(a - dir, r2), [bx, by] = pt(b - dir, r2);
    const vers = coneAng == null ? dir : coneAng + ((((dir - coneAng) % 360) + 540) % 360) - 180;
    s += `<g class="cone" data-vers="${vers}" style="transform:rotate(${coneAng ?? vers}deg)"><path d="M0 0 L${ax.toFixed(2)} ${ay.toFixed(2)} A${r2} ${r2} 0 ${ouv > 180 ? 1 : 0} 1 ${bx.toFixed(2)} ${by.toFixed(2)} Z" fill="#1e9bff" opacity=".5"/></g>`;
  }
  // Pistes : bande grise, axe en pointillés, numéros aux seuils (le 12 au nord-ouest, le 04 au sud-ouest)
  for (const p of PISTES) {
    const [x1, y1] = pt(p.cap + 180, p.l / 2, p.cx, p.cy), [x2, y2] = pt(p.cap, p.l / 2, p.cx, p.cy);
    s += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="var(--ink2, var(--ink-2))" stroke-width="6.5" stroke-linecap="butt" opacity=".9"/>`
      + `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="var(--panel, var(--surface))" stroke-width=".7" stroke-dasharray="2.5 2"/>`;
    const [lx1, ly1] = pt(p.cap + 180, p.l / 2 + 6, p.cx, p.cy), [lx2, ly2] = pt(p.cap, p.l / 2 + 6, p.cx, p.cy);
    s += `<text x="${lx1.toFixed(1)}" y="${(ly1 + 2.3).toFixed(1)}" fill="var(--ink)" font-size="6.5" font-weight="800" text-anchor="middle" font-family="JetBrains Mono, monospace">${p.a[0]}</text>`
      + `<text x="${lx2.toFixed(1)}" y="${(ly2 + 2.3).toFixed(1)}" fill="var(--ink)" font-size="6.5" font-weight="800" text-anchor="middle" font-family="JetBrains Mono, monospace">${p.b[0]}</text>`;
  }
  s += '</svg>';
  const gauche = !m ? '—' : f === 0 ? 'Calme' : m.ventDir === 'VRB' ? 'VRB' : dir != null ? `${String(dir).padStart(3, '0')}°` : '—';
  const sous = (g && f ? `<div class="vraf">rafales ${g} kt</div>` : '') + (station ? '' : m?.ventVar ? `<div class="vsous">variable ${String(m.ventVar[0]).padStart(3, '0')}° à ${String(m.ventVar[1]).padStart(3, '0')}°</div>` : m?.ventDir === 'VRB' && f ? '<div class="vsous">direction variable</div>' : '');
  const droite = f == null || f === 0 ? '' : `<i class="sep"></i><span>${f} kt</span>`;
  // Composantes pour chaque sens de piste. Piste préférentielle sur CHAQUE piste = le sens qui a le vent de face ;
  // par vent plein travers (à moins de 10° de la perpendiculaire) ou sans composante de face, les deux sens sont mis en avant
  const comp = (cap: number, v: number) => { const a = ((dir! - cap) * Math.PI) / 180; return { face: Math.round(v * Math.cos(a)), trav: Math.round(v * Math.sin(a)) }; };
  const conseilles = new Set<string>();
  if (dir != null && f) {
    for (const p of PISTES) {
      const cosA = Math.cos(((dir - p.a[1]) * Math.PI) / 180);
      // Vent dans l'axe à 10° près et au moins 1 kt de face : un seul QFU conseillé.
      // Sinon (vent de travers pur, ou composante de face nulle) : les deux QFU de la piste se valent
      if (Math.abs(cosA) >= Math.sin((10 * Math.PI) / 180) && Math.round(Math.abs(f * cosA)) >= 1) conseilles.add(cosA > 0 ? p.a[0] : p.b[0]);
      else { conseilles.add(p.a[0]); conseilles.add(p.b[0]); }
    }
  }
  const qfus = PISTES.flatMap((p) => [p.a, p.b]).map(([n, cap]) => {
    if (dir == null || f == null) return `<div class="qfu"><span class="n">${n}<i>${p3(cap)}°</i></span><div><b>${f === 0 ? 'Vent calme' : 'Vent variable'}</b><small>pas de composante</small></div></div>`;
    const c = comp(cap, f), cg = g ? comp(cap, g) : null;
    const t1 = c.face >= 0 ? `${c.face} kt de face` : `${-c.face} kt arrière`;
    const cote = (v: number) => (v > 0 ? ' droite' : v < 0 ? ' gauche' : '');
    const tMax = Math.max(Math.abs(c.trav), cg ? Math.abs(cg.trav) : 0);
    const trop = tMax >= TRAVERS_MAX;
    // Petit panneau « attention » quand le travers (rafales comprises) atteint la limite du DR400
    const att = trop ? `<svg class="att" viewBox="0 0 24 24" aria-label="Vent de travers ≥ ${TRAVERS_MAX} kt (limite DR400)"><path d="M12 2.5 1.5 21h21z" fill="currentColor"/><path d="M12 9.5v5.2M12 17.6v.1" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>` : '';
    const t2 = `${att}${Math.abs(c.trav)} kt travers${cote(c.trav)}` + (cg ? `<br>rafales ${Math.abs(cg.trav)} kt travers` : '');
    return `<div class="qfu${conseilles.has(n) ? ' co' : c.face < 0 ? ' arr' : ''}"><span class="n">${n}<i>${p3(cap)}°</i></span><div><b>${t1}</b><small>${t2}</small></div></div>`;
  }).join('');
  return { svg: s, gauche, droite, sous, qfus };
}

// Lecture d'une réponse de l'API Observation v2 (infrahoraire-6m) : dernière mesure, en nœuds, direction arrondie à 10°
export function lireMesure(l: unknown): Obs | null {
  const o = Array.isArray(l) ? l.filter((x) => x && typeof x.ff === 'number').sort((a, b) => Date.parse(b.validity_time) - Date.parse(a.validity_time))[0] : null;
  if (!o) return null;
  const kt = (ms: number) => Math.round(ms * 1.94384);
  const f = kt(o.ff), g = typeof o.raf10 === 'number' ? kt(o.raf10) : null;
  return { dir: f > 0 && typeof o.dd === 'number' ? Math.round(o.dd / 10) * 10 % 360 || 360 : null, f, g: g != null && g - f >= 5 && g >= 10 ? g : null, t: Date.parse(o.validity_time) };
}
