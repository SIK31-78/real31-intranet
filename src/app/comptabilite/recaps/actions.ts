"use server";

// Server Action de la file des recaps d'AG recus : fermer (ou rouvrir) la boucle sur un
// recap. Passe par le service (ADR-001), qui revalide le perimetre cote serveur.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estComptable, peutVoirComptabilite } from "@/lib/auth/roles";
import { marquerRecapTraite } from "@/lib/services/compta/recaps-recus";

type Res = { ok: true } | { ok: false; erreur: string };

const zId = z.string().trim().min(1).max(120);

/**
 * Marque le recap traite (ou le remet a traiter).
 *
 * Deux gardes, pas une : le ROLE ici (fermer la boucle est un geste du pole comptable ;
 * un gestionnaire consulte son recap mais ne le classe pas), et le PERIMETRE dans le
 * service (agences tenues / portefeuille). L'UI cache le bouton, le serveur refuse -
 * les tables intranet_* ont la RLS off, il n'y a pas de second mur.
 */
export async function marquerRecapTraiteAction(recapId: string, traite: boolean): Promise<Res> {
  if (!z.object({ recapId: zId, traite: z.boolean() }).safeParse({ recapId, traite }).success) {
    return { ok: false, erreur: "Données invalides." };
  }
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  if (!peutVoirComptabilite(g.email, g.role)) {
    return { ok: false, erreur: "Action réservée au pôle comptable." };
  }

  try {
    await marquerRecapTraite(recapId, traite, g.initiales, {
      managerId: g.id,
      email: g.email,
      estComptable: estComptable(g.email, g.role),
    });
    revalidatePath("/comptabilite", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}
