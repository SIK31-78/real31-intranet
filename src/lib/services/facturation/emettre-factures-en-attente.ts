// Service : emet vers l'outil de facturation externe (Pennylane) toutes les
// factures au statut 'a_facturer'. Passe par le routeur (ADR-001).
//
// Corrige deux defauts du flow legacy `FacturationSyndic` :
//   - il n'avait AUCUNE gestion d'erreur : un echec Pennylane laissait la ligne
//     sans trace, ni statut, ni message. Ici chaque echec est persiste sur la
//     facture (statut 'erreur' + message) et reste rejouable ;
//   - un echec sur une facture n'interrompt pas les suivantes (traitement
//     isole facture par facture).
//
// Idempotence : seules les factures 'a_facturer' sont prises ; une fois emise,
// une facture passe a 'facturee' et ne peut plus etre re-emise par ce service
// (pas de double facturation si le job est relance).

import { getFacturationRepository, getInvoicingProvider } from "@/lib/adapters/router";

export interface ResultatEmissionLot {
  emises: number;
  enErreur: number;
  /** Detail des echecs, pour le log du job / l'affichage admin. */
  erreurs: Array<{ factureId: string; message: string }>;
}

export async function emettreFacturesEnAttente(limite = 50): Promise<ResultatEmissionLot> {
  const repo = getFacturationRepository();
  const provider = getInvoicingProvider();

  const factures = await repo.listerFacturesAEmettre(limite);
  const resultat: ResultatEmissionLot = { emises: 0, enErreur: 0, erreurs: [] };

  for (const facture of factures) {
    try {
      const clientRef = await repo.getClientFacturationRef(facture.coproCode);
      if (!clientRef) {
        throw new Error(
          `Aucun identifiant client de facturation pour la copropriete ${facture.coproCode}.`,
        );
      }
      if (facture.lignes.length === 0) {
        throw new Error("Facture sans ligne : emission refusee.");
      }

      const { factureExterneId } = await provider.creerFactureBrouillon({
        clientRef,
        libelle: facture.libelle,
        dateFacture: facture.dateFacture,
        lignes: facture.lignes,
      });

      await repo.marquerFacturee(facture.id, factureExterneId);
      resultat.emises += 1;
    } catch (erreur) {
      const message = erreur instanceof Error ? erreur.message : String(erreur);
      // On persiste l'echec sans interrompre le lot : les factures suivantes
      // doivent pouvoir partir.
      await repo.marquerErreur(facture.id, message);
      resultat.enErreur += 1;
      resultat.erreurs.push({ factureId: facture.id, message });
    }
  }

  return resultat;
}
