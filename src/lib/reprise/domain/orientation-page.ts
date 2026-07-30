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
 * Seuil de confiance moyenne en dessous duquel une page est suspecte.
 *
 * Calé sur l'écart MESURÉ entre les deux orientations de la même page : **93,2** redressée
 * contre **58,0** à l'envers. 75 est au milieu, loin des deux — un seuil serré ne gagnerait
 * rien et ferait refuser des scans légitimement médiocres.
 */
export const SEUIL_CONFIANCE_PAGE = 75;

/** En dessous de ce nombre de tokens, la page est trop pauvre pour qu'on juge quoi que ce soit. */
const MIN_TOKENS_POUR_JUGER = 10;

/**
 * Longueur moyenne de token en dessous de laquelle la page est lue en FRAGMENTS — symptôme
 * d'une rotation de 90 ou 270°, où le texte devient vertical. Un texte français normal tourne
 * autour de 5 caractères par token ; une page verticale tombe à 1-2.
 */
const SEUIL_LONGUEUR_TOKEN = 2.2;

function plier(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

/**
 * Vérifie qu'une page OCRisée est vraisemblablement dans le bon sens.
 *
 * Trois signaux, du plus fiable au plus faible :
 *   1. **les ancres** — un mot qu'on SAIT devoir figurer sur la page (« TABLEAU »,
 *      « REPARTITION », « TANTIEMES »). Aucune ancre trouvée alors qu'on en attendait est le
 *      signal le plus sûr : à l'envers, « TABLEAU » se lit « TIALYAV.L » ;
 *   2. **l'absence totale de numérique** sur une page censée porter un tableau de valeurs —
 *      c'est exactement le symptôme observé (0 cellule « 56 » sur 50) ;
 *   3. **la confiance moyenne**, qui s'effondre de 93 à 58 quand l'image est renversée.
 *
 * `tableauAttendu` doit être posé pour les pages de tantièmes : sans lui, le signal 2 est
 * inactif (une page de texte n'a pas à contenir des nombres).
 */
export function verifierOrientationPage(params: {
  tokens: readonly TokenOcr[];
  /** Mots dont la présence est attendue sur cette page (comparaison insensible casse/accents). */
  ancresAttendues?: readonly string[];
  /** La page est censée porter un tableau de valeurs numériques. */
  tableauAttendu?: boolean;
}): ResultatOrientation {
  const { tokens, ancresAttendues = [], tableauAttendu = false } = params;
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

  // Page trop pauvre : on ne conclut RIEN plutôt que de refuser sur du vide (une page de
  // garde, un verso blanc). Refuser à tort ferait redemander des pièces sans raison.
  if (utiles.length < MIN_TOKENS_POUR_JUGER) {
    return { ...base, verdict: "vraisemblable", raison: "" };
  }

  if (ancresAttendues.length > 0 && ancresTrouvees.length === 0) {
    return {
      ...base,
      verdict: "suspecte",
      raison:
        `Aucun des mots attendus (${ancresAttendues.join(", ")}) n'a été lu sur cette page. ` +
        `Première hypothèse : la page est MAL ORIENTÉE — vérifier que le rendu honore la ` +
        `métadonnée /Rotate de CETTE page (elle varie au sein d'un même document : sur le lot ` +
        `S0306, une convocation porte trois valeurs différentes dont huit pages à 90°).`,
    };
  }

  if (tableauAttendu && numeriques.length === 0) {
    return {
      ...base,
      verdict: "suspecte",
      raison:
        `Aucune valeur numérique lue sur une page censée porter un tableau de tantièmes. ` +
        `Première hypothèse : la page est MAL ORIENTÉE — à 180° les chiffres se lisent comme ` +
        `des lettres (« 56 » devient « 9S ») ; à 90° ou 270° les colonnes deviennent des ` +
        `lignes et l'OCR ne rend plus que des fragments d'un ou deux caractères.`,
    };
  }

  // Signal propre au 90/270 : le texte devient vertical, l'OCR ne rend plus que des
  // fragments. Une page normale a une longueur moyenne de token nettement supérieure.
  const longueurMoyenne =
    utiles.reduce((s, t) => s + t.texte.trim().length, 0) / Math.max(1, utiles.length);
  if (longueurMoyenne < SEUIL_LONGUEUR_TOKEN) {
    return {
      ...base,
      verdict: "suspecte",
      raison:
        `Longueur moyenne des tokens de ${Math.round(longueurMoyenne * 10) / 10} caractère(s) : ` +
        `la page est lue en fragments. Première hypothèse : une rotation de 90° ou 270° ` +
        `(le texte devient vertical, les colonnes deviennent des lignes).`,
    };
  }

  if (confianceMoyenne < SEUIL_CONFIANCE_PAGE) {
    return {
      ...base,
      verdict: "suspecte",
      raison:
        `Confiance moyenne de ${base.confianceMoyenne} sur 100, sous le seuil de ` +
        `${SEUIL_CONFIANCE_PAGE}. Vérifier l'orientation de CETTE page avant d'incriminer le ` +
        `moteur : une image renversée fait tomber la confiance de ~93 à ~58.`,
    };
  }

  return { ...base, verdict: "vraisemblable", raison: "" };
}
