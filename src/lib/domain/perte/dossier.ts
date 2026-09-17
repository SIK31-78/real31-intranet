// Dossier de PERTE d'une copropriete : tout ce qu'il y a a faire quand une AG nomme un
// autre syndic. Calque du dossier de reprise (ADR-037 : tableau de suivi d'equipe), en
// miroir : la reprise fait entrer, la perte fait sortir.
//
// La checklist est celle de la fiche process du cabinet (« Perte copro », Loop, relue le
// 15/09/2026 sur S182 LA PROMENADE) : 12 actions de l'equipe de gestion, 4 du service
// comptabilite, dont une avec sa liste de controle de 10 pieces. Rien d'invente.
//
// TOUT SE DATE DEPUIS L'AG (Sekou, 15/09) : « des le lendemain » = J+1, le rappel
// espace client = J+15, la cloture definitive sur Crypto = J+5 ans (delai legal de
// conservation). Fonctions pures.
//
// Les regles communes a toute checklist (statut, etape close, retard, avancement, prochaine
// etape) vivent dans le noyau `domain/suivi/etape` partage avec la reprise.

import {
  avancement as avancementNoyau,
  compterParStatut,
  echeanceDepassee,
  etapeClose,
  prochaineEtape as prochaineEtapeSuivi,
  type StatutEtape,
} from "@/lib/domain/suivi/etape";

export type { StatutEtape } from "@/lib/domain/suivi/etape";

export const PHASES_PERTE = ["LENDEMAIN", "TRANSMISSION", "J15", "COMPTABILITE"] as const;
export type PhasePerte = (typeof PHASES_PERTE)[number];

export const LIBELLE_PHASE: Record<PhasePerte, string> = {
  LENDEMAIN: "Dès le lendemain de l'AG",
  TRANSMISSION: "Transmission au nouveau syndic",
  J15: "À J+15",
  COMPTABILITE: "Comptabilité",
};

/** Qui fait quoi, d'apres la fiche. La gestion des roles viendra plus tard (roadmap). */
export const ROLES_PERTE = ["gestionnaire", "assistant", "comptable_copro", "comptable_entreprise"] as const;
export type RolePerte = (typeof ROLES_PERTE)[number];

export const LIBELLE_ROLE: Record<RolePerte, string> = {
  gestionnaire: "gestionnaire",
  assistant: "assistant(e)",
  comptable_copro: "comptable copro",
  comptable_entreprise: "comptable entreprise",
};

export interface DefinitionEtape {
  code: string;
  phase: PhasePerte;
  role: RolePerte;
  libelle: string;
  /** Echeance en jours apres l'AG. Absente = pas d'echeance calculee. */
  echeanceJours?: number;
  /** Liste de controle (cases a cocher) portee par l'etape. */
  controles?: readonly string[];
}

