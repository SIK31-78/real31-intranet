"use server";

// Server Actions du recap AG : apercu (aucune ecriture) puis enregistrement.
// Passe par les services (ADR-001). Le cloisonnement par gestionnaire est
// assure dans les services (exigerPerimetre).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estComptable } from "@/lib/auth/roles";
import { marquerRecapEffectue } from "@/lib/services/recap-ag/marquer-effectue";
import type { ApercuFacturation } from "@/lib/services/facturation/apercu";
import {
  apercuRecapAg,
  creerRecapAg,
  type DemandeRecapAg,
} from "@/lib/services/facturation/creer-recap-ag";
import { emettreFacturesEnAttente } from "@/lib/services/facturation/emettre-factures-en-attente";

type Res<T = undefined> = { ok: true; donnees?: T } | { ok: false; erreur: string };

const zCode = z.string().trim().min(1).max(40);
const zJour = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ");
const zMontant = z.number().min(0).max(100_000_000);
const zPourcent = z.number().min(0).max(100);

const zCreneau = z.object({
  jourDebut: zJour,
  heureDebut: z.number().int().min(0).max(23),
  minuteDebut: z.number().int().min(0).max(59),
  jourFin: zJour,
  heureFin: z.number().int().min(0).max(23),
  minuteFin: z.number().int().min(0).max(59),
});

const zTravaux = z.array(
  z.object({
    numeroResolution: z.string().trim().max(40).optional(),
    libelle: z.string().trim().min(1).max(300),
    budget: zMontant.optional(),
    cleRepartition: z.string().trim().max(200).optional(),
    modalitesAppelFonds: z.string().trim().max(300).optional(),
  }),
).max(50);

const zDemande = z.object({
  coproCode: zCode,
  assemblee: zCreneau,
  comptesApprouves: z.boolean().optional(),
  reserves: z.string().trim().max(5_000).optional(),
  budgetModifie: z.boolean().optional(),
  montantBudget: zMontant.optional(),
  pourcentageBudget: zPourcent.optional(),
  pptVote: z.boolean().optional(),
  pourcentagePpt: zPourcent.optional(),
  montantPpt: zMontant.optional(),
  fondsTravaux: z.boolean().optional(),
  infoComptable: z.string().trim().max(5_000).optional(),
  travaux: zTravaux.optional(),
  debutContrat: zJour.optional(),
  honorairesGestionTtc: zMontant.optional(),
  fraisPostauxReels: z.boolean().optional(),
  forfaitPostauxTtc: zMontant.optional(),
});

async function executer<T>(
  travail: (managerId: string, initiales: string) => Promise<T>,
): Promise<Res<T>> {
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  try {
    const donnees = await travail(g.id, g.initiales);
    revalidatePath("/recap-ag", "layout");
    revalidatePath("/facturation", "layout");
    return { ok: true, donnees };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}

/** Aperçu du dépassement AG, sans aucune écriture. Alimente la validation. */
export async function apercuRecapAgAction(
  demande: DemandeRecapAg,
): Promise<Res<ApercuFacturation>> {
  if (!zDemande.safeParse(demande).success) return { ok: false, erreur: "Données invalides." };
  return executer((managerId) => apercuRecapAg(demande, managerId));
}

/**
 * Enregistre le récap, ouvre le cycle de contrat, et facture le dépassement
 * s'il y en a un (émission Pennylane enchaînée, comme les autres prestations).
 */
export async function creerRecapAgAction(
  demande: DemandeRecapAg,
): Promise<Res<{ recapId: string; depassementHeures: number; factureId: string | null }>> {
  if (!zDemande.safeParse(demande).success) return { ok: false, erreur: "Données invalides." };

  return executer(async (managerId, initiales) => {
    const resultat = await creerRecapAg({ ...demande, par: initiales }, managerId);
    if (resultat.factureId) await emettreFacturesEnAttente([resultat.factureId]);
    return {
      recapId: resultat.recapId,
      depassementHeures: resultat.depassementHeures,
      factureId: resultat.factureId,
    };
  });
}

/**
 * Marque le récap « effectué » (ou le remet à faire).
 *
 * PAS de garde de rôle ici, contrairement à `marquerRecapTraiteAction` : c'est la boucle
 * du gestionnaire sur son propre suivi, pas un geste du pôle comptable. Le cloisonnement
 * se fait sur le PÉRIMÈTRE, revalidé côté serveur dans le service - l'UI n'est jamais le mur.
 */
export async function marquerRecapEffectueAction(
  recapId: string,
  effectue: boolean,
): Promise<Res> {
  const saisie = z
    .object({ recapId: z.string().trim().min(1).max(120), effectue: z.boolean() })
    .safeParse({ recapId, effectue });
  if (!saisie.success) return { ok: false, erreur: "Données invalides." };

  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };

  try {
    await marquerRecapEffectue(recapId, effectue, g.initiales, {
      managerId: g.id,
      email: g.email,
      estComptable: estComptable(g.email, g.role),
    });
    revalidatePath("/recap-ag", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}
