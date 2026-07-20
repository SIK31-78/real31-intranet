// Services : prestations a tarif forfaitaire annuel (pre-etat date, etat date).
// Passent par le routeur, jamais un adapter en direct (ADR-001).
//
// Les deux prestations partagent exactement la meme mecanique : un tarif unique
// lu au bareme de l'annee du contrat actif, converti TTC -> HT. Seuls changent
// l'identifiant de prestation et le libelle — d'ou la factorisation.
//
// Durcissement vs legacy : le montant est toujours recalcule depuis le bareme.
// Cote PowerApps il etait pre-rempli mais modifiable a la main, et les deux
// ecrans ne validaient meme pas la saisie de la meme facon (l'un bloquait sur un
// montant vide, l'autre non). Cf. MIGRATION_PLAN.md §2.1.

import { htDepuisTtc } from "@/lib/domain/facturation/commun";
import type { TypePrestation } from "@/lib/ports/facturation-repository";
import { getFacturationRepository } from "@/lib/adapters/router";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";
import { aujourdhuiISO, exigerTarifTtc, resoudreAnneeBareme } from "./bareme";

export interface DemandeFactureForfaitaire {
  /** Code copro (referenceCrypto). */
  coproCode: string;
  /** Nom du client destinataire (notaire, acquereur...). */
  nomClient?: string;
  /** Date d'etablissement du document, ISO "YYYY-MM-DD". */
  dateEtablissement?: string;
  /** Initiales de l'auteur (tant qu'il n'y a pas d'auth). */
  par?: string;
}

export interface ResultatFactureForfaitaire {
  montantHt: number;
  factureId: string;
}

async function creerFactureForfaitaire(
  demande: DemandeFactureForfaitaire,
  managerId: string,
  prestation: { type: TypePrestation; identifiantPrestation: string; libelle: string },
): Promise<ResultatFactureForfaitaire> {
  await exigerPerimetre(demande.coproCode, managerId);
  const repo = getFacturationRepository();

  const anneeBareme = await resoudreAnneeBareme(repo, demande.coproCode);
  const tarifTtc = await exigerTarifTtc(repo, prestation.identifiantPrestation, anneeBareme);
  const montantHt = htDepuisTtc(tarifTtc);

  const libelle = demande.nomClient
    ? `${prestation.libelle} - ${demande.nomClient}`
    : prestation.libelle;

  const factureId = await repo.creerFacture({
    coproCode: demande.coproCode,
    typePrestation: prestation.type,
    libelle,
    dateFacture: aujourdhuiISO(),
    ...(demande.dateEtablissement ? { datePrestation: demande.dateEtablissement } : {}),
    details: {
      anneeBareme,
      identifiantPrestation: prestation.identifiantPrestation,
      tarifTtc,
      ...(demande.nomClient ? { nomClient: demande.nomClient } : {}),
    },
    ...(demande.par ? { par: demande.par } : {}),
    lignes: [{ description: libelle, quantite: 1, prixUnitaireHt: montantHt }],
  });

  return { montantHt, factureId };
}

/** Honoraires de pre-etat date. */
export function creerFacturePreEtatDate(
  demande: DemandeFactureForfaitaire,
  managerId: string,
): Promise<ResultatFactureForfaitaire> {
  return creerFactureForfaitaire(demande, managerId, {
    type: "pre_etat_date",
    identifiantPrestation: "PreEtatDate",
    libelle: "Honoraires pre-etat date",
  });
}

/** Honoraires d'etat date (questionnaire notaire). */
export function creerFactureEtatDate(
  demande: DemandeFactureForfaitaire,
  managerId: string,
): Promise<ResultatFactureForfaitaire> {
  return creerFactureForfaitaire(demande, managerId, {
    type: "etat_date",
    identifiantPrestation: "EtatDate",
    libelle: "Honoraires etat date (questionnaire notaire)",
  });
}
