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
import { formatEuros } from "./format";
import type { ApercuFacturation } from "./apercu";
import { CATEGORIE_SUIVI_TRAVAUX } from "@/lib/domain/facturation/produits";

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
  /** Null si le montant calcule est nul : aucune facture n'est creee. */
  factureId: string | null;
}

export async function apercuSuiviTravaux(
  demande: DemandeFactureTravaux,
  managerId: string,
): Promise<ApercuFacturation> {
  await exigerPerimetre(demande.coproCode, managerId);
  const { montantHt } = calculerHonorairesTravaux(demande.honoraires);

  const details =
    demande.honoraires.mode === "pourcentage"
      ? [
          { libelle: "Travaux", valeur: demande.libelleTravaux },
          {
            libelle: "Montant des travaux",
            valeur: `${formatEuros(demande.honoraires.montantTravauxHt)} HT`,
          },
          {
            libelle: "Taux d'honoraires",
            valeur: `${demande.honoraires.pourcentage} %`,
            accent: "fort" as const,
          },
        ]
      : [
          { libelle: "Travaux", valeur: demande.libelleTravaux },
          {
            libelle: "Forfait convenu",
            valeur: `${formatEuros(demande.honoraires.forfaitTtc)} TTC`,
            accent: "fort" as const,
          },
        ];

  return {
    typePrestation: "suivi_travaux",
    titre: "Honoraires de suivi de travaux",
    coproCode: demande.coproCode,
    details,
    lignes: [{ description: `Suivi de travaux : ${demande.libelleTravaux}`, montantHt }],
    montantHt,
    montantTtc: montantHt * 1.2,
    rienAFacturer: montantHt === 0,
    ...(montantHt === 0
      ? { motifRienAFacturer: "Le montant calcule est nul : aucune facture ne sera creee." }
      : {}),
  };
}

export async function creerFactureSuiviTravaux(
  demande: DemandeFactureTravaux,
  managerId: string,
): Promise<ResultatFactureTravaux> {
  await exigerPerimetre(demande.coproCode, managerId);
  const repo = getFacturationRepository();

  const { montantHt } = calculerHonorairesTravaux(demande.honoraires);

  // Montant calcule a 0 (0 % ou forfait a 0) : pas de facture. Le payload
  // Pennylane ne refuse qu'une facture SANS ligne, pas une ligne a 0 EUR : on
  // garde-fou ici, au chemin de creation, comme le depassement CS et le sinistre.
  if (montantHt === 0) {
    return { montantHt: 0, factureId: null };
  }

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
        categorieProduit: CATEGORIE_SUIVI_TRAVAUX,
        quantite: 1,
        prixUnitaireHt: montantHt,
      },
    ],
  });

  return { montantHt, factureId };
}
