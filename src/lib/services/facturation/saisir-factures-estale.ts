// Service : saisit dans la compta ESTALE des copros les factures REAL31 deja emises chez
// Pennylane (REA-11). Passe par le routeur (ADR-001).
//
// Circuit : facture emise -> VALIDEE chez Pennylane (numero definitif) -> ecriture
// fournisseur REAL 31 creee dans ESTALE, deja imputee, au statut « bon a payer », PDF
// joint. Personne n'a rien a saisir.
//
// Deux voies, selon la prestation (decision Sekou du 08/10/2026) :
//   - gestion courante : ecriture fournisseur deja imputee, « bon a payer » ;
//   - toute autre prestation : PDF depose « a codifier » (facture a valider), c'est le
//     gestionnaire qui choisit l'imputation dans ESTALE.
// Seules les copros tenues dans ESTALE sont concernees ; les autres ont leur propre
// processus (CRYPTO via BPO) et sont ignorees sans trace.
//
// Une facture encore BROUILLON chez Pennylane n'a ni numero ni engagement : on note
// pourquoi elle n'est pas partie, et le bouton « Renvoyer dans ESTALE » la reprendra une
// fois validee. Meme chose pour tout echec (exercice verrouille, panne) : la facture
// Pennylane est deja emise, l'echec ESTALE ne doit jamais la remettre en cause.
//
// Anti-doublon a deux etages : l'intranet ne renvoie jamais une facture qui porte deja
// son ecriture ESTALE, et l'adapter verifie chez ESTALE qu'aucune facture REAL 31 ne
// porte deja ce numero (cas d'une ecriture passee malgre une coupure reseau).

import { getComptaEstaleProvider, getFacturationRepository, getInvoicingProvider } from "@/lib/adapters/router";
import { totalConcorde, ventilerPourEstale } from "@/lib/domain/facturation/ventilation-estale";
import { formatEuros } from "./format";

export const MESSAGE_BROUILLON_PENNYLANE =
  "Brouillon Pennylane : à valider dans Pennylane, puis « Renvoyer dans ESTALE ».";

export interface ResultatSaisieEstale {
  /** Gestion courante saisie en bon a payer. */
  envoyees: number;
  /** Autres prestations deposees a codifier par le gestionnaire. */
  aCodifier: number;
  /** Encore en brouillon chez Pennylane : partiront au renvoi, une fois validees. */
  enAttente: number;
  enErreur: number;
  erreurs: Array<{ factureId: string; coproCode: string; message: string }>;
}

export async function saisirFacturesDansEstale(ids: string[]): Promise<ResultatSaisieEstale> {
  const resultat: ResultatSaisieEstale = { envoyees: 0, aCodifier: 0, enAttente: 0, enErreur: 0, erreurs: [] };
  if (ids.length === 0) return resultat;

  const repo = getFacturationRepository();
  const pennylane = getInvoicingProvider();
  const estale = getComptaEstaleProvider();

  const factures = await repo.listerFacturesPourEstale(ids);
  for (const f of factures) {
    if (f.estaleEcritureId) continue;
    try {
      if (!(await estale.coproPresente(f.coproCode))) continue;

      const emise = await pennylane.lireFactureEmise(f.factureExterneId);
      if (!emise.validee || !emise.numero) {
        await repo.marquerErreurEstale(f.id, MESSAGE_BROUILLON_PENNYLANE);
        resultat.enAttente += 1;
        continue;
      }

      if (f.typePrestation !== "gestion_courante") {
        const pdf = await pennylane.telechargerPdf(f.factureExterneId);
        const { depotId } = await estale.deposerFactureACodifier({
          coproCode: f.coproCode,
          pdf,
          nomFichier: `${emise.numero}.pdf`,
        });
        await repo.marquerEnvoyeeEstale(f.id, depotId);
        resultat.aCodifier += 1;
        continue;
      }

      const lignes = ventilerPourEstale(f.lignes);
      if (!totalConcorde(lignes, emise.montantTtc)) {
        const total = lignes.reduce((t, l) => t + l.montantTtc, 0);
        throw new Error(
          `Montants discordants : ${formatEuros(total)} TTC côté intranet, ${formatEuros(emise.montantTtc)} chez Pennylane. Facture non envoyée.`,
        );
      }

      const pdf = await pennylane.telechargerPdf(f.factureExterneId);
      const { ecritureId } = await estale.deposerFacture({
        coproCode: f.coproCode,
        numero: emise.numero,
        libelle: f.libelle,
        date: emise.date,
        echeance: emise.echeance,
        lignes,
        pdf,
        nomFichier: `${emise.numero}.pdf`,
      });
      await repo.marquerEnvoyeeEstale(f.id, ecritureId);
      resultat.envoyees += 1;
    } catch (erreur) {
      const message = erreur instanceof Error ? erreur.message : String(erreur);
      // Ne jamais laisser une erreur de trace masquer l'erreur d'origine.
      await repo.marquerErreurEstale(f.id, message).catch(() => undefined);
      resultat.enErreur += 1;
      resultat.erreurs.push({ factureId: f.id, coproCode: f.coproCode, message });
    }
  }
  return resultat;
}
