// Adapter REEL du port EstaleComptaLectureProvider : chaque methode = UNE query GraphQL
// de LECTURE eStale, via le client authentifie estaleGql. C'est le SEUL fichier de ce
// volet compta qui connait estaleGql (hexagonal : le service ignore le transport).
//
// LECTURE SEULE : aucune mutation ici, aucun gate ESTALE_ECRITURE. On MESURE la compta,
// on ne la modifie jamais. Ce provider est donc sans danger meme sur l'eStale de PROD.
//
// Queries verifiees contre docs/estale-schema.graphql (NE PAS deviner) :
//   - me.collaborator.condos(archived) { id reference }        -> resolution CODE -> condoID
//   - condo(id).accountingV2.exercice { id }                   -> exercice COURANT (Accounting)
//   - condo(id).accounting(id).balance                         -> Accounting.balance (Float!)
//   - condo(id).accounting(id).accounts(archived) { nomenclature name debit credit }
//         debit(accountingID)/credit(accountingID) : Float! sur AccountingAccount, pinnes a
//         l'accounting lu (on passe l'accountingID en variable) ; solde recalcule = debit-credit.

import { estaleGql, estaleConfigure } from "@/lib/adapters/estale/client";
import { classeDe, type EtatExercice, type SoldeCompte } from "@/lib/reprise/domain/compta";
import type {
  EstaleComptaLectureProvider,
  OwnerEstale,
  RefAccounting,
} from "@/lib/reprise/ports/estale-compta-lecture-provider";

// --- Resolution CODE copro -> condoID (meme approche que EstaleCondoProvider) ----
// eStale n'a pas de query liste cross-copros : on rassemble les condos accessibles a
// l'utilisateur et on apparie par REFERENCE NORMALISEE (S0302 -> S302). Cache module a TTL
// court pour ne pas re-interroger l'annuaire a chaque mesure.
//
// MULTI-AGENCE (finding Inc. 2) : me.collaborator.condos ne liste QUE les copros du portefeuille
// du collaborateur connecte (souvent une seule agence). Or une copro cible peut relever d'une
// AUTRE agence a laquelle l'utilisateur a acces (ex. S0302 = agence de Houilles). On elargit
// donc la resolution a toutes les sources de condos exposees par le schema :
//   - me.collaborator.condos      (portefeuille du collaborateur)
//   - me.agency.condos            (toute l'agence de l'utilisateur)
//   - me.accesses (union Agency | Establishment | Collaborator) -> condos de chaque acces
// On deduplique par id. Aucune ecriture : lecture seule.

type CondoRef = { id: string; reference: string };
let cacheCondos: { liste: CondoRef[]; expire: number } | null = null;
const TTL_MS = 10 * 60 * 1000;

const Q_CONDOS_ACCESSIBLES = `{
  me {
    collaborator { condos(archived: false) { id reference } }
    agency { condos(archived: false) { id reference } }
    accesses {
      __typename
      ... on Agency { condos(archived: false) { id reference } }
      ... on Establishment { condos(archived: false) { id reference } }
      ... on Collaborator { condos(archived: false) { id reference } }
    }
  }
}`;

type CondosAccessiblesData = {
  me: {
    collaborator: { condos: CondoRef[] } | null;
    agency: { condos: CondoRef[] } | null;
    accesses: ({ condos?: CondoRef[] } | null)[] | null;
  };
};

/** "S0302" / "s302 " -> "S302" : prefixe lettre + numero sans zeros de tete. */
function normaliserRef(ref: string): string {
  const m = ref.trim().toUpperCase().match(/^([A-Z]+)0*(\d+)$/);
  return m ? `${m[1]}${m[2]}` : ref.trim().toUpperCase();
}

/** Rassemble et deduplique (par id) tous les condos accessibles a l'utilisateur connecte. */
async function chargerCondosAccessibles(): Promise<CondoRef[]> {
  const data = await estaleGql<CondosAccessiblesData>(Q_CONDOS_ACCESSIBLES);
  const parId = new Map<string, CondoRef>();
  const ajouter = (liste?: CondoRef[] | null) => {
    for (const c of liste ?? []) if (c && c.id) parId.set(c.id, c);
  };
  ajouter(data.me.collaborator?.condos);
  ajouter(data.me.agency?.condos);
  for (const acces of data.me.accesses ?? []) ajouter(acces?.condos);
  return [...parId.values()];
}

async function resoudreCondoId(code: string): Promise<string | null> {
  if (!cacheCondos || Date.now() > cacheCondos.expire) {
    cacheCondos = { liste: await chargerCondosAccessibles(), expire: Date.now() + TTL_MS };
  }
  const cible = normaliserRef(code);
  return cacheCondos.liste.find((c) => normaliserRef(c.reference) === cible)?.id ?? null;
}

// --- Queries compta (LECTURE) ---------------------------------------------------
const Q_EXERCICE_COURANT = `query($id: ID!) {
  condo(id: $id) { accountingV2 { exercice { id } } }
}`;

const Q_BALANCE_GLOBALE = `query($c: ID!, $a: ID!) {
  condo(id: $c) { accounting(id: $a) { balance } }
}`;

