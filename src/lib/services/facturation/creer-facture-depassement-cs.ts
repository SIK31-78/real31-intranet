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
import { formatEuros, formatHeure, formatHeures, formatJour } from "./format";
import type { ApercuFacturation } from "./apercu";

export interface DemandeDepassementCs {
  /** Code copro (referenceCrypto). */
  coproCode: string;
  /** Creneau reel de la reunion du Conseil Syndical. */
  reunion: Creneau;
  /** Initiales de l'auteur (tant qu'il n'y a pas d'auth). */
  par?: string;
}

export interface ResultatFacturationCs {
  heuresFacturables: number;
  montantHt: number;
  /** Franchise appliquee (lue sur la fiche copro), pour affichage. */
  franchiseHeures: number;
  /** Null si rien n'etait facturable : aucune facture n'est creee. */
  factureId: string | null;
}

/**
 * Calcule le depassement sans persister : parametres copro, bareme, tarif, puis
 * calcul pur. Alimente l'ecran de validation.
 */
export async function apercuDepassementCs(
  demande: DemandeDepassementCs,
  managerId: string,
): Promise<ApercuFacturation> {
  await exigerPerimetre(demande.coproCode, managerId);
  const repo = getFacturationRepository();

  const parametres = await repo.getParametresCopro(demande.coproCode);
  if (!parametres) throw new Error(`Copropriete ${demande.coproCode} introuvable.`);

  const anneeBareme = await resoudreAnneeBareme(repo, demande.coproCode);
  const tarifHoraireTtc = await exigerTarifTtc(repo, "TauxHoraire", anneeBareme);

  const calcul = calculerDepassementCs({
    reunion: demande.reunion,
    franchiseHeures: parametres.franchiseCsHeures,
    tarifHoraireTtc,
  });

  const rienAFacturer = calcul.heuresFacturables === 0;

  return {
    typePrestation: "depassement_cs",
    titre: "Depassement de reunion du Conseil Syndical",
    coproCode: demande.coproCode,
    details: [
      {
        libelle: "Reunion du",
        valeur: `${formatJour(demande.reunion.jourDebut)}, de ${formatHeure(demande.reunion.heureDebut, demande.reunion.minuteDebut)} a ${formatHeure(demande.reunion.heureFin, demande.reunion.minuteFin)}`,
      },
      {
        libelle: "Duree retenue",
        valeur: `${formatHeures(calcul.heuresArrondies)} (arrondie a la demi-heure superieure)`,
      },
      {
        libelle: "Inclus au contrat",
        valeur: formatHeures(parametres.franchiseCsHeures),
        accent: "contrat",
      },
      {
        libelle: "En depassement",
        valeur: formatHeures(calcul.heuresFacturables),
        accent: "fort",
      },
      {
        libelle: `Tarif horaire (bareme ${anneeBareme})`,
        valeur: `${formatEuros(tarifHoraireTtc)} TTC`,
      },
    ],
    lignes: rienAFacturer
      ? []
      : [{ description: `Depassement horaire (${formatHeures(calcul.heuresFacturables)})`, montantHt: calcul.montantHt }],
    montantHt: calcul.montantHt,
    montantTtc: calcul.montantTtc,
    rienAFacturer,
    ...(rienAFacturer
      ? { motifRienAFacturer: "La reunion ne depasse pas la duree incluse au contrat." }
      : {}),
  };
}

export async function creerFactureDepassementCs(
  demande: DemandeDepassementCs,
  managerId: string,
): Promise<ResultatFacturationCs> {
  await exigerPerimetre(demande.coproCode, managerId);
  const repo = getFacturationRepository();

  // La franchise vient de la fiche copropriete (App A), jamais d'une saisie :
  // c'est une donnee contractuelle, pas un choix de l'utilisateur.
  const parametres = await repo.getParametresCopro(demande.coproCode);
  if (!parametres) {
    throw new Error(`Copropriete ${demande.coproCode} introuvable.`);
  }

  // Depassement CS : bareme de l'annee du contrat actif (a la difference du
  // depassement d'AG, qui utilise l'annee de l'exercice approuve, N-1).
  const anneeBareme = await resoudreAnneeBareme(repo, demande.coproCode);
  const tarifHoraireTtc = await exigerTarifTtc(repo, "TauxHoraire", anneeBareme);

  const calcul = calculerDepassementCs({
    reunion: demande.reunion,
    franchiseHeures: parametres.franchiseCsHeures,
    tarifHoraireTtc,
  });

  // Reunion dans la franchise : rien a facturer, pas de facture creee
  // (comportement de l'ecran d'origine).
  if (calcul.heuresFacturables === 0) {
    return {
      heuresFacturables: 0,
      montantHt: 0,
      franchiseHeures: parametres.franchiseCsHeures,
      factureId: null,
    };
  }

  const factureId = await repo.creerFacture({
    coproCode: demande.coproCode,
    typePrestation: "depassement_cs",
    libelle: `Depassement CS du ${demande.reunion.jourDebut}`,
    dateFacture: aujourdhuiISO(),
    datePrestation: demande.reunion.jourDebut,
    details: {
      reunion: demande.reunion,
      franchiseHeures: parametres.franchiseCsHeures,
      anneeBareme,
      tarifHoraireTtc,
      heuresArrondies: calcul.heuresArrondies,
    },
    ...(demande.par ? { par: demande.par } : {}),
    lignes: [
      {
        // Detail horaire complet : c'est CE texte qui apparait sous la ligne sur
        // le PDF Pennylane. Sans les heures de debut ET de fin, la facture est
        // injustifiable aupres du conseil syndical (repris du libelle legacy).
        description:
          `Dépassement CS du ${formatJour(demande.reunion.jourDebut)}, ` +
          `commencé à ${formatHeure(demande.reunion.heureDebut, demande.reunion.minuteDebut)} ` +
          `et terminé à ${formatHeure(demande.reunion.heureFin, demande.reunion.minuteFin)} ` +
          `Durée retenue : ${calcul.heuresArrondies} h. ` +
          `Inclus au contrat : ${parametres.franchiseCsHeures} h. ` +
          `Facturable : ${calcul.heuresFacturables} h.`,
        quantite: calcul.heuresFacturables,
        prixUnitaireHt: htDepuisTtc(tarifHoraireTtc),
      },
    ],
  });

  return {
    heuresFacturables: calcul.heuresFacturables,
    montantHt: calcul.montantHt,
    franchiseHeures: parametres.franchiseCsHeures,
    factureId,
  };
}
