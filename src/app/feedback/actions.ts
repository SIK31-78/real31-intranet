"use server";

// Server Action du bouton "Signaler un bug / une idée" (present partout via AppShell).
// L'AUTEUR est deduit de la SESSION serveur (getGestionnaireCourant) - jamais du client :
// la saisie ne porte que type / description / severite / page. Validation zod.

import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { creerFeedback } from "@/lib/services/feedback/creer-feedback";
import {
  FeedbackNonConfigureError,
  SEVERITES_FEEDBACK,
  TYPES_FEEDBACK,
  type SeveriteFeedback,
  type TypeFeedback,
} from "@/lib/domain/feedback";

const zSaisie = z.object({
  type: z.enum(TYPES_FEEDBACK as unknown as [TypeFeedback, ...TypeFeedback[]]),
  description: z.string().trim().min(1).max(2000),
  severite: z.enum(SEVERITES_FEEDBACK as unknown as [SeveriteFeedback, ...SeveriteFeedback[]]),
  /** Pathname capture cote client. Borne, jamais une URL absolue. */
  page: z.string().trim().max(300).optional(),
});

export async function envoyerFeedback(input: unknown): Promise<{ ok: boolean; message?: string }> {
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Session expirée — reconnecte-toi et réessaie." };

  const parse = zSaisie.safeParse(input);
  if (!parse.success) return { ok: false, message: "Ajoute une description avant d'envoyer." };
  const { type, description, severite, page } = parse.data;

  try {
    await creerFeedback(
      { type, description, severite, ...(page ? { page } : {}) },
      { ...(g.email ? { email: g.email } : {}), initiales: g.initiales },
    );
    return { ok: true };
  } catch (e) {
    if (e instanceof FeedbackNonConfigureError) {
      return { ok: false, message: "Le module de remontées n'est pas encore activé côté base — préviens Sekou." };
    }
    return { ok: false, message: e instanceof Error ? e.message : "Envoi impossible." };
  }
}
