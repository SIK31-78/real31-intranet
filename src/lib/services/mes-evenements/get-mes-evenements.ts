// Service de l'ecran "Mes evenements".
//   - COPRO_SOURCE=supabase : compose la vraie data (copros reelles + jalons).
//   - sinon : agregat mocke.
// Passe par le routeur, jamais un adapter en direct (ADR-001).

import type {
  ActionATraiter,
  AgAVenir,
  BadgeUrgence,
  CoproSansAg,
  MesEvenements,
} from "@/lib/domain/mes-evenements";
import type { Severite } from "@/lib/domain/commun";
import { calculerJalons } from "@/lib/domain/jalons-ag/calculator";
import {
  getCoproRepository,
  getJalonRepository,
  getMesEvenementsProvider,
} from "@/lib/adapters/router";
import { formatDateLongue } from "@/lib/format-date";

export async function getMesEvenements(gestionnaireId: string): Promise<MesEvenements> {
  if (process.env.COPRO_SOURCE !== "supabase") {
    return getMesEvenementsProvider().getMesEvenements(gestionnaireId);
  }
  return composerDepuisVraieData();
}

const HORIZON_JOURS = 90;

function aujourdhuiISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function joursEntre(aISO: string, bISO: string): number {
  const [ay, am, ad] = aISO.split("-").map(Number);
  const [by, bm, bd] = bISO.split("-").map(Number);
  return (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000;
}
function severiteCible(cibleISO: string, today: string): Severite {
  const d = joursEntre(today, cibleISO);
  return d < 0 ? "late" : d <= 7 ? "soon" : "ok";
}
function badgeVersDate(today: string, dateISO: string): BadgeUrgence {
  const d = joursEntre(today, dateISO);
  const ton = d <= 2 ? "err" : d <= 7 ? "warn" : "neutral";
  const texte = d === 0 ? "AUJOURD'HUI" : d === 1 ? "DEMAIN" : `DANS ${d} JOURS`;
  return { texte, ton };
}
function libelleEcheance(cibleISO: string, today: string): string {
  const d = joursEntre(today, cibleISO);
  if (d < 0) return `en retard de ${-d} j`;
  if (d === 0) return "aujourd'hui";
  if (d === 1) return "demain";
  return `dans ${d} jours`;
}
function badgeUrgence(severite: Severite): BadgeUrgence {
  if (severite === "late") return { texte: "EN RETARD", ton: "err" };
  if (severite === "soon") return { texte: "À TRAITER", ton: "warn" };
  return { texte: "À VENIR", ton: "neutral" };
}

async function composerDepuisVraieData(): Promise<MesEvenements> {
  const today = aujourdhuiISO();
  const copros = await getCoproRepository().list();

  // AG a venir : prochaine AG dans l'horizon de 90 jours, triees par date.
  const avenir = copros
    .filter((c) => {
      const d = c.prochaineAg?.date;
      return d !== undefined && d >= today && joursEntre(today, d) <= HORIZON_JOURS;
    })
    .sort((a, b) => a.prochaineAg!.date.localeCompare(b.prochaineAg!.date));

  // Etats des jalons de ces copros (1 requete batch).
  const etats = await getJalonRepository().getEtats(avenir.map((c) => c.code));
  const accompliPar = new Map<string, Set<string>>();
  for (const e of etats) {
    if (e.statut !== "accompli") continue;
    const k = `${e.coproCode}|${e.agDate}`;
    (accompliPar.get(k) ?? accompliPar.set(k, new Set()).get(k)!).add(e.type);
  }

  const agAVenir: AgAVenir[] = avenir.map((c, i) => {
    const agDate = c.prochaineAg!.date;
    const jalons = calculerJalons(agDate);
    const accompli = accompliPar.get(`${c.code}|${agDate}`) ?? new Set<string>();
    const faits = jalons.filter((j) => accompli.has(j.code)).length;
    const prochain = [...jalons]
      .sort((a, b) => a.cibleDate.localeCompare(b.cibleDate))
      .find((j) => !accompli.has(j.code));
    const severite: Severite = prochain ? severiteCible(prochain.cibleDate, today) : "ok";
    return {
      id: `ag-${i}`,
      coproCode: c.code,
      coproNom: c.nom,
      date: agDate,
      badge: badgeVersDate(today, agDate),
      jalonsFaits: faits,
      jalonsTotal: jalons.length,
      prochainJalon: prochain
        ? `${prochain.libelle} (${libelleEcheance(prochain.cibleDate, today)})`
        : "tous les jalons sont faits",
      prochainJalonSeverite: severite,
      lien: `/copropriete/${c.code}`,
    };
  });

  // A traiter : prochain jalon des AG dont l'echeance est proche ou depassee.
  const aTraiter: ActionATraiter[] = agAVenir
    .filter((ag) => ag.prochainJalonSeverite !== "ok" && ag.jalonsFaits < ag.jalonsTotal)
    .slice(0, 8)
    .map((ag, i) => ({
      id: `a-${i}`,
      titre: ag.prochainJalon.replace(/ \(.*\)$/, ""),
      badge: badgeUrgence(ag.prochainJalonSeverite),
      contexte: `${ag.coproCode} · ${ag.coproNom} · AG du ${formatDateLongue(ag.date)}`,
      severite: ag.prochainJalonSeverite,
      lien: ag.lien,
    }));

  // Copros sans AG planifiee.
  const coprosSansAg: CoproSansAg[] = copros
    .filter((c) => c.prochaineAg === undefined)
    .slice(0, 8)
    .map((c) => ({
      coproCode: c.code,
      coproNom: c.nom,
      detail: c.derniereAgDate
        ? `Dernière AG : ${formatDateLongue(c.derniereAgDate)}`
        : "Aucune AG enregistrée",
      severite: c.derniereAgDate ? "soon" : "late",
      lien: `/copropriete/${c.code}`,
    }));

  return {
    gestionnaire: { nomComplet: "Élise Lambert", initiales: "EL" },
    nbCopros: copros.length,
    dateCourante: formatDateLongue(today),
    actionsCeMois: etats.filter((e) => e.statut === "accompli").length,
    aTraiter,
    agAVenir,
    coprosSansAg,
  };
}
