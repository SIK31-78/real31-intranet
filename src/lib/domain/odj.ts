// Domaine de l'ODJ (document de preparation d'AG issu du CS, modele REAL31).
// Chaque champ porte sa SOURCE : Estale (primaire, a venir), supabase (referentiel
// Crypto + tables natives), jalon (calcule depuis la date d'AG), calcul (derive
// d'autres champs), ou manuel. Objectif : basculer vers Estale au branchement
// sans refondre l'UI (cf. memory Estale = source primaire).

export type SourceDonnee = "estale" | "supabase" | "jalon" | "calcul" | "manuel";

/** Type de saisie d'un champ : texte libre, montant en euros, pourcentage,
 *  ou booleen (rendu en bouton on/off). */
export type TypeChamp = "texte" | "montant" | "pourcentage" | "booleen";

export interface ChampOdj {
  /** Slug stable, cle de persistance dans intranet_odj_champs (ex "lieu"). */
  id: string;
  libelle: string;
  /** Valeur BRUTE si connue (saisie ou auto) ; l'affichage formate via formatChampValeur. */
  valeur?: string;
  source: SourceDonnee;
  type?: TypeChamp;
  /** Alerte au gestionnaire quand une donnee attendue manque (ex. date de CS). */
  alerte?: string;
  /** Saisissable par le gestionnaire (la saisie prime sur la valeur auto). */
  editable?: boolean;
  /** La valeur vient d'une SAISIE du gestionnaire (intranet_odj_champs), pas de l'auto.
   *  Pose par la superposition de l'etat dans get-odj. Sans ce marqueur, impossible de
   *  distinguer "Estale a rempli le champ" de "le gestionnaire l'a tape a la main". */
  saisi?: boolean;
  /** Champ AJOUTE par le gestionnaire (libelle editable, supprimable) - cf. odj-libre. */
  libre?: boolean;
  /** Champ standard RETIRE du document par le gestionnaire ("masque.<id>" dans l'etat).
   *  Il reste dans la section (pour la reintegration) mais ne se rend plus. */
  masque?: boolean;
  /** Le libelle affiche vient d'une REECRITURE du gestionnaire ("libelle.<id>").
   *  Necessaire a l'annulation : effacer la reecriture != effacer le catalogue. */
  libelleReecrit?: boolean;
  /** Paragraphes ANCRES sous cette ligne ("note.<id>.<ts>") - ils la suivent partout. */
  notes?: { id: string; texte: string }[];
}

/** Ce qu'on AFFICHE comme provenance d'un champ (badge de la ligne d'ODJ). */
export type ProvenanceChamp = "saisi" | "auto" | "auto-jalon" | "calcul" | "a-venir" | "a-saisir";

/**
 * Provenance REELLE d'un champ (bug remonte par Sekou 2026-07-28 : "beaucoup de boutons
 * qui sont deja auto mais sont comme 'a venir'").
 *
 * Le badge ne peut PAS se deduire de la seule `source` declaree : 15 champs sont declares
 * `estale` parce que c'est de la qu'ils viendront, mais une bonne partie est DEJA
 * alimentee (budget, depenses, eau, fonds travaux, debiteurs, contrats...). Les afficher
 * "a venir" alors qu'ils portent une valeur fait mentir l'ecran et fait douter le
 * gestionnaire d'une donnee pourtant juste.
 *
 * On tranche donc sur la PRESENCE d'une valeur, pas sur l'intention. Effet de bord
 * heureux : le badge se corrige tout seul au fur et a mesure que la couverture Estale
 * s'etend, sans avoir a rereferencer les champs un par un.
 */
