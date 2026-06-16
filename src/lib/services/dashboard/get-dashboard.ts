// Service du dashboard.
//   - COPRO_SOURCE=supabase : compose depuis les vraies copros + l'etat des jalons.
//   - sinon : agregat mocke.
// Passe par le routeur, jamais un adapter en direct (ADR-001).

import type {
  CodeEtape,
  CompteurAction,
  DashboardData,
  EtapeParcours,
  ItemActivite,
  ItemAttention,
  LigneParcours,
} from "@/lib/domain/dashboard";
import type { Copropriete } from "@/lib/domain/copropriete";
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
function ajouterJours(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86_400_000).toISOString().slice(0, 10);
}

// --- Parcours AG : sequence Dates -> ODJ -> Convoc -> Tenue -> PV ----------
// Fenetre des copros "en cycle" : AG a venir (preparation) ou recente non close,
// + celles sans date dont l'AG est due (~12 mois apres la derniere).
const PARCOURS_HORIZON = 150; // jours avant l'AG ou on commence a la preparer
const PARCOURS_RETRO = 90; // jours apres l'AG ou on suit encore (PV, archivage)
const AG_DUE_JOURS = 330; // au-dela, l'AG annuelle est consideree comme due

const ETAPES: { code: CodeEtape; label: string; jalon?: string }[] = [
  { code: "dates", label: "Dates" },
  { code: "odj", label: "ODJ", jalon: "ODJ_CS" },
  { code: "convoc", label: "Convoc", jalon: "CONVOC" },
  { code: "tenue", label: "Tenue", jalon: "TENUE" },
  { code: "pv", label: "PV", jalon: "NOTIF_PV" },
];

function etapeFaite(
  code: CodeEtape,
  agDate: string | undefined,
  accompli: Set<string>,
  today: string,
): boolean {
  switch (code) {
    case "dates":
      return agDate !== undefined;
    case "odj":
      return accompli.has("ODJ_CS");
    case "convoc":
      return accompli.has("CONVOC");
    case "tenue":
      return accompli.has("TENUE") || (agDate !== undefined && agDate < today);
    case "pv":
      return accompli.has("NOTIF_PV");
  }
}

function actionEtape(
  code: CodeEtape,
  c: Copropriete,
  agDate: string | undefined,
): { prochaineAction: string; actionLabel: string; lien: string } {
  const sup = agDate ? `/supervision-ag/${c.code}__${agDate}` : `/supervision-ag/${c.code}`;
  switch (code) {
    case "dates":
      return { prochaineAction: "fixer les dates CS + AG", actionLabel: "Fixer", lien: `/copropriete/${c.code}` };
    case "odj":
      return { prochaineAction: "préparer l'ODJ", actionLabel: "ODJ", lien: `/odj/${c.code}` };
    case "convoc":
      return { prochaineAction: "envoyer les convocations", actionLabel: "Supervision", lien: sup };
    case "tenue":
      return { prochaineAction: "tenir l'AG et suivre", actionLabel: "Supervision", lien: sup };
    case "pv":
      return { prochaineAction: "publier et notifier le PV", actionLabel: "Supervision", lien: sup };
  }
}

function construireLigne(
  c: Copropriete,
  accompli: Set<string>,
  today: string,
): { ligne: LigneParcours; tri: string } | null {
  const agDate = c.prochaineAg?.date;
  const faits = ETAPES.map((e) => etapeFaite(e.code, agDate, accompli, today));
  const courant = faits.findIndex((f) => !f);
  if (courant === -1) return null; // cycle complet : hors parcours

  const etapes: EtapeParcours[] = ETAPES.map((e, i) => ({
    code: e.code,
    label: e.label,
    statut: faits[i] ? "fait" : i === courant ? "encours" : "avenir",
  }));

  // Echeance de l'etape courante : date cible du jalon associe, sinon date d'AG
  // due deduite de la derniere AG (etape Dates des copros non datees).
  const jalonCode = ETAPES[courant].jalon;
  let dueDate: string | undefined;
  if (agDate && jalonCode) {
    dueDate = calculerJalons(agDate).find((j) => j.code === jalonCode)?.cibleDate;
  } else if (!agDate && c.derniereAgDate) {
    dueDate = ajouterJours(c.derniereAgDate, 365);
  }

  let echeance: string | undefined;
  let enRetard = false;
  if (!agDate) {
    echeance = "à dater";
    enRetard = dueDate !== undefined && dueDate < today;
  } else if (dueDate) {
    const d = joursEntre(today, dueDate);
    enRetard = d < 0;
    echeance = enRetard ? "en retard" : `J-${d}`;
  }

  const ligne: LigneParcours = {
    id: `parc-${c.code}`,
    coproCode: c.code,
    coproNom: c.nom,
    etapes,
    ...actionEtape(ETAPES[courant].code, c, agDate),
    ...(echeance ? { echeance } : {}),
    ...(enRetard ? { enRetard } : {}),
  };
  return { ligne, tri: dueDate ?? "9999-99-99" };
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
  const dateesEnCycle = copros.filter((c) => {
    const d = c.prochaineAg?.date;
    if (d === undefined) return false;
    const j = joursEntre(today, d);
    return j <= PARCOURS_HORIZON && j >= -PARCOURS_RETRO;
  });

  const etats = await getJalonRepository().getEtats(dateesEnCycle.map((c) => c.code));
  const accompliPar = new Map<string, Set<string>>();
  for (const e of etats) {
    if (e.statut !== "accompli") continue;
    const k = `${e.coproCode}|${e.agDate}`;
    (accompliPar.get(k) ?? accompliPar.set(k, new Set()).get(k)!).add(e.type);
  }

  // Parcours AG : copros datees en cycle + copros sans date dont l'AG est due.
  const coprosParcours = copros.filter((c) => {
    const d = c.prochaineAg?.date;
    if (d !== undefined) {
      const j = joursEntre(today, d);
      return j <= PARCOURS_HORIZON && j >= -PARCOURS_RETRO;
    }
    return c.derniereAgDate !== undefined && joursEntre(c.derniereAgDate, today) >= AG_DUE_JOURS;
  });
  const parcours = coprosParcours
    .map((c) => construireLigne(c, accompliPar.get(`${c.code}|${c.prochaineAg?.date}`) ?? new Set(), today))
    .filter((r): r is { ligne: LigneParcours; tri: string } => r !== null)
    .sort((a, b) => a.tri.localeCompare(b.tri))
    .slice(0, 12)
    .map((r) => r.ligne);

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
          lien: `/supervision-ag/${c.code}__${agDate}`,
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
      id: "jalons-retard",
      label: "En retard",
      valeur: jalonsRetard,
      unite: "jalons",
      detail: "échéance dépassée",
      ...(jalonsRetard > 0 ? { severiteDetail: "late" as Severite } : {}),
      icone: "alert-triangle",
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
