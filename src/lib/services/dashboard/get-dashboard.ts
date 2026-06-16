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
// + celles sans date dont l'AG est legalement due (cloture exercice + 6 mois).
const PARCOURS_HORIZON = 150; // jours avant l'echeance ou on commence a preparer
const PARCOURS_RETRO = 90; // jours apres l'AG ou on suit encore (PV, archivage)
const DELAI_APPROBATION_MOIS = 6; // l'AG approuve les comptes < 6 mois apres cloture
const CS_PREP_FENETRE_JOURS = 150; // un CS tenu dans cette fenetre avant l'AG = CS de prep

const ETAPES: { code: CodeEtape; label: string; jalon?: string }[] = [
  { code: "dates", label: "Dates" },
  { code: "odj", label: "ODJ", jalon: "ODJ_CS" },
  { code: "convoc", label: "Convoc", jalon: "CONVOC" },
  { code: "tenue", label: "Tenue", jalon: "TENUE" },
  { code: "pv", label: "PV", jalon: "NOTIF_PV" },
];

function ajouterMois(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, d)).toISOString().slice(0, 10);
}

/** CS de preparation traite ? CS a venir planifie, ou CS tenu dans la fenetre de
 *  prep avant l'AG (agDate suppose defini). Limite #1 : l'etape Dates couvre CS + AG. */
function csTraite(c: Copropriete, agDate: string): boolean {
  if (c.prochaineCsDate) return true;
  if (c.derniereCsDate) {
    return c.derniereCsDate <= agDate && joursEntre(c.derniereCsDate, agDate) <= CS_PREP_FENETRE_JOURS;
  }
  return false;
}

/**
 * Echeance legale de l'AG a tenir = cloture du dernier exercice clos + 6 mois (delai
 * d'approbation des comptes). Renvoie cette date si l'AG n'est pas planifiee et qu'on
 * entre dans la fenetre de preparation (ou qu'on est en retard) ; null sinon. Limite #2 :
 * regle ancree sur l'exercice reel (accountingEndDate), repli "derniere AG + 12 mois" si
 * l'exercice est inconnu.
 */
function agDueDeadline(c: Copropriete, today: string): string | null {
  if (c.prochaineAg) return null; // deja planifiee

  let deadline: string;
  let clotureISO: string | null = null;
  if (/^\d{2}\/\d{2}$/.test(c.exercice.fin)) {
    const [dd, mm] = c.exercice.fin.split("/");
    const annee = Number(today.slice(0, 4));
    let cloture = `${annee}-${mm}-${dd}`;
    if (cloture > today) cloture = `${annee - 1}-${mm}-${dd}`; // cloture la plus recente <= today
    clotureISO = cloture;
    deadline = ajouterMois(cloture, DELAI_APPROBATION_MOIS);
  } else if (c.derniereAgDate) {
    deadline = ajouterJours(c.derniereAgDate, 365); // repli : cycle annuel approximatif
  } else {
    return null; // ni exercice ni derniere AG : rien a deduire
  }

  // AG deja tenue pour cet exercice ? (derniere AG posterieure a la cloture)
  if (clotureISO && c.derniereAgDate && c.derniereAgDate > clotureISO) return null;
  // Dans la fenetre de preparation (ou en retard si negatif).
  return joursEntre(today, deadline) <= PARCOURS_HORIZON ? deadline : null;
}

function etapeFaite(
  code: CodeEtape,
  c: Copropriete,
  agDate: string | undefined,
  accompli: Set<string>,
  today: string,
): boolean {
  switch (code) {
    case "dates":
      return agDate !== undefined && csTraite(c, agDate);
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
      return {
        // AG posee mais CS manquant -> on cible juste le CS ; sinon les deux.
        prochaineAction: agDate ? "fixer la date du CS" : "fixer les dates CS + AG",
        actionLabel: "Fixer",
        lien: `/copropriete/${c.code}`,
      };
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
  const faits = ETAPES.map((e) => etapeFaite(e.code, c, agDate, accompli, today));
  const courant = faits.findIndex((f) => !f);
  if (courant === -1) return null; // cycle complet : hors parcours

  const etapes: EtapeParcours[] = ETAPES.map((e, i) => ({
    code: e.code,
    label: e.label,
    statut: faits[i] ? "fait" : i === courant ? "encours" : "avenir",
  }));

  // Echeance de l'etape courante.
  const courantCode = ETAPES[courant].code;
  const jalonCode = ETAPES[courant].jalon;
  let dueDate: string | undefined;
  let echeance: string | undefined;
  if (courantCode === "dates") {
    if (!agDate) {
      dueDate = agDueDeadline(c, today) ?? undefined; // echeance legale de l'AG a tenir
      echeance = dueDate !== undefined && dueDate < today ? "en retard" : "à dater";
    } else {
      // AG posee, CS manquant : le CS doit preceder la convocation.
      dueDate = calculerJalons(agDate).find((j) => j.code === "CONVOC")?.cibleDate;
      echeance = dueDate !== undefined && dueDate < today ? "en retard" : "CS à fixer";
    }
  } else if (agDate && jalonCode) {
    dueDate = calculerJalons(agDate).find((j) => j.code === jalonCode)?.cibleDate;
    if (dueDate) {
      const d = joursEntre(today, dueDate);
      echeance = d < 0 ? "en retard" : `J-${d}`;
    }
  }
  const enRetard = dueDate !== undefined && dueDate < today;

  const ligne: LigneParcours = {
    id: `parc-${c.code}`,
    coproCode: c.code,
    coproNom: c.nom,
    etapes,
    ...actionEtape(courantCode, c, agDate),
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

  // Parcours AG : copros datees en cycle + copros sans date dont l'AG est legalement due.
  const coprosParcours = copros.filter((c) => {
    const d = c.prochaineAg?.date;
    if (d !== undefined) {
      const j = joursEntre(today, d);
      return j <= PARCOURS_HORIZON && j >= -PARCOURS_RETRO;
    }
    return agDueDeadline(c, today) !== null;
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
