// Adapter mock du referentiel copro. Codes alignes sur le mock calendrier pour que
// "prochains evenements" remonte des donnees. Une copro en source eStale (S045) pour
// demontrer le badge + deep-link (ADR-003). Ne depend que du domaine et des ports.

import type { CoproRepository } from "@/lib/ports/copro-repository";
import type { Copropriete, MembreEquipe } from "@/lib/domain/copropriete";

const EL: MembreEquipe = { initiales: "EL", nomComplet: "Élise Lambert", role: "gestionnaire" };
const LM: MembreEquipe = { initiales: "LM", nomComplet: "Léa Martin", role: "assistant" };
const PV: MembreEquipe = { initiales: "PV", nomComplet: "Pauline Vidal", role: "comptable" };

const COPROS: Record<string, Copropriete> = {
  S104: {
    code: "S104",
    source: "crypto",
    nom: "Les Marronniers",
    adresse: { ligne1: "14 rue des Marronniers", codePostal: "31000", ville: "Toulouse" },
    statut: "active",
    lotsPrincipaux: 24,
    lotsAutres: 6,
    exercice: { debut: "01/01", fin: "31/12" },
    priseEnGestion: "mars 2018",
    equipe: [EL, LM, PV],
    prochaineAg: {
      date: "2026-05-28",
      statut: "convoquee",
      alerte: "Convocations envoyées · AG demain",
      supervisionId: "e1",
    },
  },
  S088: {
    code: "S088",
    source: "crypto",
    nom: "Résidence Foch",
    adresse: { ligne1: "8 boulevard Foch", codePostal: "31400", ville: "Toulouse" },
    statut: "active",
    lotsPrincipaux: 48,
    lotsAutres: 12,
    exercice: { debut: "01/07", fin: "30/06" },
    priseEnGestion: "septembre 2021",
    equipe: [EL, PV],
    prochaineAg: { date: "2026-06-25", statut: "planifiee" },
  },
  S045: {
    code: "S045",
    source: "estale",
    nom: "Rue Sartoris",
    adresse: { ligne1: "3 rue Sartoris", codePostal: "31200", ville: "Toulouse" },
    statut: "active",
    lotsPrincipaux: 16,
    lotsAutres: 2,
    exercice: { debut: "01/01", fin: "31/12" },
    priseEnGestion: "janvier 2024",
    equipe: [EL, LM],
    prochaineAg: { date: "2026-06-18", statut: "planifiee" },
    estaleDeepLink: "https://app.estale.app/condo/S045",
  },
  // Deux copros sans prochaine AG (-> section "copros sans AG" de Mes evenements).
  // Pas de donnees eStale mockees -> leur fiche montre l'etat "non disponible".
  S019: {
    code: "S019",
    source: "crypto",
    nom: "Rue de l'Aigle",
    adresse: { ligne1: "5 rue de l'Aigle", codePostal: "31500", ville: "Toulouse" },
    statut: "active",
    lotsPrincipaux: 12,
    lotsAutres: 0,
    exercice: { debut: "01/01", fin: "31/12" },
    priseEnGestion: "juin 2019",
    equipe: [EL, PV],
    derniereAgDate: "2025-05-12",
  },
  S121: {
    code: "S121",
    source: "crypto",
    nom: "Villa des Vallées",
    adresse: { ligne1: "27 chemin des Vallées", codePostal: "31100", ville: "Toulouse" },
    statut: "active",
    lotsPrincipaux: 9,
    lotsAutres: 0,
    exercice: { debut: "01/01", fin: "31/12" },
    priseEnGestion: "février 2023",
    equipe: [EL],
  },
};

export class MockCoproRepository implements CoproRepository {
  async list(): Promise<Copropriete[]> {
    return Object.values(COPROS);
  }

  async findByCode(code: string): Promise<Copropriete | null> {
    return COPROS[code] ?? null;
  }

  async setDateEvenement(
    coproCode: string,
    type: "ag" | "cs",
    quand: "prochaine" | "derniere",
    dateISO: string | null,
  ): Promise<void> {
    const c = COPROS[coproCode];
    if (!c) return;
    if (type === "ag" && quand === "prochaine") {
      if (dateISO) c.prochaineAg = { date: dateISO, statut: "planifiee" };
      else delete c.prochaineAg;
    } else if (type === "ag") {
      if (dateISO) c.derniereAgDate = dateISO;
      else delete c.derniereAgDate;
    } else if (quand === "prochaine") {
      if (dateISO) c.prochaineCsDate = dateISO;
      else delete c.prochaineCsDate;
    } else if (dateISO) {
      c.derniereCsDate = dateISO;
    } else {
      delete c.derniereCsDate;
    }
  }
}
