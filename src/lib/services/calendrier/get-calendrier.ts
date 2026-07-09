// Service du calendrier.
//   - COPRO_SOURCE=supabase : evenements derives des vraies copros (next/last AG & CS).
//   - sinon : evenements mockes.
// Passe par le routeur, jamais un adapter en direct (ADR-001).

import type { Evenement } from "@/lib/domain/calendrier";
import { jalonCourantAg, compteARebours } from "@/lib/domain/jalons-ag/calculator";
import { agMasqueeCarTenue, statutPourDate } from "@/lib/domain/confirmation-evenement";
import {
  getCalendrierProvider,
  getConfirmationEvenementRepository,
  getCoproRepository,
} from "@/lib/adapters/router";

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
  // Confirmations des dates par le conseil syndical (lecture batch) : les chips
  // affichent "AG a confirmer" / "AG confirmee" (demande patron).
  const confirmations = await getConfirmationEvenementRepository().getPourCopros(
    copros.map((c) => c.code),
  );
  const confParCle = new Map(confirmations.map((c) => [`${c.coproCode}__${c.type}`, c]));
  const evs: Evenement[] = [];

  for (const c of copros) {
    const base = { coproCode: c.code, coproNomCourt: c.nom };
    // Regle patron : une AG PASSEE dont la date tombe dans l'exercice comptable en
    // cours est invisible sur le planning (elle a eu lieu, la prochaine sera celle
    // de l'exercice suivant). Les CS ne sont pas concernes.
    if (c.prochaineAg && !agMasqueeCarTenue(c.prochaineAg.date, c.exercice, today)) {
      // id composite CODE__DATE : ouvre directement la supervision de cette AG.
      evs.push({
        id: `${c.code}__${c.prochaineAg.date}`,
        ...base,
        type: "AG",
        statut: "planifiee",
        date: c.prochaineAg.date,
        ...(c.prochaineAg.heure ? { heure: c.prochaineAg.heure } : {}),
        jalon: jalonCourantAg(c.prochaineAg.date, today),
        ...(c.prochaineAg.date >= today
          ? { confirmation: statutPourDate(confParCle.get(`${c.code}__AG`) ?? null, c.prochaineAg.date) }
          : {}),
      });
    }
    if (c.prochaineCsDate) {
      evs.push({
        id: `${c.code}-cs-next`,
        ...base,
        type: "CS",
        statut: "planifiee",
        date: c.prochaineCsDate,
        ...(c.prochaineCsHeure ? { heure: c.prochaineCsHeure } : {}),
        jalon: compteARebours(c.prochaineCsDate, today),
        ...(c.prochaineCsDate >= today
          ? { confirmation: statutPourDate(confParCle.get(`${c.code}__CS`) ?? null, c.prochaineCsDate) }
          : {}),
      });
    }
    if (c.derniereAgDate && !agMasqueeCarTenue(c.derniereAgDate, c.exercice, today)) {
      evs.push({ id: `${c.code}__${c.derniereAgDate}`, ...base, type: "AG", statut: "tenue", date: c.derniereAgDate });
    }
    if (c.derniereCsDate) {
      evs.push({ id: `${c.code}-cs-last`, ...base, type: "CS", statut: "tenue", date: c.derniereCsDate });
    }
  }

  return evs;
}
