// Service du calendrier.
//   - COPRO_SOURCE=supabase : evenements derives des vraies copros (next/last AG & CS).
//   - sinon : evenements mockes.
// Passe par le routeur, jamais un adapter en direct (ADR-001).

import type { Evenement } from "@/lib/domain/calendrier";
import { jalonCourantAg, compteARebours } from "@/lib/domain/jalons-ag/calculator";
import { getCalendrierProvider, getCoproRepository } from "@/lib/adapters/router";

export async function getEvenements(gestionnaireId: string): Promise<Evenement[]> {
  if (process.env.COPRO_SOURCE !== "supabase") {
    return getCalendrierProvider().getEvenements(gestionnaireId);
  }
  return composerEvenementsReels(gestionnaireId);
}

// Une copro reelle n'expose pas une liste d'evenements, mais 4 dates cles
// (prochaine/derniere AG, prochain/dernier CS). On en derive des evenements.
async function composerEvenementsReels(managerId: string): Promise<Evenement[]> {
  const today = new Date().toISOString().slice(0, 10);
  const copros = await getCoproRepository().list(managerId);
  const evs: Evenement[] = [];

  for (const c of copros) {
    const base = { coproCode: c.code, coproNomCourt: c.nom };
    if (c.prochaineAg) {
      // id composite CODE__DATE : ouvre directement la supervision de cette AG.
      evs.push({
        id: `${c.code}__${c.prochaineAg.date}`,
        ...base,
        type: "AG",
        statut: "planifiee",
        date: c.prochaineAg.date,
        jalon: jalonCourantAg(c.prochaineAg.date, today),
      });
    }
    if (c.prochaineCsDate) {
      evs.push({
        id: `${c.code}-cs-next`,
        ...base,
        type: "CS",
        statut: "planifiee",
        date: c.prochaineCsDate,
        jalon: compteARebours(c.prochaineCsDate, today),
      });
    }
    if (c.derniereAgDate) {
      evs.push({ id: `${c.code}__${c.derniereAgDate}`, ...base, type: "AG", statut: "tenue", date: c.derniereAgDate });
    }
    if (c.derniereCsDate) {
      evs.push({ id: `${c.code}-cs-last`, ...base, type: "CS", statut: "tenue", date: c.derniereCsDate });
    }
  }

  return evs;
}
