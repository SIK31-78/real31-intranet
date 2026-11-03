"use server";

// Server Action du bouton "Signaler un bug / une idée" (present partout via AppShell).
// L'AUTEUR est deduit de la SESSION serveur (getGestionnaireCourant) - jamais du client :
// la saisie ne porte que type / description / severite / page. Validation zod.

import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { creerFeedback } from "@/lib/services/feedback/creer-feedback";
import { joindreCaptures, type CaptureRecue } from "@/lib/services/feedback/joindre-captures";
import { erreurCaptures } from "@/lib/domain/feedback-captures";
import {
  APPLICATIONS_FEEDBACK,
  FeedbackNonConfigureError,
  SEVERITES_FEEDBACK,
  TYPES_FEEDBACK,
  encoderPageFeedback,
  type ApplicationFeedback,
  type SeveriteFeedback,
  type TypeFeedback,
} from "@/lib/domain/feedback";

import { messageUtilisateur } from "@/lib/actions/resultat";
const zSaisie = z.object({
  type: z.enum(TYPES_FEEDBACK as unknown as [TypeFeedback, ...TypeFeedback[]]),
  description: z.string().trim().min(1).max(2000),
  severite: z.enum(SEVERITES_FEEDBACK as unknown as [SeveriteFeedback, ...SeveriteFeedback[]]),
  /** Application concernee (les collegues remontent aussi les bugs d'eStale, du
   *  Registre Contrats Copro...). Defaut real31 : les anciens clients n'envoient rien. */
  application: z
    .enum(APPLICATIONS_FEEDBACK as unknown as [ApplicationFeedback, ...ApplicationFeedback[]])
    .default("real31"),
  /** real31 : pathname capture cote client. Autre application : lien colle par le
   *  collaborateur (facultatif). Borne dans les deux cas. */
  page: z.string().trim().max(280).optional(),
});

/**
 * `captures` (REA-255) : FormData facultatif, champ « capture » repete (images collees ou
 * choisies dans la modale). Controle cote serveur, jamais seulement cote client.
 */
export async function envoyerFeedback(input: unknown, captures?: FormData): Promise<{ ok: boolean; message?: string }> {
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Session expirée : reconnecte-toi et réessaie." };

  const parse = zSaisie.safeParse(input);
  if (!parse.success) return { ok: false, message: "Ajoute une description avant d'envoyer." };
  const { type, description, severite, application, page } = parse.data;
  // L'application voyage DANS le champ page ("app:lien"), retro-compatible (cf. domaine).
  const pageEncodee = encoderPageFeedback(application, page);

  const fichiers = (captures?.getAll("capture") ?? []).filter((f): f is File => f instanceof File);
  const refus = erreurCaptures(fichiers.map((f) => ({ contentType: f.type, taille: f.size })));
  if (refus) return { ok: false, message: refus };

  try {
    const f = await creerFeedback(
      { type, description, severite, ...(pageEncodee ? { page: pageEncodee } : {}) },
      { ...(g.email ? { email: g.email } : {}), initiales: g.initiales },
    );
    if (fichiers.length > 0) {
      const recues: CaptureRecue[] = await Promise.all(
        fichiers.map(async (x) => ({ contentType: x.type, contenu: new Uint8Array(await x.arrayBuffer()) })),
      );
      const deposees = await joindreCaptures(f.id, recues).catch(() => 0);
      if (deposees < fichiers.length) {
        return { ok: true, message: "Remontée envoyée, mais une capture n'a pas pu être jointe." };
      }
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof FeedbackNonConfigureError) {
      return { ok: false, message: "Le module de remontées n'est pas encore activé côté base. Préviens Sekou." };
    }
    return { ok: false, message: messageUtilisateur(e, "feedback") };
  }
}
