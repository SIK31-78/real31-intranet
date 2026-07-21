"use server";

// Server Actions de la facturation des honoraires syndic : creation d'une
// facturation par type de prestation, et emission du lot vers Pennylane.
// Passe par les services (ADR-001), jamais un adapter en direct.
//
// Le cloisonnement par gestionnaire est assure dans les services eux-memes
// (exigerPerimetre) : une copro hors perimetre leve avant toute ecriture.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import type { ApercuFacturation } from "@/lib/services/facturation/apercu";
import {
  apercuDepassementCs,
  creerFactureDepassementCs,
} from "@/lib/services/facturation/creer-facture-depassement-cs";
import {
  apercuSuiviTravaux,
  creerFactureSuiviTravaux,
} from "@/lib/services/facturation/creer-facture-suivi-travaux";
import {
  apercuSuiviSinistre,
  creerFactureSuiviSinistre,
} from "@/lib/services/facturation/creer-facture-suivi-sinistre";
import {
  apercuPrestationForfaitaire,
  creerFactureEtatDate,
  creerFacturePreEtatDate,
  tarifForfaitaireBareme,
} from "@/lib/services/facturation/creer-facture-prestation-forfaitaire";
import { emettreFacturesEnAttente } from "@/lib/services/facturation/emettre-factures-en-attente";
import { getFacturationRepository } from "@/lib/adapters/router";

type Res<T = undefined> = { ok: true; donnees?: T } | { ok: false; erreur: string };

// Validation des entrees : ces Server Actions sont des endpoints POST publics.
const zCode = z.string().trim().min(1).max(40);
const zLibelle = z.string().trim().min(1).max(300);
const zJour = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ");
const zHeure = z.number().int().min(0).max(23);
const zMinute = z.number().int().min(0).max(59);
const zMontant = z.number().min(0).max(10_000_000);

const zCreneau = z.object({
  jourDebut: zJour,
  heureDebut: zHeure,
  minuteDebut: zMinute,
  jourFin: zJour,
  heureFin: zHeure,
  minuteFin: zMinute,
});

function revalider() {
  revalidatePath("/facturation", "layout");
}