export function provenanceChamp(champ: ChampOdj): ProvenanceChamp {
  // La saisie du gestionnaire prime sur tout : c'est LUI la source.
  if (champ.saisi) return "saisi";
  switch (champ.source) {
    case "jalon":
      return "auto-jalon";
    case "calcul":
      return "calcul";
    case "manuel":
      return "a-saisir";
    case "supabase":
      // Referentiel : une valeur = auto ; rien = le referentiel ne l'a pas -> a saisir.
      return champ.valeur ? "auto" : "a-saisir";
    case "estale":
      return champ.valeur ? "auto" : "a-venir";
  }
}

export interface SectionOdj {
  id: string;
  titre: string;
  champs: ChampOdj[];
  /** Paragraphes libres de la section (type inline, meme raison que Odj.blocsLibres). */
  blocs?: { id: string; texte: string }[];
  /** Le titre affiche vient d'une reecriture du gestionnaire ("titre-section.<id>"). */
  titreReecrit?: boolean;
}

export interface PointLegal {
  id: string;
  titre: string;
  /** Texte legal pre-ecrit (le gain : ne plus le retaper). */
  texte: string;
  /** Inclus dans le document ; certains points sont retires d'office (ex. ALUR). */
  applicable: boolean;
  /** Condition d'applicabilite, affichee au gestionnaire. */
  condition?: string;
}

/** Cloture de l'ODJ : le CS preparatoire s'est tenu, le document est fige. */
export interface ClotureOdj {
  /** Horodatage ISO de la cloture. */
  le: string;
  /** Initiales du gestionnaire qui a cloture. */
  par: string;
}

export interface Odj {
  copro: { code: string; nom: string; adresse: string };
  /** Date d'AG LISIBLE (jj/mm/aaaa), pour l'affichage. */
  dateAg?: string;
  /** La MEME date en ISO 'YYYY-MM-DD'. Necessaire pour reconstruire les ids techniques
   *  (supervision "CODE__DATE") : l'URL de l'ODJ ne porte pas toujours la date. */
  dateAgISO?: string;
  enTete: ChampOdj[];
  sections: SectionOdj[];
  pointsLegaux: PointLegal[];
  /** Paragraphes AJOUTES par le gestionnaire en fin de document (cf. odj-libre).
   *  Type inline (pas d'import odj-libre : il importe deja ChampOdj d'ici). */
  blocsLibres?: { id: string; texte: string }[];
  /** Presente = ODJ cloture ("reunion terminee") : plus rien n'est modifiable. */
  cloture?: ClotureOdj;
}

// --- Cloture ----------------------------------------------------------------
// Serialisee dans la table d'etat existante (une seule colonne `valeur`), donc en
// UNE chaine "<ISO>|<initiales>". Format volontairement trivial et testé : pas de JSON
// a parser defensivement pour deux champs.

/** "2026-07-28T14:05:00.000Z" + "SK" -> "2026-07-28T14:05:00.000Z|SK". */
export function formatCloture(le: string, par: string): string {
  return `${le}|${par}`;
}

/** Inverse de formatCloture. undefined si la valeur est vide ou illisible (on prefere
 *  un ODJ ouvert a un ODJ fige par une donnee corrompue). */
export function parseCloture(valeur: string | null | undefined): ClotureOdj | undefined {
  if (!valeur) return undefined;
  const i = valeur.indexOf("|");
  const le = i < 0 ? valeur.trim() : valeur.slice(0, i).trim();
  const par = i < 0 ? "" : valeur.slice(i + 1).trim();
  if (!le) return undefined;
  return { le, par };
}

// --- Montants ---------------------------------------------------------------

/** Parse un montant saisi ("4500", "4 500,50", "4500.5") ; null si illisible. */
export function parseMontant(brut: string | undefined): number | null {
  if (!brut) return null;
  const normalise = brut.replace(/[\s  €]/g, "").replace(",", ".");
  const n = Number(normalise);
  return Number.isFinite(n) ? n : null;
}

const EUROS = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/** Formate en euros francais : 4500 -> "4 500,00 EUR" (espace insecable). */
export function formatEuros(n: number): string {
  return EUROS.format(n);
}

