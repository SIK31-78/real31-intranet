// Adapter Estale du CondoEstaleProvider (Phase B, ADR-022) : Conseil Syndical
// (Condo.council), historique des AG (Condo.meetings). La copro est resolue par
// REFERENCE NORMALISEE (S0299 -> S299) via me.collaborator.condos : pas de query
// liste cross-copros dans l'API, et les references font foi (decision Sekou
// 2026-06-12 ; externalIdEstale non utilise pour l'instant).

import type { CondoEstaleProvider } from "@/lib/ports/condo-estale-provider";
import type {
  AgPassee,
  ConsommationEau,
  ContratEstale,
  DebiteurEstale,
  DonneesEstaleCopro,
  MembreConseilSyndical,
} from "@/lib/domain/copropriete";
import { estaleGql } from "./client";

// --- Resolution reference -> condo id (cache module, TTL court) -------------

type CondoRef = { id: string; reference: string };
let cacheCondos: { liste: CondoRef[]; expire: number } | null = null;
const TTL_MS = 10 * 60 * 1000;

/** "S0299" / "s299 " -> "S299" : prefixe lettre + numero sans zeros de tete. */
function normaliserRef(ref: string): string {
  const m = ref.trim().toUpperCase().match(/^([A-Z]+)0*(\d+)$/);
  return m ? `${m[1]}${m[2]}` : ref.trim().toUpperCase();
}

async function resoudreCondoId(code: string): Promise<string | null> {
  if (!cacheCondos || Date.now() > cacheCondos.expire) {
    const data = await estaleGql<{ me: { collaborator: { condos: CondoRef[] } } }>(
      `{ me { collaborator { condos(archived: false) { id reference } } } }`,
    );
    cacheCondos = { liste: data.me.collaborator.condos, expire: Date.now() + TTL_MS };
  }
  const cible = normaliserRef(code);
  return cacheCondos.liste.find((c) => normaliserRef(c.reference) === cible)?.id ?? null;
}

// --- Donnees condo -----------------------------------------------------------

type CondoData = {
  condo: {
    constructionDate: number | null;
    meetingVideo: boolean | null;
    council: {
      role: "PRESIDENT" | "MEMBER";
      expiry: number | null;
      owner: { fullname: string; lastname: string; firstname: string | null; email: string | null };
    }[];
    meetings: {
      category: string;
      startAt: string | null;
      transcript: { validated: boolean };
    }[];
    contracts: { label: string; category: string; period: [string, string] }[];
    litigation: { count: number };
    accountingV2: {
      periodCurrent: [string, string] | null;
      exercices: { id: string; period: [string, string]; budgetOrdinary: { amount: number } | null }[];
    };
  };
};

const QUERY_CONDO = `query DonneesCopro($id: ID!) {
  condo(id: $id) {
    constructionDate
    meetingVideo
    council { role expiry owner { fullname lastname firstname email } }
    meetings { category startAt transcript { validated } }
    contracts { label category period }
    litigation { count }
    accountingV2 { periodCurrent exercices { id period budgetOrdinary { amount } } }
  }
}`;

// Debiteurs (compte 450) a l'exercice courant : solde par coproprietaire > 0.
// On signale ceux dont le debit depasse 5% du budget annuel (candidats recouvrement).
const QUERY_DEBITEURS = `query Debiteurs($id: ID!, $ex: ID!) {
  condo(id: $id) { owners(archived: false) { fullname lastname firstname balance(accountingID: $ex) } }
}`;

async function debiteursExercice(
  condoId: string,
  exId: string,
  budget: number | undefined,
): Promise<DebiteurEstale[]> {
  try {
    const d = await estaleGql<{
      condo: { owners: { fullname: string; lastname: string; firstname: string | null; balance: number }[] };
    }>(QUERY_DEBITEURS, { id: condoId, ex: exId });
    const seuil = budget != null ? budget * 0.05 : Number.POSITIVE_INFINITY;
    return d.condo.owners
      .filter((o) => o.balance > 0)
      .map((o) => ({ nom: formatPresent(o), montant: o.balance, depasse5pct: o.balance > seuil }))
      .sort((a, b) => b.montant - a.montant);
  } catch {
    return [];
  }
}

