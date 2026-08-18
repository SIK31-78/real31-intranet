// Adapter MOCK du port EstaleComptaLectureProvider : donnees en dur, AUCUN reseau. Sert
// au mode demonstration (eStale non configure) et de fixture pour tester le service et
// construireBalance sans dependre du schema eStale reel.
//
// Copro fictive "S0MOCK" : un exercice equilibre (total debit == total credit) compose de
// comptes des classes 4, 5, 6 et 7. Propriete choisie a dessein :
//   - blocs A (classes 4/5) + B (classe 6) SEULS => la balance NE tombe PAS a 0 ;
//   - c'est la classe 7 (produits, 10000 au credit) qui equilibre l'ensemble.
// Cela permet a un test de filtrer les classes 4/5/6 (equilibre=false) puis de verifier
// que le jeu complet est equilibre (equilibre=true).
//
// Total debit  = 3000 (450) + 8000 (512) + 4000 (606)           = 15000
// Total credit = 5000 (401) + 10000 (701)                       = 15000  -> equilibre.

import { classeDe, type EtatExercice, type SoldeCompte } from "@/lib/reprise/domain/compta";
import type {
  EstaleComptaLectureProvider,
  OwnerEstale,
  RefAccounting,
} from "@/lib/reprise/ports/estale-compta-lecture-provider";

/** Code copro reconnu par le mock (toute autre valeur => copro "introuvable" -> null). */
export const CODE_COPRO_MOCK = "S0MOCK";

const REF_MOCK: RefAccounting = { condoID: "condo-mock", accountingID: "acc-mock" };

/** Comptes fictifs (nomenclature, libelle, debit, credit). Solde/classe derives ci-dessous. */
const COMPTES_BRUTS: { nomenclature: string; libelle: string; debit: number; credit: number }[] = [
  { nomenclature: "4010000", libelle: "Fournisseurs", debit: 0, credit: 5000 },
  { nomenclature: "4500001", libelle: "Coproprietaire DUPONT", debit: 3000, credit: 0 },
  { nomenclature: "5120000", libelle: "Banque", debit: 8000, credit: 0 },
  { nomenclature: "6060000", libelle: "Charges - electricite", debit: 4000, credit: 0 },
  { nomenclature: "7010000", libelle: "Provisions sur budget", debit: 0, credit: 10000 },
];

/** Les comptes du mock, exposes en SoldeCompte (utile aux tests du domaine). */
export function comptesMock(): SoldeCompte[] {
  return COMPTES_BRUTS.map((c) => ({
    nomenclature: c.nomenclature,
    libelle: c.libelle,
    classe: classeDe(c.nomenclature),
    debit: c.debit,
    credit: c.credit,
    solde: c.debit - c.credit,
  }));
}

export class MockEstaleComptaLectureProvider implements EstaleComptaLectureProvider {
  async resoudreAccounting(coproCode: string): Promise<RefAccounting | null> {
    // Seule la copro de demonstration est connue ; le reste simule une copro absente.
    return coproCode.trim().toUpperCase() === CODE_COPRO_MOCK ? REF_MOCK : null;
  }

  async lireBalanceGlobale(): Promise<number> {
    // Exercice equilibre => balance globale eStale attendue a 0 (coherent avec les comptes).
    // La signature du port porte un RefAccounting ; le mock l'ignore (donnees en dur).
    return 0;
  }

  async lireComptes(): Promise<SoldeCompte[]> {
    return comptesMock();
  }

  async lireExercices(): Promise<EtatExercice[]> {
    // Un exercice courant ouvert et deverrouille : le cas nominal du mode demonstration.
    return [
      { accountingID: "acc-mock", debut: "2026-01-01", fin: "2026-12-31", verrouille: false, clos: false },
    ];
  }

  async lireOwners(): Promise<OwnerEstale[]> {
    // Aligne sur les comptes du mock : DUPONT ref "0001" -> compte 4500001 (meme convention
    // de suffixe que le reel, mesuree sur S0303). Permet de tester la liaison auto de bout
    // en bout sans eStale.
    return [{ id: "owner-mock-1", reference: "0001", nom: "DUPONT" }];
  }
}
