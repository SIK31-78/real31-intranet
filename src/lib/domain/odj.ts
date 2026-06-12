// Domaine de l'ODJ (document de preparation d'AG issu du CS, modele REAL31).
// Chaque champ porte sa SOURCE : eStale (primaire, a venir), supabase (referentiel
// Crypto + tables natives), jalon (calcule), ou manuel. Objectif : basculer vers
// eStale au branchement sans refondre l'UI (cf. memory eStale = source primaire).

export type SourceDonnee = "estale" | "supabase" | "jalon" | "manuel";

export interface ChampOdj {
  libelle: string;
  /** Valeur si on a su l'auto-remplir ; sinon vide (a saisir / a venir d'eStale). */
  valeur?: string;
  source: SourceDonnee;
  /** Alerte au gestionnaire quand une donnee attendue manque (ex. date de CS). */
  alerte?: string;
}

export interface SectionOdj {
  id: string;
  titre: string;
  /** Champs surtout sources eStale/compta : vides pour l'instant (saisie), a brancher. */
  champs: ChampOdj[];
}

export interface PointLegal {
  id: string;
  titre: string;
  /** Texte legal pre-ecrit (le gain : ne plus le retaper). */
  texte: string;
  /** Inclus par defaut ; le gestionnaire retire si non applicable. */
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
 * (IRVE, velo, AG hybride) sont inclus par defaut avec leur condition rappelee :
 * le gestionnaire les retire si la copro n'est pas concernee.
 */
export function pointsLegaux(lots: number): PointLegal[] {
  return [
    {
      id: "fonds-travaux-alur",
      titre: "Fonds travaux (loi ALUR)",
      applicable: true,
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
      id: "renouvellement-cs",
      titre: "Renouvellement du Conseil Syndical",
      applicable: true,
      texte:
        "Recueillir les membres actuels du CS et les candidatures (membres se representant + nouvelles candidatures) en vue du renouvellement.",
    },
    {
      id: "ppt",
      titre: "Plan Pluriannuel de Travaux (PPT)",
      applicable: true,
      condition: "Copropriete de plus de 15 ans.",
      texte:
        `Les coproprietes de plus de 15 ans doivent elaborer un plan pluriannuel de travaux (PPT). Pour cette copropriete (selon le nombre de lots), l'obligation s'applique a compter du ${datePpt(lots)} (art. 171 loi n0 2021-1104). Une fois realise, le PPT est presente a chaque AG ordinaire.`,
    },
    {
      id: "dpe-collectif",
      titre: "DPE collectif",
      applicable: true,
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
