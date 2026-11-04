// Logique de l'audit responsive (REA-497), separee du script pour etre testable.
//
//   - mesurerPage(opts) : fonction EXECUTEE DANS LA PAGE (page.evaluate). Elle est serialisee
//     par Playwright : elle doit rester autonome (aucune variable ni import hors de son corps).
//   - le reste (routes, classement, rapport) est du JavaScript pur, teste dans
//     audit-responsive.test.mjs sur des mesures fictives.

import { readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

/* ------------------------------------------------------------------ routes */

/** src/app/cles/trousseaux/[id]/page.tsx -> /cles/trousseaux/[id] (groupes "(x)" retires). */
export function cheminVersRoute(cheminPage) {
  const segments = cheminPage
    .split(/[\\/]/)
    .filter((s) => s && s !== "page.tsx" && !/^\(.*\)$/.test(s) && !s.startsWith("@"));
  return "/" + segments.join("/");
}

export function estDynamique(route) {
  return /\[[^\]]+\]/.test(route);
}

/** Toutes les routes page.tsx sous le dossier app (triees). */
export function listerRoutes(dossierApp) {
  const routes = [];
  const parcourir = (dir, relatif) => {
    for (const nom of readdirSync(dir)) {
      const chemin = join(dir, nom);
      if (statSync(chemin).isDirectory()) parcourir(chemin, [...relatif, nom]);
      else if (nom === "page.tsx") routes.push(cheminVersRoute([...relatif, nom].join(sep)));
    }
  };
  parcourir(dossierApp, []);
  return routes.sort();
}

/**
 * Remplace les [param] par les valeurs de la config. Retourne null si une valeur manque.
 * config.dynamiques = { "/collaborateurs/[id]": { "id": "abc" } }
 */
export function resoudreRoute(route, config) {
  if (!estDynamique(route)) return route;
  const params = config?.dynamiques?.[route];
  if (!params) return null;
  let manque = false;
  const url = route.replace(/\[([^\]]+)\]/g, (_, nom) => {
    const v = params[nom];
    if (typeof v !== "string" || v.trim() === "") {
      manque = true;
      return "";
    }
    return encodeURIComponent(v.trim());
  });
  return manque ? null : url;
}

/**
 * Decoupe les routes en { aAuditer: [{route, chemin}], ignorees: [{route, raison}] }.
 * filtre : sous-chaine(s) de route (separees par des virgules), vide = tout.
 */
