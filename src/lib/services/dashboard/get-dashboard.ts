// Service du dashboard.
//   - COPRO_SOURCE=supabase : compose depuis les vraies copros + l'etat des jalons.
//   - sinon : agregat mocke.
// Passe par le routeur, jamais un adapter en direct (ADR-001).

import type {
  CompteurAction,
  DashboardData,
  ItemActivite,
  ItemAttention,
  LigneParcours,
} from "@/lib/domain/dashboard";
import type { Severite, Ton } from "@/lib/domain/commun";
import {
  construireLigne,
  estDateeEnCycle,
  estEnParcours,
} from "@/lib/domain/parcours-ag";
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
  RELANCE_POUVOIRS: "Relance pouvoirs",
  POUVOIRS: "Pouvoirs",
  TENUE: "Tenue de l'AG",
  SCAN_CONTRAT: "Scan contrat",
  NOTIF_PV: "Notification PV",
  ARCHIVAGE: "Archivage",
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

  // Copros datees "en cycle" (fenetre elargie pour le parcours : preparation + suivi
  // post-AG). avenir en est un sous-ensemble -> on lit les jalons une seule fois.
  const dateesEnCycle = copros.filter((c) => estDateeEnCycle(c, today));

  const etats = await getJalonRepository().getEtats(dateesEnCycle.map((c) => c.code));
  const accompliPar = new Map<string, Set<string>>();
  for (const e of etats) {
    if (e.statut !== "accompli") continue;
    const k = `${e.coproCode}|${e.agDate}`;
    (accompliPar.get(k) ?? accompliPar.set(k, new Set()).get(k)!).add(e.type);
  }

  // Parcours AG : copros datees en cycle + copros sans date dont l'AG est legalement due.
  const parcours = copros
    .filter((c) => estEnParcours(c, today))
    .map((c) => construireLigne(c, accompliPar.get(`${c.code}|${c.prochaineAg?.date}`) ?? new Set(), today))
    .filter((r): r is { ligne: LigneParcours; tri: string } => r !== null)
    .sort((a, b) => a.tri.localeCompare(b.tri))
    .map((r) => r.ligne);

  // Modele d'alarme honnete : un jalon de preparation echu mais non marque n'est PAS
  // un retard (le travail se fait sans doute dans Estale, l'intranet n'en a juste pas
  // la trace). On le presente "a confirmer" (neutre), jamais en rouge. Le rouge ne sort
  // que de donnees positives (jalon marque ou, ailleurs, AG non planifiee legalement due).
  let convocAEnvoyer = 0; // CONVOC a venir sous 7j (echeance non encore passee)
  let nbAgAConfirmer = 0; // AG ayant >=1 jalon prep echu non confirme
  const attention: ItemAttention[] = [];

  for (const c of avenir) {
    const agDate = c.prochaineAg!.date;
    const jalons = calculerJalons(agDate);
    const accompli = accompliPar.get(`${c.code}|${agDate}`) ?? new Set<string>();

    let aConfirmerCopro = false;
    for (const j of jalons) {
      if (accompli.has(j.code)) continue;
      const d = joursEntre(today, j.cibleDate);
      if (d < 0) aConfirmerCopro = true;
      else if (j.code === "CONVOC" && d <= SEUIL_SOON) convocAEnvoyer++;
    }
    if (aConfirmerCopro) nbAgAConfirmer++;

    const prochain = [...jalons]
      .sort((a, b) => a.cibleDate.localeCompare(b.cibleDate))
      .find((j) => !accompli.has(j.code));
    if (prochain) {
      const d = joursEntre(today, prochain.cibleDate);
      if (d < 0) {
        // Echeance passee, non confirmee : etat neutre + action "marquer fait".
        attention.push({
          id: `att-${c.code}`,
          jalon: { label: "à conf.", severite: "ok" },
          coproCode: c.code,
          titre: `${c.nom} - ${LIBELLE_COURT[prochain.code]}`,
          echeance: jourMoisCourt(prochain.cibleDate),
          lien: `/supervision-ag/${c.code}__${agDate}`,
          badge: { texte: "À confirmer", ton: "neutral" as Ton },
          aConfirmer: true,
          jalonCode: prochain.code,
          agDate,
        });
      } else if (d <= SEUIL_SOON) {
        // Echeance proche, a venir : compte a rebours normal.
        attention.push({
          id: `att-${c.code}`,
          jalon: compteARebours(prochain.cibleDate, today),
          coproCode: c.code,
          titre: `${c.nom} - ${LIBELLE_COURT[prochain.code]}`,
          echeance: jourMoisCourt(prochain.cibleDate),
          lien: `/supervision-ag/${c.code}__${agDate}`,
        });
      }
    }
  }

  // Tri : echeances a venir (soon) avant les "a confirmer" (neutres).
  attention.sort((a, b) => rangSeverite(a.jalon.severite) - rangSeverite(b.jalon.severite));

  const nbSansAg = copros.filter((c) => c.prochaineAg === undefined).length;

  const compteurs: CompteurAction[] = [
    {
      id: "convoc",
      label: "À envoyer",
      valeur: convocAEnvoyer,
      unite: "convocations",
      detail: "sous 7 jours",
      icone: "send",
      lien: "/mes-evenements",
    },
    {
      id: "sans-ag",
      label: "À planifier",
      valeur: nbSansAg,
      unite: "AG",
      detail: "copros sans AG planifiée",
      icone: "calendar-clock",
      lien: "/mes-evenements",
    },
    {
      id: "a-confirmer",
      label: "À confirmer",
      valeur: nbAgAConfirmer,
      unite: "AG",
      detail: "échéances passées, statut géré dans Estale",
      icone: "circle-help",
      lien: "/mes-evenements",
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
    parcours,
  };
}