export const ETAPES_PERTE: ReadonlyArray<DefinitionEtape> = [
  // --- Des le lendemain -------------------------------------------------------------
  { code: "LE1", phase: "LENDEMAIN", role: "gestionnaire", echeanceJours: 1, libelle: "Informer la comptable entreprise de la perte de la copropriété" },
  { code: "LE2", phase: "LENDEMAIN", role: "gestionnaire", echeanceJours: 1, libelle: "Informer la comptable copro de la perte de la copropriété" },
  { code: "LE3", phase: "LENDEMAIN", role: "gestionnaire", echeanceJours: 1, libelle: "Passer la copropriété « Inactive » au référentiel, pour éviter les factures trimestrielles automatisées" },
  { code: "LE4", phase: "LENDEMAIN", role: "gestionnaire", echeanceJours: 1, libelle: "Prévenir ENGIE (à minima Léa) des coordonnées du nouveau syndic, si la copropriété a un contrat d'électricité ou de gaz chez ENGIE (factures dématérialisées en EDI)" },
  // --- Transmission -------------------------------------------------------------------
  { code: "TR1", phase: "TRANSMISSION", role: "gestionnaire", libelle: "Rassembler l'ensemble des archives de la copropriété perdue" },
  { code: "TR2", phase: "TRANSMISSION", role: "assistant", libelle: "Rassembler les jeux de clefs, le stock de badges Vigik et les émetteurs (vérifier si un trousseau est chez une entreprise pour une intervention ponctuelle)" },
  { code: "TR3", phase: "TRANSMISSION", role: "assistant", libelle: "Regrouper les éléments dispersés : chéquier, bordereaux de remise de chèque, classeur et registre de PV…" },
  { code: "TR4", phase: "TRANSMISSION", role: "gestionnaire", libelle: "Éditer un bordereau de remise des pièces listant l'ensemble des éléments et dossiers transmis" },
  { code: "TR5", phase: "TRANSMISSION", role: "gestionnaire", libelle: "Transférer au nouveau syndic, de manière dématérialisée, les premiers éléments attendus : PV d'AG, liste des copropriétaires, répartitions, carnet d'entretien, contrats d'entretien actifs…" },
  { code: "TR6", phase: "TRANSMISSION", role: "gestionnaire", libelle: "Déclarer la perte sur le site du Registre des copropriétés (il faut les coordonnées du nouveau gestionnaire)" },
  { code: "TR7", phase: "TRANSMISSION", role: "assistant", libelle: "Détacher les éventuels contrats des espaces clients propres à REAL31 (ex. SUEZ)" },
  // --- J+15 -----------------------------------------------------------------------------
  { code: "QZ1", phase: "J15", role: "gestionnaire", echeanceJours: 15, libelle: "Désactiver l'accès à l'espace client : lister les copropriétaires, « Aller à compter », « Lien Internet », « désactiver les comptes sélectionnés »" },
  // --- Comptabilite ---------------------------------------------------------------------
  {
    code: "CO1",
    phase: "COMPTABILITE",
    role: "comptable_copro",
    libelle: "Préparer le dossier comptable à transmettre au nouveau syndic",
    controles: [
      "3 derniers EDD",
      "Répartition des comptes approuvés",
      "Liasse comptable des 3 dernières années",
      "Relevés banque N et N-1",
      "Clé de répartition",
      "Tableau des compteurs d'eau / chauffage",
      "Annexes comptables de l'exercice approuvé",
      "Budget ordinaire",
      "Budgets travaux en cours",
      "Copie des AF de l'année en cours",
    ],
  },
  { code: "CO2", phase: "COMPTABILITE", role: "comptable_copro", libelle: "Code entité Crypto à passer en Z (au lieu de S)" },
  { code: "CO3", phase: "COMPTABILITE", role: "comptable_copro", libelle: "Exclure la copropriété du calcul de la pointe : entité de la copropriété, onglet « données de base », case « Est à exclure du calcul de la pointe »" },
  {
    code: "CO4",
    phase: "COMPTABILITE",
    role: "comptable_copro",
    libelle: "Clôturer le compte de la copropriété (plusieurs étapes)",
    controles: [
      "Créer un compte 401 Syndic Repreneur paramétré en reprise des écritures non lettrées",
      "Mise à zéro : menu traitement → « solder une copropriété » (journal OD, date de perte, compte 401, libellé « solde final »)",
      "Saisir l'écriture 401 Syndic Repreneur ↔ banque, égale au règlement fait au nouveau syndic",
      "Clôture des comptes : tous les comptes de la copropriété en « reprise en solde »",
      "Écritures des comptes 450 : « changer code fiscalité » → code SORD",
      "Menu compta → clôture (contrôles selon la documentation Crypto), entité comptable, journal CL, valider",
    ],
  },
  // La cloture DEFINITIVE sur Crypto attend le delai legal de conservation.
  { code: "CO5", phase: "COMPTABILITE", role: "comptable_copro", echeanceJours: 5 * 365, libelle: "Clôture définitive sur Crypto — pas avant 5 ans (délai légal de conservation des données)" },
];

