"use server";

// Server Actions de l'écran « Échanges » : ouvrir un mail trouvé et ses pièces jointes.
// LECTURE SEULE. La boîte demandée est revérifiée contre les droits de l'utilisateur à
// chaque appel (service : garder).

import { z } from "zod";
import { actionGestionnaire, Refus } from "@/lib/actions/garde";
import type { Res } from "@/lib/actions/resultat";
import { estSuperAdmin, incarnationEnCours } from "@/lib/auth/session";
import type { PieceJointeRef } from "@/lib/domain/mes-emails";
import {
  AccesRefuse,
  boitesDe,
  dossiersPourRattacher,
  lireEchange,
  rattacherEchange,
  lirePieceJointeEchange,
  listerPiecesJointesEchange,
  rechercherEchanges,
  utilisateurEchanges,
  type ResultatRecherche,
} from "@/lib/services/echanges/rechercher";
import { critereDepuisRecherche } from "@/lib/domain/echanges";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import type { Dossier } from "@/lib/domain/dossier";
import { revalidatePath } from "next/cache";

const zBoite = z.string().email().max(320);
const zId = z.string().min(1).max(400);

async function utilisateur(g: Gestionnaire) {
  const u = await utilisateurEchanges(g, estSuperAdmin(g.email), await incarnationEnCours());
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

/**
 * Recherche dans TOUS les échanges (reçus et envoyés) des boîtes que l'on a le droit de lire,
 * depuis la barre unique de « E-mails » : saisie libre -> code copro / adresse / mots.
 */
export async function rechercherEchangesAction(
  input: unknown,
): Promise<Res<ResultatRecherche & { plusieursBoites: boolean; copro: string | null; boitesLues: number }>> {
  return actionGestionnaire(z.object({ saisie: z.string().trim().min(2).max(200) }), input, "echanges-rechercher", async (d, g) =>
    garde(async () => {
      const u = await utilisateur(g);
      const cibles = boitesDe(u).map((b) => b.adresse);
      if (cibles.length === 0) throw new Refus("Aucune boîte à fouiller n'est configurée pour vous.");
      const critere = critereDepuisRecherche(d.saisie);
      const r = await rechercherEchanges(u, critere, cibles);
      return { ...r, plusieursBoites: cibles.length > 1, copro: critere.copro ?? null, boitesLues: cibles.length };
    }),
  );
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

const zCopro = z.string().regex(/^(SE|S)\d{3,4}$/i);

export async function dossiersPourRattacherAction(
  input: unknown,
): Promise<Res<Pick<Dossier, "id" | "titre" | "type" | "statut" | "coproCode">[]>> {
  return actionGestionnaire(z.object({ copro: zCopro }), input, "echanges-dossiers", async (d, g) => {
    await utilisateur(g);
    return dossiersPourRattacher(g.id, d.copro.toUpperCase());
  });
}

export async function rattacherEchangeAction(input: unknown): Promise<Res> {
  return actionGestionnaire(
    z.object({ dossierId: z.string().min(1).max(80), boite: zBoite, internetMessageId: zId }),
    input,
    "echanges-rattacher",
    async (d, g) =>
      garde(async () => {
        const ok = await rattacherEchange(await utilisateur(g), g, d.dossierId, d.boite, d.internetMessageId);
        if (!ok) throw new Refus("Ce dossier n'est pas dans votre périmètre.");
        revalidatePath(`/dossiers/${d.dossierId}`);
      }),
  );
}
