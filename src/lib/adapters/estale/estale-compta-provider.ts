// Adapter ESTALE : saisit une facture REAL 31 dans la compta de la copropriete (REA-11).
//
// Mutation `createEntry` (ecriture d'achat, celle du formulaire « Ajouter une facture »),
// et SURTOUT PAS `createInvoiceCondo` : celle-ci EMET une facture ESTALE (numerotation
// ESTALE) qui ne se modifie ni ne se supprime plus. `createEntry` donne une facture
// fournisseur corrigeable, comme une saisie manuelle. Prouve sur SE999 le 01/10/2026,
// cf. docs/facturation-estale-spike.md.
//
// Referentiel resolu a chaque envoi, rien d'identifiant en dur : la copro par sa
// reference, le fournisseur par son compte 4010001 (son NOM varie selon l'agence),
// les comptes de charge par leur nomenclature, la cle par celle du compte.

import type {
  ComptaEstaleProvider,
  FactureFournisseurEstale,
  ResultatDepotEstale,
} from "@/lib/ports/compta-estale-provider";
import { raisonExerciceFerme } from "@/lib/domain/facturation/ventilation-estale";
import { estaleGql, estaleGqlUpload } from "./client";
import { resoudreCondoId } from "./condos-accessibles";

/** Compte fournisseur de REAL 31 dans chaque copro ESTALE (relevé le 01/10/2026). */
const COMPTE_FOURNISSEUR_REAL31 = "4010001";

const Q_REFERENTIEL = `query($c: ID!) {
  condo(id: $c) {
    suppliers(archived: false) { id name account { id nomenclature } }
    accounts { id nomenclature isWritable dkID }
    accountings { period lockedAt closedAt }
  }
}`;

type Referentiel = {
  condo: {
    suppliers: { id: string; name: string; account: { id: string; nomenclature: string } }[];
    accounts: { id: string; nomenclature: string; isWritable: boolean; dkID: string }[];
    // Daterange : ESTALE le rend en tableau [debut, fin] (mesure du 01/10/2026), pas en chaine.
    accountings: { period: unknown; lockedAt: string | null; closedAt: string | null }[];
  };
};

const Q_DEJA_PRESENTE = `query($c: ID!, $s: ID!, $ref: String!) {
  condo(id: $c) { invoice { find(supplierID: $s, ref: $ref) { id } } }
}`;

const M_CREER = `mutation($input: EntryCreateInput!) { createEntry(input: $input) { id } }`;

export class EstaleComptaProvider implements ComptaEstaleProvider {
  async coproPresente(coproCode: string): Promise<boolean> {
    return (await resoudreCondoId(coproCode)) !== null;
  }

  async deposerFacture(f: FactureFournisseurEstale): Promise<ResultatDepotEstale> {
    const condoId = await resoudreCondoId(f.coproCode);
    if (!condoId) throw new Error(`La copropriété ${f.coproCode} n'est pas dans ESTALE.`);

    const { condo } = await estaleGql<Referentiel>(Q_REFERENTIEL, { c: condoId });

    const fournisseur = condo.suppliers.find(
      (s) => s.account.nomenclature === COMPTE_FOURNISSEUR_REAL31 && /real\s*31/i.test(s.name),
    );
    if (!fournisseur) {
      throw new Error(`Fournisseur REAL 31 (compte ${COMPTE_FOURNISSEUR_REAL31}) introuvable dans ESTALE pour ${f.coproCode}.`);
    }

    const raison = raisonExerciceFerme(
      f.date,
      condo.accountings.map((e) => ({
        periode: typeof e.period === "string" ? e.period : JSON.stringify(e.period),
        verrouille: Boolean(e.lockedAt),
        clos: Boolean(e.closedAt),
      })),
    );
    if (raison) throw new Error(`${raison} (${f.coproCode})`);

    const breakdowns = f.lignes.map((l) => {
      const compte = condo.accounts.find((a) => a.nomenclature === l.compte && a.isWritable);
      if (!compte) throw new Error(`Compte ${l.compte} absent ou non saisissable dans ESTALE pour ${f.coproCode}.`);
      return { amount: l.montantTtc, vat: l.tva, dkID: compte.dkID, accountID: compte.id, label: l.libelle };
    });

    // Anti-doublon cote ESTALE : une mutation qui a abouti malgre une coupure reseau
    // ne doit pas repartir. ESTALE retrouve une facture par fournisseur + numero.
    const existante = await estaleGql<{ condo: { invoice: { find: { id: string } | null } } }>(Q_DEJA_PRESENTE, {
      c: condoId,
      s: fournisseur.id,
      ref: f.numero,
    });
    if (existante.condo.invoice.find) {
      return { ecritureId: existante.condo.invoice.find.id, dejaPresente: true };
    }

    const { createEntry } = await estaleGqlUpload<{ createEntry: { id: string } }>(
      M_CREER,
      {
        input: {
          condoID: condoId,
          date: f.date,
          dueDate: f.echeance,
          label: f.libelle,
          ledger: "PURCHASE",
          accountID: fournisseur.account.id,
          movement: "CREDIT",
          piece: f.numero,
          // Sans statut explicite, ESTALE cree l'ecriture en PAID. PAYMENT = « bon a payer ».
          status: "PAYMENT",
          file: null,
          breakdowns,
        },
      },
      "input.file",
      { contenu: f.pdf, nom: f.nomFichier, type: "application/pdf" },
    );
    return { ecritureId: createEntry.id, dejaPresente: false };
  }
}
