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

export interface Odj {
  copro: { code: string; nom: string; adresse: string };
  dateAg?: string;
  enTete: ChampOdj[];
  sections: SectionOdj[];
  pointsLegaux: PointLegal[];
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
        "Depuis le 1er janvier 2017, conformement a la loi ALUR, un fonds travaux est appele. Il sera propose a la prochaine AG d'en modifier eventuellement le montant (aujourd'hui = 5% du budget annuel).",
    },
    {
      id: "contrat-syndic-lre",
      titre: "Contrat de syndic - avoirs frais postaux",
      applicable: true,
      texte:
        "Pour toute personne adherant au service de recommande electronique, un avoir annuel sur les frais postaux est consenti par REAL 31 : 10 EUR de moins pour la convocation en LRE (mail recommande), 3 EUR de moins pour l'envoi des appels de fonds par mail.",
    },
    {
      id: "ppt",
      titre: "Plan Pluriannuel de Travaux (PPT)",
      applicable: pptApplicable,
      condition: annee
        ? `Immeuble de ${annee} (${pptApplicable ? "plus" : "moins"} de 15 ans).`
        : "Copropriete de plus de 15 ans.",
      texte:
        `Les coproprietes de plus de 15 ans doivent elaborer un plan pluriannuel de travaux (PPT). Pour cette copropriete (selon le nombre de lots), l'obligation s'applique a compter du ${datePpt(lots)} (art. 171 loi n0 2021-1104). Une fois realise, le PPT est presente a chaque AG ordinaire.`,
    },
    {
      id: "dpe-collectif",
      titre: "DPE collectif",
      applicable: dpeApplicable,
      condition: "Immeuble d'habitation, permis de construire anterieur au 1er juillet 2013.",
      texte:
        `Le DPE collectif (loi Climat et Resilience, art. 158) est obligatoire pour cette copropriete a compter du ${dateDpe(lots)} (selon le nombre de lots principaux).`,
    },
    {
      id: "irve",
      titre: "IRVE - bornes de recharge vehicules electriques",
      applicable: true,
      condition: "Uniquement si la copro a des emplacements de stationnement a usage privatif avec acces securise.",
      texte:
        "Le syndic inscrit a l'ordre du jour la question de la realisation d'une etude portant sur l'adequation des installations electriques existantes aux equipements de recharge et, le cas echeant, les travaux a realiser (art. L.111-3-9 et s.).",
    },
    {
      id: "local-velo",
      titre: "Local velo - stationnement securise",
      applicable: true,
      condition: "Uniquement si emplacements de stationnement a acces securise et pas de local velo securise.",
      texte:
        "Selon l'art. 24-5 de la loi du 10 juillet 1965 : lorsque l'immeuble possede des emplacements de stationnement d'acces securise a usage privatif et n'est pas equipe de stationnements securises pour les velos, le syndic inscrit a l'ordre du jour la question des travaux permettant le stationnement securise des velos, ainsi que la presentation des devis elabores a cet effet.",
    },
    {
      id: "ag-hybride",
      titre: "AG hybride (visio + presentiel, AG Connect)",
      applicable: true,
      condition: "Decision du CS sur la tenue des AG en visio.",
      texte:
        "Service AG CONNECT : 60 EUR TTC / an (abonnement), + par AG realisee 34,80 EUR TTC (copros de moins de 10 coproprietaires) ou 106,80 EUR TTC (plus de 10). Application de ces tarifs a compter du 1er janvier 2027. Ce service doit-il etre presente au vote ?",
    },
    {
      id: "location-touristique",
      titre: "Location de courte duree (loi Le Meur)",
      applicable: true,
      texte:
        "Au-dela de la declaration en mairie, toute location de courte duree (type Airbnb) doit etre declaree au syndic. Art. 9-2 (loi n0 2024-1039 du 19 novembre 2024) : un point d'information du syndic sur l'activite de location de meubles touristiques est inscrit a l'ordre du jour de la prochaine AG.",
    },
    {
      id: "qualite-eau",
      titre: "Point d'information - qualite de l'eau",
      applicable: true,
      texte:
        "Une ordonnance du 22 decembre 2022 (transposition de la directive UE 2020/2184 dite eau potable) prevoit la remise d'une facture d'eau a chaque coproprietaire et l'obligation d'informer sur la qualite de l'eau consommee. Un point d'information est mis a l'ordre du jour.",
    },
  ];
}
