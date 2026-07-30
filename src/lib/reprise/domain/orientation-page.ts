// Domaine PUR de l'ASSERTION D'ORIENTATION d'une page OCRisée (aucune I/O).
//
// POURQUOI CE MODULE EXISTE. Le 2026-07-30, une mesure de Tesseract sur le tableau de
// tantièmes de S0306 a rendu 20, 28 puis 22 cellules selon l'échelle — et ces trois chiffres
// ne mesuraient RIEN : l'image était à l'envers. `RCP 2.pdf` porte `/Rotate 180` sur ses
// **36 pages sur 36**, métadonnée qu'une extraction d'image brute perd silencieusement.
// Redressée, la même page rend 40 cellules à 300 dpi ; à l'envers, **zéro**.
//
// LA LEÇON, plus dure que « figer la chaîne de prétraitement » : **un harnais qui perd une
// métadonnée de page produit un chiffre qui ne mesure rien.** La chaîne doit d'abord être
// CORRECTE, et sa correction doit être PROUVÉE — pas seulement figée.
//
// CE QUE FAIT CE MODULE. Ce qui a sauvé le diagnostic, c'est d'avoir vidé le texte brut au
// lieu de se fier au compteur. Ce réflexe ne doit pas dépendre de la vigilance de celui qui
// lance la mesure : il devient une ASSERTION du harnais. Une page dont la lecture est
// invraisemblable est REFUSÉE, avec l'orientation comme première hypothèse.
//
// LA MÉTADONNÉE SE LIT PAR PAGE, JAMAIS PAR DOCUMENT. Mesuré sur le lot S0306 :
//
//   RCP.pdf            aucun /Rotate      (28 pages)
//   RCP 2.pdf          180 partout        (36 pages)
//   Feuille de présence  0 partout        (5 pages)
//   CONVOCATION        absent x36, 0 x43, 90 x8   <-- TROIS valeurs dans UN SEUL fichier
//   rgd.pdf              0 partout        (6 pages)
//
// La convocation interdit tout raccourci « rotation du document » : huit de ses pages sont à
// **90°**. Il faut donc couvrir 90 et 270 autant que 180 — d'où une formulation des messages
// qui parle de page MAL ORIENTÉE, et non « à l'envers », qui ne vaudrait que pour 180.

/** Un token rendu par l'OCR, réduit à ce qui sert à juger la vraisemblance. */
export interface TokenOcr {
  texte: string;
  /** Confiance du moteur, 0-100. */
  confiance: number;
}

export type VerdictOrientation = "vraisemblable" | "suspecte";

export interface ResultatOrientation {
  verdict: VerdictOrientation;
  /** Confiance moyenne sur les tokens non vides. */
  confianceMoyenne: number;
  /** Nombre de tokens numériques lus. */
  nbNumeriques: number;
  /** Ancres attendues effectivement trouvées (si des ancres ont été fournies). */
  ancresTrouvees: string[];
  /** Raison lisible du refus, vide si la page est vraisemblable. */
  raison: string;
}

/**
 * RECALIBRAGE DU 30/07, APRES MESURE SUR LA CHAINE REELLE. La premiere version de ce module
 * bloquait sur trois signaux (ancre, absence de numerique, confiance moyenne) calibres sur des
 * valeurs SYNTHETIQUES : 93 de confiance pour une page droite, 58 pour une page renversee.
 * Confrontes aux vrais rendus pdfjs + tesseract.js du lot S0306, deux de ces trois signaux se
 * sont reveles FAUX :
 *
 *   page                                verite    conf.moy  long.moy  numeriques
 *   RCP 2 p30, /Rotate 180 honore       BONNE       47,3      1,67        60
 *   CONVOC p15, /Rotate 90 honore       BONNE       16,5      2,52         0
 *   Feuille de presence p1              BONNE       72,1      3,95        87
 *   rgd p1                              BONNE       91,9      5,60        57
 *   RCP 2 p30, metadonnee PERDUE        MAUVAISE    35,9      1,71        34
 *
 * Trois enseignements, tous contre la version precedente :
 *   1. une BONNE page tombe a 47,3 de confiance (scan de 1975) et une autre a 16,5 (page
 *      pauvre) : un seuil a 75 les refusait toutes les deux ;
 *   2. la confiance NE SEPARE PAS le bon du mauvais sur la meme page (47,3 contre 35,9) --
 *      l'ecart synthetique 93/58 n'existe pas sur du scan reel ;
 *   3. une bonne page de tableau a des tokens de 1,67 caractere (des nombres a deux chiffres)
 *      et une bonne page peut n'avoir AUCUN numerique.
 *
 * On ne garde donc comme signal BLOQUANT que celui qui a resiste : L'ANCRE. Sur la meme page,
 * redressee elle porte « TABLEAU », renversee elle porte « TIALYAV » -- c'est net, et c'est le
 * seul qui l'est. Les autres mesures restent RENDUES (elles nourrissent le rapport et le
 * protocole §5) mais ne refusent plus rien : refuser a tort ferait redemander des pieces a
 * l'ancien syndic sans raison, ce qui brule du credit aupres de quelqu'un deja reticent.
 *
 * Le filet n'est pas affaibli pour autant : l'orientation est couverte par TROIS mecanismes de
 * natures differentes -- la metadonnee /Rotate (adapter), l'OSD seuille (decisionOsd), et
 * l'oracle arithmetique du garde-fou (domain/garde-extraction), qui reste le dernier mot.
 */

