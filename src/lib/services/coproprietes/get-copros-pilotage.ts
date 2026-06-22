// Service : liste des copros du gestionnaire enrichie de leur ETAT de cycle AG
// (cockpit). Passe par le routeur (ADR-001). "Convoquee" = jalon CONVOC accompli.

import { getCoproRepository, getJalonRepository } from "@/lib/adapters/router";
import { etatCycleAg, type EtatCycle } from "@/lib/domain/etat-cycle-ag";
import { getPrisesEnMain } from "@/lib/services/coproprietes/prise-en-main";
import type { SourceCopro } from "@/lib/domain/copropriete";

export interface CoproPilotage {
  code: string;
  nom: string;
  ville: string;
  source: SourceCopro;
  etat: EtatCycle;
  enRetard: boolean;
  /** Prise en main (onboarding) : dates validees par le gestionnaire. */
  prise: boolean;
  /** Prochaine AG (ISO) si fixee, pour l'echeance affichee. */
  agDate?: string;
  /** Derniere AG tenue (ISO) - aide a la verification a la prise en main. */
  derniereAgDate?: string;
  /** Cloture de l'exercice "JJ/MM" (filtre exercice). */
  exerciceCloture?: string;
}

function aujourdhuiISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getCoprosPilotage(managerId: string): Promise<CoproPilotage[]> {
  const copros = await getCoproRepository().list(managerId);
  const today = aujourdhuiISO();

  const codes = copros.map((c) => c.code);

  // CONVOC marquee accomplie par copro+AG (etat "convoquee").
  const etats = await getJalonRepository().getEtats(codes);
  const convocOk = new Set<string>();
  for (const e of etats) {
    if (e.type === "CONVOC" && e.statut === "accompli") convocOk.add(`${e.coproCode}|${e.agDate}`);
  }

  // Prise en main (onboarding). null = feature inerte -> tout considere pris en main.
  const prises = await getPrisesEnMain(codes);

  return copros.map((c) => {
    const ag = c.prochaineAg?.date;
    const convoc = ag ? convocOk.has(`${c.code}|${ag}`) : false;
    const { etat, enRetard } = etatCycleAg(c, convoc, today);
    return {
      code: c.code,
      nom: c.nom,
      ville: c.adresse.ville,
      source: c.source,
      etat,
      enRetard,
      prise: prises === null ? true : prises.has(c.code),
      ...(ag ? { agDate: ag } : {}),
      ...(c.derniereAgDate ? { derniereAgDate: c.derniereAgDate } : {}),
      ...(/^\d{2}\/\d{2}$/.test(c.exercice.fin) ? { exerciceCloture: c.exercice.fin } : {}),
    };
  });
}
