"use server";

// « Reformuler » (ADR-051, 28/10/2026) : réponse, mail neuf et transfert de l'écran E-mails.
// Endpoint POST public comme toute action serveur : entrée validée, identité tirée de la
// session, module mail ouvert à la personne. Autorisée en incarnation (« Changer de
// gestionnaire ») : elle ne lit aucune boîte et n'envoie rien, le texte est celui que la
// personne connectée vient de taper ; la ligne du journal le note.

import { z } from "zod";
import { echec, type Res } from "@/lib/actions/resultat";
import { getGestionnaireCourant, incarnationEnCours, mailModuleActifPour } from "@/lib/auth/session";
import { LONGUEUR_MAX } from "@/lib/domain/reformulation";
import { reformulerMail } from "@/lib/services/ia/reformuler-mail";

const zDemande = z.object({
  // Borne large : la vraie limite (avec son message) est dans verifierTexte.
  texte: z.string().max(LONGUEUR_MAX * 2),
  nature: z.enum(["reponse", "nouveau", "transfert"]),
  objet: z.string().max(1000).optional(),
});

export async function reformulerAction(entree: z.input<typeof zDemande>): Promise<Res<{ texte: string; inchange: boolean }>> {
  const p = zDemande.safeParse(entree);
  if (!p.success) return echec("Le texte est trop long pour être reformulé d'un coup.");
  const g = await getGestionnaireCourant();
  if (!g) return echec("Non connecté.");
  if (!mailModuleActifPour(g.email)) return echec("La messagerie n'est pas ouverte pour vous.");
  const r = await reformulerMail({ id: g.id, initiales: g.initiales, incarnation: await incarnationEnCours() }, p.data);
  return r.ok ? { ok: true, donnees: { texte: r.texte, inchange: r.inchange } } : echec(r.message);
}