// Requete comptable ISOLEE (try/catch) : on lit la liste des comptes de l'exercice
// avec leurs stats, puis on agrege par nomenclature (plan comptable copro). Isolee
// car une erreur compta ne doit pas casser le reste (CS, contrats...).
//   6   = comptes de charges   -> debit = depenses courantes
//   105 = fonds de travaux ALUR -> -balance = montant du fonds (solde crediteur)
//   702Txx = provisions travaux par chantier -> credit = budget vote/appele
//   671Txx = charges travaux du meme chantier -> debit = depenses constatees
type StatCompte = { debit: number | null; credit: number | null; balance: number | null };
type Compte = { id: string; nomenclature: string; name: string; statisticsPeriod: StatCompte };
const QUERY_COMPTES = `query Comptes($id: ID!, $p: Daterange!) {
  condo(id: $id) {
    accountingV2 { exercice { accounts(archived: false) { id nomenclature name statisticsPeriod(period: $p) { debit credit balance } } } }
  }
}`;

type Comptes = {
  depenses?: number;
  fonds?: number;
  travauxVotes: { libelle: string; budgetVote: number; depenses: number }[];
  eauIds: string[];
};

async function comptesExercice(condoId: string, periode: [string, string]): Promise<Comptes> {
  try {
    const d = await estaleGql<{ condo: { accountingV2: { exercice: { accounts: Compte[] } } } }>(
      QUERY_COMPTES,
      { id: condoId, p: periode },
    );
    const accounts = d.condo.accountingV2.exercice.accounts;
    const stat = (n: string): StatCompte | undefined => accounts.find((a) => a.nomenclature === n)?.statisticsPeriod;
    const charges = stat("6");
    const fonds = stat("105");
    const eauIds = accounts.filter((a) => a.nomenclature.startsWith("601")).map((a) => a.id);
    // Travaux votes = niveau "chantier" du 702 (702Txx, hors lignes "Lot n0X"). Le
    // budget appele = credit du 702Txx ; les depenses constatees = debit du 671 du
    // meme chantier (meme suffixe T-code, ex 702T01 <-> 671T01).
    const debitDe = (n: string): number => accounts.find((a) => a.nomenclature === n)?.statisticsPeriod.debit ?? 0;
    const travauxVotes = accounts
      .filter(
        (a) =>
          a.nomenclature.startsWith("702T") && !a.name.startsWith("Lot") && (a.statisticsPeriod.credit ?? 0) > 0,
      )
      .map((a) => ({
        libelle: a.name,
        budgetVote: a.statisticsPeriod.credit!,
        depenses: debitDe(`671${a.nomenclature.slice(3)}`),
      }));
    return {
      eauIds,
      travauxVotes,
      ...(charges?.debit ? { depenses: charges.debit } : {}),
      ...(fonds?.balance ? { fonds: -fonds.balance } : {}),
    };
  } catch {
    return { eauIds: [], travauxVotes: [] }; // exercice sans comptabilite alimentee
  }
}

// Consommation d'eau : ecritures du compte 601, volume lu dans le libelle ("... - 71m3").
// Prix au m3 = montant total (debit) / volume total.
const QUERY_EAU = `query Eau($id: ID!, $ids: [ID!]!) {
  condo(id: $id) { accountingV2 { exercice { entries(coaIDs: $ids) { label amount movement } } } }
}`;

async function consommationEau(condoId: string, eauIds: string[]): Promise<ConsommationEau | undefined> {
  if (eauIds.length === 0) return undefined;
  try {
    const d = await estaleGql<{
      condo: { accountingV2: { exercice: { entries: { label: string; amount: number; movement: string }[] } } };
    }>(QUERY_EAU, { id: condoId, ids: eauIds });
    let volume = 0;
    let montant = 0;
    for (const e of d.condo.accountingV2.exercice.entries) {
      if (e.movement !== "DEBIT") continue;
      montant += e.amount;
      const m = e.label.match(/(\d+(?:[.,]\d+)?)\s*m3/i);
      if (m) volume += Number(m[1].replace(",", "."));
    }
    if (volume <= 0 || montant <= 0) return undefined;
    return { volume, montant, prixM3: montant / volume };
  } catch {
    return undefined;
  }
}

/** Borne de Daterange Estale -> ISO ou undefined (gere "infinity" / vide). */
function borneISO(v: string | undefined): string | undefined {
  if (!v || v === "infinity" || v === "-infinity") return undefined;
  return v.slice(0, 10);
}

/** Une chaine est-elle "en capitales" (au moins une lettre, aucune minuscule) ? */
function estCapitales(s: string): boolean {
  return s === s.toUpperCase() && s !== s.toLowerCase();
}

/** Present "NOM Prenom" (NOM en capitales). Convention Estale : nom en MAJUSCULES,
 *  prenom en casse normale. Si la saisie est inversee (prenom tout en capitales,
 *  nom non capitalise -> ex. last="Emmanuel" first="LOPES"), on remet a l'endroit.
 *  Sans prenom separe (nom complet dans lastname), on garde le fullname tel quel. */
