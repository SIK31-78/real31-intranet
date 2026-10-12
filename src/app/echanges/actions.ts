"use server";

// Server Actions de l'écran « Échanges » : ouvrir un mail trouvé et ses pièces jointes.
// LECTURE SEULE. La boîte demandée est revérifiée contre les droits de l'utilisateur à
// chaque appel (service : garder).

import { z } from "zod";
import { actionGestionnaire, Refus } from "@/lib/actions/garde";
import type { Res } from "@/lib/actions/resultat";
import { estSuperAdmin } from "@/lib/auth/session";
import type { PieceJointeRef } from "@/lib/domain/mes-emails";
import {
  AccesRefuse,
  lireEchange,
  lirePieceJointeEchange,
  listerPiecesJointesEchange,
  utilisateurEchanges,
} from "@/lib/services/echanges/rechercher";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";

const zBoite = z.string().email().max(320);
const zId = z.string().min(1).max(400);

async function utilisateur(g: Gestionnaire) {
  const u = await utilisateurEchanges(g, estSuperAdmin(g.email));
  if (!u) throw new Refus("Adresse de connexion inconnue.");
  return u;
}

async function garde<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    if (e instanceof AccesRefuse) throw new Refus(e.message);
    throw e;
  }
}

export async function lireEchangeAction(input: unknown): Promise<Res<string>> {
  return actionGestionnaire(z.object({ boite: zBoite, id: zId }), input, "echanges-lire", async (d, g) =>
    garde(async () => lireEchange(await utilisateur(g), d.boite, d.id)),
  );
}

export async function listerPiecesJointesEchangeAction(input: unknown): Promise<Res<PieceJointeRef[]>> {
  return actionGestionnaire(z.object({ boite: zBoite, internetMessageId: zId }), input, "echanges-pj-lister", async (d, g) =>
    garde(async () => listerPiecesJointesEchange(await utilisateur(g), d.boite, d.internetMessageId)),
  );
}

export async function lirePieceJointeEchangeAction(input: unknown): Promise<Res<{ nom: string; type: string; base64: string }>> {
  return actionGestionnaire(
    z.object({ boite: zBoite, internetMessageId: zId, attachmentId: z.string().min(1).max(400) }),
    input,
    "echanges-pj-lire",
    async (d, g) => garde(async () => lirePieceJointeEchange(await utilisateur(g), d.boite, d.internetMessageId, d.attachmentId)),
  );
}