export function planifier(routes, config, filtre) {
  const motifs = (filtre ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const exclues = config?.exclues ?? {};
  const aAuditer = [];
  const ignorees = [];
  for (const route of routes) {
    if (motifs.length && !motifs.some((m) => route.includes(m))) continue;
    if (exclues[route]) {
      ignorees.push({ route, raison: `exclue : ${exclues[route]}` });
      continue;
    }
    const chemin = resoudreRoute(route, config);
    if (chemin === null) {
      ignorees.push({ route, raison: "route dynamique sans id dans audit-responsive.routes.json" });
      continue;
    }
    aAuditer.push({ route, chemin });
  }
  return { aAuditer, ignorees };
}

/* ------------------------------------------------- mesure (dans la page) */

/**
 * Mesure le rendu courant. AUTONOME : serialisee par page.evaluate.
 * opts : { seuilTactile, max }
 */
export function mesurerPage(opts) {
  const seuilTactile = opts.seuilTactile;
  const max = opts.max;
  const racine = document.documentElement;
  const largeurVue = racine.clientWidth;

  const decrire = (el) => {
    const un = (e) => {
      let s = e.tagName.toLowerCase();
      if (e.id) return s + "#" + e.id;
      const cls = typeof e.className === "string" ? e.className.trim().split(/\s+/).filter(Boolean) : [];
      if (cls.length) s += "." + cls.slice(0, 3).join(".");
      return s;
    };
    const chaine = [];
    let cur = el;
    for (let i = 0; i < 3 && cur && cur !== document.body; i++) {
      chaine.unshift(un(cur));
      if (cur.id) break;
      cur = cur.parentElement;
    }
    return chaine.join(" > ");
  };

  const visible = (st, r) =>
    st.display !== "none" && st.visibility !== "hidden" && Number(st.opacity) !== 0 && (r.width > 0 || r.height > 0);

  const extrait = (el) => (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 50);

  // Un ancetre qui defile / coupe en x absorbe le depassement de ses descendants.
  const coupeParAncetre = (el) => {
    for (let p = el.parentElement; p && p !== document.body && p !== racine; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true;
    }
    return false;
  };

  const debordants = [];
  const largeurNulle = [];
  const tronques = [];
  const tactiles = [];
  let nbTronques = 0;
  let nbTactiles = 0;
  let nbDebordants = 0;

  const SANS_BOITE = new Set(["SCRIPT", "STYLE", "LINK", "META", "HEAD", "TITLE", "BR", "WBR", "COL", "COLGROUP", "OPTION", "OPTGROUP", "TEMPLATE", "NOSCRIPT", "AREA", "DATALIST"]);

  for (const el of document.body.querySelectorAll("*")) {
    if (SANS_BOITE.has(el.tagName)) continue;
    if (el instanceof SVGElement && el.tagName.toLowerCase() !== "svg") continue;
    const st = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (!visible(st, r)) continue;
    // Un element fixed est mesure dans le viewport, pas dans le document : exclu du debordement.
    const fixe = st.position === "fixed";

    // 1. debordement horizontal : elements qui depassent du viewport
    if (!fixe && r.width > 0 && (r.right > largeurVue + 1 || r.left < -1) && !coupeParAncetre(el)) {
      nbDebordants++;
      debordants.push({
        selecteur: decrire(el),
        largeur: Math.round(r.width),
        gauche: Math.round(r.left),
        droite: Math.round(r.right),
        depasse: Math.round(Math.max(r.right - largeurVue, -r.left)),
        texte: extrait(el),
      });
    }

    // 2. largeur nulle : boite ecrasee alors qu'elle a du contenu ou une bordure (cas du 04/11)
    if (r.width <= 1 && r.height > 8 && !el.closest("[aria-hidden='true']")) {
      const bordure =
        parseFloat(st.borderLeftWidth) + parseFloat(st.borderRightWidth) + parseFloat(st.borderTopWidth) + parseFloat(st.borderBottomWidth) > 0;
      const aContenu = el.children.length > 0 || extrait(el).length > 0;
      const parent = el.parentElement;
      const parentEcrase = parent && parent.getBoundingClientRect().width <= 1;
      const separateur = el.children.length === 0 && extrait(el).length === 0; // w-px decoratif
      if ((aContenu || (bordure && !separateur)) && !parentEcrase) {
        largeurNulle.push({
          selecteur: decrire(el),
          largeur: Math.round(r.width * 10) / 10,
          hauteur: Math.round(r.height),
          enfants: el.children.length,
          texte: extrait(el),
        });
      }
    }

    // 3. texte tronque (info)
    if (r.width > 1) {
      const coupe = st.overflowX === "hidden" || st.overflowX === "clip" || st.textOverflow === "ellipsis";
      if (coupe && el.scrollWidth > el.clientWidth + 1 && el.children.length < 3 && extrait(el).length > 0) {
        nbTronques++;
        if (tronques.length < max) {
          tronques.push({ selecteur: decrire(el), visible: el.clientWidth, complet: el.scrollWidth, texte: extrait(el) });
        }
      }
    }

    // 4. cibles tactiles (info) ; liens en ligne dans un texte exclus (regle WCAG)
    const interactif = el.matches("a[href], button, select, textarea, input:not([type='hidden']), [role='button'], [role='link'], [role='tab'], summary");
    if (interactif && r.width > 1 && r.height > 1 && !el.disabled) {
      const inlineDansTexte = el.tagName === "A" && st.display === "inline";
      const petit = Math.min(r.width, r.height) < seuilTactile;
      // checkbox/radio dans un label : la cible tactile est le label
      const dansLabel = el.matches("input[type='checkbox'], input[type='radio']") && el.closest("label");
      if (petit && !inlineDansTexte && !dansLabel) {
        nbTactiles++;
        if (tactiles.length < max) {
          tactiles.push({ selecteur: decrire(el), largeur: Math.round(r.width), hauteur: Math.round(r.height), texte: extrait(el) || el.getAttribute("aria-label") || "" });
        }
      }
    }
  }

  debordants.sort((a, b) => b.depasse - a.depasse);

  return {
    largeurVue,
    scrollWidth: racine.scrollWidth,
    debordementDocument: racine.scrollWidth > largeurVue + 1,
    debordants: debordants.slice(0, max),
    nbDebordants,
    largeurNulle: largeurNulle.slice(0, max),
    nbLargeurNulle: largeurNulle.length,
    tronques,
    nbTronques,
    tactiles,
    nbTactiles,
  };
}

/* --------------------------------------------------------------- classement */

export const GRAVITES = ["bloquant", "genant", "info"];
const SEUIL_TACTILE_GENANT = 24;

/**
 * Transforme une mesure (ou une erreur de navigation) en constats classes.
 * entree : { route, chemin, statut?, redirigeeVersConnexion?, erreur?, mesure? }
 * Retourne { ...entree, constats: [{gravite, code, message, elements}], gravite }
 */
export function classer(entree) {
  const constats = [];
  const { mesure } = entree;

  if (entree.erreur) {
    constats.push({ gravite: "genant", code: "non-mesuree", message: `Page non mesurée : ${entree.erreur}`, elements: [] });
  } else if (entree.statut && entree.statut >= 400) {
    constats.push({ gravite: "genant", code: "non-mesuree", message: `Page non mesurée : HTTP ${entree.statut}`, elements: [] });
  } else if (entree.redirigeeVersConnexion) {
    constats.push({ gravite: "genant", code: "non-mesuree", message: "Page non mesurée : redirigée vers la connexion (session absente ou expirée)", elements: [] });
  }

  if (mesure) {
    if (mesure.debordementDocument || mesure.nbDebordants > 0) {
      const exces = Math.max(mesure.scrollWidth - mesure.largeurVue, mesure.debordants[0]?.depasse ?? 0);
      constats.push({
        gravite: "bloquant",
        code: "debordement",
        message: `Débordement horizontal : le document fait ${mesure.scrollWidth} px pour ${mesure.largeurVue} px visibles (+${exces} px), ${mesure.nbDebordants} élément(s) dépassent`,
        elements: mesure.debordants,
      });
    }
    if (mesure.nbLargeurNulle > 0) {
      constats.push({
        gravite: "bloquant",
        code: "largeur-nulle",
        message: `${mesure.nbLargeurNulle} élément(s) écrasé(s) à ≤ 1 px de large alors qu'ils ont du contenu ou une bordure`,
        elements: mesure.largeurNulle,
      });
    }
    if (mesure.nbTactiles > 0) {
      // Genant seulement si une cible echantillonnee est vraiment minuscule (< 24 px).
      const minuscule = mesure.tactiles.some((t) => Math.min(t.largeur, t.hauteur) < SEUIL_TACTILE_GENANT);
      constats.push({
        gravite: minuscule ? "genant" : "info",
        code: "cibles-tactiles",
        message: `${mesure.nbTactiles} cible(s) tactile(s) sous le seuil${minuscule ? ` dont certaines < ${SEUIL_TACTILE_GENANT} px` : ""}`,
        elements: mesure.tactiles,
      });
    }
    if (mesure.nbTronques > 0) {
      constats.push({
        gravite: "info",
        code: "texte-tronque",
        message: `${mesure.nbTronques} texte(s) tronqué(s) (overflow hidden / ellipsis)`,
        elements: mesure.tronques,
      });
    }
  }

  const gravite = GRAVITES.find((g) => constats.some((c) => c.gravite === g)) ?? "ok";
  return { ...entree, constats, gravite };
}

/** 1 s'il y a du bloquant ; 2 si seulement des pages non mesurees ; 0 sinon. */
export function codeSortie(resultats) {
  if (resultats.some((r) => r.constats.some((c) => c.gravite === "bloquant"))) return 1;
  if (resultats.some((r) => r.constats.some((c) => c.code === "non-mesuree"))) return 2;
  return 0;
}

export function synthese(resultats) {
  const s = { pages: resultats.length, bloquant: 0, genant: 0, info: 0, ok: 0 };
  for (const r of resultats) s[r.gravite]++;
  return s;
}

/* ------------------------------------------------------------------ rapport */

const LIBELLES = { bloquant: "BLOQUANT", genant: "GÊNANT", info: "INFO" };

function ligneElement(e) {
  const dims = [];
  if (e.depasse !== undefined) dims.push(`dépasse de ${e.depasse} px (${e.gauche}→${e.droite})`);
  else if (e.complet !== undefined) dims.push(`${e.visible}/${e.complet} px`);
  else if (e.hauteur !== undefined) dims.push(`${e.largeur}×${e.hauteur} px`);
  const texte = e.texte ? ` « ${e.texte} »` : "";
  return `  - \`${e.selecteur}\` ${dims.join(" ")}${texte}`;
}

export function rapportMarkdown(resultats, meta) {
  const s = synthese(resultats);
  const lignes = [];
  lignes.push(`# Audit responsive (${meta.largeur} px)`);
  lignes.push("");
  lignes.push(`- Base : ${meta.base}`);
  lignes.push(`- Date : ${meta.date}`);
  lignes.push(`- Pages mesurées : ${s.pages} — bloquantes ${s.bloquant}, gênantes ${s.genant}, info ${s.info}, propres ${s.ok}`);
  if (meta.ignorees?.length) lignes.push(`- Pages ignorées : ${meta.ignorees.length} (voir en bas)`);
  lignes.push("");
  lignes.push("| Page | Gravité | Constats |");
  lignes.push("| --- | --- | --- |");
  const ordre = { bloquant: 0, genant: 1, info: 2, ok: 3 };
  const tries = [...resultats].sort((a, b) => ordre[a.gravite] - ordre[b.gravite] || a.route.localeCompare(b.route));
  for (const r of tries) {
    const res = r.constats.map((c) => c.code).join(", ") || "—";
    lignes.push(`| \`${r.route}\` | ${r.gravite === "ok" ? "ok" : LIBELLES[r.gravite]} | ${res} |`);
  }
  for (const g of GRAVITES) {
    const pages = tries.filter((r) => r.gravite === g);
    if (!pages.length) continue;
    lignes.push("");
    lignes.push(`## ${LIBELLES[g]} (${pages.length} page${pages.length > 1 ? "s" : ""})`);
    for (const r of pages) {
      lignes.push("");
      lignes.push(`### \`${r.route}\`${r.chemin !== r.route ? ` → ${r.chemin}` : ""}`);
      if (r.capture) lignes.push(`Capture : ${r.capture}`);
      for (const c of r.constats) {
        lignes.push("");
        lignes.push(`- **${LIBELLES[c.gravite]}** ${c.message}`);
        for (const e of c.elements) lignes.push(ligneElement(e));
      }
    }
  }
  if (meta.ignorees?.length) {
    lignes.push("");
    lignes.push("## Pages ignorées");
    lignes.push("");
    for (const i of meta.ignorees) lignes.push(`- \`${i.route}\` : ${i.raison}`);
  }
  lignes.push("");
  return lignes.join("\n");
}

/** Nom de fichier sur pour la capture : /cles/trousseaux/12 -> cles-trousseaux-12 */
export function nomCapture(chemin) {
  const s = chemin.replace(/[?#].*$/, "").replace(/^\/+|\/+$/g, "").replace(/[^a-zA-Z0-9]+/g, "-");
  return s || "racine";
}