export function formatPresent(owner: {
  fullname: string;
  lastname: string;
  firstname: string | null;
}): string {
  const prenomBrut = owner.firstname?.trim();
  if (!prenomBrut) return owner.fullname.trim();
  let nom = owner.lastname.trim();
  let prenom = prenomBrut;
  if (estCapitales(prenom) && !estCapitales(nom)) {
    [nom, prenom] = [prenom, nom]; // saisie inversee dans Estale
  }
  return `${nom.toUpperCase()} ${prenom}`;
}

/** ORDINARY -> AG ; tout le reste (EXTRAORDINARY, URGENT, SPECIAL...) -> AGE. */
function typeAg(category: string): "AG" | "AGE" {
  return category === "ORDINARY" ? "AG" : "AGE";
}

export class EstaleCondoProvider implements CondoEstaleProvider {
  async getDonneesCopro(code: string): Promise<DonneesEstaleCopro | null> {
    const condoId = await resoudreCondoId(code);
    if (!condoId) return null; // copro pas (encore) sur Estale -> blocs "a venir"

    const { condo } = await estaleGql<CondoData>(QUERY_CONDO, { id: condoId });

    const conseilSyndical: MembreConseilSyndical[] = condo.council
      .map((c) => ({
        nomComplet: formatPresent(c.owner),
        role: c.role === "PRESIDENT" ? ("president" as const) : ("membre" as const),
        ...(c.owner.email && c.owner.email.includes("@") ? { email: c.owner.email.trim() } : {}),
      }))
      // President en premier, puis alphabetique.
      .sort((a, b) =>
        a.role === b.role ? a.nomComplet.localeCompare(b.nomComplet) : a.role === "president" ? -1 : 1,
      );

    // Echeance du mandat : l'expiry max des membres (annee), si renseigne.
    const expiry = Math.max(0, ...condo.council.map((c) => c.expiry ?? 0));

    const aujourdhui = new Date().toISOString().slice(0, 10);
    const historiqueAg: AgPassee[] = condo.meetings
      .filter((m) => m.startAt && m.startAt.slice(0, 10) <= aujourdhui)
      .map((m) => ({
        date: m.startAt!.slice(0, 10),
        type: typeAg(m.category),
        pvDispo: m.transcript.validated,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    const contrats: ContratEstale[] = condo.contracts.map((c) => ({
      libelle: c.label,
      categorie: c.category,
      ...(borneISO(c.period?.[0]) ? { debut: borneISO(c.period[0]) } : {}),
      ...(borneISO(c.period?.[1]) ? { fin: borneISO(c.period[1]) } : {}),
    }));

    // Comptabilite : exercice courant -> budget previsionnel + agregats par compte.
    const acc = condo.accountingV2;
    const exCourant =
      acc.exercices.find((e) => acc.periodCurrent && e.period[0] === acc.periodCurrent[0]) ??
      acc.exercices[0];
    const budgetPrevisionnel = exCourant?.budgetOrdinary?.amount;
    // Comptes et debiteurs sont deux requetes independantes du meme exercice (debiteurs
    // ne depend PAS du resultat de comptes) -> parallelisees. Eau depend de comptes.eauIds,
    // donc reste sequentiel apres.
    const [comptes, debiteurs] = exCourant
      ? await Promise.all([
          comptesExercice(condoId, exCourant.period),
          debiteursExercice(condoId, exCourant.id, budgetPrevisionnel),
        ])
      : ([{ eauIds: [], travauxVotes: [] }, []] as [Comptes, DebiteurEstale[]]);
    const eau = await consommationEau(condoId, comptes.eauIds);

    return {
      conseilSyndical,
      ...(expiry > 0 ? { mandatJusqua: `AG ${expiry}` } : {}),
      historiqueAg,
      conformite: [], // la conformite (PPT...) reste composee depuis le referentiel
      ...(condo.constructionDate ? { anneeConstruction: condo.constructionDate } : {}),
      ...(condo.meetingVideo != null ? { agVisioAcceptee: condo.meetingVideo } : {}),
      ...(contrats.length > 0 ? { contrats } : {}),
      ...(condo.litigation.count > 0 ? { nbProcedures: condo.litigation.count } : {}),
      ...(budgetPrevisionnel != null ? { budgetPrevisionnel } : {}),
      ...(comptes.depenses != null ? { depensesCourantes: comptes.depenses } : {}),
      ...(comptes.travauxVotes.length > 0 ? { travauxVotes: comptes.travauxVotes } : {}),
      ...(comptes.fonds != null ? { fondsTravaux: comptes.fonds } : {}),
      ...(debiteurs.length > 0 ? { debiteurs } : {}),
      ...(eau ? { eau } : {}),
    };
  }
}
