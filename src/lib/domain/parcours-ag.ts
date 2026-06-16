// Parcours AG : la sequence Dates -> ODJ -> Convoc -> Tenue -> PV pour une copro.
// Logique PURE (domaine, ADR-001), partagee par le dashboard (liste de copros en
// cycle) et la fiche copro (la copro courante). Une copro = une LigneParcours :
// son etape courante + sa prochaine action concrete.
//
// Etapes "faites" : date d'AG + CS poses (Dates), puis jalons accomplis ODJ_CS /
// CONVOC / TENUE / NOTIF_PV (persistes en supervision). Echeance "AG due" = delai
// legal d'approbation des comptes (cloture exercice + 6 mois).

import type { Copropriete } from "@/lib/domain/copropriete";
import type { CodeEtape, EtapeParcours, LigneParcours } from "@/lib/domain/dashboard";
import { calculerJalons } from "@/lib/domain/jalons-ag/calculator";

// Fenetre des copros "en cycle" + regles de delais.
export const PARCOURS_HORIZON = 150; // jours avant l'echeance ou on commence a preparer
export const PARCOURS_RETRO = 90; // jours apres l'AG ou on suit encore (PV, archivage)
const DELAI_APPROBATION_MOIS = 6; // l'AG approuve les comptes < 6 mois apres cloture
const CS_PREP_FENETRE_JOURS = 150; // un CS tenu dans cette fenetre avant l'AG = CS de prep

const ETAPES: { code: CodeEtape; label: string; jalon?: string }[] = [
  { code: "dates", label: "Dates" },
  { code: "odj", label: "ODJ", jalon: "ODJ_CS" },
  { code: "convoc", label: "Convoc", jalon: "CONVOC" },
  { code: "tenue", label: "Tenue", jalon: "TENUE" },
  { code: "pv", label: "PV", jalon: "NOTIF_PV" },
];

// --- Helpers dates (purs, calcul sur la chaine "YYYY-MM-DD") ---------------

function joursEntre(aISO: string, bISO: string): number {
  const [ay, am, ad] = aISO.split("-").map(Number);
  const [by, bm, bd] = bISO.split("-").map(Number);
  return (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000;
}
function ajouterJours(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86_400_000).toISOString().slice(0, 10);
}
function ajouterMois(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, d)).toISOString().slice(0, 10);
}

// --- Regles metier ---------------------------------------------------------

/** CS de preparation traite ? CS a venir planifie, ou CS tenu dans la fenetre de
 *  prep avant l'AG (agDate suppose defini). L'etape Dates couvre CS + AG. */
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
 * entre dans la fenetre de preparation (ou qu'on est en retard) ; null sinon. Regle
 * ancree sur l'exercice reel (accountingEndDate), repli "derniere AG + 12 mois" si
 * l'exercice est inconnu.
 */
export function agDueDeadline(c: Copropriete, today: string): string | null {
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

/** La copro est-elle datee et dans la fenetre de cycle (pour lire ses jalons) ? */
export function estDateeEnCycle(c: Copropriete, today: string): boolean {
  const d = c.prochaineAg?.date;
  if (d === undefined) return false;
  const j = joursEntre(today, d);
  return j <= PARCOURS_HORIZON && j >= -PARCOURS_RETRO;
}

/** La copro doit-elle apparaitre dans le parcours ? Datee en cycle, ou AG due. */
export function estEnParcours(c: Copropriete, today: string): boolean {
  return estDateeEnCycle(c, today) || agDueDeadline(c, today) !== null;
}

/**
 * Construit la ligne parcours d'une copro : etape courante + prochaine action + echeance.
 * `accompli` = codes de jalons accomplis pour cette copro+AG. Renvoie null si le cycle
 * est complet (rien a faire). `tri` = date servant a ordonner les copros par urgence.
 */
export function construireLigne(
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
