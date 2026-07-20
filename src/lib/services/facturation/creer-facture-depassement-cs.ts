// Service : facture le depassement d'honoraires du Conseil Syndical.
// Passe par le routeur, jamais un adapter en direct (ADR-001).
//
// Enchainement (repris de DepassementCSScreen PowerApps) :
//   contrat de gestion le plus recent -> son annee donne le bareme applicable
//   -> tarif horaire TTC -> calcul pur (domaine) -> facture + ligne.
//
// Le montant est TOUJOURS recalcule ici a partir du bareme : on ne fait jamais
// confiance a un montant fourni par le client (le flow legacy FacturationSyndic
// reprenait le montant calcule cote PowerApps sans controle).

import { calculerDepassementCs } from "@/lib/domain/facturation/depassement-cs";
import { htDepuisTtc, type Creneau } from "@/lib/domain/facturation/commun";
import { getFacturationRepository } from "@/lib/adapters/router";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";
import { aujourdhuiISO, exigerTarifTtc, resoudreAnneeBareme } from "./bareme";

export interface DemandeDepassementCs {
  /** Code copro (referenceCrypto). */
  coproCode: string;
  /** Creneau reel de la reunion du Conseil Syndical. */
  reunion: Creneau;
  /** Copropriete « Duree reunion CS » : heures de reunion incluses au contrat. */
  franchiseHeures: number;
  /** Initiales de l'auteur (tant qu'il n'y a pas d'auth). */
  par?: string;
}

export interface ResultatFacturationCs {
  heuresFacturables: number;
  montantHt: number;
  /** Null si rien n'etait facturable : aucune facture n'est creee. */
  factureId: string | null;
}

export async function creerFactureDepassementCs(
  demande: DemandeDepassementCs,
  managerId: string,
): Promise<ResultatFacturationCs> {
  await exigerPerimetre(demande.coproCode, managerId);
  const repo = getFacturationRepository();

  // Depassement CS : bareme de l'annee du contrat actif (a la difference du
  // depassement d'AG, qui utilise l'annee de l'exercice approuve, N-1).
  const anneeBareme = await resoudreAnneeBareme(repo, demande.coproCode);
  const tarifHoraireTtc = await exigerTarifTtc(repo, "TauxHoraire", anneeBareme);

  const calcul = calculerDepassementCs({
    reunion: demande.reunion,
    franchiseHeures: demande.franchiseHeures,
    tarifHoraireTtc,
  });

  // Reunion dans la franchise : rien a facturer, pas de facture creee
  // (comportement de l'ecran d'origine).
  if (calcul.heuresFacturables === 0) {
    return { heuresFacturables: 0, montantHt: 0, factureId: null };
  }

  const factureId = await repo.creerFacture({
    coproCode: demande.coproCode,
    typePrestation: "depassement_cs",
    libelle: `Depassement CS du ${demande.reunion.jourDebut}`,
    dateFacture: aujourdhuiISO(),
    datePrestation: demande.reunion.jourDebut,
    details: {
      reunion: demande.reunion,
      franchiseHeures: demande.franchiseHeures,
      anneeBareme,
      tarifHoraireTtc,
      heuresArrondies: calcul.heuresArrondies,
    },
    ...(demande.par ? { par: demande.par } : {}),
    lignes: [
      {
        description: `Depassement horaire Conseil Syndical (${calcul.heuresFacturables} h)`,
        quantite: calcul.heuresFacturables,
        prixUnitaireHt: htDepuisTtc(tarifHoraireTtc),
      },
    ],
  });

  return {
    heuresFacturables: calcul.heuresFacturables,
    montantHt: calcul.montantHt,
    factureId,
  };
}
