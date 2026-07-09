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
import { classeDe, type SoldeCompte } from "@/lib/reprise/domain/compta";
import type {
  EstaleComptaLectureProvider,
  RefAccounting,
} from "@/lib/reprise/ports/estale-compta-lecture-provider";

// --- Resolution CODE copro -> condoID (meme approche que EstaleCondoProvider) ----
// eStale n'a pas de query liste cross-copros : on passe par me.collaborator.condos et on
// apparie par REFERENCE NORMALISEE (S0302 -> S302). Cache module a TTL court pour ne pas
// re-interroger l'annuaire a chaque mesure.

type CondoRef = { id: string; reference: string };
let cacheCondos: { liste: CondoRef[]; expire: number } | null = null;
const TTL_MS = 10 * 60 * 1000;

/** "S0302" / "s302 " -> "S302" : prefixe lettre + numero sans zeros de tete. */
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

// --- Queries compta (LECTURE) ---------------------------------------------------
const Q_EXERCICE_COURANT = `query($id: ID!) {
  condo(id: $id) { accountingV2 { exercice { id } } }
}`;

const Q_BALANCE_GLOBALE = `query($c: ID!, $a: ID!) {
  condo(id: $c) { accounting(id: $a) { balance } }
}`;

const Q_COMPTES = `query($c: ID!, $a: ID!) {
  condo(id: $c) {
    accounting(id: $a) {
      accounts(archived: false) {
        nomenclature
        name
        debit(accountingID: $a)
        credit(accountingID: $a)
      }
    }
  }
}`;

type ExerciceData = { condo: { accountingV2: { exercice: { id: string } | null } } | null };
type BalanceData = { condo: { accounting: { balance: number } | null } | null };
type ComptesData = {
  condo: {
    accounting: {
      accounts: { nomenclature: string; name: string; debit: number; credit: number }[];
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
      nomenclature: a.nomenclature,
      libelle: a.name,
      classe: classeDe(a.nomenclature),
      debit: arrondi(a.debit),
      credit: arrondi(a.credit),
      solde: arrondi(a.debit - a.credit),
    }));
  }
}