/** Enveloppe commune : session, validation deja faite, execution, revalidation. */
async function executer<T>(travail: (managerId: string, initiales: string) => Promise<T>): Promise<Res<T>> {
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  try {
    const donnees = await travail(g.id, g.initiales);
    revalider();
    return { ok: true, donnees };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}

/**
 * Aperçu AVANT facturation : calcule le récapitulatif (durée, ce qui est inclus
 * au contrat, ce qui est en dépassement, montant) SANS rien écrire. Alimente la
 * fenêtre de confirmation. Le même calcul sert ensuite à la création, donc
 * l'aperçu et la facture ne peuvent pas diverger.
 */
export async function apercuFactureCsAction(
  coproCode: string,
  reunion: z.infer<typeof zCreneau>,
): Promise<Res<ApercuFacturation>> {
  const saisie = z
    .object({ coproCode: zCode, reunion: zCreneau })
    .safeParse({ coproCode, reunion });
  if (!saisie.success) return { ok: false, erreur: "Données invalides." };

  return executer((managerId) => apercuDepassementCs({ coproCode, reunion }, managerId));
}

export async function apercuFactureTravauxAction(
  coproCode: string,
  libelleTravaux: string,
  honoraires:
    | { mode: "pourcentage"; montantTravauxHt: number; pourcentage: number }
    | { mode: "forfait"; forfaitTtc: number },
): Promise<Res<ApercuFacturation>> {
  if (!z.object({ coproCode: zCode, libelleTravaux: zLibelle }).safeParse({ coproCode, libelleTravaux }).success)
    return { ok: false, erreur: "Données invalides." };
  return executer((managerId) =>
    apercuSuiviTravaux({ coproCode, libelleTravaux, honoraires }, managerId),
  );
}

export async function apercuFactureSinistreAction(
  coproCode: string,
  libelleSinistre: string,
  diligences: {
    dossierAssureur?: boolean;
    deplacementLieux?: boolean;
    mesuresConservatoires?: boolean;
    assistanceExpertise?: boolean;
  },
  dateSinistre?: string,
): Promise<Res<ApercuFacturation>> {
  if (!z.object({ coproCode: zCode, libelleSinistre: zLibelle }).safeParse({ coproCode, libelleSinistre }).success)
    return { ok: false, erreur: "Données invalides." };
  return executer((managerId) =>
    apercuSuiviSinistre(
      { coproCode, libelleSinistre, diligences, ...(dateSinistre ? { dateSinistre } : {}) },
      managerId,
    ),
  );
}

/**
 * Tarif du barème pour un pré-état daté / état daté : sert à PRÉ-REMPLIR le champ
 * montant, qui reste modifiable (ces prestations se négocient avec le
 * copropriétaire). Aucune écriture.
 */
export async function tarifForfaitaireAction(
  coproCode: string,
  variante: "pre_etat_date" | "etat_date",
): Promise<Res<{ anneeBareme: number; tarifTtc: number }>> {
  if (!z.object({ coproCode: zCode, variante: z.enum(["pre_etat_date", "etat_date"]) }).safeParse({ coproCode, variante }).success)
    return { ok: false, erreur: "Données invalides." };
  return executer((managerId) => tarifForfaitaireBareme(coproCode, managerId, variante));
}

export async function apercuFactureEtatDateAction(
  coproCode: string,
  variante: "pre_etat_date" | "etat_date",
  nomClient?: string,
  dateEtablissement?: string,
  montantTtcNegocie?: number,
): Promise<Res<ApercuFacturation>> {
  if (!z.object({ coproCode: zCode, variante: z.enum(["pre_etat_date", "etat_date"]) }).safeParse({ coproCode, variante }).success)
    return { ok: false, erreur: "Données invalides." };
  return executer((managerId) =>
    apercuPrestationForfaitaire(
      {
        coproCode,
        ...(nomClient ? { nomClient } : {}),
        ...(dateEtablissement ? { dateEtablissement } : {}),
        ...(montantTtcNegocie !== undefined ? { montantTtcNegocie } : {}),
      },
      managerId,
      variante,
    ),
  );
}

/**
 * La franchise (durée de réunion incluse au contrat) n'est PAS un paramètre :
 * elle est lue sur la fiche copropriété côté service. C'est une donnée
 * contractuelle, pas un choix de l'utilisateur.
 */
export async function creerFactureCsAction(
  coproCode: string,
  reunion: z.infer<typeof zCreneau>,
): Promise<
  Res<{
    heuresFacturables: number;
    montantHt: number;
    franchiseHeures: number;
    factureId: string | null;
  }>
> {
  const saisie = z
    .object({ coproCode: zCode, reunion: zCreneau })
    .safeParse({ coproCode, reunion });
  if (!saisie.success) return { ok: false, erreur: "Données invalides." };

  return executer(async (managerId, initiales) => {
    const resultat = await creerFactureDepassementCs(
      { coproCode, reunion, par: initiales },
      managerId,
    );
    // Confirmation = « envoi en facturation » : on enchaine l'emission dans la
    // foulee, l'utilisateur n'a plus de second geste a faire. La file d'attente
    // reste disponible pour rejouer ce qui aurait echoue.
    if (resultat.factureId) await emettreFacturesEnAttente();
    return resultat;
  });
}

export async function creerFactureTravauxAction(
  coproCode: string,
  libelleTravaux: string,
  honoraires:
    | { mode: "pourcentage"; montantTravauxHt: number; pourcentage: number }
    | { mode: "forfait"; forfaitTtc: number },
): Promise<Res<{ montantHt: number; factureId: string }>> {
  const zHonoraires = z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("pourcentage"), montantTravauxHt: zMontant, pourcentage: z.number().min(0).max(100) }),
    z.object({ mode: z.literal("forfait"), forfaitTtc: zMontant }),
  ]);
  const saisie = z
    .object({ coproCode: zCode, libelleTravaux: zLibelle, honoraires: zHonoraires })
    .safeParse({ coproCode, libelleTravaux, honoraires });
  if (!saisie.success) return { ok: false, erreur: "Données invalides." };

  return executer(async (managerId, initiales) => {
    const resultat = await creerFactureSuiviTravaux(
      { coproCode, libelleTravaux, honoraires, par: initiales },
      managerId,
    );
    await emettreFacturesEnAttente();
    return resultat;
  });
}

