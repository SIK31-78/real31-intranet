// Service : facture les honoraires de suivi de travaux.
// Passe par le routeur, jamais un adapter en direct (ADR-001).
//
// Pas de lecture du bareme ici : le montant depend uniquement de la saisie
// (pourcentage du montant des travaux, ou forfait). Le calcul reste centralise
// dans le domaine pour rester teste et coherent (TVA, mode de calcul).

import {
  calculerHonorairesTravaux,
  type DemandeHonorairesTravaux,
} from "@/lib/domain/facturation/honoraires-travaux";
import { getFacturationRepository } from "@/lib/adapters/router";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";
import { aujourdhuiISO } from "./bareme";

export interface DemandeFactureTravaux {
  /** Code copro (referenceCrypto). */
  coproCode: string;
  /** Libelle des travaux suivis (apparait sur la facture). */
  libelleTravaux: string;
  /** Mode de calcul des honoraires (pourcentage ou forfait). */
  honoraires: DemandeHonorairesTravaux;
  /** Initiales de l'auteur (tant qu'il n'y a pas d'auth). */
  par?: string;
}

export interface ResultatFactureTravaux {
  montantHt: number;
  factureId: string;
}

export async function creerFactureSuiviTravaux(
  demande: DemandeFactureTravaux,
  managerId: string,
): Promise<ResultatFactureTravaux> {
  await exigerPerimetre(demande.coproCode, managerId);
  const repo = getFacturationRepository();

  const { montantHt } = calculerHonorairesTravaux(demande.honoraires);

  const factureId = await repo.creerFacture({
    coproCode: demande.coproCode,
    typePrestation: "suivi_travaux",
    libelle: `Suivi de travaux - ${demande.libelleTravaux}`,
    dateFacture: aujourdhuiISO(),
    details: { honoraires: demande.honoraires },
    ...(demande.par ? { par: demande.par } : {}),
    lignes: [
      {
        description: `Honoraires de suivi de travaux - ${demande.libelleTravaux}`,
        quantite: 1,
        prixUnitaireHt: montantHt,
      },
    ],
  });

  return { montantHt, factureId };
}