/** Valeur affichable d'un champ selon son type (montant / pourcentage / booleen). */
export function formatChampValeur(champ: ChampOdj): string | undefined {
  if (!champ.valeur) return undefined;
  if (champ.type === "montant") {
    const n = parseMontant(champ.valeur);
    return n === null ? champ.valeur : formatEuros(n);
  }
  if (champ.type === "pourcentage") {
    const n = parseMontant(champ.valeur);
    return n === null ? champ.valeur : `${n.toLocaleString("fr-FR")} %`;
  }
  if (champ.type === "booleen") return champ.valeur === "oui" ? "Oui" : "Non";
  return champ.valeur;
}

/** Ecart budgetaire : budget - depenses. Positif = trop-percu (rendu aux copros),
 *  negatif = depassement (cf. modele ODJ / exemple 31 Foch). Renvoie le libelle
 *  ADAPTE + le montant, pour eviter le doublon "Trop-percu / depassement : Depassement de X". */
export function ecartBudget(
  budgetBrut?: string,
  depensesBrut?: string,
): { libelle: string; valeur: string } | undefined {
  const budget = parseMontant(budgetBrut);
  const depenses = parseMontant(depensesBrut);
  if (budget === null || depenses === null) return undefined;
  const ecart = budget - depenses;
  if (ecart >= 0) return { libelle: "Trop-perçu budget courant", valeur: formatEuros(ecart) };
  return { libelle: "Dépassement budget courant", valeur: formatEuros(-ecart) };
}

// --- Points legaux ----------------------------------------------------------

/** Seuils legaux PPT par nombre de lots principaux (art. 171 loi 2021-1104). */
function datePpt(lots: number): string {
  if (lots > 200) return "1er janvier 2023";
  if (lots >= 50) return "1er janvier 2024";
  return "1er janvier 2025";
}

/** Seuils DPE collectif par nombre de lots (loi Climat et Resilience, art. 158). */
function dateDpe(lots: number): string {
  if (lots > 200) return "1er janvier 2024";
  if (lots > 50) return "1er janvier 2025";
  return "1er janvier 2026";
}

/**
 * Catalogue des points legaux/recurrents a porter a l'ODJ, avec leur texte pre-ecrit.
 * `lots` sert a injecter la bonne echeance PPT/DPE. Les points conditionnels
 * (IRVE, velo, AG hybride) sont inclus par defaut avec leur condition rappelee ;
 * le fonds travaux ALUR est RETIRE d'office (pas obligatoire, restaurable si le
 * CS le souhaite). Le renouvellement du CS et le contrat de syndic sont des
 * CHAMPS (pre-remplis / calcules), pas des points statiques.
 */
