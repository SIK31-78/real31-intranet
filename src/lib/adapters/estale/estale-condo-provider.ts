// Adapter eStale du CondoEstaleProvider (Phase B, ADR-022) : Conseil Syndical
// (Condo.council), historique des AG (Condo.meetings). La copro est resolue par
// REFERENCE NORMALISEE (S0299 -> S299) via me.collaborator.condos : pas de query
// liste cross-copros dans l'API, et les references font foi (decision Sekou
// 2026-06-12 ; externalIdEstale non utilise pour l'instant).

import type { CondoEstaleProvider } from "@/lib/ports/condo-estale-provider";
import type {
  AgPassee,
  ContratEstale,
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
      owner: { fullname: string; lastname: string; firstname: string | null };
    }[];
    meetings: {
      category: string;
      startAt: string | null;
      transcript: { validated: boolean };
    }[];
    contracts: { label: string; category: string; period: [string, string] }[];
    litigation: { count: number };
    unpaid: { count: number };
    accountingV2: {
      periodCurrent: [string, string] | null;
      exercices: { period: [string, string]; budgetOrdinary: { amount: number } | null }[];
    };
  };
};

const QUERY_CONDO = `query DonneesCopro($id: ID!) {
  condo(id: $id) {
    constructionDate
    meetingVideo
    council { role expiry owner { fullname lastname firstname } }
    meetings { category startAt transcript { validated } }
    contracts { label category period }
    litigation { count }
    unpaid { count }
    accountingV2 { periodCurrent exercices { period budgetOrdinary { amount } } }
  }
}`;

// Requete comptable ISOLEE (try/catch) : on lit la liste des comptes de l'exercice
// avec leurs stats, puis on agrege par nomenclature (plan comptable copro). Isolee
// car une erreur compta ne doit pas casser le reste (CS, contrats...).
//   6   = comptes de charges  -> debit = depenses courantes
//   67  = charges travaux     -> debit = depenses travaux votees
//   105 = fonds de travaux ALUR -> -balance = montant du fonds (solde crediteur)
type StatCompte = { debit: number | null; balance: number | null };
const QUERY_COMPTES = `query Comptes($id: ID!, $p: Daterange!) {
  condo(id: $id) {
    accountingV2 { exercice { accounts(archived: false) { nomenclature statisticsPeriod(period: $p) { debit balance } } } }
  }
}`;

type Comptes = { depenses?: number; travaux?: number; fonds?: number };

async function comptesExercice(condoId: string, periode: [string, string]): Promise<Comptes> {
  try {
    const d = await estaleGql<{
      condo: { accountingV2: { exercice: { accounts: { nomenclature: string; statisticsPeriod: StatCompte }[] } } };
    }>(QUERY_COMPTES, { id: condoId, p: periode });
    const accounts = d.condo.accountingV2.exercice.accounts;
    const stat = (n: string): StatCompte | undefined => accounts.find((a) => a.nomenclature === n)?.statisticsPeriod;
    const charges = stat("6");
    const travaux = stat("67");
    const fonds = stat("105");
    return {
      ...(charges?.debit ? { depenses: charges.debit } : {}),
      ...(travaux?.debit ? { travaux: travaux.debit } : {}),
      ...(fonds?.balance ? { fonds: -fonds.balance } : {}),
    };
  } catch {
    return {}; // exercice sans comptabilite alimentee
  }
}

/** Borne de Daterange eStale -> ISO ou undefined (gere "infinity" / vide). */
function borneISO(v: string | undefined): string | undefined {
  if (!v || v === "infinity" || v === "-infinity") return undefined;
  return v.slice(0, 10);
}

/** Une chaine est-elle "en capitales" (au moins une lettre, aucune minuscule) ? */
function estCapitales(s: string): boolean {
  return s === s.toUpperCase() && s !== s.toLowerCase();
}

/** Present "NOM Prenom" (NOM en capitales). Convention eStale : nom en MAJUSCULES,
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
    [nom, prenom] = [prenom, nom]; // saisie inversee dans eStale
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
    if (!condoId) return null; // copro pas (encore) sur eStale -> blocs "a venir"

    const { condo } = await estaleGql<CondoData>(QUERY_CONDO, { id: condoId });

    const conseilSyndical: MembreConseilSyndical[] = condo.council
      .map((c) => ({
        nomComplet: formatPresent(c.owner),
        role: c.role === "PRESIDENT" ? ("president" as const) : ("membre" as const),
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
    const comptes = exCourant ? await comptesExercice(condoId, exCourant.period) : {};

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
      ...(comptes.travaux != null ? { depensesTravaux: comptes.travaux } : {}),
      ...(comptes.fonds != null ? { fondsTravaux: comptes.fonds } : {}),
      ...(condo.unpaid.count > 0 ? { nbDebiteurs: condo.unpaid.count } : {}),
    };
  }
}
