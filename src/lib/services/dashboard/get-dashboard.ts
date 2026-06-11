// Service du dashboard.
//   - COPRO_SOURCE=supabase : compose depuis les vraies copros + l'etat des jalons.
//   - sinon : agregat mocke.
// Passe par le routeur, jamais un adapter en direct (ADR-001).

import type {
  CompteurAction,
  DashboardData,
  ItemActivite,
  ItemAttention,
} from "@/lib/domain/dashboard";
import type { Severite, Ton } from "@/lib/domain/commun";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { calculerJalons, compteARebours } from "@/lib/domain/jalons-ag/calculator";
import {
  getCoproRepository,
  getDashboardProvider,
  getJalonRepository,
} from "@/lib/adapters/router";
import { formatDateLongue, formatAuditeRelatif } from "@/lib/format-date";

export async function getDashboard(g: Gestionnaire): Promise<DashboardData> {
  if (process.env.COPRO_SOURCE !== "supabase") {
    return getDashboardProvider().getDashboard(g.id);
  }
  return composerDepuisVraieData(g);
}

const HORIZON_JOURS = 90;
const SEUIL_SOON = 7;
const LIBELLE_COURT: Record<string, string> = {
  ODJ_CS: "ODJ avec le CS",
  DEVIS: "Devis",
  CONVOC: "Convocations",
  POUVOIRS: "Pouvoirs",
  TENUE: "Tenue de l'AG",
};

function aujourdhuiISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function joursEntre(aISO: string, bISO: string): number {
  const [ay, am, ad] = aISO.split("-").map(Number);
  const [by, bm, bd] = bISO.split("-").map(Number);
  return (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000;
}
function jourMoisCourt(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}
function rangSeverite(s: Severite): number {
  return s === "late" ? 0 : s === "soon" ? 1 : 2;
}

async function composerDepuisVraieData(g: Gestionnaire): Promise<DashboardData> {
  const today = aujourdhuiISO();
  const copros = await getCoproRepository().list(g.id);

  const avenir = copros.filter((c) => {
    const d = c.prochaineAg?.date;
    return d !== undefined && d >= today && joursEntre(today, d) <= HORIZON_JOURS;
  });

  const etats = await getJalonRepository().getEtats(avenir.map((c) => c.code));
  const accompliPar = new Map<string, Set<string>>();
  for (const e of etats) {
    if (e.statut !== "accompli") continue;
    const k = `${e.coproCode}|${e.agDate}`;
    (accompliPar.get(k) ?? accompliPar.set(k, new Set()).get(k)!).add(e.type);
  }

  let convocDues = 0;
  let convocRetard = 0;
  let jalonsRetard = 0;
  const attention: ItemAttention[] = [];

  for (const c of avenir) {
    const agDate = c.prochaineAg!.date;
    const jalons = calculerJalons(agDate);
    const accompli = accompliPar.get(`${c.code}|${agDate}`) ?? new Set<string>();

    for (const j of jalons) {
      if (accompli.has(j.code)) continue;
      const d = joursEntre(today, j.cibleDate);
      if (d < 0) jalonsRetard++;
      if (j.code === "CONVOC") {
        if (d <= SEUIL_SOON) convocDues++;
        if (d < 0) convocRetard++;
      }
    }

    const prochain = [...jalons]
      .sort((a, b) => a.cibleDate.localeCompare(b.cibleDate))
      .find((j) => !accompli.has(j.code));
    if (prochain) {
      const d = joursEntre(today, prochain.cibleDate);
      if (d <= SEUIL_SOON) {
        attention.push({
          id: `att-${c.code}`,
          jalon: compteARebours(prochain.cibleDate, today),
          coproCode: c.code,
          titre: `${c.nom} - ${LIBELLE_COURT[prochain.code]}`,
          echeance: jourMoisCourt(prochain.cibleDate),
          ...(d < 0 ? { badge: { texte: "En retard", ton: "err" as Ton } } : {}),
        });
      }
    }
  }

  attention.sort((a, b) => rangSeverite(a.jalon.severite) - rangSeverite(b.jalon.severite));

  const nbSansAg = copros.filter((c) => c.prochaineAg === undefined).length;

  const compteurs: CompteurAction[] = [
    {
      id: "convoc",
      label: "À envoyer",
      valeur: convocDues,
      unite: "convocations",
      detail: "sous 7 jours",
      ...(convocRetard > 0
        ? { detailFort: `${convocRetard} en retard`, severiteDetail: "late" as Severite }
        : {}),
      icone: "send",
    },
    {
      id: "sans-ag",
      label: "À planifier",
      valeur: nbSansAg,
      unite: "AG",
      detail: "copros sans AG planifiée",
      icone: "calendar-clock",
    },
    {
      id: "jalons-retard",
      label: "En retard",
      valeur: jalonsRetard,
      unite: "jalons",
      detail: "échéance dépassée",
      ...(jalonsRetard > 0 ? { severiteDetail: "late" as Severite } : {}),
      icone: "alert-triangle",
    },
  ];

  const activite: ItemActivite[] = etats
    .filter((e) => e.statut === "accompli" && e.marqueAt)
    .sort((a, b) => b.marqueAt!.localeCompare(a.marqueAt!))
    .slice(0, 6)
    .map((e, i) => ({
      id: `act-${i}`,
      icone: "check-circle",
      tonIcone: "ok" as Ton,
      texte: `${e.marquePar ?? "?"} a marqué ${LIBELLE_COURT[e.type]} comme accompli`,
      coproCode: e.coproCode,
      quand: formatAuditeRelatif(e.marqueAt!, today),
    }));

  return {
    gestionnaire: g,
    dateCourante: formatDateLongue(today),
    compteurs,
    attention: attention.slice(0, 10),
    activite,
  };
}