export async function creerFactureSinistreAction(
  coproCode: string,
  libelleSinistre: string,
  diligences: {
    dossierAssureur?: boolean;
    deplacementLieux?: boolean;
    mesuresConservatoires?: boolean;
    assistanceExpertise?: boolean;
  },
  dateSinistre?: string,
): Promise<Res<{ montantHt: number; factureId: string }>> {
  const zDiligences = z.object({
    dossierAssureur: z.boolean().optional(),
    deplacementLieux: z.boolean().optional(),
    mesuresConservatoires: z.boolean().optional(),
    assistanceExpertise: z.boolean().optional(),
  });
  const saisie = z
    .object({
      coproCode: zCode,
      libelleSinistre: zLibelle,
      diligences: zDiligences,
      dateSinistre: zJour.optional(),
    })
    .safeParse({ coproCode, libelleSinistre, diligences, dateSinistre });
  if (!saisie.success) return { ok: false, erreur: "Données invalides." };

  return executer(async (managerId, initiales) => {
    const resultat = await creerFactureSuiviSinistre(
      {
        coproCode,
        libelleSinistre,
        diligences,
        ...(dateSinistre ? { dateSinistre } : {}),
        par: initiales,
      },
      managerId,
    );
    await emettreFacturesEnAttente();
    return resultat;
  });
}

export async function creerFactureEtatDateAction(
  coproCode: string,
  variante: "pre_etat_date" | "etat_date",
  nomClient?: string,
  dateEtablissement?: string,
  montantTtcNegocie?: number,
): Promise<Res<{ montantHt: number; factureId: string }>> {
  const saisie = z
    .object({
      coproCode: zCode,
      variante: z.enum(["pre_etat_date", "etat_date"]),
      nomClient: z.string().trim().max(200).optional(),
      dateEtablissement: zJour.optional(),
    })
    .safeParse({ coproCode, variante, nomClient, dateEtablissement });
  if (!saisie.success) return { ok: false, erreur: "Données invalides." };

  const demande = {
    coproCode,
    ...(nomClient ? { nomClient } : {}),
    ...(dateEtablissement ? { dateEtablissement } : {}),
    ...(montantTtcNegocie !== undefined ? { montantTtcNegocie } : {}),
  };

  return executer(async (managerId, initiales) => {
    const resultat =
      variante === "pre_etat_date"
        ? await creerFacturePreEtatDate({ ...demande, par: initiales }, managerId)
        : await creerFactureEtatDate({ ...demande, par: initiales }, managerId);
    await emettreFacturesEnAttente();
    return resultat;
  });
}

/**
 * Rejoue une facture en echec : on la repasse en attente puis on relance
 * l'emission. Le garde-fou cote adapter interdit de rejouer une facture deja
 * emise (pas de double facturation).
 */
export async function rejouerFactureAction(
  factureId: string,
): Promise<
  Res<{ emises: number; enErreur: number; erreurs: Array<{ factureId: string; message: string }> }>
> {
  if (!z.string().uuid().safeParse(factureId).success)
    return { ok: false, erreur: "Données invalides." };

  return executer(async () => {
    await getFacturationRepository().remettreEnAttente(factureId);
    return emettreFacturesEnAttente();
  });
}

/**
 * Emet vers Pennylane toutes les factures en attente. Sans PENNYLANE_API_KEY,
 * l'adapter no-op prend le relais : le parcours se deroule sans rien envoyer.
 */
export async function emettreFacturesAction(): Promise<
  Res<{ emises: number; enErreur: number; erreurs: Array<{ factureId: string; message: string }> }>
> {
  return executer(() => emettreFacturesEnAttente());
}