/**
 * Plancher de confiance en dessous duquel la page est jugee QUASI ILLISIBLE. Pose tres bas
 * (10) parce que la mesure a montre des pages saines a 16,5 : ce n'est pas un diagnostic
 * d'orientation, c'est un constat d'illisibilite.
 */
export const SEUIL_CONFIANCE_PAGE = 10;

/** En dessous de ce nombre de tokens, la page est trop pauvre pour qu'on juge quoi que ce soit. */
const MIN_TOKENS_POUR_JUGER = 10;

function plier(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

/**
 * Verifie qu'une page OCRisee est vraisemblablement dans le bon sens.
 *
 * UN SEUL signal bloquant, celui qui a survecu a la mesure : les ANCRES. Un mot qu'on SAIT
 * devoir figurer sur la page (« TABLEAU », « REPARTITION »). Absent, la page est suspecte --
 * a l'envers, « TABLEAU » se lit « TIALYAV ».
 *
 * `tableauAttendu` et la confiance ne sont plus des motifs de refus (cf. recalibrage
 * ci-dessus) : ils restent rendus dans le resultat pour le rapport et le protocole de mesure.
 */
export function verifierOrientationPage(params: {
  tokens: readonly TokenOcr[];
  /** Mots dont la presence est attendue sur cette page (insensible casse/accents). */
  ancresAttendues?: readonly string[];
  /** La page est censee porter un tableau de valeurs. INFORMATIF : ne refuse plus rien. */
  tableauAttendu?: boolean;
}): ResultatOrientation {
  const { tokens, ancresAttendues = [] } = params;
  const utiles = tokens.filter((t) => t.texte.trim() !== "");
  const confiances = utiles.map((t) => t.confiance).filter((c) => c >= 0);
  const confianceMoyenne =
    confiances.length === 0 ? 0 : confiances.reduce((s, c) => s + c, 0) / confiances.length;
  const numeriques = utiles.filter((t) => /^\d+$/.test(t.texte.trim().replace(/[\s.]/g, "")));

  const texteReplie = plier(utiles.map((t) => t.texte).join(" "));
  const ancresTrouvees = ancresAttendues.filter((a) => texteReplie.includes(plier(a)));

  const base = {
    confianceMoyenne: Math.round(confianceMoyenne * 10) / 10,
    nbNumeriques: numeriques.length,
    ancresTrouvees,
  };

  // Page trop pauvre : on ne conclut RIEN plutot que de refuser sur du vide (page de garde,
  // verso blanc). Refuser a tort ferait redemander des pieces sans raison.
  if (utiles.length < MIN_TOKENS_POUR_JUGER) {
    return { ...base, verdict: "vraisemblable", raison: "" };
  }

  // LE signal bloquant, seul rescape du recalibrage.
  if (ancresAttendues.length > 0 && ancresTrouvees.length === 0) {
    return {
      ...base,
      verdict: "suspecte",
      raison:
        `Aucun des mots attendus (${ancresAttendues.join(", ")}) n'a ete lu sur cette page. ` +
        `Premiere hypothese : la page est MAL ORIENTEE -- verifier que le rendu honore la ` +
        `metadonnee /Rotate de CETTE page (elle varie au sein d'un meme document : sur le lot ` +
        `S0306, une convocation porte trois valeurs differentes dont huit pages a 90 degres).`,
    };
  }

  // Dernier filet, tres bas : la page n'est pas mal orientee, elle est illisible.
  if (confianceMoyenne < SEUIL_CONFIANCE_PAGE) {
    return {
      ...base,
      verdict: "suspecte",
      raison:
        `Confiance moyenne de ${base.confianceMoyenne} sur 100 : la page est quasi illisible. ` +
        `Ce n'est pas un diagnostic d'orientation -- des pages saines de ce lot descendent a ` +
        `16,5. Demander une version lisible plutot que de rejouer la lecture.`,
    };
  }

  return { ...base, verdict: "vraisemblable", raison: "" };
}

// --- OSD : l'orientation lue DANS L'IMAGE, et son seuil de confiance ---------------
//
// L'OSD (`tesseract.js` `detect()`) rend un angle sans lire aucune métadonnée. C'est un SECOND
// filet, indispensable quand `/Rotate` est ABSENT — une page sans métadonnée n'est pas une page
// droite, c'est une page dont on ne sait rien.
//
// MAIS IL NE SE CROIT PAS SUR PAROLE. Mesuré le 30/07 sur le lot S0306 :
//
//   RCP 2 p30, /Rotate honoré        OSD 0     conf 11,2   droite      OK
//   RCP 2 p30, métadonnée perdue     OSD 180   conf 11,5   à l'envers  OK
//   CONVOC p15, /Rotate honoré       OSD 0     conf 18,8   droite      OK
//   CONVOC p15, métadonnée perdue    OSD 90    conf 15,1   tournée     OK
//   RCP.pdf p1                       OSD 180   conf 0,04   droite      FAUX POSITIF
//   RCP.pdf p6                       OSD 0     conf 5,02   droite      OK
//   RCP.pdf p14                      OSD 0     conf 7,63   droite      OK
//
// Tous les verdicts justes sont à confiance >= 5 ; le seul faux positif est à 0,04. Sans seuil,
// un correcteur automatique retournerait de 180° la première page du RCP, qui est droite.
//
// ET UNE CONFIANCE BASSE EST UN SIGNAL, PAS DU BRUIT. La p. 1 du RCP est la couverture
// notariée : elle porte une mention manuscrite écrite VERTICALEMENT dans la marge. La page a
// donc réellement plusieurs orientations, et l'OSD hésite à juste titre. On ne traduit donc pas
// « peu confiant » par « on ne sait pas » mais par « ORIENTATIONS MIXTES » : on ne redresse pas,
// et on marque pour arbitrage humain.

/** Confiance OSD minimale pour AGIR sur l'angle rendu. Calée sous le plancher des verdicts
 *  justes mesurés (5,02) et très au-dessus du faux positif (0,04). */
export const SEUIL_CONFIANCE_OSD = 3;

export type DecisionOsd =
  /** Angle fiable : on peut redresser de `angle` degrés. */
  | { action: "redresser"; angle: number }
  /** L'OSD dit 0 avec assez de confiance : la page est droite, on ne touche à rien. */
  | { action: "laisser"; angle: 0 }
  /** Confiance insuffisante : page vraisemblablement à orientations MIXTES -> arbitrage humain. */
  | { action: "arbitrage_humain"; angle: number; raison: string };

/**
 * Que faire de ce que l'OSD a rendu ?
 *
 * `angleOsd` en degrés (0, 90, 180, 270) et `confiance` telle que rendue par le moteur —
 * attention, l'échelle de l'OSD n'est PAS un pourcentage : les valeurs justes observées vont
 * de 5 à 19.
 */
export function decisionOsd(angleOsd: number, confiance: number): DecisionOsd {
  const angle = ((Math.round(angleOsd / 90) * 90) % 360 + 360) % 360;
  if (confiance < SEUIL_CONFIANCE_OSD) {
    return {
      action: "arbitrage_humain",
      angle,
      raison:
        `Orientation détectée à ${angle}° mais avec une confiance de ${confiance} (seuil ` +
        `${SEUIL_CONFIANCE_OSD}). Une confiance aussi basse signale en général une page à ` +
        `ORIENTATIONS MIXTES — typiquement une couverture notariée portant une mention ` +
        `manuscrite écrite verticalement dans la marge. On ne redresse pas : à arbitrer à l'œil.`,
    };
  }
  return angle === 0 ? { action: "laisser", angle: 0 } : { action: "redresser", angle };
}
