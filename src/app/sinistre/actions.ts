"use server";

import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { coproAppartient } from "@/lib/services/coproprietes/copro-appartient";
import { getCoproRepository, getDossierRepository } from "@/lib/adapters/router";

// Contexte immeuble/copro + signataire pre-rempli depuis un dossier de type sinistre.
// Sert a tuer la double-saisie : ouvrir le wizard avec ?dossier=<id> importe l'identite
// immeuble (nom, adresse), la copro et le gestionnaire courant.
export interface ContexteDossierSinistre {
  /** Code referentiel de la copro (public.Copropriete), sert de coproprieteId au store. */
  coproCode: string;
  coproNom: string;
  /** Adresse immeuble sur une ligne (ligne1, code postal ville). */
  immeubleAdresse: string;
  /** Agence derivee de la copro (D2), si connue. */
  agenceId?: string;
  gestionnaire: { nom: string; email: string; initiales: string };
}

const zId = z.string().trim().min(1).max(120);

/** Adresse copro -> une ligne lisible pour le champ immeuble du wizard. */
function adresseUneLigne(adresse: {
  ligne1: string;
  ligne2?: string;
  codePostal: string;
  ville: string;
}): string {
  const rue = [adresse.ligne1, adresse.ligne2].filter(Boolean).join(", ");
  const ville = [adresse.codePostal, adresse.ville].filter(Boolean).join(" ");
  return [rue, ville].filter(Boolean).join(" - ");
}

// Charge le contexte d'un dossier sinistre pour pre-remplir le wizard. Retourne null
// (jamais d'erreur cote client) si : pas de gestionnaire, dossier absent / pas un
// sinistre, ou copro hors perimetre. ANTI-IDOR : le coproCode vient du dossier serveur,
// jamais d'un parametre client.
export async function chargerContexteDossierAction(
  dossierId: string,
): Promise<ContexteDossierSinistre | null> {
  if (!zId.safeParse(dossierId).success) return null;

  const g = await getGestionnaireCourant();
  if (!g) return null;

  const dossier = await getDossierRepository().get(dossierId);
  if (!dossier || dossier.type !== "sinistre") return null;

  // Cloisonnement : la copro du dossier doit appartenir au gestionnaire (mode supabase).
  // En mock, on ne verrouille pas (pas de vraie data) - meme regle que autorise() cote Dossiers.
  if (
    process.env.COPRO_SOURCE === "supabase" &&
    !(await coproAppartient(dossier.coproCode, g.id))
  ) {
    return null;
  }

  const copro = await getCoproRepository().findByCode(dossier.coproCode, g.id);
  if (!copro) return null;

  return {
    coproCode: copro.code,
    coproNom: copro.nom,
    immeubleAdresse: adresseUneLigne(copro.adresse),
    ...(copro.agenceId ? { agenceId: copro.agenceId } : {}),
    gestionnaire: {
      nom: g.nomComplet,
      email: g.email ?? "",
      initiales: g.initiales,
    },
  };
}