// id + dkID : indispensables a l'ECRITURE (createEntryExpert prend un accountID et une cle de
// repartition, jamais une nomenclature). Les lire ICI evite un 2e aller-retour a l'import du
// bloc A - et permet de REFUSER l'import avant la 1re mutation si une cible n'a pas d'id.
// Champs verifies sur AccountingAccount (docs/estale-schema.graphql : id ID!, dkID ID!).
const Q_COMPTES = `query($c: ID!, $a: ID!) {
  condo(id: $c) {
    accounting(id: $a) {
      accounts(archived: false) {
        id
        dkID
        nomenclature
        name
        debit(accountingID: $a)
        credit(accountingID: $a)
      }
    }
  }
}`;

// Owners du condo : la REFERENCE est la cle qui derive le compte 450 cible (mesure S0303 :
// eStale cree 4500001..450000A, suffixe = reference). fullname sert a l'appariement avec
// les intitules 450 du grand livre SOURCE ; il n'est jamais logue.
const Q_OWNERS = `query($c: ID!) {
  condo(id: $c) {
    owners(archived: false) {
      id
      reference
      fullname
    }
  }
}`;

// Exercices du condo : bornes (period = Daterange [debut, fin]), verrou, cloture. C'est la
// lecture du PREREQUIS d'import (sonde SE999 : hors exercice = refus, verrouille = refus).
const Q_EXERCICES = `query($c: ID!) {
  condo(id: $c) {
    accountingV2 {
      exercices { id period lockedAt closedAt }
    }
  }
}`;

type ExercicesData = {
  condo: {
    accountingV2: {
      exercices: { id: string; period: [string, string]; lockedAt: string | null; closedAt: string | null }[];
    };
  } | null;
};

type OwnersData = {
  condo: { owners: { id: string; reference: string; fullname: string }[] } | null;
};

type ExerciceData = { condo: { accountingV2: { exercice: { id: string } | null } } | null };
type BalanceData = { condo: { accounting: { balance: number } | null } | null };
type ComptesData = {
  condo: {
    accounting: {
      accounts: {
        id: string;
        dkID: string;
        nomenclature: string;
        name: string;
        debit: number;
        credit: number;
      }[];
    } | null;
  } | null;
};

/** Arrondi comptable au centime (aligne sur le domaine ; evite le bruit flottant). */
function arrondi(n: number): number {
  return Math.round(n * 100) / 100;
}

export class ReelEstaleComptaLectureProvider implements EstaleComptaLectureProvider {
  /** Garde-fou : ce provider ne doit etre choisi que si eStale est configure (cf. router). */
  private assertConfigure(): void {
    if (!estaleConfigure()) {
      throw new Error(
        "eStale non configure (ESTALE_EMAIL / ESTALE_PASSWORD absents) : lecture comptable impossible.",
      );
    }
  }

  async resoudreAccounting(coproCode: string): Promise<RefAccounting | null> {
    this.assertConfigure();
    const condoID = await resoudreCondoId(coproCode);
    if (!condoID) return null; // copro pas (encore) sur eStale
    const data = await estaleGql<ExerciceData>(Q_EXERCICE_COURANT, { id: condoID });
    const accountingID = data.condo?.accountingV2.exercice?.id;
    if (!accountingID) return null; // copro sans exercice comptable ouvert
    return { condoID, accountingID };
  }

  async lireBalanceGlobale(ref: RefAccounting): Promise<number> {
    this.assertConfigure();
    const data = await estaleGql<BalanceData>(Q_BALANCE_GLOBALE, {
      c: ref.condoID,
      a: ref.accountingID,
    });
    const balance = data.condo?.accounting?.balance;
    if (balance == null) {
      throw new Error(`Accounting.balance introuvable pour l'exercice ${ref.accountingID}.`);
    }
    return balance;
  }

  async lireComptes(ref: RefAccounting): Promise<SoldeCompte[]> {
    this.assertConfigure();
    const data = await estaleGql<ComptesData>(Q_COMPTES, { c: ref.condoID, a: ref.accountingID });
    const accounts = data.condo?.accounting?.accounts ?? [];
    return accounts.map((a) => ({
      id: a.id,
      dkID: a.dkID,
      nomenclature: a.nomenclature,
      libelle: a.name,
      classe: classeDe(a.nomenclature),
      debit: arrondi(a.debit),
      credit: arrondi(a.credit),
      solde: arrondi(a.debit - a.credit),
    }));
  }

  async lireExercices(condoID: string): Promise<EtatExercice[]> {
    this.assertConfigure();
    const data = await estaleGql<ExercicesData>(Q_EXERCICES, { c: condoID });
    return (data.condo?.accountingV2.exercices ?? []).map((e) => ({
      accountingID: e.id,
      debut: e.period[0],
      fin: e.period[1],
      verrouille: e.lockedAt != null,
      clos: e.closedAt != null,
    }));
  }

  async lireOwners(ref: RefAccounting): Promise<OwnerEstale[]> {
    this.assertConfigure();
    const data = await estaleGql<OwnersData>(Q_OWNERS, { c: ref.condoID });
    return (data.condo?.owners ?? []).map((o) => ({
      id: o.id,
      reference: o.reference,
      nom: o.fullname,
    }));
  }
}
