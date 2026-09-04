// Mentions legales du cabinet, PAR AGENCE : le pied de page de tout document qui sort
// (ODJ du CS aujourd'hui, convocation demain). Domaine PUR (ADR-001) - aucune lecture,
// aucun appel : ces mentions sont une donnee CABINET stable, elle vit en code, lisible,
// testee et versionnee. Meme parti que la liste fermee des salles (salles-reunion.ts)
// et que le perimetre des comptables (perimetre-comptable.ts).
//
// POURQUOI par agence. Les trois agences (La Garenne-Colombes, Maisons-Laffitte,
// Houilles) n'ont pas les memes mentions : capital, carte professionnelle, garantie
// financiere peuvent differer. On NE DEVINE PAS : seule l'agence dont le cabinet nous a
// donne le texte exact est renseignee, les autres restent a completer (cf.
// AGENCES_MENTIONS_A_VERIFIER) et retombent, en attendant, sur les mentions de
// reference. Un SIREN ou un numero de carte ne s'invente jamais.

/** Un bloc de mentions legales, decoupe pour le rendre en 3-4 lignes de pied de page. */
export interface MentionsAgence {
  /** Code d'agence (ML / LGC / HLS / ASN) auquel ces mentions se rapportent. */
  code: string;
  /** Activites exercees, en tete de pied de page. */
  activites: string;
  /** Forme sociale, capital, immatriculation. */
  societe: string;
  /** Carte professionnelle (numero + activites couvertes + CCI emettrice). */
  cartePro: string;
  /** Garantie financiere (garant, adresse, reference). */
  garantie: string;
}

/** Agence de REFERENCE : La Garenne-Colombes, seule agence dont le cabinet nous a
 *  communique le texte exact (2026-09-04). Sert aussi de repli. */
const LGC: MentionsAgence = {
  code: "LGC",
  activites: "VENTE – LOCATION – GESTION LOCATIVE – SYNDIC DE COPROPRIÉTÉ",
  societe: "SAS au capital de 90 000 € - SIREN 479 696 767 RCS VERSAILLES",
  cartePro:
    "Titulaire de la carte professionnelle n° CPI 7801 2016 000 014 479, permettant l'exercice de l'activité de : transaction sur immeubles et fonds de commerces * gestion immobilière * Syndic de copropriété, délivrée par la CCI Paris Île-de-France.",
  garantie: "Garanti par GALIAN-SMABTP, 89 rue la Boétie – 75008 Paris sous la référence 110891J.",
};

/**
 * SURCHARGES par agence : ce qui DIFFERE de la reference. Une entree vide = mentions
 * non encore communiquees -> le document rend celles de la reference.
 *
 * A COMPLETER (demander au cabinet le pied de page exact de chaque agence) : capital,
 * SIREN / RCS, numero de carte professionnelle, CCI emettrice, garant et reference de
 * garantie. Ne remplir QUE sur un document officiel de l'agence concernee.
 */
const SURCHARGES: Readonly<Record<string, Partial<MentionsAgence>>> = {
  LGC: {},
  ML: {}, // Maisons-Laffitte  - a completer
  HLS: {}, // Houilles         - a completer
  ASN: {}, // Asnieres         - a completer
};

/** Agences dont les mentions restent A VERIFIER aupres du cabinet : tant qu'elles sont
 *  listees ici, leurs documents portent les mentions de La Garenne-Colombes. */
export const AGENCES_MENTIONS_A_VERIFIER: readonly string[] = ["ML", "HLS", "ASN"];

/** Ces mentions sont-elles celles, VERIFIEES, de l'agence demandee ? */
export function mentionsVerifiees(codeAgence: string | null | undefined): boolean {
  const code = normaliser(codeAgence);
  return code !== "" && !AGENCES_MENTIONS_A_VERIFIER.includes(code);
}

function normaliser(codeAgence: string | null | undefined): string {
  return (codeAgence ?? "").trim().toUpperCase();
}

/**
 * Mentions legales a porter au pied d'un document de cette agence. Agence inconnue,
 * absente, ou pas encore renseignee -> les mentions de reference (La Garenne-Colombes) :
 * mieux vaut le pied de page du cabinet que pas de pied de page du tout, et surtout
 * jamais un numero invente.
 */
export function mentionsAgence(codeAgence?: string | null): MentionsAgence {
  const code = normaliser(codeAgence);
  const surcharge = SURCHARGES[code] ?? {};
  return { ...LGC, ...surcharge, code: code || LGC.code };
}

/** Les mentions en LIGNES, dans l'ordre du pied de page (le composant ne fait que rendre). */
export function lignesMentions(mentions: MentionsAgence): string[] {
  return [mentions.activites, mentions.societe, mentions.cartePro, mentions.garantie].filter(
    (l) => l.trim() !== "",
  );
}
