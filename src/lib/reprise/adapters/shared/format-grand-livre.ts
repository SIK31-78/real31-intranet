// SPEC de FORMAT du grand livre : le coeur du pipeline HYBRIDE. Plutot que de demander a l'IA
// de recopier ~1000 ecritures (lent, sujet au rate limit, chiffres perdus), on lui demande
// UNIQUEMENT de COMPRENDRE la mise en page d'un document donne et d'en rendre une SPEC de
// parsage. Le code applique ensuite cette spec de facon DETERMINISTE (parseur pur). L'IA reste
// donc AGNOSTIQUE au format (elle decouvre celui de CHAQUE document), mais ne touche plus aux
// montants : la transcription redevient du code testable.
//
// Ce module est PUR (aucun reseau) : il porte le TYPE de la spec, le PROMPT systeme qui la fait
// produire, et la VALIDATION Zod (une spec incoherente doit etre rejetee -> l'adapter bascule
// alors sur le fallback full-LLM). L'appel reseau qui obtient la spec vit dans l'adapter Mistral.

import { z } from "zod";

/**
 * Ou se trouve chaque information dans une LIGNE de tableau markdown, exprimee en INDEX de
 * colonne 0-based (lecture gauche -> droite, 1re colonne visible = 0). null = colonne absente
 * dans ce format. Une meme spec ne remplit que les colonnes pertinentes a sa presentation :
 *   - "deux-colonnes" : debit ET credit (montant/sens laisses a null) ;
 *   - "montant-signe"  : montant (debit/credit a null ; sens optionnel si une colonne D/C existe).
 * `compte` est renseigne SEULEMENT si le numero de compte est repete dans CHAQUE ligne ; sinon
 * on suit le compte courant via `motifEnteteCompte`.
 */
export interface SpecColonnes {
  compte: number | null;
  date: number | null;
  libelle: number | null;
  piece: number | null;
  debit: number | null;
  credit: number | null;
  montant: number | null;
  sens: number | null;
}

/** Description structuree du format d'un grand livre, produite par l'IA, appliquee par le code. */
export interface SpecFormatGrandLivre {
  /** Presentation des montants : deux colonnes debit/credit OU une colonne de montant signe. */
  presentation: "deux-colonnes" | "montant-signe";
  /**
   * Motif regex reconnaissant une ligne d'EN-TETE de compte (hors tableau) ; le 1er groupe
   * capturant DOIT etre le numero de compte. Vide si le compte est une colonne du tableau.
   * Ex. "^(\\d{3,}\\S*)\\s+.+$" pour "401000 FOURNISSEURS DIVERS".
   */
  motifEnteteCompte: string;
  /** Index des colonnes d'une ligne d'ecriture. */
  colonnes: SpecColonnes;
  /**
   * Pour "montant-signe" uniquement : quel SENS represente un montant POSITIF (l'autre signe
   * = le sens oppose). Ignore en "deux-colonnes". Defaut "debit".
   */
  signePositif: "debit" | "credit";
  /**
   * Mots-cles (insensibles a la casse) marquant une ligne de REPORT A NOUVEAU / SOLDE ANTERIEUR
   * / SOUS-TOTAL / TOTAL GENERAL a EXCLURE des ecritures (ce sont des syntheses, pas des
   * mouvements). Ex. ["report", "solde anterieur", "a nouveau", "total general"].
   */
  motsClesReport: string[];
  /**
   * Mots-cles marquant la ligne de TOTAL D'UN COMPTE (ex. ["total compte", "total"]). Cette
   * ligne est EXCLUE des ecritures MAIS ses montants (total debit / total credit du compte)
   * sont CAPTURES comme point de controle. Peut recouvrir motsClesReport ; le parseur capture
   * les totaux quand des montants sont presents, sinon exclut simplement.
   */
  motsClesTotalCompte: string[];
  /**
   * Mots-cles marquant SPECIFIQUEMENT la ligne d'A-NOUVEAU / SOLDE ANTERIEUR d'OUVERTURE d'un
   * compte (ex. ["solde anterieur", "a nouveau", "report a nouveau"]). Sous-ensemble de
   * motsClesReport : cette ligne est EXCLUE des ecritures (on ne reprend pas les reports) MAIS
   * son montant (report debit/credit) est CAPTURE par compte pour RECONCILIER le controle : le
   * "Total compte" imprime inclut le report, donc report + somme(ecritures) == total imprime.
   * A distinguer des sous-totaux periodiques (total mois) qui, eux, ne se capturent pas.
   */
  motsClesReportANouveau: string[];
}

