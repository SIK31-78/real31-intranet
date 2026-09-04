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
import type { FactureAEmettre, TypePrestation } from "@/lib/ports/facturation-repository";

/** Titre court de la ligne sur le PDF. Le legacy le tirait de la liste Produits ;
 *  faute de reprise de cette liste, on le derive du type de prestation. */
const LIBELLE_PRESTATION: Record<TypePrestation, string> = {
  depassement_cs: "Honoraires de depassement - Conseil Syndical",
  depassement_ag: "Honoraires de depassement - Assemblee Generale",
  suivi_travaux: "Honoraires de suivi de travaux",
  suivi_sinistre: "Honoraires de suivi de sinistre",
  pre_etat_date: "Honoraires de pre-etat date",
  etat_date: "Honoraires d'etat date",
  gestion_courante: "Honoraires de gestion courante",
};

/** Objet de la facture (titre de section sur le PDF), par prestation. Repris des
 *  pdf_invoice_subject des flows legacy. */
const SUJET_PRESTATION: Record<TypePrestation, string> = {
  depassement_cs: "Honoraires complémentaires",
  depassement_ag: "Honoraires complémentaires",
  suivi_travaux: "Honoraires suivi travaux",
  suivi_sinistre: "Honoraires suivi sinistre",
  pre_etat_date: "Honoraires pré état daté",
  etat_date: "Honoraires état daté",
  gestion_courante: "Honoraires du trimestre en cours",
};

/**
 * Mention libre a imprimer a cote du code entite sur le PDF.
 *
 * Seul le suivi de sinistre en porte une : le comptable tape la reference du
 * sinistre (ex "S072DODUPINDDE") dans le champ "Libelle du sinistre", et c'est
 * elle qui lui permet de codifier la facture. Elle etait imprimee par le module
 * PowerApps ; elle etait bien saisie et stockee depuis le portage, mais plus
 * transmise a Pennylane (signale par Emmanuel LOPES). Les autres prestations
 * gardent le code entite seul.
 */
function mentionLibre(facture: FactureAEmettre): string | undefined {
  if (facture.typePrestation !== "suivi_sinistre") return undefined;
  const reference = facture.details?.["libelleSinistre"];
  if (typeof reference !== "string") return undefined;
  const nettoyee = reference.trim();
  return nettoyee.length > 0 ? nettoyee : undefined;
}

export interface ResultatEmissionLot {
  emises: number;
  enErreur: number;
  /** Detail des echecs, pour le log du job / l'affichage admin. */
  erreurs: Array<{ factureId: string; message: string }>;
}

export async function emettreFacturesEnAttente(ids: string[]): Promise<ResultatEmissionLot> {
  const repo = getFacturationRepository();
  const provider = getInvoicingProvider();

  const factures = await repo.listerFacturesAEmettre(ids);
  const resultat: ResultatEmissionLot = { emises: 0, enErreur: 0, erreurs: [] };

  // Catalogue produits charge une fois : resout libelle + product_id + compte
  // comptable par (categorie, agence de la copro).
  const produits = await repo.chargerProduits();
  const produitParCle = new Map(produits.map((pr) => [`${pr.categorie}|${pr.agence}`, pr]));

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

      const agence = await repo.getAgenceCopro(facture.coproCode);
      const mention = mentionLibre(facture);

      const { factureExterneId } = await provider.emettreFacture({
        clientRef,
        codeEntite: facture.coproCode,
        ...(mention ? { mentionLibre: mention } : {}),
        libelle: facture.libelle,
        sujet: SUJET_PRESTATION[facture.typePrestation],
        dateFacture: facture.dateFacture,
        lignes: facture.lignes.map((l) => {
          // Le produit (liste Produits) donne le libelle exact avec agence, le
          // product_id et le compte comptable. Repli sur le libelle par type si
          // la categorie n'est pas resolue (ne bloque pas l'emission).
          const produit =
            l.categorieProduit && agence
              ? produitParCle.get(`${l.categorieProduit}|${agence}`)
              : undefined;
          return {
            libelle: produit?.titre ?? LIBELLE_PRESTATION[facture.typePrestation],
            ...(l.description ? { detail: l.description } : {}),
            quantite: l.quantite,
            prixUnitaireHt: l.prixUnitaireHt,
            tauxTva: l.tauxTva,
            ...(produit
              ? { productId: produit.pennylaneProductId, ledgerAccountId: produit.ledgerAccountId }
              : {}),
          };
        }),
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
