// Service : facture les honoraires de suivi de sinistre.
// Passe par le routeur, jamais un adapter en direct (ADR-001).
//
// Le montant est la somme des diligences retenues, chacune tarifee au bareme de
// l'annee du contrat actif. Une facture multi-lignes est produite (1 a 4 lignes),
// alignee sur les invoice_lines Pennylane.

import {
  calculerHonorairesSinistre,
  DILIGENCES_SINISTRE,
  type CleDiligence,
  type DiligenceTarifee,
} from "@/lib/domain/facturation/honoraires-sinistre";
import { getFacturationRepository } from "@/lib/adapters/router";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";
import { aujourdhuiISO, exigerTarifTtc, resoudreAnneeBareme } from "./bareme";

export interface DemandeFactureSinistre {
  /** Code copro (referenceCrypto). */
  coproCode: string;
  /** Libelle du sinistre (apparait sur la facture). */
  libelleSinistre: string;
  /** Diligences retenues (Oui/Non par diligence cote formulaire). */
  diligences: Partial<Record<CleDiligence, boolean>>;
  /** ISO "YYYY-MM-DD". */
  dateSinistre?: string;
  /** Initiales de l'auteur (tant qu'il n'y a pas d'auth). */
  par?: string;
}

export interface ResultatFactureSinistre {
  montantHt: number;
  factureId: string;
}

export async function creerFactureSuiviSinistre(
  demande: DemandeFactureSinistre,
  managerId: string,
): Promise<ResultatFactureSinistre> {
  await exigerPerimetre(demande.coproCode, managerId);
  const repo = getFacturationRepository();

  const anneeBareme = await resoudreAnneeBareme(repo, demande.coproCode);

  // On ne resout le tarif que des diligences effectivement retenues.
  const cellesRetenues = DILIGENCES_SINISTRE.filter((d) => demande.diligences[d.cle] === true);
  const retenues: DiligenceTarifee[] = await Promise.all(
    cellesRetenues.map(async (d) => ({
      cle: d.cle,
      tarifTtc: await exigerTarifTtc(repo, d.identifiantPrestation, anneeBareme),
    })),
  );

  // Leve si aucune diligence n'est retenue (pas de facture vide, cf. domaine).
  const calcul = calculerHonorairesSinistre(retenues);

  const factureId = await repo.creerFacture({
    coproCode: demande.coproCode,
    typePrestation: "suivi_sinistre",
    libelle: `Suivi de sinistre - ${demande.libelleSinistre}`,
    dateFacture: aujourdhuiISO(),
    ...(demande.dateSinistre ? { datePrestation: demande.dateSinistre } : {}),
    details: {
      libelleSinistre: demande.libelleSinistre,
      anneeBareme,
      diligences: retenues,
      ...(demande.dateSinistre ? { dateSinistre: demande.dateSinistre } : {}),
    },
    ...(demande.par ? { par: demande.par } : {}),
    lignes: calcul.lignes.map((ligne) => ({
      description: ligne.libelle,
      quantite: 1,
      prixUnitaireHt: ligne.montantHt,
    })),
  });

  return { montantHt: calcul.montantHt, factureId };
}