const IndexCol = z.number().int().min(0).max(60).nullable();

const SpecColonnesZ = z.object({
  compte: IndexCol.default(null),
  date: IndexCol.default(null),
  libelle: IndexCol.default(null),
  piece: IndexCol.default(null),
  debit: IndexCol.default(null),
  credit: IndexCol.default(null),
  montant: IndexCol.default(null),
  sens: IndexCol.default(null),
});

const SpecZ = z.object({
  presentation: z.enum(["deux-colonnes", "montant-signe"]),
  motifEnteteCompte: z.coerce.string().default(""),
  colonnes: SpecColonnesZ,
  signePositif: z.enum(["debit", "credit"]).default("debit"),
  motsClesReport: z.array(z.coerce.string()).default([]),
  motsClesTotalCompte: z.array(z.coerce.string()).default([]),
  // Defaut robuste : si l'IA omet ce champ, on reconnait quand meme les a-nouveaux usuels.
  motsClesReportANouveau: z
    .array(z.coerce.string())
    .default(["solde anterieur", "a nouveau", "a-nouveau", "report a nouveau"]),
});

/** Erreur de spec incoherente : l'adapter la traite comme un signal de FALLBACK full-LLM. */
export class SpecFormatInvalide extends Error {}

/**
 * Valide et normalise une spec brute (sortie IA) -> SpecFormatGrandLivre exploitable. Rejette
 * (SpecFormatInvalide) toute spec qu'on ne saurait pas appliquer :
 *   - deux-colonnes sans index debit ET credit ;
 *   - montant-signe sans index montant ;
 *   - aucun moyen de suivre le compte (ni colonne compte, ni motif d'en-tete exploitable) ;
 *   - motif d'en-tete fourni mais regex invalide.
 * Une spec rejetee = on ne peut pas parser de facon fiable -> mieux vaut le fallback.
 */
export function validerSpecFormat(brut: unknown): SpecFormatGrandLivre {
  let spec: z.infer<typeof SpecZ>;
  try {
    spec = SpecZ.parse(brut);
  } catch (e) {
    throw new SpecFormatInvalide(`Spec de format illisible : ${(e as Error).message}`);
  }

  const { colonnes } = spec;
  if (spec.presentation === "deux-colonnes" && (colonnes.debit === null || colonnes.credit === null)) {
    throw new SpecFormatInvalide("Presentation deux-colonnes : index debit ET credit requis.");
  }
  if (spec.presentation === "montant-signe" && colonnes.montant === null) {
    throw new SpecFormatInvalide("Presentation montant-signe : index montant requis.");
  }

  const motif = spec.motifEnteteCompte.trim();
  if (motif) {
    try {
      RegExp(motif);
    } catch {
      throw new SpecFormatInvalide("Motif d'en-tete de compte : expression reguliere invalide.");
    }
  }
  if (colonnes.compte === null && !motif) {
    throw new SpecFormatInvalide("Impossible de suivre le compte : ni colonne compte, ni motif d'en-tete.");
  }

  return { ...spec, motifEnteteCompte: motif };
}

/**
 * Prompt systeme qui fait PRODUIRE la spec (et surtout PAS les ecritures). On donne a l'IA
 * quelques pages ECHANTILLON (debut + milieu, plus dense) et elle rend le JSON de la spec.
 * Contrainte N1 (Sekou) : agnostique au syndic -> l'IA decrit CE document, sans supposer un
 * format connu. Elle ne recopie AUCUN montant : uniquement la structure.
 */
