// Adapter mock du calendrier : evenements en memoire (mai-juin 2026).
// Les jalons (pastilles J-x) ne sont PAS codes en dur : ils sont CALCULES depuis
// la date de l'evenement via le domaine jalons-ag (ADR-006), ancres a 2026-05-27.
//   - AG / AGE : compte a rebours vers le prochain jalon reglementaire.
//   - CS       : compte a rebours vers la date du conseil.
//   - tenue / annulee : pas de pastille.
// Ne depend que du domaine et des ports.

import type { CalendrierProvider } from "@/lib/ports/calendrier-provider";
import type { Evenement } from "@/lib/domain/calendrier";
import { jalonCourantAg, compteARebours } from "@/lib/domain/jalons-ag/calculator";

const ANCRE = "2026-05-27";

const BASE: Omit<Evenement, "jalon">[] = [
  { id: "e1", coproCode: "S104", coproNomCourt: "Les Marronniers", type: "AG", statut: "convoquee", date: "2026-05-28", heure: "18:30" },
  { id: "e2", coproCode: "S067", coproNomCourt: "Résidence Nationale", type: "AG", statut: "convoquee", date: "2026-05-26", heure: "18:30" },
  { id: "e3", coproCode: "S132", coproNomCourt: "Le Médéric", type: "CS", statut: "convoquee", date: "2026-05-29", heure: "18:30" },
  { id: "e4", coproCode: "S088", coproNomCourt: "Résidence Foch", type: "CS", statut: "convoquee", date: "2026-05-30", heure: "19:00" },
  { id: "e5", coproCode: "S073", coproNomCourt: "Le Clos Voltaire", type: "AG", statut: "planifiee", date: "2026-06-02", heure: "18:00" },
  { id: "e6", coproCode: "S019", coproNomCourt: "Rue de l'Aigle", type: "CS", statut: "planifiee", date: "2026-06-05", heure: "18:00" },
  { id: "e7", coproCode: "S150", coproNomCourt: "Les Bourguignons", type: "AG", statut: "planifiee", date: "2026-06-11", heure: "18:30" },
  { id: "e8", coproCode: "S016", coproNomCourt: "République", type: "AG", statut: "planifiee", date: "2026-06-12", heure: "18:30" },
  { id: "e9", coproCode: "S045", coproNomCourt: "Rue Sartoris", type: "AGE", statut: "planifiee", date: "2026-06-18", heure: "19:00" },
  { id: "e10", coproCode: "S088", coproNomCourt: "Résidence Foch", type: "AG", statut: "planifiee", date: "2026-06-25", heure: "18:30" },
  { id: "e11", coproCode: "S121", coproNomCourt: "Villa des Vallées", type: "CS", statut: "planifiee", date: "2026-06-09", heure: "18:00" },
  { id: "e12", coproCode: "S045", coproNomCourt: "Rue Sartoris", type: "AG", statut: "planifiee", date: "2026-06-30", heure: "18:30" },
  { id: "e13", coproCode: "S121", coproNomCourt: "Villa des Vallées", type: "AG", statut: "tenue", date: "2026-05-15", heure: "18:30" },
  { id: "e14", coproCode: "S104", coproNomCourt: "Les Marronniers", type: "CS", statut: "tenue", date: "2026-05-12", heure: "19:00" },
  { id: "e15", coproCode: "S016", coproNomCourt: "République", type: "AGE", statut: "annulee", date: "2026-05-20", heure: "18:30" },
];

function avecJalon(e: Omit<Evenement, "jalon">): Evenement {
  if (e.statut === "tenue" || e.statut === "annulee") return e;
  const jalon =
    e.type === "AG" || e.type === "AGE"
      ? jalonCourantAg(e.date, ANCRE)
      : compteARebours(e.date, ANCRE);
  return { ...e, jalon };
}

const EVENEMENTS: Evenement[] = BASE.map(avecJalon);

export class MockCalendrierProvider implements CalendrierProvider {
  async getEvenements(): Promise<Evenement[]> {
    return EVENEMENTS;
  }
}
