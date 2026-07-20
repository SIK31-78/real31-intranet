// Honoraires de suivi de sinistre. Portage de `SuiviSinistreScreen` (PowerApps).
// Le montant est la somme de 0 a 4 diligences forfaitaires, chacune activee
// independamment (Oui/Non) et tarifee au bareme annuel (TTC -> HT).
//
// Durcissement volontaire vs legacy (cf. MIGRATION_PLAN.md #6) : si aucune
// diligence n'est retenue, on leve une erreur au lieu d'emettre une facture
// vide : le flow d'origine aurait cree une facture Pennylane a 0 ligne.

import { htDepuisTtc } from "./commun";

/** Catalogue des diligences facturables et leur identifiant au bareme. */
export const DILIGENCES_SINISTRE = [
  {
    cle: "dossierAssureur",
    identifiantPrestation: "DossierAssureur",
    libelle: "Suivi du dossier aupres de l'assureur",
  },
  {
    cle: "deplacementLieux",
    identifiantPrestation: "DepLieu",
    libelle: "Deplacement sur les lieux",
  },
  {
    cle: "mesuresConservatoires",
    identifiantPrestation: "MesConser",
    libelle: "Prise de mesures conservatoires",
  },
  {
    cle: "assistanceExpertise",
    identifiantPrestation: "AssExp",
    libelle: "Assistance aux mesures d'expertises",
  },
] as const;

export type CleDiligence = (typeof DILIGENCES_SINISTRE)[number]["cle"];

/** Diligence retenue, avec son tarif TTC resolu en amont (repository). */
export interface DiligenceTarifee {
  cle: CleDiligence;
  tarifTtc: number;
}

export interface LigneHonorairesSinistre {
  libelle: string;
  montantHt: number;
}

export interface HonorairesSinistreResult {
  lignes: LigneHonorairesSinistre[];
  montantHt: number;
}

function libelleDe(cle: CleDiligence): string {
  const diligence = DILIGENCES_SINISTRE.find((d) => d.cle === cle);
  if (!diligence) throw new Error(`Diligence sinistre inconnue : ${cle}`);
  return diligence.libelle;
}

export function calculerHonorairesSinistre(
  retenues: DiligenceTarifee[],
): HonorairesSinistreResult {
  if (retenues.length === 0) {
    throw new Error(
      "Suivi de sinistre : aucune diligence retenue, il n'y a rien a facturer.",
    );
  }

  const lignes = retenues.map(({ cle, tarifTtc }) => {
    if (tarifTtc < 0) {
      throw new Error(`Suivi de sinistre : tarif negatif pour la diligence ${cle}.`);
    }
    return { libelle: libelleDe(cle), montantHt: htDepuisTtc(tarifTtc) };
  });

  return {
    lignes,
    montantHt: lignes.reduce((total, ligne) => total + ligne.montantHt, 0),
  };
}
