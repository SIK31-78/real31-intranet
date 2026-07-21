// Services : prestations a tarif forfaitaire annuel (pre-etat date, etat date).
// Passent par le routeur, jamais un adapter en direct (ADR-001).
//
// Les deux prestations partagent exactement la meme mecanique : un tarif unique
// lu au bareme de l'annee du contrat actif, converti TTC -> HT. Seuls changent
// l'identifiant de prestation et le libelle, d'ou la factorisation.
//
// MONTANT NEGOCIABLE (demande Sekou, 2026-07-20) : contrairement aux autres
// prestations, le pre-etat date et l'etat date se NEGOCIENT avec le
// coproprietaire. Le tarif du bareme sert donc de valeur par defaut, mais reste
// modifiable. Le montant du bareme est conserve a cote du montant retenu dans
// `details` : une negociation doit rester visible, jamais silencieuse.
// (Cote PowerApps c'etait editable aussi, mais sans aucune trace du tarif de
// reference, et les deux ecrans ne validaient meme pas la saisie de la meme
// facon : l'un bloquait sur un montant vide, l'autre non.)

import { htDepuisTtc } from "@/lib/domain/facturation/commun";
import type { TypePrestation } from "@/lib/ports/facturation-repository";
import { getFacturationRepository } from "@/lib/adapters/router";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";
import { aujourdhuiISO, exigerTarifTtc, resoudreAnneeBareme } from "./bareme";
import { formatEuros, formatJour } from "./format";
import type { ApercuFacturation } from "./apercu";

export interface DemandeFactureForfaitaire {
  /** Code copro (referenceCrypto). */
  coproCode: string;
  /** Nom du client destinataire (notaire, acquereur...). */
  nomClient?: string;
  /** Date d'etablissement du document, ISO "YYYY-MM-DD". */
  dateEtablissement?: string;
  /**
   * Montant TTC retenu, s'il a ete negocie. Absent = tarif du bareme applique.
   * Le tarif de reference reste trace dans `details`.
   */
  montantTtcNegocie?: number;
  /** Initiales de l'auteur (tant qu'il n'y a pas d'auth). */
  par?: string;
}

export interface ResultatFactureForfaitaire {
  montantHt: number;
  factureId: string;
}

const PRESTATIONS = {
  pre_etat_date: { identifiantPrestation: "PreEtatDate", libelle: "Honoraires pre-etat date" },
  etat_date: { identifiantPrestation: "EtatDate", libelle: "Honoraires etat date (questionnaire notaire)" },
} as const;

/** Apercu commun aux deux prestations a tarif forfaitaire annuel. */
export async function apercuPrestationForfaitaire(
  demande: DemandeFactureForfaitaire,
  managerId: string,
  variante: "pre_etat_date" | "etat_date",
): Promise<ApercuFacturation> {
  await exigerPerimetre(demande.coproCode, managerId);
  const repo = getFacturationRepository();
  const prestation = PRESTATIONS[variante];

  const anneeBareme = await resoudreAnneeBareme(repo, demande.coproCode);
  const tarifBaremeTtc = await exigerTarifTtc(repo, prestation.identifiantPrestation, anneeBareme);
  const montantTtc = demande.montantTtcNegocie ?? tarifBaremeTtc;
  const negocie = montantTtc !== tarifBaremeTtc;

  return {
    typePrestation: variante,
    titre: prestation.libelle,
    coproCode: demande.coproCode,
    details: [
      ...(demande.nomClient ? [{ libelle: "Client", valeur: demande.nomClient }] : []),
      ...(demande.dateEtablissement
        ? [{ libelle: "Etabli le", valeur: formatJour(demande.dateEtablissement) }]
        : []),
      {
        libelle: `Tarif du bareme ${anneeBareme}`,
        valeur: `${formatEuros(tarifBaremeTtc)} TTC`,
        ...(negocie ? {} : { accent: "fort" as const }),
      },
      // Une negociation doit sauter aux yeux sur l'ecran de validation.
      ...(negocie
        ? [
            {
              libelle: "Montant negocie",
              valeur: `${formatEuros(montantTtc)} TTC`,
              accent: "fort" as const,
            },
          ]
        : []),
    ],
    lignes: [{ description: prestation.libelle, montantHt: htDepuisTtc(montantTtc) }],
    montantHt: htDepuisTtc(montantTtc),
    montantTtc,
    rienAFacturer: montantTtc === 0,
    ...(montantTtc === 0
      ? { motifRienAFacturer: "Le montant retenu est nul : aucune facture ne sera creee." }
      : {}),
  };
}

/** Tarif du bareme pour cette prestation : sert a pre-remplir le champ montant. */
export async function tarifForfaitaireBareme(
  coproCode: string,
  managerId: string,
  variante: "pre_etat_date" | "etat_date",
): Promise<{ anneeBareme: number; tarifTtc: number }> {
  await exigerPerimetre(coproCode, managerId);
  const repo = getFacturationRepository();
  const anneeBareme = await resoudreAnneeBareme(repo, coproCode);
  const tarifTtc = await exigerTarifTtc(repo, PRESTATIONS[variante].identifiantPrestation, anneeBareme);
  return { anneeBareme, tarifTtc };
}

async function creerFactureForfaitaire(
  demande: DemandeFactureForfaitaire,
  managerId: string,
  prestation: { type: TypePrestation; identifiantPrestation: string; libelle: string },
): Promise<ResultatFactureForfaitaire> {
  await exigerPerimetre(demande.coproCode, managerId);
  const repo = getFacturationRepository();

  const anneeBareme = await resoudreAnneeBareme(repo, demande.coproCode);
  const tarifBaremeTtc = await exigerTarifTtc(repo, prestation.identifiantPrestation, anneeBareme);
  const montantTtc = demande.montantTtcNegocie ?? tarifBaremeTtc;
  const montantHt = htDepuisTtc(montantTtc);

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
      // Les DEUX montants sont conserves : une negociation reste auditable.
      tarifBaremeTtc,
      montantTtcApplique: montantTtc,
      negocie: montantTtc !== tarifBaremeTtc,
      ...(demande.nomClient ? { nomClient: demande.nomClient } : {}),
    },
    ...(demande.par ? { par: demande.par } : {}),
    lignes: [
      {
        // Volontairement SANS mention de negociation (decision Sekou,
        // 2026-07-21) : une remise ne se justifie pas aupres du client sur le
        // document lui-meme. La trace reste interne, dans `details` ci-dessus
        // et sur l'ecran de validation.
        description: libelle,
        quantite: 1,
        prixUnitaireHt: montantHt,
      },
    ],
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