export function pointsLegaux(
  lots: number,
  opts?: { anneeConstruction?: number; anneeCourante?: number },
): PointLegal[] {
  const annee = opts?.anneeConstruction;
  const courante = opts?.anneeCourante;
  // PPT : copros de plus de 15 ans. DPE collectif : permis < 1er juillet 2013
  // (on approxime via l'annee de construction). Si l'annee est inconnue -> on
  // garde le point (defaut prudent), le gestionnaire ajuste.
  const pptApplicable = annee && courante ? courante - annee > 15 : true;
  const dpeApplicable = annee ? annee <= 2013 : true;
  return [
    {
      id: "fonds-travaux-alur",
      titre: "Fonds travaux (loi ALUR)",
      applicable: false,
      condition: "Retiré d'office (proposition non obligatoire) : restaurer si le CS souhaite modifier le montant.",
      texte:
        "Depuis le 1er janvier 2017, conformément à la loi ALUR, un fonds travaux est appelé. Il sera proposé à la prochaine AG d'en modifier éventuellement le montant (aujourd'hui = 5 % du budget annuel).",
    },
    {
      id: "contrat-syndic-lre",
      titre: "Contrat de syndic - avoirs sur frais postaux",
      applicable: true,
      texte:
        "Pour toute personne adhérant au service de recommandé électronique, un avoir annuel sur les frais postaux est consenti par REAL 31 : 10 € de moins pour la convocation en LRE (mail recommandé), 3 € de moins pour l'envoi des appels de fonds par mail.",
    },
    {
      id: "ppt",
      titre: "Plan Pluriannuel de Travaux (PPT)",
      applicable: pptApplicable,
      condition: annee
        ? `Immeuble de ${annee} (${pptApplicable ? "plus" : "moins"} de 15 ans).`
        : "Copropriété de plus de 15 ans.",
      texte:
        `Les copropriétés de plus de 15 ans doivent élaborer un plan pluriannuel de travaux (PPT). Pour cette copropriété (selon le nombre de lots), l'obligation s'applique à compter du ${datePpt(lots)} (art. 171 de la loi n° 2021-1104). Une fois réalisé, le PPT est présenté à chaque AG ordinaire.`,
    },
    {
      id: "dpe-collectif",
      titre: "DPE collectif",
      applicable: dpeApplicable,
      condition: "Immeuble d'habitation, permis de construire antérieur au 1er juillet 2013.",
      texte:
        `Le DPE collectif (loi Climat et Résilience, art. 158) est obligatoire pour cette copropriété à compter du ${dateDpe(lots)} (selon le nombre de lots principaux).`,
    },
    {
      id: "irve",
      titre: "IRVE - bornes de recharge pour véhicules électriques",
      applicable: true,
      condition:
        "Uniquement si la copropriété a des emplacements de stationnement à usage privatif avec accès sécurisé.",
      texte:
        "Le syndic inscrit à l'ordre du jour la question de la réalisation d'une étude portant sur l'adéquation des installations électriques existantes aux équipements de recharge et, le cas échéant, les travaux à réaliser (art. L. 111-3-9 et suivants).",
    },
    {
      id: "local-velo",
      titre: "Local vélo - stationnement sécurisé",
      applicable: true,
      condition: "Uniquement si emplacements de stationnement à accès sécurisé et pas de local vélo sécurisé.",
      texte:
        "Selon l'art. 24-5 de la loi du 10 juillet 1965 : lorsque l'immeuble possède des emplacements de stationnement d'accès sécurisé à usage privatif et n'est pas équipé de stationnements sécurisés pour les vélos, le syndic inscrit à l'ordre du jour la question des travaux permettant le stationnement sécurisé des vélos, ainsi que la présentation des devis élaborés à cet effet.",
    },
    {
      id: "ag-hybride",
      titre: "AG hybride (visio + présentiel, AG Connect)",
      applicable: true,
      condition: "Décision du CS sur la tenue des AG en visio.",
      texte:
        "Service AG CONNECT : 60 € TTC / an (abonnement), plus, par AG réalisée, 34,80 € TTC (copropriétés de moins de 10 copropriétaires) ou 106,80 € TTC (plus de 10). Application de ces tarifs à compter du 1er janvier 2027. Ce service doit-il être présenté au vote ?",
    },
    {
      id: "location-touristique",
      titre: "Location de courte durée (loi Le Meur)",
      applicable: true,
      texte:
        "Au-delà de la déclaration en mairie, toute location de courte durée (type Airbnb) doit être déclarée au syndic. Art. 9-2 (loi n° 2024-1039 du 19 novembre 2024) : un point d'information du syndic sur l'activité de location de meublés de tourisme est inscrit à l'ordre du jour de la prochaine AG.",
    },
    {
      id: "qualite-eau",
      titre: "Point d'information - qualité de l'eau",
      applicable: true,
      texte:
        "Une ordonnance du 22 décembre 2022 (transposition de la directive UE 2020/2184 dite « eau potable ») prévoit la remise d'une facture d'eau à chaque copropriétaire et l'obligation d'informer sur la qualité de l'eau consommée. Un point d'information est mis à l'ordre du jour.",
    },
  ];
}