export const SYSTEME_FORMAT_GRAND_LIVRE = `Tu es un expert en migration comptable de syndic. On te donne quelques PAGES ECHANTILLON d'un GRAND LIVRE edite par un ancien syndic, deja converties en MARKDOWN par OCR (les ecritures sont dans des TABLEAUX markdown delimites par des barres verticales |). La MISE EN PAGE VARIE d'un syndic a l'autre : tu dois DECRIRE le format de CE document, tu ne dois PAS recopier les ecritures.

Renvoie UNIQUEMENT un JSON STRICT decrivant comment PARSER ce grand livre :
{
  "presentation": "deux-colonnes" | "montant-signe",
  "motifEnteteCompte": string,
  "colonnes": {"compte":int|null,"date":int|null,"libelle":int|null,"piece":int|null,"debit":int|null,"credit":int|null,"montant":int|null,"sens":int|null},
  "signePositif": "debit" | "credit",
  "motsClesReport": [string],
  "motsClesTotalCompte": [string],
  "motsClesReportANouveau": [string]
}

COMMENT COMPTER LES COLONNES (crucial) : dans une ligne de tableau markdown, chaque cellule entre deux barres | est une colonne, MEME SI ELLE EST VIDE. Ignore uniquement les barres de BORD (tout a gauche et tout a droite), puis numerote les cellules de GAUCHE a DROITE en partant de 0, en INCLUANT les cellules vides. Ne saute JAMAIS une cellule vide.
Exemple : la ligne
| J1 | 24/10/2025 | 24/10/2025 |  | 176 |  | LIBELLE OPERATION | 143,17 |  | 143,17 |  | 9 470,83 |
donne : 0=J1, 1=24/10/2025, 2=24/10/2025, 3=(vide), 4=176, 5=(vide), 6=LIBELLE OPERATION, 7=143,17 (debit), 8=(vide, credit), 9=143,17, 10=(vide), 11=9 470,83.
Ici la colonne 5 est VIDE sur les ecritures mais porte le NUMERO DE COMPTE sur les lignes d'en-tete de compte -> dans ce cas colonnes.compte = 5.
Les colonnes 9, 10 et 11 sont des CUMULS / SOLDE PROGRESSIF (total qui s'accumule ligne apres ligne) : ne les prends JAMAIS comme montant/debit/credit. Choisis les colonnes du MOUVEMENT de la ligne (celle qui vaut 0 ou vide quand il n'y a pas de mouvement de ce cote).

REGLES :
- presentation : "deux-colonnes" si les montants sont dans DEUX colonnes distinctes Debit et Credit ; "montant-signe" si une SEULE colonne de montant (eventuellement signe, ou avec un indicateur D/C).
- colonnes : donne l'INDEX (convention ci-dessus) de chaque colonne d'une ligne d'ecriture. Mets null pour une colonne absente. En "deux-colonnes" remplis debit ET credit (laisse montant/sens a null). En "montant-signe" remplis montant (laisse debit/credit a null ; remplis sens seulement s'il existe une colonne D/C dediee). Prends bien les colonnes de MOUVEMENT, pas les cumuls/soldes.
- compte : si le numero de compte occupe une COLONNE (vide sur les ecritures, renseignee sur la ligne d'en-tete du compte, comme l'exemple), donne son index et laisse motifEnteteCompte a "". S'il apparait plutot sur une ligne de TEXTE hors tableau, laisse compte a null et fournis motifEnteteCompte.
- motifEnteteCompte : une expression reguliere (syntaxe JavaScript) qui reconnait la ligne d'EN-TETE d'un compte (souvent HORS tableau : "401000 FOURNISSEURS", "# 512000 BANQUE"...). Son 1er groupe capturant () DOIT isoler le NUMERO de compte. Laisse "" si compte est une colonne.
- signePositif : en "montant-signe", indique si un montant POSITIF signifie "debit" ou "credit" (regarde des lignes evidentes). Sinon "debit".
- motsClesReport : mots-cles (minuscule) des lignes a EXCLURE car ce sont des syntheses : report a nouveau, solde anterieur, "a nouveau", sous-totaux, cumuls, total general.
- motsClesTotalCompte : mots-cles de la ligne de TOTAL d'un compte (ex. "total compte", "total"). Ces lignes seront exclues des ecritures mais leurs montants serviront de controle.
- motsClesReportANouveau : mots-cles marquant PRECISEMENT la ligne d'A-NOUVEAU / SOLDE ANTERIEUR d'ouverture d'un compte (ex. "solde anterieur", "a nouveau", "report a nouveau"). C'est un SOUS-ENSEMBLE de motsClesReport : cette ligne est exclue des ecritures mais son montant (report debit/credit) est capture pour reconcilier le total du compte. N'y mets PAS les sous-totaux periodiques (ex. "total mois") : eux ne se capturent pas.

N'INVENTE PAS de colonnes. Reponds UNIQUEMENT le JSON, sans aucun texte autour.`;