export interface EtapePerte {
  code: string;
  statut: StatutEtape;
  /** Nom de la personne qui s'en charge, libre (la gestion des roles viendra plus tard). */
  assigneA?: string;
  /** Cases cochees de la liste de controle, par libelle. */
  controles?: Record<string, boolean>;
  note?: string;
  faitLeISO?: string;
}

export interface EntreeJournalPerte {
  quandISO: string;
  par: string;
  texte: string;
}

export type StatutDossierPerte = "en_cours" | "termine";

export interface DossierPerte {
  id: string;
  coproCode: string;
  coproNom: string;
  /** AG qui a nomme le nouveau syndic : TOUT se date depuis elle. */
  dateAgISO: string;
  /** Dernier jour gere par le cabinet. */
  finGestionISO: string;
  motif?: string;
  statut: StatutDossierPerte;
  etapes: EtapePerte[];
  journal: EntreeJournalPerte[];
  creeParNom: string;
  creeLeISO: string;
}

/** Les etapes vierges d'un nouveau dossier, dans l'ordre de la fiche. */
export function etapesInitiales(): EtapePerte[] {
  return ETAPES_PERTE.map((d) => ({ code: d.code, statut: "a_faire" }));
}

export function definitionEtape(code: string): DefinitionEtape | undefined {
  return ETAPES_PERTE.find((d) => d.code === code);
}

function plusJours(iso: string, jours: number): string {
  const [a, m, j] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j + jours)).toISOString().slice(0, 10);
}

/** Echeance d'une etape, ISO, ou null si la fiche n'en fixe pas. */
export function echeanceEtape(dateAgISO: string, code: string): string | null {
  const d = definitionEtape(code);
  return d?.echeanceJours === undefined ? null : plusJours(dateAgISO, d.echeanceJours);
}

/** Retard en jours d'une etape ouverte dont l'echeance est passee, sinon null. */
export function retardEtape(dossier: DossierPerte, etape: EtapePerte, aujourdhuiISO: string): number | null {
  const echeance = echeanceEtape(dossier.dateAgISO, etape.code);
  if (!echeance || !echeanceDepassee({ statut: etape.statut, echeance }, aujourdhuiISO)) return null;
  return Math.round((Date.parse(`${aujourdhuiISO}T00:00:00Z`) - Date.parse(`${echeance}T00:00:00Z`)) / 86_400_000);
}

export interface AvancementPerte {
  /** Les etapes closes : faites ou « sans objet » (meme regle que le noyau, Sekou 17/09/2026). */
  faites: number;
  total: number;
  enRetard: number;
  bloquees: number;
}

/** Avancement du dossier : la regle du noyau (« sans objet » = faite), plus retards et blocages. */
export function avancement(dossier: DossierPerte, aujourdhuiISO: string): AvancementPerte {
  const n = compterParStatut(dossier.etapes);
  const base = avancementNoyau(dossier.etapes);
  return {
    faites: base.faites,
    total: base.total,
    enRetard: dossier.etapes.filter((e) => retardEtape(dossier, e, aujourdhuiISO) !== null).length,
    bloquees: n.bloque,
  };
}

/** La prochaine etape a faire, dans l'ordre de la fiche (la plus en retard d'abord). */
export function prochaineEtape(dossier: DossierPerte, aujourdhuiISO: string): EtapePerte | null {
  return prochaineEtapeSuivi(dossier.etapes, (e) => retardEtape(dossier, e, aujourdhuiISO));
}

/** Une etape dont toutes les cases de controle sont cochees est faite ; l'inverse n'est pas force. */
export function controlesComplets(etape: EtapePerte): boolean {
  const d = definitionEtape(etape.code);
  if (!d?.controles?.length) return true;
  return d.controles.every((c) => etape.controles?.[c] === true);
}

/** Le dossier est termine quand plus rien n'est ouvert (la cloture a 5 ans comprise). */
export function estTermine(dossier: DossierPerte): boolean {
  return dossier.etapes.every((e) => etapeClose(e.statut));
}
