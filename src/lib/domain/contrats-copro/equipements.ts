// Quelle copropriété est concernée par quel sujet de suivi. Fonctions pures.
//
// Le « a un équipement » se lit sur le contrat courant (compteurs déclaratifs, énergie de
// chauffage, courtier) et sur ce qui est réellement suivi (appareils créés, cycles VMC).
// Les compteurs sont déclaratifs : 0 = pas concerné, null = jamais renseigné. On préfère
// capturer large (un ascenseur déclaré OU un appareil créé) et laisser « À compléter »
// signaler les incohérences, plutôt que de rater un contrôle obligatoire.

import type { ContratCourant, SujetSuivi } from "./types";

/**
 * Courtier partenaire (Areas, Dissoubray, Galian-Smabtp, Paris Tronchet… la liste vit dans le
 * référentiel d'entreprises) : il suit lui-même le renouvellement, le cycle assurance est
 * archivé. Égalité stricte sur le nom, comme dans l'ancienne application.
 */
export function estCourtierPartenaire(courtier: string | null | undefined, partenaires: readonly string[]): boolean {
  return !!courtier && partenaires.includes(courtier);
}

export interface ContexteEquipement {
  contrat: ContratCourant;
  /** Appareils (ascenseurs) créés pour la copro. */
  nbAscenseurs: number;
  partenaires: readonly string[];
}

/** La copro est-elle concernée par ce sujet ? */
export function concerneSujet(sujet: SujetSuivi, p: ContexteEquipement): boolean {
  const { compteurs } = p.contrat;
  switch (sujet) {
    case "assurance":
      return !estCourtierPartenaire(p.contrat.assurance.courtier, p.partenaires);
    case "gaz":
      // Règle corrigée côté source (SC9) : des chaudières au fioul ne font pas un contrat gaz.
      return (compteurs.chaudieres ?? 0) > 0 && p.contrat.energieChauffage === "GAZ";
    case "ctq_ascenseur":
      return (compteurs.ascenseurs ?? 0) > 0 || p.nbAscenseurs > 0;
    case "ctq_vmc":
      return (compteurs.vmcGaz ?? 0) > 0;
  }
}

export interface IncoherenceCompteur {
  champ: "ascenseurs" | "vmcGaz";
  message: string;
  /** La valeur que le compteur devrait vraisemblablement porter. */
  valeurSuggeree: number;
}

function pluriel(n: number, mot: string): string {
  return `${n} ${mot}${n > 1 ? "s" : ""}`;
}

/** Compteur déclaré en désaccord avec ce qui est réellement suivi. */
export function incoherencesCompteurs(p: { contrat: ContratCourant; nbAscenseurs: number; nbCyclesVmc: number }): IncoherenceCompteur[] {
  const out: IncoherenceCompteur[] = [];
  const { ascenseurs, vmcGaz } = p.contrat.compteurs;

  if ((ascenseurs ?? 0) === 0 && p.nbAscenseurs > 0) {
    out.push({
      champ: "ascenseurs",
      message: `Déclarée sans ascenseur mais ${pluriel(p.nbAscenseurs, "appareil")} ${p.nbAscenseurs > 1 ? "sont suivis" : "est suivi"}.`,
      valeurSuggeree: p.nbAscenseurs,
    });
  } else if ((ascenseurs ?? 0) > 0 && p.nbAscenseurs === 0) {
    out.push({
      champ: "ascenseurs",
      message: `${pluriel(ascenseurs ?? 0, "ascenseur")} déclaré${(ascenseurs ?? 0) > 1 ? "s" : ""} mais aucun appareil créé : aucun CTQ n'est suivable.`,
      valeurSuggeree: ascenseurs ?? 0,
    });
  }

  if ((vmcGaz ?? 0) === 0 && p.nbCyclesVmc > 0) {
    out.push({
      champ: "vmcGaz",
      message: "Déclarée sans VMC gaz mais un contrôle de VMC est suivi.",
      valeurSuggeree: 1,
    });
  }

  return out;
}
