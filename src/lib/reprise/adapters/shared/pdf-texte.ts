// Lecture de la COUCHE TEXTE d'un PDF NATIF (grand livre edite par un syndic) via pdfjs-dist.
// Pour un PDF natif, chaque chiffre exact est deja dans le fichier : re-OCRiser les pixels
// (pipeline Mistral OCR) est la source des erreurs de recopie sur les tableaux denses. Ici on
// lit directement les ITEMS DE TEXTE avec leur POSITION (x, y, largeur), ce qui permet de
// reconstruire les colonnes par coordonnees plutot que par comptage de cellules markdown.
//
// Ce module fait deux choses SEPAREES pour rester testable :
//   - extraireTextePages : l'appel pdfjs (I/O, non pur, import dynamique cote Node) ;
//   - reconstruireLignes / estPdfNatif : de la logique PURE (aucun reseau), testable avec des
//     items positionnes synthetiques.
//
// pdfjs est importe DYNAMIQUEMENT (build legacy, sans worker) pour rester cote serveur/Node et
// ne pas alourdir le bundle : l'extraction compta ne tourne jamais dans le navigateur.

/** Un item de texte du PDF avec sa position (origine PDF = bas-gauche, y croit vers le haut). */
export interface ItemTexte {
  /** Bord GAUCHE de l'item (unites PDF). */
  x: number;
  /** Ligne de base verticale de l'item (unites PDF ; plus grand = plus haut sur la page). */
  y: number;
  /** Largeur de l'item (permet de calculer le bord droit x + largeur). */
  largeur: number;
  /** Le texte de l'item, tel que rendu par la couche texte. */
  chaine: string;
}

/** Une ligne visuelle reconstruite : les items partageant (a la tolerance pres) la meme y. */
export interface LigneTexte {
  /** y de reference de la ligne (celle du premier item rencontre). */
  y: number;
  /** Items de la ligne, tries par x croissant (gauche -> droite). */
  items: ItemTexte[];
}

/** Une page du PDF : ses dimensions + ses lignes reconstruites + un compteur d'items utiles. */
export interface PageTexte {
  largeur: number;
  hauteur: number;
  lignes: LigneTexte[];
  /** Nombre d'items non vides (sert a distinguer un PDF natif d'un scan sans couche texte). */
  nbItems: number;
}

/** Tolerance verticale (unites PDF) pour regrouper des items sur une meme ligne visuelle. */
const TOL_LIGNE = 3;

/**
 * Regroupe des items positionnes en LIGNES visuelles (meme y a la tolerance pres), chaque ligne
 * triee par x. PUR : aucune I/O. On trie d'abord par y decroissant (haut de page -> bas) puis on
 * agrege ; les grands livres ont des lignes espacees de ~9 unites, une tolerance de 3 ne fusionne
 * jamais deux lignes distinctes.
 */
export function reconstruireLignes(items: ItemTexte[], tolerance = TOL_LIGNE): LigneTexte[] {
  const utiles = items.filter((it) => it.chaine.trim() !== "");
  utiles.sort((a, b) => b.y - a.y || a.x - b.x);
  const lignes: LigneTexte[] = [];
  for (const it of utiles) {
    // On rattache a la ligne existante la plus PROCHE en y (dans la tolerance), pas juste la
    // premiere : evite de coller un item a une ligne voisine quand plusieurs sont proches.
    let meilleure: LigneTexte | null = null;
    let meilleureDist = tolerance;
    for (const l of lignes) {
      const d = Math.abs(l.y - it.y);
      if (d < meilleureDist) {
        meilleureDist = d;
        meilleure = l;
      }
    }
    if (!meilleure) {
      meilleure = { y: it.y, items: [] };
      lignes.push(meilleure);
    }
    meilleure.items.push(it);
  }
  for (const l of lignes) l.items.sort((a, b) => a.x - b.x);
  return lignes;
}

/**
 * Un jeu de pages provient-il d'un PDF NATIF (couche texte exploitable) plutot que d'un SCAN ?
 * Un scan (page = image) n'a quasiment aucun item de texte ; un grand livre natif en a des
 * centaines par page. On mesure la moyenne d'items utiles par page. Sous le seuil -> scan ->
 * l'appelant garde le pipeline OCR. PUR.
 */
export function estPdfNatif(pages: PageTexte[]): boolean {
  if (pages.length === 0) return false;
  const total = pages.reduce((s, p) => s + p.nbItems, 0);
  return total / pages.length >= 20;
}

/**
 * Nombre de pages d'un PDF (lecture du xref seulement : pas d'extraction de contenu, cout
 * negligeable). Sert a la pre-verification des plafonds API AVANT de lancer une extraction IA
 * (audit API 2026-07-16, P1-8 : l'API Anthropic borne un PDF a 100 pages sur un modele 200K -
 * mieux vaut le dire au gestionnaire tout de suite qu'echouer apres l'upload et l'attente).
 * Leve si le PDF est illisible : a l'appelant de degrader (l'extraction remontera sa propre erreur).
 */
export async function nombrePagesPdf(pdf: Uint8Array): Promise<number> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const params: Record<string, unknown> = {
    data: new Uint8Array(pdf), // copie defensive : pdfjs peut detacher le buffer d'entree
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: false,
  };
  const doc = await pdfjs.getDocument(params as Parameters<typeof pdfjs.getDocument>[0]).promise;
  try {
    return doc.numPages;
  } finally {
    await doc.destroy();
  }
}

/**
 * Lit la couche texte d'un PDF -> pages structurees (items positionnes + lignes reconstruites).
 * Import dynamique du build LEGACY de pdfjs (compatible Node), sans worker. Ne rend AUCUN pixel :
 * on ne lit que le texte et ses coordonnees -> pas besoin de canvas ni de polices systeme.
 */
export async function extraireTextePages(pdf: Uint8Array): Promise<PageTexte[]> {
  // Import dynamique : garde pdfjs hors du bundle client et ne le charge qu'a l'usage.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // `disableWorker` est un parametre runtime valide (build legacy = worker factice cote Node) mais
  // absent du type DocumentInitParameters -> on passe par un objet cast pour rester type-safe.
  const params: Record<string, unknown> = {
    // Copie defensive : pdfjs peut detacher/neutraliser le buffer d'entree.
    data: new Uint8Array(pdf),
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: false,
  };
  const doc = await pdfjs.getDocument(params as Parameters<typeof pdfjs.getDocument>[0]).promise;

  const pages: PageTexte[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const contenu = await page.getTextContent();
      const items: ItemTexte[] = [];
      for (const brut of contenu.items as Array<{ str?: string; transform?: number[]; width?: number }>) {
        if (typeof brut.str !== "string") continue; // ignore les marqueurs de structure
        const t = brut.transform ?? [];
        items.push({ x: t[4] ?? 0, y: t[5] ?? 0, largeur: brut.width ?? 0, chaine: brut.str });
      }
      pages.push({
        largeur: viewport.width,
        hauteur: viewport.height,
        lignes: reconstruireLignes(items),
        nbItems: items.filter((i) => i.chaine.trim() !== "").length,
      });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}
